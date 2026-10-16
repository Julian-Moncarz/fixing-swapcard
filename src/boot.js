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
  let cruftDone = new Set(); // "page|text" already hidden on this route
  const hideCruft = () => {
    const page = CC.route().page;
    for (const c of CRUFT) {
      if (!c.pages.includes(page) || cruftDone.has(page + '|' + c.text)) continue;
      const { asides, main } = CC.layoutColumns();
      const scope = asides.concat(main ? [main] : []);
      let label = null;
      for (const root of scope) {
        label = CC.$$('h1,h2,h3,h4,p,span,div', root).find((e) => e.children.length === 0 && e.textContent.trim() === c.text);
        if (label) break;
      }
      if (!label) continue;
      let box = label;
      for (let i = 0; i < c.up && box.parentElement; i++) box = box.parentElement;
      // Never hide a main column by accident.
      if (box.matches(`[data-cc-col], ${sc('aside__Aside')}, ${sc('main__Main')}, main, #__next`)) continue;
      box.classList.add('cc-hidden-cruft');
      cruftDone.add(page + '|' + c.text);
    }
  };
  CC.on('route', () => { cruftDone = new Set(); });

  // Switching to another event in the app: forget the old event's zone, theme and data.
  let lastSlug = CC.route().slug;
  CC.on('route', async () => {
    const slug = CC.route().slug;
    if (slug === lastSlug) return;
    lastSlug = slug;
    CC._tz = null; CC._eventTz = null;
    CC._theme = null; CC._themeApplied = false;
    CC.data.invalidate('');
    CC.applyThemeVars();
    const ev = await CC.data.event().catch(() => null);
    CC._eventTz = ev && ev.timezone;
    CC.emit('event-changed');
  });

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

  // Health check: once a page has settled, which key hooks found nothing?
  const LAYOUT_PAGES = ['people', 'exhibitors', 'products', 'person', 'messages', 'my-schedule'];
  const HOOKS = [
    // Narrow windows may collapse Swapcard's nav into a menu; don't call that a breakage.
    { name: 'nav schedule link', on: (r) => !!r.slug && innerWidth >= 900, found: () => CC.nav && CC.nav.scheduleLink() },
    { name: 'layout columns', on: (r) => LAYOUT_PAGES.includes(r.page), found: () => CC.layoutColumns().main },
    // The calendar, not the List view or another My Schedule tab.
    { name: 'calendar columns', on: (r) => r.page === 'my-schedule' && /^(schedule)?$/.test(new URLSearchParams(location.search).get('view') || ''),
      found: () => CC.calendar && CC.calendar.columns().length },
  ];
  const checkHooks = async () => {
    const at = location.pathname + location.search;
    const r = CC.route();
    const hooks = HOOKS.filter((k) => k.on(r));
    const results = await Promise.all(hooks.map(async (k) =>
      (await CC.waitFor(k.found, { timeout: 10000, every: 250 })) ? null : k.name));
    if (location.pathname + location.search !== at) return; // moved on; the next check covers it
    CC.health.resolve(hooks.map((k) => k.name).filter((n) => !results.includes(n)), r.page);
    CC.health.report(results.filter(Boolean), r.page);
    // A miss gets one more look later, in case the page was just slow.
    if (results.some(Boolean)) setTimeout(() => {
      if (location.pathname + location.search !== at) return;
      CC.health.resolve(hooks.filter((k) => results.includes(k.name) && k.found()).map((k) => k.name), r.page);
    }, 20000);
  };
  CC.on('ready', checkHooks);
  CC.on('route', () => { if (CC.isReady) checkHooks(); });

  // Mark Swapcard's layout right away, not only after the next DOM change.
  CC.emit('tag');
  const start = async () => {
    const ok = await CC.waitFor(() => CC.clients().main && CC.theme(), { timeout: 30000, every: 200 });
    if (!ok) { CC.warn('Swapcard runtime not found; Calmer Card is idle on this page'); return; }
    CC.applyThemeVars();
    try { const ev = await CC.data.event(); if (ev) CC._eventTz = ev.timezone; } catch (e) { CC.log('event', e); }
    CC.on('dom', hideCruft);
    CC.isReady = true;
    CC.emit('dom');
    CC.emit('ready');
    CC.log('ready');
  };
  start();
})();
