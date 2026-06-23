# Nuzlocke Companion

Desktop companion app for Pokemon Nuzlocke players, built with Tauri, React,
TypeScript, Rust, and pnpm.

## Current status

Nuzlocke Companion is a local-first desktop MVP for creating and playing
Pokemon Nuzlocke runs.

It currently includes:

- Internal Libretro runtime targeting mGBA for GB/GBC/GBA.
- User-provided local core and ROM paths.
- Pokemon GB/GBC/GBA game library.
- Per-game local ROM associations.
- Run tracking for lives, team, badges, level cap, route, and capture status.
- Original SVG/CSS visuals for game covers, console icons, and badge icons.
- SRAM battery save persistence and autosave on runtime teardown.
- Legacy external mGBA integration as a fallback.

The project does not include ROMs, BIOS files, cores, official artwork,
sprites, logos, or copyrighted game assets. Users are responsible for providing
legal local game files and any local Libretro core they choose to use.

## Development

```bash
pnpm install
pnpm dev
```

For the desktop shell:

```bash
pnpm tauri dev
```

The Tauri commands require the Rust toolchain to be installed locally.
