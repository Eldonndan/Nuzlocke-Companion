import { type FocusEvent, type KeyboardEvent, useRef, useState } from "react";
import type { InternalLibretroRuntimeConfig } from "../../shared/types";
import {
  getInternalRuntimeStatus,
  getLatestInternalRuntimeFrameSnapshot,
  initInternalRuntimeCore,
  loadInternalRuntimeCore,
  loadInternalRuntimeGame,
  loadInternalRuntimeSaveMemoryFromDisk,
  prepareInternalRuntime,
  refreshInternalRuntimeSaveMemoryInfo,
  runInternalRuntimeFrameLoop,
  saveInternalRuntimeMemoryToDisk,
  stepInternalRuntimeFrame,
  clearInternalRuntimeJoypadButtons,
  setInternalRuntimeJoypadButton,
  type InternalFrameSnapshot,
  type InternalInputInfo,
  type InternalJoypadButton,
  type InternalRuntimeStatus,
  type InternalSaveMemoryInfo,
  type InternalSaveOperationResult,
  type PrepareInternalRuntimeRequest,
} from "../../utils/internalRuntimeCommands";

type PreviewStatus = "idle" | "loading" | "ready" | "empty" | "error";

type InternalRuntimeFramePreviewProps = {
  runtimeConfig: InternalLibretroRuntimeConfig;
};

const joypadButtons: Array<{ button: InternalJoypadButton; label: string }> = [
  { button: "up", label: "Arriba" },
  { button: "down", label: "Abajo" },
  { button: "left", label: "Izquierda" },
  { button: "right", label: "Derecha" },
  { button: "a", label: "A" },
  { button: "b", label: "B" },
  { button: "start", label: "Start" },
  { button: "select", label: "Select" },
  { button: "l", label: "L" },
  { button: "r", label: "R" },
  { button: "x", label: "X" },
  { button: "y", label: "Y" },
];

const keyboardJoypadMap: Record<string, InternalJoypadButton> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyZ: "a",
  KeyX: "b",
  Enter: "start",
  Backspace: "select",
  KeyA: "l",
  KeyS: "r",
  KeyQ: "y",
  KeyW: "x",
};

function getJoypadButtonLabel(button: InternalJoypadButton) {
  return (
    joypadButtons.find((candidate) => candidate.button === button)?.label ??
    button
  );
}

function getErrorMessage(error: unknown) {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "No se pudo actualizar la vista previa.";
}

function formatFlag(value: boolean | undefined) {
  return value ? "si" : "no";
}

function formatPath(value: string | undefined) {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : "sin configurar";
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function InternalRuntimeFramePreview({
  runtimeConfig,
}: InternalRuntimeFramePreviewProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const heldKeyboardKeysRef = useRef(new Set<string>());
  const heldKeyboardButtonsRef = useRef(new Set<InternalJoypadButton>());
  const [snapshot, setSnapshot] = useState<InternalFrameSnapshot | null>(null);
  const [runtimeStatus, setRuntimeStatus] =
    useState<InternalRuntimeStatus | null>(null);
  const [inputInfo, setInputInfo] = useState<InternalInputInfo | null>(null);
  const [saveMemory, setSaveMemory] = useState<InternalSaveMemoryInfo[]>([]);
  const [lastSaveOperation, setLastSaveOperation] =
    useState<InternalSaveOperationResult | null>(null);
  const [status, setStatus] = useState<PreviewStatus>("idle");
  const [message, setMessage] = useState("Sin fotograma renderizado.");
  const [isKeyboardFocused, setIsKeyboardFocused] = useState(false);

  const trimmedCore = runtimeConfig.core.trim();
  const trimmedCorePath = runtimeConfig.corePath.trim();
  const trimmedRomPath = runtimeConfig.romPath.trim();
  const trimmedSaveDirectory = runtimeConfig.saveDirectory?.trim();
  const hasPrepareConfig = Boolean(
    trimmedCore && trimmedCorePath && trimmedRomPath,
  );
  const pressedButtons = new Set(inputInfo?.pressedButtons ?? []);
  const saveRamInfo = saveMemory.find((memory) => memory.kind === "save-ram");

  const applyRuntimeStatus = (nextStatus: InternalRuntimeStatus) => {
    setRuntimeStatus(nextStatus);
    setInputInfo(nextStatus.inputInfo);
    setSaveMemory(nextStatus.saveMemory);
    setLastSaveOperation(nextStatus.lastSaveOperation ?? null);
  };

  const buildPrepareRequest = (): PrepareInternalRuntimeRequest | null => {
    if (!trimmedCore) {
      setStatus("error");
      setMessage("Falta configurar core.");
      return null;
    }

    if (!trimmedCorePath) {
      setStatus("error");
      setMessage("Falta configurar corePath.");
      return null;
    }

    if (!trimmedRomPath) {
      setStatus("error");
      setMessage("Falta configurar romPath.");
      return null;
    }

    return {
      core: trimmedCore,
      corePath: trimmedCorePath,
      romPath: trimmedRomPath,
      saveDirectory: trimmedSaveDirectory || undefined,
    };
  };

  const runRuntimeAction = async (
    loadingMessage: string,
    action: () => Promise<InternalRuntimeStatus>,
    readyMessage: string,
  ) => {
    setStatus("loading");
    setMessage(loadingMessage);

    try {
      const nextStatus = await action();
      applyRuntimeStatus(nextStatus);
      setStatus("ready");
      setMessage(readyMessage);
      return nextStatus;
    } catch (error) {
      setStatus("error");
      setMessage(getErrorMessage(error));
      return null;
    }
  };

  const renderSnapshot = (nextSnapshot: InternalFrameSnapshot | null) => {
    if (!nextSnapshot) {
      setSnapshot(null);
      setStatus("empty");
      setMessage("No hay fotograma disponible todavia.");
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      setStatus("error");
      setMessage("No se pudo preparar el canvas.");
      return;
    }

    const rgba = new Uint8ClampedArray(nextSnapshot.rgba);
    const expectedLength = nextSnapshot.width * nextSnapshot.height * 4;

    if (rgba.length !== expectedLength) {
      setStatus("error");
      setMessage("El fotograma RGBA tiene un tamano inesperado.");
      return;
    }

    canvas.width = nextSnapshot.width;
    canvas.height = nextSnapshot.height;
    context.putImageData(
      new ImageData(rgba, nextSnapshot.width, nextSnapshot.height),
      0,
      0,
    );
    setSnapshot(nextSnapshot);
    setStatus("ready");
    setMessage("Frame renderizado.");
  };

  const readRuntimeStatus = async () => {
    await runRuntimeAction(
      "Leyendo estado del runtime...",
      getInternalRuntimeStatus,
      "Estado actualizado.",
    );
  };

  const prepareRuntime = async () => {
    const request = buildPrepareRequest();

    if (!request) {
      return null;
    }

    return runRuntimeAction(
      "Preparando runtime...",
      () => prepareInternalRuntime(request),
      "Runtime preparado.",
    );
  };

  const loadCore = async () =>
    runRuntimeAction("Cargando core...", loadInternalRuntimeCore, "Core cargado.");

  const initCore = async () =>
    runRuntimeAction(
      "Inicializando core...",
      initInternalRuntimeCore,
      "Core inicializado.",
    );

  const loadGame = async () =>
    runRuntimeAction("Cargando ROM...", loadInternalRuntimeGame, "ROM cargada.");

  const prepareLoadCoreInitLoadRom = async () => {
    const request = buildPrepareRequest();

    if (!request) {
      return;
    }

    setStatus("loading");
    setMessage("Preparando runtime interno...");

    try {
      applyRuntimeStatus(await prepareInternalRuntime(request));
      setMessage("Cargando core...");
      applyRuntimeStatus(await loadInternalRuntimeCore());
      setMessage("Inicializando core...");
      applyRuntimeStatus(await initInternalRuntimeCore());
      setMessage("Cargando ROM...");
      applyRuntimeStatus(await loadInternalRuntimeGame());
      setMessage("Actualizando memoria de guardado...");
      applyRuntimeStatus(await refreshInternalRuntimeSaveMemoryInfo());
      setStatus("ready");
      setMessage("Runtime interno listo para pruebas.");
    } catch (error) {
      setStatus("error");
      setMessage(getErrorMessage(error));
    }
  };

  const prepareLoadCoreInitLoadRomAndSram = async () => {
    const request = buildPrepareRequest();

    if (!request) {
      return;
    }

    setStatus("loading");
    setMessage("Preparando runtime interno...");

    try {
      applyRuntimeStatus(await prepareInternalRuntime(request));
      setMessage("Cargando core...");
      applyRuntimeStatus(await loadInternalRuntimeCore());
      setMessage("Inicializando core...");
      applyRuntimeStatus(await initInternalRuntimeCore());
      setMessage("Cargando ROM...");
      applyRuntimeStatus(await loadInternalRuntimeGame());
      setMessage("Actualizando memoria de guardado...");
      applyRuntimeStatus(await refreshInternalRuntimeSaveMemoryInfo());
      setMessage("Cargando SRAM...");
      const nextStatus = await loadInternalRuntimeSaveMemoryFromDisk("save-ram");
      applyRuntimeStatus(nextStatus);
      setStatus("ready");
      setMessage(
        nextStatus.lastSaveOperation?.message ??
          "Runtime interno listo con SRAM consultada.",
      );
    } catch (error) {
      setStatus("error");
      setMessage(getErrorMessage(error));
    }
  };

  const refreshSnapshot = async () => {
    setStatus("loading");
    setMessage("Renderizando ultimo fotograma...");

    try {
      renderSnapshot(await getLatestInternalRuntimeFrameSnapshot());
    } catch (error) {
      setStatus("error");
      setMessage(getErrorMessage(error));
    }
  };

  const stepAndRender = async () => {
    const nextStatus = await runRuntimeAction(
      "Ejecutando un fotograma...",
      stepInternalRuntimeFrame,
      "Fotograma ejecutado.",
    );

    if (!nextStatus) {
      return;
    }

    await refreshSnapshot();
  };

  const runBatchAndRender = async () => {
    const nextStatus = await runRuntimeAction(
      "Ejecutando 60 fotogramas...",
      () =>
        runInternalRuntimeFrameLoop({
          maxFrames: 60,
          targetFps: 60,
        }),
      "Batch ejecutado.",
    );

    if (!nextStatus) {
      return;
    }

    await refreshSnapshot();
  };

  const toggleJoypadButton = async (button: InternalJoypadButton) => {
    const pressed = !pressedButtons.has(button);
    await runRuntimeAction(
      pressed ? "Presionando boton..." : "Soltando boton...",
      () =>
        setInternalRuntimeJoypadButton({
          button,
          pressed,
        }),
      pressed ? "Boton presionado." : "Boton soltado.",
    );
  };

  const clearJoypadButtons = async () => {
    await runRuntimeAction(
      "Limpiando botones...",
      clearInternalRuntimeJoypadButtons,
      "Botones limpiados.",
    );
  };

  const refreshSaveMemory = async () => {
    await runRuntimeAction(
      "Consultando memoria de guardado...",
      refreshInternalRuntimeSaveMemoryInfo,
      "Memoria de guardado actualizada.",
    );
  };

  const loadSaveMemory = async () => {
    const nextStatus = await runRuntimeAction(
      "Cargando SRAM...",
      () => loadInternalRuntimeSaveMemoryFromDisk("save-ram"),
      "SRAM consultada.",
    );

    if (nextStatus?.lastSaveOperation?.message) {
      setMessage(nextStatus.lastSaveOperation.message);
    }
  };

  const saveSaveMemory = async () => {
    const nextStatus = await runRuntimeAction(
      "Guardando SRAM...",
      () => saveInternalRuntimeMemoryToDisk("save-ram"),
      "SRAM guardada.",
    );

    if (nextStatus?.lastSaveOperation?.message) {
      setMessage(nextStatus.lastSaveOperation.message);
    }
  };

  const setKeyboardButton = async (
    button: InternalJoypadButton,
    pressed: boolean,
  ) => {
    try {
      applyRuntimeStatus(
        await setInternalRuntimeJoypadButton({
          button,
          pressed,
        }),
      );
    } catch (error) {
      setStatus("error");
      setMessage(getErrorMessage(error));
    }
  };

  const handleKeyboardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const button = keyboardJoypadMap[event.code];

    if (!button || isEditableTarget(event.target)) {
      return;
    }

    event.preventDefault();

    if (event.repeat || heldKeyboardKeysRef.current.has(event.code)) {
      return;
    }

    heldKeyboardKeysRef.current.add(event.code);
    heldKeyboardButtonsRef.current.add(button);
    void setKeyboardButton(button, true);
  };

  const handleKeyboardKeyUp = (event: KeyboardEvent<HTMLElement>) => {
    const button = keyboardJoypadMap[event.code];

    if (!button || isEditableTarget(event.target)) {
      return;
    }

    event.preventDefault();
    heldKeyboardKeysRef.current.delete(event.code);
    heldKeyboardButtonsRef.current.delete(button);
    void setKeyboardButton(button, false);
  };

  const releaseHeldKeyboardButtons = async () => {
    const buttonsToRelease = [...heldKeyboardButtonsRef.current];
    heldKeyboardKeysRef.current.clear();
    heldKeyboardButtonsRef.current.clear();

    for (const button of buttonsToRelease) {
      await setKeyboardButton(button, false);
    }
  };

  const handleKeyboardBlur = (event: FocusEvent<HTMLElement>) => {
    const nextTarget = event.relatedTarget;

    if (
      nextTarget instanceof Node &&
      sectionRef.current?.contains(nextTarget)
    ) {
      return;
    }

    setIsKeyboardFocused(false);
    void releaseHeldKeyboardButtons();
  };

  return (
    <section
      ref={sectionRef}
      className={
        isKeyboardFocused
          ? "internal-frame-preview internal-frame-preview--keyboard-focused"
          : "internal-frame-preview"
      }
      aria-label="Vista previa interna"
      tabIndex={0}
      onFocus={() => setIsKeyboardFocused(true)}
      onBlur={handleKeyboardBlur}
      onKeyDown={handleKeyboardKeyDown}
      onKeyUp={handleKeyboardKeyUp}
    >
      <div className="internal-frame-preview__header">
        <div>
          <p className="eyebrow">Runtime interno</p>
          <h2>Vista previa de fotograma</h2>
        </div>
        <div className="internal-frame-preview__actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => void refreshSnapshot()}
            disabled={status === "loading"}
          >
            Renderizar ultimo frame
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void stepAndRender()}
            disabled={status === "loading"}
          >
            Avanzar fotograma y renderizar
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void runBatchAndRender()}
            disabled={status === "loading"}
          >
            60 fotogramas y renderizar
          </button>
        </div>
      </div>

      <div className="internal-frame-preview__runtime">
        <strong>Configuracion</strong>
        <span>{`Core: ${trimmedCore || "sin configurar"}`}</span>
        <span>{`Core path: ${formatPath(runtimeConfig.corePath)}`}</span>
        <span>{`ROM: ${formatPath(runtimeConfig.romPath)}`}</span>
        <span>{`Save directory: ${
          trimmedSaveDirectory || "sin save directory"
        }`}</span>
      </div>

      <div className="internal-frame-preview__runtime">
        <strong>Estado</strong>
        <span>{`Fase: ${runtimeStatus?.phase ?? "sin leer"}`}</span>
        <span>{`Core cargado: ${formatFlag(runtimeStatus?.isCoreLoaded)}`}</span>
        <span>{`Core inicializado: ${formatFlag(
          runtimeStatus?.isCoreInitialized,
        )}`}</span>
        <span>{`ROM cargada: ${formatFlag(runtimeStatus?.isRomLoaded)}`}</span>
        <span>{`Running: ${formatFlag(runtimeStatus?.isRunning)}`}</span>
        <span>{`Frames: ${runtimeStatus?.steppedFrames ?? 0}`}</span>
        <span>{`Ultimo frame: ${
          runtimeStatus?.latestFrame?.frameNumber ?? "sin frame"
        }`}</span>
        {runtimeStatus?.lastError ? (
          <span>{`Error: ${runtimeStatus.lastError}`}</span>
        ) : null}
      </div>

      <div className="internal-frame-preview__setup">
        <strong>Setup manual</strong>
        <div className="internal-frame-preview__setup-buttons">
          <button
            className="secondary-button"
            type="button"
            onClick={() => void readRuntimeStatus()}
            disabled={status === "loading"}
          >
            Leer estado
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void prepareRuntime()}
            disabled={status === "loading" || !hasPrepareConfig}
          >
            Preparar
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void loadCore()}
            disabled={status === "loading"}
          >
            Cargar core
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void initCore()}
            disabled={status === "loading"}
          >
            Inicializar core
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void loadGame()}
            disabled={status === "loading"}
          >
            Cargar ROM
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void refreshSaveMemory()}
            disabled={status === "loading"}
          >
            Actualizar memoria
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void loadSaveMemory()}
            disabled={status === "loading"}
          >
            Cargar SRAM
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void saveSaveMemory()}
            disabled={status === "loading"}
          >
            Guardar SRAM
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => void prepareLoadCoreInitLoadRom()}
            disabled={status === "loading" || !hasPrepareConfig}
          >
            Preparar + cargar ROM
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void prepareLoadCoreInitLoadRomAndSram()}
            disabled={status === "loading" || !hasPrepareConfig}
          >
            Preparar + cargar ROM + SRAM
          </button>
        </div>
      </div>

      <div className="internal-frame-preview__body">
        <div className="internal-frame-preview__canvas-wrap">
          <canvas ref={canvasRef} aria-label="Ultimo fotograma interno" />
        </div>
        <div className="internal-frame-preview__meta" aria-live="polite">
          <strong>{status === "loading" ? "Procesando..." : message}</strong>
          {snapshot ? (
            <>
              <span>{`${snapshot.width} x ${snapshot.height}`}</span>
              <span>{`Fotograma ${snapshot.info.frameNumber}`}</span>
              <span>{snapshot.info.pixelFormat ?? "Formato desconocido"}</span>
              <span>{snapshot.info.isDuplicate ? "Duplicado" : "Nuevo"}</span>
              <span>{`${snapshot.rgbaByteLen} bytes RGBA`}</span>
            </>
          ) : null}
        </div>
      </div>
      <div className="internal-frame-preview__input">
        <strong>Control Joypad</strong>
        <div className="internal-frame-preview__input-buttons">
          {joypadButtons.map(({ button, label }) => (
            <button
              key={button}
              className={
                pressedButtons.has(button)
                  ? "primary-button"
                  : "secondary-button"
              }
              type="button"
              onClick={() => void toggleJoypadButton(button)}
              disabled={status === "loading"}
            >
              {label}
            </button>
          ))}
          <button
            className="secondary-button"
            type="button"
            onClick={() => void clearJoypadButtons()}
            disabled={status === "loading"}
          >
            Limpiar botones
          </button>
        </div>
        <span>
          {inputInfo?.pressedButtons.length
            ? `Presionados: ${inputInfo.pressedButtons
                .map(getJoypadButtonLabel)
                .join(", ")}`
            : "Sin botones presionados"}
        </span>
        <span>
          {`Sondeos: ${inputInfo?.pollCount ?? 0} - Consultas: ${
            inputInfo?.stateQueryCount ?? 0
          }`}
        </span>
      </div>
      <div className="internal-frame-preview__keyboard">
        <strong>Teclado local</strong>
        <span>Haz click en esta tarjeta para activar teclado.</span>
        <span>{isKeyboardFocused ? "Teclado activo" : "Teclado inactivo"}</span>
        <span>Flechas = D-pad</span>
        <span>Z = A</span>
        <span>X = B</span>
        <span>Enter = Start</span>
        <span>Backspace = Select</span>
        <span>A/S = L/R</span>
        <span>Q/W = Y/X</span>
        <span>
          {heldKeyboardButtonsRef.current.size
            ? `Teclado: ${[...heldKeyboardButtonsRef.current]
                .map(getJoypadButtonLabel)
                .join(", ")}`
            : "Sin botones retenidos por teclado"}
        </span>
      </div>
      <div className="internal-frame-preview__saves">
        <strong>Guardado SRAM</strong>
        <div className="internal-frame-preview__save-buttons">
          <button
            className="secondary-button"
            type="button"
            onClick={() => void refreshSaveMemory()}
            disabled={status === "loading"}
          >
            Actualizar memoria
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void loadSaveMemory()}
            disabled={status === "loading"}
          >
            Cargar SRAM
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void saveSaveMemory()}
            disabled={status === "loading"}
          >
            Guardar SRAM
          </button>
        </div>
        <span>
          {saveRamInfo
            ? `${saveRamInfo.sizeBytes} bytes`
            : "SRAM no consultada"}
        </span>
        <span>{saveRamInfo?.existsOnDisk ? "Existe en disco" : "Sin archivo"}</span>
        {saveRamInfo?.filePath ? <span>{saveRamInfo.filePath}</span> : null}
        {lastSaveOperation ? <span>{lastSaveOperation.message}</span> : null}
      </div>
    </section>
  );
}
