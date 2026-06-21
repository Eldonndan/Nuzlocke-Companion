use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use super::audio::{
    audio_info, clear_audio_buffer, drain_audio_chunk, reset_audio_state,
};
use super::input::{
    clear_joypad_buttons, input_info, reset_input_state, set_joypad_button,
};
use super::libretro_host::LibretroHost;
use super::types::{
    InternalAudioChunk, InternalAudioInfo, InternalCoreInfo, InternalEnvironmentInfo,
    InternalFrameInfo, InternalFrameLoopInfo, InternalFrameSnapshot, InternalInputInfo,
    InternalLoadedGameInfo, InternalRuntimePhase, InternalRuntimeStatus, InternalSaveMemoryInfo,
    InternalSaveMemoryKind, InternalSaveOperationResult, InternalSystemAvInfo,
    PrepareInternalRuntimeRequest, RunFrameLoopRequest, SetJoypadButtonRequest,
};
use super::video::{latest_frame_snapshot_rgba, reset_video_state};

const MAX_FRAME_LOOP_FRAMES: u32 = 600;
const DEFAULT_FRAME_LOOP_FPS: u32 = 60;
const MAX_FRAME_LOOP_FPS: u32 = 120;

#[derive(Default)]
pub struct InternalEmulationState {
    status: Mutex<InternalRuntimeStatus>,
    host: Mutex<Option<LibretroHost>>,
    frame_loop: FrameLoopControl,
}

#[derive(Default)]
struct FrameLoopControl {
    is_active: AtomicBool,
    cancel_requested: AtomicBool,
}

impl InternalEmulationState {
    pub fn status(&self) -> Result<InternalRuntimeStatus, String> {
        self.status
            .lock()
            .map(|status| status.clone())
            .map_err(|_| "No se pudo leer el estado del runtime interno.".to_string())
    }

    pub fn latest_frame_snapshot(&self) -> Result<Option<InternalFrameSnapshot>, String> {
        latest_frame_snapshot_rgba()
    }

    pub fn drain_audio_chunk(
        &self,
        max_frames: Option<usize>,
    ) -> Result<InternalAudioChunk, String> {
        let chunk = drain_audio_chunk(max_frames)?;
        let audio_info = audio_info()?;
        self.update_status(|status| {
            status.audio_info = audio_info;
        })?;
        Ok(chunk)
    }

    pub fn clear_audio_buffer(&self) -> Result<InternalRuntimeStatus, String> {
        let audio_info = clear_audio_buffer()?;
        self.update_status(|status| {
            status.audio_info = audio_info;
        })
    }

    pub fn set_joypad_button(
        &self,
        request: SetJoypadButtonRequest,
    ) -> Result<InternalRuntimeStatus, String> {
        let input_info = set_joypad_button(request.button, request.pressed)?;
        self.update_status(|status| {
            status.input_info = input_info;
        })
    }

    pub fn clear_joypad_buttons(&self) -> Result<InternalRuntimeStatus, String> {
        let input_info = clear_joypad_buttons()?;
        self.update_status(|status| {
            status.input_info = input_info;
        })
    }

    pub fn prepare(
        &self,
        request: PrepareInternalRuntimeRequest,
    ) -> Result<InternalRuntimeStatus, String> {
        self.ensure_frame_loop_inactive()?;
        let autosave_result = self.autosave_sram_if_available()?;
        // Preparing a new runtime configuration invalidates any loaded core.
        self.clear_host()?;
        reset_input_state();
        reset_video_state();
        reset_audio_state();
        self.update_status(|status| {
            status.phase = InternalRuntimePhase::Prepared;
            status.core = Some(request.core);
            status.core_path = Some(request.core_path);
            status.rom_path = Some(request.rom_path);
            status.save_directory = request.save_directory;
            status.core_info = None;
            status.environment_info = None;
            status.loaded_game = None;
            status.latest_frame = None;
            status.stepped_frames = 0;
            status.frame_loop = None;
            status.input_info = InternalInputInfo::default();
            status.audio_info = InternalAudioInfo::default();
            status.av_info = None;
            status.save_memory = Vec::new();
            status.last_save_operation = autosave_result;
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
        self.ensure_frame_loop_inactive()?;
        let autosave_result = self.autosave_sram_if_available()?;
        {
            let mut loaded_host = self
                .host
                .lock()
                .map_err(|_| "No se pudo guardar el host Libretro interno.".to_string())?;
            *loaded_host = Some(host);
        }

        reset_input_state();
        reset_video_state();
        reset_audio_state();
        self.update_status(|status| {
            status.phase = InternalRuntimePhase::CoreLoaded;
            status.core_info = Some(core_info);
            status.environment_info = Some(environment_info);
            status.loaded_game = None;
            status.latest_frame = None;
            status.stepped_frames = 0;
            status.frame_loop = None;
            status.input_info = InternalInputInfo::default();
            status.audio_info = InternalAudioInfo::default();
            status.av_info = None;
            status.save_memory = Vec::new();
            status.last_save_operation = autosave_result;
            status.is_core_loaded = true;
            status.is_core_initialized = false;
            status.is_rom_loaded = false;
            status.is_running = false;
            status.last_error = None;
        })
    }

    pub fn init_loaded_core(&self) -> Result<InternalRuntimeStatus, String> {
        self.ensure_frame_loop_inactive()?;
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

        reset_input_state();
        reset_video_state();
        reset_audio_state();
        self.update_status(|status| {
            status.phase = InternalRuntimePhase::CoreInitialized;
            status.environment_info = Some(environment_info);
            status.loaded_game = None;
            status.latest_frame = None;
            status.stepped_frames = 0;
            status.frame_loop = None;
            status.input_info = InternalInputInfo::default();
            status.audio_info = InternalAudioInfo::default();
            status.av_info = None;
            status.save_memory = Vec::new();
            status.last_save_operation = None;
            status.is_core_loaded = true;
            status.is_core_initialized = true;
            status.is_rom_loaded = false;
            status.is_running = false;
            status.last_error = None;
        })
    }

    pub fn deinit_loaded_core(&self) -> Result<InternalRuntimeStatus, String> {
        self.ensure_frame_loop_inactive()?;
        let (environment_info, autosave_result) = {
            let mut loaded_host = self
                .host
                .lock()
                .map_err(|_| "No se pudo desinicializar el host Libretro interno.".to_string())?;
            let Some(host) = loaded_host.as_mut() else {
                return Err("No Libretro core is loaded.".into());
            };

            let autosave_result = Self::autosave_sram_for_host(host)?;
            host.deinit_core()?;
            (host.environment_info(), autosave_result)
        };

        reset_input_state();
        reset_video_state();
        reset_audio_state();
        self.update_status(|status| {
            // The dynamic library remains loaded after deinit; only the core lifecycle
            // moves back from initialized to loaded.
            status.phase = InternalRuntimePhase::CoreLoaded;
            status.environment_info = Some(environment_info);
            status.loaded_game = None;
            status.latest_frame = None;
            status.stepped_frames = 0;
            status.frame_loop = None;
            status.input_info = InternalInputInfo::default();
            status.audio_info = InternalAudioInfo::default();
            status.av_info = None;
            status.save_memory = Vec::new();
            status.last_save_operation = autosave_result;
            status.is_core_loaded = true;
            status.is_core_initialized = false;
            status.is_rom_loaded = false;
            status.is_running = false;
            status.last_error = None;
        })
    }

    pub fn load_game(&self) -> Result<InternalRuntimeStatus, String> {
        self.ensure_frame_loop_inactive()?;
        let rom_path = self
            .status()?
            .rom_path
            .ok_or_else(|| "ROM path is not prepared.".to_string())?;

        let (loaded_game, environment_info, av_info, audio_info, save_memory) = {
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
            let av_info = host.av_info();
            let audio_info = host.audio_info()?;
            let save_memory = host.save_memory_info().unwrap_or_default();
            (loaded_game, environment_info, av_info, audio_info, save_memory)
        };

        reset_input_state();
        self.mark_game_loaded(loaded_game, environment_info, av_info, audio_info, save_memory)
    }

    pub fn save_memory_info(&self) -> Result<InternalRuntimeStatus, String> {
        self.ensure_save_memory_accessible()?;
        let save_memory = {
            let loaded_host = self
                .host
                .lock()
                .map_err(|_| "No se pudo consultar la memoria de guardado.".to_string())?;
            let host = loaded_host
                .as_ref()
                .ok_or_else(|| "No Libretro core is loaded.".to_string())?;
            host.save_memory_info()?
        };

        self.update_status(|status| {
            status.save_memory = save_memory;
        })
    }

    pub fn save_memory_to_disk(
        &self,
        kind: InternalSaveMemoryKind,
    ) -> Result<InternalRuntimeStatus, String> {
        self.ensure_save_memory_accessible()?;
        let (result, save_memory) = {
            let mut loaded_host = self
                .host
                .lock()
                .map_err(|_| "No se pudo guardar la memoria de guardado.".to_string())?;
            let host = loaded_host
                .as_mut()
                .ok_or_else(|| "No Libretro core is loaded.".to_string())?;
            let result = host.save_memory_to_disk(kind)?;
            let save_memory = host.save_memory_info()?;
            (result, save_memory)
        };

        self.mark_save_operation(result, save_memory)
    }

    pub fn load_save_memory_from_disk(
        &self,
        kind: InternalSaveMemoryKind,
    ) -> Result<InternalRuntimeStatus, String> {
        self.ensure_save_memory_accessible()?;
        let (result, save_memory) = {
            let mut loaded_host = self
                .host
                .lock()
                .map_err(|_| "No se pudo cargar la memoria de guardado.".to_string())?;
            let host = loaded_host
                .as_mut()
                .ok_or_else(|| "No Libretro core is loaded.".to_string())?;
            let result = host.load_save_memory_from_disk(kind)?;
            let save_memory = host.save_memory_info()?;
            (result, save_memory)
        };

        self.mark_save_operation(result, save_memory)
    }

    pub fn step_frame(&self) -> Result<InternalRuntimeStatus, String> {
        self.ensure_frame_loop_inactive()?;
        let (frame_info, environment_info, input_info, audio_info) = {
            let mut loaded_host = self.host.lock().map_err(|_| {
                "No se pudo avanzar un frame en el host Libretro interno.".to_string()
            })?;
            let host = loaded_host
                .as_mut()
                .ok_or_else(|| "No Libretro core is loaded.".to_string())?;

            if !host.is_initialized() {
                return Err("Libretro core must be initialized before stepping a frame.".into());
            }

            if !host.is_game_loaded() {
                return Err("A ROM must be loaded before stepping a frame.".into());
            }

            let frame_info = host.step_frame()?;
            let environment_info = host.environment_info();
            let input_info = input_info()?;
            let audio_info = audio_info()?;
            (frame_info, environment_info, input_info, audio_info)
        };

        self.mark_frame_stepped(frame_info, environment_info, input_info, audio_info)
    }

    pub fn run_frame_loop(
        &self,
        request: RunFrameLoopRequest,
    ) -> Result<InternalRuntimeStatus, String> {
        let loop_config = validate_frame_loop_request(request)?;

        self.frame_loop
            .is_active
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map_err(|_| "Frame loop is already active.".to_string())?;
        self.frame_loop
            .cancel_requested
            .store(false, Ordering::SeqCst);

        let result = self.run_frame_loop_inner(&loop_config);
        let final_result = match result {
            Ok((
                latest_frame,
                environment_info,
                input_info,
                audio_info,
                frames_run,
                cancelled,
            )) => self.mark_frame_loop_finished(
                latest_frame,
                environment_info,
                input_info,
                audio_info,
                &loop_config,
                frames_run,
                cancelled,
            ),
            Err(error) => {
                let _ = self.mark_frame_loop_failed(&loop_config, &error);
                Err(error)
            }
        };

        self.clear_frame_loop_control();
        final_result
    }

    pub fn cancel_frame_loop(&self) -> Result<InternalRuntimeStatus, String> {
        if self.frame_loop.is_active.load(Ordering::SeqCst) {
            self.frame_loop
                .cancel_requested
                .store(true, Ordering::SeqCst);
            self.update_status(|status| {
                if let Some(frame_loop) = status.frame_loop.as_mut() {
                    frame_loop.cancel_requested = true;
                } else {
                    status.frame_loop = Some(InternalFrameLoopInfo {
                        is_active: true,
                        cancel_requested: true,
                        ..InternalFrameLoopInfo::default()
                    });
                }
            })
        } else {
            self.update_status(|status| {
                if let Some(frame_loop) = status.frame_loop.as_mut() {
                    frame_loop.is_active = false;
                    frame_loop.cancel_requested = false;
                }
            })
        }
    }

    pub fn unload_game(&self) -> Result<InternalRuntimeStatus, String> {
        self.ensure_frame_loop_inactive()?;
        let (environment_info, autosave_result) = {
            let mut loaded_host = self.host.lock().map_err(|_| {
                "No se pudo descargar la ROM del host Libretro interno.".to_string()
            })?;
            let host = loaded_host
                .as_mut()
                .ok_or_else(|| "No Libretro core is loaded.".to_string())?;

            if !host.is_initialized() {
                return Err("Libretro core must be initialized before unloading a ROM.".into());
            }

            let autosave_result = Self::autosave_sram_for_host(host)?;
            host.unload_game()?;
            (host.environment_info(), autosave_result)
        };

        reset_input_state();
        reset_video_state();
        reset_audio_state();
        self.update_status(|status| {
            status.phase = InternalRuntimePhase::CoreInitialized;
            status.environment_info = Some(environment_info);
            status.loaded_game = None;
            status.latest_frame = None;
            status.stepped_frames = 0;
            status.frame_loop = None;
            status.input_info = InternalInputInfo::default();
            status.audio_info = InternalAudioInfo::default();
            status.av_info = None;
            status.save_memory = Vec::new();
            status.last_save_operation = autosave_result;
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
        self.ensure_frame_loop_inactive()?;
        let autosave_result = self.autosave_sram_if_available()?;
        self.clear_host()?;
        reset_input_state();
        reset_video_state();
        reset_audio_state();
        self.update_status(|status| {
            status.phase = InternalRuntimePhase::Stopped;
            status.core_info = None;
            status.environment_info = None;
            status.loaded_game = None;
            status.latest_frame = None;
            status.stepped_frames = 0;
            status.frame_loop = None;
            status.input_info = InternalInputInfo::default();
            status.audio_info = InternalAudioInfo::default();
            status.av_info = None;
            status.save_memory = Vec::new();
            status.last_save_operation = autosave_result;
            status.is_core_loaded = false;
            status.is_core_initialized = false;
            status.is_rom_loaded = false;
            status.is_running = false;
            status.last_error = None;
        })
    }

    pub fn reset_idle(&self) -> Result<InternalRuntimeStatus, String> {
        self.ensure_frame_loop_inactive()?;
        let autosave_result = self.autosave_sram_if_available()?;
        self.clear_host()?;
        reset_input_state();
        reset_video_state();
        reset_audio_state();
        self.update_status(|status| {
            *status = InternalRuntimeStatus::default();
            status.last_save_operation = autosave_result;
        })
    }

    fn autosave_sram_if_available(&self) -> Result<Option<InternalSaveOperationResult>, String> {
        let mut loaded_host = self
            .host
            .lock()
            .map_err(|_| "No se pudo ejecutar autosave SRAM.".to_string())?;
        let Some(host) = loaded_host.as_mut() else {
            return Ok(None);
        };

        Self::autosave_sram_for_host(host)
    }

    fn autosave_sram_for_host(
        host: &mut LibretroHost,
    ) -> Result<Option<InternalSaveOperationResult>, String> {
        host.save_memory_to_disk_if_available(InternalSaveMemoryKind::SaveRam)
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
        av_info: Option<InternalSystemAvInfo>,
        audio_info: InternalAudioInfo,
        save_memory: Vec<InternalSaveMemoryInfo>,
    ) -> Result<InternalRuntimeStatus, String> {
        self.update_status(|status| {
            status.phase = InternalRuntimePhase::RomLoaded;
            status.environment_info = Some(environment_info);
            status.loaded_game = Some(loaded_game);
            status.latest_frame = None;
            status.stepped_frames = 0;
            status.frame_loop = None;
            status.input_info = InternalInputInfo::default();
            status.audio_info = audio_info;
            status.av_info = av_info;
            status.save_memory = save_memory;
            status.last_save_operation = None;
            status.is_core_loaded = true;
            status.is_core_initialized = true;
            status.is_rom_loaded = true;
            status.is_running = false;
            status.last_error = None;
        })
    }

    fn mark_frame_stepped(
        &self,
        frame_info: InternalFrameInfo,
        environment_info: InternalEnvironmentInfo,
        input_info: InternalInputInfo,
        audio_info: InternalAudioInfo,
    ) -> Result<InternalRuntimeStatus, String> {
        self.update_status(|status| {
            status.phase = InternalRuntimePhase::RomLoaded;
            status.environment_info = Some(environment_info);
            status.input_info = input_info;
            status.audio_info = audio_info;
            status.stepped_frames = frame_info.frame_number;
            status.latest_frame = Some(frame_info);
            status.is_core_loaded = true;
            status.is_core_initialized = true;
            status.is_rom_loaded = true;
            status.is_running = false;
            status.last_error = None;
        })
    }

    fn run_frame_loop_inner(
        &self,
        loop_config: &FrameLoopConfig,
    ) -> Result<
        (
            Option<InternalFrameInfo>,
            InternalEnvironmentInfo,
            InternalInputInfo,
            InternalAudioInfo,
            u64,
            bool,
        ),
        String,
    > {
        // The host lock is held for the bounded batch so lifecycle commands cannot
        // unload/deinit the core while `retro_run` is executing. Cancellation uses
        // atomics and does not need this lock.
        let mut loaded_host = self
            .host
            .lock()
            .map_err(|_| "No se pudo ejecutar el loop de frames Libretro.".to_string())?;
        let host = loaded_host
            .as_mut()
            .ok_or_else(|| "No Libretro core is loaded.".to_string())?;

        if !host.is_initialized() {
            return Err("Libretro core must be initialized before running a frame loop.".into());
        }

        if !host.is_game_loaded() {
            return Err("A ROM must be loaded before running a frame loop.".into());
        }

        self.mark_frame_loop_started(loop_config)?;

        let frame_duration = Duration::from_secs_f64(1.0 / loop_config.target_fps as f64);
        let mut latest_frame: Option<InternalFrameInfo> = None;
        let mut frames_run = 0_u64;
        let mut cancelled = false;

        for _ in 0..loop_config.max_frames {
            if self.frame_loop.cancel_requested.load(Ordering::SeqCst) {
                cancelled = true;
                break;
            }

            let frame_start = Instant::now();
            let frame_info = host.step_frame()?;
            let environment_info = host.environment_info();
            let input_info = input_info()?;
            let audio_info = audio_info()?;
            frames_run += 1;

            self.update_status(|status| {
                status.latest_frame = Some(frame_info.clone());
                status.stepped_frames = frame_info.frame_number;
                status.environment_info = Some(environment_info);
                status.input_info = input_info;
                status.audio_info = audio_info;
                status.is_running = true;
                if let Some(frame_loop) = status.frame_loop.as_mut() {
                    frame_loop.frames_run = frames_run;
                    frame_loop.cancel_requested =
                        self.frame_loop.cancel_requested.load(Ordering::SeqCst);
                }
            })?;

            latest_frame = Some(frame_info);

            let elapsed = frame_start.elapsed();
            if elapsed < frame_duration {
                thread::sleep(frame_duration - elapsed);
            }
        }

        if latest_frame.is_none() && !cancelled {
            return Err("No frames were executed by the frame loop.".into());
        }

        Ok((
            latest_frame,
            host.environment_info(),
            input_info()?,
            audio_info()?,
            frames_run,
            cancelled,
        ))
    }

    fn mark_frame_loop_started(
        &self,
        loop_config: &FrameLoopConfig,
    ) -> Result<InternalRuntimeStatus, String> {
        self.update_status(|status| {
            status.phase = InternalRuntimePhase::Running;
            status.is_running = true;
            status.last_error = None;
            status.frame_loop = Some(InternalFrameLoopInfo {
                is_active: true,
                cancel_requested: false,
                target_fps: Some(loop_config.target_fps),
                max_frames: Some(loop_config.max_frames),
                frames_run: 0,
                last_error: None,
            });
        })
    }

    fn mark_frame_loop_finished(
        &self,
        latest_frame: Option<InternalFrameInfo>,
        environment_info: InternalEnvironmentInfo,
        input_info: InternalInputInfo,
        audio_info: InternalAudioInfo,
        loop_config: &FrameLoopConfig,
        frames_run: u64,
        cancelled: bool,
    ) -> Result<InternalRuntimeStatus, String> {
        self.update_status(|status| {
            status.phase = InternalRuntimePhase::RomLoaded;
            status.environment_info = Some(environment_info);
            status.input_info = input_info;
            status.audio_info = audio_info;
            if let Some(latest_frame) = latest_frame {
                status.stepped_frames = latest_frame.frame_number;
                status.latest_frame = Some(latest_frame);
            }
            status.is_core_loaded = true;
            status.is_core_initialized = true;
            status.is_rom_loaded = true;
            status.is_running = false;
            status.last_error = None;
            status.frame_loop = Some(InternalFrameLoopInfo {
                is_active: false,
                cancel_requested: cancelled,
                target_fps: Some(loop_config.target_fps),
                max_frames: Some(loop_config.max_frames),
                frames_run,
                last_error: None,
            });
        })
    }

    fn mark_frame_loop_failed(
        &self,
        loop_config: &FrameLoopConfig,
        error: &str,
    ) -> Result<InternalRuntimeStatus, String> {
        self.update_status(|status| {
            status.phase = InternalRuntimePhase::RomLoaded;
            status.is_running = false;
            status.last_error = Some(error.to_string());
            let frames_run = status
                .frame_loop
                .as_ref()
                .map(|frame_loop| frame_loop.frames_run)
                .unwrap_or_default();
            status.frame_loop = Some(InternalFrameLoopInfo {
                is_active: false,
                cancel_requested: self.frame_loop.cancel_requested.load(Ordering::SeqCst),
                target_fps: Some(loop_config.target_fps),
                max_frames: Some(loop_config.max_frames),
                frames_run,
                last_error: Some(error.to_string()),
            });
        })
    }

    fn mark_save_operation(
        &self,
        result: InternalSaveOperationResult,
        save_memory: Vec<InternalSaveMemoryInfo>,
    ) -> Result<InternalRuntimeStatus, String> {
        self.update_status(|status| {
            status.save_memory = save_memory;
            status.last_save_operation = Some(result);
        })
    }

    fn ensure_save_memory_accessible(&self) -> Result<(), String> {
        if self.frame_loop.is_active.load(Ordering::SeqCst) {
            Err("Cannot access save memory while frame loop is active.".into())
        } else {
            Ok(())
        }
    }

    fn ensure_frame_loop_inactive(&self) -> Result<(), String> {
        if self.frame_loop.is_active.load(Ordering::SeqCst) {
            Err("Cannot change runtime lifecycle while frame loop is active.".into())
        } else {
            Ok(())
        }
    }

    fn clear_frame_loop_control(&self) {
        self.frame_loop.is_active.store(false, Ordering::SeqCst);
        self.frame_loop
            .cancel_requested
            .store(false, Ordering::SeqCst);
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

struct FrameLoopConfig {
    max_frames: u32,
    target_fps: u32,
}

fn validate_frame_loop_request(request: RunFrameLoopRequest) -> Result<FrameLoopConfig, String> {
    if request.max_frames == 0 {
        return Err("maxFrames must be greater than 0.".into());
    }

    if request.max_frames > MAX_FRAME_LOOP_FRAMES {
        return Err("maxFrames cannot exceed 600.".into());
    }

    let target_fps = request.target_fps.unwrap_or(DEFAULT_FRAME_LOOP_FPS);
    if !(1..=MAX_FRAME_LOOP_FPS).contains(&target_fps) {
        return Err("targetFps must be between 1 and 120.".into());
    }

    Ok(FrameLoopConfig {
        max_frames: request.max_frames,
        target_fps,
    })
}
