import { useMemo, useState } from "react";
import { EmulatorConfigPanel } from "../components/emulator/EmulatorConfigPanel";
import { PokemonGameCard } from "../components/library/PokemonGameCard";
import {
  getPokemonPlatformLabel,
  pokemonGameCatalog,
  type PokemonGameCatalogEntry,
  type PokemonPlatform,
} from "../data/pokemonGameCatalog";
import {
  gamePacks,
  getGamePackByGameName,
  getGamePackById,
} from "../data/gamePacks";
import type { RunState, RuntimeConfig } from "../shared/types";
import {
  selectEmulatorExecutable,
  selectLibretroCoreFile,
  selectRomFile,
  selectSaveDirectory,
} from "../utils/emulatorCommands";
import { createRunState } from "../utils/createRunState";
import { hasSavedRun } from "../utils/runStorage";
import {
  createDefaultInternalLibretroRuntimeConfig,
  isInternalLibretroRuntime,
} from "../utils/runtimeConfig";
import {
  applyInternalRuntimePreferencesToConfig,
  loadInternalRuntimePreferences,
} from "../utils/internalRuntimePreferences";
import {
  loadPokemonRomLibrary,
  setPokemonRomPath,
  type PokemonRomLibrary,
} from "../utils/pokemonRomLibrary";

type CreateRunScreenProps = {
  onBack: () => void;
  onCreate: (run: RunState) => void;
  onOpenMyRuns: () => void;
  hasRunLibrary: boolean;
};

type PlatformFilter = "all" | PokemonPlatform;
type CreateRunMode = "library" | "manual";

const platformFilters: Array<{ id: PlatformFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "gb", label: "Game Boy" },
  { id: "gbc", label: "Game Boy Color" },
  { id: "gba", label: "Game Boy Advance" },
];

const gameOptions = [
  ...gamePacks.map((gamePack) => gamePack.displayName),
  "Pokemon Platinum",
  "Pokemon HeartGold",
  "Pokemon SoulSilver",
  "Pokemon Black",
  "Pokemon White",
  "Personalizado",
];

const challengeOptions = [
  "Nuzlocke clasico",
  "Hardcore Nuzlocke",
  "Randomlocke",
  "Con vidas",
  "Personalizado",
];

function platformToRunPlatform(platform: PokemonPlatform) {
  return platform.toUpperCase();
}

function getDefaultRoute(game: PokemonGameCatalogEntry) {
  const pack = getGamePackById(game.id);
  if (pack) {
    return pack.defaultInitialRoute;
  }

  return "Inicio";
}

function getDefaultLevelCap(game: PokemonGameCatalogEntry) {
  return getGamePackById(game.id)?.defaultInitialLevelCap ?? 5;
}

function getFileNameFromPath(path: string) {
  return path.split(/[\\/]/).pop() || "Archivo ROM asociado";
}

export function CreateRunScreen({
  onBack,
  onCreate,
  onOpenMyRuns,
  hasRunLibrary,
}: CreateRunScreenProps) {
  const defaultPack = getGamePackByGameName("Pokémon FireRed");
  const [mode, setMode] = useState<CreateRunMode>("library");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [romLibrary, setRomLibrary] = useState<PokemonRomLibrary>(() =>
    loadPokemonRomLibrary(),
  );
  const [selectedGame, setSelectedGame] =
    useState<PokemonGameCatalogEntry | null>(null);
  const [libraryLives, setLibraryLives] = useState(3);
  const [libraryMessage, setLibraryMessage] = useState("");

  const [name, setName] = useState("");
  const [platform, setPlatform] = useState(defaultPack?.platform ?? "GBA");
  const [gameName, setGameName] = useState("Pokémon FireRed");
  const [challengeType, setChallengeType] = useState("Hardcore Nuzlocke");
  const [lives, setLives] = useState(4);
  const [routeName, setRouteName] = useState(
    defaultPack?.defaultInitialRoute ?? "Ruta 1",
  );
  const [levelCap, setLevelCap] = useState(
    defaultPack?.defaultInitialLevelCap ?? 5,
  );
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>(() =>
    applyInternalRuntimePreferencesToConfig(
      createDefaultInternalLibretroRuntimeConfig(),
    ),
  );
  const [error, setError] = useState("");

  const filteredCatalog = useMemo(
    () =>
      platformFilter === "all"
        ? pokemonGameCatalog
        : pokemonGameCatalog.filter((game) => game.platform === platformFilter),
    [platformFilter],
  );
  const platformCounts = useMemo(
    () => ({
      all: pokemonGameCatalog.length,
      gb: pokemonGameCatalog.filter((game) => game.platform === "gb").length,
      gbc: pokemonGameCatalog.filter((game) => game.platform === "gbc").length,
      gba: pokemonGameCatalog.filter((game) => game.platform === "gba").length,
    }),
    [],
  );
  const internalRuntimePreferences = loadInternalRuntimePreferences();
  const isRuntimePreferenceReady =
    Boolean(internalRuntimePreferences?.corePath);

  const chooseEmulator = async () => {
    try {
      return await selectEmulatorExecutable();
    } catch {
      setError("No se pudo abrir el selector del emulador.");
      return null;
    }
  };

  const chooseRom = async () => {
    try {
      return await selectRomFile();
    } catch {
      setError("No se pudo abrir el selector de ROM.");
      setLibraryMessage("No se pudo abrir el selector de ROM.");
      return null;
    }
  };

  const chooseLibretroCore = async () => {
    try {
      return await selectLibretroCoreFile();
    } catch {
      setError("No se pudo abrir el selector del core Libretro.");
      return null;
    }
  };

  const chooseSaveDirectory = async () => {
    try {
      return await selectSaveDirectory();
    } catch {
      setError("No se pudo abrir el selector del directorio de guardado.");
      return null;
    }
  };

  const assignRomToGame = async (game: PokemonGameCatalogEntry) => {
    const selectedPath = await chooseRom();

    if (!selectedPath) {
      return;
    }

    setRomLibrary(setPokemonRomPath(game.id, selectedPath));
    setSelectedGame(game);
    setLibraryLives(3);
    setLibraryMessage(
      `ROM asociada para ${game.title}. Ya puedes configurar la run.`,
    );
  };

  const openRunSetup = (game: PokemonGameCatalogEntry) => {
    if (!romLibrary[game.id]?.romPath) {
      setLibraryMessage("Primero asigna una ROM local para este juego.");
      return;
    }

    setSelectedGame(game);
    setLibraryLives(3);
    setLibraryMessage("");
  };

  const createLibraryRun = () => {
    if (!selectedGame) {
      return;
    }

    const romPath = romLibrary[selectedGame.id]?.romPath;
    if (!romPath) {
      setLibraryMessage("Primero asigna una ROM local para este juego.");
      return;
    }

    if (libraryLives < 0) {
      setLibraryMessage("Las vidas iniciales deben ser 0 o mas.");
      return;
    }

    if (hasSavedRun()) {
      const shouldOverwrite = window.confirm(
        "Ya hay una run guardada. Quieres reemplazarla con esta nueva run?",
      );

      if (!shouldOverwrite) {
        return;
      }
    }

    const baseInternalConfig = applyInternalRuntimePreferencesToConfig(
      isInternalLibretroRuntime(runtimeConfig)
        ? runtimeConfig
        : createDefaultInternalLibretroRuntimeConfig(),
    );

    onCreate(
      createRunState({
        name: `${selectedGame.title} Nuzlocke`,
        gameId: selectedGame.id,
        platform: platformToRunPlatform(selectedGame.platform),
        gameName: selectedGame.title,
        challengeType: "Nuzlocke clasico",
        runtimeConfig: {
          ...baseInternalConfig,
          mode: "internal-libretro",
          core: "mgba",
          romPath,
        },
        lives: libraryLives,
        routeName: getDefaultRoute(selectedGame),
        levelCap: getDefaultLevelCap(selectedGame),
      }),
    );
  };

  const selectedGamePack = getGamePackByGameName(gameName);

  const updateGameName = (nextGameName: string) => {
    setGameName(nextGameName);

    const nextGamePack = getGamePackByGameName(nextGameName);

    if (!nextGamePack) {
      return;
    }

    setPlatform(nextGamePack.platform);
    setRouteName(nextGamePack.defaultInitialRoute);
    setLevelCap(nextGamePack.defaultInitialLevelCap);
  };

  const submitRun = () => {
    if (!name.trim()) {
      setError("El nombre de la run es obligatorio.");
      return;
    }

    if (lives < 0) {
      setError("Las vidas iniciales deben ser 0 o mas.");
      return;
    }

    if (levelCap < 1) {
      setError("El limite de nivel inicial debe ser 1 o mas.");
      return;
    }

    if (hasSavedRun()) {
      const shouldOverwrite = window.confirm(
        "Ya hay una run guardada. Quieres reemplazarla con esta nueva run?",
      );

      if (!shouldOverwrite) {
        return;
      }
    }

    setError("");
    onCreate(
      createRunState({
        name,
        platform,
        gameName,
        challengeType,
        runtimeConfig,
        lives,
        routeName,
        levelCap,
      }),
    );
  };

  return (
    <main className="setup-screen">
      <header className="screen-header create-run-header">
        <button className="secondary-button" type="button" onClick={onBack}>
          Cancelar
        </button>
        {hasRunLibrary ? (
          <button className="secondary-button" type="button" onClick={onOpenMyRuns}>
            Mis runs
          </button>
        ) : null}
        <div>
          <p className="eyebrow">Biblioteca local</p>
          <h1>Nuzlocke Companion</h1>
        </div>
      </header>

      {mode === "library" ? (
        <section className="create-run-panel" aria-labelledby="library-title">
          <div className="library-hero">
            <p className="eyebrow">Biblioteca local</p>
            <h2 id="library-title">Elige un juego para comenzar una run</h2>
            <p className="library-hero__lead">
              Asocia tus ROMs locales una vez y crea runs sin volver a buscar
              rutas.
            </p>
            <p>
              La app no incluye, descarga ni copia ROMs, BIOS, cores ni
              caratulas oficiales.
            </p>
          </div>

          <section
            className="library-runtime-status-card"
            aria-label="Estado del runtime interno"
          >
            <div>
              <p className="eyebrow">Runtime interno</p>
              <strong>{isRuntimePreferenceReady ? "Listo" : "Falta core"}</strong>
            </div>
            <p>
              {isRuntimePreferenceReady
                ? "Se reutilizara tu core mGBA guardado al crear nuevas runs."
                : "Podras configurar el core mGBA al entrar a la run."}
            </p>
          </section>

          <div className="library-console-tabs" aria-label="Filtrar por consola">
            {platformFilters.map((filter) => (
              <button
                key={filter.id}
                className={
                  platformFilter === filter.id
                    ? "primary-button"
                    : "secondary-button"
                }
                type="button"
                aria-pressed={platformFilter === filter.id}
                onClick={() => setPlatformFilter(filter.id)}
              >
                {filter.label} ({platformCounts[filter.id]})
              </button>
            ))}
          </div>

          <div className="pokemon-game-grid">
            {filteredCatalog.map((game) => (
              <PokemonGameCard
                key={game.id}
                game={game}
                romPath={romLibrary[game.id]?.romPath ?? null}
                onAssignRom={assignRomToGame}
                onConfigureRun={openRunSetup}
              />
            ))}
          </div>

          {selectedGame ? (
            <section
              className="library-run-setup"
              aria-labelledby="library-run-setup-title"
            >
              <div>
                <p className="eyebrow">Configurar Nuzlocke</p>
                <h2 id="library-run-setup-title">{selectedGame.title}</h2>
                <p>
                  {getPokemonPlatformLabel(selectedGame.platform)} ·{" "}
                  {selectedGame.generation} · {selectedGame.region}
                </p>
              </div>
              <div className="library-run-setup__summary">
                <span>
                  ROM asociada:{" "}
                  <strong>
                    {getFileNameFromPath(
                      romLibrary[selectedGame.id]?.romPath ?? "",
                    )}
                  </strong>
                </span>
                <span>
                  Runtime:{" "}
                  <strong>
                    {isRuntimePreferenceReady
                      ? "listo"
                      : "se configurara al entrar"}
                  </strong>
                </span>
              </div>
              <label className="form-field">
                <span>Vidas iniciales</span>
                <div className="life-preset-row">
                  {[3, 5, 10].map((preset) => (
                    <button
                      key={preset}
                      className={
                        libraryLives === preset
                          ? "primary-button"
                          : "secondary-button"
                      }
                      type="button"
                      onClick={() => setLibraryLives(preset)}
                    >
                      {preset}
                    </button>
                  ))}
                  <input
                    min="0"
                    type="number"
                    value={libraryLives}
                    onChange={(event) =>
                      setLibraryLives(Number(event.target.value))
                    }
                    aria-label="Vidas personalizadas"
                    placeholder="Personalizado"
                  />
                </div>
              </label>
              <div className="create-run-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setSelectedGame(null)}
                >
                  Volver
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={createLibraryRun}
                >
                  Comenzar run
                </button>
              </div>
            </section>
          ) : null}

          {libraryMessage ? <p className="form-error">{libraryMessage}</p> : null}

          <div className="create-run-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setMode("manual")}
            >
              Crear run manual
            </button>
          </div>
        </section>
      ) : (
        <section className="create-run-panel" aria-labelledby="create-run-title">
          <div className="create-run-intro">
            <h2 id="create-run-title">Configuracion avanzada</h2>
            <p>
              Crea una run manual con valores iniciales del juego seleccionado.
              Puedes ajustar ruta, limite y runtime antes de empezar.
            </p>
          </div>

          <div className="create-run-grid">
            <label className="form-field form-field--wide">
              <span>Nombre de la run</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Mi Nuzlocke de Kanto"
              />
            </label>

            <label className="form-field">
              <span>Plataforma</span>
              <select
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
              >
                {["GBA", "NDS", "3DS", "PC / Fangame", "Personalizado"].map(
                  (option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label className="form-field">
              <span>Juego</span>
              <select
                value={gameName}
                onChange={(event) => updateGameName(event.target.value)}
              >
                {gameOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span>Tipo de reto</span>
              <select
                value={challengeType}
                onChange={(event) => setChallengeType(event.target.value)}
              >
                {challengeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span>Vidas iniciales</span>
              <input
                min="0"
                type="number"
                value={lives}
                onChange={(event) => setLives(Number(event.target.value))}
              />
            </label>

            <label className="form-field">
              <span>Ruta inicial</span>
              <input
                list="route-options"
                type="text"
                value={routeName}
                onChange={(event) => setRouteName(event.target.value)}
                placeholder="Ruta 1"
              />
              {selectedGamePack ? (
                <datalist id="route-options">
                  {selectedGamePack.routes.map((route) => (
                    <option key={route} value={route} />
                  ))}
                </datalist>
              ) : null}
            </label>

            <label className="form-field">
              <span>Limite de nivel inicial</span>
              <input
                min="1"
                type="number"
                value={levelCap}
                onChange={(event) => setLevelCap(Number(event.target.value))}
              />
            </label>
          </div>

          <EmulatorConfigPanel
            config={runtimeConfig}
            onChange={setRuntimeConfig}
            onSelectEmulator={chooseEmulator}
            onSelectRom={chooseRom}
            onSelectCore={chooseLibretroCore}
            onSelectSaveDirectory={chooseSaveDirectory}
          />

          {error ? <p className="form-error">{error}</p> : null}

          <div className="create-run-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setMode("library")}
            >
              Volver a biblioteca
            </button>
            <button className="primary-button" type="button" onClick={submitRun}>
              Crear run
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
