import {
  getPokemonPlatformLabel,
  type PokemonGameCatalogEntry,
} from "../../data/pokemonGameCatalog";
import { GameCover } from "../visuals/GameCover";

type PokemonGameCardProps = {
  game: PokemonGameCatalogEntry;
  romPath: string | null;
  onAssignRom: (game: PokemonGameCatalogEntry) => void;
  onConfigureRun: (game: PokemonGameCatalogEntry) => void;
};

function getFileNameFromPath(path: string) {
  return path.split(/[\\/]/).pop() || "Archivo ROM asociado";
}

export function PokemonGameCard({
  game,
  romPath,
  onAssignRom,
  onConfigureRun,
}: PokemonGameCardProps) {
  const hasRom = Boolean(romPath);
  const statusLabel = hasRom ? "ROM lista" : "ROM pendiente";

  return (
    <article
      aria-label={`${game.title}, ${getPokemonPlatformLabel(game.platform)}, ${statusLabel}`}
      className={
        hasRom
          ? `pokemon-game-card pokemon-game-card--${game.accent}`
          : "pokemon-game-card pokemon-game-card--missing"
      }
    >
      <GameCover
        title={game.title}
        shortTitle={game.shortTitle}
        platform={game.platform}
        generation={game.generation}
        region={game.region}
        accent={game.accent}
        isConfigured={hasRom}
      />
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
        <span className="pokemon-game-card__status">{statusLabel}</span>
        {romPath ? <small>{getFileNameFromPath(romPath)}</small> : null}
        <p className="pokemon-game-card__hint">
          {hasRom
            ? "Listo para crear una run."
            : "Selecciona tu archivo local para activar este juego."}
        </p>
      </div>
      <div className="pokemon-game-card__actions">
        {hasRom ? (
          <button
            className="primary-button"
            type="button"
            aria-label={`Configurar run de ${game.title}`}
            onClick={() => onConfigureRun(game)}
          >
            Configurar run
          </button>
        ) : (
          <button
            className="secondary-button"
            type="button"
            aria-label={`Asignar ROM para ${game.title}`}
            onClick={() => onAssignRom(game)}
          >
            Asignar ROM
          </button>
        )}
        {hasRom ? (
          <button
            className="secondary-button"
            type="button"
            aria-label={`Cambiar ROM de ${game.title}`}
            onClick={() => onAssignRom(game)}
          >
            Cambiar ROM
          </button>
        ) : null}
      </div>
    </article>
  );
}
