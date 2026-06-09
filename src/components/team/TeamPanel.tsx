import type { PokemonSlot } from "../../shared/types";
import { PokemonSlotCard } from "./PokemonSlotCard";

type TeamPanelProps = {
  team: PokemonSlot[];
  onEditSlot: (slotIndex: number) => void;
};

export function TeamPanel({ team, onEditSlot }: TeamPanelProps) {
  return (
    <aside className="team-panel" aria-labelledby="team-panel-title">
      <div className="panel-heading">
        <p className="eyebrow">Actual</p>
        <h2 id="team-panel-title">Equipo</h2>
      </div>

      <div className="team-panel__slots">
        {team.map((pokemon, index) => (
          <PokemonSlotCard
            key={pokemon.id}
            pokemon={pokemon}
            onEdit={() => onEditSlot(index)}
            slotNumber={index + 1}
          />
        ))}
      </div>
    </aside>
  );
}
