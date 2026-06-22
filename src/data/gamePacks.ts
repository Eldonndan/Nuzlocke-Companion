import type { Badge } from "../shared/types";

export type GameBadge = {
  id: string;
  name: string;
  leaderName: string;
  levelCap: number;
};

export type GamePack = {
  id: string;
  displayName: string;
  platform: string;
  defaultInitialRoute: string;
  defaultInitialLevelCap: number;
  badges: GameBadge[];
  routes: string[];
};

const kantoBadges: GameBadge[] = [
  { id: "boulder", name: "Roca", leaderName: "Brock", levelCap: 14 },
  { id: "cascade", name: "Cascada", leaderName: "Misty", levelCap: 21 },
  { id: "thunder", name: "Trueno", leaderName: "Lt. Surge", levelCap: 24 },
  { id: "rainbow", name: "Arcoíris", leaderName: "Erika", levelCap: 29 },
  { id: "soul", name: "Alma", leaderName: "Koga", levelCap: 43 },
  { id: "marsh", name: "Pantano", leaderName: "Sabrina", levelCap: 43 },
  { id: "volcano", name: "Volcán", leaderName: "Blaine", levelCap: 47 },
  { id: "earth", name: "Tierra", leaderName: "Giovanni", levelCap: 50 },
];

const johtoBadges: GameBadge[] = [
  { id: "zephyr", name: "Céfiro", leaderName: "Falkner", levelCap: 9 },
  { id: "hive", name: "Colmena", leaderName: "Bugsy", levelCap: 16 },
  { id: "plain", name: "Planicie", leaderName: "Whitney", levelCap: 20 },
  { id: "fog", name: "Niebla", leaderName: "Morty", levelCap: 25 },
  { id: "storm", name: "Tormenta", leaderName: "Chuck", levelCap: 30 },
  { id: "mineral", name: "Mineral", leaderName: "Jasmine", levelCap: 35 },
  { id: "glacier", name: "Glaciar", leaderName: "Pryce", levelCap: 31 },
  { id: "rising", name: "Dragón", leaderName: "Clair", levelCap: 40 },
];

const hoennRubySapphireBadges: GameBadge[] = [
  { id: "stone", name: "Piedra", leaderName: "Roxanne", levelCap: 15 },
  { id: "knuckle", name: "Puño", leaderName: "Brawly", levelCap: 18 },
  { id: "dynamo", name: "Dinamo", leaderName: "Wattson", levelCap: 23 },
  { id: "heat", name: "Calor", leaderName: "Flannery", levelCap: 28 },
  { id: "balance", name: "Equilibrio", leaderName: "Norman", levelCap: 31 },
  { id: "feather", name: "Pluma", leaderName: "Winona", levelCap: 33 },
  { id: "mind", name: "Mente", leaderName: "Tate y Liza", levelCap: 42 },
  { id: "rain", name: "Lluvia", leaderName: "Wallace", levelCap: 43 },
];

const hoennEmeraldBadges: GameBadge[] = [
  { id: "stone", name: "Piedra", leaderName: "Roxanne", levelCap: 15 },
  { id: "knuckle", name: "Puño", leaderName: "Brawly", levelCap: 19 },
  { id: "dynamo", name: "Dinamo", leaderName: "Wattson", levelCap: 24 },
  { id: "heat", name: "Calor", leaderName: "Flannery", levelCap: 29 },
  { id: "balance", name: "Equilibrio", leaderName: "Norman", levelCap: 31 },
  { id: "feather", name: "Pluma", leaderName: "Winona", levelCap: 33 },
  { id: "mind", name: "Mente", leaderName: "Tate y Liza", levelCap: 42 },
  { id: "rain", name: "Lluvia", leaderName: "Juan", levelCap: 46 },
];

const kantoRoutes = [
  "Pueblo Paleta",
  "Ruta 1",
  "Ciudad Verde",
  "Bosque Verde",
  "Ruta 3",
  "Monte Moon",
  "Ruta 24",
  "Ruta 25",
  "Túnel Roca",
  "Ruta 10",
  "Torre Pokémon",
  "Zona Safari",
  "Islas Espuma",
  "Calle Victoria",
];

const hoennRoutes = [
  "Villa Raíz",
  "Ruta 101",
  "Ruta 102",
  "Bosque Petalia",
  "Ruta 104",
  "Cueva Granito",
  "Ruta 110",
  "Senda Ígnea",
  "Ruta 113",
  "Ruta 119",
  "Monte Pírico",
  "Ruta 124",
  "Cueva Cardumen",
  "Calle Victoria",
];

function createKantoPack(
  id: string,
  displayName: string,
  platform: string,
  routes: string[] = [],
): GamePack {
  return {
    id,
    displayName,
    platform,
    defaultInitialRoute: "Inicio",
    defaultInitialLevelCap: 14,
    badges: kantoBadges,
    routes,
  };
}

function createJohtoPack(id: string, displayName: string): GamePack {
  return {
    id,
    displayName,
    platform: "GBC",
    defaultInitialRoute: "Inicio",
    defaultInitialLevelCap: 9,
    badges: johtoBadges,
    routes: [],
  };
}

export const gamePacks: GamePack[] = [
  createKantoPack("pokemon-red", "Pokémon Red", "GB"),
  createKantoPack("pokemon-blue", "Pokémon Blue", "GB"),
  createKantoPack("pokemon-yellow", "Pokémon Yellow", "GB"),
  createJohtoPack("pokemon-gold", "Pokémon Gold"),
  createJohtoPack("pokemon-silver", "Pokémon Silver"),
  createJohtoPack("pokemon-crystal", "Pokémon Crystal"),
  {
    id: "pokemon-ruby",
    displayName: "Pokémon Ruby",
    platform: "GBA",
    defaultInitialRoute: "Ruta 101",
    defaultInitialLevelCap: 15,
    badges: hoennRubySapphireBadges,
    routes: hoennRoutes,
  },
  {
    id: "pokemon-sapphire",
    displayName: "Pokémon Sapphire",
    platform: "GBA",
    defaultInitialRoute: "Ruta 101",
    defaultInitialLevelCap: 15,
    badges: hoennRubySapphireBadges,
    routes: hoennRoutes,
  },
  {
    id: "pokemon-emerald",
    displayName: "Pokémon Emerald",
    platform: "GBA",
    defaultInitialRoute: "Ruta 101",
    defaultInitialLevelCap: 15,
    badges: hoennEmeraldBadges,
    routes: hoennRoutes,
  },
  createKantoPack("pokemon-firered", "Pokémon FireRed", "GBA", kantoRoutes),
  createKantoPack("pokemon-leafgreen", "Pokémon LeafGreen", "GBA", kantoRoutes),
];

export function getGamePackById(gameId: string) {
  return gamePacks.find((gamePack) => gamePack.id === gameId);
}

export function getGamePackByGameName(gameName: string) {
  return gamePacks.find((gamePack) => gamePack.displayName === gameName);
}

export function createBadgesFromGamePack(gamePack: GamePack): Badge[] {
  return gamePack.badges.map((badge) => ({
    ...badge,
    obtained: false,
  }));
}
