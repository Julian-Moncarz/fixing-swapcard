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
  // Swapcard's slot chips are div.time-slot__Wrapper (buttons as a fallback).
  const chipButtons = (root) => CC.$$(`${CC.sc('time-slot__Wrapper')}, button`, root)
    .filter((b) => TIME_RE.test(b.textContent.trim()) && !b.closest('.cc-book'));

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
  const MONTH_DAY = /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})/g;
  const chipDay = (btn, dlg) => {
    // Nearest ancestor that mentions exactly one date (e.g. the "Fri, Oct 16, 2026" day group).
    for (let n = btn.parentElement, i = 0; n && n !== dlg && i < 6; n = n.parentElement, i++) {
      const days = [...new Set([...(n.textContent || '').matchAll(MONTH_DAY)].map((m) => +m[1]))];
      if (days.length === 1) return days[0];
      if (days.length > 1) break;
    }
    // Column layout: header cells share the chip's x range.
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const headers = CC.$$('*', dlg).filter((e) => e.children.length <= 2 && e.textContent.length < 30
      && /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*/.test(e.textContent.trim()) && dayNumberOf(e) != null);
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
    const want = dayOfMonth(slot.start);
    for (let attempt = 0; attempt < 8; attempt++) {
      // Topmost dialog first: "See more slots" opens a second dialog on top of the form.
      const dlgs = dialogs().filter((d) => /Date & time/.test(d.textContent)).reverse();
      if (!dlgs.length) return false;
      for (const dlg of dlgs) {
        const chip = chipButtons(dlg).find((b) => sameTime(b, slot.start) && chipDay(b, dlg) === want);
        if (chip) { chip.click(); return true; }
      }
      // Not visible yet: open (or page through) Swapcard's full slot list.
      const top = dlgs[0];
      const more = CC.$$('button, a', top).find((b) => /^See more slots$/.test(b.textContent.trim()) && !b.closest('.cc-book'));
      if (!more) return false;
      more.click();
      await CC.sleep(700);
    }
    return false;
  };

  // ---- shared calendar picker: day tabs + a day grid of your agenda and mutual free slots ----
  const picker = ({ slots, agenda, onPick, selectedId }) => {
    const wrap = h('div', { class: 'cc-book' });
    const keys = [...new Set(slots.map((s) => ui.dayKey(s.start)))].sort();
    const days = keys.map((k) => ({ key: k, label: ui.day(slots.find((s) => ui.dayKey(s.start) === k).start) }));
    let dayIdx = Math.max(0, days.findIndex((d) => selectedId && slots.some((s) => s.id === selectedId && ui.dayKey(s.start) === d.key)));
    const draw = () => {
      if (!days.length) {
        wrap.replaceChildren(h('div', { class: 'cc-empty' }, 'No times when you’re both free. They may have turned off meeting availability, or every shared slot is booked. Try messaging them instead.'));
        return;
      }
      const day = days[dayIdx];
      const tabs = h('div', { class: 'cc-book-tabs', role: 'tablist' }, days.map((d, i) => {
        const n = slots.filter((s) => ui.dayKey(s.start) === d.key).length;
        const b = h('button', { type: 'button', role: 'tab', class: 'cc-book-tab' + (i === dayIdx ? ' cc-selected' : ''), 'aria-selected': String(i === dayIdx) }, `${d.label} · ${n}`);
        b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); dayIdx = i; draw(); });
        return b;
      }));
      const grid = ui.dayGrid({ days: [day], items: agenda, slots, selectedSlotId: selectedId, onPick: (s) => { selectedId = s.id; draw(); onPick(s); } });
      wrap.replaceChildren(
        h('div', { class: 'cc-book-head' },
          h('span', null, 'Pick a time you’re both free'),
          h('span', { class: 'cc-legend' },
            h('span', { class: 'cc-legend-swatch cc-grid-slot' }), 'free for both ',
            h('span', { class: 'cc-legend-swatch cc-grid-meeting' }), 'your meetings ',
            h('span', { class: 'cc-legend-swatch cc-grid-session' }), 'your sessions')),
        tabs,
        h('div', { class: 'cc-book-scroll' }, grid));
      requestAnimationFrame(() => {
        const sc = wrap.querySelector('.cc-book-scroll');
        const target = wrap.querySelector('.cc-grid-slot.cc-selected:not(.cc-legend-swatch)') || wrap.querySelector('.cc-grid-col .cc-grid-slot');
        if (sc && target) sc.scrollTop = Math.max(0, target.offsetTop - 80);
      });
    };
    draw();
    return wrap;
  };

  // ---- booking panel used in the profile drawer (no Swapcard modal there) ----
  const panel = (person, onClose) => {
    const box = h('div', { class: 'cc-p-book' }, h('div', { class: 'cc-muted cc-small' }, 'Finding times you’re both free…'));
    const name = person.firstName || 'them';
    (async () => {
      try {
        const [slots, agenda] = await Promise.all([CC.data.mutualSlots([person.id]), CC.data.agenda()]);
        let chosen = null;
        const details = h('div', { class: 'cc-p-bookdetails' });
        const showDetails = async (slot) => {
          chosen = { slot, placeId: null };
          details.replaceChildren(h('div', { class: 'cc-muted cc-small' }, 'Loading meeting spots…'));
          let places = [];
          try { places = await CC.data.places(slot.id, [person.id]); } catch (e) { CC.warn('places', e); }
          if (!chosen || chosen.slot !== slot) return;
          const msg = h('textarea', { class: 'cc-fb-text cc-small-text', rows: '3', maxlength: '500', placeholder: `Optional message to ${name}` });
          const placeList = h('div', { class: 'cc-p-places', role: 'radiogroup', 'aria-label': 'Where' }, places.map((pl, i) => {
            const input = h('input', { type: 'radio', name: 'cc-place', value: pl.id });
            if (i === 0) { input.checked = true; chosen.placeId = pl.id; }
            input.addEventListener('change', () => { chosen.placeId = pl.id; });
            return h('label', { class: 'cc-p-place' }, input, ' ', [pl.group, pl.name].filter(Boolean).join(' · '));
          }));
          const send = ui.button(`Send meeting request`, {
            variant: 'primary',
            onClick: async () => {
              if (!chosen.placeId) { ui.toast('Pick a place first', 'error'); return; }
              await CC.data.createMeeting({ personIds: [person.id], slotId: slot.id, placeId: chosen.placeId, message: msg.value.trim() });
              box.replaceChildren(h('div', { class: 'cc-request-done' }, `Meeting request sent to ${name} for ${ui.day(slot.start)} ${ui.range(slot.start, slot.end)} ✓`));
              ui.toast('Meeting request sent', 'success');
            },
          });
          if (!places.length) send.disabled = true;
          details.replaceChildren(
            h('div', { class: 'cc-p-label' }, `${ui.day(slot.start)} · ${ui.range(slot.start, slot.end)}`),
            places.length ? placeList : h('div', { class: 'cc-empty' }, 'No meeting spot is free at that time. Pick another time.'),
            msg,
            h('div', { class: 'cc-row' }, send, ui.button('Cancel', { variant: 'ghost', onClick: async () => onClose && onClose() })));
        };
        box.replaceChildren(picker({ slots, agenda, onPick: showDetails }), details);
      } catch (e) {
        CC.warn('booking panel', e);
        box.replaceChildren(h('div', { class: 'cc-empty' }, 'Couldn’t load free times: ' + (e.message || e)));
      }
    })();
    return box;
  };

  // ---- our panel inside Swapcard's Meet modal ----
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
      // Insert above Swapcard's chips: before their day group if there is one.
      const group = chips[0].closest(CC.sc('quick-slot-selection__DayWrapper')) || chips[0].parentElement;
      if (!group || !group.parentElement || dlg.querySelector('.cc-book')) return;
      const holder = h('div', { class: 'cc-book' }, h('div', { class: 'cc-muted cc-small' }, 'Loading your calendar…'));
      group.parentElement.insertBefore(holder, group);
      const [{ slots }, agenda] = await Promise.all([loadSlots(), CC.data.agenda()]);
      const view = picker({
        slots,
        agenda,
        onPick: async (s) => {
          view.classList.add('cc-picking');
          const ok = await clickTheirSlot(s);
          view.classList.remove('cc-picking');
          if (!ok) ui.toast('Couldn’t select that time in Swapcard’s list. Try picking it below.', 'error', 6000);
        },
      });
      holder.replaceWith(view);
      dlg.classList.add('cc-book-active');
    } catch (e) {
      CC.warn('booking', e);
      dlg.querySelector('.cc-book')?.remove();
    } finally {
      busy = false;
    }
  };

  CC.booking = { inject, panel, picker, theirSlots, clickTheirSlot };
  CC.on('dom', inject);
})();
