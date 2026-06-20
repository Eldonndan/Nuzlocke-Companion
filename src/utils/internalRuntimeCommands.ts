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

export type InternalRuntimeStatus = {
  phase: InternalRuntimePhase;
  core?: string | null;
  corePath?: string | null;
  romPath?: string | null;
  saveDirectory?: string | null;
  coreInfo?: InternalCoreInfo | null;
  environmentInfo?: InternalEnvironmentInfo | null;
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
