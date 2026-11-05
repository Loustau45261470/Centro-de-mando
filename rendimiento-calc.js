'use strict';
// ════════════════════════════════════════════════════════════════════════
// RENDIMIENTO COMO INVERSOR — cálculo PURO (sin DOM, sin red, sin `S`).
// Lo carga el navegador como script clásico (window.RendimientoCalc) y los tests lo hacen require() en Node.
//
// Todo se calcula en una moneda ('ARS' o 'USD' MEP). Cada flujo y cada valuación se convierte al MEP de SU fecha.
//
// Resultado total (identidad de valuación, no depende de que las operaciones estén completas):
//     Resultado = V_fin − V_0 − Σ aportes netos            (aportes = depósitos − retiros, convertidos al MEP de su fecha)
// Su descomposición (la que muestra el efecto "vender una posición +45% no baja el resultado"):
//     Realizado     = Σ ventas posteriores a la base: monto − costo promedio ponderado de lo vendido
//     No realizado  = valor actual de lo que se mantiene − costo de lo que se mantiene
//     Rentas        = dividendos + rentas + amortizaciones cobradas (+ cobros cargados a mano)
//     Comisiones    = aranceles/derechos de las operaciones
//     Otros         = Resultado − (Realizado + No realizado + Rentas − Comisiones)   → efecto cambiario del efectivo,
//                     operaciones/aportes sin cargar, diferencias de redondeo. Si es grande se avisa.
// El costo de las unidades de la base es el PRECIO DE CIERRE del día base (no el precio al que se compraron);
// el de las compras posteriores, el monto pagado. Costo promedio ponderado por símbolo.
//
// Rendimiento %:
//   TWR  ≈ Modified Dietz sobre TODO el período (no encadenado: no hay valuaciones intermedias):
//          R = (V_fin − V_0 − F) / (V_0 + Σ w_i · F_i),  w_i = (T − t_i) / T,  F_i = aporte(+) / retiro(−)
//   TIR  = XIRR de los flujos: −V_0 en la base, −F_i en cada fecha, +V_fin hoy (base 365 días). Se muestra la TIR del
//          período = (1 + r_anual)^(días/365) − 1 (no anualizada) y, con 90+ días, la anualizada.
// ════════════════════════════════════════════════════════════════════════
(function (root) {
  const MS_DIA = 86400000;
  const EPS = 1e-9;

  const esNum = v => typeof v === 'number' && isFinite(v);
  const num = v => (v == null || v === '' || isNaN(v)) ? null : Number(v);

  // Bonos, letras y ONs: la cantidad está en nominales y IOL cotiza por lote de 100 → precio unitario = precio / 100.
  const esLote100 = tipo => /^(tit|letra|ons?\b|obligac|bono)/i.test(String(tipo == null ? '' : tipo).trim());
  const factorPrecio = tipo => esLote100(tipo) ? 0.01 : 1;

  const diaNum = s => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / MS_DIA : NaN;
  };
  const dias = (a, b) => diaNum(b) - diaNum(a);
  const diasEnMes = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m = 1..12

  // Último valor de la serie con fecha <= la pedida (serie ascendente por fecha). null si no hay.
  function valorEn(serie, fecha, campo) {
    if (!Array.isArray(serie) || !serie.length) return null;
    let res = null;
    for (const r of serie) { if (r && r.fecha <= fecha) res = r; else if (r && r.fecha > fecha) break; }
    return res ? num(res[campo]) : null;
  }

  // mep = { serie:[{fecha, venta}], actual?:{fecha, venta} } → fecha => MEP (ARS por USD) o null
  function construirMep(mep) {
    const serie = mep && Array.isArray(mep.serie) ? mep.serie.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : 1)) : [];
    const act = mep && mep.actual && esNum(num(mep.actual.venta)) ? mep.actual : null;
    return fecha => {
      if (act && fecha >= act.fecha) return num(act.venta);
      return valorEn(serie, fecha, 'venta');
    };
  }

  // ── Operaciones posteriores a la base ──
  // Una operación es posterior si su fecha es mayor que la de la base; el mismo día solo cuenta si hay hora en ambos lados
  // y la operación es posterior al momento en que se tomó la base (las de IOL vienen sin zona: hora de Argentina, -03:00).
  function aMs(s) {
    if (!s) return NaN;
    const t = String(s);
    return Date.parse(/(Z|[+-]\d{2}:?\d{2})$/.test(t) ? t : t + '-03:00');
  }
  function filtrarOperaciones(ops, base) {
    const tomada = aMs(base && base.tomadoEn);
    return (Array.isArray(ops) ? ops : []).filter(o => {
      if (!o || !o.fecha) return false;
      if (o.fecha > base.fecha) return true;
      if (o.fecha < base.fecha) return false;
      const t = aMs(o.fechaHora);
      return isFinite(t) && isFinite(tomada) && t > tomada;
    });
  }

  // ── TIR (XIRR) ──
  // flujos: [{ dia (días desde la base), monto }] con convención de inversor: aportes negativos, rescate final positivo.
  // Resuelve el RENDIMIENTO DEL PERÍODO y (log-crecimiento total) por bisección: f(y) = Σ monto · exp(−y · dia / T).
  function xirr(flujos, diasTotal) {
    if (!(diasTotal > 0) || !Array.isArray(flujos) || flujos.length < 2) return null;
    const tieneNeg = flujos.some(f => f.monto < 0), tienePos = flujos.some(f => f.monto > 0);
    if (!tieneNeg || !tienePos) return null;
    const f = y => flujos.reduce((a, c) => a + c.monto * Math.exp(-y * c.dia / diasTotal), 0);
    let lo = -20, hi = 20, flo = f(lo), fhi = f(hi);
    if (!(flo > 0 && fhi < 0)) return null;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2, fm = f(mid);
      if (fm > 0) lo = mid; else hi = mid;
      if (hi - lo < 1e-14) break;
    }
    const y = (lo + hi) / 2;
    return { periodo: Math.exp(y) - 1, anual: Math.exp(y * 365 / diasTotal) - 1 };
  }

  // ── Modified Dietz ──
  // flujos: [{ dia, monto }] con monto + = aporte, − = retiro. Devuelve null si el denominador no es positivo.
  function modifiedDietz(v0, vFin, flujos, diasTotal) {
    const F = flujos.reduce((a, c) => a + c.monto, 0);
    const T = diasTotal > 0 ? diasTotal : 0;
    const ponderado = flujos.reduce((a, c) => a + c.monto * (T > 0 ? (T - c.dia) / T : 0), 0);
    const den = v0 + ponderado;
    if (!(den > EPS)) return null;
    return (vFin - v0 - F) / den;
  }

  // ── Motor principal ──
  // inp = { base:{fecha, tomadoEn?, posiciones:[{simbolo,tipo,cantidad,precioBase?,precioIntradia?}], efectivo:{ARS,USD}},
  //         operaciones:[{numero,fecha,fechaHora?,tipo,simbolo,cantidad,monto,comision,moneda}],
  //         actual:{fecha, posiciones:[{simbolo,cantidad,valorizado}], efectivo:{ARS,USD}},
  //         flujos:[{id,fecha,tipo:'aporte'|'retiro'|'cobro',monto,moneda}], mep, moneda:'ARS'|'USD' }
  function calcular(inp) {
    const moneda = inp.moneda === 'USD' ? 'USD' : 'ARS';
    const base = inp.base, actual = inp.actual;
    const mepFn = construirMep(inp.mep);
    const mepDe = fecha => {
      const v = mepFn(fecha);
      if (!(v > 0)) throw new Error('Falta el dólar MEP del ' + fecha);
      return v;
    };
    // Convierte un monto en ARS (de esa fecha) a la moneda de la vista.
    const cv = (fecha, ars) => moneda === 'ARS' ? ars : ars / mepDe(fecha);
    // Un monto en su moneda original → ARS al MEP de su fecha.
    const aArs = (fecha, monto, mon) => /USD|dolar/i.test(String(mon || '')) ? monto * mepDe(fecha) : monto;
    const adv = [];
    const aviso = (codigo, texto) => adv.push({ codigo, texto });

    // Valor de la base (ARS) y costo de cada símbolo.
    const lotes = new Map();
    let valorPosBase = 0, aproxBase = 0;
    for (const p of base.posiciones || []) {
      const cant = num(p.cantidad) || 0;
      let precio = num(p.precioBase);
      if (precio == null) { precio = num(p.precioIntradia); if (precio != null) aproxBase++; }
      if (precio == null) { aviso('sin-precio-base', 'Sin precio base de ' + p.simbolo + ': se lo toma a cero.'); precio = 0; }
      const valor = cant * precio * factorPrecio(p.tipo);
      valorPosBase += valor;
      lotes.set(p.simbolo, { qty: cant, cost: cv(base.fecha, valor), tipo: p.tipo });
    }
    if (aproxBase) aviso('base-aprox', aproxBase + ' posición(es) de la base están valuadas al precio intradía, no al cierre (aprox.).');
    const efB = base.efectivo || {};
    const cashBaseArs = (num(efB.ARS) || 0) + ((num(efB.USD) || 0) ? (num(efB.USD) || 0) * mepDe(base.fecha) : 0);
    const v0 = cv(base.fecha, valorPosBase + cashBaseArs);

    // Valor actual.
    const hoy = inp.hoy || actual.fecha;
    let valorPosAct = 0;
    for (const p of actual.posiciones || []) valorPosAct += num(p.valorizado) || 0;
    const efA = actual.efectivo;
    if (!efA) aviso('sin-efectivo', 'No llegó el efectivo actual de la cuenta: se lo toma a cero y el resultado puede quedar subestimado.');
    const cashActArs = efA ? (num(efA.ARS) || 0) + ((num(efA.USD) || 0) ? (num(efA.USD) || 0) * mepDe(hoy) : 0) : 0;
    const vFin = cv(hoy, valorPosAct + cashActArs);

    // Operaciones.
    const ops = filtrarOperaciones(inp.operaciones, base).slice()
      .sort((a, b) => ((a.fechaHora || a.fecha) < (b.fechaHora || b.fecha) ? -1 : (a.fechaHora || a.fecha) > (b.fechaHora || b.fecha) ? 1 : (num(a.numero) || 0) - (num(b.numero) || 0)));
    let realizado = 0, rentas = 0, comisiones = 0, sinComision = 0, otrosTipos = 0;
    const ventas = [];
    for (const o of ops) {
      const monto = num(o.monto);
      const comision = num(o.comision);
      if (o.tipo === 'compra' || o.tipo === 'venta') {
        if (comision != null) comisiones += cv(o.fecha, aArs(o.fecha, comision, o.moneda)); else sinComision++;
      }
      if (o.tipo === 'compra') {
        const q = num(o.cantidad) || 0;
        if (monto == null) { aviso('op-sin-monto', 'Compra de ' + o.simbolo + ' sin monto: no se pudo valuar.'); continue; }
        const l = lotes.get(o.simbolo) || { qty: 0, cost: 0 };
        l.qty += q; l.cost += cv(o.fecha, aArs(o.fecha, monto, o.moneda));
        lotes.set(o.simbolo, l);
      } else if (o.tipo === 'venta') {
        const q = num(o.cantidad) || 0;
        if (monto == null) { aviso('op-sin-monto', 'Venta de ' + o.simbolo + ' sin monto: no se pudo valuar.'); continue; }
        const l = lotes.get(o.simbolo) || { qty: 0, cost: 0 };
        const ingreso = cv(o.fecha, aArs(o.fecha, monto, o.moneda));
        const conCosto = Math.min(q, Math.max(l.qty, 0));
        const costoUnit = l.qty > EPS ? l.cost / l.qty : 0;
        let costo = costoUnit * conCosto;
        if (q - conCosto > EPS) {
          // Se vendió más de lo que hay registrado desde la base: el excedente no tiene costo conocido → sin ganancia.
          costo += ingreso * ((q - conCosto) / q);
          aviso('venta-sin-costo', 'Venta de ' + o.simbolo + ': ' + (q - conCosto) + ' unidades sin costo conocido (se toman sin ganancia).');
        }
        const gan = ingreso - costo;
        realizado += gan;
        l.qty -= conCosto; l.cost -= costoUnit * conCosto;
        if (l.qty <= EPS) { l.qty = 0; l.cost = 0; }
        lotes.set(o.simbolo, l);
        ventas.push({ fecha: o.fecha, simbolo: o.simbolo, cantidad: q, monto: ingreso, costo, ganancia: gan, pct: costo > EPS ? gan / costo : null });
      } else if (o.tipo === 'dividendo' || o.tipo === 'renta' || o.tipo === 'amortizacion') {
        if (monto == null) { aviso('op-sin-monto', 'Cobro de ' + o.simbolo + ' sin monto.'); continue; }
        rentas += cv(o.fecha, aArs(o.fecha, monto, o.moneda));
      } else otrosTipos++;
    }
    if (sinComision) aviso('comision-parcial', sinComision + ' operación(es) sin dato de comisión: las comisiones pueden estar subestimadas.');
    if (otrosTipos) aviso('tipos-ignorados', otrosTipos + ' movimiento(s) de un tipo que no se computa (ni compra, ni venta, ni cobro).');

    // Flujos externos (aportes/retiros) y cobros cargados a mano, posteriores a la base.
    const flujosEx = [];
    for (const f of inp.flujos || []) {
      if (!f || !(num(f.monto) > 0) || !(f.fecha > base.fecha) || f.fecha > hoy) continue;
      const ars = aArs(f.fecha, num(f.monto), f.moneda);
      const c = cv(f.fecha, ars);
      if (f.tipo === 'cobro') rentas += c;
      else if (f.tipo === 'aporte') flujosEx.push({ fecha: f.fecha, dia: dias(base.fecha, f.fecha), monto: c });
      else if (f.tipo === 'retiro') flujosEx.push({ fecha: f.fecha, dia: dias(base.fecha, f.fecha), monto: -c });
    }
    const F = flujosEx.reduce((a, c) => a + c.monto, 0);

    // No realizado: valor actual de lo que se mantiene − su costo.
    let noRealizado = 0;
    const posAct = new Map((actual.posiciones || []).map(p => [p.simbolo, p]));
    for (const [sim, p] of posAct) {
      const val = cv(hoy, num(p.valorizado) || 0);
      const l = lotes.get(sim);
      let costo;
      if (!l || l.qty <= EPS) {
        costo = val;
        aviso('sin-costo', sim + ': no hay costo registrado desde la base (se toma sin ganancia ni pérdida).');
      } else {
        const cantAct = num(p.cantidad);
        if (cantAct != null && Math.abs(cantAct - l.qty) > 1e-6 * Math.max(1, l.qty)) {
          aviso('cantidad-distinta', sim + ': la cantidad actual (' + cantAct + ') no coincide con la base más las operaciones (' + l.qty + ').');
          costo = l.cost * (cantAct / l.qty);
        } else costo = l.cost;
      }
      noRealizado += val - costo;
    }
    for (const [sim, l] of lotes) {
      if (l.qty > EPS && !posAct.has(sim)) aviso('sin-posicion', sim + ': figura en la base pero ya no está en la cartera y no hay una venta registrada.');
    }

    const resultado = vFin - v0 - F;
    const otros = resultado - (realizado + noRealizado + rentas - comisiones);
    const tol = Math.max(Math.abs(v0) * 0.005, 1e-6);
    if (Math.abs(otros) > tol) {
      aviso('descuadre', 'El resultado no se explica del todo con las operaciones cargadas (diferencia de ' + otros.toFixed(2) + '): puede faltar un aporte, un retiro, un cobro o el efecto del dólar sobre el efectivo.');
    }

    // Rendimiento.
    const dTot = Math.max(dias(base.fecha, hoy), 0);
    const flujosDietz = flujosEx.map(f => ({ dia: f.dia, monto: f.monto }));
    const twr = modifiedDietz(v0, vFin, flujosDietz, dTot);
    const cfs = [{ dia: 0, monto: -v0 }, ...flujosEx.map(f => ({ dia: f.dia, monto: -f.monto })), { dia: dTot, monto: vFin }];
    const tir = dTot > 0 ? xirr(cfs, dTot) : null;

    return {
      moneda, desde: base.fecha, hasta: hoy, dias: dTot,
      v0, vFin, aportesNetos: F,
      resultado, realizado, noRealizado, rentas, comisiones, otros,
      twr, tirPeriodo: tir ? tir.periodo : null, tirAnual: tir && dTot >= 90 ? tir.anual : null,
      ventas, advertencias: adv,
    };
  }

  // ── Referencias (S&P 500, inflación) ──
  // Niveles de un índice de precios [{mes:'YYYY-MM', nivel}] → variación mensual [{mes, pct}] (solo meses consecutivos).
  function nivelesAMensual(niveles) {
    const arr = (niveles || []).slice().sort((a, b) => (a.mes < b.mes ? -1 : 1));
    const out = [];
    const mesAnterior = m => { const [y, mm] = m.split('-').map(Number); return mm === 1 ? (y - 1) + '-12' : y + '-' + String(mm - 1).padStart(2, '0'); };
    for (let i = 1; i < arr.length; i++) {
      if (arr[i - 1].mes === mesAnterior(arr[i].mes) && arr[i - 1].nivel > 0) out.push({ mes: arr[i].mes, pct: (arr[i].nivel / arr[i - 1].nivel - 1) * 100 });
    }
    return out;
  }

  // Inflación acumulada desde el cierre del día base hasta el fin del último mes publicado.
  // El mes de la base se prorratea por los días que quedan después de la base: (1 + i)^((díasMes − díaBase) / díasMes).
  // Devuelve { sinDato:true } si el último mes publicado es anterior al mes de la base (el período no tiene IPC todavía).
  function inflacionAcum(mensual, baseFecha) {
    const mesBase = String(baseFecha).slice(0, 7);
    const porMes = new Map((mensual || []).map(r => [r.mes, r.pct]));
    if (!porMes.has(mesBase)) return { sinDato: true, mesBase };
    const y = +mesBase.slice(0, 4), m = +mesBase.slice(5, 7), d = +String(baseFecha).slice(8, 10);
    const dim = diasEnMes(y, m);
    let factor = Math.pow(1 + porMes.get(mesBase) / 100, (dim - d) / dim);
    let ultimo = mesBase, meses = 1;
    let yy = y, mm = m;
    for (;;) {
      mm++; if (mm > 12) { mm = 1; yy++; }
      const clave = yy + '-' + String(mm).padStart(2, '0');
      if (!porMes.has(clave)) break;
      factor *= 1 + porMes.get(clave) / 100; ultimo = clave; meses++;
    }
    return { valor: factor - 1, hasta: ultimo, meses, mesBase };
  }

  // Retorno del S&P 500 (SPY, retorno total si la serie trae `adj`) entre el cierre del día base y la última barra.
  // En ARS se multiplica cada punta por el MEP de su fecha.
  function retornoSpy(serie, baseFecha, moneda, mep) {
    const s = (serie || []).filter(r => r && num(r.adj != null ? r.adj : r.close) != null).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
    if (!s.length) return { sinDato: true };
    const px = r => num(r.adj != null ? r.adj : r.close);
    let b = null;
    for (const r of s) if (r.fecha <= baseFecha) b = r;
    const fin = s[s.length - 1];
    if (!b || dias(b.fecha, baseFecha) > 5) return { sinDato: true };
    let ini = px(b), end = px(fin);
    if (moneda === 'ARS') {
      const f = construirMep(mep);
      const m0 = f(baseFecha), m1 = f(fin.fecha);
      if (!(m0 > 0 && m1 > 0)) return { sinDato: true };
      ini *= m0; end *= m1;
    }
    return { valor: end / ini - 1, desde: b.fecha, hasta: fin.fecha };
  }

  // Acumulado que parte de un rendimiento propio (pct0 al cierre de fecha0) y sigue la serie de la cuenta [[fecha, rendimiento acumulado desde el inicio de la serie]]:
  // (1 + pct0) × (1 + twr(hasta)) / (1 + twr(fecha0)) − 1. twr(fecha0) = el punto de ese día o el último anterior.
  // Si la serie no pasa de fecha0 (o no hay punto en/antes de fecha0, o no hay serie) no hay nada que encadenar: queda el punto de partida.
  function acumuladoDesdeInicial(pct0, fecha0, puntos) {
    const base = { pct: pct0, hasta: fecha0 };
    const s = (puntos || []).filter(p => Array.isArray(p) && typeof p[0] === 'string' && num(p[1]) != null).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    if (!s.length || num(pct0) == null) return base;
    const fin = s[s.length - 1];
    if (fin[0] <= fecha0) return base;
    let t0 = null;
    for (const p of s) if (p[0] <= fecha0) t0 = num(p[1]);
    if (t0 == null) return base;
    return { pct: (1 + pct0) * (1 + num(fin[1])) / (1 + t0) - 1, hasta: fin[0] };
  }

  const API = { esLote100, factorPrecio, modifiedDietz, xirr, calcular, nivelesAMensual, inflacionAcum, retornoSpy, acumuladoDesdeInicial, construirMep, filtrarOperaciones, diaNum, dias };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.RendimientoCalc = API;
})(typeof window !== 'undefined' ? window : null);
