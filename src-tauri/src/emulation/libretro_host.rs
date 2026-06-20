use std::path::Path;

use libloading::Library;

use super::libretro_ffi::LibretroCoreSymbols;
use super::types::InternalCoreInfo;

pub struct LibretroHost {
    _library: Library,
    symbols: LibretroCoreSymbols,
    core_info: InternalCoreInfo,
    initialized: bool,
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
        let symbols = LibretroCoreSymbols::load(&library)?;
        let core_info = symbols.read_core_info();

        Ok(Self {
            _library: library,
            symbols,
            core_info,
            initialized: false,
        })
    }

    pub fn core_info(&self) -> InternalCoreInfo {
        self.core_info.clone()
    }

    pub fn init_core(&mut self) -> Result<(), String> {
        if self.initialized {
            return Err("Libretro core is already initialized.".into());
        }

        self.symbols.set_noop_callbacks();
        self.symbols.init();
        self.initialized = true;
        Ok(())
    }

    pub fn deinit_core(&mut self) -> Result<(), String> {
        if !self.initialized {
            return Ok(());
        }

        self.symbols.deinit();
        self.initialized = false;
        Ok(())
    }

    pub fn is_initialized(&self) -> bool {
        self.initialized
    }
}

impl Drop for LibretroHost {
    fn drop(&mut self) {
        let _ = self.deinit_core();
    }
}

// Future responsibilities:
// - bind the full Libretro lifecycle surface;
// - load the user-selected local ROM into the core;
// - execute frames and coordinate lifecycle transitions;
// - expose video, audio, input, and save hooks to the rest of the native host.
