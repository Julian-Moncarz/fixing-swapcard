// Navigation mod: one "Schedule" tab (the calendar) replaces Home, My Schedule and Agenda.
// Home and Agenda URLs redirect to it; the bell and chat icons go (the Inbox tab covers both).
(() => {
  const CC = window.CalmerCard;
  if (!CC || CC.nav) return;

  const schedulePath = () => `/event/${CC.route().slug}/my-schedule?view=schedule&appearance=calendar`;
  const inTopNav = (el) => el.getBoundingClientRect().top < 120;

  // Swapcard's own "My Schedule" link, found by URL so renaming it doesn't lose it.
  const scheduleLink = () => CC.$$('a[href]').find((a) => /\/my-schedule(\?|$)/.test(a.getAttribute('href')) && inTopNav(a) && !a.classList.contains('cc-nav-inbox'));

  // Nav links to drop: Home (the bare event URL) and Agenda (a plannings view).
  const isRedundant = (a) => {
    const href = a.getAttribute('href') || '';
    const slug = CC.route().slug;
    return href === `/event/${slug}` || href === `/event/${slug}/` || /\/plannings\//.test(href);
  };

  const tidyNav = () => {
    const sched = scheduleLink();
    if (!sched) return;
    // Rename "My Schedule" to "Schedule" (first text node only; React keeps the rest).
    const walker = document.createTreeWalker(sched, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = walker.nextNode())) {
      if (t.nodeValue.trim() === 'My Schedule') { t.nodeValue = t.nodeValue.replace('My Schedule', 'Schedule'); break; }
    }
    const list = (sched.closest('li') || sched).parentElement;
    if (!list) return;
    // Hide Home and Agenda. Schedule and Inbox go first via CSS order (moving React's own
    // nodes would confuse its next render).
    for (const a of list.querySelectorAll('a[href]')) {
      if (isRedundant(a)) (a.closest('li') || a).classList.add('cc-hidden-cruft');
    }
    const slot = sched.closest('li') || sched;
    slot.classList.add('cc-nav-first');
    const inbox = list.querySelector('.cc-nav-inbox');
    if (inbox) (inbox.closest('li') || inbox).classList.add('cc-nav-first');
  };

  // The top-right bell and chat icons.
  const hideIcons = () => {
    for (const el of CC.$$('[aria-label="Notifications"], [aria-label="Messages"]')) {
      if (!inTopNav(el)) continue;
      const target = el.closest('a, button') || el;
      target.classList.add('cc-hidden-cruft');
    }
  };

  // Home and Agenda pages redirect to the calendar.
  let redirecting = false;
  const redirect = () => {
    const r = CC.route();
    if (!r.slug || redirecting) return;
    if (r.page !== 'home' && r.page !== 'plannings') return;
    const router = window.next && window.next.router;
    if (!router) return;
    redirecting = true;
    router.replace(schedulePath()).finally(() => { redirecting = false; });
  };

  // Put the nav just after the event switcher in the top bar.
  const placeNav = () => {
    const bar = document.querySelector('[class*="top-bar__Wrapper-sc-"]');
    const navBox = document.querySelector('[class*="submenu-wrapper__Container-sc-"]');
    if (!bar) return;
    // Rightmost text in the left half of the bar (logo, org, event name) that isn't the nav itself.
    let right = 0;
    for (const e of bar.querySelectorAll('*')) {
      if (navBox && navBox.contains(e)) continue;
      const r = e.getBoundingClientRect();
      // Small things only (logo, org mark, event name), not full-width wrappers or dividers.
      if (!r.width || r.width > 500 || r.top > 50 || r.left > innerWidth / 2) continue;
      if (e.children.length === 0 || e.tagName === 'svg') right = Math.max(right, r.right);
    }
    if (!right) return;
    const left = Math.round(right + 32);
    document.documentElement.style.setProperty('--cc-nav-left', left + 'px');
    // Does the nav fit between the event name and the avatar? Its width is the span of its items.
    const rects = navBox ? CC.$$('a[href], button', navBox).filter((a) => a.offsetParent !== null).map((a) => a.getBoundingClientRect()) : [];
    const navWidth = rects.length ? Math.max(...rects.map((r) => r.right)) - Math.min(...rects.map((r) => r.left)) + 24 : Infinity;
    const avatar = bar.querySelector(CC.sc('top-bar__DropDownWrapper'));
    const limit = avatar ? avatar.getBoundingClientRect().left - 16 : innerWidth - 80;
    document.documentElement.classList.toggle('cc-nav-inline', left + navWidth <= limit);
  };
  window.addEventListener('resize', placeNav);

  // Highlight the tab for the page you're on.
  const markActive = () => {
    const sched = scheduleLink();
    const list = sched && (sched.closest('li') || sched).parentElement;
    if (!list) return;
    const here = location.pathname;
    for (const a of list.querySelectorAll('a[href]')) {
      let path = '';
      try { path = new URL(a.href, location.href).pathname; } catch {}
      const active = !!path && path !== `/event/${CC.route().slug}` && (here === path || here.startsWith(path + '/'));
      a.classList.toggle('cc-nav-active', active);
    }
  };

  CC.nav = { scheduleLink, schedulePath };
  CC.on('dom', () => { tidyNav(); hideIcons(); placeNav(); markActive(); });
  CC.on('route', redirect);
  CC.on('ready', redirect);
})();
