// Endpoint único del panel: POST /.netlify/functions/panel
// Cuerpo: { accion: 'panel', clave, operacion, ...datos de la operación }
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { crearSheets } from './sheets.mjs';
import { crearAlmacen } from './almacen.mjs';
import { crearOperaciones, ErrorPanel } from './operaciones.mjs';
import { HOJAS } from './hojas.mjs';

const OPERACIONES = ['estado', 'banco', 'guardar', 'cambiar', 'notas', 'pasar', 'ajuste', 'anular', 'corregir'];

const responder = (estado, cuerpo) => Response.json(cuerpo, { status: estado });

function claveCorrecta(recibida) {
  const esperada = process.env.PANEL_CLAVE;
  if (!esperada || typeof recibida !== 'string') return false;
  const a = createHash('sha256').update(recibida).digest();
  const b = createHash('sha256').update(esperada).digest();
  return timingSafeEqual(a, b);
}

let operaciones;

export default async (req) => {
  if (req.method !== 'POST') return responder(405, { ok: false, error: 'Solo POST' });
  let cuerpo;
  try { cuerpo = await req.json(); } catch { return responder(400, { ok: false, error: 'JSON inválido' }); }

  const { accion, clave, operacion, ...datos } = cuerpo || {};
  if (accion !== 'panel') return responder(400, { ok: false, error: 'Acción desconocida' });
  if (!claveCorrecta(clave)) return responder(401, { ok: false, error: 'Contraseña incorrecta' });
  if (!OPERACIONES.includes(operacion)) return responder(400, { ok: false, error: 'Operación desconocida' });

  try {
    operaciones ??= crearOperaciones({
      sheets: crearSheets(process.env.GOOGLE_SERVICE_ACCOUNT),
      almacen: crearAlmacen(),
      hojas: HOJAS,
      azar: randomInt
    });
    return responder(200, { ok: true, ...(await operaciones[operacion](datos)) });
  } catch (e) {
    if (e instanceof ErrorPanel) return responder(400, { ok: false, error: e.message });
    console.error(e);
    return responder(500, { ok: false, error: e.message });
  }
};
