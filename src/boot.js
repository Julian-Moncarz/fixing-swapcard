// Calmer Card boot: wait for Swapcard's runtime, apply theme, remove cruft, kick off mods.
(() => {
  const CC = window.CalmerCard;
  if (!CC || CC.booted) return;
  CC.booted = true;
  const { sc } = CC;

  document.documentElement.classList.add('cc-on');

  // Boxes we hide, identified by their heading text (class names alone are too generic).
  // Each entry: heading text -> how many levels up the box container is.
  const CRUFT = [
    { text: 'Need to meet?', up: 3, pages: ['people', 'exhibitors', 'products'] },
    { text: 'Lead qualification', up: 2, pages: ['person'] },
  ];
  const hideCruft = () => {
    const page = CC.route().page;
    for (const c of CRUFT) {
      if (!c.pages.includes(page)) continue;
      const label = CC.$$('h1,h2,h3,h4,p,span,div').find((e) => e.children.length === 0 && e.textContent.trim() === c.text && !e.closest('.cc-hidden-cruft'));
      if (!label) continue;
      let box = label;
      for (let i = 0; i < c.up && box.parentElement; i++) box = box.parentElement;
      // Never hide a main column by accident.
      if (box.matches(`${sc('aside__Aside')}, ${sc('main__Main')}, main, #__next`)) continue;
      box.classList.add('cc-hidden-cruft');
    }
  };

  // Page classes on <html> so CSS can target pages (e.g. widen the calendar and inbox).
  const WIDE_PAGES = ['my-schedule', 'messages'];
  const pageClasses = () => {
    const page = CC.route().page || 'none';
    const cl = document.documentElement.classList;
    [...cl].filter((c) => c.startsWith('cc-page-')).forEach((c) => cl.remove(c));
    cl.add('cc-page-' + page);
    cl.toggle('cc-wide', WIDE_PAGES.includes(page));
  };
  pageClasses();
  CC.on('route', pageClasses);

  const start = async () => {
    const ok = await CC.waitFor(() => CC.clients().main && CC.theme(), { timeout: 30000, every: 200 });
    if (!ok) { CC.warn('Swapcard runtime not found; Calmer Card is idle on this page'); return; }
    CC.applyThemeVars();
    try { const ev = await CC.data.event(); if (ev) CC._tz = ev.timezone; } catch (e) { CC.log('event', e); }
    CC.on('dom', hideCruft);
    CC.isReady = true;
    CC.emit('dom');
    CC.emit('ready');
    CC.log('ready');
  };
  start();
})();
