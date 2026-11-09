use crate::error::AppError;
use std::io::Cursor;

pub const TARGET_RATE: u32 = 16_000;

pub fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() { return 0.0; }
    (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt().min(1.0)
}

/// Average interleaved channels into mono.
pub fn downmix(interleaved: &[f32], channels: u16) -> Vec<f32> {
    if channels <= 1 { return interleaved.to_vec(); }
    interleaved.chunks(channels as usize).map(|f| f.iter().sum::<f32>() / f.len() as f32).collect()
}

fn resample_linear(samples: &[f32], from: u32, to: u32) -> Vec<f32> {
    if from == to || samples.is_empty() { return samples.to_vec(); }
    let ratio = from as f64 / to as f64;
    let out_len = (samples.len() as f64 / ratio).floor() as usize;
    (0..out_len).map(|i| {
        let pos = i as f64 * ratio;
        let idx = pos.floor() as usize;
        let frac = (pos - idx as f64) as f32;
        let a = samples[idx];
        let b = *samples.get(idx + 1).unwrap_or(&a);
        a + (b - a) * frac
    }).collect()
}

fn encode_failed(e: hound::Error) -> AppError {
    AppError::new("internal", format!("Could not encode the recording: {e}"))
}

pub fn encode_pcm16_mono_16k(mono: &[f32], source_rate: u32) -> Result<Vec<u8>, AppError> {
    let resampled = resample_linear(mono, source_rate, TARGET_RATE);
    let spec = hound::WavSpec { channels: 1, sample_rate: TARGET_RATE, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
    let mut cursor = Cursor::new(Vec::with_capacity(44 + resampled.len() * 2));
    {
        let mut w = hound::WavWriter::new(&mut cursor, spec).map_err(encode_failed)?;
        for s in resampled {
            w.write_sample((s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16).map_err(encode_failed)?;
        }
        w.finalize().map_err(encode_failed)?;
    }
    Ok(cursor.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rms_of_silence_is_zero_and_of_full_scale_is_one() {
        assert_eq!(rms(&[0.0; 100]), 0.0);
        assert!((rms(&[1.0, -1.0, 1.0, -1.0]) - 1.0).abs() < 1e-6);
        assert_eq!(rms(&[]), 0.0);
    }

    #[test]
    fn encodes_a_valid_16k_mono_pcm16_wav() {
        let samples: Vec<f32> = (0..16000).map(|i| (i as f32 / 16000.0).sin()).collect();
        let bytes = encode_pcm16_mono_16k(&samples, 16000).unwrap();
        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(&bytes[8..12], b"WAVE");
        let r = hound::WavReader::new(std::io::Cursor::new(bytes)).unwrap();
        let spec = r.spec();
        assert_eq!((spec.channels, spec.sample_rate, spec.bits_per_sample), (1, 16000, 16));
        assert_eq!(r.len(), 16000);
    }

    #[test]
    fn resamples_48k_to_16k_by_a_factor_of_three() {
        let samples = vec![0.25f32; 48000];
        let bytes = encode_pcm16_mono_16k(&samples, 48000).unwrap();
        let r = hound::WavReader::new(std::io::Cursor::new(bytes)).unwrap();
        assert!((r.len() as i64 - 16000).abs() <= 2);
    }

    #[test]
    fn clamps_out_of_range_samples() {
        let bytes = encode_pcm16_mono_16k(&[2.0, -2.0], 16000).unwrap();
        let mut r = hound::WavReader::new(std::io::Cursor::new(bytes)).unwrap();
        let v: Vec<i16> = r.samples::<i16>().map(|s| s.unwrap()).collect();
        assert_eq!(v, vec![i16::MAX, -i16::MAX]);
    }

    #[test]
    fn mixes_interleaved_channels_to_mono() {
        assert_eq!(downmix(&[1.0, 0.0, 0.5, 0.5], 2), vec![0.5, 0.5]);
        assert_eq!(downmix(&[0.3, 0.4], 1), vec![0.3, 0.4]);
    }

    #[test]
    fn encodes_48k_stereo_as_16k_mono() {
        // 1 s of 48 kHz stereo: left 0.5, right -0.5 cancels to silence after the downmix.
        let stereo: Vec<f32> = (0..48000).flat_map(|_| [0.5f32, -0.5f32]).collect();
        let mono = downmix(&stereo, 2);
        assert_eq!(mono.len(), 48000);
        let bytes = encode_pcm16_mono_16k(&mono, 48000).unwrap();
        let mut r = hound::WavReader::new(std::io::Cursor::new(bytes)).unwrap();
        let spec = r.spec();
        assert_eq!((spec.channels, spec.sample_rate, spec.bits_per_sample), (1, 16000, 16));
        assert!((r.len() as i64 - 16000).abs() <= 2);
        assert!(r.samples::<i16>().all(|s| s.unwrap() == 0));
    }
}
