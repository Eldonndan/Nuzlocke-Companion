import type {
  EmulatorConfig,
  InternalLibretroRuntimeConfig,
  LegacyExternalRuntimeConfig,
  RunState,
  RuntimeConfig,
} from "../shared/types";

type LegacyExternalRuntimeInput = Partial<LegacyExternalRuntimeConfig> &
  Partial<EmulatorConfig>;

export function createDefaultLegacyExternalRuntimeConfig(): LegacyExternalRuntimeConfig {
  return {
    mode: "legacy-external",
    emulatorType: "mgba",
    executablePath: "",
    romPath: "",
    launchArgs: [],
  };
}

export function createDefaultInternalLibretroRuntimeConfig(): InternalLibretroRuntimeConfig {
  return {
    mode: "internal-libretro",
    core: "mgba",
    corePath: "",
    romPath: "",
  };
}

export function isLegacyExternalRuntime(
  config: RuntimeConfig | undefined,
): config is LegacyExternalRuntimeConfig {
  return config?.mode === "legacy-external";
}

export function isInternalLibretroRuntime(
  config: RuntimeConfig | undefined,
): config is InternalLibretroRuntimeConfig {
  return config?.mode === "internal-libretro";
}

export function normalizeLegacyExternalRuntimeConfig(
  config: LegacyExternalRuntimeInput | undefined,
): LegacyExternalRuntimeConfig {
  return {
    ...createDefaultLegacyExternalRuntimeConfig(),
    ...config,
    mode: "legacy-external",
    emulatorType: config?.emulatorType ?? config?.type ?? "mgba",
    launchArgs: config?.launchArgs ?? [],
  };
}

export function getRunRuntimeConfig(run: RunState): RuntimeConfig {
  if (run.runtimeConfig) {
    return run.runtimeConfig.mode === "legacy-external"
      ? normalizeLegacyExternalRuntimeConfig(run.runtimeConfig)
      : run.runtimeConfig;
  }

  if (run.emulatorConfig) {
    return normalizeLegacyExternalRuntimeConfig(run.emulatorConfig);
  }

  return createDefaultLegacyExternalRuntimeConfig();
}

export function withRunRuntimeConfig(
  run: RunState,
  runtimeConfig: RuntimeConfig,
): RunState {
  if (runtimeConfig.mode === "legacy-external") {
    const legacyRuntimeConfig = normalizeLegacyExternalRuntimeConfig(runtimeConfig);

    return {
      ...run,
      runtimeConfig: legacyRuntimeConfig,
      emulatorConfig: undefined,
    };
  }

  return {
    ...run,
    runtimeConfig,
    emulatorConfig: undefined,
  };
}

export function migrateLegacyEmulatorConfig(run: RunState): RunState {
  return withRunRuntimeConfig(run, getRunRuntimeConfig(run));
}
