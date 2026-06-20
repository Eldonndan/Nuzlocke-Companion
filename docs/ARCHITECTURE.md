# Architecture - Nuzlocke Companion

## Recommended stack

- Tauri
- React
- TypeScript
- pnpm
- Rust commands for native Windows integration

## Final product direction

Nuzlocke Companion is a desktop Nuzlocke companion that launches mGBA and, on Windows, docks the real mGBA window inside the main gameplay viewport.

The recommended play flow is `Modo acoplado`:

1. Find an already open mGBA window or launch mGBA with the user's configured ROM.
2. Detect the mGBA top-level window.
3. Reparent the mGBA HWND into the gameplay frame of the main Tauri window.
4. Resize the child window to match the gameplay rectangle.
5. Keep mGBA as the real renderer and input target, so gameplay FPS and keyboard/controller input stay native.
6. Keep the React UI around the gameplay area for Equipo, Vidas, Medallas, Ruta actual, Captura and Limite de nivel.

Overlay mode remains available as a secondary path. Experimental capture remains available for debugging, but it is not the recommended product experience.

## Core modules

### App Shell

Handles:

- home screen
- create run flow
- main configuration/play screen
- emulator configuration
- recommended docked launch flow
- secondary overlay launch flow
- experimental capture controls

### Game State Core

Stores:

- selected game
- platform
- challenge type
- emulator configuration
- detected capture window metadata
- current team
- lives
- badges
- current route
- capture status
- level cap

State is persisted locally for MVP.

### Docked Emulator Bridge

Rust commands provide the Windows-first docked mode:

- `find_mgba_windows`
- `launch_emulator`
- `detect_emulator_window`
- `dock_emulator_window`
- `resize_docked_emulator`
- `undock_emulator_window`
- `focus_emulator_window`

The Win32 implementation uses HWND operations such as `SetParent`, `SetWindowLongPtrW`, `SetWindowPos`, `GetWindowRect` and `GetParent`. Docking changes the emulator from a top-level window into a child window of the main app, then restores the previous parent/style/position when the user desacopla the game or leaves the screen.

### Overlay Window

The overlay is a separate transparent Tauri window opened at `index.html?overlay=1`.

It renders the same player-facing HUD elements, usually for secondary/testing use:

- Equipo
- Vidas
- Medallas
- Ruta actual
- Captura
- Limite de nivel

In normal overlay play it ignores cursor events so mGBA can receive input. In edit mode it accepts input and shows compact controls.

### Experimental Capture

The capture pipeline remains available as secondary/debug functionality:

- GDI still-frame capture
- Windows Graphics Capture session
- canvas rendering in the main window

It is not the recommended gameplay path because frame transport through React/WebView can add latency and uneven frame pacing.

## Future plan

- Improve docked mode DPI handling and client-area cropping.
- Add support for more emulators and platforms.
- Add a visual layout editor for HUD placement.
- Add configurable hotkeys.
- Improve overlay click-through fallback where needed.
- Keep capture experimental for diagnostics or future rendering research.
- Save watcher/parser only after the manual emulator flow is stable.

## Out of scope

- ROM downloading or bundled ROMs.
- Bundled emulators or BIOS files.
- Save parsing for now.
- OBS, Twitch, YouTube integrations.
- Death log, box management, item tracker, notes, logs, or timeline.
