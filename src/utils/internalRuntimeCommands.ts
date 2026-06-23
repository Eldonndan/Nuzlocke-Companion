import { invoke } from "@tauri-apps/api/core";

export type InternalRuntimePhase =
  | "idle"
  | "prepared"
  | "core-loaded"
  | "core-initialized"
  | "rom-loaded"
  | "running"
  | "paused"
  | "stopped"
  | "error";

export type InternalCoreInfo = {
  apiVersion: number;
  libraryName?: string | null;
  libraryVersion?: string | null;
  validExtensions?: string | null;
  needFullpath: boolean;
  blockExtract: boolean;
};

export type InternalEnvironmentInfo = {
  pixelFormat?: string | null;
  systemDirectory?: string | null;
  saveDirectory?: string | null;
  contentDirectory?: string | null;
  coreAssetsDirectory?: string | null;
  variableCount: number;
  supportNoGame: boolean;
};

export type InternalLoadedGameInfo = {
  romPath: string;
  extension?: string | null;
  sizeBytes?: number | null;
  loadedWithFullpath: boolean;
};

export type InternalFrameInfo = {
  frameNumber: number;
  width: number;
  height: number;
  pitch: number;
  byteLen: number;
  pixelFormat?: string | null;
  isDuplicate: boolean;
};

export type InternalFrameSnapshot = {
  info: InternalFrameInfo;
  width: number;
  height: number;
  rgba: number[];
  rgbaByteLen: number;
};

export type InternalFrameSnapshotBase64 = {
  info: InternalFrameInfo;
  width: number;
  height: number;
  rgbaBase64: string;
  rgbaByteLen: number;
};

export type InternalJoypadButton =
  | "a"
  | "b"
  | "start"
  | "select"
  | "up"
  | "down"
  | "left"
  | "right"
  | "l"
  | "r"
  | "x"
  | "y";

export type SetJoypadButtonRequest = {
  button: InternalJoypadButton;
  pressed: boolean;
};

export type InternalInputInfo = {
  pressedButtons: InternalJoypadButton[];
  pollCount: number;
  stateQueryCount: number;
};

export type InternalSaveMemoryKind = "save-ram" | "rtc";

export type InternalSaveMemoryInfo = {
  kind: InternalSaveMemoryKind;
  sizeBytes: number;
  filePath?: string | null;
  existsOnDisk: boolean;
};

export type InternalSaveOperationResult = {
  kind: InternalSaveMemoryKind;
  sizeBytes: number;
  filePath: string;
  loaded: boolean;
  saved: boolean;
  message: string;
};

export type RunFrameLoopRequest = {
  maxFrames: number;
  targetFps?: number | null;
};

export type InternalFrameLoopInfo = {
  isActive: boolean;
  cancelRequested: boolean;
  targetFps?: number | null;
  maxFrames?: number | null;
  framesRun: number;
  lastError?: string | null;
};

export type InternalRuntimeSessionInfo = {
  isActive: boolean;
  isPaused: boolean;
  targetFps: number;
  framesRun: number;
  lastError?: string | null;
};

export type InternalAudioInfo = {
  sampleRate: number;
  bufferedFrames: number;
  totalFramesCaptured: number;
  totalFramesDrained: number;
  droppedFrames: number;
};

export type InternalAudioChunk = {
  sampleRate: number;
  channels: number;
  frames: number;
  samples: number[];
};

export type InternalSystemAvInfo = {
  fps: number;
  sampleRate: number;
  baseWidth: number;
  baseHeight: number;
  maxWidth: number;
  maxHeight: number;
  aspectRatio: number;
};

export type InternalRuntimeStatus = {
  phase: InternalRuntimePhase;
  core?: string | null;
  corePath?: string | null;
  romPath?: string | null;
  saveDirectory?: string | null;
  coreInfo?: InternalCoreInfo | null;
  environmentInfo?: InternalEnvironmentInfo | null;
  loadedGame?: InternalLoadedGameInfo | null;
  latestFrame?: InternalFrameInfo | null;
  steppedFrames: number;
  frameLoop?: InternalFrameLoopInfo | null;
  sessionInfo?: InternalRuntimeSessionInfo | null;
  inputInfo: InternalInputInfo;
  audioInfo: InternalAudioInfo;
  avInfo?: InternalSystemAvInfo | null;
  saveMemory: InternalSaveMemoryInfo[];
  lastSaveOperation?: InternalSaveOperationResult | null;
  isCoreLoaded: boolean;
  isCoreInitialized: boolean;
  isRomLoaded: boolean;
  isRunning: boolean;
  lastError?: string | null;
};

export type PrepareInternalRuntimeRequest = {
  core: "mgba" | string;
  corePath: string;
  romPath: string;
  saveDirectory?: string;
};

export function getInternalRuntimeStatus() {
  return invoke<InternalRuntimeStatus>("internal_runtime_get_status");
}

export function getLatestInternalRuntimeFrameSnapshot() {
  return invoke<InternalFrameSnapshot | null>(
    "internal_runtime_get_latest_frame_snapshot",
  );
}

export function getLatestInternalRuntimeFrameSnapshotBase64() {
  return invoke<InternalFrameSnapshotBase64>(
    "internal_runtime_get_latest_frame_snapshot_base64",
  );
}

export function getLatestInternalRuntimeFrameInfo() {
  return invoke<InternalFrameInfo>("internal_runtime_get_latest_frame_info");
}

export function getLatestInternalRuntimeFrameRgbaBytes() {
  return invoke<ArrayBuffer>("internal_runtime_get_latest_frame_rgba_bytes");
}

export function drainInternalRuntimeAudioChunk(maxFrames = 4096) {
  return invoke<InternalAudioChunk>("internal_runtime_drain_audio_chunk", {
    maxFrames,
  });
}

export function clearInternalRuntimeAudioBuffer() {
  return invoke<InternalRuntimeStatus>("internal_runtime_clear_audio_buffer");
}

export function prepareInternalRuntime(request: PrepareInternalRuntimeRequest) {
  return invoke<InternalRuntimeStatus>("internal_runtime_prepare", {
    request,
  });
}

export function loadInternalRuntimeCore() {
  return invoke<InternalRuntimeStatus>("internal_runtime_load_core");
}

export function initInternalRuntimeCore() {
  return invoke<InternalRuntimeStatus>("internal_runtime_init_core");
}

export function deinitInternalRuntimeCore() {
  return invoke<InternalRuntimeStatus>("internal_runtime_deinit_core");
}

export function loadInternalRuntimeGame() {
  return invoke<InternalRuntimeStatus>("internal_runtime_load_game");
}

export function unloadInternalRuntimeGame() {
  return invoke<InternalRuntimeStatus>("internal_runtime_unload_game");
}

export function stepInternalRuntimeFrame() {
  return invoke<InternalRuntimeStatus>("internal_runtime_step_frame");
}

export function runInternalRuntimeFrameLoop(request: RunFrameLoopRequest) {
  return invoke<InternalRuntimeStatus>("internal_runtime_run_frame_loop", {
    request,
  });
}

export function cancelInternalRuntimeFrameLoop() {
  return invoke<InternalRuntimeStatus>("internal_runtime_cancel_frame_loop");
}

export function setInternalRuntimeJoypadButton(
  request: SetJoypadButtonRequest,
) {
  return invoke<InternalRuntimeStatus>("internal_runtime_set_joypad_button", {
    request,
  });
}

export function clearInternalRuntimeJoypadButtons() {
  return invoke<InternalRuntimeStatus>("internal_runtime_clear_joypad_buttons");
}

export function refreshInternalRuntimeSaveMemoryInfo() {
  return invoke<InternalRuntimeStatus>(
    "internal_runtime_refresh_save_memory_info",
  );
}

export function saveInternalRuntimeMemoryToDisk(
  kind: InternalSaveMemoryKind = "save-ram",
) {
  return invoke<InternalRuntimeStatus>("internal_runtime_save_memory_to_disk", {
    kind,
  });
}

export function loadInternalRuntimeSaveMemoryFromDisk(
  kind: InternalSaveMemoryKind = "save-ram",
) {
  return invoke<InternalRuntimeStatus>(
    "internal_runtime_load_save_memory_from_disk",
    { kind },
  );
}

export function startInternalRuntime() {
  return invoke<InternalRuntimeStatus>("internal_runtime_start");
}

export function pauseInternalRuntime() {
  return invoke<InternalRuntimeStatus>("internal_runtime_pause");
}

export function resumeInternalRuntime() {
  return invoke<InternalRuntimeStatus>("internal_runtime_resume");
}

export function stopInternalRuntime() {
  return invoke<InternalRuntimeStatus>("internal_runtime_stop");
}

export function resetInternalRuntime() {
  return invoke<InternalRuntimeStatus>("internal_runtime_reset");
}
