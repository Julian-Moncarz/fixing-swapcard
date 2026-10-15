// Profile drawer: clicking any person opens Swapcard's own profile page in a side panel
// instead of navigating away. Inside the panel (embed mode) we hide their chrome and
// pull the useful bits (LinkedIn, full bio) to the top.
(() => {
  const CC = window.CalmerCard;
  if (!CC || CC.drawer) return;
  const { h, ui } = CC;

  const PERSON_RE = /^\/event\/([^/]+)\/person\/([^/?#]+)/;

  // ======================= embed mode (inside the iframe) =======================
  if (CC.isEmbed) {
    document.documentElement.classList.add('cc-embed');
    const tidy = () => {
      // Expand truncated bios.
      CC.$$('button, a, span').forEach((el) => {
        if (el.textContent.trim() === 'See more' && !el.dataset.ccClicked && el.closest('main, #__next')) {
          el.dataset.ccClicked = '1';
          try { el.click(); } catch {}
        }
      });
      // Surface LinkedIn / website links next to the name.
      const r = CC.route();
      if (r.page === 'person' && !document.querySelector('.cc-quicklinks')) {
        const links = CC.$$('a[href*="linkedin.com"], a[href*="twitter.com"], a[href*="x.com/"]')
          .filter((a) => !a.closest('.cc-quicklinks'));
        const nameEl = CC.$$('h1, h2, h3, span').find((e) => e.children.length === 0 && /\S/.test(e.textContent) && getComputedStyle(e).fontWeight >= 600 && e.getBoundingClientRect().top < 400 && e.getBoundingClientRect().top > 0 && e.closest('main'));
        if (links.length && nameEl) {
          const bar = h('div', { class: 'cc-quicklinks' }, links.map((a) => h('a', {
            class: 'cc-chip cc-chip-link', href: a.href, target: '_blank', rel: 'noopener noreferrer',
          }, /linkedin/.test(a.href) ? 'LinkedIn ↗' : 'Profile ↗')));
          nameEl.parentElement.append(bar);
        }
      }
      // Tell the parent which page we're on (for the drawer header).
      try { parent.postMessage({ cc: 'embed-route', path: location.pathname, title: document.title }, location.origin); } catch {}
    };
    CC.on('dom', tidy);
    CC.on('route', tidy);
    // Parent asks us to client-side navigate (fast: no full reload).
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || !e.data || e.data.cc !== 'navigate') return;
      const router = window.next && window.next.router;
      if (router && router.push) router.push(e.data.path);
      else location.assign(e.data.path);
    });
    CC.drawer = { embed: true };
    return;
  }

  // ======================= top-level page =======================
  let root, frame, header, requestBar, currentPath = null, frameReady = false;

  const build = () => {
    if (root) return;
    header = h('div', { class: 'cc-drawer-title' }, 'Profile');
    requestBar = h('div', { class: 'cc-drawer-request' });
    frame = h('iframe', { class: 'cc-drawer-frame', title: 'Profile', referrerpolicy: 'same-origin' });
    frame.addEventListener('load', () => {
      frameReady = true;
      // Dev only: when testing by injection (no extension), inject the same bundle into the frame.
      try {
        const w = frame.contentWindow;
        if (window.__ccDevBundle && w && !w.CalmerCard) w.eval(window.__ccDevBundle);
      } catch (e) { CC.warn('dev inject', e); }
    });
    const fullLink = h('a', { class: 'cc-btn cc-btn-ghost', href: '#', title: 'Open the full page' }, 'Open full page ↗');
    fullLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (currentPath) { const p = currentPath; close(); CC.allowNavigation = true; location.assign(p); }
    });
    const closeBtn = h('button', { class: 'cc-icon-btn', type: 'button', 'aria-label': 'Close' }, '✕');
    closeBtn.addEventListener('click', () => close());
    root = h('div', { class: 'cc-drawer', role: 'dialog', 'aria-label': 'Profile', hidden: true },
      h('div', { class: 'cc-drawer-scrim' }),
      h('aside', { class: 'cc-drawer-panel' },
        h('div', { class: 'cc-drawer-head' }, header, h('div', { class: 'cc-row' }, fullLink, closeBtn)),
        requestBar,
        frame));
    root.querySelector('.cc-drawer-scrim').addEventListener('click', () => close());
    document.body.append(root);
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || !e.data || e.data.cc !== 'embed-route') return;
      currentPath = e.data.path;
      header.textContent = (e.data.title || 'Profile').replace(/\s*[|·-]\s*Swapcard.*$/i, '');
    });
  };

  const navigateFrame = (path) => {
    if (frameReady && frame.contentWindow && frame.contentWindow.CalmerCard) {
      frame.contentWindow.postMessage({ cc: 'navigate', path }, location.origin);
    } else {
      frameReady = false;
      frame.src = path;
    }
  };

  // request: optional pending request {id, incoming, isMeeting, message, meeting} to act on in place.
  const open = (path, { request } = {}) => {
    build();
    currentPath = path;
    header.textContent = 'Loading…';
    renderRequestBar(request);
    root.hidden = false;
    document.documentElement.classList.add('cc-drawer-open');
    navigateFrame(path);
  };
  const openPerson = (personId, opts) => open(`/event/${CC.route().slug}/person/${personId}`, opts);

  const close = () => {
    if (!root) return;
    root.hidden = true;
    document.documentElement.classList.remove('cc-drawer-open');
    CC.emit('drawer-closed');
  };

  const renderRequestBar = (req) => {
    requestBar.replaceChildren();
    requestBar.hidden = !req;
    if (!req) return;
    const what = req.isMeeting
      ? (req.meeting ? `Meeting request · ${ui.day(req.meeting.start)} ${ui.range(req.meeting.start, req.meeting.end)}${req.meeting.place ? ' · ' + req.meeting.place : ''}` : 'Meeting request')
      : 'Connection request';
    const done = (msg) => { requestBar.replaceChildren(h('div', { class: 'cc-request-done' }, msg)); };
    requestBar.append(
      h('div', { class: 'cc-request-kind' }, req.incoming ? what : what + ' (sent, waiting)'),
      req.message && h('div', { class: 'cc-request-msg' }, '“' + req.message + '”'),
      req.incoming && h('div', { class: 'cc-row' },
        ui.button('Accept', { variant: 'primary', onClick: async () => { await CC.data.acceptRequest(req.id); done('Accepted ✓'); ui.toast('Accepted', 'success'); } }),
        ui.button('Decline', { variant: 'secondary', onClick: async () => { await CC.data.declineRequest(req.id); done('Declined'); } })));
  };

  // Intercept clicks on person links anywhere on the page.
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.closest('.cc-drawer')) return;
    let url;
    try { url = new URL(a.href, location.href); } catch { return; }
    if (url.origin !== location.origin || !PERSON_RE.test(url.pathname)) return;
    // Don't hijack the "My profile" page or links inside our own UI that want navigation.
    if (a.dataset.ccNavigate) return;
    e.preventDefault();
    e.stopPropagation();
    open(url.pathname + url.search);
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root && !root.hidden) close();
  });

  // Some lists navigate with router.push instead of <a>; catch those too.
  const patchRouter = () => {
    const router = window.next && window.next.router;
    if (!router || router.__ccPatched) return !!router;
    for (const m of ['push']) {
      const orig = router[m].bind(router);
      router[m] = (url, as, opts) => {
        const target = typeof as === 'string' ? as : typeof url === 'string' ? url : (url && url.pathname) || '';
        let path = target;
        try { path = new URL(target, location.href).pathname; } catch {}
        const m2 = path.match(PERSON_RE);
        if (m2 && !CC.allowNavigation) {
          open(path);
          return Promise.resolve(true);
        }
        return orig(url, as, opts);
      };
    }
    router.__ccPatched = true;
    return true;
  };
  CC.waitFor(patchRouter, { timeout: 30000, every: 250 });

  CC.drawer = { open, openPerson, close, isOpen: () => !!root && !root.hidden };
})();
