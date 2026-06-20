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
    pub environment_info: Option<InternalEnvironmentInfo>,
    pub loaded_game: Option<InternalLoadedGameInfo>,
    pub latest_frame: Option<InternalFrameInfo>,
    pub stepped_frames: u64,
    pub frame_loop: Option<InternalFrameLoopInfo>,
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
            environment_info: None,
            loaded_game: None,
            latest_frame: None,
            stepped_frames: 0,
            frame_loop: None,
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

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunFrameLoopRequest {
    pub max_frames: u32,
    pub target_fps: Option<u32>,
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

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InternalEnvironmentInfo {
    pub pixel_format: Option<String>,
    pub system_directory: Option<String>,
    pub save_directory: Option<String>,
    pub content_directory: Option<String>,
    pub core_assets_directory: Option<String>,
    pub variable_count: usize,
    pub support_no_game: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InternalLoadedGameInfo {
    pub rom_path: String,
    pub extension: Option<String>,
    pub size_bytes: Option<u64>,
    pub loaded_with_fullpath: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InternalFrameInfo {
    pub frame_number: u64,
    pub width: u32,
    pub height: u32,
    pub pitch: usize,
    pub byte_len: usize,
    pub pixel_format: Option<String>,
    pub is_duplicate: bool,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InternalFrameLoopInfo {
    pub is_active: bool,
    pub cancel_requested: bool,
    pub target_fps: Option<u32>,
    pub max_frames: Option<u32>,
    pub frames_run: u64,
    pub last_error: Option<String>,
}
