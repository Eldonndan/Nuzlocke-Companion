import { useMemo, useState } from "react";
import { sampleRun } from "../data/sampleRun";
import { CreateRunScreen } from "../screens/CreateRunScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { MainPlayScreen } from "../screens/MainPlayScreen";
import { MyRunsScreen } from "../screens/MyRunsScreen";
import type { AppScreen, RunState } from "../shared/types";
import {
  ensureCurrentRunInLibrary,
  loadRunLibrary,
  setActiveRunId,
} from "../utils/runLibraryStorage";
import { hasSavedRun, loadSavedRun, saveRun } from "../utils/runStorage";

export function App() {
  const [screen, setScreen] = useState<AppScreen>("home");
  const run = useMemo(() => sampleRun, []);
  const [activeRun, setActiveRun] = useState<RunState | null>(null);
  const [runLibrary, setRunLibrary] = useState(() =>
    ensureCurrentRunInLibrary(sampleRun),
  );
  const refreshRunLibrary = () => setRunLibrary(loadRunLibrary());

  const createRun = (newRun: RunState) => {
    saveRun(newRun);
    setActiveRun(newRun);
    refreshRunLibrary();
    setScreen("play");
  };

  const continueRun = (selectedRun: RunState) => {
    setActiveRunId(selectedRun.id);
    saveRun(selectedRun);
    setActiveRun(selectedRun);
    refreshRunLibrary();
    setScreen("play");
  };

  const continueCurrentRun = () => {
    const savedRun = loadSavedRun(sampleRun);

    saveRun(savedRun);
    setActiveRun(savedRun);
    refreshRunLibrary();
    setScreen("play");
  };

  if (screen === "create-run") {
    return (
      <CreateRunScreen
        onBack={() => setScreen("home")}
        onCreate={createRun}
        onOpenMyRuns={() => {
          refreshRunLibrary();
          setScreen("my-runs");
        }}
        hasRunLibrary={runLibrary.runs.length > 0}
      />
    );
  }

  if (screen === "my-runs") {
    return (
      <MyRunsScreen
        onBack={() => {
          refreshRunLibrary();
          setScreen("home");
        }}
        onContinueRun={continueRun}
        onCreateNewRun={() => {
          refreshRunLibrary();
          setScreen("create-run");
        }}
      />
    );
  }

  if (screen === "play") {
    return (
      <MainPlayScreen
        run={activeRun ?? run}
        onExit={() => {
          refreshRunLibrary();
          setActiveRun(null);
          setScreen("create-run");
        }}
      />
    );
  }

  return (
    <HomeScreen
      hasSavedRun={hasSavedRun()}
      hasRunLibrary={runLibrary.runs.length > 0}
      onContinueRun={continueCurrentRun}
      onCreateRun={() => setScreen("create-run")}
      onOpenMyRuns={() => {
        refreshRunLibrary();
        setScreen("my-runs");
      }}
    />
  );
}
