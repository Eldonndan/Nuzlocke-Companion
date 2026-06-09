# Architecture - Nuzlocke Companion

## Recommended stack

- Tauri
- React
- TypeScript
- pnpm
- Rust commands for native Windows integration

## Final product direction

Nuzlocke Companion is a launcher plus transparent interactive HUD overlay for Pokemon Nuzlocke runs.

The recommended play flow is overlay mode:

1. Launch mGBA with the user's configured ROM.
2. Detect the launched mGBA window.
3. Position and resize mGBA into a sensible gameplay area.
4. Show a transparent always-on-top overlay window.
5. Put the overlay in click-through mode during normal play.
6. Return focus to mGBA so keyboard/controller input goes directly to the emulator.
7. Use global hotkeys and a temporary edit mode for Nuzlocke controls.

Continuous capture inside React/WebView is experimental/debug only. It remains useful for testing capture APIs, but it is not the default product experience because it has frame transport and input-forwarding limits.

## Core modules

### App Shell

Handles:

- home screen
- create run flow
- main configuration/play screen
- emulator configuration
- recommended overlay launch flow
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

State is persisted locally for MVP. The main window owns state updates and emits the latest `RunState` to the overlay.

### Overlay Window

The overlay is a separate Tauri window opened at `index.html?overlay=1`.

It renders only player-facing HUD elements:

- Equipo
- Vidas
- Medallas
- Ruta actual
- Captura
- Limite de nivel

The overlay normally ignores cursor events, allowing clicks and input to reach mGBA. In edit mode it accepts input and shows a compact edit panel.

### Native Window Bridge

Rust commands provide Windows-focused window control:

- `show_overlay`
- `hide_overlay`
- `set_overlay_click_through`
- `position_overlay_window`
- `position_emulator_window`
- `focus_emulator_window`

Tauri's `set_ignore_cursor_events` is used for click-through. The design can add a Win32 `WS_EX_TRANSPARENT` fallback later if needed.

### Global Hotkeys

The official Tauri global shortcut plugin registers default shortcuts:

- `F8`: restar 1 vida
- `F9`: sumar 1 vida
- `F10`: ciclar captura
- `F11`: abrir edicion rapida de ruta
- `F12`: alternar modo edicion

Rust emits hotkey events to the main window. The main window updates state, persists it, and broadcasts the new `RunState` to the overlay.

### Experimental Capture

The capture pipeline remains available as secondary/debug functionality:

- GDI still-frame capture
- Windows Graphics Capture session
- canvas rendering in the main window

It is not the recommended gameplay path.

## Future plan

- Visual layout editor for overlay placement.
- Configurable hotkeys.
- Multi-emulator launch profiles.
- More robust Windows click-through fallback.
- Optional capture improvements for debugging or streaming-adjacent workflows.
- Save watcher/parser only after the manual overlay flow is stable.

## Out of scope

- ROM downloading or bundled ROMs.
- Bundled emulators or BIOS files.
- Save parsing for now.
- OBS, Twitch, YouTube integrations.
- Death log, box management, item tracker, notes, logs, or timeline.
