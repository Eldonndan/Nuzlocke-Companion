use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum InternalRuntimePhase {
    Idle,
    Prepared,
    CoreLoaded,
    CoreInitialized,
    RomLoaded,
    Running,
    Paused,
    Stopped,
    Error,
}

impl Default for InternalRuntimePhase {
    fn default() -> Self {
        Self::Idle
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InternalRuntimeStatus {
    pub phase: InternalRuntimePhase,
    pub core: Option<String>,
    pub core_path: Option<String>,
    pub rom_path: Option<String>,
    pub save_directory: Option<String>,
    pub core_info: Option<InternalCoreInfo>,
    pub is_core_loaded: bool,
    pub is_core_initialized: bool,
    pub is_rom_loaded: bool,
    pub is_running: bool,
    pub last_error: Option<String>,
}

impl Default for InternalRuntimeStatus {
    fn default() -> Self {
        Self {
            phase: InternalRuntimePhase::Idle,
            core: None,
            core_path: None,
            rom_path: None,
            save_directory: None,
            core_info: None,
            is_core_loaded: false,
            is_core_initialized: false,
            is_rom_loaded: false,
            is_running: false,
            last_error: None,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareInternalRuntimeRequest {
    pub core: String,
    pub core_path: String,
    pub rom_path: String,
    pub save_directory: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InternalCoreInfo {
    pub api_version: u32,
    pub library_name: Option<String>,
    pub library_version: Option<String>,
    pub valid_extensions: Option<String>,
    pub need_fullpath: bool,
    pub block_extract: bool,
}
