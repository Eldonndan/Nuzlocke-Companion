# Architecture

Nuzlocke Companion is a Tauri desktop app with a React and TypeScript frontend and a Rust native layer. The current repository is a working prototype for a player-facing Nuzlocke layout plus external mGBA integration. The target architecture moves the project toward an internal emulation frontend specialized for Pokemon Nuzlocke runs.

## Current Architecture

### React UI

The frontend owns the visible play experience:

- Home and create-run screens.
- Main play screen.
- Gameplay frame.
- Team panel.
- Lives, badges, level cap, current route, and capture status controls.
- Quick edit workflows.
- Emulator configuration panel.
- Overlay screen.

The UI is Spanish-facing and stores run state locally for the MVP.

### Run Tracking and Data

Current run data is represented in `src/shared/types.ts` and initialized from game pack/sample data:

- `RunState`.
- `PokemonSlot`.
- `Badge`.
- `Route`.
- `CaptureStatus`.
- `EmulatorConfig`.
- Capture and docked-window metadata.

The useful product base is the run tracking model: team, lives, badges, route, level cap, capture status, game pack selection, and local persistence.

### External Emulator Bridge

The current `EmulatorConfig` model assumes an external mGBA executable and a local ROM path. The frontend calls Tauri commands through `src/utils/emulatorCommands.ts`.

Rust commands in `src-tauri/src/lib.rs` currently handle:

- Selecting an emulator executable.
- Selecting a ROM file.
- Launching mGBA as a child process.
- Detecting likely mGBA windows.
- Docking an external mGBA HWND into the gameplay area on Windows.
- Resizing, focusing, positioning, and undocking that external window.
- Showing and hiding the overlay.
- Experimental still-frame and live capture.

### Capture and Overlay

There are two secondary paths:

- Overlay mode: a transparent Tauri window at `index.html?overlay=1`, with click-through support and global hotkeys.
- Capture mode: GDI still capture and Windows Graphics Capture frame streaming into the WebView.

These paths are useful for learning and fallback behavior, but they are no longer the target product architecture.

## Target Architecture

The target product is a specialized Pokemon Nuzlocke emulation frontend. It should host gameplay inside the app and place Nuzlocke state next to it.

### React UI

React remains responsible for:

- Run creation and selection.
- Player-facing gameplay layout.
- Team, routes, deaths, badges, rules, progress, and status panels.
- Manual controls.
- Future social/share surfaces.
- Runtime status and configuration screens.

React should not own emulator timing, core execution, audio, or raw input timing.

### Tauri Desktop Shell

Tauri remains the desktop shell:

- Window management.
- Local filesystem access through controlled commands.
- Native dialogs.
- Event bridge between React and Rust.
- Packaging.

### Rust Native Emulation Host

The Rust layer should become the internal emulation host:

- Runtime lifecycle: create, load, run, pause, reset, stop.
- Core lifecycle: load core, unload core, report core capabilities.
- ROM lifecycle: load a legal local ROM selected by the user.
- Video frame production.
- Audio output.
- Input handling.
- Save and runtime data management.

This host should expose a stable command/event API to the frontend. It should be designed so legacy external mode and target internal mode can coexist temporarily.

### Libretro Core

The initial internal core target is mGBA via Libretro for GB, GBC, and GBA.

The app should not bundle ROMs, BIOS files, copyrighted assets, or emulator binaries unless a future packaging decision explicitly allows legally redistributable components. The first integration should assume user-provided local files.

### Run Tracking / Data Layer

Run tracking should be separated from runtime execution:

- Run state: player-facing Nuzlocke progress.
- Runtime state: emulator/core/ROM/session state.
- Game pack data: game identity, platform, routes, badges, level caps, and future Pokemon metadata.
- Persistence: local-first, per-run storage.

This separation is the next major refactor. `EmulatorConfig` should evolve into a general runtime configuration that can represent both legacy external mode and future internal Libretro mode.

### Runtime Model

The code now uses `RuntimeConfig` as the forward-compatible runtime configuration model.

Supported runtime modes:

- `legacy-external`: the current mode. It launches or detects an external mGBA process, can dock the mGBA window, can show the overlay, and can use experimental window capture.
- `internal-libretro`: the future mode. It will load a Libretro core inside Nuzlocke Companion and render gameplay in the app. This mode is represented in types only and is not implemented yet.

`RunState.runtimeConfig` is the preferred field for new and migrated runs. `RunState.emulatorConfig` remains temporarily as a deprecated compatibility field for old local saves and current legacy external UI components.

The migration path is gradual:

1. New runs store `runtimeConfig`.
2. Old runs with only `emulatorConfig` are interpreted as `legacy-external`.
3. Legacy external code remains available while the internal Libretro host is designed.
4. Future work can add the native emulation host without deleting the fallback mode first.

### Internal Emulation Host Skeleton

The native host skeleton now lives under `src-tauri/src/emulation/`.

Current modules:

- `types.rs`: serializable runtime phase, status, and prepare request types.
- `state.rs`: shared Tauri state for the internal runtime.
- `commands.rs`: Tauri command stubs for prepare, start, pause, resume, stop, reset, and status.
- `libretro_host.rs`: placeholder for future Libretro core loading and lifecycle.
- `video.rs`, `audio.rs`, `input.rs`, `saves.rs`: placeholders for future emulator subsystems.

This skeleton does not load Libretro, does not open cores, does not open ROMs, does not render video, and does not output audio. It only defines the command/state boundary needed for the next implementation step.

The next technical step is a dynamic loader spike for the mGBA Libretro core, kept behind this internal host boundary.

### Libretro Core Loading Spike

The internal host now includes a minimal dynamic loading spike for Libretro cores.

Current behavior:

- Receives a user-provided local core path from `internal_runtime_prepare`.
- Loads the dynamic library with `libloading`.
- Resolves the required minimal symbols: `retro_api_version`, `retro_get_system_info`, `retro_init`, and `retro_deinit`.
- Calls only `retro_api_version` and `retro_get_system_info`.
- Copies core metadata into `InternalRuntimeStatus.coreInfo`.
- Marks the internal runtime phase as `core-loaded` when metadata is read successfully.

This spike does not call `retro_init`, does not load ROMs, does not call `retro_load_game`, does not call `retro_run`, and does not implement video, audio, input, or saves.

The next step is to design the minimum callback surface and lifecycle needed before any ROM loading is attempted.

### Libretro Callbacks and Init Lifecycle

The internal host can now configure the minimum Libretro frontend callbacks and call the core lifecycle functions:

- `retro_set_environment`
- `retro_set_video_refresh`
- `retro_set_audio_sample`
- `retro_set_audio_sample_batch`
- `retro_set_input_poll`
- `retro_set_input_state`
- `retro_init`
- `retro_deinit`

The callbacks are intentionally no-op. They do not dereference frame/audio/input pointers, do not send frames to React, do not play audio, and do not read real input. The audio batch callback reports the received frame count as consumed so cores do not retry discarded audio while the real audio pipeline is still absent.

The host tracks initialization so `retro_init` is not called twice and `retro_deinit` is called only after a successful init. Dropping a loaded host also deinitializes once if needed.

This stage still does not load ROMs, call `retro_load_game`, call `retro_run`, render video, output audio, or map input.

### Libretro Environment Callback

The internal host now installs a minimal environment callback instead of returning `false` for every Libretro environment command.

Supported environment behavior:

- Stores requested pixel format from `RETRO_ENVIRONMENT_SET_PIXEL_FORMAT`.
- Responds to system, save, content, and core assets directory queries when paths are available from the prepared runtime config.
- Accepts legacy `RETRO_ENVIRONMENT_SET_VARIABLES` core options and returns default values through `RETRO_ENVIRONMENT_GET_VARIABLE`.
- Supports `RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE` with a simple one-shot update flag.
- Stores `RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME`.

The callback uses a single global environment state because Libretro callbacks do not include frontend user data. This is acceptable for the current one-core-at-a-time MVP direction and should be revisited if NC ever supports multiple simultaneous internal sessions.

The callback still does not load ROMs, execute frames, render video, play audio, or read real input.

### Libretro Content Loading

The internal host can now load and unload user-selected local content through Libretro:

- Resolves `retro_load_game` and `retro_unload_game` from the loaded core.
- Builds a C-compatible `retro_game_info` for the prepared ROM path.
- Respects `coreInfo.needFullpath`: full-path cores receive only the ROM path, while buffer-capable cores receive an in-memory ROM buffer.
- Validates that the ROM path is non-empty, exists, points to a file, and matches the core's declared extensions when available.
- Keeps the ROM path `CString` and optional ROM byte buffer alive while content is loaded.
- Moves runtime status to `rom-loaded` after `retro_load_game` succeeds.

This stage still does not call `retro_run`, execute frames, render video, output audio, map real input, create saves, or implement compressed content handling.

### Libretro Single-Frame Stepping

The internal host can now run one controlled Libretro frame through `internal_runtime_step_frame`.

Current behavior:

- Resolves `retro_run` from the loaded core.
- Requires the runtime to be prepared, core-loaded, core-initialized, and ROM-loaded first.
- Calls `retro_run` exactly once per command invocation.
- Captures the latest `video_refresh_callback` payload into Rust-owned memory immediately because Libretro frame pointers may be transient.
- Exposes only frame metadata in `InternalRuntimeStatus.latestFrame`: frame number, dimensions, pitch, byte length, pixel format, and duplicate-frame flag.
- Treats `data == NULL` from the video callback as a duplicate frame and does not copy pixel bytes for that frame.

This stage still does not start a gameplay loop, stream frames to React, render to canvas, output audio, read real input, create saves, or mark the runtime as `running`.

### Libretro Bounded Frame Loop

The internal host now includes a bounded frame-loop command for controlled runtime testing:

- `internal_runtime_run_frame_loop` executes up to a caller-provided `maxFrames` batch.
- `targetFps` applies simple per-frame pacing with `std::thread::sleep` when frame execution finishes early.
- `internal_runtime_cancel_frame_loop` can request cancellation; the active batch checks this flag between frames.
- The host lock is held during the bounded batch so lifecycle commands cannot unload or deinitialize the core while `retro_run` is executing.
- The runtime may be marked `running` during the batch, but returns to `rom-loaded` when the batch finishes or fails.
- The status exposes `frameLoop`, `latestFrame`, and `steppedFrames`; frame bytes remain private to Rust.

This is not the final gameplay loop. `internal_runtime_start`, `pause`, and `resume` still return not-implemented responses. There is still no UI rendering, React frame transport, real audio, real input, save management, or continuous emulator runtime.

### Internal Frame Snapshot and Debug Preview

The internal runtime can now expose the latest captured video frame through an explicit snapshot command:

- Rust keeps the native Libretro frame bytes private in `video.rs`.
- `internal_runtime_get_latest_frame_snapshot` converts the latest renderable frame to tightly packed RGBA.
- Conversion supports `xrgb8888`, `rgb565`, and `0rgb1555`, while respecting the source frame pitch.
- Duplicate Libretro frames can reuse the most recent renderable frame buffer.
- React includes a debug canvas preview that manually requests the latest snapshot and draws it with `putImageData`.

This is still a debug transport, not the final renderer. There is no automatic streaming, no Rust-to-React frame events, no final gameplay loop, no real audio, and no real input.

### Libretro Minimal Joypad Input

The internal runtime now has a minimal Joypad input path for debug testing:

- `input_poll_callback` and `input_state_callback` are connected to controlled internal state instead of no-op stubs.
- The state supports Libretro Joypad port 0 for A, B, Start, Select, D-pad, L, R, X, and Y.
- Tauri commands can press, release, or clear buttons without touching the core lifecycle.
- The debug frame preview includes manual Joypad controls so a button can be held while stepping one frame or running a bounded frame batch.

Input still assumes one active core at a time. There is no global keyboard capture, physical gamepad support, rebinding UI, or final gameplay input system yet.

### Libretro Save Memory

The internal runtime now supports manual Libretro save memory persistence:

- Uses `retro_get_memory_data` and `retro_get_memory_size` after the core is initialized and content is loaded.
- Supports manual SRAM (`save-ram`) persistence and reports RTC memory when the core exposes it.
- Writes `.srm` files to the prepared `saveDirectory`, or next to the user's ROM when no save directory is configured.
- Reads `.srm` files back into the core only when the file size matches the core-reported memory size.
- Exposes debug commands and UI buttons for refreshing save memory info, loading SRAM, and saving SRAM.

This does not implement save states, `retro_serialize`, `retro_unserialize`, autosave, bundled ROM data, or bundled cores.

### Internal Runtime Debug Lifecycle Controls

The internal debug preview now accepts the run's `InternalLibretroRuntimeConfig` and exposes manual lifecycle controls for smoke testing:

- Prepare runtime from the configured core, core path, ROM path, and optional save directory.
- Load and initialize the Libretro core.
- Load the configured ROM.
- Refresh save memory, load SRAM, save SRAM, step one frame, run a bounded 60-frame batch, render the latest snapshot, and send manual Joypad input.

This is a developer/debug flow, not the final player-facing emulator workflow. It does not implement `internal_runtime_start`, pause/resume, autoplay, autosave, audio output, keyboard capture, physical gamepad input, or automatic frame streaming.

### Scoped Keyboard Debug Input

The internal debug preview can now accept local keyboard input when its preview card has focus:

- Arrow keys map to the Libretro Joypad D-pad.
- Z/X map to A/B.
- Enter/Backspace map to Start/Select.
- A/S map to L/R.
- Q/W map to Y/X.

The implementation uses the existing Joypad Tauri commands and React `onKeyDown` / `onKeyUp` handlers on the focusable preview element. It does not install `window` or `document` listeners, does not capture keyboard globally, releases keyboard-held buttons on blur, and does not implement rebinding, Gamepad API support, or the final player input system.

### Debug Render Loop

The internal preview includes a frontend-only debug render loop:

- React repeatedly calls `internal_runtime_run_frame_loop` with small bounded batches.
- After each batch, React requests `internal_runtime_get_latest_frame_snapshot` and redraws the debug canvas.
- The active batch can be asked to stop through `internal_runtime_cancel_frame_loop`.
- Scoped keyboard input remains available while the loop is running because Joypad commands are separate from lifecycle commands.

This is intentionally not the final gameplay loop. It still moves full RGBA snapshots through explicit invokes, does not stream frame events, does not use efficient GPU transport, does not implement audio, and does not change `internal_runtime_start`, pause, or resume.

### Runtime Configuration UI

The emulator/runtime configuration panel now lets a run choose between `legacy-external` and `internal-libretro`.

Legacy external mode keeps the existing mGBA executable, ROM path, and launch arguments fields. Internal Libretro mode exposes the target core, local Libretro core path, local user ROM path, and optional save directory. The app does not download, bundle, or validate cores, ROMs, or BIOS files from this panel; Rust validates paths when the debug runtime commands are executed.

The selected configuration is stored in `RunState.runtimeConfig`. Deprecated `RunState.emulatorConfig` remains only for old local-save compatibility. The internal mode UI is still a debug flow and does not implement final start/pause/resume, audio, autosave, or packaged emulator assets.

### Internal Runtime Main GameplayFrame Rendering

The internal Libretro debug path can now render into the main `GameplayFrame`:

- `InternalRuntimeFramePreview` still owns the debug controls, bounded loop, and explicit snapshot requests.
- When the preview successfully renders an `InternalFrameSnapshot`, it lifts that snapshot to `MainPlayScreen`.
- `MainPlayScreen` passes the latest internal snapshot to `GameplayFrame` only while the run uses `internal-libretro`.
- `GameplayFrame` prioritizes internal snapshots, then legacy live capture, then still captured frames, then the manual placeholder.

This keeps the legacy external emulator and capture behavior intact. The internal path still moves full RGBA buffers through explicit invokes and React state, so it is not the final streaming or optimized renderer.

### Mode-Aware Runtime UI

The play screen now separates legacy external emulator controls from internal Libretro controls.

- `legacy-external` keeps the existing mGBA window, docking, overlay, capture, FPS, detection, and test-frame controls.
- `internal-libretro` hides those legacy-only controls and keeps runtime configuration, team editing, reset, and new-run actions visible.
- The guidance banner explains whether the run is using external mGBA or the internal Libretro debug path.
- `GameplayFrame` receives legacy capture frames only in legacy mode and internal snapshots only in internal mode, which prevents stale capture frames from appearing after a runtime switch.

This is a frontend UX cleanup only. It does not change the Rust host, add commands, implement audio, or make `internal_runtime_start` the final gameplay loop.

### Future Social / Share Layer

Social and sharing features are future-facing and should not shape the initial runtime implementation. The architecture should leave room for:

- Shareable run summaries.
- Exported progress cards.
- Optional social presence.
- Community run templates.

These should remain separate from emulator execution and local save management.

## Legacy External Emulator Mode

The current external emulator mode can remain temporarily as a fallback while internal emulation is explored.

Legacy external mode includes:

- mGBA executable path.
- ROM path passed to external mGBA.
- Window detection by PID/title.
- Windows HWND docking.
- Overlay window.
- Experimental GDI and Windows Graphics Capture.
- Global overlay hotkeys.

This mode should be labeled as legacy or experimental in documentation and future UI copy. It should not drive the long-term architecture.

## Target Internal Emulation Mode

The desired flow is:

1. User creates a run.
2. User selects a legal local ROM.
3. Nuzlocke Companion loads the appropriate core.
4. Nuzlocke Companion renders the game inside the app.
5. Nuzlocke Companion tracks run state next to the game.

This flow should make the app feel like a focused Pokemon Nuzlocke frontend rather than a capture layer around another emulator window.

## Module Direction

Recommended future module boundaries:

- `runtime`: shared TypeScript types for runtime modes and session state.
- `run`: Nuzlocke run state, persistence, and game pack data.
- `emulation_host`: Rust-side internal runtime host.
- `legacy_external_emulator`: Rust and TypeScript bridge for current external mGBA mode.
- `ui`: React screens and components.

These boundaries are conceptual for now. This documentation change does not implement them.

## Non-Goals for the Current Preparation Work

- No Libretro implementation.
- No new dependencies.
- No ROM loading inside the app.
- No behavior change.
- No large refactor.
- No deletion of the current external emulator, capture, or overlay code.
