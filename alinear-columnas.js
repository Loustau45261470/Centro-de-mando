// Alinear columnas (escritorio): cuando una sección está en dos columnas, hace que los finales/inicios de tarjetas de ambos lados coincidan
// SIN alturas fijas por pantalla — se mide y se ajusta.
//  · Vida: Planificación del día termina a la par de Hábitos (muestra solo las filas que entran, alrededor de la hora actual).
//  · Finanzas: el gráfico de Patrimonio toma la altura que sobra para terminar a la par de Hábitos (así Presupuesto empieza donde Actividad).
// En una sola columna (celu/ventana angosta) no toca nada y deja todo como estaba.
// Sin loops: se observan solo piezas que este módulo no modifica (o cuya altura da el mismo resultado al re-medir) y todo corre en un rAF.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const FIN_MIN = 110, FIN_MAX = 420;   // rango del gráfico de Patrimonio (px de la caja, con su padding)
  let _raf = 0;

  function activa(tabId) { const t = $(tabId); return !!(t && t.classList.contains('active')); }
  // ¿Las dos columnas están lado a lado? (en una columna la segunda queda debajo, no a la derecha)
  function ladoALado(tabId) {
    const cols = document.querySelectorAll('#' + tabId + ' .fin-cols > .fin-col');
    if (cols.length < 2) return false;
    const a = cols[0].getBoundingClientRect(), b = cols[1].getBoundingClientRect();
    return a.width > 0 && b.width > 0 && b.left >= a.right - 1;
  }
  // Posición en el layout (offsetTop encadenado), NO getBoundingClientRect: las tarjetas entran con una animación de desplazamiento y medir el rect a mitad de camino desalinea.
  function y(el) { let t = 0; for (let e = el; e; e = e.offsetParent) t += e.offsetTop; return t; }
  function bot(el) { return y(el) + el.getBoundingClientRect().height; }
  // Borde inferior visible de un contenedor: el de su última hija con alto (o el propio contenedor).
  function fondo(el) {
    for (let i = el.children.length - 1; i >= 0; i--) if (el.children[i].offsetHeight > 0) return bot(el.children[i]);
    return bot(el);
  }

  // Si la tarjeta termina antes que target, la estira (min-height) para que termine justo ahí. Nunca la achica.
  function estirar(card, target) {
    let mh = card.getBoundingClientRect().height;
    for (let i = 0; i < 2; i++) {   // 2.ª pasada por si la caja suma padding/borde al min-height
      const d = target - bot(card);
      if (Math.abs(d) <= 0.5 || (i === 0 && d < 0)) break;
      mh += d; card.style.minHeight = mh + 'px';
    }
  }

  // ── Vida ──
  function vidaReset(card, list) {
    card.style.minHeight = ''; card.classList.remove('alin-on');
    list.querySelectorAll('.alin-oculta').forEach(r => r.classList.remove('alin-oculta'));
    const m = list.querySelector('.alin-mas'); if (m) m.remove();
  }
  function _min(txt) { const m = /(\d{1,2}):(\d{2})/.exec(txt || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  function vida() {
    const card = $('dayPlannerCard'), hab = $('vida-habits-wrap'), list = $('dayPlannerList');
    if (!card || !hab || !list) return;
    vidaReset(card, list);
    if (!activa('tab-vida') || !ladoALado('tab-vida') || !hab.children.length) return;
    card.classList.add('alin-on');   // la lista deja de tener su tope de 520 px con scroll: acá el tope lo pone Hábitos
    const target = fondo(hab);
    const rows = [...list.querySelectorAll('.pcal-row')];
    const rellenar = () => estirar(card, target);
    if (!rows.length || bot(card) <= target + 0.5) { rellenar(); return; }

    // No entra todo: ventana de filas alrededor de la hora actual.
    const hs = rows.map(r => r.getBoundingClientRect().height);
    const gap = rows.length > 1 ? Math.max(0, rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().bottom) : 0;
    const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
    const fin = rows.map(r => {   // [inicio, fin] en minutos; una tarea sin duración cuenta media hora
      const tt = r.querySelector('.pcal-row-time'), txt = tt ? tt.textContent : '';
      const ini = _min(txt), f = _min(txt.split(/[–-]/)[1]);
      return f != null && f > ini ? f : (ini != null ? ini + 30 : 0);
    });
    let k = fin.findIndex(f => f > nowMin);   // en curso o la próxima
    if (k < 0) k = rows.length;               // todo pasó: se muestran las últimas
    const mas = document.createElement('div');
    mas.className = 'alin-mas'; mas.textContent = '+0 más';
    list.appendChild(mas);
    rows.forEach(r => r.classList.add('alin-oculta'));
    const avail = target - bot(card);   // con todas ocultas y la línea "+N más" puesta
    const sel = new Set(); let used = 0;
    const probar = i => { const c = hs[i] + (sel.size ? gap : 0); if (used + c > avail + 0.5) return false; sel.add(i); used += c; return true; };
    for (let i = k; i < rows.length; i++) if (!probar(i)) break;
    for (let i = k - 1; i >= 0; i--) if (!probar(i)) break;
    if (!sel.size) sel.add(Math.min(k, rows.length - 1));   // al menos una, aunque se pase un poco
    rows.forEach((r, i) => r.classList.toggle('alin-oculta', !sel.has(i)));
    const n = rows.length - sel.size;
    if (n > 0) mas.textContent = '+' + n + ' más'; else mas.remove();
    rellenar();
  }

  // ── Finanzas ──
  function finanzas() {
    const cv = $('nwLineChart'), wrap = cv && cv.closest('.chart-wrap'), hab = $('finanzas-habits-wrap');
    if (!wrap || !hab) return;
    const card = wrap.closest('.card'); if (!card) return;
    const hc = [...hab.children].reverse().find(c => c.offsetHeight > 0) || hab.lastElementChild;   // tarjeta de Hábitos
    card.style.minHeight = ''; if (hc) hc.style.minHeight = '';
    if (!activa('tab-finanzas') || !ladoALado('tab-finanzas') || !hab.children.length) { if (wrap.style.height) wrap.style.height = ''; return; }
    const cur = wrap.getBoundingClientRect().height;
    const target = fondo(hab);
    const h = Math.round(Math.min(FIN_MAX, Math.max(FIN_MIN, target - (bot(card) - cur))) * 10) / 10;
    if (Math.abs(h - cur) > 0.5) wrap.style.height = h + 'px';
    // Un solo criterio: el gráfico crece/achica hasta llegar a Hábitos; si ni en su piso alcanza (Patrimonio más largo), se estira Hábitos.
    if (hc && bot(card) > target + 0.5) estirar(hc, bot(card)); else estirar(card, target);
  }

  function correr() { [vida, finanzas].forEach(f => { try { f(); } catch (e) { console.warn('[alinear-columnas]', e); } }); }
  function agendar() { if (_raf) return; _raf = requestAnimationFrame(() => { _raf = 0; correr(); }); }

  function iniciar() {
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(agendar);
      ['vida-habits-wrap', 'qobj-wrap-vida', 'finanzas-habits-wrap', 'qobj-wrap-finanzas', 'accountList', 'nwLegend', 'tab-vida', 'tab-finanzas'].forEach(id => { const el = $(id); if (el) ro.observe(el); });
    }
    window.addEventListener('resize', agendar);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) agendar(); });
    setInterval(() => { if (!document.hidden) agendar(); }, 5 * 60 * 1000);   // sigue la hora (qué filas quedan arriba)
    agendar();
  }
  window.CMAlinear = { run: () => { correr(); agendar(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
