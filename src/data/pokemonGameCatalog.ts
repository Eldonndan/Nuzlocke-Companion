export type PokemonPlatform = "gb" | "gbc" | "gba";

export type PokemonGameCatalogEntry = {
  id: string;
  title: string;
  shortTitle: string;
  platform: PokemonPlatform;
  generation: string;
  region: string;
  releaseGroup: string;
  accent: string;
};

export const pokemonGameCatalog: PokemonGameCatalogEntry[] = [
  {
    id: "pokemon-red",
    title: "Pokémon Red",
    shortTitle: "Red",
    platform: "gb",
    generation: "Gen I",
    region: "Kanto",
    releaseGroup: "Original",
    accent: "red",
  },
  {
    id: "pokemon-blue",
    title: "Pokémon Blue",
    shortTitle: "Blue",
    platform: "gb",
    generation: "Gen I",
    region: "Kanto",
    releaseGroup: "Original",
    accent: "blue",
  },
  {
    id: "pokemon-yellow",
    title: "Pokémon Yellow",
    shortTitle: "Yellow",
    platform: "gb",
    generation: "Gen I",
    region: "Kanto",
    releaseGroup: "Special Pikachu Edition",
    accent: "yellow",
  },
  {
    id: "pokemon-gold",
    title: "Pokémon Gold",
    shortTitle: "Gold",
    platform: "gbc",
    generation: "Gen II",
    region: "Johto",
    releaseGroup: "Johto",
    accent: "gold",
  },
  {
    id: "pokemon-silver",
    title: "Pokémon Silver",
    shortTitle: "Silver",
    platform: "gbc",
    generation: "Gen II",
    region: "Johto",
    releaseGroup: "Johto",
    accent: "silver",
  },
  {
    id: "pokemon-crystal",
    title: "Pokémon Crystal",
    shortTitle: "Crystal",
    platform: "gbc",
    generation: "Gen II",
    region: "Johto",
    releaseGroup: "Crystal",
    accent: "crystal",
  },
  {
    id: "pokemon-ruby",
    title: "Pokémon Ruby",
    shortTitle: "Ruby",
    platform: "gba",
    generation: "Gen III",
    region: "Hoenn",
    releaseGroup: "Hoenn",
    accent: "ruby",
  },
  {
    id: "pokemon-sapphire",
    title: "Pokémon Sapphire",
    shortTitle: "Sapphire",
    platform: "gba",
    generation: "Gen III",
    region: "Hoenn",
    releaseGroup: "Hoenn",
    accent: "sapphire",
  },
  {
    id: "pokemon-emerald",
    title: "Pokémon Emerald",
    shortTitle: "Emerald",
    platform: "gba",
    generation: "Gen III",
    region: "Hoenn",
    releaseGroup: "Emerald",
    accent: "emerald",
  },
  {
    id: "pokemon-firered",
    title: "Pokémon FireRed",
    shortTitle: "FireRed",
    platform: "gba",
    generation: "Gen III",
    region: "Kanto",
    releaseGroup: "Kanto remake",
    accent: "firered",
  },
  {
    id: "pokemon-leafgreen",
    title: "Pokémon LeafGreen",
    shortTitle: "LeafGreen",
    platform: "gba",
    generation: "Gen III",
    region: "Kanto",
    releaseGroup: "Kanto remake",
    accent: "leafgreen",
  },
];

export function getPokemonPlatformLabel(platform: PokemonPlatform) {
  switch (platform) {
    case "gb":
      return "Game Boy";
    case "gbc":
      return "Game Boy Color";
    case "gba":
      return "Game Boy Advance";
  }
}
