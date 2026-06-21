import {
  type FocusEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { InternalLibretroRuntimeConfig } from "../../shared/types";
import {
  cancelInternalRuntimeFrameLoop,
  clearInternalRuntimeAudioBuffer,
  drainInternalRuntimeAudioChunk,
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
  type InternalAudioChunk,
  type InternalAudioInfo,
  type InternalFrameSnapshot,
  type InternalInputInfo,
  type InternalJoypadButton,
  type InternalRuntimeStatus,
  type InternalSaveMemoryInfo,
  type InternalSaveOperationResult,
  type PrepareInternalRuntimeRequest,
} from "../../utils/internalRuntimeCommands";

type PreviewStatus = "idle" | "loading" | "ready" | "empty" | "error";

type RenderedSnapshotMeta = {
  width: number;
  height: number;
  frameNumber: number;
  pixelFormat?: string | null;
  isDuplicate: boolean;
  rgbaByteLen: number;
};

type InternalRuntimeFramePreviewProps = {
  runtimeConfig: InternalLibretroRuntimeConfig;
  onFrameSnapshot?: (snapshot: InternalFrameSnapshot | null) => void;
  onDebugLoopRunningChange?: (isRunning: boolean) => void;
};

const DEBUG_LOOP_BATCH_FRAMES = 6;
const DEBUG_LOOP_TARGET_FPS = 60;
const DEBUG_AUDIO_DRAIN_FRAMES = 4096;

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
  onFrameSnapshot,
  onDebugLoopRunningChange,
}: InternalRuntimeFramePreviewProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const debugLoopCancelRequestedRef = useRef(false);
  const debugLoopRunningRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextAudioTimeRef = useRef(0);
  const isAudioDebugEnabledRef = useRef(false);
  const heldKeyboardKeysRef = useRef(new Set<string>());
  const heldKeyboardButtonsRef = useRef(new Set<InternalJoypadButton>());
  const [renderedSnapshotMeta, setRenderedSnapshotMeta] =
    useState<RenderedSnapshotMeta | null>(null);
  const [runtimeStatus, setRuntimeStatus] =
    useState<InternalRuntimeStatus | null>(null);
  const [inputInfo, setInputInfo] = useState<InternalInputInfo | null>(null);
  const [saveMemory, setSaveMemory] = useState<InternalSaveMemoryInfo[]>([]);
  const [lastSaveOperation, setLastSaveOperation] =
    useState<InternalSaveOperationResult | null>(null);
  const [audioInfo, setAudioInfo] = useState<InternalAudioInfo | null>(null);
  const [isAudioDebugEnabled, setIsAudioDebugEnabled] = useState(false);
  const [audioDebugMessage, setAudioDebugMessage] =
    useState("Audio debug apagado.");
  const [status, setStatus] = useState<PreviewStatus>("idle");
  const [message, setMessage] = useState("Sin fotograma renderizado.");
  const [isDebugLoopRunning, setIsDebugLoopRunning] = useState(false);
  const [debugLoopFramesRendered, setDebugLoopFramesRendered] = useState(0);
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
  const isActionLoading = status === "loading";
  const disableLifecycleActions = isActionLoading || isDebugLoopRunning;

  const applyRuntimeStatus = (nextStatus: InternalRuntimeStatus) => {
    setRuntimeStatus(nextStatus);
    setInputInfo(nextStatus.inputInfo);
    setAudioInfo(nextStatus.audioInfo);
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

  const renderSnapshot = (
    nextSnapshot: InternalFrameSnapshot | null,
    options: { silent?: boolean } = {},
  ) => {
    if (!nextSnapshot) {
      setRenderedSnapshotMeta(null);
      onFrameSnapshot?.(null);
      setStatus("empty");
      setMessage("No hay fotograma disponible todavia.");
      return false;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      setStatus("error");
      setMessage("No se pudo preparar el canvas.");
      return false;
    }

    const rgba = new Uint8ClampedArray(nextSnapshot.rgba);
    const expectedLength = nextSnapshot.width * nextSnapshot.height * 4;

    if (rgba.length !== expectedLength) {
      setStatus("error");
      setMessage("El fotograma RGBA tiene un tamano inesperado.");
      return false;
    }

    canvas.width = nextSnapshot.width;
    canvas.height = nextSnapshot.height;
    context.putImageData(
      new ImageData(rgba, nextSnapshot.width, nextSnapshot.height),
      0,
      0,
    );
    setRenderedSnapshotMeta({
      width: nextSnapshot.width,
      height: nextSnapshot.height,
      frameNumber: nextSnapshot.info.frameNumber,
      pixelFormat: nextSnapshot.info.pixelFormat,
      isDuplicate: nextSnapshot.info.isDuplicate,
      rgbaByteLen: nextSnapshot.rgbaByteLen,
    });
    onFrameSnapshot?.(nextSnapshot);
    if (!options.silent) {
      setStatus("ready");
      setMessage("Frame renderizado.");
    }
    return true;
  };

  const enableAudioDebug = async () => {
    try {
      const context = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = context;
      await context.resume();

      const nextStatus = await clearInternalRuntimeAudioBuffer();
      applyRuntimeStatus(nextStatus);

      nextAudioTimeRef.current = context.currentTime;
      isAudioDebugEnabledRef.current = true;
      setIsAudioDebugEnabled(true);
      setAudioDebugMessage("Audio debug activo.");
    } catch (error) {
      isAudioDebugEnabledRef.current = false;
      setIsAudioDebugEnabled(false);
      setAudioDebugMessage(getErrorMessage(error));
    }
  };

  const disableAudioDebug = async () => {
    isAudioDebugEnabledRef.current = false;
    setIsAudioDebugEnabled(false);
    nextAudioTimeRef.current = 0;
    setAudioDebugMessage("Audio debug apagado.");

    try {
      const nextStatus = await clearInternalRuntimeAudioBuffer();
      applyRuntimeStatus(nextStatus);
    } catch {
      // Audio debug is best-effort and should not break video/input testing.
    }

    if (audioContextRef.current?.state === "running") {
      await audioContextRef.current.suspend();
    }
  };

  const enqueueAudioChunk = (chunk: InternalAudioChunk) => {
    if (
      !isAudioDebugEnabledRef.current ||
      chunk.frames <= 0 ||
      chunk.channels !== 2
    ) {
      return;
    }

    const context = audioContextRef.current;
    const sampleRate = chunk.sampleRate > 0 ? chunk.sampleRate : context?.sampleRate;

    if (!context || !sampleRate) {
      return;
    }

    const buffer = context.createBuffer(2, chunk.frames, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    for (let frame = 0; frame < chunk.frames; frame += 1) {
      left[frame] = Math.max(
        -1,
        Math.min(1, (chunk.samples[frame * 2] ?? 0) / 32768),
      );
      right[frame] = Math.max(
        -1,
        Math.min(1, (chunk.samples[frame * 2 + 1] ?? 0) / 32768),
      );
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);

    const startAt = Math.max(context.currentTime, nextAudioTimeRef.current);
    source.start(startAt);
    nextAudioTimeRef.current = startAt + buffer.duration;
  };

  const drainAndEnqueueAudio = async () => {
    if (!isAudioDebugEnabledRef.current) {
      return;
    }

    try {
      const chunk = await drainInternalRuntimeAudioChunk(DEBUG_AUDIO_DRAIN_FRAMES);
      enqueueAudioChunk(chunk);
      setAudioDebugMessage(
        chunk.frames > 0
          ? `Audio debug: ${chunk.frames} frames drenados.`
          : "Audio debug: sin muestras nuevas.",
      );
      const nextStatus = await getInternalRuntimeStatus();
      applyRuntimeStatus(nextStatus);
    } catch (error) {
      setAudioDebugMessage(getErrorMessage(error));
    }
  };

  const clearAudioDebugBuffer = async () => {
    try {
      const nextStatus = await clearInternalRuntimeAudioBuffer();
      applyRuntimeStatus(nextStatus);
      nextAudioTimeRef.current = audioContextRef.current?.currentTime ?? 0;
      setAudioDebugMessage("Buffer de audio limpiado.");
    } catch (error) {
      setAudioDebugMessage(getErrorMessage(error));
    }
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
    await drainAndEnqueueAudio();
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
    await drainAndEnqueueAudio();
  };

  const startDebugRenderLoop = async () => {
    if (debugLoopRunningRef.current) {
      return;
    }

    debugLoopCancelRequestedRef.current = false;
    debugLoopRunningRef.current = true;
    setIsDebugLoopRunning(true);
    onDebugLoopRunningChange?.(true);
    setDebugLoopFramesRendered(0);
    setStatus("ready");
    setMessage("Loop debug activo...");

    let framesRendered = 0;

    try {
      while (!debugLoopCancelRequestedRef.current) {
        const nextStatus = await runInternalRuntimeFrameLoop({
          maxFrames: DEBUG_LOOP_BATCH_FRAMES,
          targetFps: DEBUG_LOOP_TARGET_FPS,
        });
        applyRuntimeStatus(nextStatus);

        const nextSnapshot = await getLatestInternalRuntimeFrameSnapshot();
        const didRenderSnapshot = renderSnapshot(nextSnapshot, { silent: true });
        await drainAndEnqueueAudio();

        if (!didRenderSnapshot) {
          throw new Error("No se pudo renderizar el snapshot del loop debug.");
        }

        const renderedThisBatch =
          nextStatus.frameLoop?.framesRun ?? DEBUG_LOOP_BATCH_FRAMES;
        framesRendered += renderedThisBatch;
        setDebugLoopFramesRendered(framesRendered);
        setStatus("ready");
        if (framesRendered % 30 === 0) {
          setMessage(`Loop debug activo - frames: ${framesRendered}`);
        }
      }

      setStatus("ready");
      setMessage("Loop debug detenido.");
    } catch (error) {
      debugLoopCancelRequestedRef.current = true;

      try {
        applyRuntimeStatus(await cancelInternalRuntimeFrameLoop());
      } catch {
        // Keep the original loop error visible.
      }

      setStatus("error");
      setMessage(getErrorMessage(error));
    } finally {
      debugLoopRunningRef.current = false;
      debugLoopCancelRequestedRef.current = false;
      setIsDebugLoopRunning(false);
      onDebugLoopRunningChange?.(false);
    }
  };

  const stopDebugRenderLoop = async () => {
    debugLoopCancelRequestedRef.current = true;
    setMessage("Deteniendo loop debug...");

    try {
      applyRuntimeStatus(await cancelInternalRuntimeFrameLoop());
    } catch (error) {
      setStatus("error");
      setMessage(getErrorMessage(error));
    }
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

  useEffect(() => {
    return () => {
      debugLoopCancelRequestedRef.current = true;

      if (debugLoopRunningRef.current) {
        void cancelInternalRuntimeFrameLoop();
      }

      isAudioDebugEnabledRef.current = false;
      void clearInternalRuntimeAudioBuffer();
      void audioContextRef.current?.close();
      onDebugLoopRunningChange?.(false);
    };
  }, [onDebugLoopRunningChange]);

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
            disabled={isActionLoading || isDebugLoopRunning}
          >
            Renderizar ultimo frame
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void stepAndRender()}
            disabled={isActionLoading || isDebugLoopRunning}
          >
            Avanzar fotograma y renderizar
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void runBatchAndRender()}
            disabled={isActionLoading || isDebugLoopRunning}
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
            disabled={disableLifecycleActions}
          >
            Leer estado
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void prepareRuntime()}
            disabled={disableLifecycleActions || !hasPrepareConfig}
          >
            Preparar
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void loadCore()}
            disabled={disableLifecycleActions}
          >
            Cargar core
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void initCore()}
            disabled={disableLifecycleActions}
          >
            Inicializar core
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void loadGame()}
            disabled={disableLifecycleActions}
          >
            Cargar ROM
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void refreshSaveMemory()}
            disabled={disableLifecycleActions}
          >
            Actualizar memoria
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void loadSaveMemory()}
            disabled={disableLifecycleActions}
          >
            Cargar SRAM
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void saveSaveMemory()}
            disabled={disableLifecycleActions}
          >
            Guardar SRAM
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => void prepareLoadCoreInitLoadRom()}
            disabled={disableLifecycleActions || !hasPrepareConfig}
          >
            Preparar + cargar ROM
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void prepareLoadCoreInitLoadRomAndSram()}
            disabled={disableLifecycleActions || !hasPrepareConfig}
          >
            Preparar + cargar ROM + SRAM
          </button>
        </div>
      </div>

      <div className="internal-frame-preview__loop">
        <strong>Loop debug</strong>
        <span>{isDebugLoopRunning ? "Activo" : "Inactivo"}</span>
        <span>{`Batch: ${DEBUG_LOOP_BATCH_FRAMES} frames`}</span>
        <span>{`Objetivo: ${DEBUG_LOOP_TARGET_FPS} FPS`}</span>
        <span>{`Renderizados: ${debugLoopFramesRendered}`}</span>
        <span>Debug: usa invoke + RGBA completo; puede ir lento.</span>
        <div className="internal-frame-preview__loop-buttons">
          <button
            className="primary-button"
            type="button"
            onClick={() => void startDebugRenderLoop()}
            disabled={isActionLoading || isDebugLoopRunning}
          >
            Iniciar loop debug
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void stopDebugRenderLoop()}
            disabled={!isDebugLoopRunning}
          >
            Detener loop debug
          </button>
        </div>
      </div>

      <div className="internal-frame-preview__audio">
        <strong>Audio debug</strong>
        <span>
          Experimental: reproduce chunks drenados después de frames o batches.
          Puede desincronizarse.
        </span>
        <span>{isAudioDebugEnabled ? "Activo" : "Apagado"}</span>
        <span>{audioDebugMessage}</span>
        <span>{`Frecuencia: ${audioInfo?.sampleRate ?? 0}`}</span>
        <span>{`Buffer: ${audioInfo?.bufferedFrames ?? 0} frames de audio`}</span>
        <span>{`Capturados: ${audioInfo?.totalFramesCaptured ?? 0}`}</span>
        <span>{`Drenados: ${audioInfo?.totalFramesDrained ?? 0}`}</span>
        <span>{`Descartados: ${audioInfo?.droppedFrames ?? 0}`}</span>
        <div className="internal-frame-preview__audio-buttons">
          <button
            className="secondary-button"
            type="button"
            onClick={() => void enableAudioDebug()}
            disabled={isAudioDebugEnabled}
          >
            Activar audio debug
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void disableAudioDebug()}
            disabled={!isAudioDebugEnabled}
          >
            Desactivar audio debug
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void clearAudioDebugBuffer()}
          >
            Limpiar buffer audio
          </button>
        </div>
      </div>

      <div className="internal-frame-preview__body">
        <div className="internal-frame-preview__canvas-wrap">
          <canvas ref={canvasRef} aria-label="Ultimo fotograma interno" />
        </div>
        <div className="internal-frame-preview__meta" aria-live="polite">
          <strong>{status === "loading" ? "Procesando..." : message}</strong>
          {renderedSnapshotMeta ? (
            <>
              <span>{`${renderedSnapshotMeta.width} x ${renderedSnapshotMeta.height}`}</span>
              <span>{`Fotograma ${renderedSnapshotMeta.frameNumber}`}</span>
              <span>
                {renderedSnapshotMeta.pixelFormat ?? "Formato desconocido"}
              </span>
              <span>
                {renderedSnapshotMeta.isDuplicate ? "Duplicado" : "Nuevo"}
              </span>
              <span>{`${renderedSnapshotMeta.rgbaByteLen} bytes RGBA`}</span>
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
              disabled={isActionLoading}
            >
              {label}
            </button>
          ))}
          <button
            className="secondary-button"
            type="button"
            onClick={() => void clearJoypadButtons()}
            disabled={isActionLoading}
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
        <span>
          Autosave: al descargar, detener, resetear o cambiar runtime se
          intentara persistir SRAM si esta disponible.
        </span>
        <span>No reemplaza el guardado dentro del juego.</span>
        <div className="internal-frame-preview__save-buttons">
          <button
            className="secondary-button"
            type="button"
            onClick={() => void refreshSaveMemory()}
            disabled={disableLifecycleActions}
          >
            Actualizar memoria
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void loadSaveMemory()}
            disabled={disableLifecycleActions}
          >
            Cargar SRAM
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void saveSaveMemory()}
            disabled={disableLifecycleActions}
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
