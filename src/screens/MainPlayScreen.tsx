import { useEffect, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { EmulatorConfigPanel } from "../components/emulator/EmulatorConfigPanel";
import { InternalRuntimeFramePreview } from "../components/emulator/InternalRuntimeFramePreview";
import { QuickEditPanel } from "../components/edit/QuickEditPanel";
import { GameplayFrame } from "../components/layout/GameplayFrame";
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
  selectRomFile,
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
import type { InternalFrameSnapshot } from "../utils/internalRuntimeCommands";
import { stopInternalRuntime } from "../utils/internalRuntimeCommands";
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
  const [internalFrameSnapshot, setInternalFrameSnapshot] =
    useState<InternalFrameSnapshot | null>(null);
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
  const dockResizeTimeoutRef = useRef<number | null>(null);
  const dockedWindowIdRef = useRef<string | null>(null);

  const editingPokemon =
    editingSlotIndex === null ? null : runState.team[editingSlotIndex];
  const runtimeConfig = getRunRuntimeConfig(runState);
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

  const ensureLegacyExternalRuntime = () => {
    if (isLegacyRuntime) {
      return true;
    }

    setSessionStatus(legacyExternalOnlyMessage);
    setOverlayStatus(legacyExternalOnlyMessage);
    return false;
  };

  const stopInternalRuntimeForAutosave = async (context: string) => {
    if (!isInternalRuntime) {
      return true;
    }

    try {
      await stopInternalRuntime();
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
    setInternalFrameSnapshot(null);
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
    if (!ensureLegacyExternalRuntime()) {
      return;
    }

    try {
      const selectedPath = await selectEmulatorExecutable();
      if (selectedPath) {
        updateRuntimeConfig({
          ...emulatorConfig,
          executablePath: selectedPath,
        });
      }
    } catch {
      setSessionStatus("No se pudo abrir el selector del emulador.");
    }
  };

  const chooseRom = async () => {
    if (!ensureLegacyExternalRuntime()) {
      return;
    }

    try {
      const selectedPath = await selectRomFile();
      if (selectedPath) {
        updateRuntimeConfig({
          ...emulatorConfig,
          romPath: selectedPath,
        });
      }
    } catch {
      setSessionStatus("No se pudo abrir el selector de ROM.");
    }
  };

  const resetRun = async () => {
    const shouldReset = window.confirm(
      "¿Restablecer la run? Se perderán los cambios guardados localmente.",
    );

    if (!shouldReset) {
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
    setInternalFrameSnapshot(null);
    setRunState(cloneRunState(run));
    setSaveStatus("Guardado local");
    setWindowStatus("Ventana de juego sin detectar");
  };

  const exitToCreateRun = async () => {
    const canContinue = await stopInternalRuntimeForAutosave("salir de la run");
    if (!canContinue) {
      return;
    }

    void stopNativeCapture("Captura detenida");
    void hideOverlay();
    void undockCurrentGame();
    setInternalFrameSnapshot(null);
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
      setInternalFrameSnapshot(null);
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
    <main className="play-screen">
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
          <button className="secondary-button" type="button" onClick={resetRun}>
            Restablecer run
          </button>
          <button className="secondary-button" type="button" onClick={exitToCreateRun}>
            Nueva run
          </button>
          <span className="save-status">{saveStatus}</span>
        </div>
      </header>
      <section className="overlay-guidance" aria-label="Modo de juego">
        {isInternalRuntime ? (
          <>
            <strong>Modo interno Libretro</strong>
            <span>El juego se renderiza dentro de la app usando tu core local.</span>
            <span>Usa la preview debug para preparar, iniciar el loop y guardar SRAM.</span>
            <span>Haz click en la tarjeta del runtime para activar teclado local.</span>
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
        <InternalRuntimeFramePreview
          runtimeConfig={runtimeConfig}
          onFrameSnapshot={setInternalFrameSnapshot}
        />
      ) : null}

      <section className="play-layout" aria-label="Diseño principal">
        <GameplayFrame
          gameName={runState.gameName}
          routeName={runState.currentRoute.name}
          capturedFrame={isLegacyRuntime ? capturedFrame : null}
          liveFrame={isLegacyRuntime ? liveFrame : null}
          internalFrameSnapshot={
            isInternalRuntime ? internalFrameSnapshot : null
          }
          isInternalRuntime={isInternalRuntime}
          captureStatus={frameStatus}
          isCapturing={isCaptureSessionRunning}
          screenRef={gameplayScreenRef}
        />
        <TeamPanel team={runState.team} onEditSlot={setEditingSlotIndex} />
      </section>

      <div className="emulator-status" aria-live="polite">
        {isInternalRuntime ? (
          <>
            <span>Runtime interno Libretro</span>
            <span>{runtimeConfig.corePath ? "Core configurado" : "sin core"}</span>
            <span>{runtimeConfig.romPath ? "ROM configurada" : "sin ROM"}</span>
            <span>
              {runtimeConfig.saveDirectory
                ? "Directorio de guardado configurado"
                : "sin directorio de guardado"}
            </span>
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

      {isEmulatorPanelOpen ? (
        <EmulatorConfigPanel
          config={runtimeConfig}
          onChange={updateRuntimeConfig}
          onClose={() => setIsEmulatorPanelOpen(false)}
          onSelectEmulator={chooseEmulator}
          onSelectRom={chooseRom}
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


