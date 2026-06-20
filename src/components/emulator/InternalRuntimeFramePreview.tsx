import { useRef, useState } from "react";
import {
  getLatestInternalRuntimeFrameSnapshot,
  runInternalRuntimeFrameLoop,
  stepInternalRuntimeFrame,
  clearInternalRuntimeJoypadButtons,
  setInternalRuntimeJoypadButton,
  type InternalJoypadButton,
  type InternalFrameSnapshot,
  type InternalInputInfo,
} from "../../utils/internalRuntimeCommands";

type PreviewStatus = "idle" | "loading" | "ready" | "empty" | "error";

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

export function InternalRuntimeFramePreview() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [snapshot, setSnapshot] = useState<InternalFrameSnapshot | null>(null);
  const [inputInfo, setInputInfo] = useState<InternalInputInfo | null>(null);
  const [status, setStatus] = useState<PreviewStatus>("idle");
  const [message, setMessage] = useState("Sin fotograma renderizado.");

  const pressedButtons = new Set(inputInfo?.pressedButtons ?? []);

  const renderSnapshot = (nextSnapshot: InternalFrameSnapshot | null) => {
    if (!nextSnapshot) {
      setSnapshot(null);
      setStatus("empty");
      setMessage("No hay fotograma disponible todavía.");
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
      setMessage("El fotograma RGBA tiene un tamaño inesperado.");
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

  const refreshSnapshot = async () => {
    setStatus("loading");
    setMessage("Renderizando último fotograma...");

    try {
      renderSnapshot(await getLatestInternalRuntimeFrameSnapshot());
    } catch (error) {
      setStatus("error");
      setMessage(getErrorMessage(error));
    }
  };

  const stepAndRender = async () => {
    setStatus("loading");
    setMessage("Ejecutando un fotograma...");

    try {
      const nextStatus = await stepInternalRuntimeFrame();
      setInputInfo(nextStatus.inputInfo);
      renderSnapshot(await getLatestInternalRuntimeFrameSnapshot());
    } catch (error) {
      setStatus("error");
      setMessage(getErrorMessage(error));
    }
  };

  const runBatchAndRender = async () => {
    setStatus("loading");
    setMessage("Ejecutando 60 fotogramas...");

    try {
      const nextStatus = await runInternalRuntimeFrameLoop({
        maxFrames: 60,
        targetFps: 60,
      });
      setInputInfo(nextStatus.inputInfo);
      renderSnapshot(await getLatestInternalRuntimeFrameSnapshot());
    } catch (error) {
      setStatus("error");
      setMessage(getErrorMessage(error));
    }
  };

  const toggleJoypadButton = async (button: InternalJoypadButton) => {
    const pressed = !pressedButtons.has(button);
    setStatus("loading");
    setMessage(pressed ? "Presionando botón..." : "Soltando botón...");

    try {
      const nextStatus = await setInternalRuntimeJoypadButton({
        button,
        pressed,
      });
      setInputInfo(nextStatus.inputInfo);
      setStatus("ready");
      setMessage(pressed ? "Botón presionado." : "Botón soltado.");
    } catch (error) {
      setStatus("error");
      setMessage(getErrorMessage(error));
    }
  };

  const clearJoypadButtons = async () => {
    setStatus("loading");
    setMessage("Limpiando botones...");

    try {
      const nextStatus = await clearInternalRuntimeJoypadButtons();
      setInputInfo(nextStatus.inputInfo);
      setStatus("ready");
      setMessage("Botones limpiados.");
    } catch (error) {
      setStatus("error");
      setMessage(getErrorMessage(error));
    }
  };

  return (
    <section className="internal-frame-preview" aria-label="Vista previa interna">
      <div className="internal-frame-preview__header">
        <div>
          <p className="eyebrow">Runtime interno</p>
          <h2>Vista previa de fotograma</h2>
        </div>
        <div className="internal-frame-preview__actions">
          <button
            className="secondary-button"
            type="button"
            onClick={refreshSnapshot}
            disabled={status === "loading"}
          >
            Renderizar último frame
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={stepAndRender}
            disabled={status === "loading"}
          >
            Avanzar fotograma y renderizar
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={runBatchAndRender}
            disabled={status === "loading"}
          >
            60 fotogramas y renderizar
          </button>
        </div>
      </div>

      <div className="internal-frame-preview__body">
        <div className="internal-frame-preview__canvas-wrap">
          <canvas ref={canvasRef} aria-label="Último fotograma interno" />
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
          {`Sondeos: ${inputInfo?.pollCount ?? 0} · Consultas: ${
            inputInfo?.stateQueryCount ?? 0
          }`}
        </span>
      </div>
    </section>
  );
}
