# Legacy Capture, Overlay, and Docked Mode

This document describes the current external emulator prototype. It is retained as legacy/experimental documentation while Nuzlocke Companion moves toward an internal emulation frontend.

## Current Product Status

The previous recommended flow was `Modo acoplado`: launch or find mGBA, detect its window, and dock the real mGBA window inside the Nuzlocke Companion gameplay frame.

That path remains useful as a fallback and testing mode, but it is no longer the target product direction. The main product direction is internal emulation hosted by Nuzlocke Companion, initially focused on GB/GBC/GBA with a user-provided mGBA Libretro core.

## What Legacy Docked Mode Does

In docked mode, the app:

- Finds an already open mGBA window or launches mGBA with the user's configured ROM.
- Detects the mGBA top-level window.
- Reparents the mGBA HWND into the gameplay frame of the main Tauri window on Windows.
- Resizes the child window to match the gameplay rectangle.
- Keeps mGBA as the real renderer and input target.
- Keeps the React UI around the gameplay area for Equipo, Vidas, Medallas, Ruta actual, Captura, and Limite de nivel.

## Why Capture Is Experimental

The capture prototype showed important limits:

- 60 FPS configured is not always perceived as stable 60 FPS because frame data crosses Rust, WebView, and React.
- PNG/base64 or raw-buffer transport adds work per frame.
- Forwarding input from React back to the emulator adds complexity and latency.
- Capture makes the app feel like a wrapper around another emulator instead of a focused play frontend.

For those reasons, capture should remain experimental/debug functionality.

## Capture Still Available

The current code keeps:

- `capture_window_frame(window_id)` with GDI for still-frame tests.
- Windows Graphics Capture live sessions through `windows-capture`.
- Canvas rendering in the main window.

The UI should continue to present this as `Modo captura experimental`.

## Overlay Mode

Overlay mode remains available for testing and fallback use. It creates a transparent, always-on-top Tauri window at `index.html?overlay=1`.

In normal use it can ignore cursor events so mGBA receives input. In edit mode it accepts clicks and exposes compact run controls.

## Windows Limitations

- Docked mode depends on Win32 APIs and currently does not apply to macOS/Linux.
- If mGBA runs as administrator and Nuzlocke Companion does not, Windows can block window reparenting.
- DPI and display scaling can require additional handling.
- Some emulators can resist reparenting or redraw incorrectly after style changes.

## Legacy Scope

Keep this mode while it is useful, but avoid expanding it unless needed to preserve the existing prototype. New architecture should prioritize the internal emulation runtime described in `docs/ADR-0001-product-direction.md` and `docs/ARCHITECTURE.md`.
