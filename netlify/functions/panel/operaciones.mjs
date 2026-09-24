// Las 7 operaciones del panel. Reciben sus dependencias (Sheets, almacén,
// variables de entorno, azar) para poder probarse sin conexión.

export const COLUMNAS_SABER = ['I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'];
const PUNTAJE_TOTAL = 45;
const NOTA_MINIMA = 2;
const HOJA_FILIACION = 'Filiación';
const HOJA_TRIMESTRE = '3er Trimestre';
const NIVELES = { primero: 1, segundo: 2, tercero: 3, cuarto: 4, quinto: 5, sexto: 6 };

export class ErrorPanel extends Error {}

function falla(mensaje) {
  throw new ErrorPanel(mensaje);
}

const texto = (v) => String(v ?? '').trim();
const igual = (a, b) => texto(a).toLowerCase() === texto(b).toLowerCase();
const normCarnet = (v) => texto(v).replace(/\s+/g, '').toUpperCase();
const letraColumna = (i) => String.fromCharCode(65 + i);

// Convierte las filas de una pestaña en objetos según su fila de encabezados.
function tabla(filas) {
  const [encabezados = [], ...datos] = filas;
  const cols = encabezados.map(texto);
  return {
    cols,
    filas: datos.map((f, i) => {
      const o = { _fila: i + 2 };
      cols.forEach((c, j) => { o[c] = f[j] ?? ''; });
      return o;
    })
  };
}

function cursoDe(nivel, paralelo) {
  const n = texto(nivel).match(/\d+/)?.[0] ?? NIVELES[texto(nivel).toLowerCase()];
  if (!n) falla(`Nivel no reconocido: "${nivel}"`);
  return `${n}${texto(paralelo).toUpperCase()}`;
}

function listaComas(v) {
  return texto(v) ? texto(v).split(',').map(texto).filter(Boolean) : [];
}

function jsonCelda(v, porDefecto) {
  try { return texto(v) ? JSON.parse(v) : porDefecto; } catch { falla('Hay una celda con formato inválido en Examenes'); }
}

function fechaBolivia(ms) {
  // Bolivia: UTC-4, sin horario de verano.
  return new Date(ms - 4 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
}

export function crearOperaciones({ sheets, almacen, env, azar, ahora = Date.now }) {
  const SISTEMA = env.SISTEMA_SHEET_ID;

  const leerTabla = async (hoja) => tabla(await sheets.leer(SISTEMA, `'${hoja}'`));

  function registroDe(curso) {
    const id = env[`REGISTRO_${curso}`];
    if (!id) falla(`No hay registro configurado para ${curso} (variable REGISTRO_${curso})`);
    return id;
  }

  async function examenPorId(id) {
    const t = await leerTabla('Examenes');
    const ex = t.filas.find((f) => igual(f.id_examen, id));
    if (!ex) falla(`No existe el examen ${id}`);
    return { t, ex };
  }

  async function escribirCeldasExamen(t, ex, valores) {
    const cambios = Object.entries(valores).map(([col, v]) => {
      const i = t.cols.indexOf(col);
      if (i < 0) falla(`Falta la columna "${col}" en Examenes`);
      return { rango: `'Examenes'!${letraColumna(i)}${ex._fila}`, valores: [[v]] };
    });
    await sheets.escribir(SISTEMA, cambios);
  }

  function validarColumna(c) {
    if (!COLUMNAS_SABER.includes(texto(c).toUpperCase())) falla('La columna del registro debe estar entre I y R');
    return texto(c).toUpperCase();
  }

  return {
    async estado() {
      const { filas } = await leerTabla('Examenes');
      const u = filas.at(-1);
      if (!u) return { ultimo: null };
      return {
        ultimo: {
          id_examen: u.id_examen, fecha: u.fecha, nivel: u.nivel, paralelos: listaComas(u.paralelos),
          tema: u.tema, columna_registro: u.columna_registro, estado: u.estado,
          notas_pasadas: Number(u.notas_pasadas) || 0
        }
      };
    },

    async banco({ nivel, tema }) {
      if (!texto(nivel)) falla('Falta el nivel');
      const del_nivel = (await leerTabla('Banco')).filas.filter((f) => igual(f.nivel, nivel));
      const temas = [...new Set(del_nivel.map((f) => texto(f.tema)))];
      const preguntas = new Map();
      for (const f of del_nivel) {
        if (texto(tema) && !igual(f.tema, tema)) continue;
        const cod = texto(f.codigo);
        if (!preguntas.has(cod)) {
          preguntas.set(cod, { codigo: cod, tema: texto(f.tema), dificultad: f.dificultad, tipo: f.tipo, formas: {} });
        }
        preguntas.get(cod).formas[texto(f.forma).toUpperCase()] = {
          enunciado: f.enunciado,
          opciones: [f.opcion_a, f.opcion_b, f.opcion_c, f.opcion_d],
          clave: f.clave,
          solucion: f.solucion
        };
      }
      return { temas, preguntas: [...preguntas.values()] };
    },

    async guardar(d) {
      for (const campo of ['fecha', 'nivel', 'tema', 'duracion']) {
        if (!texto(d[campo])) falla(`Falta ${campo}`);
      }
      const paralelos = (d.paralelos || []).map((p) => texto(p).toUpperCase()).filter(Boolean);
      if (!paralelos.length) falla('Falta al menos un paralelo');
      const columna = validarColumna(d.columna_registro);
      const preguntas = d.preguntas || [];
      if (!preguntas.length) falla('El examen no tiene preguntas');
      const codigos = preguntas.map((p) => texto(p.codigo));
      if (new Set(codigos).size !== codigos.length) falla('Hay preguntas repetidas');
      if (preguntas.some((p) => !(Number(p.puntaje) > 0))) falla('Cada pregunta necesita un puntaje mayor que 0');
      const suma = preguntas.reduce((s, p) => s + Number(p.puntaje), 0);
      if (Math.abs(suma - PUNTAJE_TOTAL) > 1e-9) falla(`Los puntajes suman ${suma}, deben sumar ${PUNTAJE_TOTAL}`);

      // Formas disponibles en TODAS las preguntas elegidas.
      const banco = (await leerTabla('Banco')).filas.filter((f) => igual(f.nivel, d.nivel));
      let formas = null;
      for (const cod of codigos) {
        const deEsta = new Set(banco.filter((f) => igual(f.codigo, cod)).map((f) => texto(f.forma).toUpperCase()));
        if (!deEsta.size) falla(`La pregunta ${cod} no está en el banco de ${d.nivel}`);
        formas = formas ? formas.filter((x) => deEsta.has(x)) : [...deEsta].sort();
      }
      if (!formas.length) falla('Las preguntas elegidas no comparten ninguna forma');

      const alumnos = (await leerTabla('Alumnos')).filas
        .filter((a) => igual(a.nivel, d.nivel) && paralelos.includes(texto(a.paralelo).toUpperCase()));
      if (!alumnos.length) falla('No hay alumnos en esos paralelos');
      const sinCarnet = alumnos.filter((a) => !normCarnet(a.carnet));
      if (sinCarnet.length) falla(`Alumnos sin carnet: ${sinCarnet.map((a) => a.nombre).join(', ')}`);
      const carnets = new Set(alumnos.map((a) => normCarnet(a.carnet)));
      const excluidos = (d.excluidos || []).map(normCarnet);
      const ajenos = excluidos.filter((c) => !carnets.has(c));
      if (ajenos.length) falla(`Excluidos que no son del curso: ${ajenos.join(', ')}`);

      const asignacion = {};
      for (const c of carnets) asignacion[c] = formas[azar(formas.length)];

      const tEx = await leerTabla('Examenes');
      const ultimoNum = Math.max(0, ...tEx.filas.map((f) => Number(texto(f.id_examen).match(/\d+/)?.[0]) || 0));
      const id = `EX-${String(ultimoNum + 1).padStart(3, '0')}`;
      const fila = {
        id_examen: id, creado: fechaBolivia(ahora()), fecha: texto(d.fecha), nivel: texto(d.nivel),
        paralelos: paralelos.join(','), tema: texto(d.tema),
        preguntas: JSON.stringify(preguntas.map((p) => ({ codigo: texto(p.codigo), puntaje: Number(p.puntaje) }))),
        duracion: texto(d.duracion), columna_registro: columna, asignacion: JSON.stringify(asignacion),
        excluidos: excluidos.join(','), notas_pasadas: 0, estado: 'creado'
      };
      const faltan = Object.keys(fila).filter((c) => !tEx.cols.includes(c));
      if (faltan.length) falla(`Faltan columnas en Examenes: ${faltan.join(', ')}`);
      await sheets.agregarFila(SISTEMA, 'Examenes', tEx.cols.map((c) => fila[c] ?? ''));
      return { id_examen: id, asignacion };
    },

    async cambiar({ id_examen, columna_registro, excluidos }) {
      if (columna_registro === undefined && excluidos === undefined) falla('No hay nada que cambiar');
      const { t, ex } = await examenPorId(id_examen);
      const valores = {};
      if (columna_registro !== undefined) valores.columna_registro = validarColumna(columna_registro);
      if (excluidos !== undefined) {
        const asignados = jsonCelda(ex.asignacion, {});
        const lista = excluidos.map(normCarnet);
        const ajenos = lista.filter((c) => !(c in asignados));
        if (ajenos.length) falla(`Excluidos que no están en el examen: ${ajenos.join(', ')}`);
        valores.excluidos = lista.join(',');
      }
      await escribirCeldasExamen(t, ex, valores);
      return { id_examen: ex.id_examen, ...valores };
    },

    async notas({ nivel, paralelo }) {
      const curso = cursoDe(nivel, paralelo);
      const id = registroDe(curso);
      const del_curso = (await leerTabla('Alumnos')).filas
        .filter((a) => igual(a.nivel, nivel) && igual(a.paralelo, paralelo));
      const maxN = Math.max(0, ...del_curso.map((a) => Number(a.numero) || 0));
      const encabezados = (await sheets.leer(id, `'${HOJA_TRIMESTRE}'!I2:R2`, { formulas: true }))[0] || [];
      const celdas = maxN ? await sheets.leer(id, `'${HOJA_TRIMESTRE}'!I12:R${11 + maxN}`, { formulas: true }) : [];
      const examenes = (await leerTabla('Examenes')).filas.filter((e) =>
        igual(e.nivel, nivel) && listaComas(e.paralelos).some((p) => igual(p, paralelo)));
      return {
        curso,
        columnas: COLUMNAS_SABER.map((letra, i) => ({
          letra,
          encabezado: texto(encabezados[i]),
          notas: celdas.filter((f) => texto(f[i]) !== '').length,
          examenes: examenes.filter((e) => igual(e.columna_registro, letra)).map((e) => ({ id_examen: e.id_examen, tema: e.tema }))
        }))
      };
    },

    async pasar({ id_examen, notas }) {
      if (!Array.isArray(notas) || !notas.length) falla('No hay notas para pasar');
      const { ex } = await examenPorId(id_examen);
      const columna = validarColumna(ex.columna_registro);
      const asignados = jsonCelda(ex.asignacion, {});
      const excluidos = new Set(listaComas(ex.excluidos).map(normCarnet));
      const alumnos = (await leerTabla('Alumnos')).filas.filter((a) => igual(a.nivel, ex.nivel));

      const resultados = [];
      const porCurso = new Map();
      const vistos = new Set();
      for (const entrada of notas) {
        const carnet = normCarnet(entrada.carnet);
        const nota = entrada.nota;
        const r = { carnet, nota };
        resultados.push(r);
        const rechazar = (motivo) => Object.assign(r, { estado: 'rechazada', motivo });
        if (!carnet) { rechazar('Falta el carnet'); continue; }
        if (!Number.isInteger(nota) || nota < NOTA_MINIMA || nota > PUNTAJE_TOTAL) {
          rechazar(`La nota debe ser un número entero entre ${NOTA_MINIMA} y ${PUNTAJE_TOTAL}`); continue;
        }
        if (vistos.has(carnet)) { rechazar('Carnet repetido en este envío'); continue; }
        vistos.add(carnet);
        if (!(carnet in asignados)) { rechazar('El alumno no está en este examen'); continue; }
        if (excluidos.has(carnet)) { rechazar('El alumno está excluido de este examen'); continue; }
        const alumno = alumnos.find((a) => normCarnet(a.carnet) === carnet);
        if (!alumno) { rechazar('El carnet no está en Alumnos'); continue; }
        const curso = cursoDe(alumno.nivel, alumno.paralelo);
        if (!porCurso.has(curso)) porCurso.set(curso, []);
        porCurso.get(curso).push(r);
      }

      for (const [curso, lista] of porCurso) {
        const id = registroDe(curso);
        const liberar = await almacen.bloquear(`registro-${curso}`);
        if (!liberar) {
          for (const r of lista) Object.assign(r, { estado: 'no escrita', motivo: `El registro de ${curso} está ocupado, intenta de nuevo en unos segundos` });
          continue;
        }
        try {
          const ci = await sheets.leer(id, `'${HOJA_FILIACION}'!G9:G`);
          const pendientes = [];
          for (const r of lista) {
            const filas = ci.flatMap((f, i) => (normCarnet(f[0]) === r.carnet ? [i + 1] : []));
            if (filas.length === 0) { Object.assign(r, { estado: 'rechazada', motivo: `El carnet no aparece en la Filiación de ${curso}` }); continue; }
            if (filas.length > 1) { Object.assign(r, { estado: 'rechazada', motivo: `El carnet aparece repetido en la Filiación de ${curso}` }); continue; }
            r.numero = filas[0];
            pendientes.push(r);
          }
          if (pendientes.length) {
            const maxN = Math.max(...pendientes.map((r) => r.numero));
            const celdas = await sheets.leer(id, `'${HOJA_TRIMESTRE}'!${columna}12:${columna}${11 + maxN}`, { formulas: true });
            const encabezado = texto((await sheets.leer(id, `'${HOJA_TRIMESTRE}'!${columna}2`, { formulas: true }))[0]?.[0]);
            const cambios = [];
            for (const r of pendientes) {
              const actual = texto(celdas[r.numero - 1]?.[0]);
              if (actual !== '') {
                Object.assign(r, { estado: 'ocupada', motivo: `La celda ${columna}${11 + r.numero} ya tiene "${actual}"; no se tocó` });
                continue;
              }
              cambios.push({ rango: `'${HOJA_TRIMESTRE}'!${columna}${11 + r.numero}`, valores: [[r.nota]] });
              r.estado = 'escrita';
            }
            if (cambios.length && encabezado === '') {
              cambios.push({ rango: `'${HOJA_TRIMESTRE}'!${columna}2`, valores: [[texto(ex.tema)]] });
            }
            if (cambios.length) await sheets.escribir(id, cambios);
          }
        } catch (e) {
          // La escritura es el último paso: si algo falló, este curso no se escribió.
          // Los demás cursos siguen, y su conteo se guarda igual.
          for (const r of lista) {
            if (r.estado === 'escrita' || !r.estado) Object.assign(r, { estado: 'no escrita', motivo: `Error con el registro de ${curso}: ${e.message}` });
          }
        } finally {
          await liberar();
        }
      }

      const escritas = resultados.filter((r) => r.estado === 'escrita').length;
      if (escritas) {
        // Se relee la fila bajo bloqueo para no pisar otro envío simultáneo.
        const liberar = await almacen.bloquear(`examen-${ex.id_examen}`);
        if (!liberar) falla('Notas escritas, pero no se pudo actualizar el conteo en Examenes; vuelve a intentar');
        try {
          const { t, ex: fresco } = await examenPorId(id_examen);
          await escribirCeldasExamen(t, fresco, { notas_pasadas: (Number(fresco.notas_pasadas) || 0) + escritas });
        } finally {
          await liberar();
        }
      }
      return { escritas, resultados };
    },

    async ajuste({ trimestre, profesor }) {
      const actuales = await almacen.leerAjustes();
      if (trimestre === undefined && profesor === undefined) return actuales;
      const nuevos = { ...actuales };
      for (const [campo, v] of Object.entries({ trimestre, profesor })) {
        if (v === undefined) continue;
        if (!texto(v) || texto(v).length > 120) falla(`El ${campo} no es válido`);
        nuevos[campo] = texto(v);
      }
      await almacen.guardarAjustes(nuevos);
      return nuevos;
    }
  };
}
