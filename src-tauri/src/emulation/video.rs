use std::os::raw::{c_uint, c_void};
use std::sync::{Mutex, OnceLock};

use super::environment::environment_info;
use super::types::InternalFrameInfo;

const MAX_FRAME_BYTES: usize = 64 * 1024 * 1024;

#[derive(Default)]
struct VideoState {
    latest_frame: Option<CapturedFrame>,
    frame_counter: u64,
    last_error: Option<String>,
}

struct CapturedFrame {
    info: InternalFrameInfo,
    _bytes: Vec<u8>,
}

static VIDEO_STATE: OnceLock<Mutex<VideoState>> = OnceLock::new();

pub fn reset_video_state() {
    let state = video_state();
    if let Ok(mut state) = state.lock() {
        *state = VideoState::default();
    }
}

pub fn latest_frame_info() -> Result<Option<InternalFrameInfo>, String> {
    let state = video_state();
    state
        .lock()
        .map(|state| state.latest_frame.as_ref().map(|frame| frame.info.clone()))
        .map_err(|_| "No se pudo leer el estado de video interno.".to_string())
}

pub fn take_video_error() -> Result<Option<String>, String> {
    let state = video_state();
    state
        .lock()
        .map(|mut state| state.last_error.take())
        .map_err(|_| "No se pudo leer el error de video interno.".to_string())
}

pub unsafe extern "C" fn video_refresh_callback(
    data: *const c_void,
    width: c_uint,
    height: c_uint,
    pitch: usize,
) {
    let state = video_state();
    let Ok(mut state) = state.lock() else {
        return;
    };

    if let Err(error) = state.capture_frame(data, width, height, pitch) {
        state.last_error = Some(error);
    }
}

fn video_state() -> &'static Mutex<VideoState> {
    // Libretro callbacks do not include frontend user data. This single global
    // buffer assumes one active core at a time, which is enough for the current
    // MVP. A multi-session runtime must replace this with per-host routing.
    VIDEO_STATE.get_or_init(|| Mutex::new(VideoState::default()))
}

impl VideoState {
    fn capture_frame(
        &mut self,
        data: *const c_void,
        width: c_uint,
        height: c_uint,
        pitch: usize,
    ) -> Result<(), String> {
        let width = width as u32;
        let height = height as u32;

        if width == 0 || height == 0 {
            return Err("Video frame has invalid dimensions.".into());
        }

        let byte_len = pitch
            .checked_mul(height as usize)
            .ok_or_else(|| "Video frame size overflowed.".to_string())?;

        if byte_len > MAX_FRAME_BYTES {
            return Err(format!(
                "Video frame is too large: {byte_len} bytes exceeds {MAX_FRAME_BYTES} bytes."
            ));
        }

        let frame_number = self.frame_counter.saturating_add(1);
        self.frame_counter = frame_number;

        let is_duplicate = data.is_null();
        let bytes = if is_duplicate {
            Vec::new()
        } else {
            // SAFETY: Libretro states that the frame pointer may only be valid during
            // the callback. We checked for null, validated `pitch * height`, bounded
            // the copy size, and immediately copy into owned Rust memory.
            unsafe { std::slice::from_raw_parts(data as *const u8, byte_len) }.to_vec()
        };

        self.latest_frame = Some(CapturedFrame {
            info: InternalFrameInfo {
                frame_number,
                width,
                height,
                pitch,
                byte_len,
                pixel_format: environment_info().pixel_format,
                is_duplicate,
            },
            _bytes: bytes,
        });
        self.last_error = None;
        Ok(())
    }
}
