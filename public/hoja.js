// Hoja impresa del examen: geometría de la franja (QR + burbujas) y generador de QR.
// La impresión y el lector óptico usan estas mismas constantes: no se tocan por separado.
(function () {
  // Milímetros desde la esquina superior izquierda del QR (geometría medida en papel).
  // x0 y filas: centros de las burbujas; paso: distancia entre centros; RB.aro: radio del círculo impreso.
  const G = { lado: 15.08, x0: 18.73, paso: 5.93, filas: [5.82, 11.77], radioLectura: 1.2 };
  const RB = { aro: 2.25, fuera: 3.1 };
  const NOTA_MIN = 2, NOTA_MAX = 45, POR_FILA = 22;

  // Centro (mm, desde la esquina del QR) de la burbuja de una nota.
  function burbuja(nota) {
    const i = nota - NOTA_MIN;
    return { x: G.x0 + (i % POR_FILA) * G.paso, y: G.filas[Math.floor(i / POR_FILA)] };
  }

  // Contenido del QR: examen, carnet, número de lista (2 cifras) y forma. Ej.: EX001-14658181-01A
  const textoQR = (idExamen, carnet, numero, forma) =>
    idExamen + "-" + carnet + "-" + String(numero).padStart(2, "0") + forma;

  // ---- Respuesta correcta: posición y signo ----
  // Signo al final del enunciado según la letra de la respuesta correcta (clave para el profesor).
  const SIGNOS = { A: ".", B: ",", C: ":", D: "" };
  // Letra de la respuesta correcta de cada pregunta en una forma: A, B, C y D repartidas en partes
  // iguales y barajadas. Depende solo del examen y la forma, así "Imprimir de nuevo" sale idéntico.
  // (El banco puede traer la correcta siempre en la misma letra; aquí no importa.)
  function letrasCorrectas(idExamen, forma, n) {
    let h = 2166136261; // FNV-1a de "EX001-A" → semilla del azar
    for (const c of idExamen + "-" + forma) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    const azar = () => { h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
    const letras = Array.from({ length: n }, (_, i) => "ABCD"[i % 4]);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [letras[i], letras[j]] = [letras[j], letras[i]]; }
    return letras;
  }

  // ---- QR versión 1 (21×21), modo alfanumérico ----
  const ALFA = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
  // Nivel de corrección → [bits del formato, palabras de datos, palabras de corrección] (versión 1).
  const NIVELES = { M: [0, 16, 10], L: [1, 19, 7] };

  const EXP = new Array(512), LOG = new Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

  function correccion(datos, n) {
    let gen = [1];
    for (let i = 0; i < n; i++) {
      const sig = new Array(gen.length + 1).fill(0);
      gen.forEach((c, j) => { sig[j] ^= c; sig[j + 1] ^= mul(c, EXP[i]); });
      gen = sig;
    }
    const r = datos.concat(new Array(n).fill(0));
    for (let i = 0; i < datos.length; i++) {
      const c = r[i];
      if (c) gen.forEach((g, j) => { r[i + j] ^= mul(g, c); });
    }
    return r.slice(datos.length);
  }

  function palabras(texto, nDatos) {
    const bits = [];
    const poner = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };
    poner(2, 4); poner(texto.length, 9);
    for (let i = 0; i < texto.length; i += 2) {
      const a = ALFA.indexOf(texto[i]);
      if (i + 1 < texto.length) poner(a * 45 + ALFA.indexOf(texto[i + 1]), 11); else poner(a, 6);
    }
    poner(0, Math.min(4, nDatos * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    const out = [];
    for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(""), 2));
    for (let k = 0; out.length < nDatos; k++) out.push(k % 2 ? 0x11 : 0xec);
    return out;
  }

  const MASCARAS = [
    (r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
  ];

  function bitsFormato(nivel, mascara) {
    const d = (NIVELES[nivel][0] << 3) | mascara;
    let r = d << 10;
    for (let i = 14; i >= 10; i--) if ((r >> i) & 1) r ^= 0x537 << (i - 10);
    return ((d << 10) | r) ^ 0x5412;
  }

  function penalizacion(m) {
    const N = m.length; let p = 0;
    for (let eje = 0; eje < 2; eje++) {
      for (let i = 0; i < N; i++) {
        let largo = 1;
        for (let j = 1; j <= N; j++) {
          const igual = j < N && (eje ? m[j][i] : m[i][j]) === (eje ? m[j - 1][i] : m[i][j - 1]);
          if (igual) largo++; else { if (largo >= 5) p += largo - 2; largo = 1; }
        }
        const linea = Array.from({ length: N }, (_, j) => (eje ? m[j][i] : m[i][j])).join("");
        for (const pat of ["10111010000", "00001011101"]) for (let k = linea.indexOf(pat); k >= 0; k = linea.indexOf(pat, k + 1)) p += 40;
      }
    }
    for (let i = 0; i < N - 1; i++) for (let j = 0; j < N - 1; j++) {
      const s = m[i][j] + m[i + 1][j] + m[i][j + 1] + m[i + 1][j + 1];
      if (s === 0 || s === 4) p += 3;
    }
    const oscuros = m.flat().reduce((a, b) => a + b, 0);
    return p + Math.floor(Math.abs(oscuros * 20 - N * N * 10) / (N * N)) * 10;
  }

  // Devuelve la matriz 21×21 (1 = módulo negro). Usa nivel M si el texto cabe; si no, L.
  function matrizQR(texto) {
    if (/[^0-9A-Z $%*+\-./:]/.test(texto)) throw new Error("El QR solo admite mayúsculas, números y - . / :");
    const nivel = texto.length <= 20 ? "M" : texto.length <= 25 ? "L" : null;
    if (!nivel) throw new Error("El texto del QR es demasiado largo: " + texto);
    const [, nDatos, nCorr] = NIVELES[nivel];
    const datos = palabras(texto, nDatos);
    const todo = datos.concat(correccion(datos, nCorr));
    const N = 21, base = Array.from({ length: N }, () => new Array(N).fill(0));
    const fija = Array.from({ length: N }, () => new Array(N).fill(false));
    const poner = (r, c, v) => { if (r >= 0 && r < N && c >= 0 && c < N) { base[r][c] = v; fija[r][c] = true; } };
    for (const [r0, c0] of [[0, 0], [0, N - 7], [N - 7, 0]]) {
      for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
        const borde = r === 0 || r === 6 || c === 0 || c === 6, centro = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        poner(r0 + r, c0 + c, r >= 0 && r <= 6 && c >= 0 && c <= 6 && (borde || centro) ? 1 : 0);
      }
    }
    for (let i = 8; i < N - 8; i++) { poner(6, i, i % 2 ? 0 : 1); poner(i, 6, i % 2 ? 0 : 1); }
    for (let i = 0; i < 9; i++) { fija[8][i] = fija[i][8] = true; }
    for (let i = 0; i < 8; i++) { fija[8][N - 1 - i] = fija[N - 1 - i][8] = true; }
    poner(N - 8, 8, 1);

    const bits = todo.flatMap((b) => Array.from({ length: 8 }, (_, i) => (b >> (7 - i)) & 1));
    const libres = [];
    for (let c = N - 1, subir = true; c > 0; c -= 2, subir = !subir) {
      if (c === 6) c--;
      for (let k = 0; k < N; k++) {
        const r = subir ? N - 1 - k : k;
        for (const cc of [c, c - 1]) if (!fija[r][cc]) libres.push([r, cc]);
      }
    }

    let mejor = null;
    MASCARAS.forEach((f, mascara) => {
      const m = base.map((fila) => fila.slice());
      libres.forEach(([r, c], i) => { m[r][c] = (bits[i] || 0) ^ (f(r, c) ? 1 : 0); });
      const fmt = bitsFormato(nivel, mascara);
      for (let i = 0; i < 15; i++) {
        const b = (fmt >> i) & 1;
        const a = i < 6 ? [i, 8] : i < 8 ? [i + 1, 8] : [N - 15 + i, 8];
        m[a[0]][a[1]] = b;
        const d = i < 8 ? [8, N - 1 - i] : [8, i < 9 ? 7 : 14 - i];
        m[d[0]][d[1]] = b;
      }
      const p = penalizacion(m);
      if (!mejor || p < mejor.p) mejor = { p, m };
    });
    return mejor.m;
  }

  // SVG del QR, con el lado exacto en milímetros.
  function svgQR(texto, ladoMM) {
    const m = matrizQR(texto), N = m.length;
    let d = "";
    m.forEach((fila, r) => fila.forEach((v, c) => { if (v) d += "M" + c + " " + r + "h1v1h-1z"; }));
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + N + " " + N + '" width="' + ladoMM + 'mm" height="' + ladoMM +
      'mm" shape-rendering="crispEdges" style="display:block"><rect width="' + N + '" height="' + N + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }

  // ---- Hojas para imprimir (tamaño carta, escala exacta) ----
  const LINEAS = { sin: 0, "pequeño": 3, grande: 10 };
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  // El registro guarda los nombres en mayúsculas; en la hoja van como en el diseño: "Alpire Flores Maria Rene".
  const PARTICULAS = ["de", "del", "la", "las", "los", "y"];
  const nombrePropio = (t) => String(t || "").toLowerCase().split(/\s+/).filter(Boolean)
    .map((w, i) => (i && PARTICULAS.includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
  const cursoCorto = (nivel, par) => (nivel === "Sexto" ? "6to " : "2do ") + par;
  const fechaCorta = (iso) => { const p = String(iso || "").split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : String(iso || ""); };

  const CSS = `
@page { size: letter; margin: 0 }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact }
html, body { margin: 0; background: #fff }
.pag { width: 215.9mm; height: 279.4mm; padding: 5mm 12.7mm 6mm; display: flex; flex-direction: column;
  color: #1B211E; font-family: Archivo, system-ui, sans-serif; break-after: page; overflow: hidden; position: relative }
.pag:last-child { break-after: auto }
.franja { position: relative; height: ${G.lado}mm; flex: none }
.qr { position: absolute; left: 0; top: 0 }
.uso { position: absolute; left: ${(G.x0 - RB.aro).toFixed(2)}mm; top: 0.3mm; font-size: 6px; letter-spacing: .22em; text-transform: uppercase; color: #98A099; white-space: nowrap }
.bur { position: absolute; width: ${RB.aro * 2}mm; height: ${RB.aro * 2}mm; border: 0.26mm solid #5F6B64; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; font-size: 9px; line-height: 1; color: #5F6B64; font-variant-numeric: tabular-nums }
.nota { position: absolute; right: 0; top: 0; width: 31.75mm; height: 34.29mm; background: #F0EDE4; border-radius: 2px;
  display: flex; align-items: flex-end; justify-content: space-between; padding: 6px 9px }
.nota b { font-size: 8.5px; font-weight: 600; letter-spacing: .2em; text-transform: uppercase; color: #17362F }
.nota span { font-size: 7.5px; color: #5F6B64 }
.titulo { margin-top: 4mm; padding: 0 36mm 7px 0; border-bottom: 3px solid #17362F }
.kicker { font-size: 8px; font-weight: 500; letter-spacing: .24em; text-transform: uppercase; color: #B08344; display: block; padding-top: 6px }
.nombre-ex { font-family: 'Instrument Serif', Georgia, serif; font-size: 46px; line-height: 1; color: #17362F; letter-spacing: -.012em }
.alumno { display: flex; justify-content: space-between; align-items: baseline; gap: 22px; padding: 7px 0 8px; border-bottom: 2.5px solid #A89C82 }
.alumno.cont { padding: 0 0 9px; border-bottom: 3px solid #17362F }
.alumno .n { font-family: 'Instrument Serif', Georgia, serif; font-size: 21px; line-height: 1.15 }
.alumno.cont .n { font-size: 18px }
.meta { font-size: 8px; font-weight: 500; white-space: nowrap; letter-spacing: .16em; text-transform: uppercase; color: #5F6B64 }
.cuerpo { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column }
.preg { display: flex; gap: 14px; margin-top: 15px }
.num { font-family: 'Instrument Serif', Georgia, serif; font-size: 19px; color: #B08344; min-width: 24px; line-height: 1.2 }
.enun { display: flex; justify-content: space-between; gap: 18px; align-items: baseline }
.enun span:first-child { font-family: Spectral, Georgia, serif; font-size: 14.5px; line-height: 1.5 }
.pts { font-size: 8px; font-weight: 500; white-space: nowrap; letter-spacing: .12em; text-transform: uppercase; color: #5F6B64 }
.ops { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 26px; margin-top: 10px }
.ops.una { grid-template-columns: 1fr }
.op { display: flex; align-items: flex-start; gap: 9px }
.op i { width: 18px; height: 18px; flex: none; border: 1px solid #DED7C7; border-radius: 50%; display: flex; align-items: center;
  justify-content: center; font-style: normal; font-size: 8.5px; font-weight: 500; color: #5F6B64; margin-top: 1px }
.op span { font-family: Spectral, Georgia, serif; font-size: 14px; line-height: 1.4 }
.lineas { display: flex; flex-direction: column; gap: 12px; margin-top: 12px }
.lineas div { border-bottom: 0.3mm solid #BDB6A6; height: 15px }
.firma { margin: auto 0 3mm auto; padding-top: 16mm; width: 75mm; text-align: center; flex: none }
.firma div { border-bottom: 0.3mm solid #5F6B64 }
.firma span { display: block; margin-top: 5px; font-size: 7.5px; font-weight: 500; letter-spacing: .2em; text-transform: uppercase; color: #5F6B64 }
.pie { margin-top: auto; padding-top: 8px; border-top: 1px solid #DED7C7; display: flex; justify-content: space-between; align-items: baseline; flex: none }
.pie span { font-size: 7.5px; font-weight: 500; white-space: nowrap; letter-spacing: .2em; text-transform: uppercase; color: #5F6B64 }`;

  function franja(qrTexto) {
    let h = '<div class="franja"><div class="qr">' + svgQR(qrTexto, G.lado) + '</div><span class="uso">Uso exclusivo del profesor</span>';
    for (let n = NOTA_MIN; n <= NOTA_MAX; n++) {
      const b = burbuja(n);
      h += '<span class="bur" style="left:' + (b.x - RB.aro).toFixed(2) + "mm;top:" + (b.y - RB.aro).toFixed(2) + 'mm">' + n + "</span>";
    }
    return h + '<div class="nota"><b>Nota</b><span>/45</span></div></div>';
  }

  // La opción correcta pasa a la letra `letra`; las demás conservan su orden.
  function bloquePregunta(n, p, forma, letra) {
    const f = p.formas[forma];
    const opciones = f.opciones.slice();
    opciones.splice("ABCD".indexOf(letra), 0, opciones.splice("ABCD".indexOf(f.clave), 1)[0]);
    const una = opciones.some((o) => String(o).length > 40);
    let h = '<div class="preg"><div class="num">' + String(n).padStart(2, "0") + '</div><div style="flex:1;min-width:0">' +
      '<div class="enun"><span>' + esc(f.enunciado + SIGNOS[letra]) + '</span><span class="pts">' + p.puntaje + ' pts</span></div><div class="ops' + (una ? " una" : "") + '">';
    opciones.forEach((o, i) => { h += '<div class="op"><i>' + "ABCD"[i] + "</i><span>" + esc(o) + "</span></div>"; });
    h += "</div>";
    const nl = LINEAS[p.espacio] || 0;
    if (nl) h += '<div class="lineas">' + "<div></div>".repeat(nl) + "</div>";
    return h + "</div></div>";
  }

  // Si queda espacio libre al pie de la página, la última pregunta (si lleva espacio para
  // resolver) recibe más líneas hasta llenarlo.
  function completarLineas(doc, cuerpo) {
    const pregs = cuerpo.querySelectorAll(".preg");
    const lineas = pregs.length && pregs[pregs.length - 1].querySelector(".lineas");
    if (!lineas) return;
    while (true) {
      lineas.appendChild(doc.createElement("div"));
      if (cuerpo.scrollHeight > cuerpo.clientHeight + 1) { lineas.lastElementChild.remove(); return; }
    }
  }

  // Arma las páginas de todos los alumnos dentro de `doc` (el documento de un iframe).
  // Cada alumno empieza en página nueva; si las preguntas no entran, sigue en otra página.
  function armar(doc, d) {
    const cuerpo = doc.body;
    cuerpo.innerHTML = "";
    const pagina = (html) => { const el = doc.createElement("section"); el.className = "pag"; el.innerHTML = html; cuerpo.appendChild(el); return el; };
    const pie = '<div class="pie"><span>' + esc(d.profesor) + '</span><span class="nro"></span></div>';
    for (const a of d.alumnos) {
      const forma = d.asignacion[a.carnet];
      const letras = letrasCorrectas(d.id, forma, d.preguntas.length);
      const fecha = fechaCorta(d.fecha) + (d.duracion ? " &nbsp;·&nbsp; " + esc(d.duracion) : "");
      const kicker = "U.E. Niño Jesús II · Matemática · " + cursoCorto(d.nivel, a.par) + " · " + esc(d.trimestre);
      const paginas = [pagina(franja(textoQR(d.id, a.carnet, a.numero, forma)) +
        '<div class="titulo"><span class="kicker">' + kicker + '</span><div class="nombre-ex">' + esc(d.nombre) + "</div></div>" +
        '<div class="alumno"><div class="n">' + esc(nombrePropio(a.nombre)) + '</div><span class="meta">C.I. ' + esc(a.carnet) + " &nbsp;·&nbsp; N.º " + a.numero + " &nbsp;·&nbsp; " + fecha + "</span></div>" +
        '<div class="cuerpo"></div>' + pie)];
      // Página siguiente con encabezado corto; devuelve su cuerpo.
      const continuar = () => {
        paginas.push(pagina('<div class="alumno cont"><div class="n">' + esc(nombrePropio(a.nombre)) + '</div><span class="meta">N.º ' + a.numero + " &nbsp;·&nbsp; " + fechaCorta(d.fecha) + "</span></div>" +
          '<div class="cuerpo"></div>' + pie));
        return paginas.at(-1).querySelector(".cuerpo");
      };
      d.preguntas.forEach((p, i) => {
        let dest = paginas.at(-1).querySelector(".cuerpo");
        dest.insertAdjacentHTML("beforeend", bloquePregunta(i + 1, p, forma, letras[i]));
        if (dest.scrollHeight > dest.clientHeight + 1 && dest.children.length > 1) continuar().appendChild(dest.lastElementChild);
      });
      // Espacio para la firma del estudiante al final del examen (abajo a la derecha de la última página).
      // Si no entra, la última pregunta pasa a una página nueva junto con la firma.
      const ultimo = paginas.at(-1).querySelector(".cuerpo");
      ultimo.insertAdjacentHTML("beforeend", '<div class="firma"><div></div><span>Firma del estudiante</span></div>');
      if (ultimo.scrollHeight > ultimo.clientHeight + 1 && ultimo.children.length > 2) continuar().append(...[...ultimo.children].slice(-2));
      paginas.forEach((pg, i) => {
        pg.querySelector(".nro").textContent = "Pág. " + (i + 1) + " de " + paginas.length;
        completarLineas(doc, pg.querySelector(".cuerpo"));
      });
    }
  }

  // Imprime las hojas desde un iframe oculto. Devuelve el número de páginas.
  async function imprimir(d) {
    let marco = document.getElementById("marco-impresion");
    if (marco) marco.remove();
    marco = document.createElement("iframe");
    marco.id = "marco-impresion";
    marco.style.cssText = "position:fixed;left:-10000px;top:0;width:216mm;height:280mm;border:0";
    document.body.appendChild(marco);
    const doc = marco.contentDocument;
    doc.open();
    doc.write('<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>' + esc(d.id + " · " + d.nombre) +
      '</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600&family=Instrument+Serif&family=Spectral&display=swap">' +
      "<style>" + CSS + "</style></head><body></body></html>");
    doc.close();
    // Las fuentes se piden recién cuando hay texto: se arma, se espera a que carguen y se vuelve a
    // armar para que el reparto en páginas se mida con las fuentes definitivas.
    const espera = (ms) => new Promise((r) => setTimeout(r, ms));
    const hoja = doc.querySelector("link");
    await Promise.race([new Promise((r) => { hoja.onload = hoja.onerror = r; }), espera(4000)]);
    armar(doc, d);
    await Promise.race([doc.fonts.ready, espera(6000)]);
    armar(doc, d);
    marco.contentWindow.focus();
    marco.contentWindow.print();
    return doc.querySelectorAll(".pag").length;
  }

  window.Hoja = { G, RB, NOTA_MIN, NOTA_MAX, burbuja, textoQR, matrizQR, svgQR, letrasCorrectas, armar, imprimir, CSS };
})();
