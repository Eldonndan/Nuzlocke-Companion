\# AGENTS.md



\## Project

This project is called Nuzlocke Companion.



Nuzlocke Companion is a desktop companion app for Pokémon Nuzlocke players. It is not an emulator, does not include ROMs, and does not modify game files. It provides a player-facing visual interface for playing Nuzlockes with a polished layout.



\## Core product vision

The app should feel like an interactive game layout for the player, not like a streamer dashboard or a heavy tracker.



Priority:

1\. Gameplay visibility

2\. Current team

3\. Nuzlocke status



\## MVP core features

\- Main gameplay area placeholder.

\- Right-side team panel with 6 Pokémon slots.

\- Each Pokémon slot shows sprite, nickname, and optionally species/level.

\- Life counter using one heart icon plus number, for example: ❤️ 4.

\- Badge panel with 8 badges, grey when locked and colored when obtained.

\- Current level cap.

\- Current route.

\- Capture status for the current route.

\- Manual controls first.

\- Save watcher and emulator bridge are future features.



\## Technical direction

\- Use Tauri + React + TypeScript.

\- Use pnpm.

\- Use local data only for MVP.

\- Do not implement emulator capture in the first version.

\- Do not include Pokémon ROMs, BIOS files, copyrighted game assets, or emulator binaries.

\- Use placeholder assets where needed.

\- Keep the architecture modular so game packs and layouts can be added later.



\## UX rules

\- The app must feel clean, visual, and easy to use while playing.

\- Avoid clutter.

\- The user-facing application UI must be in Spanish.

\- Code, file names, component names, types, and internal comments can remain in English.

\- All visible labels, buttons, headings, helper texts, empty states, and status messages shown to the player must be in Spanish.

\- Do not add death log, box management, item tracker, notes, or timeline in the MVP.

\- Important actions should be fast: lives, badge, route, capture status, team edit.

\- The UI should be configurable later, but the MVP can start with one polished layout.



\## Code quality

\- Keep components small.

\- Separate UI components from state logic.

\- Use TypeScript types for run state, Pokémon slot, badge, route, and layout config.

\- Prefer simple local state first, then persistence.

\- Add comments only where useful.

