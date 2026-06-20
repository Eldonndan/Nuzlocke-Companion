use std::ffi::CString;
use std::fs;
use std::os::raw::c_void;
use std::path::Path;

use libloading::Library;

use super::environment::{
    configure_environment, environment_info, reset_environment, LibretroEnvironmentConfig,
};
use super::libretro_ffi::{LibretroCoreSymbols, RetroGameInfo};
use super::types::{
    InternalCoreInfo, InternalEnvironmentInfo, InternalFrameInfo, InternalLoadedGameInfo,
};
use super::video::{
    latest_frame_info, prepare_video_frame_capture, reset_video_state, take_video_error,
};

pub struct LibretroHostConfig {
    pub core_path: String,
    pub rom_path: String,
    pub save_directory: Option<String>,
}

pub struct LibretroHost {
    _library: Library,
    symbols: LibretroCoreSymbols,
    core_info: InternalCoreInfo,
    initialized: bool,
    loaded_game: Option<LoadedGame>,
}

struct LoadedGame {
    rom_path: String,
    rom_path_cstring: CString,
    data: Option<Vec<u8>>,
    size_bytes: u64,
    loaded_with_fullpath: bool,
    extension: Option<String>,
}

impl LibretroHost {
    pub fn load_core(config: LibretroHostConfig) -> Result<Self, String> {
        let core_path = config.core_path.trim().to_string();

        if core_path.is_empty() {
            return Err("Core path cannot be empty.".into());
        }

        if !Path::new(&core_path).exists() {
            return Err("Core file was not found.".into());
        }

        // SAFETY: Loading a dynamic library is inherently unsafe because library
        // initialization code may run and symbols may not match expected ABIs. This
        // spike only opens a user-selected local path and immediately validates the
        // minimal libretro symbols before exposing owned metadata to safe Rust code.
        let library = unsafe { Library::new(&core_path) }
            .map_err(|error| format!("Could not load Libretro core library: {error}"))?;
        let symbols = LibretroCoreSymbols::load(&library)?;
        let core_info = symbols.read_core_info();
        configure_environment(LibretroEnvironmentConfig {
            core_path: core_path.clone(),
            rom_path: config.rom_path,
            save_directory: config.save_directory,
        });

        Ok(Self {
            _library: library,
            symbols,
            core_info,
            initialized: false,
            loaded_game: None,
        })
    }

    pub fn core_info(&self) -> InternalCoreInfo {
        self.core_info.clone()
    }

    pub fn environment_info(&self) -> InternalEnvironmentInfo {
        environment_info()
    }

    pub fn init_core(&mut self) -> Result<(), String> {
        if self.initialized {
            return Err("Libretro core is already initialized.".into());
        }

        self.symbols.set_minimal_frontend_callbacks();
        self.symbols.init();
        self.initialized = true;
        Ok(())
    }

    pub fn deinit_core(&mut self) -> Result<(), String> {
        if !self.initialized {
            return Ok(());
        }

        self.unload_game()?;
        self.symbols.deinit();
        self.initialized = false;
        Ok(())
    }

    pub fn is_initialized(&self) -> bool {
        self.initialized
    }

    pub fn load_game(&mut self, rom_path: &str) -> Result<InternalLoadedGameInfo, String> {
        if !self.initialized {
            return Err("Libretro core must be initialized before loading a ROM.".into());
        }

        if self.loaded_game.is_some() {
            return Err("A ROM is already loaded.".into());
        }

        let loaded_game = LoadedGame::new(rom_path, &self.core_info)?;
        let game_info = loaded_game.game_info();

        if !self.symbols.load_game(&game_info) {
            return Err("Libretro core rejected the ROM in retro_load_game.".into());
        }

        let info = loaded_game.info();
        self.loaded_game = Some(loaded_game);
        Ok(info)
    }

    pub fn step_frame(&mut self) -> Result<InternalFrameInfo, String> {
        if !self.initialized {
            return Err("Libretro core must be initialized before stepping a frame.".into());
        }

        if !self.is_game_loaded() {
            return Err("A ROM must be loaded before stepping a frame.".into());
        }

        prepare_video_frame_capture();
        self.symbols.run_frame();

        if let Some(error) = take_video_error()? {
            return Err(error);
        }

        latest_frame_info()?.ok_or_else(|| "No video frame was produced by retro_run.".to_string())
    }

    pub fn unload_game(&mut self) -> Result<(), String> {
        if !self.is_game_loaded() {
            return Ok(());
        }

        self.symbols.unload_game();
        self.loaded_game = None;
        Ok(())
    }

    pub fn is_game_loaded(&self) -> bool {
        self.loaded_game.is_some()
    }
}

impl Drop for LibretroHost {
    fn drop(&mut self) {
        let _ = self.deinit_core();
        reset_video_state();
        reset_environment();
    }
}

impl LoadedGame {
    fn new(rom_path: &str, core_info: &InternalCoreInfo) -> Result<Self, String> {
        let rom_path = rom_path.trim().to_string();
        if rom_path.is_empty() {
            return Err("ROM path cannot be empty.".into());
        }

        let path = Path::new(&rom_path);
        if !path.exists() {
            return Err("ROM file was not found.".into());
        }

        if !path.is_file() {
            return Err("ROM path must point to a file.".into());
        }

        let extension = path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.to_ascii_lowercase());
        validate_extension(extension.as_deref(), core_info.valid_extensions.as_deref())?;

        let metadata =
            fs::metadata(path).map_err(|error| format!("Could not read ROM metadata: {error}"))?;
        let data = if core_info.need_fullpath {
            None
        } else {
            Some(fs::read(path).map_err(|error| format!("Could not read ROM file: {error}"))?)
        };

        let rom_path_cstring = CString::new(rom_path.clone())
            .map_err(|_| "ROM path contains an unsupported NUL byte.".to_string())?;

        Ok(Self {
            rom_path,
            rom_path_cstring,
            data,
            size_bytes: metadata.len(),
            loaded_with_fullpath: core_info.need_fullpath,
            extension,
        })
    }

    fn game_info(&self) -> RetroGameInfo {
        let (data, size) = self
            .data
            .as_ref()
            .map(|data| (data.as_ptr() as *const c_void, data.len()))
            .unwrap_or((std::ptr::null(), 0));

        RetroGameInfo {
            path: self.rom_path_cstring.as_ptr(),
            data,
            size,
            meta: std::ptr::null(),
        }
    }

    fn info(&self) -> InternalLoadedGameInfo {
        InternalLoadedGameInfo {
            rom_path: self.rom_path.clone(),
            extension: self.extension.clone(),
            size_bytes: Some(self.size_bytes),
            loaded_with_fullpath: self.loaded_with_fullpath,
        }
    }
}

fn validate_extension(
    extension: Option<&str>,
    valid_extensions: Option<&str>,
) -> Result<(), String> {
    let Some(valid_extensions) = valid_extensions else {
        return Ok(());
    };

    let valid_extensions = valid_extensions.trim();
    if valid_extensions.is_empty() {
        return Ok(());
    }

    let Some(extension) = extension else {
        return Err(format!(
            "ROM extension is not supported by this core. Supported extensions: {valid_extensions}"
        ));
    };

    let is_supported = valid_extensions.split('|').any(|candidate| {
        let candidate = candidate
            .trim()
            .trim_start_matches('.')
            .to_ascii_lowercase();
        !candidate.is_empty() && candidate == extension
    });

    if is_supported {
        Ok(())
    } else {
        Err(format!(
            "ROM extension .{extension} is not supported by this core. Supported extensions: {valid_extensions}"
        ))
    }
}

// Future responsibilities:
// - bind the full Libretro lifecycle surface;
// - execute frames and coordinate lifecycle transitions;
// - expose video, audio, input, and save hooks to the rest of the native host.
