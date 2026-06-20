import { type RefObject, useEffect, useRef } from "react";
import type { CapturedFrame, LiveCaptureFrame } from "../../shared/types";

type GameplayFrameProps = {
  gameName: string;
  routeName: string;
  capturedFrame: CapturedFrame | null;
  liveFrame: LiveCaptureFrame | null;
  captureStatus: string;
  isCapturing: boolean;
  screenRef?: RefObject<HTMLDivElement | null>;
};

export function GameplayFrame({
  gameName,
  routeName,
  capturedFrame,
  liveFrame,
  captureStatus,
  isCapturing,
  screenRef,
}: GameplayFrameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!liveFrame || !canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    const binaryFrame = window.atob(liveFrame.rgbaData);
    const pixels = new Uint8ClampedArray(binaryFrame.length);

    for (let index = 0; index < binaryFrame.length; index += 1) {
      pixels[index] = binaryFrame.charCodeAt(index);
    }

    canvas.width = liveFrame.width;
    canvas.height = liveFrame.height;
    context.putImageData(new ImageData(pixels, liveFrame.width, liveFrame.height), 0, 0);
  }, [liveFrame]);

  const hasLiveFrame = Boolean(liveFrame);

  return (
    <section className="gameplay-frame" aria-label="Area de juego">
      <div className="gameplay-frame__screen" ref={screenRef}>
        {hasLiveFrame ? (
          <canvas
            ref={canvasRef}
            className="gameplay-frame__image"
            aria-label={`Captura en vivo de ${gameName}`}
          />
        ) : capturedFrame ? (
          <img
            className="gameplay-frame__image"
            src={capturedFrame.imageDataUrl}
            alt={`Frame de prueba de ${gameName}`}
          />
        ) : (
          <>
            <div className="gameplay-frame__scanline" />
            <div className="gameplay-frame__content">
              <p className="eyebrow">Juego</p>
              <h2>{gameName}</h2>
              <span>{routeName}</span>
            </div>
          </>
        )}

        {isCapturing || captureStatus ? (
          <div className="gameplay-frame__capture-status" aria-live="polite">
            {captureStatus || (isCapturing ? "Captura activa" : "")}
          </div>
        ) : null}
      </div>
      <div className="gameplay-frame__footer">
        <span>Vista de juego</span>
        <strong>
          {hasLiveFrame ? "Captura activa" : capturedFrame ? "Frame de prueba" : "Manual"}
        </strong>
      </div>
    </section>
  );
}
