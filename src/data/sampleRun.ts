import type { Badge, PokemonSlot, Route, RunState } from "../shared/types";
import { createBadgesFromGamePack, getGamePackByGameName } from "./gamePacks";

const fireRedPack = getGamePackByGameName("Pokémon FireRed");

const team: PokemonSlot[] = [
  {
    id: "team-01",
    nickname: "Brasa",
    species: "Charmeleon",
    level: 21,
    avatarLabel: "🔥",
    spriteUrl: null,
  },
  {
    id: "team-02",
    nickname: "Nube",
    species: "Pidgeotto",
    level: 20,
    avatarLabel: "🪽",
    spriteUrl: null,
  },
  {
    id: "team-03",
    nickname: "Chispa",
    species: "Pikachu",
    level: 18,
    avatarLabel: "⚡",
    spriteUrl: null,
  },
  {
    id: "team-04",
    nickname: "Roca",
    species: "Geodude",
    level: 19,
    avatarLabel: "⛰️",
    spriteUrl: null,
  },
  {
    id: "team-05",
    nickname: "Brotes",
    species: "Oddish",
    level: 17,
    avatarLabel: "🌿",
    spriteUrl: null,
  },
  {
    id: "team-06",
    nickname: "",
    species: "Sin asignar",
    avatarLabel: "＋",
    spriteUrl: null,
  },
];

const badges: Badge[] = fireRedPack
  ? createBadgesFromGamePack(fireRedPack).map((badge, index) => ({
      ...badge,
      obtained: index < 2,
    }))
  : [];

const currentRoute: Route = {
  id: "route-24",
  name: "Ruta 24",
};

export const sampleRun: RunState = {
  id: "firered-hardcore-sample",
  name: "Nueva run",
  platform: "GBA",
  gamePackId: fireRedPack?.id,
  gameName: "Pokémon FireRed",
  challengeType: "Hardcore Nuzlocke",
  runtimeConfig: {
    mode: "legacy-external",
    emulatorType: "mgba",
    executablePath: "",
    romPath: "",
    launchArgs: [],
  },
  lives: 4,
  levelCap: 21,
  currentRoute,
  captureStatus: "available",
  team,
  badges,
};
