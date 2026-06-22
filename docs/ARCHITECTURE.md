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

This manual path does not implement save states, `retro_serialize`, `retro_unserialize`, bundled ROM data, or bundled cores.

### SRAM Autosave

The internal runtime now attempts to persist Libretro Save RAM before destructive lifecycle operations:

- Preparing a new runtime configuration.
- Replacing the loaded core.
- Unloading content.
- Deinitializing the core.
- Stopping or resetting the internal runtime.

This autosave uses the same `retro_get_memory_data` / `retro_get_memory_size` battery-save path as manual SRAM saving. It is not a save state, does not use `retro_serialize`, and does not capture arbitrary progress unless the game has already written that progress into SRAM. Players still need to use the in-game Pokemon save flow.

If no Save RAM is exposed by the core/content, teardown continues normally. If Save RAM exists but the core returns an invalid pointer or the `.srm` file cannot be written, the destructive operation is blocked so the runtime is not discarded before the error is visible.

### Internal Save Flow UX

The internal Runtime tab surfaces Save RAM outside the Debug panel: SRAM availability, whether the `.srm` file exists, the resolved save path, the last save/load/autosave operation, and manual refresh/load/save actions. The UI copy states that this is battery SRAM persistence, not a save state, and that the player must save inside Pokemon before SRAM contains new progress.

Manual SRAM actions are disabled while the native session is active because the Rust runtime blocks save-memory access during active emulation. Stopping the internal session still runs the autosave teardown path and reports the resulting `.srm` location through `lastSaveOperation`.

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

### Internal Runtime Default and Local Pickers

New runs now default to `internal-libretro` with the mGBA Libretro target selected and empty local paths for the user-provided core and ROM. `legacy-external` remains available as a fallback and old runs that only contain deprecated `emulatorConfig` are still interpreted as legacy external runs.

The setup and runtime configuration UI includes local file/folder pickers for the Libretro core, GB/GBC/GBA ROM, and optional save directory. These pickers only record local paths chosen by the user; the app does not download, copy, bundle, or redistribute cores, ROMs, or BIOS files.

### Internal Runtime Main GameplayFrame Rendering

The internal Libretro debug path can now render into the main `GameplayFrame`:

- `InternalRuntimeFramePreview` still owns the debug controls, bounded loop, and explicit snapshot requests.
- When the preview successfully renders an `InternalFrameSnapshot`, it lifts that snapshot to `MainPlayScreen`.
- `MainPlayScreen` passes the latest internal snapshot to `GameplayFrame` only while the run uses `internal-libretro`.
- `GameplayFrame` prioritizes internal snapshots, then legacy live capture, then still captured frames, then the manual placeholder.

This keeps the legacy external emulator and capture behavior intact. The internal path still moves full RGBA buffers through explicit invokes and React state, so it is not the final streaming or optimized renderer.

### Debug Render Optimization

The debug renderer has a small frontend optimization pass:

- `GameplayFrame` draws from `Uint8ClampedArray` directly and no longer expands RGBA buffers through `Array.from`.
- `InternalRuntimeFramePreview` paints each snapshot immediately but stores only render metadata in its local React state.
- The debug loop reduces message churn while batches are running.

This keeps the same invoke-based RGBA snapshot flow. It does not add streaming, shared memory, WebGL, frame events, or backend changes.

### Debug Loop Teardown Guard

The internal debug preview reports whether its frontend render loop is active to `MainPlayScreen`. While that loop is running, the play screen disables destructive runtime actions such as changing runtime configuration, resetting the run, or leaving to create a new run.

This avoids calling internal teardown/autosave commands while the Rust host is actively executing a bounded frame batch. The guard is frontend coordination only; it does not change backend lifecycle rules, add Tauri commands, or make the debug loop the final gameplay runtime.

### Debug Audio Pipeline

The internal Libretro debug path now captures minimal audio for smoke testing:

- Libretro audio callbacks copy interleaved stereo PCM `i16` samples into a bounded Rust buffer.
- The frontend drains chunks explicitly through a Tauri command after manual frames or bounded debug batches.
- The React debug preview can opt into Web Audio playback after a user gesture.
- The buffer drops oldest samples when it reaches its cap so `retro_run` is not blocked by unbounded audio growth.

This is not the final audio system. It does not implement native streaming, audio/video synchronization, `internal_runtime_start`, pause/resume, or a native output device. Legacy external emulator mode is unchanged.

### Internal Runtime Play Layout and Scoped Gameplay Input

Internal Libretro mode now gives the main `GameplayFrame` the primary visual space and keeps the debug runtime panel below it as a compact scrollable control surface. This prevents setup, loop, audio, input, and SRAM controls from being hidden behind the game canvas.

The main gameplay frame is focusable only in internal runtime mode. Clicking it activates the same scoped keyboard Joypad input used by the debug panel, without registering global `window` or `document` keyboard listeners. Legacy external mode keeps its existing window/capture/overlay behavior unchanged.

### Internal Debug Panel Collapse and Audio Backlog Control

The internal debug panel can be collapsed into a compact gameplay bar. The collapsed bar keeps critical smoke-test controls available: loop start/stop, audio debug toggle, SRAM save, button clearing, and basic loop/audio status. When collapsed, the play screen gives more vertical space back to the main `GameplayFrame`.

Debug audio now drains larger bounded chunks and can drain multiple chunks per batch. If the Rust audio buffer is already far behind, the frontend clears the stale buffer instead of playing delayed samples. Web Audio scheduling is also capped to avoid building too much queued playback. This is still a debug audio path, not final synchronized emulator audio.

### Internal Playable Shell

Internal Libretro mode now uses a playable shell instead of a debug-panel-first layout. The main `GameplayFrame` stays fixed as the primary surface, while the right side panel exposes `Equipo`, `Run`, `Runtime`, and `Debug` tabs. Team and run controls move into the side panel in internal mode so the gameplay area keeps more vertical space. Legacy external mode keeps its existing layout.

The internal runtime controller remains mounted inside the side panel even when the user is not viewing the Debug tab. Non-debug tabs show only the compact experimental session bar, so the bounded frame loop, scoped keyboard input, SRAM actions, and audio debug controls are not tied to whether the full diagnostic panel is visible.

Frame snapshots now have a base64 command path in addition to the original RGBA array command. The frontend uses the base64 snapshot for internal gameplay rendering to avoid storing large `number[]` RGBA buffers in React state. This is still explicit invoke-based frame transport, not streaming, shared memory, WebGL, or the final renderer. Audio remains a debug Web Audio path.

### Internal Native-Paced Session and Binary Frame Transport

The internal Libretro runtime now has a native-paced session path. Rust owns the continuous `retro_run()` loop on a background thread, uses `retro_get_system_av_info` timing to pick the target FPS, and exposes real `start`, `pause`, `resume`, and `stop` commands. The frontend no longer needs to drive gameplay by repeatedly invoking bounded frame batches.

The main gameplay renderer uses a two-step frame IPC path: JSON metadata via `internal_runtime_get_latest_frame_info`, then raw RGBA bytes via `tauri::ipc::Response` from `internal_runtime_get_latest_frame_rgba_bytes`. React keeps only frame metadata in state and paints the bytes directly into the `GameplayFrame` canvas from a `requestAnimationFrame` controller.

The older base64 snapshot and bounded batch commands remain available for debug/fallback workflows. This is still not WebGL, shared memory, a custom protocol, or the final GPU renderer, but it avoids base64/JSON payloads for the main gameplay frame.

### Internal Runtime Auto Boot

When an `internal-libretro` run has both a local core path and ROM path configured, the mounted internal runtime controller attempts one automatic boot for that configuration: prepare, load core, initialize core, load content, refresh save memory, load SRAM if a matching file exists, and start the native session. Missing paths skip auto boot, and failures leave the manual setup controls available.

The auto boot is frontend lifecycle glue only. It does not download cores or ROMs, invent paths, create save states, or change legacy external mode. Teardown still uses the existing `stopInternalRuntime` path so SRAM autosave remains in place.

The main internal display controller is enabled as soon as an internal run has configured core and ROM paths. It can wait for the first frame before the parent screen has observed an active session status, using a throttled retry path so opening a run does not require pressing "Leer estado" to wake up rendering.

### Internal Runtime Setup UX

Internal Libretro configuration is presented as a guided setup rather than a technical path form. The panel walks the user through selecting a local mGBA Libretro core, a legal local GB/GBC/GBA ROM, and a recommended save directory, with per-step complete/pending state and a final "Listo para jugar" status when core and ROM are present.

The app still does not download, bundle, or link to cores, ROMs, or BIOS files. "Guardar y jugar" only closes the setup panel after the required paths are present; the existing auto boot flow starts the runtime from the saved run configuration. If an internal run is opened without core or ROM paths, the setup panel opens once to guide the user, while already configured runs go straight to play.

### Internal Debug Audio Drain

Audio remains a debug-only Web Audio path. Libretro audio callbacks copy PCM samples into a bounded Rust buffer while the native session runs, and the internal runtime controller drains that buffer on a frontend interval while audio debug is enabled. The drain interval is independent of the Debug tab and does not depend on the old bounded frame loop.

The UI exposes buffered, captured, drained, dropped, sample-rate, last-chunk, and frontend-error values so audio issues can be diagnosed from the runtime panel. The buffer is cleared when audio debug is enabled, disabled, or when backlog exceeds the debug threshold, but it is not cleared during normal drain ticks.

### Auto-Armed Debug Audio

Internal debug audio is auto-armed for configured internal runs, but playback is still started only after a user gesture on the scoped gameplay frame, such as click or key press. This follows Web Audio activation constraints while avoiding a separate trip into the debug panel for normal smoke testing.

The manual audio buttons remain available as fallback. The audio path is still debug-only, drains the Rust PCM buffer from the frontend, does not depend on the Debug tab being visible, and is not the final synchronized audio pipeline.

### Internal Frame Aspect-Ratio Fitting

Internal gameplay frames use the snapshot's native dimensions as the canvas backing store, for example GBA `240x160` with a `3:2` aspect ratio. `GameplayFrame` observes the available screen area with `ResizeObserver`, computes the largest visual size that fits without changing aspect ratio, and applies that CSS size to the internal canvas.

If the gameplay container does not match the native aspect ratio, the canvas remains centered with letterboxing or pillarboxing instead of being stretched. Legacy external live/captured frames keep their existing full-frame behavior.

### Console-Aware Internal Viewport

The internal `GameplayFrame` now separates the overall stage from the console viewport. For GBA, the viewport shell uses the native `240x160` frame shape and `3:2` aspect ratio; GB/GBC use `160x144` and `10:9`. The canvas keeps the emulator frame as its backing store and fills only the viewport shell, so the surrounding frame background reads as intentional letterboxing or pillarboxing rather than a second misaligned screen.

The console profile is chosen from the run platform when available, then from the reported frame dimensions, with GBA as the final fallback. DS is intentionally not implemented in this shell because it needs a dedicated dual-screen layout. Legacy external rendering does not use the internal viewport shell.

### Mode-Aware Runtime UI

The play screen now separates legacy external emulator controls from internal Libretro controls.

- `legacy-external` keeps the existing mGBA window, docking, overlay, capture, FPS, detection, and test-frame controls.
- `internal-libretro` hides those legacy-only controls and keeps runtime configuration, team editing, reset, and new-run actions visible.
- The guidance banner explains whether the run is using external mGBA or the internal Libretro debug path.
- `GameplayFrame` receives legacy capture frames only in legacy mode and internal snapshots only in internal mode, which prevents stale capture frames from appearing after a runtime switch.

This is a frontend UX cleanup only. It does not change the Rust host, add commands, implement audio, or make `internal_runtime_start` the final gameplay loop.

### Internal Playable UX Shell

The internal play screen treats the Runtime tab as the normal gameplay control surface. It shows session state, configured core/ROM, render status, audio state, SRAM state, and the primary actions for pause, resume, stop, audio, and manual SRAM refresh/load/save. User-facing copy avoids implementation terms such as snapshots or invokes in this main path.

The former Debug tab is labeled Avanzado and keeps manual setup, frame stepping, batch tests, detailed metadata, and diagnostic controls. The underlying controller remains mounted across tabs so auto boot, scoped keyboard input, auto-armed audio, status updates, and autosave coordination continue to work. This is a frontend organization change only; the Rust runtime and legacy external mode are unchanged.

### Internal Keyboard Controls UX

Internal keyboard input remains scoped to the gameplay frame and the internal runtime panel. There are no global keyboard listeners. The Runtime tab now shows the current mapping for D-pad, A/B, Start, Select, L/R, and X/Y, plus whether the gameplay frame currently has keyboard focus.

The UI exposes a "Soltar botones" action to clear retained Joypad state if focus is lost at an awkward moment. This prepares the UX surface for future rebinding or physical gamepad support, but those features are intentionally not implemented yet.

### Internal Runtime Close Protection

When the user closes the Tauri window while an internal Libretro session is active, the play screen intercepts the close request, stops the internal runtime, and lets the existing SRAM autosave teardown run before the window is destroyed. If autosave or teardown fails, the close is blocked and the error stays visible so progress is not silently discarded.

Repeated close attempts while shutdown is already running do not start another stop/autosave request. A React unmount cleanup also attempts a best-effort stop if the internal play screen disappears unexpectedly, but the close-request guard is the path that blocks user-initiated window closes. This still persists battery SRAM only; it is not a save state.

### Internal Libretro Runtime Milestone

The internal Libretro runtime is now the base playable flow for Nuzlocke Companion. Users configure a local Libretro core, a local ROM, and an optional save directory through the guided internal runtime setup. The app does not include, download, link to, or validate external sources for ROMs, BIOS files, or cores; users provide their own local files.

Configured internal runs auto boot into the native-paced Libretro session. The main `GameplayFrame` renders the internal gameplay canvas, while the Runtime tab exposes normal session, audio, controls, and SRAM actions. The Avanzado tab remains available for diagnostics, manual lifecycle checks, frame stepping, batch tests, and detailed metadata.

Audio is currently an auto-armed Web Audio debug path, not the final synchronized audio pipeline. Input is scoped to the gameplay frame and internal panel, with no global keyboard listeners. SRAM support persists Libretro battery save memory and is explicitly not a save state. Closing the app with an active internal session attempts to stop the runtime and autosave SRAM before closing. Legacy external mGBA mode remains available as a fallback.

### Pokemon Game Library Flow

The create-run flow now starts from a static local catalog of Pokemon GB/GBC/GBA games. Each catalog entry has app-owned metadata such as title, console, generation, region, release group, and visual accent. Cards use original UI styling, text, color, and initials only; the app does not include official box art, screenshots, ROMs, BIOS files, cores, or copyrighted game assets.

The local ROM library stores only `gameId -> romPath` associations in browser local storage. Selecting or changing a ROM opens the existing system file picker and saves the chosen local path; the app does not copy, scan, hash, download, or modify ROM files. The main library cards show ROM readiness and the selected file name, not the full local path. Games without an associated ROM stay visually disabled and ask the user to assign a ROM first.

Once a ROM is associated, the user configures a small Nuzlocke starter setup with lives and creates an internal Libretro run from the selected `gameId`, platform, game title, and associated ROM path. Core path and save directory remain runtime-local configuration; if core setup is still missing, the existing guided internal runtime setup asks for it when the play screen opens.

The library UI is the main product entry point for new runs. It presents console filters, visual ROM readiness states, and a small run setup panel before creating the internal run. Technical local paths stay out of the primary cards; the flow shows the associated file name, runtime readiness, and the next playable action instead.

### Internal Runtime Local Preferences

The app stores local internal runtime preferences separately from the Pokemon ROM library. These preferences include the selected Libretro core target, local core path, and optional save directory. They never include a global ROM path; ROMs remain associated per game through `gameId -> romPath`.

Preferences only prefill empty internal runtime configs. Existing run-specific `corePath`, `romPath`, and `saveDirectory` values are respected, and applying preferences never changes `romPath`. The setup panel saves preferences explicitly from "Guardar y jugar" and lets the user forget them without changing the current run.

The preference layer records local paths only. It does not copy, scan, download, or bundle cores, ROMs, BIOS files, or save files.

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
