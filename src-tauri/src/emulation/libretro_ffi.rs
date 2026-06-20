use std::ffi::CStr;
use std::os::raw::{c_char, c_uint, c_void};
use std::ptr;

use libloading::Library;

use super::types::InternalCoreInfo;

#[repr(C)]
#[derive(Clone, Copy)]
struct RetroSystemInfo {
    library_name: *const c_char,
    library_version: *const c_char,
    valid_extensions: *const c_char,
    need_fullpath: bool,
    block_extract: bool,
}

type RetroApiVersion = unsafe extern "C" fn() -> c_uint;
type RetroGetSystemInfo = unsafe extern "C" fn(*mut RetroSystemInfo);
type RetroEnvironment = unsafe extern "C" fn(cmd: c_uint, data: *mut c_void) -> bool;
type RetroVideoRefresh =
    unsafe extern "C" fn(data: *const c_void, width: c_uint, height: c_uint, pitch: usize);
type RetroAudioSample = unsafe extern "C" fn(left: i16, right: i16);
type RetroAudioSampleBatch = unsafe extern "C" fn(data: *const i16, frames: usize) -> usize;
type RetroInputPoll = unsafe extern "C" fn();
type RetroInputState =
    unsafe extern "C" fn(port: c_uint, device: c_uint, index: c_uint, id: c_uint) -> i16;
type RetroSetEnvironment = unsafe extern "C" fn(callback: RetroEnvironment);
type RetroSetVideoRefresh = unsafe extern "C" fn(callback: RetroVideoRefresh);
type RetroSetAudioSample = unsafe extern "C" fn(callback: RetroAudioSample);
type RetroSetAudioSampleBatch = unsafe extern "C" fn(callback: RetroAudioSampleBatch);
type RetroSetInputPoll = unsafe extern "C" fn(callback: RetroInputPoll);
type RetroSetInputState = unsafe extern "C" fn(callback: RetroInputState);
type RetroInit = unsafe extern "C" fn();
type RetroDeinit = unsafe extern "C" fn();

pub struct LibretroCoreSymbols {
    retro_api_version: RetroApiVersion,
    retro_get_system_info: RetroGetSystemInfo,
    retro_set_environment: RetroSetEnvironment,
    retro_set_video_refresh: RetroSetVideoRefresh,
    retro_set_audio_sample: RetroSetAudioSample,
    retro_set_audio_sample_batch: RetroSetAudioSampleBatch,
    retro_set_input_poll: RetroSetInputPoll,
    retro_set_input_state: RetroSetInputState,
    retro_init: RetroInit,
    retro_deinit: RetroDeinit,
}

impl LibretroCoreSymbols {
    pub fn load(library: &Library) -> Result<Self, String> {
        // SAFETY: We resolve required libretro symbols by their documented C ABI names.
        // Symbols are copied as function pointers and only used while `library` is kept
        // alive by `LibretroHost`.
        unsafe {
            Ok(Self {
                retro_api_version: load_symbol(library, b"retro_api_version\0")?,
                retro_get_system_info: load_symbol(library, b"retro_get_system_info\0")?,
                retro_set_environment: load_symbol(library, b"retro_set_environment\0")?,
                retro_set_video_refresh: load_symbol(library, b"retro_set_video_refresh\0")?,
                retro_set_audio_sample: load_symbol(library, b"retro_set_audio_sample\0")?,
                retro_set_audio_sample_batch: load_symbol(
                    library,
                    b"retro_set_audio_sample_batch\0",
                )?,
                retro_set_input_poll: load_symbol(library, b"retro_set_input_poll\0")?,
                retro_set_input_state: load_symbol(library, b"retro_set_input_state\0")?,
                retro_init: load_symbol(library, b"retro_init\0")?,
                retro_deinit: load_symbol(library, b"retro_deinit\0")?,
            })
        }
    }

    pub fn read_core_info(&self) -> InternalCoreInfo {
        let mut system_info = RetroSystemInfo {
            library_name: ptr::null(),
            library_version: ptr::null(),
            valid_extensions: ptr::null(),
            need_fullpath: false,
            block_extract: false,
        };

        // SAFETY: libretro documents `retro_api_version` and `retro_get_system_info`
        // as callable before `retro_init`. We pass a valid mutable pointer to a
        // C-compatible struct and copy returned static C strings immediately.
        let api_version = unsafe {
            let api_version = (self.retro_api_version)();
            (self.retro_get_system_info)(&mut system_info);
            api_version
        };

        InternalCoreInfo {
            api_version,
            library_name: c_string_to_owned(system_info.library_name),
            library_version: c_string_to_owned(system_info.library_version),
            valid_extensions: c_string_to_owned(system_info.valid_extensions),
            need_fullpath: system_info.need_fullpath,
            block_extract: system_info.block_extract,
        }
    }

    pub fn set_noop_callbacks(&self) {
        // SAFETY: These setters install static no-op callbacks with signatures matching
        // libretro.h. The callbacks do not dereference pointers or access shared state.
        unsafe {
            (self.retro_set_environment)(environment_callback);
            (self.retro_set_video_refresh)(video_refresh_callback);
            (self.retro_set_audio_sample)(audio_sample_callback);
            (self.retro_set_audio_sample_batch)(audio_sample_batch_callback);
            (self.retro_set_input_poll)(input_poll_callback);
            (self.retro_set_input_state)(input_state_callback);
        }
    }

    pub fn init(&self) {
        // SAFETY: Callbacks are configured by `LibretroHost::init_core` before this is
        // invoked. This does not load content or execute frames.
        unsafe {
            (self.retro_init)();
        }
    }

    pub fn deinit(&self) {
        // SAFETY: `LibretroHost` tracks initialization state and calls this at most
        // once for each successful `retro_init`.
        unsafe {
            (self.retro_deinit)();
        }
    }
}

unsafe fn load_symbol<T>(library: &Library, symbol_name: &[u8]) -> Result<T, String>
where
    T: Copy,
{
    library
        .get::<T>(symbol_name)
        .map(|symbol| *symbol)
        .map_err(|error| {
            let printable_name = String::from_utf8_lossy(symbol_name)
                .trim_end_matches('\0')
                .to_string();
            format!("Missing required Libretro symbol `{printable_name}`: {error}")
        })
}

fn c_string_to_owned(value: *const c_char) -> Option<String> {
    if value.is_null() {
        return None;
    }

    // SAFETY: libretro system info string pointers are documented as static C strings.
    // We still treat invalid UTF-8 lossily and immediately copy into an owned `String`.
    let text = unsafe { CStr::from_ptr(value) }
        .to_string_lossy()
        .trim()
        .to_string();

    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

unsafe extern "C" fn environment_callback(cmd: c_uint, data: *mut c_void) -> bool {
    let _ = (cmd, data);
    false
}

unsafe extern "C" fn video_refresh_callback(
    data: *const c_void,
    width: c_uint,
    height: c_uint,
    pitch: usize,
) {
    let _ = (data, width, height, pitch);
}

unsafe extern "C" fn audio_sample_callback(left: i16, right: i16) {
    let _ = (left, right);
}

unsafe extern "C" fn audio_sample_batch_callback(data: *const i16, frames: usize) -> usize {
    let _ = data;
    // Report all frames as consumed so cores do not retry audio that this spike
    // intentionally discards until the real audio pipeline exists.
    frames
}

unsafe extern "C" fn input_poll_callback() {}

unsafe extern "C" fn input_state_callback(
    port: c_uint,
    device: c_uint,
    index: c_uint,
    id: c_uint,
) -> i16 {
    let _ = (port, device, index, id);
    0
}
