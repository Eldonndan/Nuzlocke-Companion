import type { ReactNode } from "react";

export type InternalPlayTab = "team" | "run" | "runtime" | "debug";

type InternalPlaySidePanelProps = {
  activeTab: InternalPlayTab;
  onTabChange: (tab: InternalPlayTab) => void;
  teamPanel: ReactNode;
  runPanel: ReactNode;
  runtimePanel: ReactNode;
  debugController: ReactNode;
};

const tabs: Array<{ id: InternalPlayTab; label: string }> = [
  { id: "team", label: "Equipo" },
  { id: "run", label: "Run" },
  { id: "runtime", label: "Runtime" },
  { id: "debug", label: "Avanzado" },
];

export function InternalPlaySidePanel({
  activeTab,
  onTabChange,
  teamPanel,
  runPanel,
  runtimePanel,
  debugController,
}: InternalPlaySidePanelProps) {
  return (
    <aside className="internal-play-side-panel" aria-label="Panel interno">
      <nav className="internal-play-tabs" aria-label="Paneles del modo interno">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={
              activeTab === tab.id
                ? "internal-play-tab internal-play-tab--active"
                : "internal-play-tab"
            }
            type="button"
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="internal-play-tab-panel">
        {activeTab === "team" ? teamPanel : null}
        {activeTab === "run" ? runPanel : null}
        {activeTab === "runtime" ? runtimePanel : null}
      </div>

      <div
        className={
          activeTab === "debug"
            ? "internal-play-debug-controller"
            : "internal-play-debug-controller internal-play-debug-controller--compact"
        }
      >
        {debugController}
      </div>
    </aside>
  );
}
