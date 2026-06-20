# Product Brief - Nuzlocke Companion

> Historical note: this brief describes the original companion/overlay MVP. The current accepted direction is documented in `docs/ADR-0001-product-direction.md`: Nuzlocke Companion is moving toward a specialized Pokemon Nuzlocke emulation frontend. The external emulator, capture, and overlay approach should be treated as legacy/experimental.

Nuzlocke Companion is a desktop app that lets players experience Pokemon Nuzlocke runs with a polished visual interface while playing.

The app is designed for the player, not primarily for viewers, streamers, or video editing. The goal is to make a personal Nuzlocke run feel like a professional interactive layout.

## Main idea

The app shows:

- the game area;
- the current team;
- lives;
- badges;
- current route;
- capture status;
- current level cap.

## What the original MVP was not

- It did not implement internal emulation.
- It did not include ROMs.
- It did not modify Pokemon games.
- It was not a full Nuzlocke database.
- It was not focused on deaths, box management, items, logs, or timeline events in the MVP.

## Current direction

The original manual companion work remains useful, but the long-term direction is now an internal emulation frontend focused on Pokemon Nuzlocke play. See `docs/ADR-0001-product-direction.md`, `docs/ARCHITECTURE.md`, and `docs/ROADMAP.md`.
