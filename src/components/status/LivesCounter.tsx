type LivesCounterProps = {
  lives: number;
  onDecrease: () => void;
  onIncrease: () => void;
};

export function LivesCounter({
  lives,
  onDecrease,
  onIncrease,
}: LivesCounterProps) {
  return (
    <section className="status-card status-card--lives" aria-label="Vidas">
      <span className="status-card__label">Vidas</span>
      <div className="inline-control">
        <button type="button" onClick={onDecrease} aria-label="Bajar vidas">
          −
        </button>
        <strong>
          <span aria-hidden="true">❤️</span> {lives} vidas
        </strong>
        <button type="button" onClick={onIncrease} aria-label="Subir vidas">
          +
        </button>
      </div>
    </section>
  );
}
