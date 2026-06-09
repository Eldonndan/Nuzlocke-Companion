type LevelCapPanelProps = {
  levelCap: number;
  onChange: (levelCap: number) => void;
};

export function LevelCapPanel({ levelCap, onChange }: LevelCapPanelProps) {
  return (
    <section className="status-card" aria-label="Límite de nivel">
      <span className="status-card__label">Límite de nivel</span>
      <input
        className="status-input"
        min="1"
        max="100"
        type="number"
        value={levelCap}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </section>
  );
}
