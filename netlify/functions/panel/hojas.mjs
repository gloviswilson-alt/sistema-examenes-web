// IDs de las hojas de Google (la parte de la URL entre /d/ y /edit).
// Un ID solo no da acceso: cada hoja está compartida únicamente con la cuenta de servicio.
// Los registros apuntan primero a COPIAS; el real se pone recién cuando la copia funcione.
export const HOJAS = {
  sistema: '1mG2lSPcX-rEzRoo8Bj5GwuDbkw3F47ymY64ugIK1Vz0', // documento_del_sistema
  // COPIAS de prueba (carpeta del sistema), convertidas desde *_con_CI.xlsx el 24/09/2026.
  registros: {
    '6A': '1IUdItMoHEH2Z2x-qGggDObNOdFSqqwxNPX--wwCri2w', // 6A_con_CI (1)
    '6B': '1OVEvyPbd5MFOaqNuvZDvFi16g5vfoP0vGcPJe7uvTXw', // 6B_con_CI
    '2A': '1Bu1KM82robTEZmuO7kyyzPH2_BG0sbFYs24ONobuMFg', // 2A_con_CI
    '2B': '1Vh5RI0SAy0hDYX8OYp08XhOP21Yy1O7bHkRXWXbYnqE'  // 2B_con_CI
  }
};
