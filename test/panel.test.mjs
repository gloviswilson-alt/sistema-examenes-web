import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearOperaciones, ErrorPanel } from '../netlify/functions/panel/operaciones.mjs';

// --- Google Sheets simulado -------------------------------------------------
const col = (l) => l.charCodeAt(0) - 65;

function parsear(rango) {
  const m = rango.match(/^'([^']+)'(?:!([A-Z])(\d+)?(?::([A-Z])(\d+)?)?)?$/);
  if (!m) throw new Error(`Rango no soportado en la prueba: ${rango}`);
  const [, hoja, c1 = 'A', f1 = '1', c2, f2] = m;
  return { hoja, c1: col(c1), f1: Number(f1), c2: c2 ? col(c2) : (m[2] ? col(c1) : 25), f2: f2 ? Number(f2) : (m[3] && !m[4] ? Number(f1) : Infinity) };
}

function sheetsFalso(docs) {
  const escrituras = [];
  const valor = (celda, formulas) => (typeof celda === 'object' && celda ? (formulas ? celda.f : celda.v) : celda ?? '');
  return {
    escrituras,
    async leer(id, rango, { formulas = false } = {}) {
      const { hoja, c1, f1, c2, f2 } = parsear(rango);
      const filas = docs[id][hoja];
      const out = [];
      for (let f = f1; f <= Math.min(f2, filas.length); f++) {
        const fila = [];
        for (let c = c1; c <= c2; c++) fila.push(valor(filas[f - 1]?.[c], formulas));
        while (fila.length && fila.at(-1) === '') fila.pop();
        out.push(fila);
      }
      while (out.length && !out.at(-1).length) out.pop();
      return out;
    },
    async escribir(id, cambios) {
      for (const { rango, valores } of cambios) {
        const { hoja, c1, f1 } = parsear(rango);
        escrituras.push({ id, rango, valor: valores[0][0] });
        const filas = docs[id][hoja];
        while (filas.length < f1) filas.push([]);
        filas[f1 - 1][c1] = valores[0][0];
      }
    },
    async agregarFila(id, hoja, fila) {
      escrituras.push({ id, rango: `'${hoja}'!append`, valor: fila });
      docs[id][hoja].push(fila);
    }
  };
}

function almacenFalso({ ocupado = [] } = {}) {
  const bloqueos = new Set(ocupado);
  let ajustes = {};
  return {
    bloqueos,
    async leerAjustes() { return { ...ajustes }; },
    async guardarAjustes(a) { ajustes = { ...a }; },
    async bloquear(clave) {
      if (bloqueos.has(clave)) return null;
      bloqueos.add(clave);
      return async () => bloqueos.delete(clave);
    }
  };
}

// --- Datos de ejemplo --------------------------------------------------------
const EX_COLS = ['id_examen', 'creado', 'fecha', 'nivel', 'paralelos', 'tema', 'preguntas', 'duracion', 'columna_registro', 'asignacion', 'excluidos', 'notas_pasadas', 'estado'];
const BANCO_COLS = ['codigo', 'forma', 'nivel', 'tema', 'dificultad', 'tipo', 'enunciado', 'opcion_a', 'opcion_b', 'opcion_c', 'opcion_d', 'clave', 'solucion'];
const familia = (cod, nivel, tema, enunciado, claves = 'ABCD') =>
  ['A', 'B', 'C', 'D'].map((f, i) => [cod, f, nivel, tema, 'Media', 'practica', enunciado(f), 'a', 'b', 'c', 'd', claves[i], 's']);

// Azar determinista (congruencial) para que las pruebas se repitan igual.
function azarFijo() {
  let x = 7;
  return (n) => { x = (x * 1103515245 + 12345) % 2147483648; return x % n; };
}

function escenario({ ocupado } = {}) {
  const asignacion = JSON.stringify({ C1: 'A', C2: 'B', C3: 'C', C4: 'D', C5: 'A' });
  const trimestre = Array.from({ length: 16 }, () => []);
  trimestre[1][col('L')] = 'Examen anterior';  // encabezado K vacío, L con texto (fila 2)
  trimestre[10][col('K')] = 'no tocar';        // fila 11: nunca se toca
  trimestre[12][col('K')] = 30;                // alumno 2 ya tiene nota en K
  trimestre[13][col('K')] = { f: '=SUMA(1;2)', v: '' }; // alumno 3: fórmula que muestra vacío
  trimestre[11][col('L')] = 40;                // columna L: notas 40 y 35
  trimestre[12][col('L')] = 35;
  const filiacion = Array.from({ length: 8 }, () => []);
  for (const [n, ci] of [[1, 'C1'], [2, 'C2'], [3, 'C3'], [4, 'C4']]) {
    filiacion[8 + n - 1] = [];
    filiacion[8 + n - 1][col('G')] = ci;
  }
  const docs = {
    SIS: {
      Banco: [
        BANCO_COLS,
        ...familia('T12-F01', 'Sexto', 'La parábola', (f) => `Vértice ${f}`),
        ...familia('T12-F02', 'Sexto', 'La parábola', (f) => `Foco ${f}`, 'DCBA'),
        ...familia('T15-F01', 'Sexto', 'La elipse', (f) => `Eje ${f}`),
        ...familia('T12-F03', 'Sexto', 'La parábola', () => 'Siempre igual', 'AAAA'),
        ...familia('S01-F01', 'Segundo', 'Productos notables', (f) => `Binomio ${f}`)
      ],
      Alumnos: [
        ['nivel', 'paralelo', 'numero', 'nombre', 'carnet'],
        ['Sexto', 'B', '1', 'Ana', 'C1'], ['Sexto', 'B', '2', 'Beto', 'C2'], ['Sexto', 'B', '3', 'Caro', 'C3'],
        ['Sexto', 'B', '4', 'Dani', 'C4'], ['Sexto', 'B', '5', 'Eva', 'C5'],
        ['Sexto', 'A', '1', 'Fito', 'C6'], ['Sexto', 'A', '2', 'Gabi', 'C7'], ['Sexto', 'A', '3', 'Hugo', 'C8'], ['Sexto', 'A', '4', 'Iris', 'C9']
      ],
      Examenes: [
        EX_COLS,
        ['EX001', '', '2026-09-01', 'Sexto', 'A', 'Rectas', '[]', '', 'I', '{}', '', '3', 'creado'],
        ['EX002', '', '2026-09-17', 'Sexto', 'B', 'La parábola y la elipse', '[]', '40', 'K', asignacion, 'C4', '0', 'creado']
      ]
    },
    REG6B: { 'Filiación': filiacion, '3er Trimestre': trimestre }
  };
  const sheets = sheetsFalso(docs);
  const almacen = almacenFalso({ ocupado });
  const ops = crearOperaciones({
    sheets, almacen, azar: azarFijo(), ahora: () => Date.UTC(2026, 8, 24, 16, 0),
    hojas: { sistema: 'SIS', registros: { '6A': '', '6B': 'REG6B', '2A': '', '2B': '' } }
  });
  return { docs, sheets, almacen, ops };
}

// --- Pruebas -----------------------------------------------------------------
test('pasar escribe solo en celdas vacías y pone el nombre del examen en el encabezado vacío', async () => {
  const { docs, sheets, ops } = escenario();
  const r = await ops.pasar({ id_examen: 'EX002', notas: [{ carnet: 'C1', nota: 38 }, { carnet: 'C2', nota: 40 }, { carnet: 'C3', nota: 20 }] });
  const t = docs.REG6B['3er Trimestre'];
  assert.equal(t[11][col('K')], 38);                         // alumno 1 → fila 12
  assert.equal(t[12][col('K')], 30);                         // ya tenía nota: intacta
  assert.deepEqual(t[13][col('K')], { f: '=SUMA(1;2)', v: '' }); // fórmula: intacta
  assert.equal(t[1][col('K')], 'La parábola y la elipse');   // encabezado vacío → nombre
  assert.equal(t[10][col('K')], 'no tocar');                 // fila 11 intacta
  assert.equal(r.escritas, 1);
  assert.deepEqual(r.resultados.map((x) => x.estado), ['escrita', 'ocupada', 'ocupada']);
  assert.equal(docs.SIS.Examenes[2][11], 1);                 // notas_pasadas 0 → 1
  for (const w of sheets.escrituras.filter((w) => w.id === 'REG6B')) {
    assert.match(w.rango, /^'3er Trimestre'!K(2|1[2-9]|[2-9]\d)$/);
  }
});

test('pasar no toca un encabezado que ya tiene texto', async () => {
  const { docs, ops } = escenario();
  docs.SIS.Examenes[2][8] = 'L';
  await ops.pasar({ id_examen: 'EX002', notas: [{ carnet: 'C3', nota: 10 }] });
  const t = docs.REG6B['3er Trimestre'];
  assert.equal(t[1][col('L')], 'Examen anterior');
  assert.equal(t[13][col('L')], 10);
});

test('pasar no escribe nada si el carnet no está en la Filiación', async () => {
  const { sheets, ops } = escenario();
  const r = await ops.pasar({ id_examen: 'EX002', notas: [{ carnet: 'C5', nota: 30 }] });
  assert.equal(r.escritas, 0);
  assert.match(r.resultados[0].motivo, /no aparece en la Filiación/);
  assert.equal(sheets.escrituras.length, 0);
});

test('pasar rechaza excluidos, ajenos, repetidos y notas fuera de rango', async () => {
  const { sheets, ops } = escenario();
  const r = await ops.pasar({
    id_examen: 'EX002',
    notas: [{ carnet: 'C4', nota: 30 }, { carnet: 'C9', nota: 30 }, { carnet: 'C1', nota: 46 }, { carnet: 'C1', nota: 1 }, { carnet: 'C1', nota: 30.5 }, { carnet: 'C1', nota: '30' }]
  });
  assert.deepEqual(r.resultados.map((x) => x.estado), Array(6).fill('rechazada'));
  assert.equal(sheets.escrituras.length, 0);
});

test('pasar no escribe si el registro está bloqueado por otro envío', async () => {
  const { sheets, ops } = escenario({ ocupado: ['registro-6B'] });
  const r = await ops.pasar({ id_examen: 'EX002', notas: [{ carnet: 'C1', nota: 30 }] });
  assert.equal(r.resultados[0].estado, 'no escrita');
  assert.equal(sheets.escrituras.length, 0);
});

test('pasar libera el bloqueo aunque falle Google', async () => {
  const { sheets, almacen, ops } = escenario();
  sheets.escribir = async () => { throw new Error('caída'); };
  const r = await ops.pasar({ id_examen: 'EX002', notas: [{ carnet: 'C1', nota: 30 }] });
  assert.equal(r.resultados[0].estado, 'no escrita');
  assert.equal(r.escritas, 0);
  assert.equal(almacen.bloqueos.size, 0);
});

test('solo se aceptan columnas I a R', async () => {
  const { docs, ops } = escenario();
  docs.SIS.Examenes[2][8] = 'D';
  await assert.rejects(ops.pasar({ id_examen: 'EX002', notas: [{ carnet: 'C1', nota: 30 }] }), ErrorPanel);
  await assert.rejects(ops.cambiar({ id_examen: 'EX002', columna_registro: 'S' }), /entre I y R/);
});

const preg = (codigo, puntaje, espacio = 'pequeño') => ({ codigo, puntaje, espacio });
const BASE = { fecha: '2026-10-01', nivel: 'Sexto', paralelos: ['A', 'B'], tema: 'Secciones cónicas', columna_registro: 'M' };
const TRES = [preg('T12-F01', 15), preg('T12-F02', 15), preg('T15-F01', 15)];

test('guardar valida cantidad, puntajes, espacio y banco', async () => {
  const { ops } = escenario();
  await assert.rejects(ops.guardar({ ...BASE, preguntas: TRES.slice(0, 2) }), /entre 3 y 10/);
  await assert.rejects(ops.guardar({ ...BASE, preguntas: Array(11).fill(0).map((_, i) => preg(`X${i}`, 45 / 11)) }), /entre 3 y 10/);
  await assert.rejects(ops.guardar({ ...BASE, preguntas: [preg('T12-F01', 15), preg('T12-F02', 15), preg('T15-F01', 10)] }), /suman 40/);
  await assert.rejects(ops.guardar({ ...BASE, preguntas: [...TRES.slice(0, 2), preg('T15-F01', 15, 'enorme')] }), /espacio/);
  await assert.rejects(ops.guardar({ ...BASE, preguntas: [...TRES.slice(0, 2), preg('S01-F01', 15)] }), /no está en el banco/);
  await assert.rejects(ops.guardar({ ...BASE, excluidos: ['X1'], preguntas: TRES }), /no son del curso/);
});

test('guardar sin duración, con ID sin guion y formas parejas barajadas por paralelo', async () => {
  const { docs, ops } = escenario();
  const r = await ops.guardar({ ...BASE, excluidos: ['c2'], preguntas: TRES });
  assert.equal(r.id_examen, 'EX003');
  const deB = ['C1', 'C2', 'C3', 'C4', 'C5'].map((c) => r.asignacion[c]).sort().join('');
  const deA = ['C6', 'C7', 'C8', 'C9'].map((c) => r.asignacion[c]).sort().join('');
  assert.equal(deB, 'AABCD'); // 5 alumnos: una forma se repite una vez
  assert.equal(deA, 'ABCD');  // 4 alumnos: una de cada
  const fila = docs.SIS.Examenes.at(-1);
  assert.equal(fila[0], 'EX003');
  assert.equal(fila[1], '2026-09-24 12:00');
  assert.equal(fila[4], 'A,B');
  assert.deepEqual(JSON.parse(fila[6])[0], { codigo: 'T12-F01', puntaje: 15, espacio: 'pequeño' });
  assert.equal(fila[7], '');
  assert.equal(fila[10], 'C2');
});

test('el barajado no deja patrón fijo en la lista', async () => {
  const orden = async (semilla) => {
    let x = semilla;
    const e = escenario();
    const ops = crearOperaciones({
      sheets: e.sheets, almacen: e.almacen, hojas: { sistema: 'SIS', registros: {} },
      azar: (n) => { x = (x * 1103515245 + 12345) % 2147483648; return x % n; }
    });
    const r = await ops.guardar({ ...BASE, paralelos: ['A'], preguntas: TRES });
    return ['C6', 'C7', 'C8', 'C9'].map((c) => r.asignacion[c]).join('');
  };
  const vistas = new Set();
  for (let s = 1; s <= 20; s++) vistas.add(await orden(s));
  assert.ok(vistas.size > 5, `solo ${vistas.size} órdenes distintos`);
});

test('cambiar actualiza columna y excluidos del examen', async () => {
  const { docs, ops } = escenario();
  await ops.cambiar({ id_examen: 'EX002', columna_registro: 'n', excluidos: ['C1', 'C3'] });
  assert.equal(docs.SIS.Examenes[2][8], 'N');
  assert.equal(docs.SIS.Examenes[2][10], 'C1,C3');
  await assert.rejects(ops.cambiar({ id_examen: 'EX002', excluidos: ['C9'] }), /no están en el examen/);
  await assert.rejects(ops.cambiar({ id_examen: 'EX999', columna_registro: 'I' }), /No existe/);
});

test('banco: signo de la clave al final del enunciado y familias iguales ocultas', async () => {
  const { ops } = escenario();
  const b = await ops.banco({ nivel: 'sexto', tema: 'la parábola' });
  assert.deepEqual(b.temas, ['La parábola', 'La elipse']);
  assert.deepEqual(b.preguntas.map((p) => p.codigo), ['T12-F01', 'T12-F02']); // T12-F03 oculta
  const f1 = b.preguntas[0].formas;
  assert.deepEqual(['A', 'B', 'C', 'D'].map((f) => f1[f].enunciado), ['Vértice A.', 'Vértice B,', 'Vértice C:', 'Vértice D']);
  assert.equal(b.preguntas[1].formas.A.enunciado, 'Foco A'); // clave D: sin signo
});

test('estado, notas (con fecha y promedio) y ajuste', async () => {
  const { ops } = escenario();
  const e = await ops.estado();
  assert.equal(e.ultimo.id_examen, 'EX002');
  assert.deepEqual(e.ultimo.paralelos, ['B']);

  const n = await ops.notas({ nivel: 'Sexto', paralelo: 'B' });
  const k = n.columnas.find((c) => c.letra === 'K');
  const l = n.columnas.find((c) => c.letra === 'L');
  assert.equal(n.curso, '6B');
  assert.equal(k.notas, 2);        // nota 30 + fórmula
  assert.equal(k.promedio, 30);    // la fórmula no cuenta para el promedio
  assert.deepEqual(k.examenes, [{ id_examen: 'EX002', tema: 'La parábola y la elipse', fecha: '2026-09-17' }]);
  assert.equal(l.encabezado, 'Examen anterior');
  assert.equal(l.promedio, 37.5);
  assert.equal(n.columnas.find((c) => c.letra === 'M').promedio, null);
  await assert.rejects(ops.notas({ nivel: 'Sexto', paralelo: 'A' }), /No hay registro configurado para 6A/);

  assert.deepEqual(await ops.ajuste({}), {});
  assert.deepEqual(await ops.ajuste({ trimestre: 'Tercer trimestre' }), { trimestre: 'Tercer trimestre' });
  assert.deepEqual(await ops.ajuste({ profesor: 'Prof. Glovis' }), { trimestre: 'Tercer trimestre', profesor: 'Prof. Glovis' });
  await assert.rejects(ops.ajuste({ profesor: '  ' }), /no es válido/);
});
