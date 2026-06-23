import type { Badge, PokemonSlot, Route, RunState } from "../shared/types";

const emptyTeam: PokemonSlot[] = Array.from({ length: 6 }, (_, index) => ({
  id: `slot-${index + 1}`,
  nickname: "",
  spriteUrl: null,
}));

const starterBadges: Badge[] = Array.from({ length: 8 }, (_, index) => ({
  id: `badge-${index + 1}`,
  name: `Medalla ${index + 1}`,
  obtained: false,
}));

const starterRoute: Route = {
  id: "route-current",
  name: "Elige una ruta",
};

export function createInitialRunState(): RunState {
  return {
    id: "local-preview-run",
    name: "Nueva run Nuzlocke",
    platform: "GBA",
    gameName: "Juego no seleccionado",
    challengeType: "Nuzlocke estándar",
    runtimeConfig: {
      mode: "legacy-external",
      emulatorType: "mgba",
      executablePath: "",
      romPath: "",
      launchArgs: [],
    },
    lives: 4,
    levelCap: 5,
    currentRoute: starterRoute,
    captureStatus: "available",
    team: emptyTeam,
    badges: starterBadges,
  };
}
