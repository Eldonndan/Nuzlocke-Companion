import { useEffect, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { EmulatorConfigPanel } from "../components/emulator/EmulatorConfigPanel";
import { InternalRuntimeDisplayController } from "../components/emulator/InternalRuntimeDisplayController";
import {
  InternalRuntimeFramePreview,
  type InternalRuntimeFramePreviewHandle,
} from "../components/emulator/InternalRuntimeFramePreview";
import { QuickEditPanel } from "../components/edit/QuickEditPanel";
import {
  GameplayFrame,
  getConsoleViewportProfileForPlatform,
} from "../components/layout/GameplayFrame";
import {
  InternalPlaySidePanel,
  type InternalPlayTab,
} from "../components/layout/InternalPlaySidePanel";
import { BadgePanel } from "../components/status/BadgePanel";
import { CaptureStatusPanel } from "../components/status/CaptureStatusPanel";
import { LevelCapPanel } from "../components/status/LevelCapPanel";
import { LivesCounter } from "../components/status/LivesCounter";
import { RoutePanel } from "../components/status/RoutePanel";
import { TeamPanel } from "../components/team/TeamPanel";
import type {
  Badge,
  CapturedFrame,
  CaptureSessionStatus,
  CaptureStatus,
  CaptureWindow,
  DockedWindowInfo,
  HostRect,
  RuntimeConfig,
  LiveCaptureFrame,
  OverlayAction,
  PokemonSlot,
  RunState,
} from "../shared/types";
import {
  captureWindowFrame,
  detectEmulatorWindow,
  dockEmulatorWindow,
  findMgbaWindows,
  focusEmulatorWindow,
  focusMainWindow,
  getCaptureStatus,
  hideOverlay,
  launchEmulator,
  minimizeMainWindow,
  positionEmulatorWindow,
  positionOverlayWindow,
  selectEmulatorExecutable,
  selectLibretroCoreFile,
  selectRomFile,
  selectSaveDirectory,
  setOverlayClickThrough,
  showOverlay,
  showMainWindow,
  resizeDockedEmulator,
  startCaptureSession,
  stopCaptureSession,
  undockEmulatorWindow,
} from "../utils/emulatorCommands";
import {
  clearSavedRun,
  cloneRunState,
  loadSavedRun,
  saveRun,
} from "../utils/runStorage";
import type {
  InternalFrameInfo,
  InternalFrameSnapshotBase64,
  InternalRuntimeStatus,
} from "../utils/internalRuntimeCommands";
import {
  clearInternalRuntimeJoypadButtons,
  loadInternalRuntimeSaveMemoryFromDisk,
  pauseInternalRuntime,
  refreshInternalRuntimeSaveMemoryInfo,
  resumeInternalRuntime,
  saveInternalRuntimeMemoryToDisk,
  startInternalRuntime,
  stopInternalRuntime,
} from "../utils/internalRuntimeCommands";
import { keyboardControlHints } from "../utils/internalInputMapping";
import {
  createDefaultLegacyExternalRuntimeConfig,
  getRunRuntimeConfig,
  isInternalLibretroRuntime,
  isLegacyExternalRuntime,
  withRunRuntimeConfig,
} from "../utils/runtimeConfig";

type MainPlayScreenProps = {
  run: RunState;
  onExit: () => void;
};

type CaptureFps = 30 | 60;

const captureStatusOrder: CaptureStatus[] = [
  "available",
  "used",
  "failed",
  "not-applicable",
];

const fpsOptions: CaptureFps[] = [30, 60];
const overlayLayoutStorageKey = "nuzlocke-companion.overlay-layout";
const legacyExternalOnlyMessage =
  "Esta acción pertenece al modo legacy externo. El runtime interno se controla desde el panel Libretro.";

type OverlayLayout = {
  x: number;
  y: number;
  emulatorWidth: number;
  emulatorHeight: number;
  overlayWidth: number;
  overlayHeight: number;
};

function getNextLevelCap(badges: Badge[]) {
  const badgesWithCaps = badges.filter(
    (badge) => typeof badge.levelCap === "number",
  );

  if (badgesWithCaps.length === 0) {
    return null;
  }

  const nextBadge = badgesWithCaps.find((badge) => !badge.obtained);
  return nextBadge?.levelCap ?? badgesWithCaps[badgesWithCaps.length - 1].levelCap;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function getDefaultOverlayLayout(): OverlayLayout {
  return {
    x: Math.max(40, window.screenX + 24),
    y: Math.max(40, window.screenY + 84),
    emulatorWidth: 960,
    emulatorHeight: 640,
    overlayWidth: 1280,
    overlayHeight: 760,
  };
}

function loadOverlayLayout(): OverlayLayout {
  try {
    const savedLayout = window.localStorage.getItem(overlayLayoutStorageKey);
    if (!savedLayout) {
      return getDefaultOverlayLayout();
    }

    const parsedLayout = JSON.parse(savedLayout) as Partial<OverlayLayout>;
    return {
      ...getDefaultOverlayLayout(),
      ...parsedLayout,
    };
  } catch {
    return getDefaultOverlayLayout();
  }
}

function saveOverlayLayout(layout: OverlayLayout) {
  window.localStorage.setItem(overlayLayoutStorageKey, JSON.stringify(layout));
}

function getWindowScore(window: CaptureWindow) {
  const lowerTitle = window.title.toLowerCase();
  const titleScore = lowerTitle.includes("mgba")
    ? 3000
    : lowerTitle.includes("pokemon") || lowerTitle.includes("pok\u00e9mon")
      ? 1800
      : 1000;
  return titleScore + Math.min(500_000, Math.max(0, window.width * window.height));
}

function chooseBestWindow(windows: CaptureWindow[]) {
  return [...windows].sort((firstWindow, secondWindow) =>
    getWindowScore(secondWindow) - getWindowScore(firstWindow),
  )[0] ?? null;
}

export function MainPlayScreen({ run, onExit }: MainPlayScreenProps) {
  const [runState, setRunState] = useState<RunState>(() => loadSavedRun(run));
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);
  const [isEmulatorPanelOpen, setIsEmulatorPanelOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Guardado local");
  const [sessionStatus, setSessionStatus] = useState("");
  const [capturedFrame, setCapturedFrame] = useState<CapturedFrame | null>(null);
  const [liveFrame, setLiveFrame] = useState<LiveCaptureFrame | null>(null);
  const [internalFrameSnapshotBase64, setInternalFrameSnapshotBase64] =
    useState<InternalFrameSnapshotBase64 | null>(null);
  const [internalFrameInfo, setInternalFrameInfo] =
    useState<InternalFrameInfo | null>(null);
  const [internalRuntimeStatus, setInternalRuntimeStatus] =
    useState<InternalRuntimeStatus | null>(null);
  const [internalCanvas, setInternalCanvas] =
    useState<HTMLCanvasElement | null>(null);
  const [isInternalDebugLoopRunning, setIsInternalDebugLoopRunning] =
    useState(false);
  const [isInternalDebugPanelCollapsed, setIsInternalDebugPanelCollapsed] =
    useState(false);
  const [internalAudioStateLabel, setInternalAudioStateLabel] =
    useState("Audio: armado");
  const [isInternalKeyboardFocused, setIsInternalKeyboardFocused] =
    useState(false);
  const [isInternalShutdownInProgress, setIsInternalShutdownInProgress] =
    useState(false);
  const [internalPlayTab, setInternalPlayTab] =
    useState<InternalPlayTab>("runtime");
  const [frameStatus, setFrameStatus] = useState("");
  const [captureFps, setCaptureFps] = useState<CaptureFps>(30);
  const [captureSession, setCaptureSession] = useState<CaptureSessionStatus | null>(null);
  const [isCaptureSessionRunning, setIsCaptureSessionRunning] = useState(false);
  const [dockedWindow, setDockedWindow] = useState<DockedWindowInfo | null>(null);
  const [isOverlayEditing, setIsOverlayEditing] = useState(false);
  const [overlayStatus, setOverlayStatus] = useState("Modo recomendado: modo acoplado listo");
  const [windowStatus, setWindowStatus] = useState(
    runState.captureWindow ? "Ventana detectada" : "Ventana de juego sin detectar",
  );

  const hasSavedInitialRun = useRef(false);
  const isTestFrameRequestInFlight = useRef(false);
  const gameplayScreenRef = useRef<HTMLDivElement | null>(null);
  const internalRuntimePreviewRef =
    useRef<InternalRuntimeFramePreviewHandle | null>(null);
  const isInternalRuntimeRef = useRef(false);
  const isInternalNativeSessionActiveRef = useRef(false);
  const isInternalShutdownInProgressRef = useRef(false);
  const shouldCloseAfterInternalShutdownRef = useRef(false);
  const dockResizeTimeoutRef = useRef<number | null>(null);
  const dockedWindowIdRef = useRef<string | null>(null);

  const editingPokemon =
    editingSlotIndex === null ? null : runState.team[editingSlotIndex];
  const runtimeConfig = getRunRuntimeConfig(runState);
  const consoleProfile = getConsoleViewportProfileForPlatform(runState.platform);
  const isLegacyRuntime = isLegacyExternalRuntime(runtimeConfig);
  const isInternalRuntime = isInternalLibretroRuntime(runtimeConfig);
  const emulatorConfig = isLegacyRuntime
    ? runtimeConfig
    : createDefaultLegacyExternalRuntimeConfig();
  const hasEmulatorConfigured = isLegacyRuntime && Boolean(
    emulatorConfig.executablePath && emulatorConfig.romPath,
  );
  const hasInternalRuntimeConfigured = isInternalRuntime && Boolean(
    runtimeConfig.corePath && runtimeConfig.romPath,
  );
  const disableInternalDestructiveActions =
    isInternalRuntime &&
    (isInternalDebugLoopRunning ||
      Boolean(internalRuntimeStatus?.sessionInfo?.isActive) ||
      isInternalShutdownInProgress);
  const isInternalNativeSessionActive = Boolean(
    internalRuntimeStatus?.sessionInfo?.isActive,
  );
  const isInternalNativeSessionPaused = Boolean(
    internalRuntimeStatus?.sessionInfo?.isPaused,
  );
  const internalSessionLabel = isInternalNativeSessionActive
    ? isInternalNativeSessionPaused
      ? "Pausada"
      : "Activa"
    : "Detenida";
  const saveRamInfo = internalRuntimeStatus?.saveMemory.find(
    (memory) => memory.kind === "save-ram",
  );
  const lastSaveOperation = internalRuntimeStatus?.lastSaveOperation ?? null;
  const disableInternalSaveActions =
    isInternalDebugLoopRunning ||
    isInternalNativeSessionActive ||
    isInternalShutdownInProgress;

  isInternalRuntimeRef.current = isInternalRuntime;
  isInternalNativeSessionActiveRef.current = isInternalNativeSessionActive;
  isInternalShutdownInProgressRef.current = isInternalShutdownInProgress;

  const applyInternalRuntimeStatus = (status: InternalRuntimeStatus) => {
    setInternalRuntimeStatus(status);

    if (status.lastSaveOperation?.message) {
      const savePath = status.lastSaveOperation.filePath
        ? ` ${status.lastSaveOperation.filePath}`
        : "";
      setSessionStatus(`${status.lastSaveOperation.message}${savePath}`);
    }
  };

  const ensureLegacyExternalRuntime = () => {
    if (isLegacyRuntime) {
      return true;
    }

    setSessionStatus(legacyExternalOnlyMessage);
    setOverlayStatus(legacyExternalOnlyMessage);
    return false;
  };

  const ensureInternalDebugLoopStopped = (actionLabel: string) => {
    if (
      isInternalRuntime &&
      (isInternalDebugLoopRunning || isInternalNativeSessionActive)
    ) {
      setSessionStatus(`Deten la sesion interna antes de ${actionLabel}.`);
      return false;
    }

    return true;
  };

  const stopInternalRuntimeForAutosave = async (context: string) => {
    if (!isInternalRuntime) {
      return true;
    }

    try {
      const nextStatus = await stopInternalRuntime();
      applyInternalRuntimeStatus(nextStatus);

      if (nextStatus.lastSaveOperation?.saved) {
        setSessionStatus(
          `Autosave SRAM completado: ${nextStatus.lastSaveOperation.filePath}`,
        );
      }

      return true;
    } catch (error) {
      setSessionStatus(
        typeof error === "string"
          ? error
          : `No se pudo detener el runtime interno antes de ${context}.`,
      );
      return false;
    }
  };

  const stopInternalRuntimeBeforeWindowClose = async () => {
    if (isInternalShutdownInProgressRef.current) {
      setSessionStatus("Guardando SRAM antes de cerrar...");
      return;
    }

    isInternalShutdownInProgressRef.current = true;
    setIsInternalShutdownInProgress(true);
    setSessionStatus("Guardando SRAM antes de cerrar...");

    try {
      const nextStatus = await stopInternalRuntime();
      applyInternalRuntimeStatus(nextStatus);

      if (nextStatus.lastSaveOperation?.saved) {
        setSessionStatus(
          `SRAM guardada. Cerrando... ${nextStatus.lastSaveOperation.filePath}`,
        );
      } else {
        setSessionStatus("Sesion detenida. Cerrando...");
      }

      shouldCloseAfterInternalShutdownRef.current = true;
      await getCurrentWindow().destroy();
    } catch (error) {
      shouldCloseAfterInternalShutdownRef.current = false;
      isInternalShutdownInProgressRef.current = false;
      setIsInternalShutdownInProgress(false);
      const errorMessage =
        typeof error === "string"
          ? error
          : "Deten la sesion manualmente o revisa el directorio de guardado.";
      setSessionStatus(
        `No se pudo guardar SRAM antes de cerrar. ${errorMessage}`,
      );
    }
  };

  const runInternalSaveAction = async (
    action: () => Promise<InternalRuntimeStatus>,
    fallbackMessage: string,
  ) => {
    if (disableInternalSaveActions) {
      setSessionStatus(
        "Deten la sesion interna antes de guardar o cargar SRAM manualmente.",
      );
      return;
    }

    try {
      const nextStatus = await action();
      applyInternalRuntimeStatus(nextStatus);
      setSessionStatus(
        nextStatus.lastSaveOperation?.message ?? fallbackMessage,
      );
    } catch (error) {
      setSessionStatus(
        typeof error === "string"
          ? error
          : "No se pudo completar la operacion de SRAM.",
      );
    }
  };

  const runInternalSessionAction = async (
    action: () => Promise<InternalRuntimeStatus>,
    successMessage: string,
  ) => {
    try {
      const nextStatus = await action();
      applyInternalRuntimeStatus(nextStatus);
      setSessionStatus(successMessage);
    } catch (error) {
      setSessionStatus(
        typeof error === "string"
          ? error
          : "No se pudo cambiar la sesion interna.",
      );
    }
  };

  const startInternalSession = () =>
    runInternalSessionAction(startInternalRuntime, "Sesion interna iniciada.");

  const pauseInternalSession = () =>
    runInternalSessionAction(pauseInternalRuntime, "Sesion interna pausada.");

  const resumeInternalSession = () =>
    runInternalSessionAction(resumeInternalRuntime, "Sesion interna continuada.");

  const stopInternalSession = async () => {
    try {
      const nextStatus = await stopInternalRuntime();
      applyInternalRuntimeStatus(nextStatus);
      if (nextStatus.lastSaveOperation?.saved) {
        setSessionStatus(
          `Autosave SRAM completado: ${nextStatus.lastSaveOperation.filePath}`,
        );
      } else {
        setSessionStatus("Sesion interna detenida.");
      }
    } catch (error) {
      setSessionStatus(
        typeof error === "string"
          ? error
          : "No se pudo detener la sesion interna.",
      );
    }
  };

  const toggleInternalAudio = async () => {
    try {
      if (internalAudioStateLabel === "Audio: activo") {
        await internalRuntimePreviewRef.current?.disableAudioDebug();
        setSessionStatus("Audio apagado.");
        return;
      }

      await internalRuntimePreviewRef.current?.enableAudioDebug();
      setSessionStatus("Audio activo.");
    } catch (error) {
      setSessionStatus(
        typeof error === "string"
          ? error
          : "No se pudo cambiar el audio interno.",
      );
    }
  };

  const clearInternalHeldButtons = async () => {
    try {
      const nextStatus = await clearInternalRuntimeJoypadButtons();
      applyInternalRuntimeStatus(nextStatus);
      setSessionStatus("Botones soltados.");
    } catch (error) {
      setSessionStatus(
        typeof error === "string"
          ? error
          : "No se pudieron soltar los botones.",
      );
    }
  };

  const refreshInternalSaveMemory = () =>
    runInternalSaveAction(
      refreshInternalRuntimeSaveMemoryInfo,
      "Memoria de guardado actualizada.",
    );

  const loadInternalSaveMemory = () =>
    runInternalSaveAction(
      () => loadInternalRuntimeSaveMemoryFromDisk("save-ram"),
      "SRAM cargada.",
    );

  const saveInternalSaveMemory = () =>
    runInternalSaveAction(
      () => saveInternalRuntimeMemoryToDisk("save-ram"),
      "SRAM guardada.",
    );

  const getGameplayHostRect = (): HostRect | null => {
    const gameplayElement = gameplayScreenRef.current;

    if (!gameplayElement) {
      return null;
    }

    const rect = gameplayElement.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    return {
      x: Math.round(window.screenX + rect.left),
      y: Math.round(window.screenY + rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      coordinateSpace: "screen",
    };
  };

  const findExistingMgbaWindow = async () => {
    const existingWindows = await findMgbaWindows();
    return chooseBestWindow(existingWindows);
  };

  const reacomodarDockedGame = async () => {
    if (!dockedWindow) {
      setOverlayStatus("No hay juego acoplado para reacomodar.");
      return;
    }

    const hostRect = getGameplayHostRect();
    if (!hostRect) {
      setOverlayStatus("No se pudo calcular el cuadro de juego.");
      return;
    }

    try {
      await resizeDockedEmulator(dockedWindow.windowId, hostRect);
      setOverlayStatus("Juego reacomodado.");
    } catch {
      setOverlayStatus("No se pudo reacomodar el juego.");
    }
  };

  const undockCurrentGame = async () => {
    if (!dockedWindow) {
      return;
    }

    try {
      await undockEmulatorWindow(dockedWindow.windowId);
      dockedWindowIdRef.current = null;
      setDockedWindow(null);
      setOverlayStatus("Juego desacoplado.");
    } catch (error) {
      setOverlayStatus(
        typeof error === "string" ? error : "No se pudo desacoplar el juego.",
      );
    }
  };

  const getCaptureStatusLabel = (status: CaptureSessionStatus) => {
    if (!status.isActive) {
      return status.lastError ? "Error de captura" : "Captura detenida";
    }

    const requestedFps = status.requestedFps ?? captureFps;
    const roundedEffectiveFps = Math.round(status.effectiveFps);

    if (roundedEffectiveFps > 0) {
      return `Capturando a ${requestedFps} FPS · ${roundedEffectiveFps} reales`;
    }

    return `Capturando a ${requestedFps} FPS`;
  };

  const applyCaptureSessionStatus = (status: CaptureSessionStatus) => {
    setCaptureSession(status);
    setIsCaptureSessionRunning(status.isActive);
    setFrameStatus(getCaptureStatusLabel(status));
  };

  const stopNativeCapture = async (status = "Captura detenida") => {
    try {
      const nextStatus = await stopCaptureSession();
      setCaptureSession(nextStatus);
    } catch {
      setCaptureSession(null);
    } finally {
      setIsCaptureSessionRunning(false);
      setFrameStatus(status);
    }
  };

  const startNativeCapture = async (
    captureWindow: CaptureWindow | undefined,
    fps = captureFps,
  ) => {
    if (!captureWindow) {
      setFrameStatus("No hay ventana de juego para capturar.");
      return;
    }

    setFrameStatus("Iniciando captura");
    setIsCaptureSessionRunning(false);

    try {
      const status = await startCaptureSession(captureWindow.windowId, fps);
      applyCaptureSessionStatus(status);
    } catch (error) {
      setIsCaptureSessionRunning(false);
      setFrameStatus(
        typeof error === "string" ? error : "Error de captura",
      );
    }
  };

  const captureTestFrame = async (windowId: string) => {
    if (isTestFrameRequestInFlight.current) {
      return false;
    }

    isTestFrameRequestInFlight.current = true;

    try {
      const frame = await captureWindowFrame(windowId);
      setCapturedFrame(frame);
      setFrameStatus("Frame de prueba capturado");
      return true;
    } catch (error) {
      setFrameStatus(
        typeof error === "string" ? error : "Error de captura",
      );
      return false;
    } finally {
      isTestFrameRequestInFlight.current = false;
    }
  };

  const updatePokemonSlot = (pokemon: PokemonSlot) => {
    if (editingSlotIndex === null) {
      return;
    }

    setRunState((currentRun) => ({
      ...currentRun,
      team: currentRun.team.map((currentPokemon, index) =>
        index === editingSlotIndex ? pokemon : currentPokemon,
      ),
    }));
  };

  const updateRuntimeConfig = async (config: RuntimeConfig) => {
    if (!ensureInternalDebugLoopStopped("cambiar el runtime")) {
      return;
    }

    const canContinue = await stopInternalRuntimeForAutosave(
      "cambiar la configuracion",
    );
    if (!canContinue) {
      return;
    }

    void stopNativeCapture("Captura detenida");
    void hideOverlay();
    void undockCurrentGame();
    setCapturedFrame(null);
    setLiveFrame(null);
    setCaptureSession(null);
    setIsCaptureSessionRunning(false);
    setDockedWindow(null);
    setInternalFrameSnapshotBase64(null);
    setInternalFrameInfo(null);
    setInternalRuntimeStatus(null);
    setRunState((currentRun) => ({
      ...withRunRuntimeConfig(currentRun, config),
      captureWindow: undefined,
    }));
    setWindowStatus("Ventana de juego sin detectar");
  };

  const updateLives = (delta: number) => {
    setRunState((currentRun) => ({
      ...currentRun,
      lives: Math.max(0, currentRun.lives + delta),
    }));
  };

  const toggleBadge = (badgeId: string) => {
    setRunState((currentRun) => {
      const nextBadges = currentRun.badges.map((badge) =>
        badge.id === badgeId ? { ...badge, obtained: !badge.obtained } : badge,
      );

      return {
        ...currentRun,
        badges: nextBadges,
        levelCap: getNextLevelCap(nextBadges) ?? currentRun.levelCap,
      };
    });
  };

  const updateLevelCap = (levelCap: number) => {
    setRunState((currentRun) => ({
      ...currentRun,
      levelCap: Number.isFinite(levelCap)
        ? Math.max(1, levelCap)
        : currentRun.levelCap,
    }));
  };

  const updateRoute = (routeName: string) => {
    setRunState((currentRun) => ({
      ...currentRun,
      currentRoute: {
        ...currentRun.currentRoute,
        name: routeName,
      },
    }));
  };

  const cycleCaptureStatus = () => {
    setRunState((currentRun) => {
      const currentIndex = captureStatusOrder.indexOf(currentRun.captureStatus);
      const nextStatus =
        captureStatusOrder[(currentIndex + 1) % captureStatusOrder.length];

      return {
        ...currentRun,
        captureStatus: nextStatus,
      };
    });
  };

  const setOverlayEditMode = async (enabled: boolean) => {
    setIsOverlayEditing(enabled);
    await emit("overlay-edit-mode", enabled);

    try {
      await setOverlayClickThrough(!enabled);

      if (!enabled && runState.captureWindow) {
        await focusEmulatorWindow(runState.captureWindow.windowId);
      }
    } catch (error) {
      setOverlayStatus(
        typeof error === "string"
          ? error
          : enabled
            ? "No se pudo activar el modo edición."
            : "No se pudo devolver el foco a mGBA.",
      );
    }
  };

  const restoreMainAppFromOverlay = async () => {
    try {
      await setOverlayClickThrough(false);
      await emit("overlay-edit-mode", false);
      setIsOverlayEditing(false);
      await hideOverlay();
      await showMainWindow();
      await focusMainWindow();
      setOverlayStatus("Ventana principal restaurada.");
    } catch (error) {
      setOverlayStatus(
        typeof error === "string"
          ? error
          : "No se pudo volver a la app principal.",
      );
    }
  };

  const applyOverlayAction = (action: OverlayAction) => {
    if (action.type === "increase-lives") {
      updateLives(1);
      return;
    }

    if (action.type === "decrease-lives") {
      updateLives(-1);
      return;
    }

    if (action.type === "cycle-capture-status") {
      cycleCaptureStatus();
      return;
    }

    if (action.type === "set-route") {
      updateRoute(action.routeName);
      return;
    }

    if (action.type === "set-level-cap") {
      updateLevelCap(action.levelCap);
      return;
    }

    if (action.type === "close-edit-mode") {
      void setOverlayEditMode(false);
      return;
    }

    if (action.type === "restore-main-window") {
      void restoreMainAppFromOverlay();
    }
  };

  const handleOverlayHotkey = (shortcut: string) => {
    if (shortcut === "F8") {
      updateLives(-1);
      return;
    }

    if (shortcut === "F9") {
      updateLives(1);
      return;
    }

    if (shortcut === "F10") {
      cycleCaptureStatus();
      return;
    }

    if (shortcut === "F11") {
      void setOverlayEditMode(true);
      setOverlayStatus("Modo edición: cambia la ruta actual.");
      return;
    }

    if (shortcut === "F12") {
      void setOverlayEditMode(!isOverlayEditing);
    }
  };

  const detectWindowForProcess = async (processId: number, retry = false) => {
    setWindowStatus("Esperando ventana...");

    const attempts = retry ? 10 : 1;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        if (attempt > 0) {
          await wait(350);
        }

        const captureWindow = await detectEmulatorWindow(processId);

        setRunState((currentRun) => ({
          ...currentRun,
          captureWindow,
        }));
        setWindowStatus("Ventana detectada");
        return captureWindow;
      } catch (error) {
        if (attempt === attempts - 1) {
          setWindowStatus(
            typeof error === "string"
              ? error
              : "No se pudo detectar la ventana",
          );
        }
      }
    }

    return null;
  };

  const detectConfiguredWindow = async () => {
    if (!ensureLegacyExternalRuntime()) {
      return;
    }

    const processId = emulatorConfig.lastLaunchedProcessId;

    if (!processId) {
      setWindowStatus("Inicia mGBA antes de detectar la ventana.");
      return;
    }

    await detectWindowForProcess(processId);
  };

  const startGameSession = async () => {
    if (!ensureLegacyExternalRuntime()) {
      return;
    }

    if (!hasEmulatorConfigured) {
      setSessionStatus("Configura el emulador para jugar");
      setIsEmulatorPanelOpen(true);
      return;
    }

    await stopNativeCapture("");
    setSessionStatus("Iniciando mGBA...");
    setWindowStatus("Esperando ventana...");

    try {
      const result = await launchEmulator(
        emulatorConfig.executablePath,
        emulatorConfig.romPath,
        emulatorConfig.launchArgs,
      );

      setRunState((currentRun) => ({
        ...withRunRuntimeConfig(currentRun, {
          ...emulatorConfig,
          lastLaunchedProcessId: result.processId ?? undefined,
        }),
        captureWindow: undefined,
      }));

      if (!result.processId) {
        setWindowStatus("No se pudo detectar la ventana");
        setSessionStatus("mGBA iniciado, pero no se recibió PID.");
        return;
      }

      const captureWindow = await detectWindowForProcess(result.processId, true);

      if (!captureWindow) {
        setSessionStatus("No se pudo detectar la ventana");
        return;
      }

      setSessionStatus("Ventana detectada");
      await startNativeCapture(captureWindow, captureFps);
    } catch (error) {
      setSessionStatus(
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "No se pudo iniciar la sesión de juego.",
      );
      setWindowStatus("No se pudo detectar la ventana");
    }
  };

  const startDockedSession = async () => {
    if (!ensureLegacyExternalRuntime()) {
      return;
    }

    await stopNativeCapture("");
    await hideOverlay();
    setSessionStatus("Preparando modo acoplado...");
    setOverlayStatus("Buscando mGBA abierto...");
    setWindowStatus("Esperando ventana...");

    try {
      const runDockedStep = async <T,>(
        label: string,
        operation: () => Promise<T>,
      ) => {
        setOverlayStatus(`${label}...`);

        try {
          return await operation();
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : typeof error === "string"
                ? error
                : "Error desconocido.";
          throw new Error(`${label}: ${message}`);
        }
      };

      let captureWindow = await runDockedStep("Buscando mGBA abierto", async () => {
        const foundWindow = await findExistingMgbaWindow();
        if (foundWindow) {
          setWindowStatus("mGBA abierto encontrado");
        }
        return foundWindow;
      });
      let lastLaunchedProcessId = emulatorConfig.lastLaunchedProcessId;

      if (!captureWindow) {
        if (!hasEmulatorConfigured) {
          setIsEmulatorPanelOpen(true);
          throw new Error(
            "No se encontró una ventana de mGBA. Configura el emulador y la ROM para abrirlo.",
          );
        }

        let launchResult;
        try {
          launchResult = await runDockedStep("Abriendo mGBA", () =>
            launchEmulator(
              emulatorConfig.executablePath,
              emulatorConfig.romPath,
              emulatorConfig.launchArgs,
            ),
          );
          lastLaunchedProcessId = launchResult.processId ?? undefined;
        } catch {
          captureWindow = await findExistingMgbaWindow();

          if (!captureWindow) {
            throw new Error(
              "No se pudo abrir mGBA. Revisa que la ruta apunte a mGBA.exe y que tengas permisos para ejecutarlo. Si mGBA está ejecutándose como administrador, abre Nuzlocke Companion también como administrador o ejecuta ambos sin permisos elevados.",
            );
          }
        }

        if (!captureWindow && launchResult?.processId) {
          captureWindow = await runDockedStep("Detectando ventana", async () => {
            const detectedWindow = await detectWindowForProcess(launchResult.processId ?? 0, true);

            if (!detectedWindow) {
              throw new Error("No se encontró una ventana de mGBA.");
            }

            return detectedWindow;
          });
        }
      }

      if (!captureWindow) {
        throw new Error("No se encontró una ventana de mGBA.");
      }

      const hostRect = getGameplayHostRect();
      if (!hostRect) {
        throw new Error("No se pudo calcular el cuadro de juego.");
      }

      const dockTargetWindow = captureWindow;
      const dockedInfo = await runDockedStep("Acoplando mGBA", () =>
        dockEmulatorWindow(dockTargetWindow.windowId, hostRect),
      );
      await runDockedStep("Enfocando mGBA", () =>
        focusEmulatorWindow(dockTargetWindow.windowId),
      );

      const dockedRunState: RunState = {
        ...withRunRuntimeConfig(runState, {
          ...emulatorConfig,
          lastLaunchedProcessId,
        }),
        captureWindow: dockTargetWindow,
      };

      setDockedWindow(dockedInfo);
      dockedWindowIdRef.current = dockedInfo.windowId;
      setRunState(dockedRunState);
      await emit("run-state-updated", dockedRunState);
      setWindowStatus("mGBA acoplado");
      setSessionStatus("Haz click en el juego para jugar");
      setOverlayStatus("mGBA acoplado. Haz click en el juego para jugar.");
    } catch (error) {
      setOverlayStatus(
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "No se pudo iniciar el modo acoplado.",
      );
    }
  };

  const startOverlaySession = async () => {
    if (!ensureLegacyExternalRuntime()) {
      return;
    }

    await stopNativeCapture("");
    setSessionStatus("Preparando modo overlay...");
    setOverlayStatus("Buscando mGBA abierto...");
    setWindowStatus("Esperando ventana...");

    try {
      const runOverlayStep = async <T,>(
        label: string,
        operation: () => Promise<T>,
      ) => {
        setOverlayStatus(`${label}...`);

        try {
          return await operation();
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : typeof error === "string"
                ? error
                : "Error desconocido.";
          throw new Error(`${label}: ${message}`);
        }
      };

      const findExistingMgbaWindow = async () => {
        const existingWindows = await findMgbaWindows();
        const selectedWindow = chooseBestWindow(existingWindows);

        if (selectedWindow) {
          const status =
            existingWindows.length > 1
              ? "mGBA abierto encontrado; se eligió la mejor ventana."
              : "mGBA abierto encontrado";
          setWindowStatus(status);
          setOverlayStatus("mGBA abierto encontrado");
          return selectedWindow;
        }

        return null;
      };

      let captureWindow: CaptureWindow | null = null;
      let lastLaunchedProcessId = emulatorConfig.lastLaunchedProcessId;

      if (runState.captureWindow) {
        const existingWindows = await findMgbaWindows();
        captureWindow =
          existingWindows.find(
            (window) => window.windowId === runState.captureWindow?.windowId,
          ) ?? chooseBestWindow(existingWindows);

        if (captureWindow) {
          setWindowStatus("mGBA abierto encontrado");
          setOverlayStatus("mGBA abierto encontrado");
        }
      }

      if (!captureWindow) {
        captureWindow = await runOverlayStep("Buscando mGBA abierto", findExistingMgbaWindow);
      }

      if (!captureWindow) {
        if (!hasEmulatorConfigured) {
          setIsEmulatorPanelOpen(true);
          throw new Error(
            "No se encontró mGBA abierto. Configura el emulador y la ROM para poder abrirlo.",
          );
        }

        let launchResult;

        try {
          launchResult = await runOverlayStep("Abriendo mGBA", () =>
            launchEmulator(
              emulatorConfig.executablePath,
              emulatorConfig.romPath,
              emulatorConfig.launchArgs,
            ),
          );
          lastLaunchedProcessId = launchResult.processId ?? undefined;
        } catch {
          captureWindow = await findExistingMgbaWindow();

          if (!captureWindow) {
            throw new Error(
              "No se pudo abrir mGBA. Revisa que la ruta apunte a mGBA.exe y que tengas permisos para ejecutarlo.",
            );
          }
        }

        if (!captureWindow && launchResult?.processId) {
          captureWindow = await runOverlayStep("Detectando ventana", async () => {
            const detectedWindow = await detectWindowForProcess(launchResult.processId ?? 0, true);

            if (!detectedWindow) {
              throw new Error("No se encontró una ventana visible de mGBA.");
            }

            return detectedWindow;
          });
        }
      }

      if (!captureWindow) {
        throw new Error("No se pudo iniciar el modo overlay: no se encontró una ventana de mGBA.");
      }

      const layout = loadOverlayLayout();
      const overlayRunState: RunState = {
        ...withRunRuntimeConfig(runState, {
          ...emulatorConfig,
          lastLaunchedProcessId,
        }),
        captureWindow,
      };

      await runOverlayStep("Posicionando ventanas", async () => {
        await positionEmulatorWindow(
          captureWindow.windowId,
          layout.x,
          layout.y,
          layout.emulatorWidth,
          layout.emulatorHeight,
        );
        await positionOverlayWindow(
          layout.x,
          layout.y,
          layout.overlayWidth,
          layout.overlayHeight,
        );
      });
      saveOverlayLayout(layout);
      await runOverlayStep("Mostrando overlay", showOverlay);
      setRunState(overlayRunState);
      await emit("run-state-updated", overlayRunState);
      await runOverlayStep("Desactivando modo edición", async () => {
        setIsOverlayEditing(false);
        await emit("overlay-edit-mode", false);
      });
      await runOverlayStep("Activando click-through", () => setOverlayClickThrough(true));
      await runOverlayStep("Enfocando mGBA", () => focusEmulatorWindow(captureWindow.windowId));
      setOverlayStatus("mGBA enfocado");
      await runOverlayStep("Minimizando ventana principal", minimizeMainWindow);

      setSessionStatus("mGBA listo");
      setOverlayStatus("Overlay activo");
    } catch (error) {
      setOverlayStatus(
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "No se pudo iniciar el modo overlay.",
      );
    }
  };

  const captureDetectedWindowFrame = async () => {
    if (!ensureLegacyExternalRuntime()) {
      return;
    }

    if (!runState.captureWindow) {
      setFrameStatus("Detecta una ventana antes de capturar.");
      return;
    }

    setFrameStatus("Capturando frame de prueba...");
    await captureTestFrame(runState.captureWindow.windowId);
  };

  const chooseEmulator = async () => {
    try {
      return await selectEmulatorExecutable();
    } catch {
      setSessionStatus("No se pudo abrir el selector del emulador.");
      return null;
    }
  };

  const chooseRom = async () => {
    try {
      return await selectRomFile();
    } catch {
      setSessionStatus("No se pudo abrir el selector de ROM.");
      return null;
    }
  };

  const chooseLibretroCore = async () => {
    try {
      return await selectLibretroCoreFile();
    } catch {
      setSessionStatus("No se pudo abrir el selector del core Libretro.");
      return null;
    }
  };

  const chooseSaveDirectory = async () => {
    try {
      return await selectSaveDirectory();
    } catch {
      setSessionStatus("No se pudo abrir el selector del directorio de guardado.");
      return null;
    }
  };

  const resetRun = async () => {
    const shouldReset = window.confirm(
      "¿Restablecer la run? Se perderán los cambios guardados localmente.",
    );

    if (!shouldReset) {
      return;
    }

    if (!ensureInternalDebugLoopStopped("restablecer la run")) {
      return;
    }

    const canContinue = await stopInternalRuntimeForAutosave("restablecer la run");
    if (!canContinue) {
      return;
    }

    void stopNativeCapture("Captura detenida");
    void hideOverlay();
    void undockCurrentGame();
    clearSavedRun();
    setEditingSlotIndex(null);
    setCapturedFrame(null);
    setLiveFrame(null);
    setInternalFrameSnapshotBase64(null);
    setInternalFrameInfo(null);
    setInternalRuntimeStatus(null);
    setRunState(cloneRunState(run));
    setSaveStatus("Guardado local");
    setWindowStatus("Ventana de juego sin detectar");
  };

  const exitToCreateRun = async () => {
    if (!ensureInternalDebugLoopStopped("salir de la run")) {
      return;
    }

    const canContinue = await stopInternalRuntimeForAutosave("salir de la run");
    if (!canContinue) {
      return;
    }

    void stopNativeCapture("Captura detenida");
    void hideOverlay();
    void undockCurrentGame();
    setInternalFrameSnapshotBase64(null);
    setInternalFrameInfo(null);
    onExit();
  };

  useEffect(() => {
    saveRun(runState);
    void emit("run-state-updated", runState);

    if (hasSavedInitialRun.current) {
      setSaveStatus("Cambios guardados");
      return;
    }

    hasSavedInitialRun.current = true;
    setSaveStatus("Guardado local");
  }, [runState]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let isDisposed = false;

    void getCurrentWindow().onCloseRequested((event) => {
      if (shouldCloseAfterInternalShutdownRef.current) {
        return;
      }

      if (
        !isInternalRuntimeRef.current ||
        !isInternalNativeSessionActiveRef.current
      ) {
        return;
      }

      event.preventDefault();

      if (isInternalShutdownInProgressRef.current) {
        setSessionStatus("Guardando SRAM antes de cerrar...");
        return;
      }

      void stopInternalRuntimeBeforeWindowClose();
    }).then((nextUnlisten) => {
      if (isDisposed) {
        nextUnlisten();
        return;
      }

      unlisten = nextUnlisten;
    });

    return () => {
      isDisposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (
        isInternalRuntimeRef.current &&
        isInternalNativeSessionActiveRef.current &&
        !isInternalShutdownInProgressRef.current &&
        !shouldCloseAfterInternalShutdownRef.current
      ) {
        void stopInternalRuntime();
      }
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let isDisposed = false;

    void listen<LiveCaptureFrame>("capture-frame", (event) => {
      setLiveFrame(event.payload);
    }).then((nextUnlisten) => {
      if (isDisposed) {
        nextUnlisten();
        return;
      }

      unlisten = nextUnlisten;
    });

    return () => {
      isDisposed = true;
      unlisten?.();
      isTestFrameRequestInFlight.current = false;
      void stopCaptureSession();
    };
  }, []);

  useEffect(() => {
    let unlistenAction: (() => void) | null = null;
    let unlistenHotkey: (() => void) | null = null;
    let isDisposed = false;

    void listen<OverlayAction>("overlay-action", (event) => {
      applyOverlayAction(event.payload);
    }).then((unlisten) => {
      if (isDisposed) {
        unlisten();
        return;
      }
      unlistenAction = unlisten;
    });

    void listen<string>("overlay-hotkey", (event) => {
      handleOverlayHotkey(event.payload);
    }).then((unlisten) => {
      if (isDisposed) {
        unlisten();
        return;
      }
      unlistenHotkey = unlisten;
    });

    return () => {
      isDisposed = true;
      unlistenAction?.();
      unlistenHotkey?.();
    };
  }, [isOverlayEditing, runState.captureWindow, runState.lives, runState.captureStatus]);

  useEffect(() => {
    if (isInternalRuntime) {
      setCapturedFrame(null);
      setLiveFrame(null);
      setCaptureSession(null);
      setIsCaptureSessionRunning(false);
      setDockedWindow(null);
      return;
    }

    if (!isInternalRuntime) {
      setInternalFrameSnapshotBase64(null);
      setInternalFrameInfo(null);
      setInternalRuntimeStatus(null);
      setIsInternalDebugLoopRunning(false);
      setIsInternalDebugPanelCollapsed(false);
    }
  }, [isInternalRuntime]);

  useEffect(() => {
    if (!isCaptureSessionRunning) {
      return;
    }

    const statusInterval = window.setInterval(async () => {
      try {
        const status = await getCaptureStatus();
        applyCaptureSessionStatus(status);
      } catch {
        setIsCaptureSessionRunning(false);
        setFrameStatus("Error de captura");
      }
    }, 1000);

    return () => window.clearInterval(statusInterval);
  }, [isCaptureSessionRunning, captureFps]);

  useEffect(() => {
    if (!dockedWindow?.isDocked) {
      return;
    }

    const onResize = () => {
      if (dockResizeTimeoutRef.current !== null) {
        window.clearTimeout(dockResizeTimeoutRef.current);
      }

      dockResizeTimeoutRef.current = window.setTimeout(() => {
        void reacomodarDockedGame();
      }, 160);
    };

    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);

      if (dockResizeTimeoutRef.current !== null) {
        window.clearTimeout(dockResizeTimeoutRef.current);
        dockResizeTimeoutRef.current = null;
      }
    };
  }, [dockedWindow]);

  useEffect(() => {
    return () => {
      if (dockedWindowIdRef.current) {
        void undockEmulatorWindow(dockedWindowIdRef.current);
        dockedWindowIdRef.current = null;
      }
    };
  }, []);

  return (
    <main
      className={
        isInternalRuntime
          ? isInternalDebugPanelCollapsed
            ? "play-screen play-screen--internal play-screen--internal-playable play-screen--internal-debug-collapsed"
            : "play-screen play-screen--internal play-screen--internal-playable"
          : "play-screen"
      }
    >
      <header className="play-topbar">
        <div className="play-topbar__identity">
          <p className="eyebrow">Juego</p>
          <h1>{runState.gameName}</h1>
          <span>{runState.challengeType}</span>
        </div>

        <div className="play-topbar__actions">
          {isInternalRuntime ? (
            <button
              className={
                hasInternalRuntimeConfigured ? "primary-button" : "secondary-button"
              }
              type="button"
              onClick={() => setIsEmulatorPanelOpen(true)}
              disabled={disableInternalDestructiveActions}
            >
              {hasInternalRuntimeConfigured
                ? "Runtime interno configurado"
                : "Configurar runtime interno"}
            </button>
          ) : (
            <button
              className={hasEmulatorConfigured ? "primary-button" : "secondary-button"}
              type="button"
              onClick={
                hasEmulatorConfigured
                  ? startDockedSession
                  : () => setIsEmulatorPanelOpen(true)
              }
            >
              {hasEmulatorConfigured ? "Jugar en modo acoplado" : "Configurar emulador"}
            </button>
          )}
          {isLegacyRuntime ? (
            <>
              <button
                className="secondary-button"
                type="button"
                onClick={startOverlaySession}
              >
                Modo overlay
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={reacomodarDockedGame}
              >
                Reacomodar juego
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void undockCurrentGame()}
              >
                Desacoplar juego
              </button>
              {isCaptureSessionRunning ? (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void stopNativeCapture("Captura detenida")}
                >
                  Detener captura experimental
                </button>
              ) : (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={startGameSession}
                >
                  Modo captura experimental
                </button>
              )}
              <label className="fps-control">
                <span>FPS</span>
                <select
                  value={captureFps}
                  onChange={(event) => setCaptureFps(Number(event.target.value) as CaptureFps)}
                >
                  {fpsOptions.map((fps) => (
                    <option key={fps} value={fps}>
                      {fps} FPS
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="secondary-button"
                type="button"
                onClick={detectConfiguredWindow}
              >
                Detectar ventana
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={captureDetectedWindowFrame}
              >
                Capturar frame de prueba
              </button>
            </>
          ) : null}
          <button
            className="secondary-button"
            type="button"
            onClick={() => setIsEmulatorPanelOpen(true)}
            disabled={disableInternalDestructiveActions}
          >
            {isInternalRuntime ? "Runtime" : "Emulador"}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setEditingSlotIndex(0)}
          >
            Editar equipo
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={resetRun}
            disabled={disableInternalDestructiveActions}
          >
            Restablecer run
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={exitToCreateRun}
            disabled={disableInternalDestructiveActions}
          >
            Nueva run
          </button>
          <span className="save-status">{saveStatus}</span>
        </div>
      </header>
      <section className="overlay-guidance" aria-label="Modo de juego">
        {isInternalRuntime ? (
          <>
            <strong>Modo interno Libretro</strong>
            <span>El juego se inicia automaticamente con tu core local.</span>
            <span>Haz click en el juego para activar teclado y audio.</span>
            <span>Guarda dentro del juego antes de guardar SRAM.</span>
          </>
        ) : (
          <>
            <strong>Modo recomendado</strong>
            <span>ejecuta mGBA dentro del cuadro de juego, sin captura ni pérdida de rendimiento.</span>
            <span>Haz click en el juego para controlar mGBA.</span>
            <span>Haz click en los paneles para editar la run.</span>
          </>
        )}
      </section>

      {isInternalRuntime ? (
        <section className="internal-play-layout" aria-label="Modo interno">
          <GameplayFrame
            gameName={runState.gameName}
            routeName={runState.currentRoute.name}
            capturedFrame={null}
            liveFrame={null}
            internalFrameSnapshotBase64={internalFrameSnapshotBase64}
            internalFrameInfo={internalFrameInfo}
            consoleProfile={consoleProfile}
            isInternalRuntime
            usesExternalInternalRenderer
            onInternalCanvasReady={setInternalCanvas}
            captureStatus={frameStatus}
            isCapturing={false}
            screenRef={gameplayScreenRef}
            isKeyboardInputEnabled
          />
          <InternalPlaySidePanel
            activeTab={internalPlayTab}
            onTabChange={setInternalPlayTab}
            teamPanel={
              <TeamPanel team={runState.team} onEditSlot={setEditingSlotIndex} />
            }
            runPanel={
              <div className="internal-run-controls">
                <LivesCounter
                  lives={runState.lives}
                  onDecrease={() => updateLives(-1)}
                  onIncrease={() => updateLives(1)}
                />
                <BadgePanel badges={runState.badges} onToggleBadge={toggleBadge} />
                <LevelCapPanel
                  levelCap={runState.levelCap}
                  onChange={updateLevelCap}
                />
                <RoutePanel
                  routeName={runState.currentRoute.name}
                  onChange={updateRoute}
                />
                <CaptureStatusPanel
                  status={runState.captureStatus}
                  onCycle={cycleCaptureStatus}
                />
              </div>
            }
            runtimePanel={
              <div className="internal-runtime-panel">
                <section className="internal-runtime-panel__section">
                  <div>
                    <p className="eyebrow">Sesion</p>
                    <h3>Runtime interno</h3>
                  </div>
                  <div className="internal-runtime-state-card">
                    <strong>{internalSessionLabel}</strong>
                    <span>{`FPS render: ${frameStatus || "esperando frame"}`}</span>
                    <span>{runtimeConfig.corePath ? "Core configurado" : "Sin core"}</span>
                    <span>{runtimeConfig.romPath ? "ROM configurada" : "Sin ROM"}</span>
                    <span>{internalAudioStateLabel}</span>
                  </div>
                  <div className="internal-runtime-panel__actions">
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => void startInternalSession()}
                      disabled={
                        isInternalShutdownInProgress ||
                        !hasInternalRuntimeConfigured ||
                        isInternalNativeSessionActive
                      }
                    >
                      Iniciar
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => void pauseInternalSession()}
                      disabled={
                        isInternalShutdownInProgress ||
                        !isInternalNativeSessionActive ||
                        isInternalNativeSessionPaused
                      }
                    >
                      Pausar
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => void resumeInternalSession()}
                      disabled={
                        isInternalShutdownInProgress ||
                        !isInternalNativeSessionActive ||
                        !isInternalNativeSessionPaused
                      }
                    >
                      Continuar
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => void stopInternalSession()}
                      disabled={
                        isInternalShutdownInProgress ||
                        !isInternalNativeSessionActive
                      }
                    >
                      Detener
                    </button>
                  </div>
                </section>

                <section className="internal-runtime-panel__section">
                  <div>
                    <p className="eyebrow">Audio</p>
                    <h3>Sonido</h3>
                  </div>
                  <div className="internal-runtime-state-card">
                    <strong>{internalAudioStateLabel}</strong>
                    <span>Haz click en el juego para activar audio automaticamente.</span>
                  </div>
                  <div className="internal-runtime-panel__actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => void toggleInternalAudio()}
                      disabled={isInternalShutdownInProgress}
                    >
                      {internalAudioStateLabel === "Audio: activo"
                        ? "Desactivar audio"
                        : "Activar audio"}
                    </button>
                  </div>
                </section>

                <section className="internal-runtime-panel__section">
                  <div>
                    <p className="eyebrow">Controles</p>
                    <h3>Teclado</h3>
                  </div>
                  <div className="internal-keyboard-status">
                    <strong>
                      {isInternalKeyboardFocused
                        ? "Teclado activo"
                        : "Haz click en el juego"}
                    </strong>
                    <span>
                      Los controles solo funcionan cuando el cuadro de juego
                      tiene foco. No se usan atajos globales.
                    </span>
                  </div>
                  <div className="internal-controls-grid">
                    {keyboardControlHints.map((hint) => (
                      <div className="internal-controls-grid__row" key={hint.label}>
                        <span className="internal-control-key">{hint.keys}</span>
                        <span className="internal-control-action">
                          {hint.action}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="internal-runtime-panel__actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => void clearInternalHeldButtons()}
                    >
                      Soltar botones
                    </button>
                  </div>
                </section>

                <section className="internal-runtime-panel__section">
                  <div>
                    <p className="eyebrow">Guardado</p>
                    <h3>SRAM</h3>
                  </div>
                  <p>
                    Esto guarda la SRAM del juego. Primero guarda dentro de
                    Pokemon desde el menu del juego. No es save state.
                  </p>
                  <div className="internal-runtime-state-card">
                    <strong>
                      {saveRamInfo
                        ? `Disponible · ${saveRamInfo.sizeBytes} bytes`
                        : "Pendiente de actualizar"}
                    </strong>
                    <span>
                      {saveRamInfo?.existsOnDisk
                        ? "Archivo .srm existente"
                        : "Archivo .srm no encontrado"}
                    </span>
                    <span>
                      {saveRamInfo?.filePath
                        ? `Ubicacion: ${saveRamInfo.filePath}`
                        : runtimeConfig.saveDirectory
                          ? `Directorio configurado: ${runtimeConfig.saveDirectory}`
                          : "Sin saveDirectory: se usara la carpeta de la ROM si el core reporta SRAM."}
                    </span>
                    {lastSaveOperation ? (
                      <span>
                        {`Ultima operacion: ${lastSaveOperation.message} ${
                          lastSaveOperation.filePath
                            ? lastSaveOperation.filePath
                            : ""
                        }`}
                      </span>
                    ) : null}
                    {isInternalNativeSessionActive ? (
                      <span>
                        Deten la sesion para guardar o cargar SRAM manualmente.
                        Al detener se intenta autosave.
                      </span>
                    ) : null}
                  </div>
                  <div className="internal-runtime-panel__actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => void refreshInternalSaveMemory()}
                      disabled={disableInternalSaveActions}
                    >
                      Actualizar memoria
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => void loadInternalSaveMemory()}
                      disabled={disableInternalSaveActions}
                    >
                      Cargar SRAM
                    </button>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => void saveInternalSaveMemory()}
                      disabled={disableInternalSaveActions}
                    >
                      Guardar SRAM
                    </button>
                  </div>
                </section>
              </div>
            }
            debugController={
              <InternalRuntimeFramePreview
                ref={internalRuntimePreviewRef}
                runtimeConfig={runtimeConfig}
                onFrameSnapshotBase64={setInternalFrameSnapshotBase64}
                onRuntimeStatusChange={applyInternalRuntimeStatus}
                onAudioStateChange={setInternalAudioStateLabel}
                onKeyboardFocusChange={setIsInternalKeyboardFocused}
                onDebugLoopRunningChange={setIsInternalDebugLoopRunning}
                onDebugPanelCollapsedChange={setIsInternalDebugPanelCollapsed}
                isCollapsed={internalPlayTab !== "debug"}
                showCollapseToggle={false}
                keyboardTargetRef={gameplayScreenRef}
              />
            }
          />
          <InternalRuntimeDisplayController
            canvas={internalCanvas}
            isEnabled={isInternalRuntime && hasInternalRuntimeConfigured}
            isSessionActive={isInternalNativeSessionActive}
            onFrameInfo={setInternalFrameInfo}
            onRenderStatus={setFrameStatus}
          />
        </section>
      ) : (
        <section className="play-layout" aria-label="Diseño principal">
          <GameplayFrame
            gameName={runState.gameName}
            routeName={runState.currentRoute.name}
            capturedFrame={capturedFrame}
            liveFrame={liveFrame}
            isInternalRuntime={false}
            captureStatus={frameStatus}
            isCapturing={isCaptureSessionRunning}
            screenRef={gameplayScreenRef}
          />
          <TeamPanel team={runState.team} onEditSlot={setEditingSlotIndex} />
        </section>
      )}

      <div className="emulator-status" aria-live="polite">
        {isInternalRuntime ? (
          <>
            <span>Runtime interno Libretro</span>
            <span>{runtimeConfig.corePath ? "Core configurado" : "sin core"}</span>
            <span>{runtimeConfig.romPath ? "ROM configurada" : "sin ROM"}</span>
            <span>{`Sesion: ${internalSessionLabel.toLowerCase()}`}</span>
            <span>{internalAudioStateLabel}</span>
            {lastSaveOperation ? (
              <span>{`Guardado: ${lastSaveOperation.message}`}</span>
            ) : (
              <span>
                {saveRamInfo ? "SRAM disponible" : "SRAM pendiente"}
              </span>
            )}
            <span>
              {runtimeConfig.saveDirectory
                ? "Directorio de guardado configurado"
                : "sin directorio de guardado"}
            </span>
            {isInternalDebugLoopRunning ? (
              <strong>
                Prueba avanzada activa: detenla antes de cambiar runtime,
                resetear o salir.
              </strong>
            ) : null}
            {isInternalNativeSessionActive ? (
              <strong>
                Sesion interna activa: detenla antes de cambiar runtime,
                resetear o salir.
              </strong>
            ) : null}
          </>
        ) : (
          <>
            <span>
              {emulatorConfig.executablePath
                ? "Emulador configurado"
                : "Configura el emulador para jugar"}
            </span>
            <span>{emulatorConfig.romPath ? "ROM configurada" : "sin ROM"}</span>
            <span>Ventana de juego: {windowStatus}</span>
            <span>Overlay: {overlayStatus}</span>
          </>
        )}
        {isLegacyRuntime && isCaptureSessionRunning ? (
          <strong>{frameStatus || `Modo captura experimental a ${captureFps} FPS`}</strong>
        ) : null}
        {isLegacyRuntime && captureSession?.isActive && captureSession.effectiveFps > 0 ? (
          <strong>{`${Math.round(captureSession.effectiveFps)} FPS reales`}</strong>
        ) : null}
        {isLegacyRuntime && runState.captureWindow?.title ? (
          <strong>{runState.captureWindow.title}</strong>
        ) : null}
        {isLegacyRuntime && frameStatus ? <strong>{frameStatus}</strong> : null}
        {sessionStatus ? <strong>{sessionStatus}</strong> : null}
      </div>

      {isLegacyRuntime ? (
      <footer className="status-bar" aria-label="Estado de la run">
        <LivesCounter
          lives={runState.lives}
          onDecrease={() => updateLives(-1)}
          onIncrease={() => updateLives(1)}
        />
        <BadgePanel badges={runState.badges} onToggleBadge={toggleBadge} />
        <LevelCapPanel
          levelCap={runState.levelCap}
          onChange={updateLevelCap}
        />
        <RoutePanel
          routeName={runState.currentRoute.name}
          onChange={updateRoute}
        />
        <CaptureStatusPanel
          status={runState.captureStatus}
          onCycle={cycleCaptureStatus}
        />
      </footer>
      ) : null}

      {isEmulatorPanelOpen ? (
        <EmulatorConfigPanel
          config={runtimeConfig}
          onChange={updateRuntimeConfig}
          onClose={() => setIsEmulatorPanelOpen(false)}
          onSelectEmulator={chooseEmulator}
          onSelectRom={chooseRom}
          onSelectCore={chooseLibretroCore}
          onSelectSaveDirectory={chooseSaveDirectory}
        />
      ) : null}

      <QuickEditPanel
        pokemon={editingPokemon}
        slotNumber={editingSlotIndex === null ? null : editingSlotIndex + 1}
        onClose={() => setEditingSlotIndex(null)}
        onUpdate={updatePokemonSlot}
      />
    </main>
  );
}


