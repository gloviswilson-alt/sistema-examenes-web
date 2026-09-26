// IDs de las hojas de Google (la parte de la URL entre /d/ y /edit).
// Un ID solo no da acceso: cada hoja está compartida únicamente con la cuenta de servicio.
// Los registros apuntan a los REGISTROS REALES del profesor (Google Sheets desde el 26/09/2026; antes se probó
// con copias "_con_CI" en la carpeta del sistema).
export const HOJAS = {
  sistema: '1mG2lSPcX-rEzRoo8Bj5GwuDbkw3F47ymY64ugIK1Vz0', // documento_del_sistema
  // true solo si los registros de abajo fueran copias de prueba (el panel lo avisa al abrirlos).
  registrosSonCopias: false,
  registros: {
    '6A': '1P54anVIP4Y2m7HyyBTghjNrtnJdw9zLltafpUiH6Gg0', // 6A (real)
    '6B': '1vKrjbAwqWHctMtPHYRbx0FFK6QrLKMlCQorXsWhmb4I', // 6B (real)
    '2A': '11xaqEPYzT2fWJxEk1_Qk8jVgfcW9VXwRxwk9TJyBkhM', // 2A (real)
    '2B': '1sSNmu0uUY8i9RRgdWwFO-AdOtmYvvsh9aHkKj-ymEVQ'  // 2B (real)
  }
};
