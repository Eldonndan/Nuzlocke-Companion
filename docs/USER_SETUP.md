# User Setup

Nuzlocke Companion is a local-first desktop MVP. It does not include ROMs, BIOS files, Libretro cores, official artwork, sprites, logos, or copyrighted game assets.

## Run the App in Development

Install dependencies:

```bash
pnpm install
```

Run the web dev server:

```bash
pnpm dev
```

Run the desktop app:

```bash
pnpm tauri dev
```

The desktop app requires the Rust toolchain because the Tauri backend is written in Rust.

## What You Need

To use the internal runtime, provide your own local files:

- A local mGBA Libretro core.
- A legal local GB, GBC, or GBA ROM.
- An optional save directory for battery-save files.

The app stores local paths so it can reuse them in later runs. It does not download, copy, or bundle those files.

## Associate a ROM with a Game

1. Open the Pokemon game library.
2. Choose the game you want to configure.
3. Use the ROM picker to select your local ROM file.
4. Confirm the card changes from ROM pending to ROM ready.

ROM associations are per game. A ROM selected for one game is not used as a global ROM for other games.

## Create a Run

1. Select a game from the library.
2. Make sure the game has a ROM associated.
3. Configure the starting lives.
4. Create the run.
5. If the run needs runtime setup, choose your local mGBA Libretro core and optional save directory.
6. Use `Guardar y jugar` once the required local paths are configured.

New library-created runs use the internal Libretro runtime by default. Legacy external mGBA mode remains available as a fallback for older runs and compatibility testing.

## Continue or Delete a Run

Open `Mis runs` from the home screen or the run creation screen to view locally saved runs.

- Use `Continuar` to make a saved run the current run and enter the play screen.
- Use `Eliminar` to remove a run from the local run library after confirmation.

Deleting a run from `Mis runs` does not delete ROMs, BIOS files, cores, or battery-save files. The app still keeps `current-run` compatibility for the active flow.

## SRAM Battery Saves

Nuzlocke Companion supports Libretro battery SRAM persistence.

- Save inside the Pokemon game first.
- Stop the internal runtime or close the app normally so autosave can run during teardown.
- The app writes battery-save data to an `.srm` file when the core exposes SRAM.

This is not a save state. It does not capture arbitrary emulator state and it does not replace saving inside the game.

## What the App Does Not Include

Nuzlocke Companion does not include:

- ROMs.
- BIOS files.
- Libretro cores.
- Official covers.
- Official sprites.
- Official logos.
- Official badge art.
- Any copyrighted game assets.

Users are responsible for providing legal local game files and local runtime files.
