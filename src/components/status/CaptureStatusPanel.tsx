import type { CaptureStatus } from "../../shared/types";
import { captureStatusLabels } from "../../utils/captureStatusLabels";

type CaptureStatusPanelProps = {
  status: CaptureStatus;
  onCycle: () => void;
};

export function CaptureStatusPanel({ status, onCycle }: CaptureStatusPanelProps) {
  return (
    <section className="status-card" aria-label="Captura">
      <span className="status-card__label">Captura</span>
      <button
        className={`status-action status-action--${status}`}
        type="button"
        onClick={onCycle}
        aria-label={`Cambiar captura: ${captureStatusLabels[status]}`}
      >
        {captureStatusLabels[status]}
      </button>
    </section>
  );
}
