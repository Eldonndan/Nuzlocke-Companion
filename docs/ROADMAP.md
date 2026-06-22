# Roadmap

Nuzlocke Companion is migrating from an external emulator overlay/capture prototype toward a specialized Pokemon Nuzlocke emulation frontend. This roadmap prepares that shift without promising functionality before it exists.

## Out of Initial Scope

The initial internal emulation direction is limited to GB, GBC, and GBA.

Explicitly out of scope for the initial direction:

- DS and 3DS support.
- Real multiplayer or netplay.
- Advanced Twitch, OBS, or streaming automation.
- Integrated randomizer.
- Bundled ROMs, BIOS files, copyrighted assets, emulator binaries, or illegal game distribution.

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

## Phase 2: Runtime Model Refactor

Objectives:

- Replace the narrow `EmulatorConfig` concept with a runtime model that can represent multiple play modes.
- Keep legacy external mGBA configuration supported.
- Prepare a future internal Libretro mode without implementing it.

Deliverables:

- Types for runtime mode, runtime source, legal local ROM reference, core target, and launch state.
- Migration path for existing locally persisted runs.
- Clear separation between run tracking state and runtime/emulation state.
- Documentation of legacy external mode compatibility.

## Phase 3: Native Emulation Host Skeleton

Objectives:

- Create the Rust-side boundary for a future internal emulator host.
- Define commands/events for lifecycle, video, input, and save management.
- Avoid loading real cores until the boundary is stable.

Deliverables:

- Rust module skeleton for an internal emulation host.
- Tauri command stubs with explicit not-implemented responses.
- Frontend service wrapper matching the future runtime API.
- No Libretro dependency added yet unless the spike requires it later.

Status:

- Started with `src-tauri/src/emulation/` module boundaries and stub lifecycle commands.

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

Status:

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
- Physical input, production audio pipelines, GPU/shared-memory rendering, and save states remain out of this spike.

## Phase 5: Video Pipeline

Objectives:

- Render emulator frames inside the app with stable pacing.
- Choose the least fragile bridge between Rust and the React/Tauri UI.
- Avoid using external window capture as the target path.

Deliverables:

- Internal frame transport design.
- Prototype renderer in the gameplay frame.
- Performance notes for GB/GBC/GBA.
- Fallback behavior when the internal renderer is unavailable.

## Phase 6: Input Pipeline

Objectives:

- Route keyboard and controller input to the internal emulator host.
- Keep UI controls responsive and avoid focus conflicts.
- Prepare for remapping without building a full settings system first.

Deliverables:

- Input event model.
- Default mappings for GB/GBC/GBA play.
- Focus rules between gameplay, edit panels, and app controls.
- Basic controller discovery plan.

## Phase 7: Save Management

Objectives:

- Manage save files and emulator runtime data safely.
- Keep user-owned game files separate from app-generated run files.
- Prepare for future save parsing without implementing it prematurely.

Deliverables:

- Save directory strategy.
- Per-run save metadata.
- Import/export rules for user save files.
- Clear policy for save states versus battery saves.

## Phase 8: Gameplay Integration

Objectives:

- Connect internal gameplay with Nuzlocke run tracking.
- Keep manual controls first.
- Prepare later automation without making the app dependent on save parsing.

Deliverables:

- Runtime-aware play screen.
- Run state displayed next to internal gameplay.
- Manual update flows for team, deaths, captures, routes, badges, rules, and progress.
- Data contracts for game packs and future richer Pokemon data.

## Phase 9: Alpha Release

Objectives:

- Ship a coherent early build focused on Pokemon Nuzlocke play.
- Keep scope narrow and honest.
- Preserve legacy external emulator mode only if it remains useful as fallback.

Deliverables:

- Internal GB/GBC/GBA play path if validated.
- Stable manual run tracking.
- Local-only persistence.
- Basic save management.
- Known limitations documented.
- Release notes explaining that users must provide legal local ROMs.
