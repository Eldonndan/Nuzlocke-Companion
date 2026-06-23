# QA manual: flujo de biblioteca Pokemon

Checklist para validar la rama `feat/game-library-flow` antes de PR.

Alcance: biblioteca Pokemon, asociacion local de ROM, creacion de runs por `gameId`, runtime interno Libretro, preferencias locales, visuales propios, medallas, overlay y compatibilidad con runs antiguas.

Regla de estado: no marcar una validacion como aprobada si no fue probada manualmente en la aplicacion.

## Resumen de resultados

| Area | Estado | Notas |
|---|---|---|
| Biblioteca | Pendiente | |
| ROM library | Pendiente | |
| Runtime interno | Pendiente | |
| Visuales | Pendiente | |
| Medallas | Pendiente | |
| Overlay | Pendiente | |
| Compatibilidad | Pendiente | |

## 1. Biblioteca

- [ ] La pantalla abre en modo biblioteca.
- [ ] Se ve hero de Nuzlocke Companion.
- [ ] Se ve el filtro `Todos`.
- [ ] Se ve el filtro `Game Boy`.
- [ ] Se ve el filtro `Game Boy Color`.
- [ ] Se ve el filtro `Game Boy Advance`.
- [ ] El conteo de `Todos` coincide con el total del catalogo.
- [ ] El conteo de `Game Boy` coincide con los juegos GB del catalogo.
- [ ] El conteo de `Game Boy Color` coincide con los juegos GBC del catalogo.
- [ ] El conteo de `Game Boy Advance` coincide con los juegos GBA del catalogo.
- [ ] Las tarjetas sin ROM asociada se ven pendientes.
- [ ] Las tarjetas con ROM asociada se ven listas.
- [ ] No se muestran rutas completas de archivos en la biblioteca.
- [ ] Cambiar filtros no pierde el estado visual de ROM asociada.
- [ ] Volver a `Todos` muestra nuevamente el catalogo completo.

## 2. Asociacion de ROM

- [ ] Asignar una ROM a un juego sin ROM cambia la tarjeta a estado listo.
- [ ] Cancelar el picker al asignar una ROM no cambia el estado previo.
- [ ] Cambiar la ROM en un juego ya configurado actualiza la asociacion.
- [ ] La UI muestra solo el nombre de archivo, no la ruta completa.
- [ ] La asociacion se mantiene despues de recargar la app.
- [ ] Cada juego mantiene su propia ROM.
- [ ] No existe una ROM global compartida entre juegos.
- [ ] Asociar una ROM a un juego no modifica la asociacion de otro `gameId`.
- [ ] Cancelar el picker al cambiar una ROM mantiene la ROM anterior.

## 3. Configuracion de run

Validar cada juego de forma independiente.

### Pokemon FireRed

- [ ] Asignar ROM.
- [ ] Configurar vidas.
- [ ] Crear run.
- [ ] Confirmar que la run guarda el `gameId` correcto.
- [ ] Confirmar que la plataforma es Game Boy Advance.
- [ ] Confirmar que las badges corresponden a Kanto.
- [ ] Confirmar level cap inicial basico.
- [ ] Confirmar que no usa badges genericos.

### Pokemon Emerald

- [ ] Asignar ROM.
- [ ] Configurar vidas.
- [ ] Crear run.
- [ ] Confirmar que la run guarda el `gameId` correcto.
- [ ] Confirmar que la plataforma es Game Boy Advance.
- [ ] Confirmar que las badges corresponden a Hoenn.
- [ ] Confirmar level cap inicial basico.
- [ ] Confirmar que no usa badges genericos.

### Pokemon Red

- [ ] Asignar ROM.
- [ ] Configurar vidas.
- [ ] Crear run.
- [ ] Confirmar que la run guarda el `gameId` correcto.
- [ ] Confirmar que la plataforma es Game Boy.
- [ ] Confirmar que las badges corresponden a Kanto.
- [ ] Confirmar level cap inicial basico.
- [ ] Confirmar que no usa badges genericos.

### Pokemon Crystal

- [ ] Asignar ROM.
- [ ] Configurar vidas.
- [ ] Crear run.
- [ ] Confirmar que la run guarda el `gameId` correcto.
- [ ] Confirmar que la plataforma es Game Boy Color.
- [ ] Confirmar que las badges corresponden a Johto.
- [ ] Confirmar level cap inicial basico.
- [ ] Confirmar que no usa badges genericos.

## 4. Runtime interno

- [ ] Si falta core, al entrar a una run interna aparece setup guiado.
- [ ] Si hay core guardado en preferencias, la run se crea con core listo.
- [ ] Auto boot inicia cuando existen core y ROM.
- [ ] El juego renderiza dentro del gameplay frame.
- [ ] El audio se arma despues de una interaccion del usuario.
- [ ] El teclado funciona dentro del gameplay frame.
- [ ] SRAM/autosave sigue funcionando.
- [ ] Cerrar la ventana con una sesion activa protege autosave.
- [ ] El runtime interno no requiere configuracion de emulador externo.
- [ ] Una run externa legacy no intenta arrancar el runtime interno por error.

## 5. Preferencias locales

- [ ] Guardar core mGBA desde `Guardar y jugar`.
- [ ] Crear una nueva run desde biblioteca reutiliza `corePath`.
- [ ] `saveDirectory` se reutiliza si existe.
- [ ] `romPath` no se guarda como preferencia global.
- [ ] `Olvidar preferencias` no borra la configuracion actual de la run abierta.
- [ ] Despues de olvidar preferencias, una nueva run vuelve a pedir core si no esta en la run.
- [ ] Preferencias corruptas de runtime no bloquean la apertura de la app.
- [ ] Preferencias corruptas de runtime vuelven a un estado recuperable.

## 6. Visuales originales

- [ ] Las caratulas son propias, no oficiales.
- [ ] No hay imagenes externas.
- [ ] No hay assets agregados de terceros.
- [ ] GB muestra icono de consola propio.
- [ ] GBC muestra icono de consola propio.
- [ ] GBA muestra icono de consola propio.
- [ ] Las tarjetas sin ROM siguen siendo legibles.
- [ ] Las tarjetas con ROM se ven activas.
- [ ] Los colores/accent se mantienen consistentes entre biblioteca y run.
- [ ] Los visuales no dependen de red.

## 7. Medallas

- [ ] Kanto usa iconos correspondientes.
- [ ] Johto usa iconos correspondientes.
- [ ] Hoenn usa iconos correspondientes.
- [ ] Toggle de medalla cambia el estado visual en la app.
- [ ] Runs antiguas sin `iconKey` muestran fallback numerico.
- [ ] No se rompe storage con badges antiguos.
- [ ] Las badges creadas desde biblioteca incluyen `iconKey`.
- [ ] Las badges genericas antiguas siguen siendo editables.

## 8. Overlay

- [ ] Overlay muestra medallas visuales.
- [ ] Overlay sigue mostrando fallback numerico si no hay `iconKey`.
- [ ] Toggle de medalla desde la app se refleja en overlay.
- [ ] Overlay no rompe edicion de vidas.
- [ ] Overlay no rompe edicion de captura.
- [ ] Overlay no rompe edicion de ruta.
- [ ] Overlay no rompe edicion de level cap.
- [ ] Overlay mantiene formato legible con badges bloqueadas y obtenidas.

## 9. Compatibilidad con runs antiguas

- [ ] Run antigua legacy externa abre sin migracion destructiva.
- [ ] Run antigua sin `gameId` abre con fallback estable.
- [ ] Run antigua sin `iconKey` en badges abre con fallback numerico.
- [ ] Run antigua con badges antiguas no rompe storage al guardar cambios.
- [ ] Run interna antigua sin core muestra setup guiado.
- [ ] Run interna antigua sin `saveDirectory` crea o solicita ruta valida segun flujo esperado.
- [ ] Runs antiguas no reciben una ROM global por accidente.
- [ ] Runs antiguas mantienen vidas, ruta, captura y level cap existentes.

## 10. Casos borde

- [ ] `localStorage` corrupto de ROM library no bloquea la app.
- [ ] `localStorage` corrupto de ROM library permite recuperar o reasignar ROMs.
- [ ] `localStorage` corrupto de runtime preferences no bloquea la app.
- [ ] `localStorage` corrupto de runtime preferences permite volver a configurar core.
- [ ] Run antigua legacy externa abre sin requerir core interno.
- [ ] Run interna sin core muestra setup guiado.
- [ ] Run interna sin `saveDirectory` no rompe autosave.
- [ ] Cancelar todos los pickers mantiene estado previo.
- [ ] Vidas 0 se muestran y persisten correctamente.
- [ ] Vidas personalizadas se muestran y persisten correctamente.
- [ ] Cambiar entre varios juegos configurados no mezcla ROMs.
- [ ] Recargar durante setup de runtime no deja la run en estado irrecuperable.

## Validaciones tecnicas

Ejecutar antes de cerrar QA documental:

```bash
pnpm typecheck
cd src-tauri
cargo check
cd ..
git diff --check
```

Resultados:

| Comando | Estado | Notas |
|---|---|---|
| `pnpm typecheck` | Aprobado | `tsc --noEmit` sin errores. |
| `cargo check` | Aprobado | `src-tauri` compila en perfil dev sin errores. |
| `git diff --check` | Aprobado | Sin problemas de whitespace. |
