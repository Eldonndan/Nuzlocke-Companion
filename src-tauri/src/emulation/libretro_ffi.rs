use std::ffi::CStr;
use std::os::raw::{c_char, c_uint};
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
type RetroInit = unsafe extern "C" fn();
type RetroDeinit = unsafe extern "C" fn();

pub fn read_core_info(library: &Library) -> Result<InternalCoreInfo, String> {
    // SAFETY: We only resolve required libretro symbols by their documented C ABI names.
    // The returned symbols are used immediately while `library` is alive, and we do not
    // store function pointers beyond this call.
    let api_version = unsafe {
        let retro_api_version = load_symbol::<RetroApiVersion>(library, b"retro_api_version\0")?;
        retro_api_version()
    };

    // SAFETY: `retro_init` and `retro_deinit` are resolved only to verify that this
    // library exposes the minimal libretro lifecycle surface. They are not called in
    // this metadata-only spike.
    unsafe {
        let _retro_init = load_symbol::<RetroInit>(library, b"retro_init\0")?;
        let _retro_deinit = load_symbol::<RetroDeinit>(library, b"retro_deinit\0")?;
    }

    let mut system_info = RetroSystemInfo {
        library_name: ptr::null(),
        library_version: ptr::null(),
        valid_extensions: ptr::null(),
        need_fullpath: false,
        block_extract: false,
    };

    // SAFETY: `retro_get_system_info` is documented by libretro as callable before
    // `retro_init`. We pass a valid mutable pointer to a C-compatible struct and copy
    // any returned static C strings into owned Rust `String`s before returning.
    unsafe {
        let retro_get_system_info =
            load_symbol::<RetroGetSystemInfo>(library, b"retro_get_system_info\0")?;
        retro_get_system_info(&mut system_info);
    }

    Ok(InternalCoreInfo {
        api_version,
        library_name: c_string_to_owned(system_info.library_name),
        library_version: c_string_to_owned(system_info.library_version),
        valid_extensions: c_string_to_owned(system_info.valid_extensions),
        need_fullpath: system_info.need_fullpath,
        block_extract: system_info.block_extract,
    })
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
