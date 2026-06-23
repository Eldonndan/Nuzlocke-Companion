# Roadmap

Nuzlocke Companion is a local-first desktop MVP for Pokemon Nuzlocke runs. The project has moved past the initial external emulator overlay/capture prototype and now has an internal Libretro runtime plus a Pokemon GB/GBC/GBA game library.

## Out of Initial Scope

The initial internal emulation direction is limited to GB, GBC, and GBA.

Explicitly out of scope for the initial direction:

- DS and 3DS support.
- Real multiplayer or netplay.
- Advanced Twitch, OBS, or streaming automation.
- Integrated randomizer.
- Bundled ROMs, BIOS files, copyrighted assets, emulator binaries, or illegal game distribution.
- Save states.
- Physical gamepad support.

## Completed MVP Milestones

- Runtime model refactor with `legacy-external` and `internal-libretro` modes.
- Playable internal Libretro MVP targeting mGBA for GB/GBC/GBA.
- User-provided local core, ROM, and optional save directory setup.
- Native-paced internal session start, pause, resume, and stop.
- Internal gameplay rendering in the main gameplay frame.
- Scoped keyboard input for internal gameplay.
- SRAM battery-save load/save and autosave on runtime teardown.
- Runtime preferences for mGBA core path and save directory.
- Pokemon GB/GBC/GBA library flow.
- Per-game local ROM association.
- Game packs resolved by stable `gameId`.
- Original SVG/CSS visuals for game covers, console icons, and badge icons.
- Badge icon fallback for older runs without `iconKey`.
- QA checklist for the game library flow.
- Multi-run storage foundation that mirrors future saves into a versioned local run library while preserving `current-run`.
- Basic "Mis runs" screen for continuing and deleting locally saved runs.

## Phase 1: Documentation and Repo Preparation

Objectives:

- Record the product direction change.
- Mark the current external emulator, capture, docked window, and overlay work as legacy/experimental.
- Keep the current app behavior intact.
- Identify reusable pieces for the future runtime.

Deliverables:

- `docs/ADR-0001-product-direction.md`.
- Updated architecture documentation.
- Updated roadmap.
- README direction note.
- No runtime code changes.

Status: Completed milestone.

## Phase 2: Runtime Model Refactor

Objectives:

- Replace the narrow `EmulatorConfig` concept with a runtime model that can represent multiple play modes.
- Keep legacy external mGBA configuration supported.
- Prepare internal Libretro mode without deleting legacy external compatibility.

Deliverables:

- Types for runtime mode, runtime source, legal local ROM reference, core target, and launch state.
- Migration path for existing locally persisted runs.
- Clear separation between run tracking state and runtime/emulation state.
- Documentation of legacy external mode compatibility.

Status: Completed milestone.

## Phase 3: Native Emulation Host Skeleton

Objectives:

- Create the Rust-side boundary for the internal emulator host.
- Define commands/events for lifecycle, video, input, and save management.
- Avoid loading real cores until the boundary is stable.

Deliverables:

- Rust module skeleton for an internal emulation host.
- Tauri command stubs with explicit not-implemented responses.
- Frontend service wrapper matching the future runtime API.
- No Libretro dependency added yet unless the spike requires it later.

Status: Completed milestone.

- Started with `src-tauri/src/emulation/` module boundaries and stub lifecycle commands.
- Later runtime milestones implemented the playable internal Libretro path behind this boundary.

## Phase 4: Libretro Core Loading Spike

Objectives:

- Validate whether mGBA via Libretro can be loaded and driven from the Rust host.
- Keep the spike isolated from the main user flow.
- Prove the legal boundary: user supplies ROMs locally; the app does not ship game files.

Deliverables:

- Spike branch or isolated module for loading a Libretro core.
- Minimal lifecycle proof: load core, load local ROM, run frames, unload cleanly.
- Notes on platform constraints, dynamic library loading, and packaging implications.
- Decision on whether to keep Libretro as the core abstraction.

Status: Completed milestone.

- Started with dynamic core loading and static metadata inspection only.
- Added no-op frontend callbacks plus `retro_init` / `retro_deinit` lifecycle support.
- Added a minimal environment callback for pixel format, directories, variables, and no-game support.
- Added basic `retro_load_game` / `retro_unload_game` content loading that respects `need_fullpath`.
- Added explicit single-frame stepping with `retro_run` and internal frame metadata capture.
- Added a bounded, cancelable frame-loop command for controlled batches.
- Added explicit RGBA snapshot transport and a manual debug canvas preview.
- Added minimal Joypad input callbacks and debug controls for manual testing.
- Added manual SRAM save memory load/save commands and debug controls.
- Added manual internal runtime setup controls so prepare, core load, init, ROM load, SRAM actions, frame stepping, bounded batches, and snapshot rendering can be smoke-tested from the UI.
- Added scoped keyboard debug input on the internal preview card, using existing Joypad commands without global listeners, rebinding, or physical gamepad support.
- Added a frontend-only debug render loop that repeats small bounded batches and redraws RGBA snapshots until cancelled.
- Added runtime configuration UI for choosing legacy external mode or internal Libretro mode with local core, ROM, and save-directory paths.
- Added main `GameplayFrame` rendering for internal Libretro snapshots while keeping the debug preview as the control surface.
- Added mode-aware play-screen UI so internal Libretro hides legacy window/capture/overlay controls and avoids stale legacy frames.
- Added SRAM autosave before destructive internal runtime lifecycle operations; this persists battery save memory only and is not a save state.
- Reduced unnecessary frontend RGBA copies in the debug renderer while keeping the explicit invoke snapshot flow.
- Added a frontend teardown guard so destructive play-screen actions are blocked while the internal debug loop is running.
- Added a minimal debug audio path that captures Libretro PCM into a bounded Rust buffer and drains chunks to Web Audio from the debug preview.
- Improved internal runtime play layout so the main gameplay frame owns the visual area, the debug panel is scrollable, and scoped keyboard input works from the gameplay frame.
- Made internal Libretro the default runtime for new runs and added local pickers for the Libretro core, GB/GBC/GBA ROM, and save directory.
- Added a collapsible internal debug panel and frontend audio backlog controls for more comfortable real-play smoke tests.
- Added an internal playable shell with side-panel tabs, base64 frame snapshots, and frontend performance presets.
- Corrected internal frame aspect-ratio fitting so GB/GBC/GBA frames are centered without stretching.
- Added a console-aware internal viewport shell for GBA and GB/GBC so the emulator canvas sits inside one aligned console screen.
- Added a native-paced internal session loop in Rust with start/pause/resume/stop and binary RGBA frame transport for the main gameplay canvas.
- Decoupled debug audio draining from the old frame loop so Web Audio drains the Rust PCM buffer on its own interval during native sessions.
- Added frontend auto boot for configured internal Libretro runs so normal play no longer requires manual prepare/load/start steps.
- Enabled the main internal renderer from complete runtime config so auto-booted sessions render without requiring a manual status refresh.
- Auto-armed debug audio so a gameplay-frame click or key press can enable Web Audio without opening the debug panel first.
- Promoted SRAM refresh/load/save state into the Runtime tab with clear save-state warnings and autosave status.
- Polished the internal playable shell so Runtime is the primary game control tab and advanced diagnostics stay behind Avanzado.
- Surfaced the default scoped keyboard controls in Runtime with focus state and a retained-button clear action.
- Added close-request protection so active internal sessions stop and autosave SRAM before the app window closes.
- Improved internal runtime setup with guided core/ROM/save-directory steps and a Guardar y jugar flow.
- Closed as the first stable playable internal Libretro runtime milestone.
- Physical input, production audio pipelines, GPU/shared-memory rendering, and save states remain out of this milestone.

## Completed: Game Library / Pokemon Selection Flow

Objectives:

- Replace raw runtime setup as the first user decision with a Pokemon game selection flow.
- Keep ROM ownership explicit: users select local ROM files, and the app never copies, downloads, or bundles ROMs.
- Prepare game-specific defaults without relying on copyrighted cover art or official assets.

Deliverables:

- Static catalog of supported Pokemon GB/GBC/GBA games.
- Selection by console family.
- Game cards using original app styling instead of official/copyrighted box art.
- Per-game association with a user-selected local ROM path.
- Run creation from a selected game.
- Basic setup for lives and rules before entering the play screen.
- Clear copy explaining that ROMs, BIOS files, and cores are not bundled or downloaded.

Status: Completed milestone.

- Added a static Pokemon GB/GBC/GBA catalog.
- Added local `gameId -> romPath` storage for user-selected ROM paths.
- Added console filtering and original app-styled game cards.
- Added grey pending cards for games without ROMs and active cards when a ROM is associated.
- Hid full local ROM paths from the main library cards while preserving the stored association internally.
- Added ROM assignment/change flow through the system file picker.
- Added basic run setup with lives before creating the run.
- Created internal Libretro runs from selected game metadata and associated ROM path.
- Added local internal runtime preferences for `core`, `corePath`, and save directory reuse without storing a global ROM path.
- Polished the library entry flow with a stronger hero, runtime readiness card, console tabs with counts, clearer ROM status cards, and a guided run setup summary.
- Aligned the Pokemon catalog with basic run data by resolving game packs through stable `gameId` values and adding badge sets for every GB/GBC/GBA catalog game.
- Added original SVG/CSS visuals for console icons, game cover cards, and themed badge icons without official assets.
- Added QA documentation for manual validation.

## Completed: Basic Multi-Run Storage and My Runs

Objectives:

- Support more than one saved run cleanly.
- Let players select and continue previous runs from a dedicated screen.
- Keep local-first storage simple and recoverable.

Deliverables:

- Versioned multi-run persistence model.
- "Mis runs" screen.
- Run create/continue/delete flows.
- Migration path for the current single-run storage.

Status: Completed foundation.

- Added `nuzlocke-companion.run-library.v1` as the storage foundation for a collection of runs.
- Kept `nuzlocke-companion.current-run` as the compatibility path for the current app flow.
- `saveRun` mirrors future saves into the run library while still saving the current run.
- `loadSavedRun` still reads only `current-run`.
- `clearSavedRun` does not delete the run library.
- Added a basic "Mis runs" screen that lists saved runs, continues a selected run, and deletes runs with confirmation.
- "Mis runs" shows the most recently updated runs first and labels the active run.
- App navigation now keeps the selected run in memory before entering `MainPlayScreen`, while preserving `current-run` and `sampleRun` as compatibility/fallback paths.
- Added a soft bridge from valid `current-run` data into the run library so existing active runs can appear in "Mis runs".
- There is no destructive migration from `current-run` to the run library.

Remaining future work:

- Richer run management UI.
- Import/export.
- Thumbnails.
- Cloud sync.

## Future: MainPlayScreen Refactor

Objectives:

- Reduce the size and responsibility of `MainPlayScreen`.
- Keep runtime control, run tracking, and layout state separated.
- Preserve the current player-facing behavior while improving maintainability.

Deliverables:

- Smaller screen-level coordinator.
- Runtime controller boundary.
- Run tracking state hooks/utilities.
- Focused components for team, route, capture, badges, and level cap.

## Future: Advanced Nuzlocke Data

Objectives:

- Make game-specific tracking richer without depending on ROM parsing.
- Keep manual controls first.

Deliverables:

- Advanced level caps.
- Rule presets.
- Route tracker.
- Expanded game pack metadata.
- Optional richer Pokemon metadata.

## Future: Input and Runtime Polish

Objectives:

- Improve normal play comfort while keeping the current runtime scope clear.
- Avoid adding broad emulator features before the Nuzlocke app flow is stable.

Deliverables:

- Optional physical gamepad support.
- Input rebinding.
- Production audio pipeline.
- More efficient frame transport if needed.
- Save states only if the project explicitly decides to add them later; they remain outside current scope.

## Phase 9: Alpha Release

Objectives:

- Ship a coherent early build focused on Pokemon Nuzlocke play.
- Keep scope narrow and honest.
- Preserve legacy external emulator mode only if it remains useful as fallback.

Deliverables:

- Internal GB/GBC/GBA play path if validated.
- Pokemon GB/GBC/GBA library as the primary run creation flow.
- Stable manual run tracking.
- Local-only persistence.
- Basic save management.
- Known limitations documented.
- Release notes explaining that users must provide legal local ROMs.
