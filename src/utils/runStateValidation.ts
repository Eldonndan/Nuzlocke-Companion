import type {
  Badge,
  CaptureStatus,
  CaptureWindow,
  EmulatorConfig,
  PokemonSlot,
  Route,
  RunState,
  RuntimeConfig,
} from "../shared/types";
import type { BadgeIconKey } from "../shared/visualTypes";

const captureStatuses: CaptureStatus[] = [
  "available",
  "used",
  "failed",
  "not-applicable",
];

export function isRunState(value: unknown): value is RunState {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.platform === "string" &&
    optionalString(value.gameId) &&
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

export function isCaptureWindow(value: unknown): value is CaptureWindow {
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

export function isEmulatorConfig(value: unknown): value is EmulatorConfig {
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

export function isRuntimeConfig(value: unknown): value is RuntimeConfig {
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

export function isPokemonSlot(value: unknown): value is PokemonSlot {
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

export function isBadge(value: unknown): value is Badge {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (value.iconKey === undefined || isBadgeIconKey(value.iconKey)) &&
    optionalString(value.leaderName) &&
    optionalNumber(value.levelCap) &&
    typeof value.obtained === "boolean"
  );
}

export function isRoute(value: unknown): value is Route {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string"
  );
}

export function isCaptureStatus(value: unknown): value is CaptureStatus {
  return (
    typeof value === "string" &&
    captureStatuses.includes(value as CaptureStatus)
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBadgeIconKey(value: unknown): value is BadgeIconKey {
  return (
    typeof value === "string" &&
    [
      "rock",
      "water",
      "electric",
      "grass",
      "poison",
      "psychic",
      "fire",
      "earth",
      "flying",
      "bug",
      "normal",
      "ghost",
      "fighting",
      "steel",
      "ice",
      "dragon",
    ].includes(value)
  );
}

function optionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function optionalNumber(value: unknown) {
  return value === undefined || typeof value === "number";
}
