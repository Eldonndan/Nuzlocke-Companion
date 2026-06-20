use std::sync::Mutex;

use super::libretro_host::LibretroHost;
use super::types::{
    InternalCoreInfo, InternalEnvironmentInfo, InternalLoadedGameInfo, InternalRuntimePhase,
    InternalRuntimeStatus, PrepareInternalRuntimeRequest,
};

#[derive(Default)]
pub struct InternalEmulationState {
    status: Mutex<InternalRuntimeStatus>,
    host: Mutex<Option<LibretroHost>>,
}

impl InternalEmulationState {
    pub fn status(&self) -> Result<InternalRuntimeStatus, String> {
        self.status
            .lock()
            .map(|status| status.clone())
            .map_err(|_| "No se pudo leer el estado del runtime interno.".to_string())
    }

    pub fn prepare(
        &self,
        request: PrepareInternalRuntimeRequest,
    ) -> Result<InternalRuntimeStatus, String> {
        // Preparing a new runtime configuration invalidates any loaded core.
        self.clear_host()?;
        self.update_status(|status| {
            status.phase = InternalRuntimePhase::Prepared;
            status.core = Some(request.core);
            status.core_path = Some(request.core_path);
            status.rom_path = Some(request.rom_path);
            status.save_directory = request.save_directory;
            status.core_info = None;
            status.environment_info = None;
            status.loaded_game = None;
            status.is_core_loaded = false;
            status.is_core_initialized = false;
            status.is_rom_loaded = false;
            status.is_running = false;
            status.last_error = None;
        })
    }

    pub fn mark_core_loaded(
        &self,
        host: LibretroHost,
        core_info: InternalCoreInfo,
        environment_info: InternalEnvironmentInfo,
    ) -> Result<InternalRuntimeStatus, String> {
        {
            let mut loaded_host = self
                .host
                .lock()
                .map_err(|_| "No se pudo guardar el host Libretro interno.".to_string())?;
            *loaded_host = Some(host);
        }

        self.update_status(|status| {
            status.phase = InternalRuntimePhase::CoreLoaded;
            status.core_info = Some(core_info);
            status.environment_info = Some(environment_info);
            status.loaded_game = None;
            status.is_core_loaded = true;
            status.is_core_initialized = false;
            status.is_rom_loaded = false;
            status.is_running = false;
            status.last_error = None;
        })
    }

    pub fn init_loaded_core(&self) -> Result<InternalRuntimeStatus, String> {
        let environment_info = {
            let mut loaded_host = self
                .host
                .lock()
                .map_err(|_| "No se pudo inicializar el host Libretro interno.".to_string())?;
            let host = loaded_host
                .as_mut()
                .ok_or_else(|| "No Libretro core is loaded.".to_string())?;

            if !host.is_initialized() {
                host.init_core()?;
            }

            host.environment_info()
        };

        self.update_status(|status| {
            status.phase = InternalRuntimePhase::CoreInitialized;
            status.environment_info = Some(environment_info);
            status.loaded_game = None;
            status.is_core_loaded = true;
            status.is_core_initialized = true;
            status.is_rom_loaded = false;
            status.is_running = false;
            status.last_error = None;
        })
    }

    pub fn deinit_loaded_core(&self) -> Result<InternalRuntimeStatus, String> {
        let environment_info = {
            let mut loaded_host = self
                .host
                .lock()
                .map_err(|_| "No se pudo desinicializar el host Libretro interno.".to_string())?;
            let Some(host) = loaded_host.as_mut() else {
                return Err("No Libretro core is loaded.".into());
            };

            host.deinit_core()?;
            host.environment_info()
        };

        self.update_status(|status| {
            // The dynamic library remains loaded after deinit; only the core lifecycle
            // moves back from initialized to loaded.
            status.phase = InternalRuntimePhase::CoreLoaded;
            status.environment_info = Some(environment_info);
            status.loaded_game = None;
            status.is_core_loaded = true;
            status.is_core_initialized = false;
            status.is_rom_loaded = false;
            status.is_running = false;
            status.last_error = None;
        })
    }

    pub fn load_game(&self) -> Result<InternalRuntimeStatus, String> {
        let rom_path = self
            .status()?
            .rom_path
            .ok_or_else(|| "ROM path is not prepared.".to_string())?;

        let (loaded_game, environment_info) = {
            let mut loaded_host = self
                .host
                .lock()
                .map_err(|_| "No se pudo cargar la ROM en el host Libretro interno.".to_string())?;
            let host = loaded_host
                .as_mut()
                .ok_or_else(|| "No Libretro core is loaded.".to_string())?;

            if !host.is_initialized() {
                return Err("Libretro core must be initialized before loading a ROM.".into());
            }

            let loaded_game = host.load_game(&rom_path)?;
            let environment_info = host.environment_info();
            (loaded_game, environment_info)
        };

        self.mark_game_loaded(loaded_game, environment_info)
    }

    pub fn unload_game(&self) -> Result<InternalRuntimeStatus, String> {
        let environment_info = {
            let mut loaded_host = self.host.lock().map_err(|_| {
                "No se pudo descargar la ROM del host Libretro interno.".to_string()
            })?;
            let host = loaded_host
                .as_mut()
                .ok_or_else(|| "No Libretro core is loaded.".to_string())?;

            if !host.is_initialized() {
                return Err("Libretro core must be initialized before unloading a ROM.".into());
            }

            host.unload_game()?;
            host.environment_info()
        };

        self.update_status(|status| {
            status.phase = InternalRuntimePhase::CoreInitialized;
            status.environment_info = Some(environment_info);
            status.loaded_game = None;
            status.is_core_loaded = true;
            status.is_core_initialized = true;
            status.is_rom_loaded = false;
            status.is_running = false;
            status.last_error = None;
        })
    }

    pub fn mark_error(&self, error: impl Into<String>) -> Result<InternalRuntimeStatus, String> {
        let error = error.into();
        self.update_status(|status| {
            status.phase = InternalRuntimePhase::Error;
            status.is_running = false;
            status.last_error = Some(error);
        })
    }

    pub fn stop(&self) -> Result<InternalRuntimeStatus, String> {
        self.clear_host()?;
        self.update_status(|status| {
            status.phase = InternalRuntimePhase::Stopped;
            status.core_info = None;
            status.environment_info = None;
            status.loaded_game = None;
            status.is_core_loaded = false;
            status.is_core_initialized = false;
            status.is_rom_loaded = false;
            status.is_running = false;
            status.last_error = None;
        })
    }

    pub fn reset_idle(&self) -> Result<InternalRuntimeStatus, String> {
        self.clear_host()?;
        self.update_status(|status| {
            *status = InternalRuntimeStatus::default();
        })
    }

    fn clear_host(&self) -> Result<(), String> {
        let mut loaded_host = self
            .host
            .lock()
            .map_err(|_| "No se pudo liberar el host Libretro interno.".to_string())?;
        *loaded_host = None;
        Ok(())
    }

    fn mark_game_loaded(
        &self,
        loaded_game: InternalLoadedGameInfo,
        environment_info: InternalEnvironmentInfo,
    ) -> Result<InternalRuntimeStatus, String> {
        self.update_status(|status| {
            status.phase = InternalRuntimePhase::RomLoaded;
            status.environment_info = Some(environment_info);
            status.loaded_game = Some(loaded_game);
            status.is_core_loaded = true;
            status.is_core_initialized = true;
            status.is_rom_loaded = true;
            status.is_running = false;
            status.last_error = None;
        })
    }

    fn update_status(
        &self,
        update: impl FnOnce(&mut InternalRuntimeStatus),
    ) -> Result<InternalRuntimeStatus, String> {
        let mut status = self
            .status
            .lock()
            .map_err(|_| "No se pudo actualizar el estado del runtime interno.".to_string())?;
        update(&mut status);
        Ok(status.clone())
    }
}
