import type { PokemonSlot } from "../../shared/types";

type PokemonSlotCardProps = {
  pokemon: PokemonSlot;
  slotNumber: number;
  onEdit: () => void;
};

export function PokemonSlotCard({
  pokemon,
  slotNumber,
  onEdit,
}: PokemonSlotCardProps) {
  const isEmptySlot =
    !pokemon.nickname.trim() ||
    !pokemon.species ||
    pokemon.species === "Sin asignar";
  const fallbackAvatar =
    pokemon.avatarLabel ||
    pokemon.nickname.slice(0, 2).toUpperCase() ||
    `${slotNumber}`;

  return (
    <article
      className={
        isEmptySlot
          ? "pokemon-slot-card pokemon-slot-card--empty"
          : "pokemon-slot-card"
      }
    >
      <div className="pokemon-slot-card__avatar" aria-hidden="true">
        {pokemon.spriteUrl ? (
          <img src={pokemon.spriteUrl} alt="" />
        ) : (
          <span>{fallbackAvatar}</span>
        )}
      </div>

      <div className="pokemon-slot-card__body">
        <div className="pokemon-slot-card__heading">
          <h3>{isEmptySlot ? "Slot vacío" : pokemon.nickname}</h3>
          {pokemon.level ? <span>Nv. {pokemon.level}</span> : null}
        </div>
        <p>{isEmptySlot ? "Sin Pokémon" : pokemon.species}</p>
      </div>

      <button
        className="slot-edit-button"
        type="button"
        onClick={onEdit}
        aria-label={`Editar slot ${slotNumber}`}
      >
        Editar
      </button>
    </article>
  );
}
