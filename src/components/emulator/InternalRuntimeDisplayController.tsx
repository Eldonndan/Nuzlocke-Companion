import { useEffect, useRef } from "react";
import {
  getLatestInternalRuntimeFrameInfo,
  getLatestInternalRuntimeFrameRgbaBytes,
  type InternalFrameInfo,
} from "../../utils/internalRuntimeCommands";

const NO_FRAME_RETRY_MS = 120;
const WAITING_STATUS_UPDATE_MS = 500;

type InternalRuntimeDisplayControllerProps = {
  canvas: HTMLCanvasElement | null;
  isEnabled: boolean;
  isSessionActive?: boolean;
  onFrameInfo?: (frameInfo: InternalFrameInfo) => void;
  onRenderStatus?: (status: string) => void;
};

type RenderStats = {
  paintedFrames: number;
  startedAt: number;
  lastUiUpdateAt: number;
};

function toUint8ClampedArray(value: ArrayBuffer | Uint8Array): Uint8ClampedArray<ArrayBuffer> {
  if (value instanceof ArrayBuffer) {
    return new Uint8ClampedArray(value);
  }

  const copy = new ArrayBuffer(value.byteLength);
  new Uint8Array(copy).set(value);
  return new Uint8ClampedArray(copy);
}

function paintRgbaFrame(
  canvas: HTMLCanvasElement,
  frameInfo: InternalFrameInfo,
  bytes: Uint8ClampedArray<ArrayBuffer>,
) {
  const expectedLength = frameInfo.width * frameInfo.height * 4;

  if (bytes.length !== expectedLength) {
    return false;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return false;
  }

  canvas.width = frameInfo.width;
  canvas.height = frameInfo.height;
  context.putImageData(new ImageData(bytes, frameInfo.width, frameInfo.height), 0, 0);
  return true;
}

export function InternalRuntimeDisplayController({
  canvas,
  isEnabled,
  isSessionActive = false,
  onFrameInfo,
  onRenderStatus,
}: InternalRuntimeDisplayControllerProps) {
  const lastFrameNumberRef = useRef(0);
  const lastNoFrameAttemptAtRef = useRef(0);
  const lastWaitingStatusAtRef = useRef(0);
  const requestInFlightRef = useRef(false);
  const statsRef = useRef<RenderStats>({
    paintedFrames: 0,
    startedAt: performance.now(),
    lastUiUpdateAt: 0,
  });

  useEffect(() => {
    lastFrameNumberRef.current = 0;
    lastNoFrameAttemptAtRef.current = 0;
    lastWaitingStatusAtRef.current = 0;
    requestInFlightRef.current = false;
    statsRef.current = {
      paintedFrames: 0,
      startedAt: performance.now(),
      lastUiUpdateAt: 0,
    };
  }, [canvas, isEnabled]);

  useEffect(() => {
    if (!canvas || !isEnabled) {
      return;
    }

    let frameId: number | null = null;
    let isDisposed = false;

    const tick = async () => {
      if (isDisposed) {
        return;
      }

      if (!requestInFlightRef.current) {
        const now = performance.now();
        const isWaitingForFirstFrame = lastFrameNumberRef.current === 0;

        if (
          !isSessionActive &&
          isWaitingForFirstFrame &&
          now - lastNoFrameAttemptAtRef.current < NO_FRAME_RETRY_MS
        ) {
          frameId = window.requestAnimationFrame(tick);
          return;
        }

        lastNoFrameAttemptAtRef.current = now;
        requestInFlightRef.current = true;
        try {
          const frameInfo = await getLatestInternalRuntimeFrameInfo();

          if (frameInfo.frameNumber !== lastFrameNumberRef.current) {
            const response = await getLatestInternalRuntimeFrameRgbaBytes();
            const bytes = toUint8ClampedArray(response);

            if (paintRgbaFrame(canvas, frameInfo, bytes)) {
              lastFrameNumberRef.current = frameInfo.frameNumber;
              statsRef.current.paintedFrames += 1;
              onFrameInfo?.(frameInfo);
            }
          }

          const now = performance.now();
          if (now - statsRef.current.lastUiUpdateAt >= 500) {
            const elapsedSeconds = Math.max(
              0.001,
              (now - statsRef.current.startedAt) / 1000,
            );
            const renderFps =
              statsRef.current.paintedFrames / elapsedSeconds;
            onRenderStatus?.(
              `Render interno: ${Math.round(renderFps)} FPS aprox.`,
            );
            statsRef.current.lastUiUpdateAt = now;
          }
        } catch {
          const retryNow = performance.now();
          if (
            lastFrameNumberRef.current === 0 &&
            retryNow - lastWaitingStatusAtRef.current >= WAITING_STATUS_UPDATE_MS
          ) {
            onRenderStatus?.("Render interno: esperando primer frame...");
            lastWaitingStatusAtRef.current = retryNow;
          }
        } finally {
          requestInFlightRef.current = false;
        }
      }

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      isDisposed = true;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [canvas, isEnabled, isSessionActive, onFrameInfo, onRenderStatus]);

  return null;
}
