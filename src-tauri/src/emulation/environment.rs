use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_uint, c_void};
use std::path::Path;
use std::sync::{Mutex, OnceLock};

use super::types::InternalEnvironmentInfo;

pub const RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY: c_uint = 9;
pub const RETRO_ENVIRONMENT_SET_PIXEL_FORMAT: c_uint = 10;
pub const RETRO_ENVIRONMENT_GET_VARIABLE: c_uint = 15;
pub const RETRO_ENVIRONMENT_SET_VARIABLES: c_uint = 16;
pub const RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE: c_uint = 17;
pub const RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME: c_uint = 18;
// libretro.h keeps GET_CONTENT_DIRECTORY as an obsolete alias of this command.
pub const RETRO_ENVIRONMENT_GET_CORE_ASSETS_DIRECTORY: c_uint = 30;
pub const RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY: c_uint = 31;

const RETRO_PIXEL_FORMAT_0RGB1555: c_uint = 0;
const RETRO_PIXEL_FORMAT_XRGB8888: c_uint = 1;
const RETRO_PIXEL_FORMAT_RGB565: c_uint = 2;

#[repr(C)]
struct RetroVariable {
    key: *const c_char,
    value: *const c_char,
}

#[derive(Clone)]
pub struct LibretroEnvironmentConfig {
    pub core_path: String,
    pub rom_path: String,
    pub save_directory: Option<String>,
}

#[derive(Clone, Debug)]
struct LibretroVariable {
    key: String,
    selected_value: Option<CString>,
}

#[derive(Default)]
struct LibretroEnvironmentState {
    system_directory: Option<CString>,
    save_directory: Option<CString>,
    content_directory: Option<CString>,
    core_assets_directory: Option<CString>,
    pixel_format: Option<LibretroPixelFormat>,
    variables: Vec<LibretroVariable>,
    variable_update: bool,
    support_no_game: bool,
}

#[derive(Clone, Copy, Debug)]
enum LibretroPixelFormat {
    ZeroRgb1555,
    Xrgb8888,
    Rgb565,
}

static ENVIRONMENT_STATE: OnceLock<Mutex<LibretroEnvironmentState>> = OnceLock::new();

pub fn configure_environment(config: LibretroEnvironmentConfig) {
    let state = environment_state();
    let Ok(mut state) = state.lock() else {
        return;
    };

    *state = LibretroEnvironmentState {
        system_directory: parent_cstring(&config.core_path),
        save_directory: optional_cstring(config.save_directory.as_deref()),
        content_directory: parent_cstring(&config.rom_path),
        core_assets_directory: parent_cstring(&config.core_path),
        pixel_format: None,
        variables: Vec::new(),
        variable_update: false,
        support_no_game: false,
    };
}

pub fn reset_environment() {
    let state = environment_state();
    if let Ok(mut state) = state.lock() {
        *state = LibretroEnvironmentState::default();
    }
}

pub fn environment_info() -> InternalEnvironmentInfo {
    let state = environment_state();
    let Ok(state) = state.lock() else {
        return InternalEnvironmentInfo::default();
    };

    state.info()
}

pub unsafe extern "C" fn environment_callback(cmd: c_uint, data: *mut c_void) -> bool {
    let state = environment_state();
    let Ok(mut state) = state.lock() else {
        return false;
    };

    state.handle_command(cmd, data)
}

fn environment_state() -> &'static Mutex<LibretroEnvironmentState> {
    ENVIRONMENT_STATE.get_or_init(|| Mutex::new(LibretroEnvironmentState::default()))
}

impl LibretroEnvironmentState {
    fn handle_command(&mut self, cmd: c_uint, data: *mut c_void) -> bool {
        match cmd {
            RETRO_ENVIRONMENT_SET_PIXEL_FORMAT => self.set_pixel_format(data),
            RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY => {
                write_directory(data, self.system_directory.as_ref())
            }
            RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY => {
                write_directory(data, self.save_directory.as_ref())
            }
            RETRO_ENVIRONMENT_GET_CORE_ASSETS_DIRECTORY => {
                let directory = self
                    .core_assets_directory
                    .as_ref()
                    .or(self.content_directory.as_ref());
                write_directory(data, directory)
            }
            RETRO_ENVIRONMENT_SET_VARIABLES => self.set_variables(data),
            RETRO_ENVIRONMENT_GET_VARIABLE => self.get_variable(data),
            RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE => self.get_variable_update(data),
            RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME => self.set_support_no_game(data),
            _ => false,
        }
    }

    fn info(&self) -> InternalEnvironmentInfo {
        InternalEnvironmentInfo {
            pixel_format: self.pixel_format.map(|format| format.as_str().to_string()),
            system_directory: cstring_to_string(self.system_directory.as_ref()),
            save_directory: cstring_to_string(self.save_directory.as_ref()),
            content_directory: cstring_to_string(self.content_directory.as_ref()),
            core_assets_directory: cstring_to_string(self.core_assets_directory.as_ref()),
            variable_count: self.variables.len(),
            support_no_game: self.support_no_game,
        }
    }

    fn set_pixel_format(&mut self, data: *mut c_void) -> bool {
        if data.is_null() {
            return false;
        }

        // SAFETY: libretro passes a valid pointer to enum retro_pixel_format for this
        // command. We null-check first and copy the integer value immediately.
        let raw_format = unsafe { *(data as *const c_uint) };
        let Some(pixel_format) = LibretroPixelFormat::from_raw(raw_format) else {
            return false;
        };
        self.pixel_format = Some(pixel_format);
        true
    }

    fn set_variables(&mut self, data: *mut c_void) -> bool {
        if data.is_null() {
            self.variables.clear();
            self.variable_update = true;
            return true;
        }

        let mut variables = Vec::new();
        let mut index = 0_usize;

        loop {
            // SAFETY: libretro passes a null-key-terminated array of retro_variable
            // entries. We stop at the first null key and copy all strings into owned
            // Rust data before returning.
            let variable = unsafe { &*((data as *const RetroVariable).add(index)) };
            if variable.key.is_null() {
                break;
            }

            let Some(key) = c_ptr_to_string(variable.key) else {
                index += 1;
                continue;
            };
            let Some(definition) = c_ptr_to_string(variable.value) else {
                index += 1;
                continue;
            };
            let selected_value = default_variable_value(&definition).and_then(to_cstring);

            variables.push(LibretroVariable {
                key,
                selected_value,
            });
            index += 1;
        }

        self.variables = variables;
        self.variable_update = true;
        true
    }

    fn get_variable(&mut self, data: *mut c_void) -> bool {
        if data.is_null() {
            return true;
        }

        // SAFETY: libretro passes a valid mutable pointer to retro_variable for this
        // command. We null-check first and only write the `value` pointer to CString
        // storage owned by `self.variables`, which lives while the core is active.
        let variable = unsafe { &mut *(data as *mut RetroVariable) };
        if variable.key.is_null() {
            variable.value = std::ptr::null();
            return true;
        }

        let Some(key) = c_ptr_to_string(variable.key) else {
            variable.value = std::ptr::null();
            return true;
        };

        let value = self
            .variables
            .iter()
            .find(|candidate| candidate.key == key)
            .and_then(|candidate| candidate.selected_value.as_ref())
            .map(|value| value.as_ptr())
            .unwrap_or(std::ptr::null());
        variable.value = value;
        true
    }

    fn get_variable_update(&mut self, data: *mut c_void) -> bool {
        if data.is_null() {
            return false;
        }

        // SAFETY: libretro passes a valid mutable bool pointer for this command. We
        // null-check first, write a plain bool, then clear the one-shot update flag.
        unsafe {
            *(data as *mut bool) = self.variable_update;
        }
        self.variable_update = false;
        true
    }

    fn set_support_no_game(&mut self, data: *mut c_void) -> bool {
        if data.is_null() {
            return false;
        }

        // SAFETY: libretro passes a valid pointer to bool for this command. We
        // null-check first and copy the value.
        self.support_no_game = unsafe { *(data as *const bool) };
        true
    }
}

impl LibretroPixelFormat {
    fn from_raw(value: c_uint) -> Option<Self> {
        match value {
            RETRO_PIXEL_FORMAT_0RGB1555 => Some(Self::ZeroRgb1555),
            RETRO_PIXEL_FORMAT_XRGB8888 => Some(Self::Xrgb8888),
            RETRO_PIXEL_FORMAT_RGB565 => Some(Self::Rgb565),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::ZeroRgb1555 => "0rgb1555",
            Self::Xrgb8888 => "xrgb8888",
            Self::Rgb565 => "rgb565",
        }
    }
}

fn write_directory(data: *mut c_void, directory: Option<&CString>) -> bool {
    let Some(directory) = directory else {
        return false;
    };

    if data.is_null() {
        return false;
    }

    // SAFETY: libretro passes a valid `const char **` output pointer for directory
    // queries. We null-check first and write a pointer to CString storage held by the
    // global environment state for the lifetime of the active core.
    unsafe {
        *(data as *mut *const c_char) = directory.as_ptr();
    }
    true
}

fn parent_cstring(path: &str) -> Option<CString> {
    let parent = Path::new(path).parent()?.to_string_lossy().to_string();
    to_cstring(parent)
}

fn optional_cstring(value: Option<&str>) -> Option<CString> {
    value.and_then(|value| {
        if value.trim().is_empty() {
            None
        } else {
            to_cstring(value.to_string())
        }
    })
}

fn to_cstring(value: String) -> Option<CString> {
    CString::new(value).ok()
}

fn cstring_to_string(value: Option<&CString>) -> Option<String> {
    value.map(|value| value.to_string_lossy().to_string())
}

fn c_ptr_to_string(value: *const c_char) -> Option<String> {
    if value.is_null() {
        return None;
    }

    // SAFETY: The pointer is expected to be a null-terminated C string owned by the
    // core for the duration of the callback. We copy it immediately.
    Some(
        unsafe { CStr::from_ptr(value) }
            .to_string_lossy()
            .to_string(),
    )
}

fn default_variable_value(definition: &str) -> Option<String> {
    let (_, values) = definition.split_once("; ")?;
    values
        .split('|')
        .next()
        .map(|value| value.trim().to_string())
}
