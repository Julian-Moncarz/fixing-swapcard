// Side panel: clicking any person or session opens it in a side panel instead of navigating
// away. Swapcard forbids framing its own pages (CSP frame-ancestors), so we render from their
// data with their theme, and act in place: accept/decline requests, connect, book a meeting on
// a calendar of mutual free time, add/remove sessions. A Back button walks the panel's history.
(() => {
  const CC = window.CalmerCard;
  if (!CC || CC.isEmbed || CC.drawer) return;
  const { h, ui } = CC;

  const PERSON_RE = /^\/event\/([^/]+)\/person\/([^/?#]+)/;
  const SESSION_RE = /^\/event\/([^/]+)\/planning\/([^/?#]+)/;
  // A Swapcard path -> what the panel should show, or null.
  const viewFor = (path) => {
    let m = path.match(PERSON_RE);
    if (m) return { kind: 'person', id: m[2] };
    m = path.match(SESSION_RE);
    if (m) return { kind: 'session', id: m[2] };
    return null;
  };
  const pathFor = (v) => `/event/${CC.route().slug}/${v.kind === 'session' ? 'planning' : 'person'}/${v.id}`;
  const HIDDEN_FIELDS = /visibility in attendee data sheet/i;

  let root, body, titleEl, backBtn, current = null, stack = [], openToken = 0;

  const build = () => {
    if (root) return;
    titleEl = h('div', { class: 'cc-drawer-title' }, 'Profile');
    backBtn = h('button', { class: 'cc-icon-btn', type: 'button', 'aria-label': 'Back', hidden: true }, '←');
    backBtn.addEventListener('click', () => { const prev = stack.pop(); if (prev) show(prev, { push: false }); });
    const fullLink = h('a', { class: 'cc-btn cc-btn-ghost', href: '#', title: 'Open Swapcard’s full page for this' }, 'Full page ↗');
    fullLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (!current) return;
      const path = pathFor(current);
      close();
      CC.allowNavigation = true;
      const router = window.next && window.next.router;
      (router ? router.push(path) : Promise.resolve(location.assign(path))).finally(() => { CC.allowNavigation = false; });
    });
    const closeBtn = h('button', { class: 'cc-icon-btn', type: 'button', 'aria-label': 'Close' }, '✕');
    closeBtn.addEventListener('click', () => close());
    body = h('div', { class: 'cc-drawer-body' });
    root = h('div', { class: 'cc-drawer', role: 'dialog', 'aria-label': 'Profile', hidden: true },
      h('div', { class: 'cc-drawer-scrim' }),
      h('aside', { class: 'cc-drawer-panel' },
        h('div', { class: 'cc-drawer-head' }, h('div', { class: 'cc-row cc-drawer-titlewrap' }, backBtn, titleEl), h('div', { class: 'cc-row' }, fullLink, closeBtn)),
        body));
    root.querySelector('.cc-drawer-scrim').addEventListener('click', () => close());
    document.body.append(root);
  };

  const close = () => {
    if (!root || root.hidden) return;
    root.hidden = true;
    current = null;
    stack = [];
    document.documentElement.classList.remove('cc-drawer-open');
    CC.emit('drawer-closed');
  };

  // ---------- profile rendering ----------
  // Swapcard stores social profiles as handles ("jane-doe") or sometimes full URLs.
  const SOCIAL_BASE = {
    LINKEDIN: 'https://www.linkedin.com/in/',
    TWITTER: 'https://x.com/',
    FACEBOOK: 'https://www.facebook.com/',
    INSTAGRAM: 'https://www.instagram.com/',
  };
  const linkFor = (sn) => {
    const v = String(sn.profile || '').trim();
    if (!v) return null;
    let url = null;
    if (/^https?:\/\//i.test(v)) url = v;
    else if (/^(www\.)?[a-z0-9-]+\.[a-z]{2,}\//i.test(v)) url = 'https://' + v;
    else if (SOCIAL_BASE[sn.type]) url = SOCIAL_BASE[sn.type] + encodeURIComponent(v.replace(/^@/, ''));
    if (!url) return null;
    const label = { LINKEDIN: 'LinkedIn', TWITTER: 'X / Twitter', FACEBOOK: 'Facebook', INSTAGRAM: 'Instagram' }[sn.type] || sn.type;
    return h('a', { class: 'cc-chip cc-chip-link', href: url, target: '_blank', rel: 'noopener noreferrer' }, label + ' ↗');
  };

  const fieldBlock = (f) => {
    if (HIDDEN_FIELDS.test(f.name)) return null;
    const v = f.value;
    return h('section', { class: 'cc-p-field' },
      h('div', { class: 'cc-p-label' }, f.name),
      Array.isArray(v)
        ? h('div', { class: 'cc-chips' }, v.map((x) => h('span', { class: 'cc-chip' }, x)))
        : /Url/.test(f.type)
          ? h('a', { href: v, target: '_blank', rel: 'noopener noreferrer' }, v)
          : h('div', { class: 'cc-p-text' }, v));
  };

  const statusLine = (p, req) => {
    const s = p.userInfo || {};
    if (s.isSelf) return 'This is you';
    if (req && req.incoming) return null; // the request bar says it
    if (/^CONNECTED/.test(s.connectionStatus || '')) return 'Connected';
    if (s.hasSentRequest) return 'Connection request sent';
    return null;
  };

  const requestBar = (req, onDone) => {
    const what = req.isMeeting
      ? `Meeting request${req.meeting ? ` · ${ui.day(req.meeting.start)} ${ui.range(req.meeting.start, req.meeting.end)}${req.meeting.place ? ' · ' + req.meeting.place : ''}` : ''}`
      : 'Wants to connect';
    const bar = h('div', { class: 'cc-drawer-request' },
      h('div', { class: 'cc-request-kind' }, req.incoming ? what : what + ' (you sent this, waiting)'),
      req.message && h('div', { class: 'cc-request-msg' }, '“' + req.message + '”'));
    if (req.incoming) {
      const done = (msg) => { bar.replaceChildren(h('div', { class: 'cc-request-done' }, msg)); onDone && onDone(); };
      bar.append(h('div', { class: 'cc-row' },
        ui.button('Accept', { variant: 'primary', onClick: async () => { await CC.data.acceptRequest(req.id); done('Accepted ✓'); ui.toast('Accepted', 'success'); } }),
        ui.button('Decline', { onClick: async () => { await CC.data.declineRequest(req.id); done('Declined'); } })));
    }
    return bar;
  };

  const connectBox = (p, actions) => {
    const note = h('textarea', { class: 'cc-fb-text cc-small-text', rows: '3', maxlength: '300', placeholder: 'Optional note (why you’d like to connect)' });
    const box = h('div', { class: 'cc-p-connect' }, note,
      h('div', { class: 'cc-row' },
        ui.button('Send connection request', {
          variant: 'primary',
          onClick: async () => {
            await CC.data.connect(p.userId, note.value.trim());
            box.replaceWith(h('div', { class: 'cc-request-done' }, 'Connection request sent ✓'));
            ui.toast('Connection request sent', 'success');
            actions.querySelector('.cc-connect-btn')?.remove();
          },
        }),
        ui.button('Cancel', { variant: 'ghost', onClick: async () => box.remove() })));
    return box;
  };

  // Renders a profile into `target` (the drawer body by default).
  const renderProfile = (p, req, target = body) => {
    const name = [p.firstName, p.lastName].filter(Boolean).join(' ');
    if (target === body) titleEl.textContent = name;
    const links = (p.socialNetworks || []).map(linkFor).filter(Boolean);
    if (p.websiteUrl && /^https?:/i.test(p.websiteUrl)) links.push(h('a', { class: 'cc-chip cc-chip-link', href: p.websiteUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Website ↗'));
    const status = statusLine(p, req);
    const actions = h('div', { class: 'cc-row cc-p-actions' });
    const panelSlot = h('div', { class: 'cc-p-slot' });
    const isSelf = p.userInfo && p.userInfo.isSelf;
    const connected = p.userInfo && /^CONNECTED/.test(p.userInfo.connectionStatus || '');
    if (!isSelf && p.canMeet) {
      actions.append(ui.button('Book a 1:1', {
        variant: 'primary',
        onClick: async () => { panelSlot.replaceChildren(CC.booking.panel(p, () => panelSlot.replaceChildren())); },
      }));
    }
    if (!isSelf && !connected && !(p.userInfo && (p.userInfo.hasSentRequest || p.userInfo.hasReceivedRequest)) && p.userId) {
      const b = ui.button('Connect', { onClick: async () => { panelSlot.replaceChildren(connectBox(p, actions)); } });
      b.classList.add('cc-connect-btn');
      actions.append(b);
    }
    const bio = (p.biography || '').trim();
    const longFields = p.fields.filter((f) => !Array.isArray(f.value) && /LongText/.test(f.type));
    const otherFields = p.fields.filter((f) => !longFields.includes(f));
    CC.fill(target,
      req ? requestBar(req, () => {}) : null,
      h('div', { class: 'cc-p-head' },
        ui.avatar(p.photoUrl, name, 72),
        h('div', { class: 'cc-p-headtext' },
          h('div', { class: 'cc-p-name' }, name),
          (p.jobTitle || p.organization) && h('div', { class: 'cc-p-sub' }, [p.jobTitle, p.organization].filter(Boolean).join(' · ')),
          status && h('div', { class: 'cc-p-status' }, status),
          links.length > 0 && h('div', { class: 'cc-chips cc-p-links' }, links))),
      actions.children.length ? actions : null,
      panelSlot,
      bio && h('section', { class: 'cc-p-field' }, h('div', { class: 'cc-p-label' }, 'About'), h('div', { class: 'cc-p-text' }, bio)),
      longFields.map(fieldBlock),
      otherFields.map(fieldBlock));
  };

  // ---------- session rendering ----------
  const personRow = (p) => {
    const name = [p.firstName, p.lastName].filter(Boolean).join(' ');
    // A real link, so Cmd/middle-click and "Open in new tab" work; a plain click stays in the panel.
    const row = h('a', { class: 'cc-person-row', href: pathFor({ kind: 'person', id: p.id }) },
      ui.avatar(p.photoUrl, name, 32),
      h('span', { class: 'cc-person-row-text' },
        h('span', { class: 'cc-person-row-name' }, name),
        (p.jobTitle || p.organization) && h('span', { class: 'cc-person-row-sub' }, [p.jobTitle, p.organization].filter(Boolean).join(' · '))));
    row.addEventListener('click', (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      show({ kind: 'person', id: p.id });
    });
    return row;
  };

  const renderSession = (s) => {
    titleEl.textContent = s.title;
    const seats = s.maxSeats ? (s.remainingSeats > 0 ? `${s.remainingSeats} of ${s.maxSeats} seats left` : 'No seats left') : null;
    const toggle = ui.button(s.attending ? 'Remove from schedule' : 'Add to schedule', {
      variant: s.attending ? 'secondary' : 'primary',
      onClick: async () => {
        const now = await CC.data.toggleSession(s.id);
        s.attending = now;
        toggle.textContent = now ? 'Remove from schedule' : 'Add to schedule';
        toggle.className = 'cc-btn ' + (now ? 'cc-btn-secondary' : 'cc-btn-primary');
        status.textContent = now ? 'In your schedule ✓' : '';
        ui.toast(now ? `Added “${s.title}”` : `Removed “${s.title}”`, 'success');
      },
    });
    if (!s.attending && s.maxSeats && s.remainingSeats <= 0) { toggle.disabled = true; toggle.textContent = 'Full'; }
    const status = h('div', { class: 'cc-p-status' }, s.attending ? 'In your schedule ✓' : '');
    const desc = CC.safeHtml(s.html);
    CC.fill(body,
      h('div', { class: 'cc-s-head' },
        h('div', { class: 'cc-p-name' }, s.title),
        h('div', { class: 'cc-p-sub' }, `${ui.day(s.start)} · ${ui.range(s.start, s.end)}`),
        s.place && h('div', { class: 'cc-p-sub' }, '📍 ' + s.place),
        seats && h('div', { class: 'cc-p-sub' + (s.remainingSeats > 0 ? '' : ' cc-danger') }, seats),
        status,
        s.tags.length > 0 && h('div', { class: 'cc-chips cc-p-links' }, s.tags.map((t) => h('span', { class: 'cc-chip' }, t)))),
      (s.canBookmark || s.attending || s.maxSeats) ? h('div', { class: 'cc-row cc-p-actions' }, toggle) : null,
      desc && h('section', { class: 'cc-p-field' }, h('div', { class: 'cc-p-label' }, 'About'), h('div', { class: 'cc-p-text cc-s-desc', html: desc })),
      s.speakers.length > 0 && h('section', { class: 'cc-p-field' },
        h('div', { class: 'cc-p-label' }, s.speakers.length > 1 ? 'Speakers' : 'Speaker'),
        h('div', { class: 'cc-person-list' }, s.speakers.map(personRow))),
      h('section', { class: 'cc-p-field' },
        h('div', { class: 'cc-p-label' }, `Registered (${s.attendeeCount})`),
        s.attendees.length
          ? h('div', { class: 'cc-person-list' }, s.attendees.map(personRow))
          : h('div', { class: 'cc-muted cc-small' }, 'Nobody yet.')));
  };

  // ---------- showing a view, with history ----------
  const skeleton = () => h('div', { class: 'cc-p-loading' }, h('div', { class: 'cc-skel cc-skel-avatar' }), h('div', { class: 'cc-skel' }), h('div', { class: 'cc-skel cc-skel-short' }));

  // view: { kind: 'person' | 'session', id, request? }. push: keep the current view for Back.
  const show = async (view, { push = true } = {}) => {
    build();
    const wasOpen = !root.hidden;
    if (push && wasOpen && current && !(current.kind === view.kind && current.id === view.id)) stack.push(current);
    if (!wasOpen) stack = [];
    current = view;
    backBtn.hidden = !stack.length;
    const token = ++openToken;
    titleEl.textContent = 'Loading…';
    body.replaceChildren(skeleton());
    root.hidden = false;
    document.documentElement.classList.add('cc-drawer-open');
    try {
      if (view.kind === 'session') {
        const s = await CC.data.session(view.id);
        if (token !== openToken) return;
        renderSession(s);
      } else {
        const [p, reqs] = await Promise.all([CC.data.person(view.id), view.request ? Promise.resolve(null) : CC.data.requests().catch(() => [])]);
        if (token !== openToken) return;
        renderProfile(p, view.request || (reqs || []).find((r) => r.personId === view.id) || null);
      }
      body.scrollTop = 0;
    } catch (e) {
      if (token !== openToken) return;
      CC.warn('drawer', e);
      titleEl.textContent = view.kind === 'session' ? 'Session' : 'Profile';
      body.replaceChildren(h('div', { class: 'cc-empty' }, 'Couldn’t load this. Use “Full page” instead.'));
    }
  };
  const open = (personId, { request } = {}) => show({ kind: 'person', id: personId, request });
  const openSession = (id) => show({ kind: 'session', id });

  // ---------- intercept navigation to people and sessions ----------
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.closest('.cc-drawer')) return;
    // Let Swapcard's own buttons inside a row (Connect, Message…) work normally.
    if (e.target.closest('button') && a.contains(e.target.closest('button'))) return;
    let url;
    try { url = new URL(a.href, location.href); } catch { return; }
    const view = url.origin === location.origin && viewFor(url.pathname);
    if (!view) return;
    e.preventDefault();
    e.stopPropagation();
    ui.hideHoverCard();
    show(view);
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root && !root.hidden) close();
  });

  // Some lists navigate with router.push instead of <a>; catch those too.
  const patchRouter = () => {
    const router = window.next && window.next.router;
    if (!router || router.__ccPatched) return !!router;
    const orig = router.push.bind(router);
    router.push = (url, as, opts) => {
      const target = typeof as === 'string' ? as : typeof url === 'string' ? url : (url && url.pathname) || '';
      let path = target;
      try { path = new URL(target, location.href).pathname; } catch {}
      const view = viewFor(path);
      if (view && !CC.allowNavigation) {
        show(view);
        return Promise.resolve(true);
      }
      return orig(url, as, opts);
    };
    router.__ccPatched = true;
    return true;
  };
  CC.waitFor(patchRouter, { timeout: 30000, every: 250 });

  // Render a profile into any element (used by the inbox's right column).
  const renderInto = async (el, personId) => {
    el.dataset.ccPerson = personId;
    CC.fill(el, h('div', { class: 'cc-p-loading' }, h('div', { class: 'cc-skel cc-skel-avatar' }), h('div', { class: 'cc-skel' }), h('div', { class: 'cc-skel cc-skel-short' })));
    try {
      const [p, reqs] = await Promise.all([CC.data.person(personId), CC.data.requests().catch(() => [])]);
      if (el.dataset.ccPerson !== personId) return;
      renderProfile(p, (reqs || []).find((r) => r.personId === personId) || null, el);
    } catch (e) {
      CC.warn('profile', e);
      CC.fill(el, h('div', { class: 'cc-empty' }, 'Couldn’t load this profile.'));
    }
  };

  CC.drawer = { open, openPerson: open, openSession, show, close, renderInto, isOpen: () => !!root && !root.hidden };
})();
