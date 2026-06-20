use tauri::State;

use super::libretro_host::LibretroHost;
use super::state::InternalEmulationState;
use super::types::{InternalRuntimeStatus, PrepareInternalRuntimeRequest};

const NOT_IMPLEMENTED: &str = "Internal Libretro runtime is not implemented yet.";

#[tauri::command]
pub fn internal_runtime_get_status(
    state: State<'_, InternalEmulationState>,
) -> Result<InternalRuntimeStatus, String> {
    state.status()
}

#[tauri::command]
pub fn internal_runtime_prepare(
    state: State<'_, InternalEmulationState>,
    request: PrepareInternalRuntimeRequest,
) -> Result<InternalRuntimeStatus, String> {
    if request.core.trim().is_empty() {
        state.mark_error("El core del runtime interno no puede estar vacío.")?;
        return Err("El core del runtime interno no puede estar vacío.".into());
    }

    if request.core_path.trim().is_empty() {
        state.mark_error("La ruta del core interno no puede estar vacía.")?;
        return Err("La ruta del core interno no puede estar vacía.".into());
    }

    if request.rom_path.trim().is_empty() {
        state.mark_error("La ruta de la ROM no puede estar vacía.")?;
        return Err("La ruta de la ROM no puede estar vacía.".into());
    }

    state.prepare(request)
}

#[tauri::command]
pub fn internal_runtime_start(
    state: State<'_, InternalEmulationState>,
) -> Result<InternalRuntimeStatus, String> {
    let host = LibretroHost::new();
    let message = host.prepare().unwrap_err_or_not_implemented();
    state.mark_error(&message)?;
    Err(message)
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

trait NotImplementedResult {
    fn unwrap_err_or_not_implemented(self) -> String;
}

impl NotImplementedResult for Result<(), String> {
    fn unwrap_err_or_not_implemented(self) -> String {
        match self {
            Ok(()) => NOT_IMPLEMENTED.into(),
            Err(error) => error,
        }
    }
}
