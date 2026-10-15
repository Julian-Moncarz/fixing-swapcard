// Inbox mod: Swapcard's Messages page becomes the one inbox. Pending meeting and
// connection requests sit above their chat threads; click one to see the profile
// in the drawer and answer it there. Adds an "Inbox" nav item and retires the bell.
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
    CC.$$('.cc-nav-badge').forEach((b) => { b.textContent = n > 99 ? '99+' : String(n); b.hidden = !n; });
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
    let t, done = false;
    while ((t = walker.nextNode())) {
      if (!t.nodeValue.trim()) continue;
      t.nodeValue = done ? '' : 'Inbox';
      done = true;
    }
    item.append(h('span', { class: 'cc-nav-badge', hidden: true }, '0'));
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

  // ---------- requests section on the Messages page ----------
  const requestRow = (r) => {
    const name = [r.user.firstName, r.user.lastName].filter(Boolean).join(' ') || 'Someone';
    const kind = r.isMeeting
      ? (r.meeting ? `Meeting · ${ui.day(r.meeting.start)} ${ui.time(r.meeting.start)}` : 'Meeting request')
      : 'Wants to connect';
    const actions = h('div', { class: 'cc-row cc-request-actions' });
    if (r.incoming) {
      const finish = (label) => { row.classList.add('cc-done'); actions.replaceChildren(h('span', { class: 'cc-muted' }, label)); };
      actions.append(
        ui.button('Accept', { variant: 'primary', onClick: async () => { await CC.data.acceptRequest(r.id); finish('Accepted ✓'); } }),
        ui.button('Decline', { variant: 'secondary', onClick: async () => { await CC.data.declineRequest(r.id); finish('Declined'); } }));
    } else {
      actions.append(h('span', { class: 'cc-muted' }, 'Sent, waiting'));
    }
    const row = h('div', { class: 'cc-request-row' + (r.seen ? '' : ' cc-unseen'), tabindex: '0', role: 'button', 'aria-label': `${kind} from ${name}` },
      ui.avatar(r.user.photoUrl, name, 40),
      h('div', { class: 'cc-request-body' },
        h('div', { class: 'cc-request-top' },
          h('span', { class: 'cc-request-name' }, name),
          r.sentAt && h('span', { class: 'cc-muted cc-small' }, ui.relative(r.sentAt))),
        h('div', { class: 'cc-small cc-request-sub' }, [r.user.jobTitle, r.user.organization].filter(Boolean).join(' · ')),
        h('div', { class: 'cc-small cc-request-kind-label' + (r.isMeeting ? ' cc-meeting' : '') }, kind),
        r.message && h('div', { class: 'cc-small cc-request-snippet' }, r.message),
        actions));
    const openIt = (e) => {
      if (e.target.closest('button')) return;
      if (r.personId) CC.drawer.openPerson(r.personId, { request: r });
    };
    row.addEventListener('click', openIt);
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter') openIt(e); });
    return row;
  };

  let renderingReqs = false, lastReqSig = '';
  const renderRequests = async (force) => {
    if (!isMessagesPage() || renderingReqs) return;
    const aside = CC.layoutColumns().asides[0];
    if (!aside) return;
    const existing = aside.querySelector('.cc-requests');
    if (existing && !force) return;
    renderingReqs = true;
    try {
      const reqs = await CC.data.requests();
      const incoming = reqs.filter((r) => r.incoming);
      const sent = reqs.filter((r) => !r.incoming);
      const sig = reqs.map((r) => r.id).join(',');
      if (existing && sig === lastReqSig && !force) return;
      lastReqSig = sig;
      const section = h('section', { class: 'cc-requests', 'aria-label': 'Requests' },
        h('div', { class: 'cc-section-head' },
          h('span', null, 'Requests'),
          h('span', { class: 'cc-count' }, String(incoming.length))),
        incoming.length ? incoming.map(requestRow) : h('div', { class: 'cc-empty' }, 'No pending requests. You’re all caught up.'),
        sent.length ? h('details', { class: 'cc-sent' },
          h('summary', null, `Sent and waiting (${sent.length})`),
          sent.map(requestRow)) : null,
        h('div', { class: 'cc-section-head cc-section-head-chats' }, h('span', null, 'Messages')));
      (aside.querySelector('.cc-requests') || null)?.remove();
      aside.prepend(section);
    } catch (e) {
      CC.warn('inbox', e);
    } finally {
      renderingReqs = false;
    }
  };

  // ---------- full profile of the person you're chatting with, in the right column ----------
  const renderSideProfile = () => {
    if (!isMessagesPage()) return;
    const { asides, main } = CC.layoutColumns();
    const right = asides.find((a) => main && a.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_PRECEDING);
    if (!right) return;
    const link = CC.$$('a[href*="/person/"]', right).find((a) => !a.closest('.cc-side-profile'));
    const m = link && link.getAttribute('href').match(/\/person\/([^/?#]+)/);
    let box = right.querySelector(':scope > .cc-side-profile');
    if (!m) { if (box) box.remove(); right.classList.remove('cc-has-side-profile'); return; }
    const personId = m[1];
    if (box && box.dataset.ccPerson === personId) return;
    if (!box) {
      box = h('div', { class: 'cc-side-profile cc-drawer-body' });
      right.prepend(box);
    }
    right.classList.add('cc-has-side-profile');
    CC.drawer.renderInto(box, personId);
  };

  CC.inbox = { refreshCounts, renderRequests, renderSideProfile };
  CC.on('dom', () => { injectNav(); retireBell(); renderRequests(false); renderSideProfile(); });
  CC.on('route', () => { lastReqSig = ''; refreshCounts(); });
  CC.on('requests-changed', () => { refreshCounts(); setTimeout(() => renderRequests(true), 300); });
  CC.on('drawer-closed', () => { CC.data.invalidate('requests'); refreshCounts(); if (isMessagesPage()) renderRequests(true); });
  setInterval(() => { if (!document.hidden) { CC.data.invalidate('requests'); refreshCounts(); if (isMessagesPage()) renderRequests(true); } }, 60000);
  CC.waitFor(() => CC.clients().main, { timeout: 30000 }).then((ok) => ok && refreshCounts());
})();
