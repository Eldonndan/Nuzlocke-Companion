import type { InternalLibretroRuntimeConfig } from "../shared/types";
import { normalizeInternalLibretroRuntimeConfig } from "./runtimeConfig";

export type InternalRuntimePreferences = {
  core: "mgba";
  corePath: string;
  saveDirectory?: string;
};

const INTERNAL_RUNTIME_PREFERENCES_STORAGE_KEY =
  "nuzlocke-companion.internal-runtime-preferences.v1";

export function loadInternalRuntimePreferences(): InternalRuntimePreferences | null {
  try {
    const savedPreferences = window.localStorage.getItem(
      INTERNAL_RUNTIME_PREFERENCES_STORAGE_KEY,
    );

    if (!savedPreferences) {
      return null;
    }

    const parsedPreferences: unknown = JSON.parse(savedPreferences);

    if (!isInternalRuntimePreferences(parsedPreferences)) {
      clearInternalRuntimePreferences();
      return null;
    }

    return {
      core: "mgba",
      corePath: parsedPreferences.corePath.trim(),
      saveDirectory: parsedPreferences.saveDirectory?.trim() || undefined,
    };
  } catch {
    clearInternalRuntimePreferences();
    return null;
  }
}

export function saveInternalRuntimePreferences(
  preferences: InternalRuntimePreferences,
) {
  const normalizedPreferences: InternalRuntimePreferences = {
    core: "mgba",
    corePath: preferences.corePath.trim(),
    saveDirectory: preferences.saveDirectory?.trim() || undefined,
  };

  window.localStorage.setItem(
    INTERNAL_RUNTIME_PREFERENCES_STORAGE_KEY,
    JSON.stringify(normalizedPreferences),
  );
}

export function clearInternalRuntimePreferences() {
  try {
    window.localStorage.removeItem(INTERNAL_RUNTIME_PREFERENCES_STORAGE_KEY);
  } catch {
    // Ignore storage failures; callers treat missing preferences as safe.
  }
}

export function applyInternalRuntimePreferencesToConfig(
  config: InternalLibretroRuntimeConfig,
) {
  const normalizedConfig = normalizeInternalLibretroRuntimeConfig(config);
  const preferences = loadInternalRuntimePreferences();

  if (!preferences) {
    return normalizedConfig;
  }

  return normalizeInternalLibretroRuntimeConfig({
    ...normalizedConfig,
    core: "mgba",
    corePath: normalizedConfig.corePath.trim()
      ? normalizedConfig.corePath
      : preferences.corePath,
    saveDirectory: normalizedConfig.saveDirectory?.trim()
      ? normalizedConfig.saveDirectory
      : preferences.saveDirectory,
    romPath: normalizedConfig.romPath,
  });
}

function isInternalRuntimePreferences(
  value: unknown,
): value is InternalRuntimePreferences {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<InternalRuntimePreferences>;

  return (
    candidate.core === "mgba" &&
    typeof candidate.corePath === "string" &&
    candidate.corePath.trim().length > 0 &&
    (candidate.saveDirectory === undefined ||
      typeof candidate.saveDirectory === "string")
  );
}
