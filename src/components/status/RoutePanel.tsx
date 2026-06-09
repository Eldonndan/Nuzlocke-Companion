type RoutePanelProps = {
  routeName: string;
  onChange: (routeName: string) => void;
};

export function RoutePanel({ routeName, onChange }: RoutePanelProps) {
  return (
    <section className="status-card" aria-label="Ruta actual">
      <span className="status-card__label">Ruta actual</span>
      <input
        className="status-input"
        type="text"
        value={routeName}
        onChange={(event) => onChange(event.target.value)}
      />
    </section>
  );
}
