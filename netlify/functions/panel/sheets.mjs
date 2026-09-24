// Cliente mínimo de la API de Google Sheets con cuenta de servicio.
// Sin dependencias: firma el JWT con node:crypto y usa fetch.
import { createSign } from 'node:crypto';

const ALCANCE = 'https://www.googleapis.com/auth/spreadsheets';
const API = 'https://sheets.googleapis.com/v4/spreadsheets';

function base64url(texto) {
  return Buffer.from(texto).toString('base64url');
}

export function crearSheets(credencialesJson) {
  const cred = JSON.parse(credencialesJson);
  let token = null;
  let vence = 0;

  async function obtenerToken() {
    if (token && Date.now() < vence - 60_000) return token;
    const ahora = Math.floor(Date.now() / 1000);
    const cabecera = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const cuerpo = base64url(JSON.stringify({
      iss: cred.client_email,
      scope: ALCANCE,
      aud: cred.token_uri || 'https://oauth2.googleapis.com/token',
      iat: ahora,
      exp: ahora + 3600
    }));
    const firma = createSign('RSA-SHA256').update(`${cabecera}.${cuerpo}`).sign(cred.private_key, 'base64url');
    const res = await fetch(cred.token_uri || 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${cabecera}.${cuerpo}.${firma}`
      })
    });
    if (!res.ok) throw new Error(`Google rechazó la cuenta de servicio (${res.status})`);
    const datos = await res.json();
    token = datos.access_token;
    vence = Date.now() + datos.expires_in * 1000;
    return token;
  }

  async function pedir(url, opciones = {}) {
    const res = await fetch(url, {
      ...opciones,
      headers: { Authorization: `Bearer ${await obtenerToken()}`, 'Content-Type': 'application/json' }
    });
    if (!res.ok) {
      const detalle = await res.text();
      throw new Error(`Error de Google Sheets (${res.status}): ${detalle.slice(0, 300)}`);
    }
    return res.json();
  }

  return {
    // Devuelve una matriz de celdas. Con formulas=true, las celdas con fórmula
    // devuelven la fórmula (así una fórmula que da '' no se toma por vacía).
    async leer(id, rango, { formulas = false } = {}) {
      const render = formulas ? 'FORMULA' : 'FORMATTED_VALUE';
      const url = `${API}/${id}/values/${encodeURIComponent(rango)}?valueRenderOption=${render}`;
      const datos = await pedir(url);
      return datos.values || [];
    },

    // Escribe valores tal cual (RAW): no interpreta fórmulas ni cambia formato.
    async escribir(id, cambios) {
      await pedir(`${API}/${id}/values:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({
          valueInputOption: 'RAW',
          data: cambios.map(({ rango, valores }) => ({ range: rango, values: valores }))
        })
      });
    },

    async agregarFila(id, hoja, fila) {
      const url = `${API}/${id}/values/${encodeURIComponent(hoja)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
      await pedir(url, { method: 'POST', body: JSON.stringify({ values: [fila] }) });
    }
  };
}
