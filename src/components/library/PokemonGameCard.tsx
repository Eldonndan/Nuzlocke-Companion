import {
  getPokemonPlatformLabel,
  type PokemonGameCatalogEntry,
} from "../../data/pokemonGameCatalog";

type PokemonGameCardProps = {
  game: PokemonGameCatalogEntry;
  romPath: string | null;
  onAssignRom: (game: PokemonGameCatalogEntry) => void;
  onConfigureRun: (game: PokemonGameCatalogEntry) => void;
};

export function PokemonGameCard({
  game,
  romPath,
  onAssignRom,
  onConfigureRun,
}: PokemonGameCardProps) {
  const hasRom = Boolean(romPath);
  const initials = game.shortTitle
    .split(/(?=[A-Z])/)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

  return (
    <article
      className={
        hasRom
          ? `pokemon-game-card pokemon-game-card--${game.accent}`
          : "pokemon-game-card pokemon-game-card--missing"
      }
    >
      <div className="pokemon-game-card__mark" aria-hidden="true">
        {initials}
      </div>
      <div className="pokemon-game-card__content">
        <div>
          <p className="eyebrow">{getPokemonPlatformLabel(game.platform)}</p>
          <h3>{game.title}</h3>
        </div>
        <div className="pokemon-game-card__meta">
          <span>{game.generation}</span>
          <span>{game.region}</span>
          <span>{game.releaseGroup}</span>
        </div>
        <strong>{hasRom ? "ROM lista" : "ROM pendiente"}</strong>
        {romPath ? <small>{romPath}</small> : null}
      </div>
      <div className="pokemon-game-card__actions">
        {hasRom ? (
          <button
            className="primary-button"
            type="button"
            onClick={() => onConfigureRun(game)}
          >
            Configurar run
          </button>
        ) : (
          <button
            className="secondary-button"
            type="button"
            onClick={() => onAssignRom(game)}
          >
            Asignar ROM
          </button>
        )}
        {hasRom ? (
          <button
            className="secondary-button"
            type="button"
            onClick={() => onAssignRom(game)}
          >
            Cambiar ROM
          </button>
        ) : null}
      </div>
    </article>
  );
}
