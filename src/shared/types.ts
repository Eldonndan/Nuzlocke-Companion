export type AppScreen = "home" | "create-run" | "play";

export type CaptureStatus = "available" | "used" | "failed" | "not-applicable";

export type EmulatorType = "mgba";

export type RuntimeMode = "legacy-external" | "internal-libretro";

export type LegacyExternalRuntimeConfig = {
  mode: "legacy-external";
  emulatorType: EmulatorType;
  executablePath: string;
  romPath: string;
  launchArgs?: string[];
  lastLaunchedProcessId?: number;
  /** @deprecated Old saved runs used `type`; prefer `emulatorType`. */
  type?: EmulatorType;
};

export type InternalLibretroRuntimeConfig = {
  mode: "internal-libretro";
  core: "mgba";
  corePath: string;
  romPath: string;
  saveDirectory?: string;
};

export type RuntimeConfig =
  | LegacyExternalRuntimeConfig
  | InternalLibretroRuntimeConfig;

/** @deprecated Use LegacyExternalRuntimeConfig or RuntimeConfig instead. */
export type EmulatorConfig = LegacyExternalRuntimeConfig;

export type EmulatorLaunchResult = {
  processId: number | null;
};

export type CaptureWindow = {
  windowId: string;
  title: string;
  processId: number;
  width: number;
  height: number;
  x: number;
  y: number;
  isVisible: boolean;
};

export type CapturedFrame = {
  imageDataUrl: string;
  width: number;
  height: number;
  capturedAt: number;
};

export type LiveCaptureFrame = {
  rgbaData: string;
  width: number;
  height: number;
  capturedAt: number;
};

export type CaptureSessionStatus = {
  isActive: boolean;
  engine: string;
  windowId?: string | null;
  requestedFps?: number | null;
  effectiveFps: number;
  framesCaptured: number;
  lastFrameAt?: number | null;
  lastError?: string | null;
};

export type HostRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  coordinateSpace: "screen" | "window-client";
};

export type DockedWindowInfo = {
  windowId: string;
  previousParent?: string | null;
  previousStyle: number;
  previousExStyle: number;
  x: number;
  y: number;
  width: number;
  height: number;
  isDocked: boolean;
};

export type OverlayAction =
  | { type: "decrease-lives" }
  | { type: "increase-lives" }
  | { type: "cycle-capture-status" }
  | { type: "set-route"; routeName: string }
  | { type: "set-level-cap"; levelCap: number }
  | { type: "close-edit-mode" }
  | { type: "restore-main-window" };

export type PokemonSlot = {
  id: string;
  nickname: string;
  species?: string;
  level?: number;
  avatarLabel?: string;
  spriteUrl?: string | null;
};

export type Badge = {
  id: string;
  name: string;
  leaderName?: string;
  levelCap?: number;
  obtained: boolean;
};

export type Route = {
  id: string;
  name: string;
};

export type RunState = {
  id: string;
  name: string;
  platform: string;
  gameId?: string;
  gamePackId?: string;
  gameName: string;
  challengeType: string;
  runtimeConfig?: RuntimeConfig;
  /** @deprecated Use runtimeConfig instead. */
  emulatorConfig?: EmulatorConfig;
  captureWindow?: CaptureWindow;
  lives: number;
  levelCap: number;
  currentRoute: Route;
  captureStatus: CaptureStatus;
  team: PokemonSlot[];
  badges: Badge[];
};
