// Inbox mod: Swapcard's Messages page becomes one inbox, like email: a list of people on the
// left (requests and chats merged per person, "needs you" first), Swapcard's own conversation
// in the middle with any pending request pinned on top, and the full profile on the right.
// Keyboard: J/K move, A accept, D decline, R reply, / search.
(() => {
  const CC = window.CalmerCard;
  if (!CC || CC.isEmbed || CC.inbox) return;
  const { h, sc, ui } = CC;

  const inboxPath = () => `/event/${CC.route().slug}/messages`;
  const isMessagesPage = () => CC.route().page === 'messages';

  // ---------- counts for the nav badge ----------
  let counts = { requests: 0, unread: 0 };
  const refreshCounts = async () => {
    try {
      const reqs = await CC.data.requests();
      counts.requests = reqs.filter((r) => r.incoming).length;
    } catch (e) { CC.log('requests count', e); }
    try {
      const d = await CC.query('query CalmerCardUnread { viewer { channelWithUnreadMessageCount } }', {}, { client: 'chat' });
      counts.unread = (d.viewer && d.viewer.channelWithUnreadMessageCount) || 0;
    } catch (e) { CC.log('unread count', e); }
    updateBadge();
  };
  const updateBadge = () => {
    const n = counts.requests + counts.unread;
    CC.$$('.cc-nav-badge').forEach((b) => {
      b.textContent = n > 9 ? '9+' : String(n);
      b.hidden = !n;
    });
  };

  // ---------- nav item ----------
  const injectNav = () => {
    if (!CC.route().slug || document.querySelector('.cc-nav-inbox')) return;
    const sched = CC.nav && CC.nav.scheduleLink();
    if (!sched) return;
    const item = sched.cloneNode(true);
    item.classList.add('cc-nav-inbox');
    item.removeAttribute('aria-current');
    item.href = inboxPath();
    // Replace the label text but keep their styling wrapper.
    const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
    let t, label = null;
    while ((t = walker.nextNode())) {
      if (!t.nodeValue.trim()) continue;
      t.nodeValue = label ? '' : 'Inbox';
      label = label || t.parentElement;
    }
    // Right after the word, not after the link's padding.
    (label || item).append(h('span', { class: 'cc-nav-badge', hidden: true }, '0'));
    item.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      const router = window.next && window.next.router;
      router ? router.push(inboxPath()) : location.assign(inboxPath());
    });
    // Right after Schedule, the other main view.
    const slot = sched.closest('li') || sched;
    const wrapped = slot === sched ? item : (() => { const li = slot.cloneNode(false); li.append(item); return li; })();
    slot.parentElement.insertBefore(wrapped, slot.nextSibling);
    updateBadge();
  };

  // The bell becomes a shortcut to the inbox.
  const retireBell = () => {
    const bell = CC.$$('button[aria-label="Notifications"], [aria-label="Notifications"]').find((b) => !b.dataset.ccBell);
    if (!bell) return;
    bell.dataset.ccBell = '1';
    bell.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const router = window.next && window.next.router;
      router ? router.push(inboxPath()) : location.assign(inboxPath());
    }, true);
    bell.title = 'Inbox';
  };

  // ---------- the merged list ----------
  // One entry per person: their chat (if any) plus their pending request (if any).
  const buildEntries = (chats, reqs) => {
    const byPerson = new Map();
    const entries = [];
    for (const c of chats) {
      const e = { key: c.channelId, chat: c, request: null, personId: c.personId, name: c.title, photoUrl: c.photoUrl, sub: '' };
      entries.push(e);
      if (c.personId && !c.isGroup) byPerson.set(c.personId, e);
    }
    for (const r of reqs) {
      const name = [r.user.firstName, r.user.lastName].filter(Boolean).join(' ') || 'Someone';
      const existing = r.personId && byPerson.get(r.personId);
      if (existing) { existing.request = r; existing.sub = [r.user.jobTitle, r.user.organization].filter(Boolean).join(' · '); continue; }
      const e = { key: 'req:' + r.id, chat: null, request: r, personId: r.personId, name, photoUrl: r.user.photoUrl, sub: [r.user.jobTitle, r.user.organization].filter(Boolean).join(' · ') };
      entries.push(e);
      if (r.personId) byPerson.set(r.personId, e);
    }
    for (const e of entries) {
      const r = e.request;
      e.needsYou = !!(r && r.incoming) || !!(e.chat && e.chat.unread > 0);
      e.waiting = !!(r && !r.incoming);
      e.at = Math.max((e.chat && e.chat.last && +e.chat.last.at) || 0, (r && r.sentAt && +r.sentAt) || 0);
    }
    const group = (e) => (e.needsYou ? 0 : e.waiting ? 1 : 2);
    return entries.sort((a, b) => group(a) - group(b) || b.at - a.at);
  };

  // Is a meeting request's time free in your schedule?
  const freeness = (req, agenda) => {
    if (!req || !req.meeting) return null;
    const m = req.meeting;
    const clash = agenda.find((a) => a.id !== m.id && a.start < m.end && a.end > m.start && !(a.kind === 'meeting' && /DECLINED|CANCELED/.test(a.status || '')));
    return clash ? { free: false, text: `Clashes with ${clash.title}` } : { free: true, text: 'You’re free then' };
  };

  // What the person wants / said, in one line.
  const whatLine = (e, agenda) => {
    const r = e.request;
    if (r && r.incoming && r.isMeeting) {
      const f = freeness(r, agenda);
      return h('span', { class: 'cc-ib-what cc-ib-meeting' },
        r.meeting ? `Meeting · ${ui.day(r.meeting.start)} ${ui.time(r.meeting.start)}` : 'Meeting request',
        f && h('span', { class: f.free ? 'cc-ib-free' : 'cc-ib-clash' }, f.free ? ' · free' : ' · clash'));
    }
    if (r && r.incoming) return h('span', { class: 'cc-ib-what cc-ib-connect' }, 'Wants to connect');
    if (e.chat && e.chat.last) return h('span', { class: 'cc-ib-what' }, (e.chat.last.fromMe ? 'You: ' : '') + e.chat.last.text.replace(/\s+/g, ' ').trim());
    if (r && !r.incoming) return h('span', { class: 'cc-ib-what' }, r.isMeeting ? 'You requested a meeting · waiting' : 'You asked to connect · waiting');
    return h('span', { class: 'cc-ib-what' }, '');
  };

  let state = { filter: 'all', query: '', selectedKey: null, entries: [], agenda: [] };
  const chatPath = (channelId) => `/event/${CC.route().slug}/messages/channel/${channelId}?chatUserId=${encodeURIComponent(CC._meUserId || '')}`;
  const currentChannelId = () => (location.pathname.match(/\/messages\/channel\/([^/?#]+)/) || [])[1] || null;

  const visibleEntries = () => state.entries.filter((e) =>
    (state.filter === 'all' || e.needsYou) &&
    (!state.query || e.name.toLowerCase().includes(state.query.toLowerCase())));

  const select = (e) => {
    if (!e) return;
    state.selectedKey = e.key;
    if (e.chat) {
      requestOnly = null;
      if (currentChannelId() !== e.chat.channelId) {
        const router = window.next && window.next.router;
        router ? router.push(chatPath(e.chat.channelId)) : location.assign(chatPath(e.chat.channelId));
      }
    } else {
      requestOnly = e; // no conversation yet: show the request card instead of a chat
    }
    renderList();
    renderMain();
    renderSideProfile(true);
  };

  const rowFor = (e) => {
    const selected = e.key === state.selectedKey;
    const row = h('div', {
      class: 'cc-ib-row' + (selected ? ' cc-selected' : '') + (e.needsYou ? ' cc-ib-needs' : ''),
      tabindex: '0', role: 'option', 'aria-selected': String(selected), 'data-key': e.key,
    },
    ui.avatar(e.photoUrl, e.name, 40),
    h('div', { class: 'cc-ib-body' },
      h('div', { class: 'cc-ib-top' },
        h('span', { class: 'cc-ib-name' }, e.name),
        e.at ? h('span', { class: 'cc-ib-time' }, ui.relative(new Date(e.at))) : null),
      whatLine(e, state.agenda)),
    e.needsYou ? h('span', { class: 'cc-ib-dot', 'aria-label': 'Needs you' }) : null);
    row.addEventListener('click', () => select(e));
    return row;
  };

  let listEl = null;
  const renderList = () => {
    if (!listEl) return;
    const needs = state.entries.filter((e) => e.needsYou).length;
    const list = visibleEntries();
    const tab = (id, label) => {
      const b = h('button', { type: 'button', class: 'cc-ib-tab' + (state.filter === id ? ' cc-selected' : ''), 'aria-pressed': String(state.filter === id) }, label);
      b.addEventListener('click', () => { state.filter = id; renderList(); });
      return b;
    };
    const search = h('input', { type: 'search', class: 'cc-ib-search', placeholder: 'Search people', value: state.query, 'aria-label': 'Search people' });
    search.addEventListener('input', () => { state.query = search.value; renderList(); const s = listEl.querySelector('.cc-ib-search'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); });
    CC.fill(listEl,
      h('div', { class: 'cc-ib-bar' },
        h('div', { class: 'cc-row' }, tab('needs', `Needs you${needs ? ` (${needs})` : ''}`), tab('all', 'All')),
        search),
      list.length
        ? h('div', { class: 'cc-ib-list', role: 'listbox', 'aria-label': 'Conversations' }, list.map(rowFor))
        : h('div', { class: 'cc-empty' }, state.filter === 'needs' ? 'Nothing needs you right now.' : 'No conversations yet.'),
      h('div', { class: 'cc-ib-keys' }, 'J/K move · A accept · D decline · R reply · / search'));
  };

  // ---------- middle: the request card, pinned above Swapcard's conversation ----------
  let requestOnly = null;
  // inChat: the conversation is shown underneath, so skip the message (it's in the chat already).
  const requestCard = (e, { inChat = false } = {}) => {
    const r = e.request;
    const f = freeness(r, state.agenda);
    const card = h('div', { class: 'cc-ib-card' });
    const done = (msg) => { card.replaceChildren(h('div', { class: 'cc-request-done' }, msg)); };
    const title = r.incoming
      ? (r.isMeeting ? `${e.name.split(' ')[0]} wants to meet` : `${e.name.split(' ')[0]} wants to connect`)
      : (r.isMeeting ? 'You requested a meeting' : 'You asked to connect');
    CC.fill(card,
      h('div', { class: 'cc-ib-card-title' }, title),
      r.meeting && h('div', { class: 'cc-ib-card-when' },
        `${ui.day(r.meeting.start)} · ${ui.range(r.meeting.start, r.meeting.end)}${r.meeting.place ? ' · ' + r.meeting.place : ''}`),
      f && h('div', { class: 'cc-ib-card-free ' + (f.free ? 'cc-ib-free' : 'cc-ib-clash') }, f.text),
      r.message && !inChat && h('div', { class: 'cc-request-msg' }, r.message));
    if (r.incoming) {
      const row = h('div', { class: 'cc-row' },
        ui.button('Accept', { variant: 'primary', onClick: async () => { await CC.data.acceptRequest(r.id); done('Accepted ✓'); ui.toast('Accepted', 'success'); refresh(true); } }),
        ui.button('Decline', { onClick: async () => { await CC.data.declineRequest(r.id); done('Declined'); refresh(true); } }),
        r.isMeeting && e.personId ? ui.button('Suggest another time', { variant: 'ghost', onClick: async () => { CC.drawer.openPerson(e.personId); } }) : null);
      card.append(row);
    }
    return card;
  };

  const renderMain = () => {
    if (!isMessagesPage()) return;
    const { main } = CC.layoutColumns();
    if (!main) return;
    main.querySelector(':scope > .cc-ib-pin')?.remove();
    main.querySelector(':scope > .cc-ib-solo')?.remove();
    main.classList.toggle('cc-ib-solo-on', !!requestOnly);
    if (requestOnly) {
      main.prepend(h('div', { class: 'cc-ib-solo' },
        requestCard(requestOnly),
        h('div', { class: 'cc-muted cc-small cc-ib-solo-note' }, 'No messages with them yet. Accepting a request lets you chat.')));
      return;
    }
    const sel = state.entries.find((e) => e.chat && e.chat.channelId === currentChannelId());
    if (sel && sel.request) main.prepend(h('div', { class: 'cc-ib-pin' }, requestCard(sel, { inChat: true })));
  };

  // ---------- right: full profile ----------
  const renderSideProfile = (force) => {
    if (!isMessagesPage()) return;
    const { asides, main } = CC.layoutColumns();
    const right = asides.find((a) => main && a.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_PRECEDING);
    if (!right) return;
    let personId = requestOnly && requestOnly.personId;
    if (!personId) {
      const link = CC.$$('a[href*="/person/"]', right).find((a) => !a.closest('.cc-side-profile'));
      const m = link && link.getAttribute('href').match(/\/person\/([^/?#]+)/);
      personId = m && m[1];
    }
    let box = right.querySelector(':scope > .cc-side-profile');
    if (!personId) { if (box) box.remove(); right.classList.remove('cc-has-side-profile'); return; }
    if (box && box.dataset.ccPerson === personId && !force) return;
    if (!box) {
      box = h('div', { class: 'cc-side-profile cc-drawer-body' });
      right.prepend(box);
    }
    right.classList.add('cc-has-side-profile');
    CC.drawer.renderInto(box, personId, { withRequest: false });
  };

  // ---------- data + mounting ----------
  let loading = false;
  const refresh = async (force) => {
    if (!isMessagesPage() || loading) return;
    loading = true;
    try {
      if (force) { CC.data.invalidate('chats'); CC.data.invalidate('requests'); CC.data.invalidate('agenda:'); }
      const ev = await CC.data.event();
      CC._meUserId = ev.me.userId;
      const [chats, reqs, agenda] = await Promise.all([CC.data.chats(), CC.data.requests(), CC.data.agenda().catch(() => [])]);
      state.entries = buildEntries(chats, reqs);
      state.agenda = agenda;
      // Keep the selection in sync with the open conversation.
      if (!requestOnly) {
        const open = state.entries.find((e) => e.chat && e.chat.channelId === currentChannelId());
        if (open) state.selectedKey = open.key;
      } else {
        requestOnly = state.entries.find((e) => e.key === requestOnly.key) || null;
      }
      renderList();
      renderMain();
    } catch (e) {
      CC.warn('inbox', e);
    } finally {
      loading = false;
    }
  };

  const mount = () => {
    if (!isMessagesPage()) return;
    const { asides } = CC.layoutColumns();
    const left = asides[0];
    if (!left) return;
    left.classList.add('cc-ib-owned');
    if (!left.querySelector(':scope > .cc-ib')) {
      listEl = h('div', { class: 'cc-ib' });
      left.prepend(listEl);
      refresh(false);
    } else {
      listEl = left.querySelector(':scope > .cc-ib');
    }
    const { main } = CC.layoutColumns();
    if (main && !main.querySelector(':scope > .cc-ib-pin, :scope > .cc-ib-solo') && (requestOnly || state.entries.some((e) => e.request && e.chat && e.chat.channelId === currentChannelId()))) renderMain();
    renderSideProfile(false);
  };

  // ---------- keyboard ----------
  document.addEventListener('keydown', (e) => {
    if (!isMessagesPage() || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t instanceof Element && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) {
      if (e.key === 'Escape' && t.classList.contains('cc-ib-search')) { t.blur(); }
      return;
    }
    if (CC.drawer && CC.drawer.isOpen()) return;
    const list = visibleEntries();
    const i = list.findIndex((x) => x.key === state.selectedKey);
    const cur = list[i];
    const key = e.key.toLowerCase();
    if (key === 'j' || key === 'arrowdown') { e.preventDefault(); select(list[Math.min(list.length - 1, i + 1)] || list[0]); scrollToSelected(); }
    else if (key === 'k' || key === 'arrowup') { e.preventDefault(); select(list[Math.max(0, i - 1)] || list[0]); scrollToSelected(); }
    else if (key === 'a' && cur && cur.request && cur.request.incoming) { e.preventDefault(); document.querySelector('.cc-ib-card .cc-btn-primary')?.click(); }
    else if (key === 'd' && cur && cur.request && cur.request.incoming) { e.preventDefault(); [...document.querySelectorAll('.cc-ib-card .cc-btn')].find((b) => b.textContent === 'Decline')?.click(); }
    else if (key === 'r') {
      const box = CC.layoutColumns().main && CC.layoutColumns().main.querySelector('textarea, [contenteditable="true"], input[type="text"]');
      if (box) { e.preventDefault(); box.focus(); }
    } else if (key === '/') { e.preventDefault(); document.querySelector('.cc-ib-search')?.focus(); }
  });
  const scrollToSelected = () => document.querySelector('.cc-ib-row.cc-selected')?.scrollIntoView({ block: 'nearest' });

  CC.inbox = { refreshCounts, refresh, renderSideProfile };
  CC.on('dom', () => { injectNav(); retireBell(); mount(); });
  CC.on('route', () => {
    refreshCounts();
    if (!isMessagesPage()) { requestOnly = null; return; }
    if (!requestOnly) {
      const open = state.entries.find((e) => e.chat && e.chat.channelId === currentChannelId());
      if (open) state.selectedKey = open.key;
    }
    // Opening a chat marks it read; refresh the list shortly after.
    setTimeout(() => refresh(true), 1500);
    renderList();
    renderMain();
  });
  CC.on('requests-changed', () => { refreshCounts(); setTimeout(() => refresh(true), 300); });
  CC.on('drawer-closed', () => { CC.data.invalidate('requests'); refreshCounts(); if (isMessagesPage()) refresh(true); });
  setInterval(() => { if (!document.hidden) { refreshCounts(); if (isMessagesPage()) refresh(true); } }, 30000);
  CC.waitFor(() => CC.clients().main, { timeout: 30000 }).then((ok) => ok && refreshCounts());
})();
