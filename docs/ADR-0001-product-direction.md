# ADR-0001: Product and technical direction

## Status

Accepted.

## Context

Nuzlocke Companion currently exists as a Tauri, React, TypeScript, and Rust desktop prototype for Pokemon Nuzlocke players. The app already has a strong player-facing run layout: gameplay viewport, team panel, lives, badges, route, capture status, level cap, local run state, and Spanish UI labels.

The current technical prototype is centered on an external mGBA process. On Windows, the app can launch or detect mGBA, dock its native window into the Tauri app, show an overlay window, and run experimental window capture paths through GDI and Windows Graphics Capture.

This proved useful for validating the Nuzlocke layout and manual run controls, but it also made the app depend on external emulator window behavior, Win32 window management, capture performance, and overlay coordination.

## Problem

The external emulator, capture, and overlay approach creates product and technical limits:

- The game is not truly rendered by Nuzlocke Companion.
- Window docking depends on platform-specific APIs and emulator window behavior.
- Capture introduces latency, frame pacing risk, and extra data movement between Rust, WebView, and React.
- Overlay mode is useful for experimentation but makes the app feel closer to a streaming helper than a focused play experience.
- Future features such as save management, run-aware state, per-game integration, and shareable runs need a clearer runtime model than `EmulatorConfig`.

## Decision

Nuzlocke Companion will move toward becoming a specialized Pokemon Nuzlocke emulation frontend. Conceptually, it should feel like a small RetroArch-style frontend focused only on Pokemon Nuzlocke runs, not a general-purpose emulator suite.

The app should host gameplay inside its own desktop experience and place Nuzlocke state next to the game: team, routes, captures, deaths, badges, rules, progress, and future individual or social run features.

The initial emulation scope is GB, GBC, and GBA.

The initial core target is mGBA through Libretro. This does not mean bundling ROMs, BIOS files, copyrighted assets, or emulator binaries. Users must provide legal local game files.

## What We Keep

The current project remains useful as a base:

- React app shell and player-facing gameplay layout.
- Tauri desktop shell.
- Local run state model and persistence.
- Team, lives, badges, route, capture status, and level cap UI.
- Game pack data for Pokemon titles, routes, badges, and level caps.
- Manual-first editing workflows.
- Existing Spanish UI direction.
- Rust command boundary as the future native integration layer.

## Legacy / Experimental

The following existing areas are retained for now but should be treated as legacy or experimental:

- External mGBA executable configuration.
- External ROM path stored inside `EmulatorConfig`.
- Window detection by process ID or mGBA title.
- Win32 docking of an external emulator window.
- Overlay window and global overlay hotkeys.
- GDI still-frame capture.
- Windows Graphics Capture live frame streaming.

These paths can remain temporarily as a fallback while the internal runtime direction is explored.

## Technical Risks

- Libretro integration complexity in a Tauri/Rust desktop app.
- Video frame transport from native Rust to a WebView without unacceptable latency or memory pressure.
- Audio output, synchronization, and frame pacing.
- Input mapping across keyboard, controller, and UI focus.
- Save file management and legal boundaries around user-provided ROMs.
- Cross-platform support beyond the current Windows-heavy prototype.
- Separating Pokemon-specific run tracking from emulator-core-agnostic runtime concerns.
- Avoiding scope creep into a full emulator distribution.

## Initial Non-Goals

At the time this ADR was accepted, it did not implement:

- Libretro core loading.
- Bundled mGBA or any other emulator core.
- ROM loading inside the app.
- BIOS management.
- Internal video rendering.
- Internal audio rendering.
- Input remapping.
- Save-state or save-file management.
- Save parsing.
- Multiplayer.
- Randomizer integration.
- DS or 3DS support.
- Twitch, OBS, or advanced streaming integrations.

The runtime model refactor and playable internal Libretro MVP were completed in later milestones. The project still does not bundle mGBA, ROMs, BIOS files, official assets, DS/3DS support, save states, multiplayer, randomizer integration, or advanced streaming integrations.
