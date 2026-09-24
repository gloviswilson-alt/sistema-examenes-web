// Ajustes y bloqueos guardados en Netlify Blobs.
import { getStore } from '@netlify/blobs';

const BLOQUEO_VENCE_MS = 60_000;

export function crearAlmacen() {
  const store = getStore({ name: 'panel', consistency: 'strong' });

  return {
    async leerAjustes() {
      return (await store.get('ajustes', { type: 'json' })) || {};
    },

    async guardarAjustes(ajustes) {
      await store.setJSON('ajustes', ajustes);
    },

    // Bloqueo exclusivo por clave. Usa escrituras condicionales de Blobs:
    // solo una llamada puede crear la clave. Un bloqueo de más de 60 s se
    // considera abandonado (la función murió) y se puede tomar.
    async bloquear(clave) {
      const nombre = `bloqueo/${clave}`;
      const ahora = Date.now();
      let r = await store.set(nombre, String(ahora), { onlyIfNew: true });
      if (typeof r?.modified !== 'boolean') {
        throw new Error('Netlify Blobs no soporta escrituras condicionales: no se puede bloquear el registro');
      }
      if (!r.modified) {
        const actual = await store.getWithMetadata(nombre);
        if (!actual || ahora - Number(actual.data) < BLOQUEO_VENCE_MS) return null;
        r = await store.set(nombre, String(ahora), { onlyIfMatch: actual.etag });
        if (!r.modified) return null;
      }
      return () => store.delete(nombre);
    }
  };
}
