# Captura, overlay y modo acoplado

Nuzlocke Companion usa mGBA como emulador recomendado para la primera ruta GBA. La app no incluye emuladores, ROMs, BIOS ni archivos de juego; el usuario configura sus propios archivos.

## Decision de producto

El modo recomendado es `Modo acoplado`.

En este modo, la app no intenta convertir mGBA en frames de imagen dentro de React. En vez de eso:

- busca o lanza mGBA;
- detecta su ventana real;
- acopla el HWND de mGBA dentro del cuadro de juego de Nuzlocke Companion;
- mantiene mGBA como renderer nativo y como destino real de input.

Esto evita la perdida de rendimiento y latencia que aparece cuando cada frame debe cruzar Rust, WebView y React.

## Por que captura es experimental

El prototipo de captura continua demostro limites importantes:

- 60 FPS configurados no necesariamente se sienten como 60 FPS reales por el coste de transporte y render;
- enviar frames como PNG/base64 o buffers hacia la WebView agrega trabajo por frame;
- reenviar input desde React hacia el emulador agrega complejidad y latencia.

Por eso la captura queda como modo experimental/debug, no como flujo principal.

## Captura disponible

Se conserva:

- `capture_window_frame(window_id)` con GDI para `Capturar frame de prueba`;
- sesion Windows Graphics Capture con `windows-capture`;
- render en canvas dentro de la ventana principal.

La UI debe nombrarlo como `Modo captura experimental`.

## Modo acoplado

El modo acoplado es Windows-first y mGBA-first.

Rust usa APIs Win32 para reparentar la ventana:

- `SetParent` para convertir mGBA en ventana hija de la ventana principal;
- `GetWindowLongPtrW` y `SetWindowLongPtrW` para cambiar estilos de ventana;
- `SetWindowPos` para ajustar posicion y tamano;
- `GetWindowRect` y `GetParent` para guardar estado anterior y calcular coordenadas relativas al padre.

Al desacoplar, la app restaura padre, estilos y posicion anterior. El frontend tambien intenta desacoplar cuando el usuario cambia la configuracion del emulador, restablece la run o sale hacia `Nueva run`.

## Overlay secundario

El overlay sigue disponible para pruebas y como alternativa. Es una ventana Tauri transparente, always-on-top y sin decoracion. En modo normal usa click-through para dejar que mGBA reciba input; en modo edicion acepta clicks y permite ajustes rapidos.

## Limitaciones Windows

- El modo acoplado depende de APIs Win32 y por ahora no aplica a macOS/Linux.
- Si mGBA corre como administrador y Nuzlocke Companion no, Windows puede bloquear `SetParent`. Ejecuta ambos con el mismo nivel de permisos.
- DPI y escalado de pantalla pueden requerir ajustes finos en algunos monitores.
- Algunos emuladores pueden resistir el reparenting o redibujar mal al cambiar estilos.
- El siguiente refinamiento es acoplar solo el area cliente real de mGBA para evitar barras/menu si aparecen.

## Siguientes pasos

1. Mejorar calculo DPI y area cliente.
2. Agregar medicion visual de estabilidad del modo acoplado.
3. Soportar mas emuladores con adaptadores por plataforma.
4. Mantener captura experimental para diagnostico, no como experiencia principal.
