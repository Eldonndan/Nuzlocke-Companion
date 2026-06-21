use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use super::audio::{audio_info, clear_audio_buffer, drain_audio_chunk, reset_audio_state};
use super::input::{clear_joypad_buttons, input_info, reset_input_state, set_joypad_button};
use super::libretro_host::LibretroHost;
use super::types::{
    InternalAudioChunk, InternalAudioInfo, InternalCoreInfo, InternalEnvironmentInfo,
    InternalFrameInfo, InternalFrameLoopInfo, InternalFrameSnapshot, InternalFrameSnapshotBase64,
    InternalInputInfo, InternalLoadedGameInfo, InternalRuntimePhase, InternalRuntimeSessionInfo,
    InternalRuntimeStatus, InternalSaveMemoryInfo, InternalSaveMemoryKind,
    InternalSaveOperationResult, InternalSystemAvInfo, PrepareInternalRuntimeRequest,
    RunFrameLoopRequest, SetJoypadButtonRequest,
};
use super::video::{
    latest_frame_info, latest_frame_rgba_frame, latest_frame_snapshot_rgba,
    latest_frame_snapshot_rgba_base64, reset_video_state,
};

const MAX_FRAME_LOOP_FRAMES: u32 = 600;
const DEFAULT_FRAME_LOOP_FPS: u32 = 60;
const MAX_FRAME_LOOP_FPS: u32 = 120;

#[derive(Default)]
pub struct InternalEmulationState {
    status: Arc<Mutex<InternalRuntimeStatus>>,
    host: Arc<Mutex<Option<LibretroHost>>>,
    frame_loop: FrameLoopControl,
    session: Mutex<Option<RuntimeSessionHandle>>,
}

#[derive(Default)]
struct FrameLoopControl {
    is_active: AtomicBool,
    cancel_requested: AtomicBool,
}

struct RuntimeSessionHandle {
    stop_requested: Arc<AtomicBool>,
    pause_requested: Arc<AtomicBool>,
    frames_run: Arc<AtomicU64>,
    last_error: Arc<Mutex<Option<String>>>,
    target_fps: f64,
    join_handle: Option<JoinHandle<()>>,
}

impl InternalEmulationState {
    pub fn status(&self) -> Result<InternalRuntimeStatus, String> {
        self.cleanup_finished_session()?;
        self.status
            .lock()
            .map(|status| status.clone())
            .map_err(|_| "No se pudo leer el estado del runtime interno.".to_string())
    }

    pub fn latest_frame_snapshot(&self) -> Result<Option<InternalFrameSnapshot>, String> {
        latest_frame_snapshot_rgba()
    }

    pub fn latest_frame_snapshot_base64(&self) -> Result<InternalFrameSnapshotBase64, String> {
        latest_frame_snapshot_rgba_base64()?
            .ok_or_else(|| "No hay fotograma interno disponible.".to_string())
    }

    pub fn latest_frame_info(&self) -> Result<InternalFrameInfo, String> {
        latest_frame_info()?.ok_or_else(|| "No hay fotograma interno disponible.".to_string())
    }

    pub fn latest_frame_rgba_bytes(&self) -> Result<Vec<u8>, String> {
        let frame = latest_frame_rgba_frame()?
            .ok_or_else(|| "No hay fotograma interno renderizable.".to_string())?;
        Ok(frame.rgba)
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
        self.ensure_session_inactive("preparar una nueva configuracion")?;
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
            status.session_info = None;
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
        self.ensure_session_inactive("cargar un nuevo core")?;
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
            status.session_info = None;
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
        self.ensure_session_inactive("inicializar el core")?;
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
            status.session_info = None;
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
        self.ensure_session_inactive("desinicializar el core")?;
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
            status.session_info = None;
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
        self.ensure_session_inactive("cargar una ROM")?;
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
            (
                loaded_game,
                environment_info,
                av_info,
                audio_info,
                save_memory,
            )
        };

        reset_input_state();
        self.mark_game_loaded(
            loaded_game,
            environment_info,
            av_info,
            audio_info,
            save_memory,
        )
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
        self.ensure_session_allows_single_step()?;
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
        self.ensure_session_inactive("ejecutar batches debug")?;

        self.frame_loop
            .is_active
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map_err(|_| "Frame loop is already active.".to_string())?;
        self.frame_loop
            .cancel_requested
            .store(false, Ordering::SeqCst);

        let result = self.run_frame_loop_inner(&loop_config);
        let final_result = match result {
            Ok((latest_frame, environment_info, input_info, audio_info, frames_run, cancelled)) => {
                self.mark_frame_loop_finished(
                    latest_frame,
                    environment_info,
                    input_info,
                    audio_info,
                    &loop_config,
                    frames_run,
                    cancelled,
                )
            }
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

    pub fn start_session(&self) -> Result<InternalRuntimeStatus, String> {
        self.ensure_frame_loop_inactive()?;
        self.cleanup_finished_session()?;

        {
            let session = self
                .session
                .lock()
                .map_err(|_| "No se pudo leer la sesion interna.".to_string())?;
            if session.is_some() {
                return Err("La sesion interna ya esta activa.".into());
            }
        }

        let target_fps = {
            let loaded_host = self
                .host
                .lock()
                .map_err(|_| "No se pudo iniciar la sesion Libretro.".to_string())?;
            let host = loaded_host
                .as_ref()
                .ok_or_else(|| "No Libretro core is loaded.".to_string())?;

            if !host.is_initialized() {
                return Err("Libretro core must be initialized before starting.".into());
            }

            if !host.is_game_loaded() {
                return Err("A ROM must be loaded before starting.".into());
            }

            host.av_info()
                .map(|av_info| av_info.fps)
                .filter(|fps| fps.is_finite() && *fps > 0.0)
                .unwrap_or(60.0)
        };

        let stop_requested = Arc::new(AtomicBool::new(false));
        let pause_requested = Arc::new(AtomicBool::new(false));
        let frames_run = Arc::new(AtomicU64::new(0));
        let last_error = Arc::new(Mutex::new(None));
        let host = Arc::clone(&self.host);
        let status = Arc::clone(&self.status);
        let thread_stop_requested = Arc::clone(&stop_requested);
        let thread_pause_requested = Arc::clone(&pause_requested);
        let thread_frames_run = Arc::clone(&frames_run);
        let thread_last_error = Arc::clone(&last_error);

        let join_handle = thread::spawn(move || {
            run_native_session_loop(
                host,
                status,
                thread_stop_requested,
                thread_pause_requested,
                thread_frames_run,
                thread_last_error,
                target_fps,
            );
        });

        {
            let mut session = self
                .session
                .lock()
                .map_err(|_| "No se pudo guardar la sesion interna.".to_string())?;
            *session = Some(RuntimeSessionHandle {
                stop_requested,
                pause_requested,
                frames_run,
                last_error,
                target_fps,
                join_handle: Some(join_handle),
            });
        }

        self.update_status(|status| {
            status.phase = InternalRuntimePhase::Running;
            status.is_running = true;
            status.last_error = None;
            status.session_info = Some(InternalRuntimeSessionInfo {
                is_active: true,
                is_paused: false,
                target_fps,
                frames_run: 0,
                last_error: None,
            });
        })
    }

    pub fn pause_session(&self) -> Result<InternalRuntimeStatus, String> {
        self.cleanup_finished_session()?;
        let session_info = {
            let session = self
                .session
                .lock()
                .map_err(|_| "No se pudo pausar la sesion interna.".to_string())?;
            let Some(session) = session.as_ref() else {
                return Err("No hay sesion interna activa.".into());
            };
            session.pause_requested.store(true, Ordering::SeqCst);
            session.info(true)
        };

        self.update_status(|status| {
            status.phase = InternalRuntimePhase::Paused;
            status.is_running = false;
            status.session_info = Some(session_info);
            status.last_error = None;
        })
    }

    pub fn resume_session(&self) -> Result<InternalRuntimeStatus, String> {
        self.cleanup_finished_session()?;
        let session_info = {
            let session = self
                .session
                .lock()
                .map_err(|_| "No se pudo continuar la sesion interna.".to_string())?;
            let Some(session) = session.as_ref() else {
                return Err("No hay sesion interna activa.".into());
            };
            session.pause_requested.store(false, Ordering::SeqCst);
            session.info(true)
        };

        self.update_status(|status| {
            status.phase = InternalRuntimePhase::Running;
            status.is_running = true;
            status.session_info = Some(session_info);
            status.last_error = None;
        })
    }

    pub fn unload_game(&self) -> Result<InternalRuntimeStatus, String> {
        self.ensure_frame_loop_inactive()?;
        self.ensure_session_inactive("descargar la ROM")?;
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
            status.session_info = None;
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
        self.stop_session_if_active()?;
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
            status.session_info = None;
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
        self.ensure_session_inactive("resetear el runtime")?;
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
            status.session_info = None;
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
        } else if self.is_session_active()? {
            Err("Cannot access save memory while the internal session is active.".into())
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

    fn ensure_session_inactive(&self, action: &str) -> Result<(), String> {
        self.cleanup_finished_session()?;
        if self.is_session_active()? {
            Err(format!("Deten la sesion interna antes de {action}."))
        } else {
            Ok(())
        }
    }

    fn ensure_session_allows_single_step(&self) -> Result<(), String> {
        self.cleanup_finished_session()?;
        let session = self
            .session
            .lock()
            .map_err(|_| "No se pudo leer la sesion interna.".to_string())?;
        let Some(session) = session.as_ref() else {
            return Ok(());
        };

        if session.pause_requested.load(Ordering::SeqCst) {
            Ok(())
        } else {
            Err("Pausa la sesion interna antes de avanzar un frame manual.".into())
        }
    }

    fn is_session_active(&self) -> Result<bool, String> {
        self.session
            .lock()
            .map(|session| session.is_some())
            .map_err(|_| "No se pudo leer la sesion interna.".to_string())
    }

    fn cleanup_finished_session(&self) -> Result<(), String> {
        let mut finished_session = None;
        {
            let mut session = self
                .session
                .lock()
                .map_err(|_| "No se pudo limpiar la sesion interna.".to_string())?;
            let is_finished = session
                .as_ref()
                .and_then(|session| session.join_handle.as_ref())
                .is_some_and(JoinHandle::is_finished);

            if is_finished {
                finished_session = session.take();
            }
        }

        if let Some(mut session) = finished_session {
            if let Some(join_handle) = session.join_handle.take() {
                let _ = join_handle.join();
            }
            let session_info = session.info(false);
            self.update_status(|status| {
                status.is_running = false;
                if status.is_rom_loaded {
                    status.phase = InternalRuntimePhase::RomLoaded;
                }
                status.last_error = session_info.last_error.clone();
                status.session_info = Some(session_info);
            })?;
        }

        Ok(())
    }

    fn stop_session_if_active(&self) -> Result<(), String> {
        let mut active_session = {
            let mut session = self
                .session
                .lock()
                .map_err(|_| "No se pudo detener la sesion interna.".to_string())?;
            session.take()
        };

        if let Some(session) = active_session.as_ref() {
            session.stop_requested.store(true, Ordering::SeqCst);
        }

        if let Some(mut session) = active_session.take() {
            if let Some(join_handle) = session.join_handle.take() {
                join_handle
                    .join()
                    .map_err(|_| "La sesion interna termino de forma inesperada.".to_string())?;
            }
            let session_info = session.info(false);
            self.update_status(|status| {
                status.is_running = false;
                if status.is_rom_loaded {
                    status.phase = InternalRuntimePhase::RomLoaded;
                }
                status.last_error = session_info.last_error.clone();
                status.session_info = Some(session_info);
            })?;
        }

        Ok(())
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

impl RuntimeSessionHandle {
    fn info(&self, is_active: bool) -> InternalRuntimeSessionInfo {
        let last_error = self.last_error.lock().ok().and_then(|error| error.clone());

        InternalRuntimeSessionInfo {
            is_active,
            is_paused: is_active && self.pause_requested.load(Ordering::SeqCst),
            target_fps: self.target_fps,
            frames_run: self.frames_run.load(Ordering::SeqCst),
            last_error,
        }
    }
}

fn run_native_session_loop(
    host: Arc<Mutex<Option<LibretroHost>>>,
    status: Arc<Mutex<InternalRuntimeStatus>>,
    stop_requested: Arc<AtomicBool>,
    pause_requested: Arc<AtomicBool>,
    frames_run: Arc<AtomicU64>,
    last_error: Arc<Mutex<Option<String>>>,
    target_fps: f64,
) {
    let frame_duration = Duration::from_secs_f64(1.0 / target_fps.max(1.0));
    let mut next_frame_at = Instant::now();

    while !stop_requested.load(Ordering::SeqCst) {
        if pause_requested.load(Ordering::SeqCst) {
            update_session_status(
                &status,
                InternalRuntimePhase::Paused,
                false,
                true,
                target_fps,
                frames_run.load(Ordering::SeqCst),
                None,
            );
            thread::sleep(Duration::from_millis(8));
            next_frame_at = Instant::now();
            continue;
        }

        let frame_result = {
            match host.lock() {
                Ok(mut loaded_host) => {
                    let Some(host) = loaded_host.as_mut() else {
                        return set_session_error_and_break(
                            &status,
                            &last_error,
                            target_fps,
                            frames_run.load(Ordering::SeqCst),
                            "No Libretro core is loaded.".to_string(),
                        );
                    };
                    host.step_frame().map(|frame_info| {
                        let environment_info = host.environment_info();
                        let input_info = input_info();
                        let audio_info = audio_info();
                        (frame_info, environment_info, input_info, audio_info)
                    })
                }
                Err(_) => Err("No se pudo bloquear el host Libretro para la sesion.".to_string()),
            }
        };

        let (frame_info, environment_info, input_info, audio_info) = match frame_result {
            Ok((frame_info, environment_info, Ok(input_info), Ok(audio_info))) => {
                (frame_info, environment_info, input_info, audio_info)
            }
            Ok((_, _, Err(error), _)) | Ok((_, _, _, Err(error))) | Err(error) => {
                if let Ok(mut last_error) = last_error.lock() {
                    *last_error = Some(error.clone());
                }
                update_session_status(
                    &status,
                    InternalRuntimePhase::Error,
                    false,
                    false,
                    target_fps,
                    frames_run.load(Ordering::SeqCst),
                    Some(error),
                );
                break;
            }
        };

        let total_frames = frames_run.fetch_add(1, Ordering::SeqCst).saturating_add(1);
        if let Ok(mut status) = status.lock() {
            status.phase = InternalRuntimePhase::Running;
            status.environment_info = Some(environment_info);
            status.input_info = input_info;
            status.audio_info = audio_info;
            status.latest_frame = Some(frame_info.clone());
            status.stepped_frames = frame_info.frame_number;
            status.is_core_loaded = true;
            status.is_core_initialized = true;
            status.is_rom_loaded = true;
            status.is_running = true;
            status.last_error = None;
            status.session_info = Some(InternalRuntimeSessionInfo {
                is_active: true,
                is_paused: false,
                target_fps,
                frames_run: total_frames,
                last_error: None,
            });
        }

        next_frame_at += frame_duration;
        let now = Instant::now();
        if next_frame_at > now {
            thread::sleep(next_frame_at - now);
        } else {
            next_frame_at = now;
        }
    }
}

fn update_session_status(
    status: &Arc<Mutex<InternalRuntimeStatus>>,
    phase: InternalRuntimePhase,
    is_running: bool,
    is_paused: bool,
    target_fps: f64,
    frames_run: u64,
    error: Option<String>,
) {
    if let Ok(mut status) = status.lock() {
        status.phase = phase;
        status.is_running = is_running;
        status.last_error = error.clone();
        status.session_info = Some(InternalRuntimeSessionInfo {
            is_active: is_running || is_paused,
            is_paused,
            target_fps,
            frames_run,
            last_error: error,
        });
    }
}

fn set_session_error_and_break(
    status: &Arc<Mutex<InternalRuntimeStatus>>,
    last_error: &Arc<Mutex<Option<String>>>,
    target_fps: f64,
    frames_run: u64,
    error: String,
) {
    if let Ok(mut last_error) = last_error.lock() {
        *last_error = Some(error.clone());
    }
    update_session_status(
        status,
        InternalRuntimePhase::Error,
        false,
        false,
        target_fps,
        frames_run,
        Some(error),
    );
}
