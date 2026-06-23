type HomeScreenProps = {
  onCreateRun: () => void;
  onContinueRun: () => void;
  onOpenMyRuns: () => void;
  hasSavedRun: boolean;
  hasRunLibrary: boolean;
};

export function HomeScreen({
  onCreateRun,
  onContinueRun,
  onOpenMyRuns,
  hasSavedRun,
  hasRunLibrary,
}: HomeScreenProps) {
  return (
    <main className="home-screen">
      <section className="home-panel" aria-labelledby="home-title">
        <p className="eyebrow">Companion de escritorio</p>
        <h1 id="home-title">Nuzlocke Companion</h1>
        <p className="home-copy">
          Una interfaz visual y limpia para jugar runs Nuzlocke manuales.
        </p>
        <div className="home-actions">
          {hasSavedRun ? (
            <button className="primary-button" type="button" onClick={onContinueRun}>
              Continuar run
            </button>
          ) : null}
          {hasRunLibrary ? (
            <button className="secondary-button" type="button" onClick={onOpenMyRuns}>
              Mis runs
            </button>
          ) : null}
          <button className="secondary-button" type="button" onClick={onCreateRun}>
            Nueva run
          </button>
        </div>
      </section>
    </main>
  );
}
