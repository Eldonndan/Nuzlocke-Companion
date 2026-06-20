import { useRef, useState } from "react";
import {
  getLatestInternalRuntimeFrameSnapshot,
  runInternalRuntimeFrameLoop,
  stepInternalRuntimeFrame,
  type InternalFrameSnapshot,
} from "../../utils/internalRuntimeCommands";

type PreviewStatus = "idle" | "loading" | "ready" | "empty" | "error";

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
  const [status, setStatus] = useState<PreviewStatus>("idle");
  const [message, setMessage] = useState("Sin fotograma renderizado.");

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
      await stepInternalRuntimeFrame();
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
      await runInternalRuntimeFrameLoop({ maxFrames: 60, targetFps: 60 });
      renderSnapshot(await getLatestInternalRuntimeFrameSnapshot());
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
    </section>
  );
}
