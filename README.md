# Nuzlocke Companion

Desktop companion app for Pokemon Nuzlocke players, built with Tauri, React,
TypeScript, and pnpm.

## Project direction

Nuzlocke Companion is migrating from an external emulator overlay/capture
prototype toward a specialized Pokemon Nuzlocke emulation frontend.

The current app is still a prototype: it includes a polished run layout, local
run tracking, manual controls, and experimental integration with an external
mGBA window. The intended direction is to eventually host GB/GBC/GBA gameplay
inside the app through a native emulation layer, starting with mGBA via
Libretro research.

The project does not include ROMs, BIOS files, copyrighted game assets, or
emulator binaries. Users are responsible for providing legal local game files.
Internal emulation is not implemented yet.

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
