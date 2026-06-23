import type { PokemonPlatform } from "../../data/pokemonGameCatalog";

type ConsoleIconProps = {
  platform: PokemonPlatform;
  label?: string;
};

export function ConsoleIcon({ platform, label }: ConsoleIconProps) {
  const accessibleProps = label
    ? { role: "img", "aria-label": label }
    : { "aria-hidden": true };

  if (platform === "gba") {
    return (
      <svg
        className="console-icon console-icon--gba"
        viewBox="0 0 64 40"
        {...accessibleProps}
      >
        <rect x="5" y="7" width="54" height="26" rx="13" />
        <rect className="console-icon__screen" x="23" y="11" width="18" height="18" rx="3" />
        <circle cx="15" cy="20" r="4" />
        <circle cx="49" cy="17" r="2.8" />
        <circle cx="53" cy="23" r="2.8" />
      </svg>
    );
  }

  return (
    <svg
      className={`console-icon console-icon--${platform}`}
      viewBox="0 0 40 56"
      {...accessibleProps}
    >
      <rect x="8" y="4" width="24" height="48" rx="6" />
      <rect className="console-icon__screen" x="12" y="10" width="16" height="16" rx="2" />
      <path d="M14 36h12M20 30v12" />
      <circle cx="27" cy="35" r="2.2" />
      <circle cx="30" cy="41" r="2.2" />
      {platform === "gbc" ? (
        <circle className="console-icon__color-dot" cx="14" cy="46" r="2" />
      ) : null}
    </svg>
  );
}
