// Lector óptico: encuentra en una foto los QR de las hojas y la burbuja marcada de cada una.
// Corre en el navegador (Chrome de Android trae BarcodeDetector): la foto nunca sale del teléfono.
// Regla: ante cualquier duda la hoja queda "no leída"; nunca se devuelve una nota dudosa.
(function () {
  const { G, RB, NOTA_MIN } = window.Hoja;
  const N = 21; // módulos del QR (versión 1)
  const LADO_MAX = 4000; // px del lado mayor con que se analiza la foto (12 MP sin reducir)

  // ---- Homografía (cuadrado del QR en mm → foto en px) ----
  function homografia(origen, destino) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = origen[i], [u, v] = destino[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    for (let c = 0; c < 8; c++) { // Gauss con pivoteo
      let p = c;
      for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      for (let r = 0; r < 8; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    const h = b.map((v, i) => v / A[i][i]);
    return (x, y) => {
      const w = h[6] * x + h[7] * y + 1;
      return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
    };
  }

  // ---- Imagen en escala de grises ----
  function grises(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const g = new Float32Array(width * height);
    for (let i = 0; i < g.length; i++) g[i] = 0.299 * data[4 * i] + 0.587 * data[4 * i + 1] + 0.114 * data[4 * i + 2];
    return { g, w: width, h: height };
  }
  const px = (im, x, y) => {
    const xi = Math.round(x), yi = Math.round(y);
    return xi < 0 || yi < 0 || xi >= im.w || yi >= im.h ? NaN : im.g[yi * im.w + xi];
  };

  // ---- Muestreo en la foto con una base local (ex, ey = vector de 1 mm en x e y de la hoja) ----
  function mediaAro(im, c, ex, ey, r) {
    let s = 0, n = 0;
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * 2 * Math.PI, ca = Math.cos(a) * r, sa = Math.sin(a) * r;
      const v = px(im, c[0] + ca * ex[0] + sa * ey[0], c[1] + ca * ex[1] + sa * ey[1]);
      if (!Number.isNaN(v)) { s += v; n++; }
    }
    return n > 30 ? s / n : NaN;
  }
  function mediaDisco(im, c, ex, ey, r) {
    let s = 0, n = 0;
    for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) {
      if (i * i + j * j > 36) continue;
      const dx = (i / 6) * r, dy = (j / 6) * r;
      const v = px(im, c[0] + dx * ex[0] + dy * ey[0], c[1] + dx * ex[1] + dy * ey[1]);
      if (!Number.isNaN(v)) { s += v; n++; }
    }
    return n > 80 ? s / n : NaN;
  }
  // Qué tanto parece haber un aro impreso centrado en c: papel claro justo afuera, línea oscura en el radio.
  const puntajeAro = (im, c, ex, ey) => mediaAro(im, c, ex, ey, RB.aro + 0.6) - mediaAro(im, c, ex, ey, RB.aro);
  const mover = (c, ex, ey, dx, dy) => [c[0] + dx * ex[0] + dy * ey[0], c[1] + dx * ex[1] + dy * ey[1]];

  // Busca el aro más cercano a `pred` (ventana de ±1,5 mm, de grueso a fino).
  function ajustarAro(im, pred, ex, ey) {
    let mejor = { c: pred, p: puntajeAro(im, pred, ex, ey) };
    for (const [ventana, paso] of [[1.5, 0.3], [0.3, 0.1]]) {
      const base = mejor.c;
      for (let dx = -ventana; dx <= ventana + 1e-9; dx += paso) for (let dy = -ventana; dy <= ventana + 1e-9; dy += paso) {
        const c = mover(base, ex, ey, dx, dy), p = puntajeAro(im, c, ex, ey);
        if (p > mejor.p) mejor = { c, p };
      }
    }
    return mejor;
  }

  // Las esquinas que entrega el detector pueden venir en cualquier orden y pueden ser las externas del QR
  // o los centros de sus patrones. Devuelve las ubicaciones posibles, de la más a la menos probable según
  // cuánto calzan los 3 patrones de posición (oscuros al centro); luego las burbujas deciden.
  function orientar(im, esquinas) {
    const m = G.lado / N, lado = G.lado, a = 3.5 * m, b = lado - 3.5 * m;
    const cuadros = [[[0, 0], [lado, 0], [lado, lado], [0, lado]], [[a, a], [b, a], [b, b], [a, b]]];
    const candidatas = [];
    for (const cuad of cuadros) for (const invertido of [false, true]) {
      const pts = invertido ? esquinas.slice().reverse() : esquinas;
      for (let k = 0; k < 4; k++) {
        const orden = pts.slice(k).concat(pts.slice(0, k)).map((p) => [p.x, p.y]);
        const H = homografia(cuad, orden);
        // Una foto nunca sale espejada: se descartan las orientaciones que invierten el giro
        // (los patrones del QR son simétricos respecto de su diagonal y no alcanzan para decidir).
        const [o, ex, ey] = [H(0, 0), H(lado, 0), H(0, lado)];
        if ((ex[0] - o[0]) * (ey[1] - o[1]) - (ex[1] - o[1]) * (ey[0] - o[0]) <= 0) continue;
        const centro = (c, f) => px(im, ...H((c + 0.5) * m, (f + 0.5) * m));
        // centro de cada patrón oscuro, su anillo claro (a 2 módulos) y la esquina sin patrón
        const oscuro = [[3, 3], [N - 4, 3], [3, N - 4]].map(([c, f]) => centro(c, f));
        const claro = [[3, 1], [N - 4, 1], [1, N - 4]].map(([c, f]) => centro(c, f));
        const puntaje = claro.reduce((a, v) => a + v, 0) - oscuro.reduce((a, v) => a + v, 0);
        if (puntaje > 150) candidatas.push({ puntaje, H });
      }
    }
    return candidatas.sort((a, b) => b.puntaje - a.puntaje).slice(0, 3).map((c) => c.H);
  }

  // Recorre una fila de burbujas de aro en aro: parte de la primera (cerca del QR, donde la posición
  // calculada es confiable) y predice cada siguiente con el paso medido en las anteriores, así el
  // error no se acumula. Devuelve los 22 centros o null si la fila no cuadra.
  function recorrerFila(im, H, fila, umbral) {
    const b0 = [G.x0, G.filas[fila]];
    const origen = H(b0[0], b0[1]);
    const ex = ((q) => [(q[0] - origen[0]), (q[1] - origen[1])])(H(b0[0] + 1, b0[1]));
    const ey = ((q) => [(q[0] - origen[0]), (q[1] - origen[1])])(H(b0[0], b0[1] + 1));
    const centros = [], puntajes = [];
    let pasoV = [ex[0] * G.paso, ex[1] * G.paso];
    let pred = origen;
    for (let k = 0; k < 22; k++) {
      const a = ajustarAro(im, pred, ex, ey);
      if (!(a.p > umbral) && k === 0) return { falla: "no veo la primera burbuja" }; // sin ella no hay ancla
      // Una burbuja rellena puede no mostrar su aro: se usa la posición predicha.
      const c = a.p > umbral ? a.c : pred;
      centros.push(c); puntajes.push(a.p);
      if (k >= 1) { // paso medido, suavizado
        const med = [(c[0] - centros[k - 1][0]), (c[1] - centros[k - 1][1])];
        pasoV = [0.6 * pasoV[0] + 0.4 * med[0], 0.6 * pasoV[1] + 0.4 * med[1]];
      }
      pred = [c[0] + pasoV[0], c[1] + pasoV[1]];
    }
    // Controles: la primera quedó cerca de donde la ubica el QR (la vecina está a 5,9 mm), casi todos los
    // aros vistos, pasos parejos y ningún aro después de la última (ahí solo hay papel).
    const vistos = puntajes.filter((p) => p > umbral).length;
    const pasos = centros.slice(1).map((c, k) => Math.hypot(c[0] - centros[k][0], c[1] - centros[k][1]));
    const medio = pasos.slice().sort((a, b) => a - b)[10];
    const parejos = pasos.every((d) => Math.abs(d - medio) < 0.18 * medio);
    const escala = Math.hypot(ex[0], ex[1]);
    const desvioPrimera = Math.hypot(centros[0][0] - origen[0], centros[0][1] - origen[1]) / escala;
    const despues = puntajeAro(im, [centros[21][0] + pasoV[0], centros[21][1] + pasoV[1]], ex, ey);
    const falla = vistos < 19 ? "solo veo " + vistos + " de 22 aros" : !parejos ? "aros desparejos"
      : desvioPrimera > 1.2 ? "la primera no está donde indica el QR" : despues > umbral ? "hay un aro después de la última" : null;
    return { centros, ex, ey, falla };
  }

  // Lee la franja de una hoja: devuelve { nota } o { motivo } si no hay certeza.
  function leerBurbujas(im, H) {
    const m = G.lado / N;
    const negro = px(im, ...H(3.5 * m, 3.5 * m)); // centro de un patrón del QR
    const papel = px(im, ...H(G.lado + 0.7, G.filas[0])); // entre el QR y la burbuja 2
    if (!(papel - negro > 40)) return { geometria: true, motivo: "Foto con poco contraste u oscura" };
    const umbral = 0.12 * (papel - negro);
    const filas = [recorrerFila(im, H, 0, umbral), recorrerFila(im, H, 1, umbral)];
    const falla = filas.map((f, i) => (f.falla ? "fila " + (i + 1) + ": " + f.falla : "")).filter(Boolean).join("; ");
    if (falla) return { geometria: true, motivo: "No encuentro bien las burbujas (" + falla + ")", puntos: filas.flatMap((f) => f.centros || []) };
    const lecturas = [], puntos = [];
    filas.forEach(({ centros, ex, ey }, f) => centros.forEach((c, k) => {
      const afuera = mediaAro(im, c, ex, ey, RB.aro + 0.6); // papel alrededor: corrige la luz de cada zona
      const dentro = mediaDisco(im, c, ex, ey, G.radioLectura);
      lecturas.push({ n: NOTA_MIN + f * 22 + k, oscuro: (afuera - dentro) / afuera });
      puntos.push(c);
    }));
    if (lecturas.some((l) => Number.isNaN(l.oscuro))) return { geometria: true, motivo: "La franja no está completa en la foto", puntos };
    const orden = lecturas.slice().sort((a, b) => b.oscuro - a.oscuro);
    const [p, s] = orden;
    const fondo = orden[Math.floor(orden.length / 2)].oscuro; // una burbuja típica sin marcar (con su número)
    if (p.oscuro - fondo < 0.25) return { motivo: "No hay ninguna burbuja marcada", puntos };
    if (s.oscuro - fondo > 0.4 * (p.oscuro - fondo)) return { motivo: "Hay más de una burbuja marcada (" + p.n + " y " + s.n + ")", puntos };
    return { nota: p.n, seguridad: +(1 - (s.oscuro - fondo) / (p.oscuro - fondo)).toFixed(2), puntos };
  }

  // QR de la hoja: EX001-14658181-01A
  function interpretarQR(texto) {
    const m = /^(EX\d+)-([0-9A-Z]+)-(\d{2})([ABCD])$/.exec(String(texto).trim());
    return m ? { id_examen: m[1], carnet: m[2], numero: Number(m[3]), forma: m[4] } : null;
  }

  async function aCanvas(archivo) {
    const bmp = await createImageBitmap(archivo);
    const k = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return c;
  }

  // Lee todas las hojas de una foto (archivo o canvas). Devuelve [{ qr, nota | motivo, esquinas, puntos }].
  async function leerFoto(fuente) {
    if (!("BarcodeDetector" in window)) throw new Error("Este navegador no puede leer QR. Usa Chrome en Android.");
    const canvas = fuente instanceof HTMLCanvasElement ? fuente : await aCanvas(fuente);
    const im = grises(canvas);
    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    const codigos = await detector.detect(canvas);
    const vistos = new Set();
    const hojas = [];
    for (const c of codigos) {
      if (vistos.has(c.rawValue)) continue;
      vistos.add(c.rawValue);
      const qr = interpretarQR(c.rawValue);
      if (!qr) { hojas.push({ texto: c.rawValue, motivo: "El QR no es de una hoja de examen", esquinas: c.cornerPoints }); continue; }
      const candidatas = c.cornerPoints && c.cornerPoints.length === 4 ? orientar(im, c.cornerPoints) : [];
      if (!candidatas.length) { hojas.push({ qr, motivo: "No pude ubicar bien el QR", esquinas: c.cornerPoints }); continue; }
      // Vale la primera ubicación con la que las 44 burbujas aparecen donde deben (si no, ninguna).
      const intentos = candidatas.map((H) => leerBurbujas(im, H));
      const r = intentos.find((x) => !x.geometria) || intentos[0];
      hojas.push({ qr, ...r, esquinas: c.cornerPoints });
    }
    return { hojas, canvas };
  }

  // Dibuja sobre la foto lo que vio el lector (modo diagnóstico).
  function dibujarDiagnostico(canvas, hojas) {
    const ctx = canvas.getContext("2d");
    ctx.lineWidth = Math.max(2, canvas.width / 800);
    for (const h of hojas) {
      const ok = h.nota !== undefined;
      ctx.strokeStyle = ok ? "#1f9d55" : "#d64545";
      if (h.esquinas) { ctx.beginPath(); h.esquinas.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.stroke(); }
      (h.puntos || []).forEach(([x, y], i) => {
        ctx.beginPath(); ctx.arc(x, y, ctx.lineWidth * 3, 0, 2 * Math.PI);
        ctx.fillStyle = ok && i + NOTA_MIN === h.nota ? "#1f9d55" : "rgba(214,69,69,.55)"; ctx.fill();
      });
    }
  }

  window.Lector = { leerFoto, dibujarDiagnostico, interpretarQR, homografia };
})();
