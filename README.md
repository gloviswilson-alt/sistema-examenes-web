# sistema-examenes-web

Panel web y backend del sistema de exámenes de un profesor de matemática.

## Estado

- **Panel** (`public/`): conectados la contraseña, Inicio, Ajustes, Crear examen (banco real, selector de
  columnas y guardado), impresión de las hojas y la lista de Exámenes con "Imprimir de nuevo" (mismas
  formas; se elige a quién) y Notas por foto (lee las hojas en el celular, se confirman y se pasan
  al registro con `pasar`). El botón "Registro" abre en Google Sheets el registro del curso elegido.
- **Backend** (`netlify/functions/panel/`): función de Netlify que reemplaza al Apps Script.

## Archivos

- `public/index.html`: pantallas del panel (dentro de `<x-dc>`) y su lógica (script `text/x-dc` al final).
- `public/estilos.css`, `public/fuentes/`: fuentes y estilos base.
- `public/vendor/`: React y `dc-runtime.js`, el motor que dibuja las pantallas. No se editan a mano.
- `public/hoja.js`: geometría de la franja (QR + burbujas, en mm), generador de QR y armado de las hojas
  para imprimir. La misma geometría la usa el lector de fotos.
- `public/lector.js`: lector de fotos en el navegador (BarcodeDetector de Chrome para el QR; las
  burbujas se leen con esa geometría). La foto nunca sale del celular.
- `public/prueba.html`: prueba de conexión (solo lectura) del documento del sistema y los 4 registros.
- `netlify/functions/panel/`: `panel.mjs` (entrada y contraseña), `operaciones.mjs` (las 9 operaciones),
  `sheets.mjs` (Google Sheets), `almacen.mjs` (ajustes y bloqueos en Netlify Blobs),
  `hojas.mjs` (IDs del documento del sistema y de los 4 registros).
- `test/`: pruebas con hojas simuladas (`npm test`).
- `MAPA.md`: la idea completa del sistema pedagógico y el orden recomendado para construirla.

## Variables de entorno (Netlify → Project configuration → Environment variables)

| Variable | Qué es |
|---|---|
| `PANEL_CLAVE` | Contraseña del panel |
| `GOOGLE_SERVICE_ACCOUNT` | JSON completo de la clave de la cuenta de servicio |

Los IDs de las hojas están en `hojas.mjs` (la parte de la URL entre `/d/` y `/edit`).
Los registros apuntan primero a una **COPIA**; un curso sin ID no se toca. Mientras `registrosSonCopias` sea
`true`, el panel avisa que el botón "Registro" abre las copias; se pone en `false` al pasar a los reales.

## API

Un solo endpoint: `POST /.netlify/functions/panel` con cuerpo JSON
`{ "accion": "panel", "clave": "...", "operacion": "...", ...datos }`.
Respuesta: `{ "ok": true, ... }` o `{ "ok": false, "error": "..." }`.

| operacion | Datos | Devuelve |
|---|---|---|
| `estado` | — | `ultimo` y `examenes` (todos, el más nuevo primero, con preguntas, asignación y excluidos para reimprimir) y `registros` (enlace de cada registro configurado, directo a la pestaña `3er Trimestre`, para el botón "Registro") |
| `banco` | `nivel`, `tema?` | `temas`, `preguntas` (por `codigo`, con sus `formas`: enunciado sin signo, opciones y `clave`; se ocultan las familias con 4 formas iguales) |
| `guardar` | `fecha, nivel, paralelos[], tema, duracion?, columna_registro, preguntas[{codigo, puntaje, espacio}], excluidos[]?` | `id_examen` (`EX001`…), `asignacion` (carnet → forma) |
| `cambiar` | `id_examen`, `columna_registro?`, `excluidos[]?` | lo cambiado |
| `notas` | `nivel`, `paralelo` | `alumnos` del curso y `columnas` I–R: encabezado, cuántas notas, su promedio, `valores` (lo que muestra cada celda, por n.º de lista) y qué exámenes la usan (con fecha) |
| `pasar` | `id_examen`, `notas[{carnet, nota, leida?, origen?}]` (nota entera de 2 a 45; `origen` = `foto`, `corregida` o `a mano`) | `escritas`, `resultados` por alumno (`escrita`, `ocupada`, `rechazada`, `no escrita`) y `bitacora` (si se pudo anotar) |
| `ajuste` | `trimestre?`, `profesor?` (sin datos solo lee) | ajustes guardados |
| `anular` | `id_examen`, `conNotas?` | lo marca `anulado` en Examenes (la fila no se borra). Si ya tiene notas pasadas hace falta `conNotas: true` (el panel lo pide tras dos confirmaciones, tecleando el código); esas notas no se borran del registro |
| `corregir` | `id_examen`, `carnet`, `nota`, `motivo?` | `celda`, `anterior`, `nota`, `bitacora`: reemplaza la nota de ese alumno en el registro (única vía que escribe sobre una nota; nunca sobre una fórmula) y la anota en la Bitácora con la anterior y el motivo |

En el selector del panel, una columna está ocupada si tiene notas o si ya está asignada a otro
examen de ese paralelo (así dos exámenes pendientes no comparten columna).

Reglas de `guardar`: de 3 a 10 preguntas, puntajes que suman 45, `espacio` = `sin`, `pequeño`
o `grande`, y cada familia con sus 4 formas. Las formas se reparten en partes iguales y se
barajan dentro de la lista de cada paralelo.

Clave en el signo final del enunciado: A punto, B coma, C dos puntos, D sin signo. Al armar la hoja
(`hoja.js`, `letrasCorrectas`) la opción correcta se mueve a una letra elegida para que, en cada forma, las
respuestas correctas queden repartidas en partes iguales entre A, B, C y D (el banco de Segundo trae la correcta
siempre en la letra de su forma). La elección depende solo del examen y la forma: reimprimir sale idéntico.

En la hoja Examenes, `paralelos` y `excluidos` se guardan separados por comas;
`preguntas` y `asignacion`, como JSON.

Un examen anulado no aparece en `estado`, no ocupa columna en `notas` y `pasar` y `cambiar` lo rechazan.
Antes de guardar, el panel muestra un resumen para confirmar (después ya no se cambian las preguntas).

## Bitácora

Cada envío de `pasar` agrega una fila por alumno en la pestaña **Bitácora** del documento del sistema
(la crea la primera vez): fecha y hora, examen, curso, n.º de lista, carnet, nota enviada, nota que leyó la
foto, origen (`foto`, `corregida` o `a mano`), resultado en el registro, celda y motivo. Solo se agregan
filas, nunca se modifican: si después se cambia una nota en el registro, la original queda aquí.
La bitácora es solo un respaldo en Google Sheets; el panel no la muestra.

En **Exámenes**, al elegir un curso se ve una parte del registro (dimensión del saber): solo las columnas de
los exámenes hechos con el sistema, leídas del registro, con "No dio" para quien no tiene nota. La tabla se
desplaza por dentro con el promedio y cuántos dieron fijos abajo; al tocar un examen se abre su ventana con
"Imprimir de nuevo" y "Anular", y al tocar una nota se puede corregir (operación `corregir`).
Si la bitácora falla, las notas igual quedan en el registro y el panel lo avisa. Las fotos no se guardan
(nunca salen del celular).

## Reglas de `pasar`

Ubica al alumno por su carnet en la columna G de `Filiación` (fila `8 + N`) y escribe en
`3er Trimestre`, fila `11 + N`, en la columna del examen (I a R). Nunca escribe en una celda
con contenido (ni con fórmula), solo pone el nombre del examen si el encabezado (fila 2) está
vacío, y bloquea cada registro mientras escribe (Netlify Blobs).

## Hoja impresa

Tamaño carta, escala 100 %, sin márgenes (el pie queda a 6 mm del borde inferior). Al final del examen, abajo
a la derecha de la última plana, va el espacio para la firma del estudiante. La franja superior mide lo mismo que el QR (15,08 mm):
QR + 44 burbujas (notas 2 a 45) en posiciones fijas en mm, tomadas de la geometría medida en papel
(`G` y `RB` en `hoja.js`). El QR lleva `EX001-<carnet>-<n.º de lista><forma>` (versión 1, nivel M).

## Notas por foto

Cada foto (una hoja o varias en abanico) se lee en el celular: el QR ubica la hoja y se recorren los
44 aros. Se acepta la nota solo si hay una burbuja claramente marcada; ante cualquier duda la fila
queda en "Revisar" para escribir la nota a mano. Las hojas cuyo QR no coincide con el examen
(carnet o forma) no se pasan. "Ver lo que vio el lector" muestra la foto con lo detectado y la nota
leída (o "?") sobre cada QR. Los QR se buscan en la foto entera y en 9 recortes superpuestos, porque
el detector de Android no siempre ve todos los de un abanico grande.
Al imprimir a un alumno excluido, deja de estar excluido (si no, `pasar` rechazaría su nota).
