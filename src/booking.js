// Booking mod: in Swapcard's own Meet modal, the "Date & time" step gets a calendar of
// your days (meetings + sessions) with the slots you're BOTH free highlighted. Picking
// one clicks Swapcard's matching slot chip, so the rest of their flow is unchanged.
(() => {
  const CC = window.CalmerCard;
  if (!CC || CC.booking) return;
  const { h, ui } = CC;

  const TIME_RE = /^(\d{1,2}):(\d{2})\s*(AM|PM)?/i;

  const dialogs = () => CC.$$('[role="dialog"], [aria-modal="true"]').filter((d) => d.offsetParent !== null || d.getClientRects().length);
  const meetDialog = () => dialogs().find((d) => /Date & time/.test(d.textContent) && /(Send meeting request|See more slots|Select one of)/.test(d.textContent));
  const chipButtons = (root) => CC.$$('button', root).filter((b) => TIME_RE.test(b.textContent.trim()) && !b.closest('.cc-book'));

  // Read the slots Swapcard itself loaded for this modal (exact same participants).
  const theirSlots = () => {
    const c = CC.clients().main;
    if (!c || !c.getObservableQueries) return null;
    let best = null;
    for (const oq of c.getObservableQueries('active').values()) {
      const name = oq.queryName || (oq.options && oq.options.query && oq.options.query.definitions[0].name && oq.options.query.definitions[0].name.value);
      if (name !== 'MeetSlotsQuery' && name !== 'MeetSlotsAvailableQuery') continue;
      const res = oq.getCurrentResult();
      const nodes = res && res.data && res.data.event && res.data.event.availableMeetingSlots && res.data.event.availableMeetingSlots.nodes;
      if (nodes && nodes.length && nodes[0].starts) {
        const cand = { peopleIds: (oq.variables && oq.variables.peopleIds) || [], nodes };
        if (!best || nodes.length > best.nodes.length) best = cand;
      }
    }
    return best;
  };

  const loadSlots = async () => {
    const theirs = theirSlots();
    if (theirs && theirs.nodes.length > 8) {
      return { peopleIds: theirs.peopleIds, slots: theirs.nodes.map((s) => ({ id: s.id, start: new Date(s.starts), end: new Date(s.ends) })) };
    }
    // Their overview only fetches a few; fetch the full range for the same people.
    const peopleIds = (theirs && theirs.peopleIds) || (CC.route().page === 'person' ? [CC.route().id] : []);
    if (!peopleIds.length) return { peopleIds, slots: theirs ? theirs.nodes.map((s) => ({ id: s.id, start: new Date(s.starts), end: new Date(s.ends) })) : [] };
    return { peopleIds, slots: await CC.data.mutualSlots(peopleIds) };
  };

  // ---- clicking Swapcard's matching chip ----
  const sameTime = (btn, date) => {
    const m = btn.textContent.trim().match(TIME_RE);
    if (!m) return false;
    let hh = +m[1] % 12;
    if (m[3] && m[3].toUpperCase() === 'PM') hh += 12;
    if (!m[3]) hh = +m[1];
    return hh * 60 + +m[2] === ui.minutes(date);
  };
  const dayNumberOf = (el) => {
    // Find the nearest preceding date label (e.g. "Fri, Oct 16, 2026" or a "Friday / Oct 16" column header).
    const txt = el.textContent || '';
    const m = txt.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})/);
    return m ? +m[1] : null;
  };
  const chipDay = (btn, dlg) => {
    // Column layout: header cells share the chip's x range.
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const headers = CC.$$('*', dlg).filter((e) => e.children.length <= 2 && /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*/.test(e.textContent.trim()) && e.textContent.length < 30);
    let best = null, bestD = Infinity;
    for (const hd of headers) {
      const hr = hd.getBoundingClientRect();
      if (hr.top > r.top) continue;
      const d = Math.abs(hr.left + hr.width / 2 - cx) + (r.top - hr.top) / 50;
      if (d < bestD) { bestD = d; best = hd; }
    }
    return best ? dayNumberOf(best) : null;
  };
  const dayOfMonth = (d) => +new Intl.DateTimeFormat('en-US', { timeZone: CC._tz, day: 'numeric' }).format(d);

  const clickTheirSlot = async (slot) => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const dlg = meetDialog() || dialogs().find((d) => /Date & time/.test(d.textContent));
      if (!dlg) return false;
      const chip = chipButtons(dlg).find((b) => sameTime(b, slot.start) && (chipDay(b, dlg) == null || chipDay(b, dlg) === dayOfMonth(slot.start)));
      if (chip) { chip.click(); return true; }
      const more = CC.$$('button, a', dlg).find((b) => b.textContent.trim() === 'See more slots' && !b.closest('.cc-book'));
      if (!more) return false;
      more.click();
      await CC.sleep(700);
    }
    return false;
  };

  // ---- our panel ----
  let busy = false;
  const inject = async () => {
    const dlg = meetDialog();
    if (!dlg || busy || dlg.querySelector('.cc-book')) return;
    const chips = chipButtons(dlg);
    if (!chips.length) return;
    busy = true;
    try {
      const ev = await CC.data.event();
      CC._tz = ev.timezone;
      const anchor = chips[0].closest('div');
      const host = anchor && anchor.parentElement && anchor.parentElement.parentElement;
      if (!host || dlg.querySelector('.cc-book')) return;
      const panel = h('div', { class: 'cc-book' }, h('div', { class: 'cc-muted cc-small' }, 'Loading your calendar…'));
      host.insertBefore(panel, host.firstChild);
      const [{ slots }, agenda] = await Promise.all([loadSlots(), CC.data.agenda()]);
      const keys = [...new Set(slots.map((s) => ui.dayKey(s.start)))].sort();
      const days = keys.map((k) => ({ key: k, label: ui.day(slots.find((s) => ui.dayKey(s.start) === k).start) }));
      let dayIdx = 0;
      const draw = () => {
        if (!days.length) {
          panel.replaceChildren(h('div', { class: 'cc-empty' }, 'No times when you’re both free.'));
          return;
        }
        const day = days[dayIdx];
        const tabs = h('div', { class: 'cc-book-tabs', role: 'tablist' }, days.map((d, i) => {
          const b = h('button', { type: 'button', role: 'tab', class: 'cc-book-tab' + (i === dayIdx ? ' cc-selected' : ''), 'aria-selected': String(i === dayIdx) }, d.label);
          b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); dayIdx = i; draw(); });
          return b;
        }));
        const grid = ui.dayGrid({
          days: [day],
          items: agenda,
          slots,
          onPick: async (s) => {
            panel.classList.add('cc-picking');
            const ok = await clickTheirSlot(s);
            panel.classList.remove('cc-picking');
            if (!ok) ui.toast('Couldn’t select that time in Swapcard’s list. Try picking it below.', 'error', 6000);
          },
        });
        panel.replaceChildren(
          h('div', { class: 'cc-book-head' },
            h('span', null, 'Pick a time you’re both free'),
            h('span', { class: 'cc-legend' },
              h('span', { class: 'cc-legend-swatch cc-grid-slot' }), 'free for both ',
              h('span', { class: 'cc-legend-swatch cc-grid-meeting' }), 'your meetings ',
              h('span', { class: 'cc-legend-swatch cc-grid-session' }), 'your sessions')),
          tabs,
          h('div', { class: 'cc-book-scroll' }, grid));
        // Scroll to the first free slot of the day.
        const first = panel.querySelector('.cc-grid-slot:not(.cc-legend-swatch)');
        if (first) panel.querySelector('.cc-book-scroll').scrollTop = Math.max(0, first.offsetTop - 60);
      };
      draw();
      dlg.classList.add('cc-book-active');
    } catch (e) {
      CC.warn('booking', e);
      dlg.querySelector('.cc-book')?.remove();
    } finally {
      busy = false;
    }
  };

  CC.booking = { inject, theirSlots, clickTheirSlot };
  CC.on('dom', inject);
})();
