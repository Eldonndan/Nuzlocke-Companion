import {
  createBadgesFromGamePack,
  getGamePackByGameName,
} from "../data/gamePacks";
import type {
  Badge,
  PokemonSlot,
  RunState,
  RuntimeConfig,
} from "../shared/types";
import {
  createDefaultInternalLibretroRuntimeConfig,
  normalizeInternalLibretroRuntimeConfig,
  normalizeLegacyExternalRuntimeConfig,
} from "./runtimeConfig";

export type CreateRunValues = {
  name: string;
  platform: string;
  gameName: string;
  challengeType: string;
  emulatorPath?: string;
  romPath?: string;
  launchArgs?: string[];
  runtimeConfig?: RuntimeConfig;
  lives: number;
  routeName: string;
  levelCap: number;
};

export function createRunState(values: CreateRunValues): RunState {
  const gamePack = getGamePackByGameName(values.gameName);

  return {
    id: createRunId(),
    name: values.name.trim(),
    platform: values.platform,
    gamePackId: gamePack?.id,
    gameName: values.gameName,
    challengeType: values.challengeType,
    runtimeConfig: values.runtimeConfig
      ? values.runtimeConfig.mode === "legacy-external"
        ? normalizeLegacyExternalRuntimeConfig(values.runtimeConfig)
        : normalizeInternalLibretroRuntimeConfig(values.runtimeConfig)
      : createDefaultInternalLibretroRuntimeConfig(),
    lives: values.lives,
    levelCap: values.levelCap,
    currentRoute: {
      id: "current-route",
      name: values.routeName.trim() || "Ruta inicial",
    },
    captureStatus: "available",
    team: createEmptyTeam(),
    badges: gamePack ? createBadgesFromGamePack(gamePack) : createLockedBadges(),
  };
}

function createEmptyTeam(): PokemonSlot[] {
  return Array.from({ length: 6 }, (_, index) => ({
    id: `team-${index + 1}`,
    nickname: "",
    species: "Sin asignar",
    avatarLabel: "＋",
    spriteUrl: null,
  }));
}

function createLockedBadges(): Badge[] {
  return Array.from({ length: 8 }, (_, index) => ({
    id: `badge-${index + 1}`,
    name: `Medalla ${index + 1}`,
    obtained: false,
  }));
}

function createRunId() {
  if ("crypto" in window && "randomUUID" in window.crypto) {
    return window.crypto.randomUUID();
  }

  return `run-${Date.now()}`;
}
