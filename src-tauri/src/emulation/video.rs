use std::os::raw::{c_uint, c_void};
use std::sync::{Mutex, OnceLock};

use base64::engine::general_purpose::STANDARD;
use base64::Engine;

use super::environment::environment_info;
use super::types::{InternalFrameInfo, InternalFrameSnapshot, InternalFrameSnapshotBase64};

const MAX_FRAME_BYTES: usize = 64 * 1024 * 1024;
const MAX_RGBA_BYTES: usize = 64 * 1024 * 1024;

#[derive(Default)]
struct VideoState {
    latest_callback: Option<InternalFrameInfo>,
    latest_renderable_frame: Option<CapturedFrame>,
    frame_counter: u64,
    last_error: Option<String>,
}

struct CapturedFrame {
    info: InternalFrameInfo,
    bytes: Vec<u8>,
}

static VIDEO_STATE: OnceLock<Mutex<VideoState>> = OnceLock::new();

pub fn reset_video_state() {
    let state = video_state();
    if let Ok(mut state) = state.lock() {
        *state = VideoState::default();
    }
}

pub fn prepare_video_frame_capture() {
    let state = video_state();
    if let Ok(mut state) = state.lock() {
        state.latest_callback = None;
        state.last_error = None;
    }
}

pub fn latest_frame_info() -> Result<Option<InternalFrameInfo>, String> {
    let state = video_state();
    state
        .lock()
        .map(|state| state.latest_callback.clone())
        .map_err(|_| "No se pudo leer el estado de video interno.".to_string())
}

pub fn latest_frame_snapshot_rgba() -> Result<Option<InternalFrameSnapshot>, String> {
    let state = video_state();
    let state = state
        .lock()
        .map_err(|_| "No se pudo leer el snapshot de video interno.".to_string())?;

    state.latest_frame_snapshot_rgba()
}

pub fn latest_frame_snapshot_rgba_base64() -> Result<Option<InternalFrameSnapshotBase64>, String> {
    let Some(snapshot) = latest_frame_snapshot_rgba()? else {
        return Ok(None);
    };

    Ok(Some(InternalFrameSnapshotBase64 {
        info: snapshot.info,
        width: snapshot.width,
        height: snapshot.height,
        rgba_base64: STANDARD.encode(snapshot.rgba),
        rgba_byte_len: snapshot.rgba_byte_len,
    }))
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
            None
        } else {
            // SAFETY: Libretro states that the frame pointer may only be valid during
            // the callback. We checked for null, validated `pitch * height`, bounded
            // the copy size, and immediately copy into owned Rust memory.
            Some(unsafe { std::slice::from_raw_parts(data as *const u8, byte_len) }.to_vec())
        };

        let info = InternalFrameInfo {
            frame_number,
            width,
            height,
            pitch,
            byte_len,
            pixel_format: environment_info().pixel_format,
            is_duplicate,
        };

        self.latest_callback = Some(info.clone());
        if let Some(bytes) = bytes {
            self.latest_renderable_frame = Some(CapturedFrame { info, bytes });
        }
        self.last_error = None;
        Ok(())
    }

    fn latest_frame_snapshot_rgba(&self) -> Result<Option<InternalFrameSnapshot>, String> {
        let Some(frame) = self.latest_renderable_frame.as_ref() else {
            return Ok(None);
        };

        let rgba = convert_frame_to_rgba(frame)?;
        let rgba_byte_len = rgba.len();

        let info = self
            .latest_callback
            .clone()
            .unwrap_or_else(|| frame.info.clone());

        Ok(Some(InternalFrameSnapshot {
            info,
            width: frame.info.width,
            height: frame.info.height,
            rgba,
            rgba_byte_len,
        }))
    }
}

fn convert_frame_to_rgba(frame: &CapturedFrame) -> Result<Vec<u8>, String> {
    let pixel_format = frame
        .info
        .pixel_format
        .as_deref()
        .ok_or_else(|| "Video pixel format is not available.".to_string())?;
    let converter = PixelConverter::from_pixel_format(pixel_format)?;
    let width = frame.info.width as usize;
    let height = frame.info.height as usize;
    let source_row_bytes = width
        .checked_mul(converter.bytes_per_pixel())
        .ok_or_else(|| "Video source row size overflowed.".to_string())?;
    let rgba_byte_len = width
        .checked_mul(height)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| "RGBA frame size overflowed.".to_string())?;

    if rgba_byte_len > MAX_RGBA_BYTES {
        return Err(format!(
            "RGBA frame is too large: {rgba_byte_len} bytes exceeds {MAX_RGBA_BYTES} bytes."
        ));
    }

    if frame.info.pitch < source_row_bytes {
        return Err("Video frame pitch is smaller than the expected row size.".into());
    }

    let mut rgba = vec![0; rgba_byte_len];

    for row in 0..height {
        let source_start = row
            .checked_mul(frame.info.pitch)
            .ok_or_else(|| "Video source offset overflowed.".to_string())?;
        let source_end = source_start
            .checked_add(source_row_bytes)
            .ok_or_else(|| "Video source row end overflowed.".to_string())?;

        if source_end > frame.bytes.len() {
            return Err("Video frame buffer is smaller than pitch and dimensions require.".into());
        }

        for column in 0..width {
            let source_index = source_start + column * converter.bytes_per_pixel();
            let target_index = (row * width + column) * 4;
            converter.write_rgba(
                &frame.bytes[source_index..],
                &mut rgba[target_index..target_index + 4],
            );
        }
    }

    Ok(rgba)
}

#[derive(Clone, Copy)]
enum PixelConverter {
    Xrgb8888,
    Rgb565,
    ZeroRgb1555,
}

impl PixelConverter {
    fn from_pixel_format(pixel_format: &str) -> Result<Self, String> {
        match pixel_format {
            "xrgb8888" => Ok(Self::Xrgb8888),
            "rgb565" => Ok(Self::Rgb565),
            "0rgb1555" => Ok(Self::ZeroRgb1555),
            _ => Err(format!("Unsupported video pixel format: {pixel_format}")),
        }
    }

    fn bytes_per_pixel(self) -> usize {
        match self {
            Self::Xrgb8888 => 4,
            Self::Rgb565 | Self::ZeroRgb1555 => 2,
        }
    }

    fn write_rgba(self, source: &[u8], target: &mut [u8]) {
        match self {
            Self::Xrgb8888 => {
                let pixel = u32::from_ne_bytes([source[0], source[1], source[2], source[3]]);
                target[0] = ((pixel >> 16) & 0xff) as u8;
                target[1] = ((pixel >> 8) & 0xff) as u8;
                target[2] = (pixel & 0xff) as u8;
                target[3] = 255;
            }
            Self::Rgb565 => {
                let pixel = u16::from_ne_bytes([source[0], source[1]]);
                target[0] = expand_5_to_8(((pixel >> 11) & 0x1f) as u8);
                target[1] = expand_6_to_8(((pixel >> 5) & 0x3f) as u8);
                target[2] = expand_5_to_8((pixel & 0x1f) as u8);
                target[3] = 255;
            }
            Self::ZeroRgb1555 => {
                let pixel = u16::from_ne_bytes([source[0], source[1]]);
                target[0] = expand_5_to_8(((pixel >> 10) & 0x1f) as u8);
                target[1] = expand_5_to_8(((pixel >> 5) & 0x1f) as u8);
                target[2] = expand_5_to_8((pixel & 0x1f) as u8);
                target[3] = 255;
            }
        }
    }
}

fn expand_5_to_8(value: u8) -> u8 {
    (value << 3) | (value >> 2)
}

fn expand_6_to_8(value: u8) -> u8 {
    (value << 2) | (value >> 4)
}
