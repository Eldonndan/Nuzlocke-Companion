import type { Badge, CaptureStatus, RunState } from "../shared/types";

const captureStatusOrder: CaptureStatus[] = [
  "available",
  "used",
  "failed",
  "not-applicable",
];

export function getNextLevelCap(badges: Badge[]) {
  const badgesWithCaps = badges.filter(
    (badge) => typeof badge.levelCap === "number",
  );

  if (badgesWithCaps.length === 0) {
    return null;
  }

  const nextBadge = badgesWithCaps.find((badge) => !badge.obtained);
  return nextBadge?.levelCap ?? badgesWithCaps[badgesWithCaps.length - 1].levelCap;
}

export function applyLivesDelta(run: RunState, delta: number): RunState {
  return {
    ...run,
    lives: Math.max(0, run.lives + delta),
  };
}

export function toggleRunBadge(run: RunState, badgeId: string): RunState {
  const nextBadges = run.badges.map((badge) =>
    badge.id === badgeId ? { ...badge, obtained: !badge.obtained } : badge,
  );

  return {
    ...run,
    badges: nextBadges,
    levelCap: getNextLevelCap(nextBadges) ?? run.levelCap,
  };
}

export function updateRunLevelCap(run: RunState, levelCap: number): RunState {
  return {
    ...run,
    levelCap: Number.isFinite(levelCap) ? Math.max(1, levelCap) : run.levelCap,
  };
}

export function updateRunRoute(run: RunState, routeName: string): RunState {
  return {
    ...run,
    currentRoute: {
      ...run.currentRoute,
      name: routeName,
    },
  };
}

export function cycleRunCaptureStatus(run: RunState): RunState {
  const currentIndex = captureStatusOrder.indexOf(run.captureStatus);
  const nextStatus =
    captureStatusOrder[(currentIndex + 1) % captureStatusOrder.length];

  return {
    ...run,
    captureStatus: nextStatus,
  };
}
