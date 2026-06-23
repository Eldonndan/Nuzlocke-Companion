import type { OverlayAction, RunState } from "../shared/types";
import {
  applyLivesDelta,
  cycleRunCaptureStatus,
  updateRunLevelCap,
  updateRunRoute,
} from "./runStateActions";

type OverlayRunAction = Extract<
  OverlayAction,
  | { type: "increase-lives" }
  | { type: "decrease-lives" }
  | { type: "cycle-capture-status" }
  | { type: "set-route" }
  | { type: "set-level-cap" }
>;

export function isOverlayRunAction(
  action: OverlayAction,
): action is OverlayRunAction {
  return (
    action.type === "increase-lives" ||
    action.type === "decrease-lives" ||
    action.type === "cycle-capture-status" ||
    action.type === "set-route" ||
    action.type === "set-level-cap"
  );
}

export function applyOverlayRunAction(
  run: RunState,
  action: OverlayAction,
): RunState {
  if (action.type === "increase-lives") {
    return applyLivesDelta(run, 1);
  }

  if (action.type === "decrease-lives") {
    return applyLivesDelta(run, -1);
  }

  if (action.type === "cycle-capture-status") {
    return cycleRunCaptureStatus(run);
  }

  if (action.type === "set-route") {
    return updateRunRoute(run, action.routeName);
  }

  if (action.type === "set-level-cap") {
    return updateRunLevelCap(run, action.levelCap);
  }

  return run;
}
