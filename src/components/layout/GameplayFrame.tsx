import {
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
  useEffect,
  useRef,
} from "react";
import type { CapturedFrame, LiveCaptureFrame } from "../../shared/types";
import type { InternalFrameSnapshot } from "../../utils/internalRuntimeCommands";

type GameplayFrameProps = {
  gameName: string;
  routeName: string;
  capturedFrame: CapturedFrame | null;
  liveFrame: LiveCaptureFrame | null;
  internalFrameSnapshot?: InternalFrameSnapshot | null;
  isInternalRuntime?: boolean;
  captureStatus: string;
  isCapturing: boolean;
  screenRef?: RefObject<HTMLDivElement | null>;
  isKeyboardInputEnabled?: boolean;
  onKeyboardFocus?: () => void;
  onKeyboardBlur?: (event: FocusEvent<HTMLDivElement>) => void;
  onKeyboardKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  onKeyboardKeyUp?: (event: KeyboardEvent<HTMLDivElement>) => void;
};

type RgbaPixels = Uint8ClampedArray<ArrayBuffer>;

function drawRgbaFrame(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  rgba: RgbaPixels,
) {
  const expectedLength = width * height * 4;

  if (rgba.length !== expectedLength) {
    return false;
  }

  const context = canvas.getContext("2d");

  if (!context) {
    return false;
  }

  canvas.width = width;
  canvas.height = height;
  context.putImageData(new ImageData(rgba, width, height), 0, 0);
  return true;
}

function focusKeyboardTarget(event: MouseEvent<HTMLDivElement>) {
  event.currentTarget.focus();
}

export function GameplayFrame({
  gameName,
  routeName,
  capturedFrame,
  liveFrame,
  internalFrameSnapshot,
  isInternalRuntime = false,
  captureStatus,
  isCapturing,
  screenRef,
  isKeyboardInputEnabled = false,
  onKeyboardFocus,
  onKeyboardBlur,
  onKeyboardKeyDown,
  onKeyboardKeyUp,
}: GameplayFrameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;

    if (isInternalRuntime && internalFrameSnapshot) {
      drawRgbaFrame(
        canvas,
        internalFrameSnapshot.width,
        internalFrameSnapshot.height,
        new Uint8ClampedArray(internalFrameSnapshot.rgba),
      );
      return;
    }

    if (!liveFrame) {
      return;
    }

    const binaryFrame = window.atob(liveFrame.rgbaData);
    const pixels = new Uint8ClampedArray(binaryFrame.length);

    for (let index = 0; index < binaryFrame.length; index += 1) {
      pixels[index] = binaryFrame.charCodeAt(index);
    }

    drawRgbaFrame(canvas, liveFrame.width, liveFrame.height, pixels);
  }, [internalFrameSnapshot, isInternalRuntime, liveFrame]);

  const hasInternalFrame = Boolean(isInternalRuntime && internalFrameSnapshot);
  const hasLiveFrame = Boolean(liveFrame);
  const shouldRenderCanvas = hasInternalFrame || hasLiveFrame;

  return (
    <section className="gameplay-frame" aria-label="Area de juego">
      <div
        className="gameplay-frame__screen"
        ref={screenRef}
        tabIndex={isKeyboardInputEnabled ? 0 : undefined}
        onFocus={isKeyboardInputEnabled ? onKeyboardFocus : undefined}
        onBlur={isKeyboardInputEnabled ? onKeyboardBlur : undefined}
        onKeyDown={isKeyboardInputEnabled ? onKeyboardKeyDown : undefined}
        onKeyUp={isKeyboardInputEnabled ? onKeyboardKeyUp : undefined}
        onMouseDown={isKeyboardInputEnabled ? focusKeyboardTarget : undefined}
      >
        {shouldRenderCanvas ? (
          <canvas
            ref={canvasRef}
            className="gameplay-frame__image"
            aria-label={
              hasInternalFrame
                ? `Runtime interno de ${gameName}`
                : `Captura en vivo de ${gameName}`
            }
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
          {hasInternalFrame
            ? "Runtime interno"
            : hasLiveFrame
              ? "Captura activa"
              : capturedFrame
                ? "Frame de prueba"
                : "Manual"}
        </strong>
      </div>
    </section>
  );
}
