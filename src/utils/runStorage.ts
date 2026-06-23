import type {
  Badge,
  CaptureWindow,
  CaptureStatus,
  EmulatorConfig,
  PokemonSlot,
  Route,
  RunState,
  RuntimeConfig,
} from "../shared/types";
import { migrateLegacyEmulatorConfig } from "./runtimeConfig";

const RUN_STORAGE_KEY = "nuzlocke-companion.current-run";
const captureStatuses: CaptureStatus[] = [
  "available",
  "used",
  "failed",
  "not-applicable",
];

export function cloneRunState(run: RunState): RunState {
  return {
    ...run,
    currentRoute: { ...run.currentRoute },
    captureWindow: run.captureWindow ? { ...run.captureWindow } : undefined,
    team: run.team.map((pokemon) => ({ ...pokemon })),
    badges: run.badges.map((badge) => ({ ...badge })),
  };
}

export function loadSavedRun(fallbackRun: RunState): RunState {
  try {
    const savedRun = window.localStorage.getItem(RUN_STORAGE_KEY);

    if (!savedRun) {
      return cloneRunState(fallbackRun);
    }

    const parsedRun: unknown = JSON.parse(savedRun);

    if (!isRunState(parsedRun)) {
      window.localStorage.removeItem(RUN_STORAGE_KEY);
      return cloneRunState(fallbackRun);
    }

    return cloneRunState(migrateLegacyEmulatorConfig(parsedRun));
  } catch {
    return cloneRunState(fallbackRun);
  }
}

export function saveRun(run: RunState) {
  window.localStorage.setItem(
    RUN_STORAGE_KEY,
    JSON.stringify(migrateLegacyEmulatorConfig(run)),
  );
}

export function hasSavedRun() {
  return window.localStorage.getItem(RUN_STORAGE_KEY) !== null;
}

export function clearSavedRun() {
  window.localStorage.removeItem(RUN_STORAGE_KEY);
}

function isRunState(value: unknown): value is RunState {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.platform === "string" &&
    optionalString(value.gamePackId) &&
    typeof value.gameName === "string" &&
    typeof value.challengeType === "string" &&
    (value.runtimeConfig === undefined || isRuntimeConfig(value.runtimeConfig)) &&
    (value.emulatorConfig === undefined || isEmulatorConfig(value.emulatorConfig)) &&
    (value.captureWindow === undefined || isCaptureWindow(value.captureWindow)) &&
    typeof value.lives === "number" &&
    typeof value.levelCap === "number" &&
    isRoute(value.currentRoute) &&
    isCaptureStatus(value.captureStatus) &&
    Array.isArray(value.team) &&
    value.team.every(isPokemonSlot) &&
    Array.isArray(value.badges) &&
    value.badges.every(isBadge)
  );
}

function isCaptureWindow(value: unknown): value is CaptureWindow {
  return (
    isRecord(value) &&
    typeof value.windowId === "string" &&
    typeof value.title === "string" &&
    typeof value.processId === "number" &&
    typeof value.width === "number" &&
    typeof value.height === "number" &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    typeof value.isVisible === "boolean"
  );
}

function isEmulatorConfig(value: unknown): value is EmulatorConfig {
  return (
    isRecord(value) &&
    (value.mode === undefined || value.mode === "legacy-external") &&
    (value.emulatorType === undefined || value.emulatorType === "mgba") &&
    (value.type === undefined || value.type === "mgba") &&
    typeof value.executablePath === "string" &&
    typeof value.romPath === "string" &&
    (value.launchArgs === undefined ||
      (Array.isArray(value.launchArgs) &&
        value.launchArgs.every((launchArg) => typeof launchArg === "string"))) &&
    optionalNumber(value.lastLaunchedProcessId)
  );
}

function isRuntimeConfig(value: unknown): value is RuntimeConfig {
  if (!isRecord(value)) {
    return false;
  }

  if (value.mode === "legacy-external") {
    return isEmulatorConfig(value);
  }

  return (
    value.mode === "internal-libretro" &&
    value.core === "mgba" &&
    typeof value.corePath === "string" &&
    typeof value.romPath === "string" &&
    optionalString(value.saveDirectory)
  );
}

function isPokemonSlot(value: unknown): value is PokemonSlot {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.nickname === "string" &&
    optionalString(value.species) &&
    optionalNumber(value.level) &&
    optionalString(value.avatarLabel) &&
    (optionalString(value.spriteUrl) || value.spriteUrl === null)
  );
}

function isBadge(value: unknown): value is Badge {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    optionalString(value.leaderName) &&
    optionalNumber(value.levelCap) &&
    typeof value.obtained === "boolean"
  );
}

function isRoute(value: unknown): value is Route {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string"
  );
}

function isCaptureStatus(value: unknown): value is CaptureStatus {
  return (
    typeof value === "string" &&
    captureStatuses.includes(value as CaptureStatus)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function optionalNumber(value: unknown) {
  return value === undefined || typeof value === "number";
}
