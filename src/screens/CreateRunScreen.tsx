import { useState } from "react";
import { EmulatorConfigPanel } from "../components/emulator/EmulatorConfigPanel";
import { gamePacks, getGamePackByGameName } from "../data/gamePacks";
import type { EmulatorConfig, RunState } from "../shared/types";
import {
  selectEmulatorExecutable,
  selectRomFile,
} from "../utils/emulatorCommands";
import { createRunState } from "../utils/createRunState";
import { hasSavedRun } from "../utils/runStorage";

type CreateRunScreenProps = {
  onBack: () => void;
  onCreate: (run: RunState) => void;
};

const platformOptions = ["GBA", "NDS", "3DS", "PC / Fangame", "Personalizado"];

const gameOptions = [
  ...gamePacks.map((gamePack) => gamePack.displayName),
  "Pokémon Platinum",
  "Pokémon HeartGold",
  "Pokémon SoulSilver",
  "Pokémon Black",
  "Pokémon White",
  "Personalizado",
];

const challengeOptions = [
  "Nuzlocke clásico",
  "Hardcore Nuzlocke",
  "Randomlocke",
  "Con vidas",
  "Personalizado",
];

export function CreateRunScreen({ onBack, onCreate }: CreateRunScreenProps) {
  const defaultPack = getGamePackByGameName("Pokémon FireRed");
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
  const [emulatorConfig, setEmulatorConfig] = useState<EmulatorConfig>({
    mode: "legacy-external",
    emulatorType: "mgba",
    executablePath: "",
    romPath: "",
    launchArgs: [],
  });
  const [error, setError] = useState("");

  const chooseEmulator = async () => {
    try {
      const selectedPath = await selectEmulatorExecutable();
      if (selectedPath) {
        setEmulatorConfig((currentConfig) => ({
          ...currentConfig,
          executablePath: selectedPath,
        }));
      }
    } catch {
      setError("No se pudo abrir el selector del emulador.");
    }
  };

  const chooseRom = async () => {
    try {
      const selectedPath = await selectRomFile();
      if (selectedPath) {
        setEmulatorConfig((currentConfig) => ({
          ...currentConfig,
          romPath: selectedPath,
        }));
      }
    } catch {
      setError("No se pudo abrir el selector de ROM.");
    }
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
      setError("Las vidas iniciales deben ser 0 o más.");
      return;
    }

    if (levelCap < 1) {
      setError("El límite de nivel inicial debe ser 1 o más.");
      return;
    }

    if (hasSavedRun()) {
      const shouldOverwrite = window.confirm(
        "Ya hay una run guardada. ¿Quieres reemplazarla con esta nueva run?",
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
        emulatorPath: emulatorConfig.executablePath,
        romPath: emulatorConfig.romPath,
        launchArgs: emulatorConfig.launchArgs,
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
        <div>
          <p className="eyebrow">Configuración inicial</p>
          <h1>Nueva run</h1>
        </div>
      </header>

      <section className="create-run-panel" aria-labelledby="create-run-title">
        <div className="create-run-intro">
          <h2 id="create-run-title">Datos de la run</h2>
          <p>
            Crea una run manual con valores iniciales del juego seleccionado.
            Puedes ajustar ruta y límite antes de empezar.
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
              {platformOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
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
            <span>Límite de nivel inicial</span>
            <input
              min="1"
              type="number"
              value={levelCap}
              onChange={(event) => setLevelCap(Number(event.target.value))}
            />
          </label>
        </div>

        <EmulatorConfigPanel
          config={emulatorConfig}
          onChange={setEmulatorConfig}
          onSelectEmulator={chooseEmulator}
          onSelectRom={chooseRom}
        />

        {error ? <p className="form-error">{error}</p> : null}

        <div className="create-run-actions">
          <button className="secondary-button" type="button" onClick={onBack}>
            Cancelar
          </button>
          <button className="primary-button" type="button" onClick={submitRun}>
            Crear run
          </button>
        </div>
      </section>
    </main>
  );
}
