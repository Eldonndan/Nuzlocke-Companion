import type { EmulatorConfig } from "../../shared/types";

type EmulatorConfigPanelProps = {
  config: EmulatorConfig;
  onChange: (config: EmulatorConfig) => void;
  onSelectEmulator: () => void;
  onSelectRom: () => void;
  onClose?: () => void;
};

export function EmulatorConfigPanel({
  config,
  onChange,
  onSelectEmulator,
  onSelectRom,
  onClose,
}: EmulatorConfigPanelProps) {
  const shouldWarnEmulatorPath =
    config.executablePath.trim().length > 0 &&
    !config.executablePath.trim().toLowerCase().endsWith(".exe");
  const shouldWarnRomPath =
    config.romPath.trim().length > 0 &&
    !config.romPath.trim().toLowerCase().endsWith(".gba");

  const updateLaunchArgs = (value: string) => {
    onChange({
      ...config,
      launchArgs: value
        .split(" ")
        .map((arg) => arg.trim())
        .filter(Boolean),
    });
  };

  return (
    <aside className="emulator-panel" aria-labelledby="emulator-panel-title">
      <div className="emulator-panel__header">
        <div>
          <p className="eyebrow">Emulador</p>
          <h2 id="emulator-panel-title">mGBA</h2>
        </div>
        {onClose ? (
          <button className="secondary-button" type="button" onClick={onClose}>
            Cerrar
          </button>
        ) : null}
      </div>

      <p className="emulator-panel__help">
        Usa tu propio emulador y tu propia ROM. La app no incluye, descarga ni
        modifica archivos de juego.
      </p>

      <label className="form-field">
        <span>Ruta del emulador</span>
        <div className="path-field">
          <input
            type="text"
            value={config.executablePath}
            onChange={(event) =>
              onChange({ ...config, executablePath: event.target.value })
            }
            placeholder="C:\\mGBA\\mGBA.exe"
          />
          <button className="secondary-button" type="button" onClick={onSelectEmulator}>
            Buscar
          </button>
        </div>
        {shouldWarnEmulatorPath ? (
          <small className="form-warning">
            La ruta del emulador debería apuntar a mGBA.exe.
          </small>
        ) : null}
      </label>

      <label className="form-field">
        <span>Ruta de la ROM</span>
        <div className="path-field">
          <input
            type="text"
            value={config.romPath}
            onChange={(event) =>
              onChange({ ...config, romPath: event.target.value })
            }
            placeholder="C:\\Juegos\\pokemon.gba"
          />
          <button className="secondary-button" type="button" onClick={onSelectRom}>
            Buscar
          </button>
        </div>
        {shouldWarnRomPath ? (
          <small className="form-warning">
            La ROM debería ser un archivo .gba.
          </small>
        ) : null}
      </label>

      <label className="form-field">
        <span>Argumentos opcionales</span>
        <input
          type="text"
          value={config.launchArgs?.join(" ") ?? ""}
          onChange={(event) => updateLaunchArgs(event.target.value)}
          placeholder="Opcional"
        />
      </label>
    </aside>
  );
}
