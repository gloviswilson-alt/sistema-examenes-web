# Mapa del sistema pedagógico

Idea completa del profesor para ampliar el sistema de exámenes hacia un registro pedagógico completo,
automatizado e inteligente. Todo se construye **sobre este mismo sistema** (panel + función de Netlify +
Google Sheets), por partes y en este orden. Nada de esto está hecho todavía, salvo la parte 1.

## Principios que se mantienen en todas las partes

- **Nada se escribe en el registro ni se envía a nadie sin la aprobación del profesor.**
- **Nunca se escribe encima de una nota** salvo con "Corregir nota" (a pedido y con confirmación).
- **Todo queda anotado** (Bitácora / ficha) con fecha.
- **Datos de menores:** cada persona ve solo lo que le corresponde.
- Las fotos de los exámenes no salen del celular.

## Orden recomendado

| # | Parte | Qué hace | Depende de |
|---|---|---|---|
| 1 | **Exámenes** (hecho) | Crear, imprimir, leer con foto, pasar notas, corregir, bitácora. Falta pasar a los registros reales. | — |
| 2 | **Asistencia** | Elegir curso y fecha; todos presentes por defecto; tocar solo a los que faltaron (atraso/licencia si se usa); se escribe en la pestaña de asistencia del registro. | 1 |
| 3 | **Filiación completa** | Todos los datos del estudiante y de sus apoderados (celular incluido), editables desde el panel y sincronizados con la pestaña Filiación. Sirve para todo el año. | 1 |
| 4 | **Ficha pedagógica** | Línea de tiempo por estudiante. Automático: faltas, atrasos, notas, "No dio examen", correcciones. Manual: conducta, observaciones, entrevistas (con fecha). | 2, 3 |
| 5 | **Citaciones y compromisos** | Un clic desde la ficha: documento lleno con los datos del alumno y del apoderado, para imprimir; queda anotado en la ficha (asistió / qué se acordó). | 3, 4 |
| 6 | **Centralizadores y notas finales** | Promedios por dimensión y trimestre; pantalla o archivo en el formato del Ministerio. | 1–3 |
| 7 | **Portal del estudiante** | Cada alumno entra con carnet + clave personal y ve solo lo suyo (notas publicadas, faltas, exámenes pendientes). | 1–4 |
| 8 | **Exámenes en línea** | Rendir en el portal: formas y orden barajados, tiempo límite, un intento, calificación en el servidor. El profesor ve en vivo y pasa las notas al registro con un botón al cerrar. | 7 |
| 9 | **Planes de clase con IA** | Semanal, mensual, trimestral, PDC… en el formato de la unidad educativa, con los temas del banco. La IA propone, el profesor revisa. | Independiente (puede adelantarse) |
| 10 | **Asistente por WhatsApp** | Un número que solo responde al profesor: consultas ("promedio de…", "quién faltó ayer", "qué me toca mañana"), informes de aprovechamiento, citaciones a padres. Siempre pide confirmación antes de escribir o enviar. | Todas las anteriores |

## Decisiones pendientes (se definen al llegar a cada parte)

- **Asistencia:** cómo es la pestaña (una columna por día, filas, dónde va la fecha), qué letras se usan (P, F, A, L…), si se toma más de una vez al día, cómo se corrige.
- **"No dio examen" en la ficha:** cuándo se anota (al cerrar el examen con un botón, o se reemplaza solo si luego se pone la nota).
- **Portal:** qué ve el alumno de su ficha; claves personales (el sistema las genera, el profesor las entrega y las resetea); las notas se ven cuando el profesor las publica.
- **Ministerio (SIE Académico):** búsqueda del 26/09/2026: no se encontró API oficial ni opción de importar Excel (no
  verificado del todo). La vía oficial es llenar la página alumno por alumno. Existen herramientas de terceros
  (p. ej. RegCal) que hacen "llenado automático": la opción recomendada es un **botón o extensión del navegador**
  que llene la página del SIE **mientras el profesor está dentro con su usuario**, y él revisa y guarda (su
  contraseña nunca sale del navegador; hay que ajustarla si el Ministerio cambia la página). Si no, una pantalla
  ordenada igual para copiar. No se automatiza guardando la contraseña del profesor. Hará falta: capturas de la
  pantalla del SIE donde se cargan las notas.
- **WhatsApp:** primero solo preparar el mensaje y que el profesor lo envíe; el envío automático necesita la API oficial (costo y aprobación).

## Qué hará falta del profesor

- Una copia del registro con sus pestañas de **asistencia**, **filiación** y **centralizadores**.
- Sus modelos de **citación**, **compromiso** e **informe de aprovechamiento**.
- Sus formatos de **planes de clase** (un ejemplo de cada uno).
- Capturas de la **plataforma del Ministerio** donde se cargan las notas.
- Su **horario** y la lista de **pendientes** por curso (para el asistente).

## Costos a revisar antes de cada parte

- Netlify: el uso normal entra en el plan gratis; cada publicación de cambios cuesta créditos.
- IA (planes, asistente): pago por uso, pequeño; se calcula antes de empezar.
- WhatsApp Business: pago por conversación; se calcula antes de empezar.
