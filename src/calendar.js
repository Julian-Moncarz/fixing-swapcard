// Calendar mod: Swapcard's My Schedule calendar, plus every session you're NOT attending
// drawn in light grey at its time. Hover for details, one click to add.
(() => {
  const CC = window.CalmerCard;
  if (!CC || CC.calendar) return;
  const { h, sc, ui } = CC;

  const PREF_KEY = 'cc:showAllSessions';
  const pref = () => { try { return localStorage.getItem(PREF_KEY) !== '0'; } catch { return true; } };
  const setPref = (v) => { try { localStorage.setItem(PREF_KEY, v ? '1' : '0'); } catch {} };

  const isCalendarPage = () => {
    const r = CC.route();
    return r.page === 'my-schedule' && !!document.querySelector(sc('styles__ColumnsWrapper'));
  };

  // Pixels per minute, measured from Swapcard's hour lines (2px/min at time of writing).
  const pxPerMin = (wrapper) => {
    const tops = CC.$$(sc('hour-line__Line'), wrapper).map((l) => parseFloat(l.style.top)).filter((x) => !isNaN(x)).sort((a, b) => a - b);
    if (tops.length >= 2 && tops[1] > tops[0]) return (tops[1] - tops[0]) / 60;
    return wrapper.scrollHeight / 1440 || 2;
  };

  // Map each day column to a date key using the header's day-of-month numbers.
  const columnDays = (sessions) => {
    const cells = CC.$$(sc('desktop-date-header__DayCell'));
    const keys = [...new Set(sessions.map((s) => ui.dayKey(s.start)))].sort();
    return cells.map((cell) => {
      const num = (cell.textContent.match(/\d{1,2}/) || [])[0];
      return keys.find((k) => +k.slice(-2) === +num) || null;
    });
  };

  const durMin = (s) => (s.end - s.start) / 60000;
  // Venue logistics (venue hours, badge pickup) aren't things you attend; you just need the times.
  // They go in a one-line summary under each day's date instead of the grid.
  const LOGISTICS_RE = /^(venue (open|closed)|badge|early badge|registration|check-?in)\b/i;
  const isLogistics = (s) => LOGISTICS_RE.test(s.title) || durMin(s) > 240;
  const isNoise = (s) => /^venue closed\b/i.test(s.title);
  const shortTime = (d) => ui.time(d).replace(':00', '');
  const shortRange = (a, b) => {
    const [x, y] = [shortTime(a), shortTime(b)];
    const [mx, my] = [x.match(/\s?(AM|PM)$/i), y.match(/\s?(AM|PM)$/i)];
    return (mx && my && mx[1] === my[1] ? x.replace(mx[0], '') : x) + '–' + y;
  };
  const shortTitle = (s) => s.title.replace(/\s*\(.*?\)\s*/g, ' ').replace(/^Venue open$/i, 'Venue').trim();

  const renderDayInfo = (sessions, days) => {
    CC.$$(sc('desktop-date-header__DayCell')).forEach((cell, i) => {
      cell.querySelector(':scope > .cc-day-info')?.remove();
      const key = days[i];
      if (!key) return;
      const items = sessions.filter((s) => ui.dayKey(s.start) === key && isLogistics(s) && !isNoise(s)).sort((a, b) => a.start - b.start);
      if (!items.length) return;
      const line = h('div', { class: 'cc-day-info' });
      items.forEach((s, j) => {
        if (j) line.append(h('span', { class: 'cc-day-sep' }, ' · '));
        const el = h('span', { class: 'cc-day-item', tabindex: '0' }, `${shortTitle(s)} ${shortRange(s.start, s.end)}`);
        ui.hoverCard(el, () => sessionCard(s));
        line.append(el);
      });
      cell.append(line);
    });
  };

  // Clusters of overlapping sessions.
  const clusters = (items) => {
    const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
    const out = [];
    let cur = null;
    for (const it of sorted) {
      if (cur && it.start < cur.end) { cur.items.push(it); if (it.end > cur.end) cur.end = it.end; }
      else { cur = { start: it.start, end: it.end, items: [it] }; out.push(cur); }
    }
    return out;
  };

  // Lane index for each item so overlapping items sit side by side.
  const assignLanes = (items) => {
    const ends = [];
    for (const it of [...items].sort((a, b) => a.start - b.start)) {
      let li = ends.findIndex((e) => e <= it.start);
      if (li === -1) { li = ends.length; ends.push(0); }
      ends[li] = it.end;
      it._lane = li;
    }
    return ends.length;
  };

  const sessionCard = (s) => {
    const seats = s.maxSeats ? (s.remainingSeats > 0 ? `${s.remainingSeats} seats left` : 'No seats left') : null;
    const addBtn = ui.button('Add to schedule', {
      variant: 'primary',
      onClick: async () => {
        await CC.data.toggleSession(s.id);
        ui.hideHoverCard();
        ui.toast(`Added “${s.title}”`, 'success');
      },
    });
    if (s.maxSeats && s.remainingSeats <= 0) { addBtn.disabled = true; addBtn.textContent = 'Full'; }
    const desc = CC.textFromHtml(s.html);
    return h('div', { class: 'cc-session-card' },
      h('div', { class: 'cc-session-title' }, s.title),
      h('div', { class: 'cc-session-meta' }, `${ui.day(s.start)} · ${ui.range(s.start, s.end)}`),
      s.place && h('div', { class: 'cc-session-meta' }, '📍 ' + s.place),
      seats && h('div', { class: 'cc-session-meta' + (s.remainingSeats > 0 ? '' : ' cc-danger') }, seats),
      s.tags.length > 0 && h('div', { class: 'cc-chips' }, s.tags.map((t) => h('span', { class: 'cc-chip' }, t))),
      s.speakers.length > 0 && h('div', { class: 'cc-session-meta' }, 'With ' + s.speakers.map((p) => `${p.firstName} ${p.lastName}`).join(', ')),
      desc && h('div', { class: 'cc-session-desc' }, desc.length > 420 ? desc.slice(0, 420) + '…' : desc),
      h('div', { class: 'cc-row' },
        s.canBookmark || s.maxSeats ? addBtn : null,
        h('a', { class: 'cc-btn cc-btn-ghost', href: `/event/${CC.route().slug}/planning/${s.id}` }, 'Details')));
  };

  // Squeeze Swapcard's own blocks into the left part of each day, keeping their side-by-side
  // layout. They position blocks with inline px/% left and width; we rescale those, and redo it
  // whenever React rewrites them.
  const OWN_SHARE = 0.58;
  const fracOf = (v, W) => {
    if (!v) return null;
    const n = parseFloat(v);
    if (isNaN(n)) return null;
    return v.endsWith('%') ? n / 100 : n / W;
  };
  const scaleBlocks = (col) => {
    const W = col.clientWidth;
    if (!W) return;
    for (const b of col.querySelectorAll(`:scope > ${sc('timeline-block__BlockWrapper')}`)) {
      const st = b.style;
      // React wrote new values if they differ from what we last set.
      if (st.left !== b.dataset.ccLeft) b.dataset.ccOrigLeft = st.left || '0px';
      if (st.width !== b.dataset.ccWidth) b.dataset.ccOrigWidth = st.width || W + 'px';
      const l = fracOf(b.dataset.ccOrigLeft, W) || 0;
      const w = fracOf(b.dataset.ccOrigWidth, W) || 1;
      const nl = (l * OWN_SHARE * 100).toFixed(2) + '%';
      const nw = `calc(${(w * OWN_SHARE * 100).toFixed(2)}% - 6px)`;
      // Only write when something changed, or our own writes would re-trigger the observer forever.
      if (b.dataset.ccTarget === nl + '|' + nw && st.left === b.dataset.ccLeft && st.width === b.dataset.ccWidth) continue;
      st.setProperty('left', nl);
      st.setProperty('width', nw);
      b.dataset.ccTarget = nl + '|' + nw;
      b.dataset.ccLeft = st.left;
      b.dataset.ccWidth = st.width;
    }
  };
  // Swapcard's blocks have a fixed height, so text that wraps gets cut mid-line. Drop the least
  // important lines first (category, then location), then clamp the title, until it fits.
  const fitBlocks = (col) => {
    for (const b of col.querySelectorAll(`:scope > ${sc('timeline-block__BlockWrapper')}`)) {
      const box = b.querySelector('[class*="item__Container-sc-"]');
      if (!box) continue;
      box.querySelectorAll('.cc-fit-hidden').forEach((e) => e.classList.remove('cc-fit-hidden'));
      box.classList.remove('cc-fit-clamp');
      const fits = () => box.scrollHeight <= box.clientHeight + 1;
      if (fits()) continue;
      const rows = [...box.querySelectorAll(':scope > [class*="item__InfoRow-sc-"]')];
      for (let i = rows.length - 1; i >= 0 && !fits(); i--) rows[i].classList.add('cc-fit-hidden');
      if (!fits()) box.classList.add('cc-fit-clamp');
    }
  };
  const unscaleBlocks = () => {
    for (const b of CC.$$(`${sc('timeline-block__BlockWrapper')}[data-cc-orig-left]`)) {
      b.style.left = b.dataset.ccOrigLeft;
      b.style.width = b.dataset.ccOrigWidth;
      delete b.dataset.ccOrigLeft; delete b.dataset.ccOrigWidth; delete b.dataset.ccLeft; delete b.dataset.ccWidth;
    }
  };
  // React can change a block's style without adding nodes, so watch style attributes too.
  let styleObs = null;
  const watchStyles = (wrapper) => {
    if (styleObs && styleObs.target === wrapper) return;
    if (styleObs) styleObs.obs.disconnect();
    const obs = new MutationObserver(() => {
      if (!pref()) return;
      CC.$$(sc('styles__ColumnContainer'), wrapper).forEach((c) => { scaleBlocks(c); fitBlocks(c); });
    });
    obs.observe(wrapper, { attributes: true, attributeFilter: ['style'], subtree: true });
    styleObs = { obs, target: wrapper };
  };

  let rendering = false, lastSig = '';
  const render = async (force) => {
    if (rendering || !isCalendarPage()) return;
    const wrapper = document.querySelector(sc('styles__ColumnsWrapper'));
    const cols = CC.$$(sc('styles__ColumnContainer'), wrapper);
    if (!cols.length) return;
    injectToggle();
    watchStyles(wrapper);
    const show = pref();
    if (show) cols.forEach(scaleBlocks); else unscaleBlocks();
    cols.forEach(fitBlocks);
    const intact = cols.every((c) => c.querySelector(':scope > .cc-ghost-layer'));
    const sig = cols.length + ':' + show;
    if (!force && intact && sig === lastSig) return;
    rendering = true;
    try {
      cols.forEach((c) => c.querySelector(':scope > .cc-ghost-layer')?.remove());
      lastSig = sig;
      document.documentElement.classList.toggle('cc-ghosts-on', show);
      if (!show) return;
      const sessions = await CC.data.sessions();
      const days = columnDays(sessions);
      renderDayInfo(sessions, days);
      const ppm = pxPerMin(wrapper);
      cols.forEach((col, i) => {
        const key = days[i];
        if (!key) return;
        const layer = h('div', { class: 'cc-ghost-layer', 'aria-label': 'Sessions you are not attending' });
        const todays = sessions.filter((s) => !s.attending && ui.dayKey(s.start) === key);
        const yOf = (d) => ui.minutes(d) * ppm;
        const hOf = (a, b) => Math.max(18, ((b - a) / 60000) * ppm - 4);
        const label = (s) => `${s.title}, ${ui.range(s.start, s.end)}, not attending`;

        const area = h('div', { class: 'cc-ghost-area', style: { right: '2px' } });
        layer.append(area);

        // One or two side by side, or a single block listing a busy cluster.
        for (const cl of clusters(todays.filter((s) => !isLogistics(s)))) {
          const n = assignLanes(cl.items);
          if (n <= 2) {
            for (const s of cl.items) {
              const height = hOf(s.start, s.end);
              const el = h('div', {
                class: 'cc-ghost', tabindex: '0', role: 'button', 'aria-label': label(s),
                style: { top: yOf(s.start) + 'px', height: height + 'px', left: `calc(${(s._lane * 100) / n}% + 1px)`, width: `calc(${100 / n}% - 3px)` },
              },
              h('span', { class: 'cc-ghost-title' }, s.title),
              height > 38 ? h('span', { class: 'cc-ghost-meta' }, s.place || '') : null);
              ui.hoverCard(el, () => sessionCard(s));
              area.append(el);
            }
          } else {
            const group = h('div', {
              class: 'cc-ghost cc-ghost-group', role: 'group', 'aria-label': `${cl.items.length} sessions you're not attending`,
              style: { top: yOf(cl.start) + 'px', height: hOf(cl.start, cl.end) + 'px', left: '1px', width: 'calc(100% - 3px)' },
            }, h('span', { class: 'cc-ghost-count' }, `${cl.items.length} sessions`));
            for (const s of cl.items.sort((a, b) => a.start - b.start)) {
              const row = h('div', { class: 'cc-ghost-row', tabindex: '0', role: 'button', 'aria-label': label(s) },
                h('span', { class: 'cc-ghost-time' }, ui.time(s.start).replace(/\s?(AM|PM)$/i, '')),
                h('span', { class: 'cc-ghost-rowtitle' }, s.title));
              ui.hoverCard(row, () => sessionCard(s));
              group.append(row);
            }
            area.append(group);
          }
        }
        col.prepend(layer);
      });
    } catch (e) {
      CC.warn('calendar', e);
    } finally {
      rendering = false;
    }
  };

  // "Show all sessions" switch in Swapcard's own left sidebar, under Appearance.
  const injectToggle = () => {
    if (document.querySelector('.cc-allsessions-toggle')) return;
    const appearance = CC.$$('h1,h2,h3,h4,span,div').find((e) => e.children.length === 0 && e.textContent.trim() === 'Appearance');
    const host = appearance && appearance.parentElement;
    if (!host) return;
    const input = h('input', { type: 'checkbox' });
    input.checked = pref();
    input.addEventListener('change', () => { setPref(input.checked); render(true); });
    host.append(h('label', { class: 'cc-allsessions-toggle' }, input, ' Show sessions I’m not attending'));
  };

  // Default My Schedule to the calendar appearance (once per visit).
  let switched = false;
  const preferCalendar = () => {
    const r = CC.route();
    if (r.page !== 'my-schedule' || switched) return;
    const params = new URLSearchParams(location.search);
    if (params.get('appearance') === 'calendar' || (params.get('view') && params.get('view') !== 'schedule')) { switched = true; return; }
    const btn = CC.$$('button').find((b) => b.textContent.trim() === 'Calendar');
    if (btn) { switched = true; btn.click(); }
  };

  CC.calendar = { render, sessionCard };
  CC.on('dom', () => { preferCalendar(); render(false); });
  CC.on('route', () => {
    switched = false; lastSig = '';
    if (CC.route().page !== 'my-schedule') document.documentElement.classList.remove('cc-ghosts-on');
  });
  CC.on('schedule-changed', () => setTimeout(() => render(true), 600));
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => CC.$$(sc('styles__ColumnContainer')).forEach(fitBlocks), 150);
  });
})();
