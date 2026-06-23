import type { RunState } from "../shared/types";
import { migrateLegacyEmulatorConfig } from "./runtimeConfig";
import { cloneRunState } from "./runStateClone";
import { isRecord, isRunState } from "./runStateValidation";

const RUN_LIBRARY_STORAGE_KEY = "nuzlocke-companion.run-library.v1";
const RUN_STORAGE_KEY = "nuzlocke-companion.current-run";

export type RunLibraryEntry = {
  id: string;
  name: string;
  gameId?: string;
  gameName: string;
  platform: string;
  challengeType: string;
  updatedAt: string;
  createdAt: string;
  run: RunState;
};

export type RunLibrary = {
  activeRunId?: string;
  runs: RunLibraryEntry[];
};

export function loadRunLibrary(): RunLibrary {
  try {
    const savedLibrary = window.localStorage.getItem(RUN_LIBRARY_STORAGE_KEY);

    if (!savedLibrary) {
      return { runs: [] };
    }

    const parsedLibrary: unknown = JSON.parse(savedLibrary);

    if (!isRunLibrary(parsedLibrary)) {
      window.localStorage.removeItem(RUN_LIBRARY_STORAGE_KEY);
      return { runs: [] };
    }

    return cloneRunLibrary(parsedLibrary);
  } catch {
    window.localStorage.removeItem(RUN_LIBRARY_STORAGE_KEY);
    return { runs: [] };
  }
}

export function saveRunLibrary(library: RunLibrary): void {
  const nextLibrary = cloneRunLibrary(library);
  window.localStorage.setItem(
    RUN_LIBRARY_STORAGE_KEY,
    JSON.stringify(nextLibrary),
  );
}

export function upsertRunInLibrary(run: RunState): RunLibrary {
  const library = loadRunLibrary();
  const now = new Date().toISOString();
  const migratedRun = cloneRunState(migrateLegacyEmulatorConfig(run));
  const existingEntry = library.runs.find((entry) => entry.id === migratedRun.id);
  const nextEntry = createRunLibraryEntry(
    migratedRun,
    existingEntry?.createdAt ?? now,
    now,
  );
  const nextRuns = existingEntry
    ? library.runs.map((entry) =>
        entry.id === migratedRun.id ? nextEntry : cloneRunLibraryEntry(entry),
      )
    : [...library.runs.map(cloneRunLibraryEntry), nextEntry];
  const nextLibrary = {
    activeRunId: migratedRun.id,
    runs: nextRuns,
  };

  saveRunLibrary(nextLibrary);
  return nextLibrary;
}

export function setActiveRunId(runId: string): RunLibrary {
  const library = loadRunLibrary();
  const runExists = library.runs.some((entry) => entry.id === runId);

  if (!runExists) {
    return cloneRunLibrary(library);
  }

  const nextLibrary = {
    ...library,
    activeRunId: runId,
    runs: library.runs.map(cloneRunLibraryEntry),
  };

  saveRunLibrary(nextLibrary);
  return nextLibrary;
}

export function getActiveRunFromLibrary(): RunState | null {
  const library = loadRunLibrary();

  if (!library.activeRunId) {
    return null;
  }

  const activeEntry = library.runs.find(
    (entry) => entry.id === library.activeRunId,
  );
  return activeEntry ? cloneRunState(activeEntry.run) : null;
}

export function deleteRunFromLibrary(runId: string): RunLibrary {
  const library = loadRunLibrary();
  const nextRuns = library.runs
    .filter((entry) => entry.id !== runId)
    .map(cloneRunLibraryEntry);
  const nextActiveRunId =
    library.activeRunId === runId ? nextRuns[0]?.id : library.activeRunId;
  const nextLibrary = {
    activeRunId: nextActiveRunId,
    runs: nextRuns,
  };

  saveRunLibrary(nextLibrary);
  return nextLibrary;
}

export function clearRunLibrary(): void {
  window.localStorage.removeItem(RUN_LIBRARY_STORAGE_KEY);
}

export function ensureCurrentRunInLibrary(fallbackRun: RunState): RunLibrary {
  void fallbackRun;

  const library = loadRunLibrary();
  const savedRun = window.localStorage.getItem(RUN_STORAGE_KEY);

  if (!savedRun) {
    return library;
  }

  try {
    const parsedRun: unknown = JSON.parse(savedRun);

    if (!isRunState(parsedRun)) {
      window.localStorage.removeItem(RUN_STORAGE_KEY);
      return library;
    }

    return upsertRunInLibrary(migrateLegacyEmulatorConfig(parsedRun));
  } catch {
    window.localStorage.removeItem(RUN_STORAGE_KEY);
    return library;
  }
}

export function sortRunEntriesByUpdatedAt(
  entries: RunLibraryEntry[],
): RunLibraryEntry[] {
  return [...entries].sort((firstEntry, secondEntry) => {
    const firstTime = Date.parse(firstEntry.updatedAt);
    const secondTime = Date.parse(secondEntry.updatedAt);
    const firstIsValid = Number.isFinite(firstTime);
    const secondIsValid = Number.isFinite(secondTime);

    if (!firstIsValid && !secondIsValid) {
      return 0;
    }

    if (!firstIsValid) {
      return 1;
    }

    if (!secondIsValid) {
      return -1;
    }

    return secondTime - firstTime;
  });
}

function createRunLibraryEntry(
  run: RunState,
  createdAt: string,
  updatedAt: string,
): RunLibraryEntry {
  return {
    id: run.id,
    name: run.name,
    gameId: run.gameId,
    gameName: run.gameName,
    platform: run.platform,
    challengeType: run.challengeType,
    createdAt,
    updatedAt,
    run: cloneRunState(run),
  };
}

function cloneRunLibrary(library: RunLibrary): RunLibrary {
  return {
    activeRunId: library.activeRunId,
    runs: library.runs.map(cloneRunLibraryEntry),
  };
}

function cloneRunLibraryEntry(entry: RunLibraryEntry): RunLibraryEntry {
  return {
    ...entry,
    run: cloneRunState(entry.run),
  };
}

function isRunLibrary(value: unknown): value is RunLibrary {
  return (
    isRecord(value) &&
    (value.activeRunId === undefined || typeof value.activeRunId === "string") &&
    Array.isArray(value.runs) &&
    value.runs.every(isRunLibraryEntry)
  );
}

function isRunLibraryEntry(value: unknown): value is RunLibraryEntry {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (value.gameId === undefined || typeof value.gameId === "string") &&
    typeof value.gameName === "string" &&
    typeof value.platform === "string" &&
    typeof value.challengeType === "string" &&
    typeof value.updatedAt === "string" &&
    typeof value.createdAt === "string" &&
    isRunState(value.run)
  );
}
