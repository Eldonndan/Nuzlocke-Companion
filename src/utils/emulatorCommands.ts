import { invoke } from "@tauri-apps/api/core";
import type {
  CapturedFrame,
  CaptureSessionStatus,
  CaptureWindow,
  DockedWindowInfo,
  EmulatorLaunchResult,
  HostRect,
} from "../shared/types";

// Legacy external runtime commands. These invoke the current mGBA process,
// overlay, docking, and capture bridge while internal Libretro remains future work.

export function selectEmulatorExecutable() {
  return invoke<string | null>("select_emulator_executable");
}

export function selectLibretroCoreFile() {
  return invoke<string | null>("select_libretro_core_file");
}

export function selectRomFile() {
  return invoke<string | null>("select_rom_file");
}

export function selectSaveDirectory() {
  return invoke<string | null>("select_save_directory");
}

export function launchEmulator(
  emulatorPath: string,
  romPath: string,
  launchArgs?: string[],
) {
  return invoke<EmulatorLaunchResult>("launch_emulator", {
    emulatorPath,
    romPath,
    launchArgs,
  });
}

export function detectEmulatorWindow(processId: number) {
  return invoke<CaptureWindow>("detect_emulator_window", {
    processId,
  });
}

export function findMgbaWindows() {
  return invoke<CaptureWindow[]>("find_mgba_windows");
}

export function captureWindowFrame(windowId: string) {
  return invoke<CapturedFrame>("capture_window_frame", {
    windowId,
  });
}

export function startCaptureSession(windowId: string, fps: number) {
  return invoke<CaptureSessionStatus>("start_capture_session", {
    windowId,
    fps,
  });
}

export function stopCaptureSession() {
  return invoke<CaptureSessionStatus>("stop_capture_session");
}

export function getCaptureStatus() {
  return invoke<CaptureSessionStatus>("get_capture_status");
}

export function showOverlay() {
  return invoke<void>("show_overlay");
}

export function hideOverlay() {
  return invoke<void>("hide_overlay");
}

export function setOverlayClickThrough(enabled: boolean) {
  return invoke<void>("set_overlay_click_through", {
    enabled,
  });
}

export function positionOverlayWindow(
  x: number,
  y: number,
  width: number,
  height: number,
) {
  return invoke<void>("position_overlay_window", {
    x,
    y,
    width,
    height,
  });
}

export function positionEmulatorWindow(
  windowId: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  return invoke<void>("position_emulator_window", {
    windowId,
    x,
    y,
    width,
    height,
  });
}

export function focusEmulatorWindow(windowId: string) {
  return invoke<void>("focus_emulator_window", {
    windowId,
  });
}

export function minimizeMainWindow() {
  return invoke<void>("minimize_main_window");
}

export function showMainWindow() {
  return invoke<void>("show_main_window");
}

export function focusMainWindow() {
  return invoke<void>("focus_main_window");
}

export function dockEmulatorWindow(windowId: string, hostRect: HostRect) {
  return invoke<DockedWindowInfo>("dock_emulator_window", {
    windowId,
    hostRect,
  });
}

export function resizeDockedEmulator(windowId: string, hostRect: HostRect) {
  return invoke<void>("resize_docked_emulator", {
    windowId,
    hostRect,
  });
}

export function undockEmulatorWindow(windowId: string) {
  return invoke<void>("undock_emulator_window", {
    windowId,
  });
}
