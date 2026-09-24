# sistema-examenes-web

Panel web y backend del sistema de exámenes de un profesor de matemática.

## Qué contiene (cuando esté listo)

- **Panel**: interfaz web para que el profesor cree, gestione y revise exámenes.
- **Backend**: lógica y API que dan soporte al panel (exámenes, alumnos, resultados).

## Estado

Prototipo visual del panel. Los datos son de ejemplo y todavía no hay backend.

## Archivos

- `index.html`: pantallas del panel (dentro de `<x-dc>`) y su lógica (script `text/x-dc` al final).
- `estilos.css`: fuentes y estilos base.
- `fuentes/`: fuentes Jost y Prata.
- `vendor/`: React y `dc-runtime.js`, el motor que dibuja las pantallas. No se editan a mano.

## Despliegue

Pensado para desplegarse en [Netlify](https://www.netlify.com/) desde la rama `main`.
