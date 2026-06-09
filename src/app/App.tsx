import { useMemo, useState } from "react";
import { sampleRun } from "../data/sampleRun";
import { CreateRunScreen } from "../screens/CreateRunScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { MainPlayScreen } from "../screens/MainPlayScreen";
import type { AppScreen, RunState } from "../shared/types";
import { hasSavedRun, saveRun } from "../utils/runStorage";

export function App() {
  const [screen, setScreen] = useState<AppScreen>("home");
  const run = useMemo(() => sampleRun, []);

  if (screen === "create-run") {
    return (
      <CreateRunScreen
        onBack={() => setScreen("home")}
        onCreate={(newRun: RunState) => {
          saveRun(newRun);
          setScreen("play");
        }}
      />
    );
  }

  if (screen === "play") {
    return <MainPlayScreen run={run} onExit={() => setScreen("create-run")} />;
  }

  return (
    <HomeScreen
      hasSavedRun={hasSavedRun()}
      onContinueRun={() => setScreen("play")}
      onCreateRun={() => setScreen("create-run")}
    />
  );
}
