# Captura y overlay

Nuzlocke Companion usa mGBA como emulador recomendado para la primera ruta GBA. La app no incluye emuladores, ROMs, BIOS ni archivos de juego; el usuario configura sus propios archivos.

## Decision de producto

El modo recomendado ya no es renderizar el emulador dentro de React/WebView mediante captura continua.

La experiencia principal es ahora:

- lanzar mGBA;
- detectar su ventana;
- posicionar mGBA;
- mostrar un overlay transparente con el HUD de Nuzlocke;
- dejar mGBA enfocado para que teclado y control funcionen directo en el emulador.

## Por que captura es experimental

El prototipo de captura continua demostro dos limites importantes:

- 60 FPS configurados no necesariamente se sienten como 60 FPS reales por el coste de transporte/render;
- reenviar input desde una WebView hacia el emulador agrega complejidad y latencia.

Por eso la captura queda como modo experimental/debug, no como flujo principal.

## Captura disponible

Se conserva:

- `capture_window_frame(window_id)` con GDI para `Capturar frame de prueba`;
- sesion Windows Graphics Capture con `windows-capture`;
- render en canvas dentro de la ventana principal.

La UI debe nombrarlo como `Modo captura experimental`.

## Overlay recomendado

El overlay es una ventana Tauri transparente, always-on-top y sin decoracion. Muestra solo:

- Equipo
- Vidas
- Medallas
- Ruta actual
- Captura
- Limite de nivel

En modo normal, la app llama `set_overlay_click_through(true)`, que usa `set_ignore_cursor_events`. Asi el overlay no bloquea mouse ni teclado y mGBA mantiene el foco.

En modo edicion, la app llama `set_overlay_click_through(false)`, muestra controles compactos y permite editar valores manuales.

## Hotkeys globales

El plugin oficial `tauri-plugin-global-shortcut` registra:

- `F8`: restar 1 vida
- `F9`: sumar 1 vida
- `F10`: ciclar captura
- `F11`: abrir edicion rapida de ruta
- `F12`: alternar modo edicion

Los atajos funcionan aunque mGBA tenga el foco. Rust emite eventos a React, la ventana principal actualiza y persiste el `RunState`, y luego emite `run-state-updated` para refrescar el overlay.

## Limitaciones Windows

- El click-through usa la API de Tauri; si falla en algun entorno Windows, el siguiente paso es agregar fallback con `WS_EX_LAYERED` y `WS_EX_TRANSPARENT`.
- El layout automatico usa un rectangulo inicial razonable; el editor visual de layout queda para despues.
- El posicionamiento es Windows-focused por ahora.
- F8-F12 pueden entrar en conflicto con software externo o configuraciones del emulador.

## Siguientes pasos

1. Editor visual para mover HUD, panel de equipo y barra inferior.
2. Hotkeys configurables.
3. Perfiles por emulador y soporte para mas plataformas.
4. Fallback Win32 para click-through si `set_ignore_cursor_events` no cubre todos los casos.
5. Mantener captura experimental para pruebas, no como experiencia principal.
