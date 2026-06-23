import type { PokemonPlatform } from "../../data/pokemonGameCatalog";
import { getPokemonPlatformLabel } from "../../data/pokemonGameCatalog";
import { ConsoleIcon } from "./ConsoleIcon";

type GameCoverProps = {
  title: string;
  shortTitle: string;
  platform: PokemonPlatform;
  generation: string;
  region: string;
  accent: string;
  isConfigured: boolean;
};

function getCoverInitials(shortTitle: string) {
  const compactTitle = shortTitle.replace(/\s+/g, "");
  const capitals = compactTitle.match(/[A-Z]/g)?.join("") ?? "";

  return (capitals || compactTitle.slice(0, 2)).slice(0, 3).toUpperCase();
}

export function GameCover({
  title,
  shortTitle,
  platform,
  generation,
  region,
  accent,
  isConfigured,
}: GameCoverProps) {
  return (
    <div
      className={
        isConfigured
          ? `game-cover game-cover--${accent}`
          : `game-cover game-cover--${accent} game-cover--missing`
      }
      aria-hidden="true"
    >
      <div className="game-cover__topline">
        <ConsoleIcon platform={platform} />
        <span>{getPokemonPlatformLabel(platform)}</span>
      </div>
      <div className="game-cover__initials">{getCoverInitials(shortTitle)}</div>
      <div className="game-cover__footer">
        <strong>{title}</strong>
        <span>
          {generation} · {region}
        </span>
      </div>
    </div>
  );
}
