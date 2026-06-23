import type { BadgeIconKey } from "../../shared/visualTypes";

type BadgeIconProps = {
  iconKey: BadgeIconKey;
  obtained?: boolean;
  label?: string;
};

function BadgeSymbol({ iconKey }: { iconKey: BadgeIconKey }) {
  switch (iconKey) {
    case "rock":
      return <path d="M17 35l8-18 9 8 6 18H21z" />;
    case "water":
      return <path d="M32 14c8 9 12 15 12 23a12 12 0 0 1-24 0c0-8 4-14 12-23z" />;
    case "electric":
      return <path d="M35 10L20 34h10l-4 20 18-28H33z" />;
    case "grass":
      return <path d="M18 35c11-19 25-20 31-18-1 14-10 24-25 24 6-4 10-8 14-14-7 4-13 9-20 18z" />;
    case "poison":
      return (
        <>
          <circle cx="25" cy="27" r="6" />
          <circle cx="39" cy="31" r="5" />
          <circle cx="31" cy="43" r="4" />
        </>
      );
    case "psychic":
      return <path d="M43 24c-9-9-25-4-25 8 0 11 16 15 22 6 4-7-4-13-10-9" />;
    case "fire":
      return <path d="M34 11c3 9-7 12-2 19 2-6 7-8 9-14 8 9 7 27-9 30-13-2-17-14-10-25 0 7 5 10 7 12-2-9 2-14 5-22z" />;
    case "earth":
      return <path d="M17 24l15-10 15 10-3 21H20z" />;
    case "flying":
      return <path d="M14 36c13-14 23-18 36-15-8 3-13 8-17 16 7-3 12-3 17-1-12 8-24 8-36 0z" />;
    case "bug":
      return (
        <>
          <path d="M24 28c0-8 16-8 16 0v12c0 8-16 8-16 0z" />
          <path d="M24 30l-8-8M40 30l8-8M24 40l-9 7M40 40l9 7" />
        </>
      );
    case "normal":
      return <path d="M32 13l5 12 13 1-10 8 3 13-11-7-11 7 3-13-10-8 13-1z" />;
    case "ghost":
      return <path d="M20 45V25c0-9 24-9 24 0v20l-6-4-6 4-6-4z" />;
    case "fighting":
      return <path d="M19 36V23h5v10h3V19h5v14h3V21h5v14h3V26h5v10c0 10-7 14-16 14s-13-5-13-14z" />;
    case "steel":
      return <path d="M32 13l16 9v20l-16 9-16-9V22zM25 27h14v10H25z" />;
    case "ice":
      return <path d="M32 12v40M18 20l28 24M46 20L18 44M20 32h24" />;
    case "dragon":
      return <path d="M32 12l13 13-7 4 8 13-14 10-14-10 8-13-7-4z" />;
  }
}

export function BadgeIcon({ iconKey, obtained = false, label }: BadgeIconProps) {
  const accessibleProps = label
    ? { role: "img", "aria-label": label }
    : { "aria-hidden": true };

  return (
    <svg
      className={
        obtained
          ? `badge-icon badge-icon--${iconKey} badge-icon--obtained`
          : `badge-icon badge-icon--${iconKey} badge-icon--locked`
      }
      viewBox="0 0 64 64"
      {...accessibleProps}
    >
      <circle className="badge-icon__base" cx="32" cy="32" r="27" />
      <circle className="badge-icon__inner" cx="32" cy="32" r="20" />
      <g className="badge-icon__symbol">
        <BadgeSymbol iconKey={iconKey} />
      </g>
    </svg>
  );
}
