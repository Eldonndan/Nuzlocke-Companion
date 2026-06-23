import type {
  InternalLibretroRuntimeConfig,
  LegacyExternalRuntimeConfig,
  RuntimeConfig,
} from "../../shared/types";
import { useState } from "react";
import {
  createDefaultInternalLibretroRuntimeConfig,
  createDefaultLegacyExternalRuntimeConfig,
  isInternalLibretroRuntime,
  isLegacyExternalRuntime,
  normalizeInternalLibretroRuntimeConfig,
  normalizeLegacyExternalRuntimeConfig,
} from "../../utils/runtimeConfig";

type PathPicker = () => Promise<string | null> | string | null;

type EmulatorConfigPanelProps = {
  config: RuntimeConfig;
  onChange: (config: RuntimeConfig) => void;
  onSelectEmulator: PathPicker;
  onSelectRom: PathPicker;
  onSelectCore?: PathPicker;
  onSelectSaveDirectory?: PathPicker;
  onClose?: () => void;
};

type SetupStep = {
  title: string;
  description: string;
  isComplete: boolean;
};

function toLegacyConfig(config: RuntimeConfig): LegacyExternalRuntimeConfig {
  if (isLegacyExternalRuntime(config)) {
    return normalizeLegacyExternalRuntimeConfig(config);
  }

  return {
    ...createDefaultLegacyExternalRuntimeConfig(),
    romPath: config.romPath,
  };
}

function toInternalConfig(config: RuntimeConfig): InternalLibretroRuntimeConfig {
  if (isInternalLibretroRuntime(config)) {
    return normalizeInternalLibretroRuntimeConfig(config);
  }

  return {
    ...createDefaultInternalLibretroRuntimeConfig(),
    romPath: config.romPath,
  };
}

export function EmulatorConfigPanel({
  config,
  onChange,
  onSelectEmulator,
  onSelectRom,
  onSelectCore,
  onSelectSaveDirectory,
  onClose,
}: EmulatorConfigPanelProps) {
  const [panelMessage, setPanelMessage] = useState("");
  const isLegacyMode = isLegacyExternalRuntime(config);
  const isInternalMode = isInternalLibretroRuntime(config);
  const legacyConfig = toLegacyConfig(config);
  const internalConfig = toInternalConfig(config);
  const isInternalCoreConfigured = internalConfig.corePath.trim().length > 0;
  const isInternalRomConfigured = internalConfig.romPath.trim().length > 0;
  const isInternalSaveDirectoryConfigured =
    (internalConfig.saveDirectory ?? "").trim().length > 0;
  const isInternalReady =
    isInternalCoreConfigured && isInternalRomConfigured;
  const internalSetupSteps: SetupStep[] = [
    {
      title: "Seleccionar core Libretro mGBA",
      description: "Necesitas un core Libretro local, por ejemplo mGBA.",
      isComplete: isInternalCoreConfigured,
    },
    {
      title: "Seleccionar ROM GB/GBC/GBA",
      description: "Selecciona tu ROM legal de Pokemon.",
      isComplete: isInternalRomConfigured,
    },
    {
      title: "Seleccionar carpeta de guardado",
      description:
        "Opcional, pero recomendado para saber donde queda tu .srm.",
      isComplete: isInternalSaveDirectoryConfigured,
    },
  ];
  const internalReadyMessage = isInternalReady
    ? "Listo para jugar"
    : !isInternalCoreConfigured
      ? "Falta core"
      : "Falta ROM";
  const shouldWarnEmulatorPath =
    legacyConfig.executablePath.trim().length > 0 &&
    !legacyConfig.executablePath.trim().toLowerCase().endsWith(".exe");
  const shouldWarnRomPath =
    legacyConfig.romPath.trim().length > 0 &&
    !legacyConfig.romPath.trim().toLowerCase().endsWith(".gba");

  const updateLegacyConfig = (nextConfig: LegacyExternalRuntimeConfig) => {
    onChange(normalizeLegacyExternalRuntimeConfig(nextConfig));
  };

  const updateInternalConfig = (
    nextConfig: InternalLibretroRuntimeConfig,
  ) => {
    setPanelMessage("");
    onChange(normalizeInternalLibretroRuntimeConfig(nextConfig));
  };

  const saveAndPlay = () => {
    if (!isInternalMode) {
      onClose?.();
      return;
    }

    if (!isInternalCoreConfigured) {
      setPanelMessage("Falta seleccionar el core Libretro mGBA.");
      return;
    }

    if (!isInternalRomConfigured) {
      setPanelMessage("Falta seleccionar la ROM.");
      return;
    }

    setPanelMessage("Configuracion lista. Iniciando juego...");
    onClose?.();
  };

  const updateLaunchArgs = (value: string) => {
    updateLegacyConfig({
      ...legacyConfig,
      launchArgs: value
        .split(" ")
        .map((arg) => arg.trim())
        .filter(Boolean),
    });
  };

  const applyPickedPath = async (
    picker: PathPicker | undefined,
    applyPath: (selectedPath: string) => void,
  ) => {
    if (!picker) {
      return;
    }

    const selectedPath = await picker();

    if (selectedPath) {
      applyPath(selectedPath);
    }
  };

  return (
    <aside className="emulator-panel" aria-labelledby="emulator-panel-title">
      <div className="emulator-panel__header">
        <div>
          <p className="eyebrow">Runtime</p>
          <h2 id="emulator-panel-title">
            {isInternalMode ? "Configurar runtime interno" : "mGBA externo"}
          </h2>
        </div>
        {onClose ? (
          <button className="secondary-button" type="button" onClick={onClose}>
            Cerrar
          </button>
        ) : null}
      </div>

      <p className="emulator-panel__help">
        Usa tus propios archivos locales. La app no incluye, descarga ni
        modifica ROMs, BIOS, cores ni archivos de juego.
      </p>

      <label className="form-field">
        <span>Modo de runtime</span>
        <select
          value={config.mode}
          onChange={(event) => {
            const nextMode = event.target.value as RuntimeConfig["mode"];
            onChange(
              nextMode === "legacy-external"
                ? toLegacyConfig(config)
                : toInternalConfig(config),
            );
          }}
        >
          <option value="internal-libretro">Runtime interno Libretro</option>
          <option value="legacy-external">Emulador externo legacy</option>
        </select>
        <small>
          {isInternalMode
            ? "Modo principal recomendado. Usa un core Libretro local y una ROM propia."
            : "Modo antiguo/fallback para ejecutar mGBA externo."}
        </small>
      </label>

      {isLegacyMode ? (
        <>
          <label className="form-field">
            <span>Ruta del emulador</span>
            <div className="path-field">
              <input
                type="text"
                value={legacyConfig.executablePath}
                onChange={(event) =>
                  updateLegacyConfig({
                    ...legacyConfig,
                    executablePath: event.target.value,
                  })
                }
                placeholder="C:\\mGBA\\mGBA.exe"
              />
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  void applyPickedPath(onSelectEmulator, (executablePath) =>
                    updateLegacyConfig({
                      ...legacyConfig,
                      executablePath,
                    }),
                  )
                }
              >
                Buscar
              </button>
            </div>
            {shouldWarnEmulatorPath ? (
              <small className="form-warning">
                La ruta del emulador deberia apuntar a mGBA.exe.
              </small>
            ) : null}
          </label>

          <label className="form-field">
            <span>Ruta de la ROM</span>
            <div className="path-field">
              <input
                type="text"
                value={legacyConfig.romPath}
                onChange={(event) =>
                  updateLegacyConfig({
                    ...legacyConfig,
                    romPath: event.target.value,
                  })
                }
                placeholder="C:\\Juegos\\pokemon.gba"
              />
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  void applyPickedPath(onSelectRom, (romPath) =>
                    updateLegacyConfig({
                      ...legacyConfig,
                      romPath,
                    }),
                  )
                }
              >
                Buscar
              </button>
            </div>
            {shouldWarnRomPath ? (
              <small className="form-warning">
                La ROM deberia ser un archivo .gba.
              </small>
            ) : null}
          </label>

          <label className="form-field">
            <span>Argumentos opcionales</span>
            <input
              type="text"
              value={legacyConfig.launchArgs?.join(" ") ?? ""}
              onChange={(event) => updateLaunchArgs(event.target.value)}
              placeholder="Opcional"
            />
          </label>
        </>
      ) : null}

      {isInternalMode ? (
        <>
          <section className="internal-setup-guide" aria-label="Pasos de configuracion">
            <div className="internal-setup-guide__header">
              <strong>{internalReadyMessage}</strong>
              <span>
                La app no incluye cores, ROMs ni BIOS. Auto boot iniciara la
                run cuando guardes una configuracion completa.
              </span>
            </div>
            <ol className="internal-setup-steps">
              {internalSetupSteps.map((step) => (
                <li
                  className={
                    step.isComplete
                      ? "internal-setup-step internal-setup-step--complete"
                      : "internal-setup-step"
                  }
                  key={step.title}
                >
                  <div>
                    <strong>{step.title}</strong>
                    <span>{step.description}</span>
                  </div>
                  <span>{step.isComplete ? "Completo" : "Pendiente"}</span>
                </li>
              ))}
            </ol>
          </section>

          <label className="form-field">
            <span>Core</span>
            <select
              value={internalConfig.core}
              onChange={(event) =>
                updateInternalConfig({
                  ...internalConfig,
                  core: event.target.value as InternalLibretroRuntimeConfig["core"],
                })
              }
            >
              <option value="mgba">mGBA</option>
            </select>
          </label>

          <label className="form-field">
            <span>Ruta del core</span>
            <div className="path-field">
              <input
                type="text"
                value={internalConfig.corePath}
                onChange={(event) =>
                  updateInternalConfig({
                    ...internalConfig,
                    corePath: event.target.value,
                  })
                }
                placeholder="C:\\Libretro\\mgba_libretro.dll"
              />
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  void applyPickedPath(onSelectCore, (corePath) =>
                    updateInternalConfig({
                      ...internalConfig,
                      corePath,
                    }),
                  )
                }
              >
                Seleccionar core mGBA
              </button>
            </div>
            <small>
              Necesitas un core Libretro local, por ejemplo mgba_libretro.dll.
            </small>
          </label>

          <label className="form-field">
            <span>Ruta de la ROM</span>
            <div className="path-field">
              <input
                type="text"
                value={internalConfig.romPath}
                onChange={(event) =>
                  updateInternalConfig({
                    ...internalConfig,
                    romPath: event.target.value,
                  })
                }
                placeholder="C:\\Juegos\\pokemon.gba"
              />
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  void applyPickedPath(onSelectRom, (romPath) =>
                    updateInternalConfig({
                      ...internalConfig,
                      romPath,
                    }),
                  )
                }
              >
                Seleccionar ROM
              </button>
            </div>
            <small>Selecciona tu ROM legal de Pokemon.</small>
          </label>

          <label className="form-field">
            <span>Directorio de guardado</span>
            <div className="path-field">
              <input
                type="text"
                value={internalConfig.saveDirectory ?? ""}
                onChange={(event) =>
                  updateInternalConfig({
                    ...internalConfig,
                    saveDirectory: event.target.value || undefined,
                  })
                }
                placeholder="C:\\Juegos\\saves"
              />
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  void applyPickedPath(onSelectSaveDirectory, (saveDirectory) =>
                    updateInternalConfig({
                      ...internalConfig,
                      saveDirectory,
                    }),
                  )
                }
              >
                Seleccionar carpeta de guardado
              </button>
            </div>
            <small>
              Recomendado: elige una carpeta de guardado para mantener tus .srm
              ordenados. Si queda vacio, se usara la carpeta de la ROM cuando
              corresponda.
            </small>
          </label>

          {panelMessage ? (
            <p className="emulator-panel__status">{panelMessage}</p>
          ) : null}

          <div className="emulator-panel__footer-actions">
            <button
              className="primary-button"
              type="button"
              onClick={saveAndPlay}
            >
              Guardar y jugar
            </button>
          </div>
        </>
      ) : null}
    </aside>
  );
}
