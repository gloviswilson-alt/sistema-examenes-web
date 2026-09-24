# sistema-examenes-web

Panel web y backend del sistema de exámenes de un profesor de matemática.

## Estado

- **Panel** (`public/`): prototipo visual; los datos son de ejemplo y todavía no llama al backend.
- **Backend** (`netlify/functions/panel/`): función de Netlify que reemplaza al Apps Script.

## Archivos

- `public/index.html`: pantallas del panel (dentro de `<x-dc>`) y su lógica (script `text/x-dc` al final).
- `public/estilos.css`, `public/fuentes/`: fuentes y estilos base.
- `public/vendor/`: React y `dc-runtime.js`, el motor que dibuja las pantallas. No se editan a mano.
- `netlify/functions/panel/`: `panel.mjs` (entrada y contraseña), `operaciones.mjs` (las 7 operaciones),
  `sheets.mjs` (Google Sheets), `almacen.mjs` (ajustes y bloqueos en Netlify Blobs).
- `test/`: pruebas con hojas simuladas (`npm test`).

## Variables de entorno (Netlify → Project configuration → Environment variables)

| Variable | Qué es |
|---|---|
| `PANEL_CLAVE` | Contraseña del panel |
| `GOOGLE_SERVICE_ACCOUNT` | JSON completo de la clave de la cuenta de servicio |
| `SISTEMA_SHEET_ID` | ID del documento del sistema (Banco, Alumnos, Examenes) |
| `REGISTRO_6A`, `REGISTRO_6B`, `REGISTRO_2A`, `REGISTRO_2B` | ID del registro de cada curso. **Poner primero el ID de una COPIA.** |

El ID es la parte de la URL entre `/d/` y `/edit`. Si falta un `REGISTRO_*`, ese curso no se toca.

## API

Un solo endpoint: `POST /.netlify/functions/panel` con cuerpo JSON
`{ "accion": "panel", "clave": "...", "operacion": "...", ...datos }`.
Respuesta: `{ "ok": true, ... }` o `{ "ok": false, "error": "..." }`.

| operacion | Datos | Devuelve |
|---|---|---|
| `estado` | — | `ultimo` (último examen, con `notas_pasadas`) |
| `banco` | `nivel`, `tema?` | `temas`, `preguntas` (agrupadas por `codigo`, con sus `formas`) |
| `guardar` | `fecha, nivel, paralelos[], tema, duracion, columna_registro, preguntas[{codigo, puntaje}], excluidos[]?` | `id_examen`, `asignacion` (carnet → forma, al azar) |
| `cambiar` | `id_examen`, `columna_registro?`, `excluidos[]?` | lo cambiado |
| `notas` | `nivel`, `paralelo` | `columnas` I–R: encabezado, cuántas notas tiene y qué exámenes la usan |
| `pasar` | `id_examen`, `notas[{carnet, nota}]` | `escritas` y `resultados` por alumno (`escrita`, `ocupada`, `rechazada`, `no escrita`) |
| `ajuste` | `trimestre?`, `profesor?` (sin datos solo lee) | ajustes guardados |

En la hoja Examenes, `paralelos` y `excluidos` se guardan separados por comas;
`preguntas` y `asignacion`, como JSON.

## Reglas de `pasar`

Ubica al alumno por su carnet en la columna G de `Filiación` (fila `8 + N`) y escribe en
`3er Trimestre`, fila `11 + N`, en la columna del examen (I a R). Nunca escribe en una celda
con contenido (ni con fórmula), solo pone el nombre del examen si el encabezado (fila 2) está
vacío, y bloquea cada registro mientras escribe (Netlify Blobs).
