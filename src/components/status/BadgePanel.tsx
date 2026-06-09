import type { Badge } from "../../shared/types";

type BadgePanelProps = {
  badges: Badge[];
  onToggleBadge: (badgeId: string) => void;
};

export function BadgePanel({ badges, onToggleBadge }: BadgePanelProps) {
  return (
    <section className="status-card status-card--badges" aria-label="Medallas">
      <span className="status-card__label">Medallas</span>
      <div className="badge-panel">
        {badges.map((badge, index) => (
          <button
            aria-label={`${badge.name}: ${badge.obtained ? "obtenida" : "bloqueada"}`}
            aria-pressed={badge.obtained}
            className={badge.obtained ? "badge-token badge-token--obtained" : "badge-token"}
            key={badge.id}
            onClick={() => onToggleBadge(badge.id)}
            title={[
              badge.name,
              badge.leaderName ? `Líder: ${badge.leaderName}` : null,
              badge.levelCap ? `Límite: ${badge.levelCap}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            type="button"
          >
            {index + 1}
          </button>
        ))}
      </div>
    </section>
  );
}
