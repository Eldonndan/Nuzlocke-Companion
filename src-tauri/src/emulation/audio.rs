use std::collections::VecDeque;
use std::sync::{Mutex, OnceLock};

use super::types::{InternalAudioChunk, InternalAudioInfo};

const AUDIO_CHANNELS: u8 = 2;
const DEFAULT_DRAIN_FRAMES: usize = 4096;
const MAX_DRAIN_FRAMES: usize = 8192;
const MAX_BUFFERED_SAMPLES: usize = 48_000 * AUDIO_CHANNELS as usize * 5;

static AUDIO_STATE: OnceLock<Mutex<AudioState>> = OnceLock::new();

#[derive(Debug)]
struct AudioState {
    sample_rate: f64,
    samples: VecDeque<i16>,
    total_frames_captured: u64,
    total_frames_drained: u64,
    dropped_frames: u64,
}

impl Default for AudioState {
    fn default() -> Self {
        Self {
            sample_rate: 0.0,
            samples: VecDeque::new(),
            total_frames_captured: 0,
            total_frames_drained: 0,
            dropped_frames: 0,
        }
    }
}

pub fn configure_audio(sample_rate: f64) -> Result<InternalAudioInfo, String> {
    let mut state = lock_audio_state()?;
    state.sample_rate = if sample_rate.is_finite() && sample_rate > 0.0 {
        sample_rate
    } else {
        0.0
    };
    state.samples.clear();
    state.total_frames_captured = 0;
    state.total_frames_drained = 0;
    state.dropped_frames = 0;
    Ok(audio_info_from_state(&state))
}

pub fn reset_audio_state() {
    if let Ok(mut state) = audio_state().lock() {
        *state = AudioState::default();
    }
}

pub fn clear_audio_buffer() -> Result<InternalAudioInfo, String> {
    let mut state = lock_audio_state()?;
    state.samples.clear();
    Ok(audio_info_from_state(&state))
}

pub fn audio_info() -> Result<InternalAudioInfo, String> {
    let state = lock_audio_state()?;
    Ok(audio_info_from_state(&state))
}

pub fn drain_audio_chunk(max_frames: Option<usize>) -> Result<InternalAudioChunk, String> {
    let max_frames = max_frames
        .unwrap_or(DEFAULT_DRAIN_FRAMES)
        .clamp(1, MAX_DRAIN_FRAMES);
    let max_samples = max_frames * AUDIO_CHANNELS as usize;
    let mut state = lock_audio_state()?;
    let sample_count = state.samples.len().min(max_samples);
    let frame_count = sample_count / AUDIO_CHANNELS as usize;
    let drain_count = frame_count * AUDIO_CHANNELS as usize;
    let samples = state.samples.drain(..drain_count).collect::<Vec<_>>();
    state.total_frames_drained = state.total_frames_drained.saturating_add(frame_count as u64);

    Ok(InternalAudioChunk {
        sample_rate: state.sample_rate,
        channels: AUDIO_CHANNELS,
        frames: frame_count,
        samples,
    })
}

pub unsafe extern "C" fn audio_sample_callback(left: i16, right: i16) {
    if let Ok(mut state) = audio_state().lock() {
        push_audio_samples(&mut state, &[left, right], 1);
    }
}

pub unsafe extern "C" fn audio_sample_batch_callback(data: *const i16, frames: usize) -> usize {
    if data.is_null() || frames == 0 {
        return frames;
    }

    let Some(sample_count) = frames.checked_mul(AUDIO_CHANNELS as usize) else {
        return frames;
    };

    if let Ok(mut state) = audio_state().lock() {
        // SAFETY: Libretro provides `data` as a pointer to `frames * 2`
        // interleaved i16 samples that is valid only during this callback. We
        // null-check and overflow-check before copying the samples immediately
        // into Rust-owned bounded storage, and never store the pointer.
        let samples = unsafe { std::slice::from_raw_parts(data, sample_count) };
        push_audio_samples(&mut state, samples, frames);
    }

    frames
}

fn audio_state() -> &'static Mutex<AudioState> {
    AUDIO_STATE.get_or_init(|| Mutex::new(AudioState::default()))
}

fn lock_audio_state() -> Result<std::sync::MutexGuard<'static, AudioState>, String> {
    audio_state()
        .lock()
        .map_err(|_| "No se pudo acceder al buffer de audio interno.".to_string())
}

fn push_audio_samples(state: &mut AudioState, samples: &[i16], frames: usize) {
    state.samples.extend(samples.iter().copied());
    state.total_frames_captured = state.total_frames_captured.saturating_add(frames as u64);
    enforce_buffer_limit(state);
}

fn enforce_buffer_limit(state: &mut AudioState) {
    let overflow_samples = state.samples.len().saturating_sub(MAX_BUFFERED_SAMPLES);
    let dropped_samples = overflow_samples - (overflow_samples % AUDIO_CHANNELS as usize);

    if dropped_samples == 0 {
        return;
    }

    state.samples.drain(..dropped_samples);
    state.dropped_frames = state
        .dropped_frames
        .saturating_add((dropped_samples / AUDIO_CHANNELS as usize) as u64);
}

fn audio_info_from_state(state: &AudioState) -> InternalAudioInfo {
    InternalAudioInfo {
        sample_rate: state.sample_rate,
        buffered_frames: state.samples.len() / AUDIO_CHANNELS as usize,
        total_frames_captured: state.total_frames_captured,
        total_frames_drained: state.total_frames_drained,
        dropped_frames: state.dropped_frames,
    }
}
