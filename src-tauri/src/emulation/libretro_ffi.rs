use std::ffi::CStr;
use std::os::raw::{c_char, c_uint, c_void};
use std::ptr;

use libloading::Library;

use super::environment::environment_callback;
use super::types::InternalCoreInfo;
use super::video::video_refresh_callback;

#[repr(C)]
#[derive(Clone, Copy)]
struct RetroSystemInfo {
    library_name: *const c_char,
    library_version: *const c_char,
    valid_extensions: *const c_char,
    need_fullpath: bool,
    block_extract: bool,
}

#[repr(C)]
pub struct RetroGameInfo {
    pub path: *const c_char,
    pub data: *const c_void,
    pub size: usize,
    pub meta: *const c_char,
}

type RetroApiVersion = unsafe extern "C" fn() -> c_uint;
type RetroGetSystemInfo = unsafe extern "C" fn(*mut RetroSystemInfo);
pub type RetroEnvironment = unsafe extern "C" fn(cmd: c_uint, data: *mut c_void) -> bool;
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
type RetroLoadGame = unsafe extern "C" fn(game: *const RetroGameInfo) -> bool;
type RetroUnloadGame = unsafe extern "C" fn();
type RetroRun = unsafe extern "C" fn();

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
    retro_load_game: RetroLoadGame,
    retro_unload_game: RetroUnloadGame,
    retro_run: RetroRun,
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
                retro_load_game: load_symbol(library, b"retro_load_game\0")?,
                retro_unload_game: load_symbol(library, b"retro_unload_game\0")?,
                retro_run: load_symbol(library, b"retro_run\0")?,
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

    pub fn set_minimal_frontend_callbacks(&self) {
        // SAFETY: These setters install static callbacks with signatures matching
        // libretro.h. The environment callback is a minimal frontend implementation
        // backed by controlled global state for the single active core supported today;
        // it handles incoming pointers with null checks internally. The video callback
        // copies transient frame bytes into Rust-owned memory, while audio and input
        // callbacks remain no-op stubs until real pipelines are implemented.
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

    pub fn load_game(&self, game_info: &RetroGameInfo) -> bool {
        // SAFETY: `game_info` is a valid C-compatible struct whose path and optional
        // data pointers are owned by `LoadedGame` in `LibretroHost` and kept alive for
        // at least as long as the content remains loaded.
        unsafe { (self.retro_load_game)(game_info as *const RetroGameInfo) }
    }

    pub fn unload_game(&self) {
        // SAFETY: `LibretroHost` only calls this after a successful `retro_load_game`
        // and clears its loaded-content state immediately after the core unloads it.
        unsafe {
            (self.retro_unload_game)();
        }
    }

    pub fn run_frame(&self) {
        // SAFETY: `LibretroHost` only calls this after a core is initialized and game
        // content is loaded. This advances exactly one Libretro frame and relies on
        // the installed callbacks to copy any transient video data immediately.
        unsafe {
            (self.retro_run)();
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
