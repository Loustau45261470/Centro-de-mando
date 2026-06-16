/* ── THEME SWITCHER ── */
(function () {
  const THEMES = ['', 'bloomberg', 'amber', 'radar', 'infrared'];
  const FONTS  = ['', 'dm', 'outfit', 'manrope', 'jakarta'];

  window.applyTheme = function(theme) {
    const prev = localStorage.getItem('ui_theme') || '';
    THEMES.forEach(t => { if (t) document.body.classList.remove('theme-' + t); });
    if (theme) document.body.classList.add('theme-' + theme);
    if (theme !== prev && window.JARVIS && document.getElementById('login-screen')?.style.display === 'none') JARVIS.onThemeChange();
    localStorage.setItem('ui_theme', theme);
    document.querySelectorAll('.theme-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
  };

  window.applyFont = function(font) {
    FONTS.forEach(f => { if (f) document.body.classList.remove('font-' + f); });
    if (font) document.body.classList.add('font-' + font);
    localStorage.setItem('ui_font', font);
    document.querySelectorAll('.font-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.font === font);
    });
  };

  // Restore saved preferences on load
  const savedTheme = localStorage.getItem('ui_theme') || '';
  const savedFont  = localStorage.getItem('ui_font')  || '';
  applyTheme(savedTheme);
  applyFont(savedFont);
})();

/* ── IDENTITY AFFIRMATIONS ── */
(function () {
  const AFF = {
    vida: [
      'Soy el mejor hijo',
      'Soy el novio más amoroso y detallista',
      'Soy disciplinado',
      'Soy comprometido',
      'Soy puntual',
      'Soy responsable',
      'Soy un hijo amoroso',
      'Soy un padre amoroso',
      'Soy un novio fuerte',
      'Soy un novio atento',
      'Soy un novio caballeroso',
      'Soy una persona alegre',
      'Aprovecho cada oportunidad',
      'Soy valiente',
      'Soy fuerte',
      'Siempre me levanto',
      'Dios está conmigo',
      'Dios me ama',
      'Soy un fiel servidor de Dios',
      'Soy un cristiano devoto',
      'Soy planificador',
      'Soy centrado',
      'Soy una montaña inamovible ante el caos',
    ],
    finanzas: [
      'Soy responsable financieramente',
      'Soy economista',
      'Administro el dinero con inteligencia',
      'Soy un experto en finanzas',
      'Soy inversor',
      'Soy millonario',
      'Tengo buenos hábitos financieros',
      'Solo gasto en lo útil y necesario',
    ],
    salud: [
      'Soy fuerte y ágil',
      'Soy deportista',
      'Soy disciplinado',
      'Tengo hábitos sanos',
      'Tengo energía infinita',
      'Soy el mejor',
      'Soy una bestia humana',
      'Soy una fuerza imparable',
    ],
    conocimiento: [
      'Soy el mejor estudiante',
      'Soy disciplinado y constante',
      'Disfruto profundamente el proceso de aprender',
      'Me emociona lo que aprendo',
      'Aprendo y retengo con facilidad',
      'Soy imparable en los finales',
      'Apunto siempre a la excelencia',
      'Soy un estudiante exitoso',
      'Soy un lector entusiasta',
    ],
    ia: [
      'Soy un pionero de la inteligencia artificial',
      'Domino las herramientas de IA más poderosas',
      'La IA multiplica mi potencial sin límites',
      'Construyo soluciones que transforman vidas',
      'Entiendo la IA con profundidad y claridad',
      'Soy un ingeniero de IA imparable',
      'Aprendo y aplico IA más rápido que nadie',
      'El futuro me pertenece porque lo estoy construyendo',
    ],
  };

  const TABS_ALL = ['vida', 'finanzas', 'salud', 'conocimiento', 'ia'];
  const idx  = {};
  const idx2 = {};
  TABS_ALL.forEach(t => { idx[t] = 0; idx2[t] = 0; });

  function setEl(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function rotateEl(id, arr, idxObj, key) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('aff-fade');
    setTimeout(() => {
      idxObj[key] = (idxObj[key] + 1) % arr.length;
      el.textContent = arr[idxObj[key]];
      el.classList.remove('aff-fade');
    }, 750);
  }

  // Init at random offsets so no two strips say the same thing
  TABS_ALL.forEach(tab => {
    idx[tab]  = Math.floor(Math.random() * AFF[tab].length);
    idx2[tab] = (idx[tab] + Math.floor(AFF[tab].length / 2)) % AFF[tab].length;
    setEl('affirmation-'  + tab, AFF[tab][idx[tab]]);
    setEl('affirmation2-' + tab, AFF[tab][idx2[tab]]);
  });

  // Stagger primary rotations (every 14s)
  setTimeout(() => setInterval(() => rotateEl('affirmation-vida',         AFF.vida,         idx,  'vida'),         14000), 0);
  setTimeout(() => setInterval(() => rotateEl('affirmation-finanzas',     AFF.finanzas,     idx,  'finanzas'),     14000), 2800);
  setTimeout(() => setInterval(() => rotateEl('affirmation-salud',        AFF.salud,        idx,  'salud'),        14000), 5600);
  setTimeout(() => setInterval(() => rotateEl('affirmation-conocimiento', AFF.conocimiento, idx,  'conocimiento'), 14000), 8400);
  setTimeout(() => setInterval(() => rotateEl('affirmation-ia',           AFF.ia,           idx,  'ia'),           14000), 11200);

  // Stagger secondary (mid-tab) rotations — offset by 7s so they never match the primary
  setTimeout(() => setInterval(() => rotateEl('affirmation2-vida',         AFF.vida,         idx2, 'vida'),         14000), 7000);
  setTimeout(() => setInterval(() => rotateEl('affirmation2-finanzas',     AFF.finanzas,     idx2, 'finanzas'),     14000), 9800);
  setTimeout(() => setInterval(() => rotateEl('affirmation2-salud',        AFF.salud,        idx2, 'salud'),        14000), 12600);
  setTimeout(() => setInterval(() => rotateEl('affirmation2-conocimiento', AFF.conocimiento, idx2, 'conocimiento'), 14000), 1400);
  setTimeout(() => setInterval(() => rotateEl('affirmation2-ia',           AFF.ia,           idx2, 'ia'),           14000), 4200);
})();
