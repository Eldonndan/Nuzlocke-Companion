mod emulation;

use emulation::commands::{
    internal_runtime_cancel_frame_loop, internal_runtime_clear_joypad_buttons,
    internal_runtime_deinit_core, internal_runtime_get_status,
    internal_runtime_get_latest_frame_snapshot, internal_runtime_init_core,
    internal_runtime_load_core, internal_runtime_load_game, internal_runtime_pause,
    internal_runtime_prepare, internal_runtime_reset, internal_runtime_resume,
    internal_runtime_run_frame_loop, internal_runtime_set_joypad_button, internal_runtime_start,
    internal_runtime_step_frame, internal_runtime_stop, internal_runtime_unload_game,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::process::Command;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EmulatorLaunchResult {
    process_id: Option<u32>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CaptureWindow {
    window_id: String,
    title: String,
    process_id: u32,
    width: i32,
    height: i32,
    x: i32,
    y: i32,
    is_visible: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CapturedFrame {
    image_data_url: String,
    width: u32,
    height: u32,
    captured_at: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LiveCaptureFrame {
    rgba_data: String,
    width: u32,
    height: u32,
    captured_at: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CaptureSessionStatus {
    is_active: bool,
    engine: String,
    window_id: Option<String>,
    requested_fps: Option<u32>,
    effective_fps: f64,
    frames_captured: u64,
    last_frame_at: Option<u64>,
    last_error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HostRect {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    coordinate_space: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DockedWindowInfo {
    window_id: String,
    previous_parent: Option<String>,
    previous_style: isize,
    previous_ex_style: isize,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    is_docked: bool,
}

const OVERLAY_LABEL: &str = "overlay";

#[cfg(target_os = "windows")]
#[derive(Default)]
struct CaptureSessionStore {
    session: Mutex<Option<wgc_capture_session::ActiveCaptureSession>>,
}

#[derive(Default)]
struct DockedWindowStore {
    windows: Mutex<HashMap<String, DockedWindowState>>,
}

#[derive(Clone)]
struct DockedWindowState {
    previous_parent: isize,
    previous_style: isize,
    previous_ex_style: isize,
    previous_x: i32,
    previous_y: i32,
    previous_width: i32,
    previous_height: i32,
}

#[cfg(not(target_os = "windows"))]
#[derive(Default)]
struct CaptureSessionStore;

#[tauri::command]
fn select_emulator_executable() -> Result<Option<String>, String> {
    let selected_path = rfd::FileDialog::new()
        .set_title("Seleccionar mGBA")
        .add_filter("Ejecutable", &["exe"])
        .pick_file();

    Ok(selected_path.map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
fn select_rom_file() -> Result<Option<String>, String> {
    let selected_path = rfd::FileDialog::new()
        .set_title("Seleccionar ROM")
        .add_filter("ROM GBA", &["gba"])
        .add_filter("Archivos", &["*"])
        .pick_file();

    Ok(selected_path.map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
fn launch_emulator(
    emulator_path: String,
    rom_path: String,
    launch_args: Option<Vec<String>>,
) -> Result<EmulatorLaunchResult, String> {
    let emulator_path = emulator_path.trim();
    let rom_path = rom_path.trim();

    if emulator_path.is_empty() {
        return Err("Configura la ruta del emulador antes de iniciar el juego.".into());
    }

    if rom_path.is_empty() {
        return Err("Configura la ruta de la ROM antes de iniciar el juego.".into());
    }

    if !Path::new(emulator_path).exists() {
        return Err("No se encontró el ejecutable del emulador seleccionado.".into());
    }

    if !Path::new(rom_path).exists() {
        return Err("No se encontró la ROM seleccionada.".into());
    }

    let mut command = Command::new(emulator_path);

    if let Some(args) = launch_args {
        command.args(args);
    }

    command.arg(rom_path);

    let child = command
        .spawn()
        .map_err(|error| format!("No se pudo iniciar mGBA: {error}"))?;

    Ok(EmulatorLaunchResult {
        process_id: Some(child.id()),
    })
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn detect_emulator_window(process_id: u32) -> Result<CaptureWindow, String> {
    windows_window_detection::detect_window_for_process(process_id)
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn detect_emulator_window(_process_id: u32) -> Result<CaptureWindow, String> {
    Err("La detección de ventana solo está disponible en Windows por ahora.".into())
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn find_mgba_windows() -> Result<Vec<CaptureWindow>, String> {
    windows_window_detection::find_mgba_windows()
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn find_mgba_windows() -> Result<Vec<CaptureWindow>, String> {
    Ok(Vec::new())
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn capture_window_frame(window_id: String) -> Result<CapturedFrame, String> {
    windows_window_capture::capture_window_frame(&window_id)
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn capture_window_frame(_window_id: String) -> Result<CapturedFrame, String> {
    Err("La captura de ventana solo está disponible en Windows por ahora.".into())
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn start_capture_session(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, CaptureSessionStore>,
    window_id: String,
    fps: u32,
) -> Result<CaptureSessionStatus, String> {
    wgc_capture_session::start_capture_session(app_handle, &state, window_id, fps)
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn start_capture_session(
    _app_handle: tauri::AppHandle,
    _state: tauri::State<'_, CaptureSessionStore>,
    _window_id: String,
    _fps: u32,
) -> Result<CaptureSessionStatus, String> {
    Err("La captura en tiempo real solo está disponible en Windows por ahora.".into())
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn stop_capture_session(
    state: tauri::State<'_, CaptureSessionStore>,
) -> Result<CaptureSessionStatus, String> {
    wgc_capture_session::stop_capture_session(&state)
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn stop_capture_session(
    _state: tauri::State<'_, CaptureSessionStore>,
) -> Result<CaptureSessionStatus, String> {
    Ok(CaptureSessionStatus {
        is_active: false,
        engine: "Windows Graphics Capture".into(),
        window_id: None,
        requested_fps: None,
        effective_fps: 0.0,
        frames_captured: 0,
        last_frame_at: None,
        last_error: Some("La captura en tiempo real solo está disponible en Windows por ahora.".into()),
    })
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn get_capture_status(
    state: tauri::State<'_, CaptureSessionStore>,
) -> Result<CaptureSessionStatus, String> {
    wgc_capture_session::get_capture_status(&state)
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn get_capture_status(
    _state: tauri::State<'_, CaptureSessionStore>,
) -> Result<CaptureSessionStatus, String> {
    Ok(CaptureSessionStatus {
        is_active: false,
        engine: "Windows Graphics Capture".into(),
        window_id: None,
        requested_fps: None,
        effective_fps: 0.0,
        frames_captured: 0,
        last_frame_at: None,
        last_error: Some("La captura en tiempo real solo está disponible en Windows por ahora.".into()),
    })
}

#[tauri::command]
fn show_overlay(app_handle: tauri::AppHandle) -> Result<(), String> {
    let overlay = get_or_create_overlay_window(&app_handle)?;
    overlay
        .set_always_on_top(true)
        .map_err(|error| format!("No se pudo fijar el overlay encima: {error}"))?;
    overlay
        .unminimize()
        .map_err(|error| format!("No se pudo restaurar el overlay: {error}"))?;
    overlay
        .show()
        .map_err(|error| format!("No se pudo mostrar el overlay: {error}"))?;
    overlay
        .set_focus()
        .map_err(|error| format!("No se pudo traer el overlay al frente: {error}"))?;
    Ok(())
}

#[tauri::command]
fn hide_overlay(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(overlay) = app_handle.get_webview_window(OVERLAY_LABEL) {
        overlay
            .hide()
            .map_err(|error| format!("No se pudo ocultar el overlay: {error}"))?;
    }

    Ok(())
}

#[tauri::command]
fn set_overlay_click_through(app_handle: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let overlay = get_or_create_overlay_window(&app_handle)?;
    overlay
        .set_ignore_cursor_events(enabled)
        .map_err(|error| format!("No se pudo cambiar el click-through del overlay: {error}"))?;
    Ok(())
}

#[tauri::command]
fn position_overlay_window(
    app_handle: tauri::AppHandle,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<(), String> {
    let overlay = get_or_create_overlay_window(&app_handle)?;
    overlay
        .set_position(tauri::PhysicalPosition::new(x, y))
        .map_err(|error| format!("No se pudo mover el overlay: {error}"))?;
    overlay
        .set_size(tauri::PhysicalSize::new(width.max(320) as u32, height.max(240) as u32))
        .map_err(|error| format!("No se pudo ajustar el tamaño del overlay: {error}"))?;
    Ok(())
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn position_emulator_window(
    window_id: String,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<(), String> {
    windows_overlay_window::position_emulator_window(&window_id, x, y, width, height)
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn position_emulator_window(
    _window_id: String,
    _x: i32,
    _y: i32,
    _width: i32,
    _height: i32,
) -> Result<(), String> {
    Err("El posicionamiento del emulador solo está disponible en Windows por ahora.".into())
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn focus_emulator_window(window_id: String) -> Result<(), String> {
    windows_overlay_window::focus_emulator_window(&window_id)
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn focus_emulator_window(_window_id: String) -> Result<(), String> {
    Err("El foco del emulador solo está disponible en Windows por ahora.".into())
}

#[tauri::command]
fn minimize_main_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    let main_window = get_main_window(&app_handle)?;
    main_window
        .minimize()
        .map_err(|error| format!("No se pudo minimizar la ventana principal: {error}"))
}

#[tauri::command]
fn show_main_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    let main_window = get_main_window(&app_handle)?;
    main_window
        .unminimize()
        .map_err(|error| format!("No se pudo restaurar la ventana principal: {error}"))?;
    main_window
        .show()
        .map_err(|error| format!("No se pudo mostrar la ventana principal: {error}"))
}

#[tauri::command]
fn focus_main_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    let main_window = get_main_window(&app_handle)?;
    main_window
        .unminimize()
        .map_err(|error| format!("No se pudo restaurar la ventana principal: {error}"))?;
    main_window
        .show()
        .map_err(|error| format!("No se pudo mostrar la ventana principal: {error}"))?;
    main_window
        .set_focus()
        .map_err(|error| format!("No se pudo enfocar la ventana principal: {error}"))
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn dock_emulator_window(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, DockedWindowStore>,
    window_id: String,
    host_rect: HostRect,
) -> Result<DockedWindowInfo, String> {
    windows_docked_window::dock_emulator_window(app_handle, &state, window_id, host_rect)
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn dock_emulator_window(
    _app_handle: tauri::AppHandle,
    _state: tauri::State<'_, DockedWindowStore>,
    _window_id: String,
    _host_rect: HostRect,
) -> Result<DockedWindowInfo, String> {
    Err("El modo acoplado solo está disponible en Windows por ahora.".into())
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn resize_docked_emulator(
    app_handle: tauri::AppHandle,
    window_id: String,
    host_rect: HostRect,
) -> Result<(), String> {
    windows_docked_window::resize_docked_emulator(app_handle, &window_id, host_rect)
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn resize_docked_emulator(
    _app_handle: tauri::AppHandle,
    _window_id: String,
    _host_rect: HostRect,
) -> Result<(), String> {
    Err("El modo acoplado solo está disponible en Windows por ahora.".into())
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn undock_emulator_window(
    state: tauri::State<'_, DockedWindowStore>,
    window_id: String,
) -> Result<(), String> {
    windows_docked_window::undock_emulator_window(&state, &window_id)
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn undock_emulator_window(
    _state: tauri::State<'_, DockedWindowStore>,
    _window_id: String,
) -> Result<(), String> {
    Ok(())
}

fn get_main_window(app_handle: &tauri::AppHandle) -> Result<tauri::WebviewWindow, String> {
    app_handle
        .get_webview_window("main")
        .ok_or_else(|| "No se encontró la ventana principal.".to_string())
}

fn get_or_create_overlay_window(
    app_handle: &tauri::AppHandle,
) -> Result<tauri::WebviewWindow, String> {
    if let Some(overlay) = app_handle.get_webview_window(OVERLAY_LABEL) {
        return Ok(overlay);
    }

    tauri::WebviewWindowBuilder::new(
        app_handle,
        OVERLAY_LABEL,
        tauri::WebviewUrl::App("index.html?overlay=1".into()),
    )
    .title("Nuzlocke Companion Overlay")
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .visible(false)
    .skip_taskbar(true)
    .inner_size(1280.0, 800.0)
    .build()
    .map_err(|error| format!("No se pudo crear el overlay: {error}"))
}

fn current_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

#[cfg(target_os = "windows")]
mod windows_window_detection {
    use super::CaptureWindow;
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM, RECT};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowLongPtrW, GetWindowRect, GetWindowTextLengthW,
        GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindowVisible, GWL_EXSTYLE,
        WS_EX_TOOLWINDOW,
    };

    struct DetectionContext {
        process_id: Option<u32>,
        title_filter: bool,
        windows: Vec<CaptureWindow>,
    }

    pub fn detect_window_for_process(process_id: u32) -> Result<CaptureWindow, String> {
        if process_id == 0 {
            return Err("No hay un proceso de mGBA válido para detectar.".into());
        }

        let mut context = DetectionContext {
            process_id: Some(process_id),
            title_filter: false,
            windows: Vec::new(),
        };

        unsafe {
            EnumWindows(
                Some(enum_windows_callback),
                &mut context as *mut DetectionContext as LPARAM,
            );
        }

        context
            .windows
            .into_iter()
            .max_by_key(window_score)
            .ok_or_else(|| "No se encontró una ventana visible para este proceso.".into())
    }

    pub fn find_mgba_windows() -> Result<Vec<CaptureWindow>, String> {
        let mut context = DetectionContext {
            process_id: None,
            title_filter: true,
            windows: Vec::new(),
        };

        unsafe {
            EnumWindows(
                Some(enum_windows_callback),
                &mut context as *mut DetectionContext as LPARAM,
            );
        }

        context.windows.sort_by_key(|window| -window_score(window));
        Ok(context.windows)
    }

    fn window_score(window: &CaptureWindow) -> i32 {
        let lower_title = window.title.to_lowercase();
        let title_score = if lower_title.contains("mgba") {
            3000
        } else if lower_title.contains("pokemon") || lower_title.contains("pok\u{e9}mon") {
            1800
        } else if window.title.trim().is_empty() {
            0
        } else {
            1000
        };
        let size_score = (window.width.max(0) * window.height.max(0)).min(500_000);
        title_score + size_score
    }

    unsafe extern "system" fn enum_windows_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let context = &mut *(lparam as *mut DetectionContext);

        let mut window_process_id = 0_u32;
        GetWindowThreadProcessId(hwnd, &mut window_process_id);

        if context
            .process_id
            .is_some_and(|process_id| window_process_id != process_id)
        {
            return 1;
        }

        if IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 {
            return 1;
        }

        let extended_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        if extended_style & WS_EX_TOOLWINDOW != 0 {
            return 1;
        }

        let mut rect = RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };

        if GetWindowRect(hwnd, &mut rect) == 0 {
            return 1;
        }

        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;

        if width < 160 || height < 120 {
            return 1;
        }

        let title = get_window_title(hwnd);
        if title.trim().is_empty() {
            return 1;
        }

        if context.title_filter && !is_likely_mgba_title(&title) {
            return 1;
        }

        context.windows.push(CaptureWindow {
            window_id: format!("0x{:X}", hwnd as usize),
            title,
            process_id: window_process_id,
            width,
            height,
            x: rect.left,
            y: rect.top,
            is_visible: true,
        });

        1
    }

    unsafe fn get_window_title(hwnd: HWND) -> String {
        let length = GetWindowTextLengthW(hwnd);

        if length <= 0 {
            return String::new();
        }

        let mut buffer = vec![0_u16; length as usize + 1];
        let copied = GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32);

        if copied <= 0 {
            return String::new();
        }

        String::from_utf16_lossy(&buffer[..copied as usize])
    }

    fn is_likely_mgba_title(title: &str) -> bool {
        let lower_title = title.to_lowercase();
        lower_title.contains("mgba")
            || lower_title.contains("pokemon")
            || lower_title.contains("pok\u{e9}mon")
    }
}

#[cfg(target_os = "windows")]
mod windows_window_capture {
    use super::{current_timestamp_ms, CapturedFrame};
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    use image::{DynamicImage, ImageBuffer, ImageFormat, Rgba};
    use std::ffi::c_void;
    use std::io::Cursor;
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::{HWND, RECT};
    use windows_sys::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetWindowDC,
        ReleaseDC,
        SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, RGBQUAD, SRCCOPY,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowRect, IsIconic, IsWindowVisible,
    };

    pub fn capture_window_frame(window_id: &str) -> Result<CapturedFrame, String> {
        let hwnd = parse_hwnd(window_id)?;

        unsafe {
            if IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 {
                return Err("La ventana detectada no está visible para capturar.".into());
            }

            let mut rect = RECT {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            };

            if GetWindowRect(hwnd, &mut rect) == 0 {
                return Err("No se pudo obtener el tamaño de la ventana.".into());
            }

            let width = rect.right - rect.left;
            let height = rect.bottom - rect.top;

            if width < 160 || height < 120 {
                return Err("La ventana no tiene un tamaño válido para capturar.".into());
            }

            let window_dc = GetWindowDC(hwnd);
            if window_dc.is_null() {
                return Err("No se pudo acceder al contenido de la ventana.".into());
            }

            let memory_dc = CreateCompatibleDC(window_dc);
            if memory_dc.is_null() {
                ReleaseDC(hwnd, window_dc);
                return Err("No se pudo preparar la captura de ventana.".into());
            }

            let mut bitmap_bits: *mut c_void = null_mut();
            let bitmap_info = create_bitmap_info(width, height);
            let bitmap = CreateDIBSection(
                memory_dc,
                &bitmap_info,
                DIB_RGB_COLORS,
                &mut bitmap_bits,
                null_mut(),
                0,
            );

            if bitmap.is_null() || bitmap_bits.is_null() {
                DeleteDC(memory_dc);
                ReleaseDC(hwnd, window_dc);
                return Err("No se pudo crear la imagen de captura.".into());
            }

            let previous_object = SelectObject(memory_dc, bitmap);
            let blit_ok = BitBlt(memory_dc, 0, 0, width, height, window_dc, 0, 0, SRCCOPY) != 0;

            let result = if blit_ok {
                encode_bitmap_to_png_data_url(bitmap_bits, width as u32, height as u32)
            } else {
                Err("No se pudo copiar el contenido de la ventana.".into())
            };

            if !previous_object.is_null() {
                SelectObject(memory_dc, previous_object);
            }
            DeleteObject(bitmap);
            DeleteDC(memory_dc);
            ReleaseDC(hwnd, window_dc);

            result
        }
    }

    fn parse_hwnd(window_id: &str) -> Result<HWND, String> {
        let trimmed = window_id.trim();
        let raw_id = trimmed.strip_prefix("0x").unwrap_or(trimmed);
        let hwnd_value = usize::from_str_radix(raw_id, 16)
            .map_err(|_| "El identificador de ventana no es válido.".to_string())?;

        if hwnd_value == 0 {
            return Err("El identificador de ventana no es válido.".into());
        }

        Ok(hwnd_value as HWND)
    }

    fn create_bitmap_info(width: i32, height: i32) -> BITMAPINFO {
        BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB,
                biSizeImage: (width * height * 4) as u32,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [RGBQUAD {
                rgbBlue: 0,
                rgbGreen: 0,
                rgbRed: 0,
                rgbReserved: 0,
            }],
        }
    }

    unsafe fn encode_bitmap_to_png_data_url(
        bitmap_bits: *mut c_void,
        width: u32,
        height: u32,
    ) -> Result<CapturedFrame, String> {
        let byte_count = (width * height * 4) as usize;
        let bgra = std::slice::from_raw_parts(bitmap_bits as *const u8, byte_count);
        let mut rgba = Vec::with_capacity(byte_count);

        for pixel in bgra.chunks_exact(4) {
            rgba.push(pixel[2]);
            rgba.push(pixel[1]);
            rgba.push(pixel[0]);
            rgba.push(255);
        }

        let image = ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(width, height, rgba)
            .ok_or_else(|| "No se pudo preparar la imagen capturada.".to_string())?;
        let mut png_bytes = Vec::new();
        DynamicImage::ImageRgba8(image)
            .write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
            .map_err(|error| format!("No se pudo codificar la captura: {error}"))?;

        Ok(CapturedFrame {
            image_data_url: format!("data:image/png;base64,{}", STANDARD.encode(png_bytes)),
            width,
            height,
            captured_at: current_timestamp_ms(),
        })
    }
}

#[cfg(target_os = "windows")]
mod windows_overlay_window {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, SetForegroundWindow, SetWindowPos, ShowWindow, SW_RESTORE,
        SWP_NOZORDER,
    };

    pub fn position_emulator_window(
        window_id: &str,
        x: i32,
        y: i32,
        width: i32,
        height: i32,
    ) -> Result<(), String> {
        let hwnd = parse_hwnd(window_id)?;

        unsafe {
            ShowWindow(hwnd, SW_RESTORE);
            let moved = SetWindowPos(
                hwnd,
                std::ptr::null_mut(),
                x,
                y,
                width.max(320),
                height.max(240),
                SWP_NOZORDER,
            ) != 0;

            if !moved {
                return Err("No se pudo posicionar la ventana de mGBA.".into());
            }
        }

        Ok(())
    }

    pub fn focus_emulator_window(window_id: &str) -> Result<(), String> {
        let hwnd = parse_hwnd(window_id)?;

        unsafe {
            ShowWindow(hwnd, SW_RESTORE);
            BringWindowToTop(hwnd);

            if SetForegroundWindow(hwnd) == 0 {
                return Err("No se pudo devolver el foco a mGBA.".into());
            }
        }

        Ok(())
    }

    fn parse_hwnd(window_id: &str) -> Result<HWND, String> {
        let trimmed = window_id.trim();
        let raw_id = trimmed.strip_prefix("0x").unwrap_or(trimmed);
        let hwnd_value = usize::from_str_radix(raw_id, 16)
            .map_err(|_| "El identificador de ventana no es válido.".to_string())?;

        if hwnd_value == 0 {
            return Err("El identificador de ventana no es válido.".into());
        }

        Ok(hwnd_value as HWND)
    }
}

#[cfg(target_os = "windows")]
mod windows_docked_window {
    use super::{
        get_main_window, DockedWindowInfo, DockedWindowState, DockedWindowStore, HostRect,
    };
    use windows_sys::Win32::Foundation::{HWND, RECT};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetParent, GetWindowLongPtrW, GetWindowRect, SetParent, SetWindowLongPtrW,
        SetWindowPos, ShowWindow, GWL_EXSTYLE, GWL_STYLE, SW_RESTORE, SWP_FRAMECHANGED,
        SWP_NOACTIVATE, SWP_NOZORDER, WS_CAPTION, WS_CHILD, WS_MAXIMIZEBOX, WS_MINIMIZEBOX,
        WS_POPUP, WS_SYSMENU, WS_THICKFRAME, WS_VISIBLE,
    };

    pub fn dock_emulator_window(
        app_handle: tauri::AppHandle,
        state: &tauri::State<'_, DockedWindowStore>,
        window_id: String,
        host_rect: HostRect,
    ) -> Result<DockedWindowInfo, String> {
        let hwnd = parse_hwnd(&window_id)?;
        let main_hwnd = get_main_hwnd(&app_handle)?;
        let mut rect = RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };

        unsafe {
            if GetWindowRect(hwnd, &mut rect) == 0 {
                return Err("No se pudo leer la posición actual de mGBA.".into());
            }
        }

        let previous_parent = unsafe { GetParent(hwnd) } as isize;
        let previous_style = unsafe { GetWindowLongPtrW(hwnd, GWL_STYLE) };
        let previous_ex_style = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) };
        let target = rect_for_parent_client(main_hwnd, &host_rect)?;

        unsafe {
            if SetParent(hwnd, main_hwnd).is_null() && previous_parent != 0 {
                return Err("No se pudo acoplar mGBA al cuadro de juego. Si mGBA está ejecutándose como administrador, abre Nuzlocke Companion también como administrador o ejecuta ambos sin permisos elevados.".into());
            }

            let next_style = (previous_style
                & !((WS_POPUP
                    | WS_CAPTION
                    | WS_THICKFRAME
                    | WS_SYSMENU
                    | WS_MINIMIZEBOX
                    | WS_MAXIMIZEBOX) as isize))
                | (WS_CHILD | WS_VISIBLE) as isize;
            if SetWindowLongPtrW(hwnd, GWL_STYLE, next_style) == 0 {
                return Err("No se pudo cambiar el estilo de la ventana de mGBA.".into());
            }

            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, previous_ex_style);

            ShowWindow(hwnd, SW_RESTORE);
            if SetWindowPos(
                hwnd,
                std::ptr::null_mut(),
                target.x,
                target.y,
                target.width,
                target.height,
                SWP_NOZORDER | SWP_FRAMECHANGED,
            ) == 0
            {
                return Err("No se pudo acoplar mGBA al cuadro de juego.".into());
            }
        }

        let docked_state = DockedWindowState {
            previous_parent,
            previous_style,
            previous_ex_style,
            previous_x: rect.left,
            previous_y: rect.top,
            previous_width: rect.right - rect.left,
            previous_height: rect.bottom - rect.top,
        };
        state
            .windows
            .lock()
            .map_err(|_| "No se pudo guardar el estado de acoplamiento.".to_string())?
            .insert(window_id.clone(), docked_state.clone());

        Ok(DockedWindowInfo {
            window_id,
            previous_parent: if docked_state.previous_parent == 0 {
                None
            } else {
                Some(format!("0x{:X}", docked_state.previous_parent as usize))
            },
            previous_style,
            previous_ex_style,
            x: target.x,
            y: target.y,
            width: target.width,
            height: target.height,
            is_docked: true,
        })
    }

    pub fn resize_docked_emulator(
        app_handle: tauri::AppHandle,
        window_id: &str,
        host_rect: HostRect,
    ) -> Result<(), String> {
        let hwnd = parse_hwnd(window_id)?;
        let main_hwnd = get_main_hwnd(&app_handle)?;
        let target = rect_for_parent_client(main_hwnd, &host_rect)?;

        unsafe {
            if SetWindowPos(
                hwnd,
                std::ptr::null_mut(),
                target.x,
                target.y,
                target.width,
                target.height,
                SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
            ) == 0
            {
                return Err("No se pudo reacomodar el juego.".into());
            }
        }

        Ok(())
    }

    pub fn undock_emulator_window(
        state: &tauri::State<'_, DockedWindowStore>,
        window_id: &str,
    ) -> Result<(), String> {
        let hwnd = parse_hwnd(window_id)?;
        let previous_state = state
            .windows
            .lock()
            .map_err(|_| "No se pudo leer el estado de acoplamiento.".to_string())?
            .remove(window_id);

        let Some(previous_state) = previous_state else {
            unsafe {
                SetParent(hwnd, std::ptr::null_mut());
                ShowWindow(hwnd, SW_RESTORE);
            }
            return Ok(());
        };

        unsafe {
            SetParent(hwnd, previous_state.previous_parent as HWND);
            SetWindowLongPtrW(hwnd, GWL_STYLE, previous_state.previous_style);
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, previous_state.previous_ex_style);
            ShowWindow(hwnd, SW_RESTORE);
            if SetWindowPos(
                hwnd,
                std::ptr::null_mut(),
                previous_state.previous_x,
                previous_state.previous_y,
                previous_state.previous_width.max(320),
                previous_state.previous_height.max(240),
                SWP_NOZORDER | SWP_FRAMECHANGED,
            ) == 0
            {
                return Err("No se pudo desacoplar el juego correctamente.".into());
            }
        }

        Ok(())
    }

    struct ClientRect {
        x: i32,
        y: i32,
        width: i32,
        height: i32,
    }

    fn rect_for_parent_client(parent_hwnd: HWND, host_rect: &HostRect) -> Result<ClientRect, String> {
        let width = host_rect.width.max(160);
        let height = host_rect.height.max(120);

        if host_rect.coordinate_space == "window-client" {
            return Ok(ClientRect {
                x: host_rect.x,
                y: host_rect.y,
                width,
                height,
            });
        }

        let mut parent_rect = RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };

        unsafe {
            if GetWindowRect(parent_hwnd, &mut parent_rect) == 0 {
                return Err("No se pudo calcular el área del cuadro de juego.".into());
            }
        }

        Ok(ClientRect {
            x: host_rect.x - parent_rect.left,
            y: host_rect.y - parent_rect.top,
            width,
            height,
        })
    }

    fn get_main_hwnd(app_handle: &tauri::AppHandle) -> Result<HWND, String> {
        let main_window = get_main_window(app_handle)?;
        main_window
            .hwnd()
            .map(|hwnd| hwnd.0 as isize as HWND)
            .map_err(|error| format!("No se pudo obtener la ventana principal: {error}"))
    }

    fn parse_hwnd(window_id: &str) -> Result<HWND, String> {
        let trimmed = window_id.trim();
        let raw_id = trimmed.strip_prefix("0x").unwrap_or(trimmed);
        let hwnd_value = usize::from_str_radix(raw_id, 16)
            .map_err(|_| "El identificador de ventana no es válido.".to_string())?;

        if hwnd_value == 0 {
            return Err("El identificador de ventana no es válido.".into());
        }

        Ok(hwnd_value as HWND)
    }
}

#[cfg(target_os = "windows")]
mod wgc_capture_session {
    use super::{
        current_timestamp_ms, CaptureSessionStatus, CaptureSessionStore, LiveCaptureFrame,
    };
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    use std::ffi::c_void;
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};
    use tauri::{AppHandle, Emitter};
    use windows_capture::capture::{CaptureControl, Context, GraphicsCaptureApiHandler};
    use windows_capture::frame::Frame;
    use windows_capture::graphics_capture_api::InternalCaptureControl;
    use windows_capture::settings::{
        ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings,
        MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings,
    };
    use windows_capture::window::Window;

    pub struct ActiveCaptureSession {
        control: Option<CaptureControl<RealtimeCapture, String>>,
        metrics: Arc<Mutex<CaptureSessionMetrics>>,
    }

    #[derive(Clone)]
    struct CaptureSessionFlags {
        app_handle: AppHandle,
        metrics: Arc<Mutex<CaptureSessionMetrics>>,
        window_id: String,
        requested_fps: u32,
        frame_interval: Duration,
    }

    struct RealtimeCapture {
        app_handle: AppHandle,
        metrics: Arc<Mutex<CaptureSessionMetrics>>,
        window_id: String,
        requested_fps: u32,
        frame_interval: Duration,
        last_emit: Option<Instant>,
        scratch_buffer: Vec<u8>,
    }

    #[derive(Clone)]
    struct CaptureSessionMetrics {
        is_active: bool,
        window_id: Option<String>,
        requested_fps: Option<u32>,
        frames_captured: u64,
        started_at: u64,
        last_frame_at: Option<u64>,
        last_error: Option<String>,
    }

    impl CaptureSessionMetrics {
        fn new(window_id: String, requested_fps: u32) -> Self {
            Self {
                is_active: true,
                window_id: Some(window_id),
                requested_fps: Some(requested_fps),
                frames_captured: 0,
                started_at: current_timestamp_ms(),
                last_frame_at: None,
                last_error: None,
            }
        }
    }

    impl GraphicsCaptureApiHandler for RealtimeCapture {
        type Flags = CaptureSessionFlags;
        type Error = String;

        fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
            Ok(Self {
                app_handle: ctx.flags.app_handle,
                metrics: ctx.flags.metrics,
                window_id: ctx.flags.window_id,
                requested_fps: ctx.flags.requested_fps,
                frame_interval: ctx.flags.frame_interval,
                last_emit: None,
                scratch_buffer: Vec::new(),
            })
        }

        fn on_frame_arrived(
            &mut self,
            frame: &mut Frame,
            _capture_control: InternalCaptureControl,
        ) -> Result<(), Self::Error> {
            let now = Instant::now();
            if let Some(last_emit) = self.last_emit {
                if now.duration_since(last_emit) < self.frame_interval {
                    return Ok(());
                }
            }
            self.last_emit = Some(now);

            let width = frame.width();
            let height = frame.height();
            let frame_buffer = frame
                .buffer()
                .map_err(|error| format!("Error de captura: {error}"))?;
            let pixels = frame_buffer.as_nopadding_buffer(&mut self.scratch_buffer);
            let captured_at = current_timestamp_ms();

            self.app_handle
                .emit(
                    "capture-frame",
                    LiveCaptureFrame {
                        rgba_data: STANDARD.encode(pixels),
                        width,
                        height,
                        captured_at,
                    },
                )
                .map_err(|error| format!("No se pudo enviar el frame capturado: {error}"))?;

            if let Ok(mut metrics) = self.metrics.lock() {
                metrics.is_active = true;
                metrics.window_id = Some(self.window_id.clone());
                metrics.requested_fps = Some(self.requested_fps);
                metrics.frames_captured += 1;
                metrics.last_frame_at = Some(captured_at);
                metrics.last_error = None;
            }

            Ok(())
        }

        fn on_closed(&mut self) -> Result<(), Self::Error> {
            if let Ok(mut metrics) = self.metrics.lock() {
                metrics.is_active = false;
                metrics.last_error = Some("La ventana de juego se cerró.".into());
            }
            Ok(())
        }
    }

    pub fn start_capture_session(
        app_handle: AppHandle,
        state: &tauri::State<'_, CaptureSessionStore>,
        window_id: String,
        fps: u32,
    ) -> Result<CaptureSessionStatus, String> {
        let fps = match fps {
            30 | 60 => fps,
            _ => 30,
        };

        stop_existing_session(state)?;

        let hwnd = parse_hwnd(&window_id)?;
        let window = Window::from_raw_hwnd(hwnd as *mut c_void);
        if !window.is_valid() {
            return Err("La ventana seleccionada no es válida para captura en tiempo real.".into());
        }

        let frame_interval = Duration::from_millis((1000 / fps) as u64);
        let metrics = Arc::new(Mutex::new(CaptureSessionMetrics::new(window_id.clone(), fps)));
        let flags = CaptureSessionFlags {
            app_handle,
            metrics: metrics.clone(),
            window_id,
            requested_fps: fps,
            frame_interval,
        };
        let settings = Settings::new(
            window,
            CursorCaptureSettings::WithoutCursor,
            DrawBorderSettings::WithoutBorder,
            SecondaryWindowSettings::Exclude,
            MinimumUpdateIntervalSettings::Custom(frame_interval),
            DirtyRegionSettings::Default,
            ColorFormat::Rgba8,
            flags,
        );

        let control = RealtimeCapture::start_free_threaded(settings)
            .map_err(|error| format!("No se pudo iniciar Windows Graphics Capture: {error}"))?;

        let mut session_guard = state
            .session
            .lock()
            .map_err(|_| "No se pudo acceder a la sesión de captura.".to_string())?;
        *session_guard = Some(ActiveCaptureSession {
            control: Some(control),
            metrics: metrics.clone(),
        });

        Ok(status_from_metrics(&metrics))
    }

    pub fn stop_capture_session(
        state: &tauri::State<'_, CaptureSessionStore>,
    ) -> Result<CaptureSessionStatus, String> {
        let mut session_guard = state
            .session
            .lock()
            .map_err(|_| "No se pudo acceder a la sesión de captura.".to_string())?;

        let Some(mut session) = session_guard.take() else {
            return Ok(inactive_status(None));
        };

        let stop_result = if let Some(control) = session.control.take() {
            control
                .stop()
                .map_err(|error| format!("No se pudo detener la captura: {error}"))
        } else {
            Ok(())
        };

        if let Ok(mut metrics) = session.metrics.lock() {
            metrics.is_active = false;
        }

        stop_result?;
        Ok(status_from_metrics(&session.metrics))
    }

    pub fn get_capture_status(
        state: &tauri::State<'_, CaptureSessionStore>,
    ) -> Result<CaptureSessionStatus, String> {
        let session_guard = state
            .session
            .lock()
            .map_err(|_| "No se pudo acceder a la sesión de captura.".to_string())?;

        Ok(session_guard
            .as_ref()
            .map(|session| status_from_metrics(&session.metrics))
            .unwrap_or_else(|| inactive_status(None)))
    }

    fn stop_existing_session(state: &tauri::State<'_, CaptureSessionStore>) -> Result<(), String> {
        let mut session_guard = state
            .session
            .lock()
            .map_err(|_| "No se pudo acceder a la sesión de captura.".to_string())?;

        if let Some(mut session) = session_guard.take() {
            if let Some(control) = session.control.take() {
                control
                    .stop()
                    .map_err(|error| format!("No se pudo detener la captura anterior: {error}"))?;
            }
        }

        Ok(())
    }

    fn parse_hwnd(window_id: &str) -> Result<usize, String> {
        let trimmed = window_id.trim();
        let raw_id = trimmed.strip_prefix("0x").unwrap_or(trimmed);
        let hwnd_value = usize::from_str_radix(raw_id, 16)
            .map_err(|_| "El identificador de ventana no es válido.".to_string())?;

        if hwnd_value == 0 {
            return Err("El identificador de ventana no es válido.".into());
        }

        Ok(hwnd_value)
    }

    fn inactive_status(last_error: Option<String>) -> CaptureSessionStatus {
        CaptureSessionStatus {
            is_active: false,
            engine: "Windows Graphics Capture".into(),
            window_id: None,
            requested_fps: None,
            effective_fps: 0.0,
            frames_captured: 0,
            last_frame_at: None,
            last_error,
        }
    }

    fn status_from_metrics(metrics: &Arc<Mutex<CaptureSessionMetrics>>) -> CaptureSessionStatus {
        let Ok(metrics) = metrics.lock() else {
            return inactive_status(Some("No se pudo leer el estado de captura.".into()));
        };

        let elapsed_ms = current_timestamp_ms().saturating_sub(metrics.started_at);
        let effective_fps = if elapsed_ms > 0 {
            (metrics.frames_captured as f64 * 1000.0) / elapsed_ms as f64
        } else {
            0.0
        };

        CaptureSessionStatus {
            is_active: metrics.is_active,
            engine: "Windows Graphics Capture".into(),
            window_id: metrics.window_id.clone(),
            requested_fps: metrics.requested_fps,
            effective_fps,
            frames_captured: metrics.frames_captured,
            last_frame_at: metrics.last_frame_at,
            last_error: metrics.last_error.clone(),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(CaptureSessionStore::default())
        .manage(DockedWindowStore::default())
        .manage(emulation::InternalEmulationState::default())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let _ = app.emit("overlay-hotkey", shortcut.to_string());
                    }
                })
                .build(),
        )
        .setup(|app| {
            let mut registered_shortcuts = Vec::new();
            let mut failed_shortcuts = Vec::new();

            for shortcut in ["F8", "F9", "F10", "F11", "F12"] {
                match app.global_shortcut().register(shortcut) {
                    Ok(()) => registered_shortcuts.push(shortcut),
                    Err(error) => failed_shortcuts.push(format!("{shortcut}: {error}")),
                }
            }

            if !failed_shortcuts.is_empty() {
                eprintln!(
                    "No se pudieron registrar algunos atajos globales: {}",
                    failed_shortcuts.join(", ")
                );
            }

            let _ = app.emit(
                "overlay-hotkeys-status",
                format!(
                    "Atajos activos: {}{}",
                    if registered_shortcuts.is_empty() {
                        "ninguno".to_string()
                    } else {
                        registered_shortcuts.join(", ")
                    },
                    if failed_shortcuts.is_empty() {
                        String::new()
                    } else {
                        format!(" · No disponibles: {}", failed_shortcuts.join(", "))
                    }
                ),
            );

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            select_emulator_executable,
            select_rom_file,
            launch_emulator,
            detect_emulator_window,
            find_mgba_windows,
            capture_window_frame,
            start_capture_session,
            stop_capture_session,
            get_capture_status,
            show_overlay,
            hide_overlay,
            set_overlay_click_through,
            position_overlay_window,
            position_emulator_window,
            focus_emulator_window,
            minimize_main_window,
            show_main_window,
            focus_main_window,
            dock_emulator_window,
            undock_emulator_window,
            resize_docked_emulator,
            internal_runtime_get_status,
            internal_runtime_get_latest_frame_snapshot,
            internal_runtime_prepare,
            internal_runtime_load_core,
            internal_runtime_init_core,
            internal_runtime_deinit_core,
            internal_runtime_load_game,
            internal_runtime_unload_game,
            internal_runtime_step_frame,
            internal_runtime_run_frame_loop,
            internal_runtime_cancel_frame_loop,
            internal_runtime_set_joypad_button,
            internal_runtime_clear_joypad_buttons,
            internal_runtime_start,
            internal_runtime_pause,
            internal_runtime_resume,
            internal_runtime_stop,
            internal_runtime_reset
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
