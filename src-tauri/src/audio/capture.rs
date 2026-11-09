use super::{lock, wav, AudioDevice, Liveness};
use crate::error::{AppError, CmdResult};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, SampleFormat, SizedSample, Stream};
use serde_json::json;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

pub const MAX_SECONDS: usize = 300;
const LEVEL_INTERVAL: Duration = Duration::from_millis(33);
const LEVEL_GAIN: f32 = 3.0;
const STOP_TIMEOUT: Duration = Duration::from_secs(5);
const POLL_INTERVAL: Duration = Duration::from_millis(50);

pub enum Cmd {
    Stop(Sender<Result<Vec<u8>, AppError>>),
    Cancel,
}

/// Flags the audio callbacks use to tell the capture thread what happened.
#[derive(Default)]
pub struct Shared {
    /// The 300 s cap was reached: the thread releases the microphone but keeps the audio for `Stop`.
    capped: AtomicBool,
    /// The stream reported an error (device lost): the thread releases the microphone.
    failed: AtomicBool,
    /// The capture thread has exited.
    finished: AtomicBool,
}

struct FinishGuard(Arc<Shared>);
impl Drop for FinishGuard {
    fn drop(&mut self) { self.0.finished.store(true, Ordering::SeqCst); }
}

/// Handle to the capture thread. `cpal::Stream` is not `Send` on macOS, so the stream
/// lives on that thread for its whole life and this handle only holds a command channel.
pub struct Recorder {
    tx: Sender<Cmd>,
    shared: Arc<Shared>,
}

impl Liveness for Recorder {
    /// A recorder whose stream failed or whose thread ended can never record again.
    fn is_dead(&self) -> bool {
        self.shared.failed.load(Ordering::SeqCst) || self.shared.finished.load(Ordering::SeqCst)
    }
}

impl Recorder {
    pub fn stop(self) -> Result<Vec<u8>, AppError> {
        let (reply_tx, reply_rx) = mpsc::channel();
        self.tx.send(Cmd::Stop(reply_tx)).map_err(|_| AppError::new("device_error", "The recording ended unexpectedly."))?;
        match reply_rx.recv_timeout(STOP_TIMEOUT) {
            Ok(result) => result,
            Err(_) => {
                let _ = self.tx.send(Cmd::Cancel); // make sure the device is released
                Err(AppError::new("device_error", "The microphone did not respond while finishing the recording. Try again."))
            }
        }
    }

    pub fn cancel(self) {
        let _ = self.tx.send(Cmd::Cancel);
    }
}

pub fn map_build_error(message: &str) -> AppError {
    let lower = message.to_lowercase();
    if lower.contains("permission") || lower.contains("denied") {
        AppError::new("permission_denied", "Microphone access was denied. Allow it in system settings and try again.")
    } else {
        AppError::new("device_error", "Could not open the microphone. Check that it is connected and try again.")
    }
}

fn pick_device(device_id: Option<&str>) -> Result<cpal::Device, AppError> {
    let host = cpal::default_host();
    if let Some(id) = device_id {
        if let Ok(devices) = host.input_devices() {
            for d in devices {
                if d.name().map(|n| n == id).unwrap_or(false) { return Ok(d); }
            }
        }
    }
    host.default_input_device().ok_or_else(|| AppError::new("no_input_device", "No microphone found. Connect one and try again."))
}

pub fn list_devices() -> CmdResult<Vec<AudioDevice>> {
    let host = cpal::default_host();
    let default_name = host.default_input_device().and_then(|d| d.name().ok());
    let devices = host.input_devices().map_err(|e| map_build_error(&e.to_string()))?;
    Ok(devices
        .filter_map(|d| d.name().ok())
        .map(|name| AudioDevice { is_default: default_name.as_deref() == Some(name.as_str()), id: name.clone(), name })
        .collect())
}

pub fn probe(app: AppHandle, device_id: Option<String>) -> CmdResult<()> {
    let rec = spawn(app, device_id)?;
    std::thread::sleep(Duration::from_millis(300));
    rec.cancel();
    Ok(())
}

/// Appends `chunk` without exceeding `max` samples; returns true once the buffer is full.
pub fn append_capped(buf: &mut Vec<f32>, chunk: &[f32], max: usize) -> bool {
    let room = max.saturating_sub(buf.len());
    buf.extend_from_slice(&chunk[..chunk.len().min(room)]);
    buf.len() >= max
}

fn build_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    app: AppHandle,
    buf: Arc<Mutex<Vec<f32>>>,
    shared: Arc<Shared>,
) -> Result<Stream, cpal::BuildStreamError>
where
    T: SizedSample + Send + 'static,
    f32: FromSample<T>,
{
    let channels = config.channels;
    let max_samples = MAX_SECONDS * config.sample_rate.0 as usize;
    let data_app = app.clone();
    let data_shared = shared.clone();
    let mut last_level: Option<Instant> = None;
    device.build_input_stream(
        config,
        move |data: &[T], _| {
            let floats: Vec<f32> = data.iter().map(|s| <f32 as FromSample<T>>::from_sample_(*s)).collect();
            let mono = wav::downmix(&floats, channels);
            let full = append_capped(&mut lock(&buf), &mono, max_samples);
            if full && !data_shared.capped.swap(true, Ordering::SeqCst) {
                let _ = data_app.emit("audio://limit-reached", json!({}));
            }
            let now = Instant::now();
            if last_level.map_or(true, |t| now.duration_since(t) >= LEVEL_INTERVAL) {
                last_level = Some(now);
                let level = (wav::rms(&mono) * LEVEL_GAIN).min(1.0);
                let _ = data_app.emit("audio://level", json!({ "rms": level }));
            }
        },
        move |_err| {
            shared.failed.store(true, Ordering::SeqCst);
            let _ = app.emit("audio://error", json!({ "code": "device_error", "message": "The microphone was disconnected." }));
        },
        None,
    )
}

/// Spawns the capture thread; returns Err on device/permission failure *before* returning,
/// so `audio_start` reports `no_input_device` / `permission_denied` / `device_error` synchronously.
pub fn spawn(app: AppHandle, device_id: Option<String>) -> Result<Recorder, AppError> {
    let (cmd_tx, cmd_rx) = mpsc::channel::<Cmd>();
    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), AppError>>();
    let shared = Arc::new(Shared::default());
    let thread_shared = shared.clone();

    std::thread::Builder::new()
        .name("mindwhisper-capture".into())
        .spawn(move || run_capture(app, device_id, cmd_rx, ready_tx, thread_shared))
        .map_err(|e| AppError::new("internal", format!("Could not start the capture thread: {e}")))?;

    ready_rx
        .recv_timeout(Duration::from_secs(10))
        .map_err(|_| AppError::new("device_error", "The microphone did not respond."))??;
    Ok(Recorder { tx: cmd_tx, shared })
}

fn run_capture(app: AppHandle, device_id: Option<String>, cmd_rx: Receiver<Cmd>, ready: Sender<Result<(), AppError>>, shared: Arc<Shared>) {
    let guard = FinishGuard(shared.clone());
    let setup = || -> Result<(Stream, Arc<Mutex<Vec<f32>>>, u32), AppError> {
        let device = pick_device(device_id.as_deref())?;
        let supported = device.default_input_config().map_err(|e| map_build_error(&e.to_string()))?;
        let rate = supported.sample_rate().0;
        let format = supported.sample_format();
        let config: cpal::StreamConfig = supported.into();
        let buf = Arc::new(Mutex::new(Vec::<f32>::new()));
        let stream = match format {
            SampleFormat::F32 => build_stream::<f32>(&device, &config, app.clone(), buf.clone(), shared.clone()),
            SampleFormat::I16 => build_stream::<i16>(&device, &config, app.clone(), buf.clone(), shared.clone()),
            SampleFormat::U16 => build_stream::<u16>(&device, &config, app.clone(), buf.clone(), shared.clone()),
            _ => return Err(AppError::new("device_error", "This microphone uses an unsupported audio format.")),
        }
        .map_err(|e| map_build_error(&e.to_string()))?;
        stream.play().map_err(|e| map_build_error(&e.to_string()))?;
        Ok((stream, buf, rate))
    };

    match setup() {
        Ok((stream, buf, rate)) => {
            let _ = ready.send(Ok(()));
            serve(cmd_rx, &shared, stream, &buf, rate, POLL_INTERVAL);
        }
        Err(e) => {
            let _ = ready.send(Err(e));
        }
    }
    drop(guard);
}

/// Owns `stream` until a command arrives. Dropping `stream` releases the microphone; it is dropped
/// as soon as the cap is hit or the stream fails (the buffered audio is kept for a later `Stop`),
/// on `Stop` (before encoding), on `Cancel`, and when the handle is dropped.
pub fn serve<S>(cmd_rx: Receiver<Cmd>, shared: &Shared, stream: S, buf: &Mutex<Vec<f32>>, rate: u32, poll: Duration) {
    let mut stream = Some(stream);
    loop {
        match cmd_rx.recv_timeout(poll) {
            Ok(Cmd::Stop(reply)) => {
                drop(stream.take());
                let samples = std::mem::take(&mut *lock(buf));
                let result = if samples.is_empty() && shared.failed.load(Ordering::SeqCst) {
                    Err(AppError::new("device_error", "The microphone was disconnected."))
                } else {
                    wav::encode_pcm16_mono_16k(&samples, rate)
                };
                let _ = reply.send(result);
                return;
            }
            Ok(Cmd::Cancel) | Err(RecvTimeoutError::Disconnected) => return, // `stream` drops here
            Err(RecvTimeoutError::Timeout) => {
                if stream.is_some() && (shared.capped.load(Ordering::SeqCst) || shared.failed.load(Ordering::SeqCst)) {
                    drop(stream.take());
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;

    const POLL: Duration = Duration::from_millis(5);

    /// Stands in for `cpal::Stream`: counts drops so tests can see the microphone being released.
    struct FakeStream(Arc<AtomicUsize>);
    impl Drop for FakeStream {
        fn drop(&mut self) { self.0.fetch_add(1, Ordering::SeqCst); }
    }

    fn wait_until(mut cond: impl FnMut() -> bool) -> bool {
        let deadline = Instant::now() + Duration::from_secs(2);
        while Instant::now() < deadline {
            if cond() { return true; }
            std::thread::sleep(Duration::from_millis(2));
        }
        false
    }

    struct Harness {
        tx: Sender<Cmd>,
        shared: Arc<Shared>,
        buf: Arc<Mutex<Vec<f32>>>,
        drops: Arc<AtomicUsize>,
        thread: std::thread::JoinHandle<()>,
    }

    fn start(initial: Vec<f32>, rate: u32) -> Harness {
        let (tx, rx) = mpsc::channel();
        let shared = Arc::new(Shared::default());
        let buf = Arc::new(Mutex::new(initial));
        let drops = Arc::new(AtomicUsize::new(0));
        let (s, b, d) = (shared.clone(), buf.clone(), drops.clone());
        let thread = std::thread::spawn(move || {
            let _guard = FinishGuard(s.clone());
            serve(rx, &s, FakeStream(d), &b, rate, POLL);
        });
        Harness { tx, shared, buf, drops, thread }
    }

    #[test]
    fn maps_build_errors_to_codes() {
        assert_eq!(map_build_error("Permission denied").code, "permission_denied");
        assert_eq!(map_build_error("device busy").code, "device_error");
    }

    #[test]
    fn append_capped_never_exceeds_the_cap_and_reports_full() {
        let mut b = vec![0.0; 8];
        assert!(!append_capped(&mut b, &[1.0; 1], 10));
        assert_eq!(b.len(), 9);
        assert!(append_capped(&mut b, &[1.0; 5], 10));
        assert_eq!(b.len(), 10);
        assert!(append_capped(&mut b, &[1.0; 5], 10));
        assert_eq!(b.len(), 10);
    }

    #[test]
    fn hitting_the_cap_releases_the_stream_but_stop_still_returns_the_audio() {
        let h = start(vec![0.1; 16000], 16000);
        h.shared.capped.store(true, Ordering::SeqCst);
        assert!(wait_until(|| h.drops.load(Ordering::SeqCst) == 1), "stream must be dropped by the thread itself");
        assert!(!h.shared.finished.load(Ordering::SeqCst), "thread keeps the buffer until stop");
        let (reply_tx, reply_rx) = mpsc::channel();
        h.tx.send(Cmd::Stop(reply_tx)).unwrap();
        let wav = reply_rx.recv_timeout(Duration::from_secs(2)).unwrap().unwrap();
        let r = hound::WavReader::new(std::io::Cursor::new(wav)).unwrap();
        assert_eq!(r.len(), 16000);
        h.thread.join().unwrap();
        assert_eq!(h.drops.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn a_stream_error_releases_the_stream_and_marks_the_recorder_dead() {
        let h = start(vec![], 16000);
        let rec = Recorder { tx: h.tx.clone(), shared: h.shared.clone() };
        assert!(!rec.is_dead());
        h.shared.failed.store(true, Ordering::SeqCst);
        assert!(rec.is_dead());
        assert!(wait_until(|| h.drops.load(Ordering::SeqCst) == 1));
        // nothing was captured, so stop reports the lost device instead of an empty WAV
        let (reply_tx, reply_rx) = mpsc::channel();
        h.tx.send(Cmd::Stop(reply_tx)).unwrap();
        assert_eq!(reply_rx.recv_timeout(Duration::from_secs(2)).unwrap().unwrap_err().code, "device_error");
        h.thread.join().unwrap();
        assert!(rec.is_dead());
    }

    #[test]
    fn stop_drops_the_stream_before_returning_and_cancel_discards() {
        let h = start(vec![0.2; 8000], 16000);
        let (reply_tx, reply_rx) = mpsc::channel();
        h.tx.send(Cmd::Stop(reply_tx)).unwrap();
        assert!(reply_rx.recv_timeout(Duration::from_secs(2)).unwrap().is_ok());
        h.thread.join().unwrap();
        assert_eq!(h.drops.load(Ordering::SeqCst), 1);

        let h = start(vec![0.2; 8000], 16000);
        h.tx.send(Cmd::Cancel).unwrap();
        h.thread.join().unwrap();
        assert_eq!(h.drops.load(Ordering::SeqCst), 1);
        assert!(h.shared.finished.load(Ordering::SeqCst));
        let _ = &h.buf;
    }

    #[test]
    fn dropping_the_handle_releases_the_stream() {
        let h = start(vec![], 16000);
        let Harness { tx, thread, drops, .. } = h;
        drop(tx);
        thread.join().unwrap();
        assert_eq!(drops.load(Ordering::SeqCst), 1);
    }

    #[test]
    #[ignore = "needs a microphone and a running app (spawn takes an AppHandle)"]
    fn records_one_second_from_default_device() {
        unimplemented!("run manually inside the app: audio_start, wait 1 s, audio_stop, expect >= 30000 bytes");
    }
}
