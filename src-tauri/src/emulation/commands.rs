use tauri::State;

use super::libretro_host::{LibretroHost, LibretroHostConfig};
use super::state::InternalEmulationState;
use super::types::{
    InternalAudioChunk, InternalFrameSnapshot, InternalRuntimeStatus, InternalSaveMemoryKind,
    PrepareInternalRuntimeRequest, RunFrameLoopRequest, SetJoypadButtonRequest,
};

const NOT_IMPLEMENTED: &str = "Internal Libretro runtime is not implemented yet.";

#[tauri::command]
pub fn internal_runtime_get_status(
    state: State<'_, InternalEmulationState>,
) -> Result<InternalRuntimeStatus, String> {
    state.status()
}

#[tauri::command]
pub fn internal_runtime_get_latest_frame_snapshot(
    state: State<'_, InternalEmulationState>,
) -> Result<Option<InternalFrameSnapshot>, String> {
    state.latest_frame_snapshot()
}

#[tauri::command]
pub fn internal_runtime_drain_audio_chunk(
    state: State<'_, InternalEmulationState>,
    max_frames: Option<usize>,
) -> Result<InternalAudioChunk, String> {
    state.drain_audio_chunk(max_frames)
}

#[tauri::command]
pub fn internal_runtime_clear_audio_buffer(
    state: State<'_, InternalEmulationState>,
) -> Result<InternalRuntimeStatus, String> {
    state.clear_audio_buffer()
}

#[tauri::command]
pub fn internal_runtime_prepare(
    state: State<'_, InternalEmulationState>,
    request: PrepareInternalRuntimeRequest,
) -> Result<InternalRuntimeStatus, String> {
    if request.core.trim().is_empty() {
        state.mark_error("Internal runtime core cannot be empty.")?;
        return Err("Internal runtime core cannot be empty.".into());
    }

    if request.core_path.trim().is_empty() {
        state.mark_error("Internal core path cannot be empty.")?;
        return Err("Internal core path cannot be empty.".into());
    }

    if request.rom_path.trim().is_empty() {
        state.mark_error("ROM path cannot be empty.")?;
        return Err("ROM path cannot be empty.".into());
    }

    state.prepare(request)
}

#[tauri::command]
pub fn internal_runtime_load_core(
    state: State<'_, InternalEmulationState>,
) -> Result<InternalRuntimeStatus, String> {
    let status = state.status()?;
    let Some(core_path) = status.core_path.as_deref().map(str::trim) else {
        let message = "Internal core path is not prepared.";
        state.mark_error(message)?;
        return Err(message.into());
    };

    if core_path.is_empty() {
        let message = "Internal core path cannot be empty.";
        state.mark_error(message)?;
        return Err(message.into());
    }

    let rom_path = status.rom_path.clone().unwrap_or_default();
    match LibretroHost::load_core(LibretroHostConfig {
        core_path: core_path.to_string(),
        rom_path,
        save_directory: status.save_directory.clone(),
    }) {
        Ok(host) => {
            let core_info = host.core_info();
            let environment_info = host.environment_info();
            state.mark_core_loaded(host, core_info, environment_info)
        }
        Err(error) => {
            state.mark_error(&error)?;
            Err(error)
        }
    }
}

#[tauri::command]
pub fn internal_runtime_init_core(
    state: State<'_, InternalEmulationState>,
) -> Result<InternalRuntimeStatus, String> {
    match state.init_loaded_core() {
        Ok(status) => Ok(status),
        Err(error) => {
            state.mark_error(&error)?;
            Err(error)
        }
    }
}

#[tauri::command]
pub fn internal_runtime_deinit_core(
    state: State<'_, InternalEmulationState>,
) -> Result<InternalRuntimeStatus, String> {
    match state.deinit_loaded_core() {
        Ok(status) => Ok(status),
        Err(error) => {
            state.mark_error(&error)?;
            Err(error)
        }
    }
}

#[tauri::command]
pub fn internal_runtime_load_game(
    state: State<'_, InternalEmulationState>,
) -> Result<InternalRuntimeStatus, String> {
    match state.load_game() {
        Ok(status) => Ok(status),
        Err(error) => {
            state.mark_error(&error)?;
            Err(error)
        }
    }
}

#[tauri::command]
pub fn internal_runtime_unload_game(
    state: State<'_, InternalEmulationState>,
) -> Result<InternalRuntimeStatus, String> {
    match state.unload_game() {
        Ok(status) => Ok(status),
        Err(error) => {
            state.mark_error(&error)?;
            Err(error)
        }
    }
}

#[tauri::command]
pub fn internal_runtime_step_frame(
    state: State<'_, InternalEmulationState>,
) -> Result<InternalRuntimeStatus, String> {
    match state.step_frame() {
        Ok(status) => Ok(status),
        Err(error) => {
            state.mark_error(&error)?;
            Err(error)
        }
    }
}

#[tauri::command]
pub fn internal_runtime_run_frame_loop(
    state: State<'_, InternalEmulationState>,
    request: RunFrameLoopRequest,
) -> Result<InternalRuntimeStatus, String> {
    match state.run_frame_loop(request) {
        Ok(status) => Ok(status),
        Err(error) => {
            state.mark_error(&error)?;
            Err(error)
        }
    }
}

#[tauri::command]
pub fn internal_runtime_cancel_frame_loop(
    state: State<'_, InternalEmulationState>,
) -> Result<InternalRuntimeStatus, String> {
    state.cancel_frame_loop()
}

#[tauri::command]
pub fn internal_runtime_set_joypad_button(
    state: State<'_, InternalEmulationState>,
    request: SetJoypadButtonRequest,
) -> Result<InternalRuntimeStatus, String> {
    state.set_joypad_button(request)
}

#[tauri::command]
pub fn internal_runtime_clear_joypad_buttons(
    state: State<'_, InternalEmulationState>,
) -> Result<InternalRuntimeStatus, String> {
    state.clear_joypad_buttons()
}

#[tauri::command]
pub fn internal_runtime_refresh_save_memory_info(
    state: State<'_, InternalEmulationState>,
) -> Result<InternalRuntimeStatus, String> {
    match state.save_memory_info() {
        Ok(status) => Ok(status),
        Err(error) => {
            state.mark_error(&error)?;
            Err(error)
        }
    }
}

#[tauri::command]
pub fn internal_runtime_save_memory_to_disk(
    state: State<'_, InternalEmulationState>,
    kind: InternalSaveMemoryKind,
) -> Result<InternalRuntimeStatus, String> {
    match state.save_memory_to_disk(kind) {
        Ok(status) => Ok(status),
        Err(error) => {
            state.mark_error(&error)?;
            Err(error)
        }
    }
}

#[tauri::command]
pub fn internal_runtime_load_save_memory_from_disk(
    state: State<'_, InternalEmulationState>,
    kind: InternalSaveMemoryKind,
) -> Result<InternalRuntimeStatus, String> {
    match state.load_save_memory_from_disk(kind) {
        Ok(status) => Ok(status),
        Err(error) => {
            state.mark_error(&error)?;
            Err(error)
        }
    }
}

#[tauri::command]
pub fn internal_runtime_start(
    state: State<'_, InternalEmulationState>,
) -> Result<InternalRuntimeStatus, String> {
    state.mark_error(NOT_IMPLEMENTED)?;
    Err(NOT_IMPLEMENTED.into())
}

#[tauri::command]
pub fn internal_runtime_pause(
    state: State<'_, InternalEmulationState>,
) -> Result<InternalRuntimeStatus, String> {
    state.mark_error(NOT_IMPLEMENTED)?;
    Err(NOT_IMPLEMENTED.into())
}

#[tauri::command]
pub fn internal_runtime_resume(
    state: State<'_, InternalEmulationState>,
) -> Result<InternalRuntimeStatus, String> {
    state.mark_error(NOT_IMPLEMENTED)?;
    Err(NOT_IMPLEMENTED.into())
}

#[tauri::command]
pub fn internal_runtime_stop(
    state: State<'_, InternalEmulationState>,
) -> Result<InternalRuntimeStatus, String> {
    state.stop()
}

#[tauri::command]
pub fn internal_runtime_reset(
    state: State<'_, InternalEmulationState>,
) -> Result<InternalRuntimeStatus, String> {
    state.reset_idle()
}
