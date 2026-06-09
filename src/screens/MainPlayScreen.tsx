import { useEffect, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { EmulatorConfigPanel } from "../components/emulator/EmulatorConfigPanel";
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
  EmulatorConfig,
  LiveCaptureFrame,
  OverlayAction,
  PokemonSlot,
  RunState,
} from "../shared/types";
import {
  captureWindowFrame,
  detectEmulatorWindow,
  focusEmulatorWindow,
  getCaptureStatus,
  hideOverlay,
  launchEmulator,
  positionEmulatorWindow,
  positionOverlayWindow,
  selectEmulatorExecutable,
  selectRomFile,
  setOverlayClickThrough,
  showOverlay,
  startCaptureSession,
  stopCaptureSession,
} from "../utils/emulatorCommands";
import {
  clearSavedRun,
  cloneRunState,
  loadSavedRun,
  saveRun,
} from "../utils/runStorage";

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

function createEmptyEmulatorConfig(): EmulatorConfig {
  return {
    type: "mgba",
    executablePath: "",
    romPath: "",
    launchArgs: [],
  };
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

export function MainPlayScreen({ run, onExit }: MainPlayScreenProps) {
  const [runState, setRunState] = useState<RunState>(() => loadSavedRun(run));
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);
  const [isEmulatorPanelOpen, setIsEmulatorPanelOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Guardado local");
  const [sessionStatus, setSessionStatus] = useState("");
  const [capturedFrame, setCapturedFrame] = useState<CapturedFrame | null>(null);
  const [liveFrame, setLiveFrame] = useState<LiveCaptureFrame | null>(null);
  const [frameStatus, setFrameStatus] = useState("");
  const [captureFps, setCaptureFps] = useState<CaptureFps>(30);
  const [captureSession, setCaptureSession] = useState<CaptureSessionStatus | null>(null);
  const [isCaptureSessionRunning, setIsCaptureSessionRunning] = useState(false);
  const [isOverlayEditing, setIsOverlayEditing] = useState(false);
  const [overlayStatus, setOverlayStatus] = useState("Modo recomendado: overlay listo");
  const [windowStatus, setWindowStatus] = useState(
    runState.captureWindow ? "Ventana detectada" : "Ventana de juego sin detectar",
  );

  const hasSavedInitialRun = useRef(false);
  const isTestFrameRequestInFlight = useRef(false);

  const editingPokemon =
    editingSlotIndex === null ? null : runState.team[editingSlotIndex];
  const emulatorConfig = runState.emulatorConfig ?? createEmptyEmulatorConfig();
  const hasEmulatorConfigured = Boolean(
    emulatorConfig.executablePath && emulatorConfig.romPath,
  );

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

  const updateEmulatorConfig = (config: EmulatorConfig) => {
    void stopNativeCapture("Captura detenida");
    void hideOverlay();
    setRunState((currentRun) => ({
      ...currentRun,
      emulatorConfig: config,
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
    const processId = emulatorConfig.lastLaunchedProcessId;

    if (!processId) {
      setWindowStatus("Inicia mGBA antes de detectar la ventana.");
      return;
    }

    await detectWindowForProcess(processId);
  };

  const startGameSession = async () => {
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
        ...currentRun,
        captureWindow: undefined,
        emulatorConfig: {
          ...emulatorConfig,
          lastLaunchedProcessId: result.processId ?? undefined,
        },
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

  const startOverlaySession = async () => {
    if (!hasEmulatorConfigured) {
      setOverlayStatus("Configura el emulador para jugar en modo overlay.");
      setIsEmulatorPanelOpen(true);
      return;
    }

    await stopNativeCapture("");
    setSessionStatus("Iniciando mGBA...");
    setOverlayStatus("Preparando modo overlay...");
    setWindowStatus("Esperando ventana...");

    try {
      const result = await launchEmulator(
        emulatorConfig.executablePath,
        emulatorConfig.romPath,
        emulatorConfig.launchArgs,
      );

      setRunState((currentRun) => ({
        ...currentRun,
        captureWindow: undefined,
        emulatorConfig: {
          ...emulatorConfig,
          lastLaunchedProcessId: result.processId ?? undefined,
        },
      }));

      if (!result.processId) {
        setWindowStatus("No se pudo detectar la ventana");
        setOverlayStatus("mGBA iniciado, pero no se recibió PID.");
        return;
      }

      const captureWindow = await detectWindowForProcess(result.processId, true);

      if (!captureWindow) {
        setOverlayStatus("No se pudo detectar la ventana de mGBA.");
        return;
      }

      const layout = loadOverlayLayout();

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
      saveOverlayLayout(layout);
      await showOverlay();
      await setOverlayEditMode(false);
      await setOverlayClickThrough(true);
      await focusEmulatorWindow(captureWindow.windowId);

      setSessionStatus("mGBA listo");
      setOverlayStatus("Overlay activo. Pulsa F12 para editar la interfaz.");
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
    if (!runState.captureWindow) {
      setFrameStatus("Detecta una ventana antes de capturar.");
      return;
    }

    setFrameStatus("Capturando frame de prueba...");
    await captureTestFrame(runState.captureWindow.windowId);
  };

  const chooseEmulator = async () => {
    try {
      const selectedPath = await selectEmulatorExecutable();
      if (selectedPath) {
        updateEmulatorConfig({
          ...emulatorConfig,
          executablePath: selectedPath,
        });
      }
    } catch {
      setSessionStatus("No se pudo abrir el selector del emulador.");
    }
  };

  const chooseRom = async () => {
    try {
      const selectedPath = await selectRomFile();
      if (selectedPath) {
        updateEmulatorConfig({
          ...emulatorConfig,
          romPath: selectedPath,
        });
      }
    } catch {
      setSessionStatus("No se pudo abrir el selector de ROM.");
    }
  };

  const resetRun = () => {
    const shouldReset = window.confirm(
      "¿Restablecer la run? Se perderán los cambios guardados localmente.",
    );

    if (!shouldReset) {
      return;
    }

    void stopNativeCapture("Captura detenida");
    void hideOverlay();
    clearSavedRun();
    setEditingSlotIndex(null);
    setCapturedFrame(null);
    setLiveFrame(null);
    setRunState(cloneRunState(run));
    setSaveStatus("Guardado local");
    setWindowStatus("Ventana de juego sin detectar");
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

  return (
    <main className="play-screen">
      <header className="play-topbar">
        <div className="play-topbar__identity">
          <p className="eyebrow">Juego</p>
          <h1>{runState.gameName}</h1>
          <span>{runState.challengeType}</span>
        </div>

        <div className="play-topbar__actions">
          <button
            className={hasEmulatorConfigured ? "primary-button" : "secondary-button"}
            type="button"
            onClick={
              hasEmulatorConfigured
                ? startOverlaySession
                : () => setIsEmulatorPanelOpen(true)
            }
          >
            {hasEmulatorConfigured ? "Jugar en modo overlay" : "Configurar emulador"}
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
          <button
            className="secondary-button"
            type="button"
            onClick={() => setIsEmulatorPanelOpen(true)}
          >
            Emulador
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
          <button className="secondary-button" type="button" onClick={onExit}>
            Nueva run
          </button>
          <span className="save-status">{saveStatus}</span>
        </div>
      </header>
      <section className="overlay-guidance" aria-label="Modo recomendado">
        <strong>Modo recomendado</strong>
        <span>abre mGBA y muestra la interfaz encima sin afectar el rendimiento del juego.</span>
        <span>El overlay no bloquea el teclado ni el mouse mientras juegas.</span>
        <span>Pulsa F12 para editar la interfaz.</span>
      </section>


      <section className="play-layout" aria-label="Diseño principal">
        <GameplayFrame
          gameName={runState.gameName}
          routeName={runState.currentRoute.name}
          capturedFrame={capturedFrame}
          liveFrame={liveFrame}
          captureStatus={frameStatus}
          isCapturing={isCaptureSessionRunning}
        />
        <TeamPanel team={runState.team} onEditSlot={setEditingSlotIndex} />
      </section>

      <div className="emulator-status" aria-live="polite">
        <span>
          {emulatorConfig.executablePath
            ? "Emulador configurado"
            : "Configura el emulador para jugar"}
        </span>
        <span>{emulatorConfig.romPath ? "ROM configurada" : "sin ROM"}</span>
        <span>Ventana de juego: {windowStatus}</span>
        <span>Overlay: {overlayStatus}</span>
        {isCaptureSessionRunning ? (
          <strong>{frameStatus || `Modo captura experimental a ${captureFps} FPS`}</strong>
        ) : null}
        {captureSession?.isActive && captureSession.effectiveFps > 0 ? (
          <strong>{`${Math.round(captureSession.effectiveFps)} FPS reales`}</strong>
        ) : null}
        {runState.captureWindow?.title ? (
          <strong>{runState.captureWindow.title}</strong>
        ) : null}
        {frameStatus ? <strong>{frameStatus}</strong> : null}
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
          config={emulatorConfig}
          onChange={updateEmulatorConfig}
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

