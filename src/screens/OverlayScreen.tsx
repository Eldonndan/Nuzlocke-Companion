import { emit, listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { sampleRun } from "../data/sampleRun";
import type { OverlayAction, RunState } from "../shared/types";
import { BadgeIcon } from "../components/visuals/BadgeIcon";
import { captureStatusLabels } from "../utils/captureStatusLabels";
import { loadSavedRun } from "../utils/runStorage";

export function OverlayScreen() {
  const [runState, setRunState] = useState<RunState>(() => loadSavedRun(sampleRun));
  const [isEditing, setIsEditing] = useState(false);
  const [routeDraft, setRouteDraft] = useState(runState.currentRoute.name);
  const [levelCapDraft, setLevelCapDraft] = useState(String(runState.levelCap));

  const sendAction = (action: OverlayAction) => {
    void emit("overlay-action", action);
  };

  useEffect(() => {
    setRouteDraft(runState.currentRoute.name);
    setLevelCapDraft(String(runState.levelCap));
  }, [runState.currentRoute.name, runState.levelCap]);

  useEffect(() => {
    document.documentElement.classList.add("overlay-document");
    document.body.classList.add("overlay-body");

    return () => {
      document.documentElement.classList.remove("overlay-document");
      document.body.classList.remove("overlay-body");
    };
  }, []);

  useEffect(() => {
    let unlistenRun: (() => void) | null = null;
    let unlistenEdit: (() => void) | null = null;
    let isDisposed = false;

    void listen<RunState>("run-state-updated", (event) => {
      setRunState(event.payload);
    }).then((unlisten) => {
      if (isDisposed) {
        unlisten();
        return;
      }
      unlistenRun = unlisten;
    });

    void listen<boolean>("overlay-edit-mode", (event) => {
      setIsEditing(event.payload);
    }).then((unlisten) => {
      if (isDisposed) {
        unlisten();
        return;
      }
      unlistenEdit = unlisten;
    });

    return () => {
      isDisposed = true;
      unlistenRun?.();
      unlistenEdit?.();
    };
  }, []);

  return (
    <main className={`overlay-screen ${isEditing ? "overlay-screen--editing" : ""}`}>
      <aside className="overlay-debug-indicator" aria-label="Estado del overlay">
        <strong>Overlay activo</strong>
        <span>F12: editar</span>
      </aside>

      <section className="overlay-team" aria-label="Equipo">
        <header>
          <span>Equipo</span>
          {isEditing ? <strong>Modo edición</strong> : null}
        </header>
        <div className="overlay-team__slots">
          {runState.team.map((pokemon, index) => {
            const isEmpty = !pokemon.nickname.trim() && !pokemon.species?.trim();
            return (
              <article
                className={isEmpty ? "overlay-pokemon overlay-pokemon--empty" : "overlay-pokemon"}
                key={pokemon.id}
              >
                <div className="overlay-pokemon__avatar">
                  {pokemon.spriteUrl ? (
                    <img src={pokemon.spriteUrl} alt="" />
                  ) : (
                    pokemon.avatarLabel || index + 1
                  )}
                </div>
                <div>
                  <strong>{isEmpty ? "Sin Pokémon" : pokemon.nickname}</strong>
                  <span>
                    {isEmpty
                      ? "Slot vacío"
                      : `${pokemon.species || "Pokémon"}${
                          pokemon.level ? ` · Nv. ${pokemon.level}` : ""
                        }`}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="overlay-status" aria-label="Estado de la run">
        <div>
          <span>Vidas</span>
          <strong>
            <span aria-hidden="true">❤️</span> {runState.lives}
          </strong>
        </div>
        <div>
          <span>Medallas</span>
          <div className="overlay-badges">
            {runState.badges.map((badge, index) => (
              <i
                className={badge.obtained ? "overlay-badge overlay-badge--obtained" : "overlay-badge"}
                key={badge.id}
                title={badge.name}
              >
                {badge.iconKey ? (
                  <BadgeIcon iconKey={badge.iconKey} obtained={badge.obtained} />
                ) : (
                  index + 1
                )}
              </i>
            ))}
          </div>
        </div>
        <div>
          <span>Límite de nivel</span>
          <strong>{runState.levelCap}</strong>
        </div>
        <div>
          <span>Ruta actual</span>
          <strong>{runState.currentRoute.name}</strong>
        </div>
        <div>
          <span>Captura</span>
          <strong>{captureStatusLabels[runState.captureStatus]}</strong>
        </div>
      </section>

      {isEditing ? (
        <aside className="overlay-edit-panel" aria-label="Modo edición">
          <header>
            <strong>Modo edición</strong>
            <span>F12: cerrar edición</span>
          </header>
          <div className="overlay-edit-panel__row">
            <button type="button" onClick={() => sendAction({ type: "increase-lives" })}>
              + vida
            </button>
            <button type="button" onClick={() => sendAction({ type: "decrease-lives" })}>
              - vida
            </button>
          </div>
          <button type="button" onClick={() => sendAction({ type: "cycle-capture-status" })}>
            Captura: {captureStatusLabels[runState.captureStatus]}
          </button>
          <label>
            <span>Ruta actual</span>
            <input
              type="text"
              value={routeDraft}
              onChange={(event) => setRouteDraft(event.target.value)}
              onBlur={() => sendAction({ type: "set-route", routeName: routeDraft })}
            />
          </label>
          <label>
            <span>Límite de nivel</span>
            <input
              min="1"
              max="100"
              type="number"
              value={levelCapDraft}
              onChange={(event) => setLevelCapDraft(event.target.value)}
              onBlur={() =>
                sendAction({ type: "set-level-cap", levelCap: Number(levelCapDraft) })
              }
            />
          </label>
          <button type="button" onClick={() => sendAction({ type: "close-edit-mode" })}>
            Cerrar edición
          </button>
          <button type="button" onClick={() => sendAction({ type: "restore-main-window" })}>
            Volver a la app
          </button>
          <p>F8/F9: Vidas · F10: Captura · F11: Ruta · F12: Modo edición</p>
        </aside>
      ) : (
        <aside className="overlay-hotkey-help" aria-label="Ayuda de atajos">
          F12: Modo edición · F8/F9: Vidas · F10: Captura · F11: Ruta
        </aside>
      )}
    </main>
  );
}
