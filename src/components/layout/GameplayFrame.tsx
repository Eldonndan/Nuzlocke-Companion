import {
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { CapturedFrame, LiveCaptureFrame } from "../../shared/types";
import type {
  InternalFrameSnapshot,
  InternalFrameSnapshotBase64,
} from "../../utils/internalRuntimeCommands";

type GameplayFrameProps = {
  gameName: string;
  routeName: string;
  capturedFrame: CapturedFrame | null;
  liveFrame: LiveCaptureFrame | null;
  internalFrameSnapshot?: InternalFrameSnapshot | null;
  internalFrameSnapshotBase64?: InternalFrameSnapshotBase64 | null;
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
type CanvasDisplaySize = {
  width: number;
  height: number;
};

const fallbackInternalFrameSize = {
  width: 240,
  height: 160,
};

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

function fitSizeToContainer(
  nativeWidth: number,
  nativeHeight: number,
  containerWidth: number,
  containerHeight: number,
): CanvasDisplaySize {
  if (
    nativeWidth <= 0 ||
    nativeHeight <= 0 ||
    containerWidth <= 0 ||
    containerHeight <= 0
  ) {
    return { width: nativeWidth, height: nativeHeight };
  }

  const scale = Math.min(
    containerWidth / nativeWidth,
    containerHeight / nativeHeight,
  );

  return {
    width: Math.max(1, Math.floor(nativeWidth * scale)),
    height: Math.max(1, Math.floor(nativeHeight * scale)),
  };
}

function greatestCommonDivisor(firstValue: number, secondValue: number): number {
  let first = Math.abs(Math.round(firstValue));
  let second = Math.abs(Math.round(secondValue));

  while (second > 0) {
    const next = first % second;
    first = second;
    second = next;
  }

  return first || 1;
}

function formatAspectRatio(width: number, height: number) {
  const divisor = greatestCommonDivisor(width, height);
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

function decodeBase64ToUint8ClampedArray(base64: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8ClampedArray(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function GameplayFrame({
  gameName,
  routeName,
  capturedFrame,
  liveFrame,
  internalFrameSnapshot,
  internalFrameSnapshotBase64,
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
  const localScreenRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [screenSize, setScreenSize] = useState({ width: 0, height: 0 });

  const setScreenElement = useCallback((element: HTMLDivElement | null) => {
    localScreenRef.current = element;

    if (screenRef) {
      screenRef.current = element;
    }
  }, [screenRef]);

  const internalNativeWidth =
    internalFrameSnapshotBase64?.width ??
    internalFrameSnapshot?.width ??
    fallbackInternalFrameSize.width;
  const internalNativeHeight =
    internalFrameSnapshotBase64?.height ??
    internalFrameSnapshot?.height ??
    fallbackInternalFrameSize.height;
  const internalDisplaySize = fitSizeToContainer(
    internalNativeWidth,
    internalNativeHeight,
    screenSize.width,
    screenSize.height,
  );

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;

    if (isInternalRuntime && internalFrameSnapshotBase64) {
      drawRgbaFrame(
        canvas,
        internalFrameSnapshotBase64.width,
        internalFrameSnapshotBase64.height,
        decodeBase64ToUint8ClampedArray(internalFrameSnapshotBase64.rgbaBase64),
      );
      return;
    }

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
  }, [internalFrameSnapshot, internalFrameSnapshotBase64, isInternalRuntime, liveFrame]);

  useEffect(() => {
    const element = localScreenRef.current;

    if (!element) {
      return;
    }

    const updateSize = () => {
      const nextWidth = Math.floor(element.clientWidth);
      const nextHeight = Math.floor(element.clientHeight);

      setScreenSize((currentSize) =>
        currentSize.width === nextWidth && currentSize.height === nextHeight
          ? currentSize
          : { width: nextWidth, height: nextHeight },
      );
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);

    return () => observer.disconnect();
  }, [screenRef]);

  const hasInternalFrame = Boolean(
    isInternalRuntime && (internalFrameSnapshotBase64 || internalFrameSnapshot),
  );
  const hasLiveFrame = Boolean(liveFrame);
  const shouldRenderCanvas = hasInternalFrame || hasLiveFrame;
  const internalFrameLabel = `${internalNativeWidth}x${internalNativeHeight} · ${formatAspectRatio(
    internalNativeWidth,
    internalNativeHeight,
  )}`;

  return (
    <section className="gameplay-frame" aria-label="Area de juego">
      <div
        className="gameplay-frame__screen"
        ref={setScreenElement}
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
            className={
              hasInternalFrame
                ? "gameplay-frame__image gameplay-frame__image--internal"
                : "gameplay-frame__image gameplay-frame__image--legacy"
            }
            style={
              hasInternalFrame
                ? {
                    width: `${internalDisplaySize.width}px`,
                    height: `${internalDisplaySize.height}px`,
                  }
                : undefined
            }
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
            ? `Runtime interno · ${internalFrameLabel}`
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
