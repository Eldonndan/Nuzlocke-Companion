import type { RunState } from "../shared/types";

export function cloneRunState(run: RunState): RunState {
  return {
    ...run,
    currentRoute: { ...run.currentRoute },
    captureWindow: run.captureWindow ? { ...run.captureWindow } : undefined,
    team: run.team.map((pokemon) => ({ ...pokemon })),
    badges: run.badges.map((badge) => ({ ...badge })),
  };
}
