export type PokemonRomLibraryEntry = {
  gameId: string;
  romPath: string;
  updatedAt: string;
};

export type PokemonRomLibrary = Record<string, PokemonRomLibraryEntry>;

const POKEMON_ROM_LIBRARY_STORAGE_KEY =
  "nuzlocke-companion.pokemon-rom-library.v1";

export function loadPokemonRomLibrary(): PokemonRomLibrary {
  try {
    const savedLibrary = window.localStorage.getItem(
      POKEMON_ROM_LIBRARY_STORAGE_KEY,
    );

    if (!savedLibrary) {
      return {};
    }

    const parsedLibrary: unknown = JSON.parse(savedLibrary);

    if (!isPokemonRomLibrary(parsedLibrary)) {
      window.localStorage.removeItem(POKEMON_ROM_LIBRARY_STORAGE_KEY);
      return {};
    }

    return parsedLibrary;
  } catch {
    return {};
  }
}

export function savePokemonRomLibrary(library: PokemonRomLibrary) {
  window.localStorage.setItem(
    POKEMON_ROM_LIBRARY_STORAGE_KEY,
    JSON.stringify(library),
  );
}

export function getPokemonRomPath(gameId: string) {
  return loadPokemonRomLibrary()[gameId]?.romPath ?? null;
}

export function setPokemonRomPath(gameId: string, romPath: string) {
  const library = loadPokemonRomLibrary();
  const nextLibrary = {
    ...library,
    [gameId]: {
      gameId,
      romPath,
      updatedAt: new Date().toISOString(),
    },
  };

  savePokemonRomLibrary(nextLibrary);
  return nextLibrary;
}

export function removePokemonRomPath(gameId: string) {
  const library = loadPokemonRomLibrary();
  const { [gameId]: _removedEntry, ...nextLibrary } = library;
  savePokemonRomLibrary(nextLibrary);
  return nextLibrary;
}

function isPokemonRomLibrary(value: unknown): value is PokemonRomLibrary {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return Object.values(value).every((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return false;
    }

    const candidate = entry as Partial<PokemonRomLibraryEntry>;
    return (
      typeof candidate.gameId === "string" &&
      typeof candidate.romPath === "string" &&
      typeof candidate.updatedAt === "string"
    );
  });
}
