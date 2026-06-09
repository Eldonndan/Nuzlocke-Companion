import type { CaptureStatus } from "../shared/types";

export const captureStatusLabels: Record<CaptureStatus, string> = {
  available: "Disponible",
  used: "Usada",
  failed: "Fallida",
  "not-applicable": "No aplica",
};
