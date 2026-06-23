import { useState } from "react";
import type { RunState } from "../shared/types";
import {
  deleteRunFromLibrary,
  loadRunLibrary,
  sortRunEntriesByUpdatedAt,
  type RunLibrary,
  type RunLibraryEntry,
} from "../utils/runLibraryStorage";
import { clearCurrentRunIfMatches } from "../utils/runStorage";

type MyRunsScreenProps = {
  onBack: () => void;
  onContinueRun: (run: RunState) => void;
  onCreateNewRun: () => void;
};

function formatUpdatedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }

  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getObtainedBadgeCount(entry: RunLibraryEntry) {
  return entry.run.badges.filter((badge) => badge.obtained).length;
}

export function MyRunsScreen({
  onBack,
  onContinueRun,
  onCreateNewRun,
}: MyRunsScreenProps) {
  const [library, setLibrary] = useState<RunLibrary>(() => loadRunLibrary());
  const [message, setMessage] = useState("");
  const sortedRuns = sortRunEntriesByUpdatedAt(library.runs);

  const deleteRun = (entry: RunLibraryEntry) => {
    const shouldDelete = window.confirm(
      `Eliminar "${entry.name}" de Mis runs? Esta accion no borra ROMs ni saves.`,
    );

    if (!shouldDelete) {
      return;
    }

    const wasActiveRun = library.activeRunId === entry.id;
    const nextLibrary = deleteRunFromLibrary(entry.id);
    clearCurrentRunIfMatches(entry.id);
    setLibrary(nextLibrary);
    setMessage(wasActiveRun ? "Run activa eliminada." : "Run eliminada.");
  };

  return (
    <main className="my-runs-screen">
      <header className="screen-header create-run-header">
        <button className="secondary-button" type="button" onClick={onBack}>
          Volver
        </button>
        <div>
          <p className="eyebrow">Biblioteca local</p>
          <h1>Mis runs</h1>
        </div>
      </header>

      {message ? <p className="my-runs-message">{message}</p> : null}

      {library.runs.length === 0 ? (
        <section className="empty-runs-card" aria-labelledby="empty-runs-title">
          <p className="eyebrow">Sin runs guardadas</p>
          <h2 id="empty-runs-title">Crea una run para verla aqui</h2>
          <p>
            Las runs nuevas se guardaran localmente y apareceran en esta lista
            para continuar despues.
          </p>
          <p>Tus runs se guardan solo en este equipo.</p>
          <p>La app no borra ROMs ni saves desde esta lista.</p>
          <button
            className="primary-button"
            type="button"
            onClick={onCreateNewRun}
          >
            Crear run
          </button>
        </section>
      ) : (
        <>
          <section className="my-runs-grid" aria-label="Runs guardadas">
            {sortedRuns.map((entry) => {
              const isActiveRun = library.activeRunId === entry.id;

              return (
                <article
                  className={isActiveRun ? "run-card run-card--active" : "run-card"}
                  key={entry.id}
                >
                  <div>
                    <div className="run-card__header">
                      <p className="eyebrow">{entry.platform}</p>
                      {isActiveRun ? (
                        <span className="run-card__badge">Activa</span>
                      ) : null}
                    </div>
                    <h2>{entry.name}</h2>
                  </div>

                  <dl className="run-card__meta">
                    <div>
                      <dt>Juego</dt>
                      <dd>{entry.gameName}</dd>
                    </div>
                    <div>
                      <dt>Reto</dt>
                      <dd>{entry.challengeType}</dd>
                    </div>
                    <div>
                      <dt>Actualizada</dt>
                      <dd>{formatUpdatedAt(entry.updatedAt)}</dd>
                    </div>
                    <div>
                      <dt>Vidas</dt>
                      <dd>{entry.run.lives}</dd>
                    </div>
                    <div>
                      <dt>Medallas</dt>
                      <dd>
                        {getObtainedBadgeCount(entry)} / {entry.run.badges.length}
                      </dd>
                    </div>
                  </dl>

                  <div className="run-card__actions">
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => onContinueRun(entry.run)}
                    >
                      Continuar
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => deleteRun(entry)}
                    >
                      Eliminar
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        </>
      )}
    </main>
  );
}
