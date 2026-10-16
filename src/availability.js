// Availability mod: your 1:1 availability lives on the Schedule calendar. Times you've marked
// unavailable for meetings show as hatched bands; drag on empty calendar space to mark a stretch
// unavailable (or drag over a hatched band to open it up again). This replaces Swapcard's
// "Manage my meeting availability" modal, whose opener sat in the sidebar we hide.
(() => {
  const CC = window.CalmerCard;
  if (!CC || CC.availability) return;
  const { h, sc, ui } = CC;

  const isCalendarPage = () => CC.route().page === 'my-schedule' && !!document.querySelector(sc('styles__ColumnsWrapper'));
  const columns = () => CC.$$(sc('styles__ColumnContainer'), document.querySelector(sc('styles__ColumnsWrapper')) || document);
  // Pixels per minute, from Swapcard's hour lines (the same measure calendar.js uses).
  const pxPerMin = () => {
    const tops = CC.$$(sc('hour-line__Line')).map((l) => parseFloat(l.style.top)).filter((x) => !isNaN(x)).sort((a, b) => a - b);
    for (let i = 1; i < tops.length; i++) if (tops[i] - tops[i - 1] > 10) return (tops[i] - tops[i - 1]) / 60;
    return 2;
  };
  // Day key (YYYY-MM-DD) for each column, from the header cells calendar.js labels.
  const columnKeys = () => CC.$$(sc('desktop-date-header__DayCell')).map((c) => c.dataset.ccDayKey || null);

  let slots = [];
  let loading = null;
  const load = async (force) => {
    if (loading && !force) return loading;
    loading = CC.data.availability().then((s) => { slots = s; return s; }).catch((e) => { CC.warn('availability', e); return slots; });
    return loading;
  };
  const daySlots = (key) => slots.filter((s) => ui.dayKey(s.start) === key);

  // ---------- drawing ----------
  // Contiguous runs of unavailable slots become one band.
  const runs = (list) => {
    const out = [];
    for (const s of list.filter((x) => x.state === 'DISABLED').sort((a, b) => a.start - b.start)) {
      const last = out[out.length - 1];
      // Slots are 25 minutes with 5-minute gaps; a gap that small still reads as one block.
      if (last && s.start - last.end <= 10 * 60000) { last.end = s.end; last.ids.push(s.id); } else out.push({ start: s.start, end: s.end, ids: [s.id] });
    }
    return out;
  };
  let drawSig = '';
  const draw = (force) => {
    if (!isCalendarPage()) return;
    const cols = columns();
    const keys = columnKeys();
    const ppm = pxPerMin();
    const sig = keys.join(',') + '|' + ppm + '|' + slots.map((s) => s.id + s.state).join('').length + '|' + slots.filter((s) => s.state === 'DISABLED').length;
    const intact = cols.length && cols.every((c) => c.querySelector(':scope > .cc-avail-layer'));
    if (!force && intact && sig === drawSig) return;
    drawSig = sig;
    cols.forEach((col, i) => {
      col.querySelector(':scope > .cc-avail-layer')?.remove();
      col.classList.add('cc-avail-col');
      const key = keys[i];
      if (!key) return;
      const layer = h('div', { class: 'cc-avail-layer', 'aria-hidden': 'true' });
      for (const r of runs(daySlots(key))) {
        const top = ui.minutes(r.start) * ppm;
        const height = Math.max(8, ((r.end - r.start) / 60000) * ppm);
        layer.append(h('div', { class: 'cc-avail-off', style: { top: top + 'px', height: height + 'px' } },
          height >= 22 ? h('span', { class: 'cc-avail-off-label' }, 'Unavailable for 1:1s') : null));
      }
      col.prepend(layer);
    });
    injectHint();
  };

  // ---------- the hint ----------
  const injectHint = () => {
    const row = document.querySelector(sc('desktop-date-header__HeaderRow'));
    if (!row || row.querySelector(':scope > .cc-avail-hint')) return;
    row.append(h('div', { class: 'cc-avail-hint' },
      h('span', { class: 'cc-avail-swatch', 'aria-hidden': 'true' }),
      'Drag on empty time to block it for 1:1s'));
  };

  // ---------- dragging ----------
  // Only empty calendar space starts a drag: not your blocks, grey sessions, chips or buttons.
  const BLOCKERS = [sc('timeline-block__BlockWrapper'), '.cc-ghost', '.cc-ghost-chip', 'button', 'a', 'input', '[role="button"]'].join(',');
  let drag = null;

  const minutesAt = (col, clientY, ppm) => (clientY - col.getBoundingClientRect().top) / ppm;
  const slotsIn = (key, m0, m1) => daySlots(key).filter((s) => {
    const a = ui.minutes(s.start);
    const b = a + (s.end - s.start) / 60000;
    return a < m1 && b > m0;
  });

  const onDown = (e) => {
    if (e.button !== 0 || !isCalendarPage()) return;
    const col = e.target.closest(sc('styles__ColumnContainer'));
    if (!col || e.target.closest(BLOCKERS)) return;
    const i = columns().indexOf(col);
    const key = columnKeys()[i];
    if (!key || !slots.length) return;
    const ppm = pxPerMin();
    const m = minutesAt(col, e.clientY, ppm);
    drag = { col, key, ppm, m0: m, m1: m, y0: e.clientY, moved: false, sel: null };
    e.preventDefault(); // no text selection while dragging
  };

  const onMove = (e) => {
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientY - drag.y0) < 6) return;
    drag.moved = true;
    drag.m1 = minutesAt(drag.col, e.clientY, drag.ppm);
    const [a, b] = [Math.min(drag.m0, drag.m1), Math.max(drag.m0, drag.m1)];
    const hit = slotsIn(drag.key, a, b).filter((s) => s.state !== 'BLOCKED_BY_MEETING');
    if (!drag.sel) {
      drag.sel = h('div', { class: 'cc-avail-sel' }, h('span', { class: 'cc-avail-sel-label' }));
      drag.col.append(drag.sel);
    }
    // Snap the box to whole slots so you see exactly what will change.
    const top = (hit.length ? ui.minutes(hit[0].start) : a) * drag.ppm;
    const bottom = (hit.length ? ui.minutes(hit[hit.length - 1].start) + (hit[hit.length - 1].end - hit[hit.length - 1].start) / 60000 : b) * drag.ppm;
    drag.sel.style.top = top + 'px';
    drag.sel.style.height = Math.max(6, bottom - top) + 'px';
    const opening = hit.length && hit.every((s) => s.state === 'DISABLED');
    drag.sel.classList.toggle('cc-avail-sel-open', !!opening);
    drag.sel.firstChild.textContent = hit.length
      ? `${opening ? 'Make available' : 'Block'} · ${ui.range(hit[0].start, hit[hit.length - 1].end)}`
      : 'No 1:1 slots here';
  };

  const onUp = async (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.sel?.remove();
    let hit;
    if (d.moved) {
      hit = slotsIn(d.key, Math.min(d.m0, d.m1), Math.max(d.m0, d.m1));
    } else {
      // A plain click on a hatched band opens just that slot up again.
      hit = slotsIn(d.key, d.m0, d.m0 + 0.01).filter((s) => s.state === 'DISABLED');
    }
    hit = hit.filter((s) => s.state !== 'BLOCKED_BY_MEETING' && s.end > CC.now());
    if (!hit.length) return;
    const disable = !hit.every((s) => s.state === 'DISABLED');
    const ids = hit.filter((s) => (disable ? s.state === 'AVAILABLE' : s.state === 'DISABLED')).map((s) => s.id);
    if (!ids.length) return;
    const when = `${ui.day(hit[0].start)} ${ui.range(hit[0].start, hit[hit.length - 1].end)}`;
    // Show it right away; the server call follows.
    const prev = new Map(slots.map((s) => [s.id, s.state]));
    slots = slots.map((s) => (ids.includes(s.id) ? { ...s, state: disable ? 'DISABLED' : 'AVAILABLE' } : s));
    draw(true);
    try {
      await CC.data.setSlotsDisabled(ids, disable);
      ui.toast(disable ? `Blocked ${when} for 1:1s` : `${when} is open for 1:1s again`, 'success', 10000, {
        label: 'Undo',
        fn: async () => {
          try {
            await CC.data.setSlotsDisabled(ids, !disable);
          } catch (err) { ui.toast('Couldn’t undo: ' + (err.message || err), 'error'); }
          await load(true);
          draw(true);
        },
      });
    } catch (err) {
      slots = slots.map((s) => (prev.has(s.id) ? { ...s, state: prev.get(s.id) } : s));
      draw(true);
      ui.toast('Couldn’t update your availability: ' + (err.message || err), 'error');
    }
    load(true).then(() => draw(true));
  };

  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drag) { drag.sel?.remove(); drag = null; } });

  // ---------- wiring ----------
  const refresh = async () => {
    if (!isCalendarPage()) return;
    if (!slots.length) await load();
    draw();
  };
  CC.on('dom', refresh);
  CC.on('route', () => { drawSig = ''; refresh(); });
  CC.on('event-changed', () => { slots = []; loading = null; drawSig = ''; });
  CC.on('availability-changed', () => { drawSig = ''; });
  CC.on('schedule-changed', () => load(true).then(() => draw(true)));

  CC.availability = { load, draw };
})();
