use std::path::Path;

use libloading::Library;

use super::libretro_ffi;
use super::types::InternalCoreInfo;

pub struct LibretroHost {
    _library: Library,
    core_info: InternalCoreInfo,
}

impl LibretroHost {
    pub fn load_core(core_path: &str) -> Result<Self, String> {
        let core_path = core_path.trim();

        if core_path.is_empty() {
            return Err("Core path cannot be empty.".into());
        }

        if !Path::new(core_path).exists() {
            return Err("Core file was not found.".into());
        }

        // SAFETY: Loading a dynamic library is inherently unsafe because library
        // initialization code may run and symbols may not match expected ABIs. This
        // spike only opens a user-selected local path and immediately validates the
        // minimal libretro symbols before exposing owned metadata to safe Rust code.
        let library = unsafe { Library::new(core_path) }
            .map_err(|error| format!("Could not load Libretro core library: {error}"))?;
        let core_info = libretro_ffi::read_core_info(&library)?;

        Ok(Self {
            _library: library,
            core_info,
        })
    }

    pub fn core_info(&self) -> InternalCoreInfo {
        self.core_info.clone()
    }
}

// Future responsibilities:
// - bind the full Libretro lifecycle surface;
// - call retro_init only after callbacks are configured;
// - load the user-selected local ROM into the core;
// - execute frames and coordinate lifecycle transitions;
// - expose video, audio, input, and save hooks to the rest of the native host.
