import {
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
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
  getLatestInternalRuntimeFrameSnapshotBase64,
  initInternalRuntimeCore,
  loadInternalRuntimeCore,
  loadInternalRuntimeGame,
  loadInternalRuntimeSaveMemoryFromDisk,
  prepareInternalRuntime,
  refreshInternalRuntimeSaveMemoryInfo,
  runInternalRuntimeFrameLoop,
  saveInternalRuntimeMemoryToDisk,
  pauseInternalRuntime,
  resumeInternalRuntime,
  startInternalRuntime,
  stopInternalRuntime,
  stepInternalRuntimeFrame,
  clearInternalRuntimeJoypadButtons,
  setInternalRuntimeJoypadButton,
  type InternalAudioChunk,
  type InternalAudioInfo,
  type InternalFrameSnapshot,
  type InternalFrameSnapshotBase64,
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
  onFrameSnapshotBase64?: (snapshot: InternalFrameSnapshotBase64 | null) => void;
  onDebugLoopRunningChange?: (isRunning: boolean) => void;
  onRuntimeStatusChange?: (status: InternalRuntimeStatus) => void;
  onDebugPanelCollapsedChange?: (collapsed: boolean) => void;
  isCollapsed?: boolean;
  showCollapseToggle?: boolean;
  keyboardTargetRef?: RefObject<HTMLElement | null>;
};

const DEBUG_LOOP_TARGET_FPS = 60;
const DEBUG_AUDIO_DRAIN_INTERVAL_MS = 50;
const DEBUG_AUDIO_MAX_DRAIN_FRAMES = 8192;
const DEBUG_AUDIO_MAX_DRAIN_ATTEMPTS = 3;
const DEBUG_AUDIO_BACKLOG_RESET_FRAMES = 96_000;
const DEBUG_AUDIO_MAX_LEAD_SECONDS = 0.35;

type InternalPerformancePreset = "smooth" | "balanced" | "battery";

const performancePresetConfig: Record<
  InternalPerformancePreset,
  { label: string; batchFrames: number; targetFps: number }
> = {
  smooth: { label: "Suave", batchFrames: 2, targetFps: 60 },
  balanced: { label: "Balanceado", batchFrames: 3, targetFps: 60 },
  battery: { label: "Ahorro", batchFrames: 6, targetFps: 60 },
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

function decodeBase64ToUint8ClampedArray(base64: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8ClampedArray(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function InternalRuntimeFramePreview({
  runtimeConfig,
  onFrameSnapshot,
  onFrameSnapshotBase64,
  onDebugLoopRunningChange,
  onRuntimeStatusChange,
  onDebugPanelCollapsedChange,
  isCollapsed,
  showCollapseToggle = true,
  keyboardTargetRef,
}: InternalRuntimeFramePreviewProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const debugLoopCancelRequestedRef = useRef(false);
  const debugLoopRunningRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextAudioTimeRef = useRef(0);
  const isAudioDebugEnabledRef = useRef(false);
  const audioDrainIntervalRef = useRef<number | null>(null);
  const audioDrainInFlightRef = useRef(false);
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
  const [lastAudioChunkFrames, setLastAudioChunkFrames] = useState(0);
  const [lastAudioError, setLastAudioError] = useState<string | null>(null);
  const [status, setStatus] = useState<PreviewStatus>("idle");
  const [message, setMessage] = useState("Sin fotograma renderizado.");
  const [isDebugPanelCollapsed, setIsDebugPanelCollapsed] = useState(false);
  const [performancePreset, setPerformancePreset] =
    useState<InternalPerformancePreset>("balanced");
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
  const effectiveDebugPanelCollapsed = isCollapsed ?? isDebugPanelCollapsed;
  const activePerformancePreset = performancePresetConfig[performancePreset];
  const isNativeSessionActive = Boolean(runtimeStatus?.sessionInfo?.isActive);
  const isNativeSessionPaused = Boolean(runtimeStatus?.sessionInfo?.isPaused);
  const isAudioContextRunning =
    isAudioDebugEnabled && audioContextRef.current?.state === "running";
  const disableRuntimeLifecycleActions =
    disableLifecycleActions || isNativeSessionActive;

  const applyRuntimeStatus = (nextStatus: InternalRuntimeStatus) => {
    setRuntimeStatus(nextStatus);
    setInputInfo(nextStatus.inputInfo);
    setAudioInfo(nextStatus.audioInfo);
    setSaveMemory(nextStatus.saveMemory);
    setLastSaveOperation(nextStatus.lastSaveOperation ?? null);
    onRuntimeStatusChange?.(nextStatus);
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

  const renderSnapshotBase64 = (
    nextSnapshot: InternalFrameSnapshotBase64 | null,
    options: { silent?: boolean } = {},
  ) => {
    if (!nextSnapshot) {
      setRenderedSnapshotMeta(null);
      onFrameSnapshot?.(null);
      onFrameSnapshotBase64?.(null);
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

    const rgba = decodeBase64ToUint8ClampedArray(nextSnapshot.rgbaBase64);
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
    onFrameSnapshotBase64?.(nextSnapshot);
    if (!options.silent) {
      setStatus("ready");
      setMessage("Frame renderizado.");
    }
    return true;
  };

  const stopAudioDrainInterval = () => {
    if (audioDrainIntervalRef.current === null) {
      return;
    }

    window.clearInterval(audioDrainIntervalRef.current);
    audioDrainIntervalRef.current = null;
  };

  const startAudioDrainInterval = () => {
    if (audioDrainIntervalRef.current !== null) {
      return;
    }

    audioDrainIntervalRef.current = window.setInterval(() => {
      void drainAndEnqueueAudio();
    }, DEBUG_AUDIO_DRAIN_INTERVAL_MS);
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
      setLastAudioChunkFrames(0);
      setLastAudioError(null);
      startAudioDrainInterval();
      setAudioDebugMessage(
        `Audio debug activo. Drenando cada ${DEBUG_AUDIO_DRAIN_INTERVAL_MS}ms.`,
      );
    } catch (error) {
      stopAudioDrainInterval();
      isAudioDebugEnabledRef.current = false;
      setIsAudioDebugEnabled(false);
      const message = getErrorMessage(error);
      setLastAudioError(message);
      setAudioDebugMessage(message);
    }
  };

  const disableAudioDebug = async () => {
    stopAudioDrainInterval();
    isAudioDebugEnabledRef.current = false;
    setIsAudioDebugEnabled(false);
    nextAudioTimeRef.current = 0;
    setLastAudioChunkFrames(0);
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

    if (
      nextAudioTimeRef.current - context.currentTime >
      DEBUG_AUDIO_MAX_LEAD_SECONDS
    ) {
      nextAudioTimeRef.current = context.currentTime;
    }

    if (nextAudioTimeRef.current < context.currentTime) {
      nextAudioTimeRef.current = context.currentTime;
    }

    const startAt = nextAudioTimeRef.current;
    source.start(startAt);
    nextAudioTimeRef.current = startAt + buffer.duration;
  };

  const drainAndEnqueueAudio = async () => {
    if (!isAudioDebugEnabledRef.current || audioDrainInFlightRef.current) {
      return;
    }

    audioDrainInFlightRef.current = true;

    try {
      let currentStatus = await getInternalRuntimeStatus();
      applyRuntimeStatus(currentStatus);

      if (
        currentStatus.audioInfo.bufferedFrames >
        DEBUG_AUDIO_BACKLOG_RESET_FRAMES
      ) {
        currentStatus = await clearInternalRuntimeAudioBuffer();
        applyRuntimeStatus(currentStatus);
        nextAudioTimeRef.current = audioContextRef.current?.currentTime ?? 0;
        setLastAudioChunkFrames(0);
        setAudioDebugMessage("Audio debug: backlog limpiado.");
        return;
      }

      let drainedFrames = 0;

      for (
        let attempt = 0;
        attempt < DEBUG_AUDIO_MAX_DRAIN_ATTEMPTS;
        attempt += 1
      ) {
        const chunk = await drainInternalRuntimeAudioChunk(
          DEBUG_AUDIO_MAX_DRAIN_FRAMES,
        );
        drainedFrames += chunk.frames;
        enqueueAudioChunk(chunk);

        if (chunk.frames < DEBUG_AUDIO_MAX_DRAIN_FRAMES) {
          break;
        }
      }

      setLastAudioChunkFrames(drainedFrames);
      setLastAudioError(null);
      setAudioDebugMessage(
        drainedFrames > 0
          ? `Audio debug: ${drainedFrames} frames drenados.`
          : `Audio debug activo. Drenando cada ${DEBUG_AUDIO_DRAIN_INTERVAL_MS}ms.`,
      );
      const nextStatus = await getInternalRuntimeStatus();
      applyRuntimeStatus(nextStatus);
    } catch (error) {
      const message = getErrorMessage(error);
      setLastAudioError(message);
      setAudioDebugMessage(message);
    } finally {
      audioDrainInFlightRef.current = false;
    }
  };

  const clearAudioDebugBuffer = async () => {
    try {
      const nextStatus = await clearInternalRuntimeAudioBuffer();
      applyRuntimeStatus(nextStatus);
      nextAudioTimeRef.current = audioContextRef.current?.currentTime ?? 0;
      setLastAudioChunkFrames(0);
      setLastAudioError(null);
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
      renderSnapshotBase64(await getLatestInternalRuntimeFrameSnapshotBase64());
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

  const startNativeSession = async () => {
    await runRuntimeAction(
      "Iniciando sesion interna...",
      startInternalRuntime,
      "Sesion interna activa.",
    );
  };

  const pauseNativeSession = async () => {
    await runRuntimeAction(
      "Pausando sesion interna...",
      pauseInternalRuntime,
      "Sesion interna pausada.",
    );
  };

  const resumeNativeSession = async () => {
    await runRuntimeAction(
      "Continuando sesion interna...",
      resumeInternalRuntime,
      "Sesion interna activa.",
    );
  };

  const stopNativeSession = async () => {
    await runRuntimeAction(
      "Deteniendo sesion interna...",
      stopInternalRuntime,
      "Sesion interna detenida.",
    );
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
    setMessage("Sesion interna experimental activa...");

    let framesRendered = 0;

    try {
      while (!debugLoopCancelRequestedRef.current) {
        const nextStatus = await runInternalRuntimeFrameLoop({
          maxFrames: activePerformancePreset.batchFrames,
          targetFps: activePerformancePreset.targetFps,
        });
        applyRuntimeStatus(nextStatus);

        const nextSnapshot = await getLatestInternalRuntimeFrameSnapshotBase64();
        const didRenderSnapshot = renderSnapshotBase64(nextSnapshot, { silent: true });
        await drainAndEnqueueAudio();

        if (!didRenderSnapshot) {
          throw new Error("No se pudo renderizar el snapshot de la sesion interna.");
        }

        const renderedThisBatch =
          nextStatus.frameLoop?.framesRun ?? activePerformancePreset.batchFrames;
        framesRendered += renderedThisBatch;
        setDebugLoopFramesRendered(framesRendered);
        setStatus("ready");
        if (framesRendered % 30 === 0) {
          setMessage(`Sesion interna activa - frames: ${framesRendered}`);
        }
      }

      setStatus("ready");
      setMessage("Sesion interna detenida.");
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
    setMessage("Deteniendo sesion interna...");

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

  const handleKeyboardDown = (
    code: string,
    repeat: boolean,
    target: EventTarget | null,
    preventDefault: () => void,
  ) => {
    const button = keyboardJoypadMap[code];

    if (!button || isEditableTarget(target)) {
      return;
    }

    preventDefault();

    if (repeat || heldKeyboardKeysRef.current.has(code)) {
      return;
    }

    heldKeyboardKeysRef.current.add(code);
    heldKeyboardButtonsRef.current.add(button);
    void setKeyboardButton(button, true);
  };

  const handleKeyboardUp = (
    code: string,
    target: EventTarget | null,
    preventDefault: () => void,
  ) => {
    const button = keyboardJoypadMap[code];

    if (!button || isEditableTarget(target)) {
      return;
    }

    preventDefault();
    heldKeyboardKeysRef.current.delete(code);
    heldKeyboardButtonsRef.current.delete(button);
    void setKeyboardButton(button, false);
  };

  const handleKeyboardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    handleKeyboardDown(
      event.code,
      event.repeat,
      event.target,
      () => event.preventDefault(),
    );
  };

  const handleKeyboardKeyUp = (event: KeyboardEvent<HTMLElement>) => {
    handleKeyboardUp(event.code, event.target, () => event.preventDefault());
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
      (sectionRef.current?.contains(nextTarget) ||
        keyboardTargetRef?.current?.contains(nextTarget))
    ) {
      return;
    }

    setIsKeyboardFocused(false);
    void releaseHeldKeyboardButtons();
  };

  useEffect(() => {
    const keyboardTarget = keyboardTargetRef?.current;

    if (!keyboardTarget) {
      return;
    }

    const handleTargetFocus = () => {
      setIsKeyboardFocused(true);
    };
    const handleTargetKeyDown = (event: globalThis.KeyboardEvent) => {
      handleKeyboardDown(
        event.code,
        event.repeat,
        event.target,
        () => event.preventDefault(),
      );
    };
    const handleTargetKeyUp = (event: globalThis.KeyboardEvent) => {
      handleKeyboardUp(event.code, event.target, () => event.preventDefault());
    };
    const handleTargetBlur = (event: globalThis.FocusEvent) => {
      const nextTarget = event.relatedTarget;

      if (
        nextTarget instanceof Node &&
        (sectionRef.current?.contains(nextTarget) ||
          keyboardTarget.contains(nextTarget))
      ) {
        return;
      }

      setIsKeyboardFocused(false);
      void releaseHeldKeyboardButtons();
    };

    keyboardTarget.addEventListener("focus", handleTargetFocus);
    keyboardTarget.addEventListener("keydown", handleTargetKeyDown);
    keyboardTarget.addEventListener("keyup", handleTargetKeyUp);
    keyboardTarget.addEventListener("blur", handleTargetBlur);

    return () => {
      keyboardTarget.removeEventListener("focus", handleTargetFocus);
      keyboardTarget.removeEventListener("keydown", handleTargetKeyDown);
      keyboardTarget.removeEventListener("keyup", handleTargetKeyUp);
      keyboardTarget.removeEventListener("blur", handleTargetBlur);
    };
  }, [keyboardTargetRef]);

  useEffect(() => {
    onDebugPanelCollapsedChange?.(effectiveDebugPanelCollapsed);
  }, [effectiveDebugPanelCollapsed, onDebugPanelCollapsedChange]);

  useEffect(() => {
    return () => {
      debugLoopCancelRequestedRef.current = true;

      if (debugLoopRunningRef.current) {
        void cancelInternalRuntimeFrameLoop();
      }

      stopAudioDrainInterval();
      isAudioDebugEnabledRef.current = false;
      void clearInternalRuntimeAudioBuffer();
      void audioContextRef.current?.close();
      onDebugLoopRunningChange?.(false);
      onDebugPanelCollapsedChange?.(false);
    };
  }, [onDebugLoopRunningChange, onDebugPanelCollapsedChange]);

  const previewClassName = [
    "internal-frame-preview",
    isKeyboardFocused ? "internal-frame-preview--keyboard-focused" : "",
    effectiveDebugPanelCollapsed ? "internal-frame-preview--collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      ref={sectionRef}
      className={previewClassName}
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
          {showCollapseToggle ? (
            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                setIsDebugPanelCollapsed((currentValue) => !currentValue)
              }
            >
              {effectiveDebugPanelCollapsed ? "Mostrar debug" : "Ocultar debug"}
            </button>
          ) : null}
          {!effectiveDebugPanelCollapsed ? (
            <>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void refreshSnapshot()}
            disabled={
              isActionLoading ||
              isDebugLoopRunning ||
              (isNativeSessionActive && !isNativeSessionPaused)
            }
          >
            Renderizar ultimo frame
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void stepAndRender()}
            disabled={
              isActionLoading ||
              isDebugLoopRunning ||
              (isNativeSessionActive && !isNativeSessionPaused)
            }
          >
            Avanzar fotograma y renderizar
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void runBatchAndRender()}
            disabled={isActionLoading || isDebugLoopRunning || isNativeSessionActive}
          >
            60 fotogramas y renderizar
          </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="internal-frame-preview__compact-bar">
        <strong>
          {isNativeSessionActive
            ? isNativeSessionPaused
              ? "Sesion pausada"
              : "Sesion activa"
            : "Sesion detenida"}
        </strong>
        <span>{`Frames: ${
          runtimeStatus?.sessionInfo?.framesRun ??
          runtimeStatus?.steppedFrames ??
          0
        }`}</span>
        <span>{`FPS core: ${
          runtimeStatus?.sessionInfo?.targetFps ??
          runtimeStatus?.avInfo?.fps ??
          0
        }`}</span>
        <span>{isAudioContextRunning ? "Audio debug activo" : "Audio apagado"}</span>
        <span>{`Buffer audio: ${audioInfo?.bufferedFrames ?? 0}`}</span>
        <span>{`Ultimo chunk: ${lastAudioChunkFrames}`}</span>
        <label className="internal-frame-preview__preset">
          <span>Rendimiento</span>
          <select
            value={performancePreset}
            onChange={(event) =>
              setPerformancePreset(event.target.value as InternalPerformancePreset)
            }
            disabled={isDebugLoopRunning || isNativeSessionActive}
          >
            {Object.entries(performancePresetConfig).map(([value, config]) => (
              <option key={value} value={value}>
                {config.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="primary-button"
          type="button"
          onClick={() => void startNativeSession()}
          disabled={isActionLoading || isNativeSessionActive}
        >
          Iniciar juego
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void pauseNativeSession()}
          disabled={isActionLoading || !isNativeSessionActive || isNativeSessionPaused}
        >
          Pausar
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void resumeNativeSession()}
          disabled={isActionLoading || !isNativeSessionActive || !isNativeSessionPaused}
        >
          Continuar
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void stopNativeSession()}
          disabled={isActionLoading || !isNativeSessionActive}
        >
          Detener
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() =>
            isAudioDebugEnabled
              ? void disableAudioDebug()
              : void enableAudioDebug()
          }
        >
          {isAudioDebugEnabled ? "Desactivar audio" : "Activar audio"}
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void saveSaveMemory()}
          disabled={disableRuntimeLifecycleActions}
        >
          Guardar SRAM
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void clearJoypadButtons()}
          disabled={isActionLoading}
        >
          Limpiar botones
        </button>
      </div>

      {!effectiveDebugPanelCollapsed ? (
        <>
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
            disabled={disableRuntimeLifecycleActions}
          >
            Leer estado
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void prepareRuntime()}
            disabled={disableRuntimeLifecycleActions || !hasPrepareConfig}
          >
            Preparar
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void loadCore()}
            disabled={disableRuntimeLifecycleActions}
          >
            Cargar core
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void initCore()}
            disabled={disableRuntimeLifecycleActions}
          >
            Inicializar core
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void loadGame()}
            disabled={disableRuntimeLifecycleActions}
          >
            Cargar ROM
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void refreshSaveMemory()}
            disabled={disableRuntimeLifecycleActions}
          >
            Actualizar memoria
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void loadSaveMemory()}
            disabled={disableRuntimeLifecycleActions}
          >
            Cargar SRAM
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void saveSaveMemory()}
            disabled={disableRuntimeLifecycleActions}
          >
            Guardar SRAM
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => void prepareLoadCoreInitLoadRom()}
            disabled={disableRuntimeLifecycleActions || !hasPrepareConfig}
          >
            Preparar + cargar ROM
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void prepareLoadCoreInitLoadRomAndSram()}
            disabled={disableRuntimeLifecycleActions || !hasPrepareConfig}
          >
            Preparar + cargar ROM + SRAM
          </button>
        </div>
      </div>

      <div className="internal-frame-preview__loop">
        <strong>Loop debug por batches</strong>
        <span>{isDebugLoopRunning ? "Activo" : "Inactivo"}</span>
        <span>{`Preset: ${activePerformancePreset.label}`}</span>
        <span>{`Batch: ${activePerformancePreset.batchFrames} frames`}</span>
        <span>{`Objetivo: ${activePerformancePreset.targetFps} FPS`}</span>
        <span>{`Renderizados: ${debugLoopFramesRendered}`}</span>
        <span>Fallback debug: usa invoke y snapshots, no es el flujo principal.</span>
        <div className="internal-frame-preview__loop-buttons">
          <button
            className="primary-button"
            type="button"
            onClick={() => void startDebugRenderLoop()}
            disabled={isActionLoading || isDebugLoopRunning || isNativeSessionActive}
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
          Experimental: drena audio cada {DEBUG_AUDIO_DRAIN_INTERVAL_MS}ms
          mientras esta activo. Puede desincronizarse.
        </span>
        <span>{isAudioContextRunning ? "AudioContext running" : "Audio apagado"}</span>
        <span>{audioDebugMessage}</span>
        <span>{`Ultimo chunk: ${lastAudioChunkFrames} frames`}</span>
        <span>{`Frecuencia: ${audioInfo?.sampleRate ?? 0}`}</span>
        <span>{`Buffer: ${audioInfo?.bufferedFrames ?? 0} frames de audio`}</span>
        <span>{`Capturados: ${audioInfo?.totalFramesCaptured ?? 0}`}</span>
        <span>{`Drenados: ${audioInfo?.totalFramesDrained ?? 0}`}</span>
        <span>{`Descartados: ${audioInfo?.droppedFrames ?? 0}`}</span>
        {lastAudioError ? <span>{`Error frontend: ${lastAudioError}`}</span> : null}
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
            disabled={disableRuntimeLifecycleActions}
          >
            Actualizar memoria
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void loadSaveMemory()}
            disabled={disableRuntimeLifecycleActions}
          >
            Cargar SRAM
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void saveSaveMemory()}
            disabled={disableRuntimeLifecycleActions}
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
        </>
      ) : null}
    </section>
  );
}
