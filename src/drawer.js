// Profile drawer: clicking any person opens their profile in a side panel instead of
// navigating away. Swapcard forbids framing its own pages (CSP frame-ancestors), so we
// render the profile from their data with their theme, and act on it in place:
// accept/decline requests, connect, and book a meeting on a calendar of mutual free time.
(() => {
  const CC = window.CalmerCard;
  if (!CC || CC.isEmbed || CC.drawer) return;
  const { h, ui } = CC;

  const PERSON_RE = /^\/event\/([^/]+)\/person\/([^/?#]+)/;
  const HIDDEN_FIELDS = /visibility in attendee data sheet/i;

  let root, body, titleEl, currentId = null, openToken = 0;

  const build = () => {
    if (root) return;
    titleEl = h('div', { class: 'cc-drawer-title' }, 'Profile');
    const fullLink = h('a', { class: 'cc-btn cc-btn-ghost', href: '#', title: 'Open Swapcard’s full profile page (chat, sessions, notes)' }, 'Full page ↗');
    fullLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (!currentId) return;
      const path = `/event/${CC.route().slug}/person/${currentId}`;
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
        h('div', { class: 'cc-drawer-head' }, titleEl, h('div', { class: 'cc-row' }, fullLink, closeBtn)),
        body));
    root.querySelector('.cc-drawer-scrim').addEventListener('click', () => close());
    document.body.append(root);
  };

  const close = () => {
    if (!root || root.hidden) return;
    root.hidden = true;
    currentId = null;
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

  const open = async (personId, { request } = {}) => {
    build();
    const token = ++openToken;
    currentId = personId;
    titleEl.textContent = 'Loading…';
    body.replaceChildren(h('div', { class: 'cc-p-loading' }, h('div', { class: 'cc-skel cc-skel-avatar' }), h('div', { class: 'cc-skel' }), h('div', { class: 'cc-skel cc-skel-short' })));
    root.hidden = false;
    document.documentElement.classList.add('cc-drawer-open');
    try {
      const [p, reqs] = await Promise.all([CC.data.person(personId), request ? Promise.resolve(null) : CC.data.requests().catch(() => [])]);
      if (token !== openToken) return;
      const req = request || (reqs || []).find((r) => r.personId === personId) || null;
      renderProfile(p, req);
      body.scrollTop = 0;
    } catch (e) {
      if (token !== openToken) return;
      CC.warn('drawer', e);
      titleEl.textContent = 'Profile';
      body.replaceChildren(h('div', { class: 'cc-empty' }, 'Couldn’t load this profile. Use “Full page” instead.'));
    }
  };

  // ---------- intercept navigation to profiles ----------
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.closest('.cc-drawer')) return;
    // Let Swapcard's own buttons inside a row (Connect, Message…) work normally.
    if (e.target.closest('button') && a.contains(e.target.closest('button'))) return;
    let url;
    try { url = new URL(a.href, location.href); } catch { return; }
    const m = url.origin === location.origin && url.pathname.match(PERSON_RE);
    if (!m) return;
    e.preventDefault();
    e.stopPropagation();
    open(m[2]);
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
      const m = path.match(PERSON_RE);
      if (m && !CC.allowNavigation && CC.route().page !== 'my-profile') {
        open(m[2]);
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

  CC.drawer = { open, openPerson: open, close, renderInto, isOpen: () => !!root && !root.hidden };
})();
