pub mod capture;
pub mod wav;

use crate::error::{AppError, CmdResult};
use serde::Serialize;
use std::sync::{Mutex, MutexGuard};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice { pub id: String, pub name: String, pub is_default: bool }

/// Poison-tolerant lock: a panic elsewhere must not brick every audio command.
pub(crate) fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// A recorder that can no longer record (device lost, thread gone) and may be replaced.
pub trait Liveness { fn is_dead(&self) -> bool; }

enum Slot<R> {
    Empty,
    /// A recorder is being opened; the state lock is NOT held while that happens.
    Starting,
    Active(R),
}

/// Holds at most one active recorder. Generic so the guard logic is testable without hardware.
pub struct AudioState<R = capture::Recorder>(Mutex<Slot<R>>);
impl<R> Default for AudioState<R> { fn default() -> Self { Self(Mutex::new(Slot::Empty)) } }

fn already_recording() -> AppError { AppError::new("already_recording", "A recording is already in progress.") }

/// Resets a reserved slot to `Empty` unless the start completed (also on panic).
struct Reservation<'a, R> { state: &'a Mutex<Slot<R>>, armed: bool }
impl<R> Drop for Reservation<'_, R> {
    fn drop(&mut self) {
        if self.armed { *lock(self.state) = Slot::Empty; }
    }
}

impl<R: Liveness> AudioState<R> {
    pub fn begin(&self, make: impl FnOnce() -> Result<R, AppError>) -> Result<(), AppError> {
        let stale = {
            let mut g = lock(&self.0);
            match &*g {
                Slot::Starting => return Err(already_recording()),
                Slot::Active(r) if !r.is_dead() => return Err(already_recording()),
                _ => {}
            }
            std::mem::replace(&mut *g, Slot::Starting) // reserve the slot, then release the lock
        };
        let mut reservation = Reservation { state: &self.0, armed: true };
        drop(stale); // a dead recorder is dropped (and its thread told to finish) outside the lock
        let recorder = make()?; // may block for seconds; concurrent stop/cancel are not held up
        *lock(&self.0) = Slot::Active(recorder);
        reservation.armed = false;
        Ok(())
    }
}

impl<R> AudioState<R> {
    pub fn take(&self) -> Result<R, AppError> {
        let mut g = lock(&self.0);
        match std::mem::replace(&mut *g, Slot::Empty) {
            Slot::Active(r) => Ok(r),
            Slot::Starting => {
                *g = Slot::Starting;
                Err(AppError::new("not_recording", "The recording is still starting."))
            }
            Slot::Empty => Err(AppError::new("not_recording", "No recording is in progress.")),
        }
    }
}

/// Runs blocking work off the main thread so the UI and event loop keep running.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> CmdResult<T> + Send + 'static) -> CmdResult<T> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| AppError::new("internal", e.to_string()))?
}

/// Cancels any active recording (used on app exit).
pub fn cancel_active(app: &AppHandle) {
    if let Some(state) = app.try_state::<AudioState>() {
        if let Ok(rec) = state.take() { rec.cancel(); }
    }
}

#[tauri::command]
pub fn audio_list_devices() -> CmdResult<Vec<AudioDevice>> { capture::list_devices() }

#[tauri::command]
pub async fn audio_probe(app: AppHandle, device_id: Option<String>) -> CmdResult<()> {
    blocking(move || capture::probe(app, device_id)).await
}

#[tauri::command]
pub async fn audio_start(app: AppHandle, device_id: Option<String>) -> CmdResult<()> {
    blocking(move || {
        let state = app.state::<AudioState>();
        state.begin(|| capture::spawn(app.clone(), device_id))
    })
    .await
}

#[tauri::command]
pub async fn audio_stop(app: AppHandle) -> CmdResult<tauri::ipc::Response> {
    // Escape stays armed after stop: the overlay keeps it through transcribing/inserting and
    // toggles it itself via `shortcut_set_cancel_enabled`.
    let bytes = blocking(move || app.state::<AudioState>().take()?.stop()).await?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn audio_cancel(app: AppHandle) -> CmdResult<()> {
    if let Ok(rec) = app.state::<AudioState>().take() { rec.cancel(); }
    crate::shortcuts::release_cancel(&app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    #[derive(Debug, Default)]
    struct FakeRec(Arc<AtomicBool>);
    impl Liveness for FakeRec {
        fn is_dead(&self) -> bool { self.0.load(Ordering::SeqCst) }
    }

    #[test]
    fn second_begin_is_rejected_with_already_recording() {
        let st: AudioState<FakeRec> = AudioState::default();
        st.begin(|| Ok(FakeRec::default())).unwrap();
        assert_eq!(st.begin(|| Ok(FakeRec::default())).unwrap_err().code, "already_recording");
    }

    #[test]
    fn take_without_begin_is_not_recording_and_clears_after_take() {
        let st: AudioState<FakeRec> = AudioState::default();
        assert_eq!(st.take().unwrap_err().code, "not_recording");
        st.begin(|| Ok(FakeRec::default())).unwrap();
        assert!(st.take().is_ok());
        assert_eq!(st.take().unwrap_err().code, "not_recording");
    }

    #[test]
    fn a_dead_recorder_is_replaced_instead_of_blocking_new_recordings() {
        let st: AudioState<FakeRec> = AudioState::default();
        let dead = Arc::new(AtomicBool::new(false));
        st.begin(|| Ok(FakeRec(dead.clone()))).unwrap();
        assert_eq!(st.begin(|| Ok(FakeRec::default())).unwrap_err().code, "already_recording");
        dead.store(true, Ordering::SeqCst); // device lost mid-recording
        st.begin(|| Ok(FakeRec::default())).unwrap();
        assert_eq!(st.begin(|| Ok(FakeRec::default())).unwrap_err().code, "already_recording");
    }

    #[test]
    fn the_state_lock_is_not_held_while_the_recorder_is_being_opened() {
        let st: AudioState<FakeRec> = AudioState::default();
        st.begin(|| {
            // would deadlock if begin held the lock across make()
            assert_eq!(st.take().unwrap_err().code, "not_recording");
            assert_eq!(st.begin(|| Ok(FakeRec::default())).unwrap_err().code, "already_recording");
            Ok(FakeRec::default())
        })
        .unwrap();
        assert!(st.take().is_ok());
    }

    #[test]
    fn a_failed_start_frees_the_slot() {
        let st: AudioState<FakeRec> = AudioState::default();
        assert_eq!(st.begin(|| Err(AppError::new("no_input_device", "none"))).unwrap_err().code, "no_input_device");
        st.begin(|| Ok(FakeRec::default())).unwrap();
    }

    #[test]
    fn a_poisoned_lock_does_not_brick_the_state() {
        let st: Arc<AudioState<FakeRec>> = Arc::new(AudioState::default());
        let s2 = st.clone();
        let _ = std::thread::spawn(move || {
            let _g = s2.0.lock().unwrap();
            panic!("poison the lock");
        })
        .join();
        st.begin(|| Ok(FakeRec::default())).unwrap();
        assert!(st.take().is_ok());
    }

    #[test]
    fn a_panicking_start_does_not_leave_the_slot_reserved() {
        let st: Arc<AudioState<FakeRec>> = Arc::new(AudioState::default());
        let s2 = st.clone();
        let _ = std::thread::spawn(move || {
            let _ = s2.begin(|| -> Result<FakeRec, AppError> { panic!("boom") });
        })
        .join();
        st.begin(|| Ok(FakeRec::default())).unwrap();
    }
}
