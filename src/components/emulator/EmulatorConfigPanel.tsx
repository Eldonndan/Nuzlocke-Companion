import type {
  InternalLibretroRuntimeConfig,
  LegacyExternalRuntimeConfig,
  RuntimeConfig,
} from "../../shared/types";
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
  const isLegacyMode = isLegacyExternalRuntime(config);
  const isInternalMode = isInternalLibretroRuntime(config);
  const legacyConfig = toLegacyConfig(config);
  const internalConfig = toInternalConfig(config);
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
    onChange(normalizeInternalLibretroRuntimeConfig(nextConfig));
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
            {isInternalMode ? "Libretro interno" : "mGBA externo"}
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
          <p className="emulator-panel__help">
            Selecciona un core Libretro local, por ejemplo mgba_libretro.dll.
            La app no incluye cores, ROMs ni BIOS.
          </p>

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
                Buscar
              </button>
            </div>
            <small>
              Ruta local al core Libretro. No se descarga ni valida desde este
              panel.
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
                Buscar
              </button>
            </div>
            <small>Ruta a una ROM propia del usuario.</small>
          </label>

          <label className="form-field">
            <span>Directorio de guardado opcional</span>
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
                Buscar
              </button>
            </div>
            <small>
              Si queda vacio, el runtime usara el directorio de la ROM cuando
              corresponda.
            </small>
          </label>
        </>
      ) : null}
    </aside>
  );
}
