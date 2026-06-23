import type { RunState } from "../shared/types";
import { upsertRunInLibrary } from "./runLibraryStorage";
import { cloneRunState } from "./runStateClone";
import { isRunState } from "./runStateValidation";
import { migrateLegacyEmulatorConfig } from "./runtimeConfig";

export { cloneRunState } from "./runStateClone";

const RUN_STORAGE_KEY = "nuzlocke-companion.current-run";

export function loadSavedRun(fallbackRun: RunState): RunState {
  try {
    const savedRun = window.localStorage.getItem(RUN_STORAGE_KEY);

    if (!savedRun) {
      return cloneRunState(fallbackRun);
    }

    const parsedRun: unknown = JSON.parse(savedRun);

    if (!isRunState(parsedRun)) {
      window.localStorage.removeItem(RUN_STORAGE_KEY);
      return cloneRunState(fallbackRun);
    }

    return cloneRunState(migrateLegacyEmulatorConfig(parsedRun));
  } catch {
    return cloneRunState(fallbackRun);
  }
}

export function saveRun(run: RunState) {
  const migratedRun = migrateLegacyEmulatorConfig(run);

  window.localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(migratedRun));
  upsertRunInLibrary(migratedRun);
}

export function hasSavedRun() {
  return window.localStorage.getItem(RUN_STORAGE_KEY) !== null;
}

export function clearSavedRun() {
  window.localStorage.removeItem(RUN_STORAGE_KEY);
}

export function clearCurrentRunIfMatches(runId: string): void {
  try {
    const savedRun = window.localStorage.getItem(RUN_STORAGE_KEY);

    if (!savedRun) {
      return;
    }

    const parsedRun: unknown = JSON.parse(savedRun);

    if (!isRunState(parsedRun)) {
      window.localStorage.removeItem(RUN_STORAGE_KEY);
      return;
    }

    if (parsedRun.id === runId) {
      window.localStorage.removeItem(RUN_STORAGE_KEY);
    }
  } catch {
    window.localStorage.removeItem(RUN_STORAGE_KEY);
  }
}
