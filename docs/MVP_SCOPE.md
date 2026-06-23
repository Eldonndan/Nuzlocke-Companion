# MVP Scope

> Historical note: this scope describes the original manual companion MVP. The current accepted direction is documented in `docs/ADR-0001-product-direction.md`. Internal emulation is still not implemented, but the product direction is now a specialized Pokemon Nuzlocke emulation frontend. Current external emulator, capture, and overlay behavior remains legacy/experimental.

## Built in the Current Prototype

- Tauri + React + TypeScript app.
- Main play screen with polished layout.
- Gameplay frame.
- Team panel with 6 slots.
- Manual team editing.
- Life counter with heart + number.
- Badge panel with 8 toggleable badges.
- Level cap display and manual edit.
- Current route display and manual edit.
- Capture status toggle.
- Basic local persistence.
- External mGBA configuration.
- Legacy docked mode, overlay mode, and experimental capture mode.

## Still Not Built

- Internal Libretro runtime.
- Internal ROM loading.
- Internal video pipeline.
- Internal audio pipeline.
- Save management.
- Save parsing.
- Integrated randomizer.
- DS/3DS support.
- OBS integration.
- Twitch/YouTube features.
- Box management.
- Item tracker.
- Timeline.
