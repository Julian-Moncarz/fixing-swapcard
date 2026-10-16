// Calendar mod: Swapcard's My Schedule calendar, plus every session you're NOT attending
// drawn in light grey at its time. Hover for details, one click to add.
(() => {
  const CC = window.CalmerCard;
  if (!CC || CC.calendar) return;
  const { h, sc, ui } = CC;

  const PREF_KEY = 'cc:showAllSessions';
  const pref = () => { try { return localStorage.getItem(PREF_KEY) !== '0'; } catch { return true; } };
  const setPref = (v) => { try { localStorage.setItem(PREF_KEY, v ? '1' : '0'); } catch {} };

  const SHOW_HIDDEN_KEY = 'cc:showHidden';
  const showHiddenPref = () => { try { return localStorage.getItem(SHOW_HIDDEN_KEY) === '1'; } catch { return false; } };
  const setShowHidden = (v) => { try { localStorage.setItem(SHOW_HIDDEN_KEY, v ? '1' : '0'); } catch {} };

  // ---------- sessions you've said "not for me" to (kept in this browser, per event) ----------
  // ids: hidden one by one. families: hidden in bulk ("office hours"). shown: un-hidden exceptions
  // to a hidden family.
  const hiddenKey = () => 'cc:hidden:' + CC.route().slug;
  const loadHidden = () => {
    try {
      const v = JSON.parse(localStorage.getItem(hiddenKey()) || '{}');
      return { ids: v.ids || [], families: v.families || [], shown: v.shown || [] };
    } catch { return { ids: [], families: [], shown: [] }; }
  };
  const saveHidden = (v) => { try { localStorage.setItem(hiddenKey(), JSON.stringify(v)); } catch {} };
  // "Office hours: Jane Doe" -> "Office hours". Families are what people hide in bulk.
  const familyOf = (s) => {
    const m = s.title.match(/^([^:]{3,40}):\s/);
    return m ? m[1].trim() : null;
  };
  const famKey = (f) => f.toLowerCase();
  const isHidden = (s, hid = loadHidden()) => {
    if (hid.shown.includes(s.id)) return false;
    if (hid.ids.includes(s.id)) return true;
    const f = familyOf(s);
    return !!f && hid.families.includes(famKey(f));
  };
  const update = (fn, toastMsg) => {
    const before = loadHidden();
    const after = fn(JSON.parse(JSON.stringify(before)));
    saveHidden(after);
    ui.hideHoverCard();
    render(true);
    CC.emit('hidden-changed');
    if (toastMsg) ui.toast(toastMsg, 'info', 6000, { label: 'Undo', fn: () => { saveHidden(before); render(true); CC.emit('hidden-changed'); } });
  };
  const hideSession = (s) => update((v) => {
    v.shown = v.shown.filter((x) => x !== s.id);
    if (!v.ids.includes(s.id)) v.ids.push(s.id);
    return v;
  }, `Hidden “${s.title}”`);
  const hideFamily = (fam, count) => update((v) => {
    if (!v.families.includes(famKey(fam))) v.families.push(famKey(fam));
    return v;
  }, `Hidden ${count} “${fam}” sessions`);
  const unhideSession = (s) => update((v) => {
    v.ids = v.ids.filter((x) => x !== s.id);
    const f = familyOf(s);
    if (f && v.families.includes(famKey(f)) && !v.shown.includes(s.id)) v.shown.push(s.id);
    return v;
  }, `Showing “${s.title}” again`);
  const unhideFamily = (famK) => update((v) => {
    v.families = v.families.filter((x) => x !== famK);
    return v;
  }, null);

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

  // Which zone is Swapcard's calendar showing? (Its "Time zone and format" setting can switch to
  // yours.) Compare one of your own session blocks' position with its known start time.
  const detectDisplayTz = (cols, sessions, ppm) => {
    const eventTz = CC._eventTz;
    const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!eventTz || !mine || eventTz === mine) { CC._tz = eventTz; return; }
    const byId = new Map(sessions.map((s) => [s.id, s]));
    for (const col of cols) {
      for (const b of col.querySelectorAll(`:scope > ${sc('timeline-block__BlockWrapper')}`)) {
        const id = ((b.querySelector('a[href*="/planning/"]') || {}).getAttribute?.('href') || '').match(/\/planning\/([^/?#]+)/);
        const s = id && byId.get(id[1]);
        const top = parseFloat(b.style.top);
        if (!s || isNaN(top)) continue;
        const mins = top / ppm;
        if (Math.abs(mins - ui.minutes(s.start, eventTz)) <= 2) { CC._tz = eventTz; return; }
        if (Math.abs(mins - ui.minutes(s.start, mine)) <= 2) { CC._tz = mine; return; }
      }
    }
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
  // Clicking (or Enter on) a grey session opens it in the side panel.
  const openOnClick = (el, s) => {
    const go = (e) => { e.preventDefault(); e.stopPropagation(); ui.hideHoverCard(); CC.drawer.openSession(s.id); };
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(e); });
  };
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
              openOnClick(el, s);
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
    const hidden = isHidden(s);
    const fam = familyOf(s);
    const famCount = fam ? sessionsCache.filter((x) => familyOf(x) && famKey(familyOf(x)) === famKey(fam) && !x.attending).length : 0;
    const hideBtns = hidden
      ? [ui.button('Unhide', { variant: 'ghost', onClick: async () => unhideSession(s) })]
      : [fam && famCount > 1 ? ui.button(`Hide all “${fam}” (${famCount})`, { variant: 'ghost', onClick: async () => hideFamily(fam, famCount) }) : null];
    return h('div', { class: 'cc-session-card' },
      h('div', { class: 'cc-session-title' }, s.title),
      h('div', { class: 'cc-session-meta' }, `${ui.day(s.start)} · ${ui.range(s.start, s.end)}`),
      seats && h('div', { class: 'cc-session-meta' + (s.remainingSeats > 0 ? '' : ' cc-danger') }, seats),
      s.tags.length > 0 && h('div', { class: 'cc-chips' }, s.tags.map((t) => h('span', { class: 'cc-chip' }, t))),
      s.speakers.length > 0 && h('div', { class: 'cc-session-meta' }, 'With ' + s.speakers.map((p) => `${p.firstName} ${p.lastName}`).join(', ')),
      desc && h('div', { class: 'cc-session-desc' }, desc.length > 420 ? desc.slice(0, 420) + '…' : desc),
      h('div', { class: 'cc-row' },
        s.canBookmark || s.maxSeats ? addBtn : null,
        h('a', { class: 'cc-btn cc-btn-ghost', href: `/event/${CC.route().slug}/planning/${s.id}` }, 'Details')),
      h('div', { class: 'cc-row cc-session-hide' }, hideBtns));
  };
  let sessionsCache = [];

  // Squeeze Swapcard's own blocks into the left part of each day, keeping their side-by-side
  // layout. They position blocks with inline px/% left and width; we rescale those, and redo it
  // whenever React rewrites them.
  // Your blocks get the left part of each day; sessions you're not attending get the rest.
  // In day view there's room to give the options more space.
  const ownShare = () => (dayFocus ? 0.4 : 0.58);
  // A length as a fraction of the column: "120px", "50%", or calc() sums like "calc(50% + 16px)".
  const fracOf = (v, W) => {
    if (!v) return null;
    let sum = 0, any = false;
    for (const [, sign, num, unit] of v.replace(/\s+/g, '').matchAll(/([+-]?)(\d*\.?\d+)(%|px)/g)) {
      const n = parseFloat(num) * (sign === '-' ? -1 : 1);
      sum += unit === '%' ? n / 100 : n / W;
      any = true;
    }
    return any ? sum : null;
  };
  // Swapcard writes a block's horizontal position as inline left or (since October 2026)
  // inset-inline-start. We take over with left and drop inset-inline-start while scaled.
  const posOf = (st) => st.getPropertyValue('inset-inline-start') || st.left;
  const scaleBlocks = (col) => {
    const W = col.clientWidth;
    if (!W) return;
    for (const b of col.querySelectorAll(`:scope > ${sc('timeline-block__BlockWrapper')}`)) {
      const st = b.style;
      // React wrote new values if they differ from what we last set. A left that is still ours
      // (React only rewrote inset-inline-start) is not Swapcard's, so don't record it.
      const insetNow = st.getPropertyValue('inset-inline-start');
      if (insetNow || st.left !== b.dataset.ccLeft) {
        b.dataset.ccOrigInset = insetNow;
        b.dataset.ccOrigLeft = st.left === b.dataset.ccLeft ? '' : st.left;
        b.dataset.ccOrigPos = insetNow || b.dataset.ccOrigLeft || '0px';
      }
      if (st.width !== b.dataset.ccWidth) b.dataset.ccOrigWidth = st.width; // '' = no inline width
      const l = fracOf(b.dataset.ccOrigPos, W) || 0;
      const w = fracOf(b.dataset.ccOrigWidth, W) || 1;
      // Full width unless a grey session or chip sits beside it.
      const top = parseFloat(b.style.top) || 0;
      const bottom = top + (parseFloat(b.style.height) || b.offsetHeight);
      const beside = (col.__ccGhostSpans || []).some(([t, bt]) => t < bottom && bt > top);
      if (!beside) {
        // Nothing to squeeze for: leave Swapcard's own position alone.
        restore(b);
        continue;
      }
      const share = ownShare();
      const nl = (l * share * 100).toFixed(2) + '%';
      const nw = `calc(${(w * share * 100).toFixed(2)}% - 6px)`;
      // Only write when something changed, or our own writes would re-trigger the observer forever.
      if (b.dataset.ccTarget === nl + '|' + nw && st.left === b.dataset.ccLeft && st.width === b.dataset.ccWidth
        && !st.getPropertyValue('inset-inline-start')) continue;
      st.removeProperty('inset-inline-start');
      st.setProperty('left', nl);
      st.setProperty('width', nw);
      b.dataset.ccTarget = nl + '|' + nw;
      b.dataset.ccLeft = st.left;
      b.dataset.ccWidth = st.width;
    }
  };
  // Put back exactly what Swapcard wrote.
  const restore = (b) => {
    if (!('ccTarget' in b.dataset)) return;
    const st = b.style;
    if (b.dataset.ccOrigInset) st.setProperty('inset-inline-start', b.dataset.ccOrigInset);
    // With inset-inline-start, Swapcard sets no left; ours must go or it would win.
    if (b.dataset.ccOrigLeft && !b.dataset.ccOrigInset) st.setProperty('left', b.dataset.ccOrigLeft); else st.removeProperty('left');
    if (b.dataset.ccOrigWidth) st.setProperty('width', b.dataset.ccOrigWidth); else st.removeProperty('width');
    for (const k of ['ccOrigInset', 'ccOrigLeft', 'ccOrigPos', 'ccOrigWidth', 'ccLeft', 'ccWidth', 'ccTarget']) delete b.dataset[k];
  };
  // Swapcard's blocks have a fixed height, so text that wraps gets cut mid-line. Drop the least
  // important lines first (category, then location), then clamp the title, until it fits.
  const fitBlocks = (col) => {
    for (const b of col.querySelectorAll(`:scope > ${sc('timeline-block__BlockWrapper')}`)) {
      const box = b.querySelector('[class*="item__Container-sc-"]');
      if (!box) continue;
      // Only refit when the block's size or text changed (this runs on every DOM change).
      const fitSig = b.style.width + '|' + b.style.height + '|' + box.textContent.length;
      if (box.dataset.ccFit === fitSig) continue;
      box.dataset.ccFit = fitSig;
      box.querySelectorAll('.cc-fit-hidden').forEach((e) => e.classList.remove('cc-fit-hidden'));
      box.classList.remove('cc-fit-clamp');
      const fits = () => box.scrollHeight <= box.clientHeight + 1;
      if (fits()) continue;
      const rows = [...box.querySelectorAll(':scope > [class*="item__InfoRow-sc-"]')];
      for (let i = rows.length - 1; i >= 0 && !fits(); i--) rows[i].classList.add('cc-fit-hidden');
      if (!fits()) box.classList.add('cc-fit-clamp');
    }
  };
  // ✕ on sessions you're registered for: hover one of your own blocks to leave it (with Undo).
  const decorateOwnBlocks = (col) => {
    for (const b of col.querySelectorAll(`:scope > ${sc('timeline-block__BlockWrapper')}`)) {
      const a = b.querySelector('a[href*="/planning/"]');
      if (!a || b.querySelector('.cc-own-x')) continue;
      const id = (a.getAttribute('href').match(/\/planning\/([^/?#]+)/) || [])[1];
      if (!id) continue;
      const title = (b.querySelector('[class*="item__Title-sc-"]') || a).textContent.trim();
      const x = h('button', { type: 'button', class: 'cc-own-x', title: 'Leave this session', 'aria-label': 'Leave ' + title }, '✕');
      x.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        ui.hideHoverCard();
        x.disabled = true;
        try {
          const nowAttending = await CC.data.toggleSession(id);
          if (!nowAttending) {
            ui.toast(`Left “${title}”`, 'info', 6000, { label: 'Undo', fn: () => CC.data.toggleSession(id).catch((err) => ui.toast('Couldn’t undo: ' + err.message, 'error')) });
          }
        } catch (err) {
          x.disabled = false;
          ui.toast('Couldn’t leave that session: ' + (err.message || err), 'error', 6000);
        }
      });
      b.classList.add('cc-own-session');
      b.append(x);
    }
  };
  const unscaleBlocks = () => {
    for (const b of CC.$$(`${sc('timeline-block__BlockWrapper')}[data-cc-target]`)) restore(b);
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

  // ---------- day view: click a day's header (or a busy-time chip) to give that day the full width ----------
  let dayFocus = null; // 'YYYY-MM-DD' or null
  const setDayFocus = (key) => {
    dayFocus = key;
    document.documentElement.classList.toggle('cc-dayview', !!key);
    document.documentElement.style.setProperty('--cc-own-share', String(ownShare()));
    ui.hideHoverCard();
    render(true);
  };
  let appliedFocus = null; // the day view state last drawn (so render knows when it changed)
  const applyDayFocus = (cols, days) => {
    const cells = CC.$$(sc('desktop-date-header__DayCell'));
    if (dayFocus && !days.includes(dayFocus)) dayFocus = null;
    appliedFocus = dayFocus;
    document.documentElement.classList.toggle('cc-dayview', !!dayFocus);
    document.documentElement.style.setProperty('--cc-own-share', String(ownShare()));
    cols.forEach((c, i) => c.classList.toggle('cc-day-off', !!dayFocus && days[i] !== dayFocus));
    cells.forEach((cell, i) => {
      cell.classList.toggle('cc-day-off', !!dayFocus && days[i] !== dayFocus);
      cell.classList.add('cc-day-cell');
      cell.title = dayFocus ? 'Back to all days' : 'Show just this day';
      cell.querySelector(':scope > .cc-day-back')?.remove();
      if (dayFocus && days[i] === dayFocus) cell.prepend(h('span', { class: 'cc-day-back' }, '← All days'));
      if (!cell.dataset.ccDayClick) {
        cell.dataset.ccDayClick = '1';
        cell.addEventListener('click', (e) => {
          if (e.target.closest('.cc-day-item')) return; // logistics items have their own click
          const k = cell.dataset.ccDayKey;
          if (k) setDayFocus(dayFocus ? null : k);
        });
      }
      if (days[i]) cell.dataset.ccDayKey = days[i];
    });
  };

  let rendering = false, again = false, lastSig = '';
  const render = async (force) => {
    if (!isCalendarPage()) return;
    if (rendering) { again = again || !!force; return; } // queue it; don't drop it
    const wrapper = document.querySelector(sc('styles__ColumnsWrapper'));
    const cols = CC.$$(sc('styles__ColumnContainer'), wrapper);
    if (!cols.length) return;
    injectToggle();
    watchStyles(wrapper);
    const show = pref();
    if (show) cols.forEach(scaleBlocks); else unscaleBlocks();
    cols.forEach(fitBlocks);
    cols.forEach(decorateOwnBlocks);
    const intact = cols.every((c) => c.querySelector(':scope > .cc-ghost-layer')) && appliedFocus === dayFocus;
    // Include the dates on screen, so paging to other days redraws even if React reuses columns.
    const sig = CC.$$(sc('desktop-date-header__DayCell')).map((c) => c.textContent.trim().slice(0, 12)).join(',') + ':' + show;
    if (!force && intact && sig === lastSig) return;
    rendering = true;
    try {
      cols.forEach((c) => { c.querySelector(':scope > .cc-ghost-layer')?.remove(); c.querySelector(':scope > .cc-now-line')?.remove(); });
      lastSig = sig;
      document.documentElement.classList.toggle('cc-ghosts-on', show);
      cols.forEach((c) => { c.__ccGhostSpans = []; });
      const sessions = await CC.data.sessions();
      sessionsCache = sessions;
      const hid = loadHidden();
      const showHidden = showHiddenPref();
      const now = CC.now();
      updateControls(sessions, hid);
      detectDisplayTz(cols, sessions, pxPerMin(wrapper));
      const days = columnDays(sessions);
      applyDayFocus(cols, days);
      renderDayInfo(sessions, days);
      const ppm = pxPerMin(wrapper);
      cols.forEach((col, i) => {
        const key = days[i];
        // A column with no date still gets an (empty) layer, so the next DOM change sees it as done.
        if (!key) { col.prepend(h('div', { class: 'cc-ghost-layer' })); return; }
        const layer = h('div', { class: 'cc-ghost-layer', 'aria-label': 'Sessions you are not attending' });
        // Not attending, not over yet, and not hidden (unless you're looking at hidden ones).
        const todays = sessions.filter((s) => !s.attending && ui.dayKey(s.start) === key && s.end > now && (showHidden || !isHidden(s, hid)));
        const classesFor = (s, base) => base + (isHidden(s, hid) ? ' cc-ghost-hidden' : '');
        // ✕ to hide (or ↺ to unhide) without opening anything.
        const xBtn = (s) => {
          const hiddenNow = isHidden(s, hid);
          const b = h('button', { type: 'button', class: 'cc-ghost-x', title: hiddenNow ? 'Unhide' : 'Not for me', 'aria-label': (hiddenNow ? 'Unhide ' : 'Hide ') + s.title }, hiddenNow ? '↺' : '✕');
          b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); hiddenNow ? unhideSession(s) : hideSession(s); });
          return b;
        };
        const yOf = (d) => ui.minutes(d) * ppm;
        const hOf = (a, b) => Math.max(18, ((b - a) / 60000) * ppm - 4);
        const label = (s) => `${s.title}, ${ui.range(s.start, s.end)}, not attending`;

        const area = h('div', { class: 'cc-ghost-area', style: { right: '2px' } });
        layer.append(area);

        // A few at once sit side by side as real blocks. A busy time becomes one "N other sessions"
        // block that opens the day view; in day view everything is a real block.
        // With "other sessions" off the layer stays empty (it still marks the column as done).
        const maxLanes = dayFocus ? 6 : 2;
        for (const cl of show ? clusters(todays.filter((s) => !isLogistics(s))) : []) {
          const n = assignLanes(cl.items);
          if (n <= maxLanes) {
            for (const s of cl.items) {
              const height = hOf(s.start, s.end);
              const el = h('div', {
                class: classesFor(s, 'cc-ghost'), tabindex: '0', role: 'button', 'aria-label': label(s),
                style: { top: yOf(s.start) + 'px', height: height + 'px', left: `calc(${(s._lane * 100) / n}% + 1px)`, width: `calc(${100 / n}% - 3px)` },
              },
              h('span', { class: 'cc-ghost-title', style: { webkitLineClamp: String(Math.max(1, Math.floor((height - 6) / 15))) } }, s.title),
              xBtn(s));
              ui.hoverCard(el, () => sessionCard(s));
              openOnClick(el, s);
              area.append(el);
            }
          } else {
            const chip = h('button', {
              type: 'button', class: 'cc-ghost-chip',
              'aria-label': `${cl.items.length} other sessions. Open day view`, title: 'Open day view',
              style: { top: yOf(cl.start) + 'px', height: hOf(cl.start, cl.end) + 'px' },
            }, h('span', { class: 'cc-ghost-chip-label' }, `${cl.items.length} other sessions`));
            chip.addEventListener('click', (e) => { e.stopPropagation(); setDayFocus(key); });
            area.append(chip);
          }
        }
        col.prepend(layer);
        // Where grey sessions sit, so your own blocks elsewhere can use the full width.
        col.__ccGhostSpans = CC.$$('.cc-ghost, .cc-ghost-chip', layer).map((g) => {
          const t = parseFloat(g.style.top) || 0;
          return [t, t + g.offsetHeight];
        });
      });
      cols.forEach((c) => { scaleBlocks(c); fitBlocks(c); });
      drawNowLine(cols, days, ppm);
      scrollToMorning(wrapper, ppm);
    } catch (e) {
      CC.warn('calendar', e);
    } finally {
      rendering = false;
      if (again) { const f = again; again = false; render(f); }
    }
  };

  // Open the calendar at 8 AM (once per visit), not at midnight.
  let scrolledToMorning = false;
  const scrollToMorning = (wrapper, ppm) => {
    if (scrolledToMorning) return;
    let el = wrapper.parentElement;
    while (el && el !== document.body) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) break;
      el = el.parentElement;
    }
    if (!el || el === document.body) return;
    el.scrollTop = Math.max(0, 8 * 60 * ppm - 12); // a little above, so the "8 AM" label shows
    scrolledToMorning = true;
  };

  // A "now" line across today's column.
  const drawNowLine = (cols, days, ppm) => {
    const now = CC.now();
    cols.forEach((col, i) => {
      col.querySelector(':scope > .cc-now-line')?.remove();
      if (days[i] !== ui.dayKey(now)) return;
      col.append(h('div', { class: 'cc-now-line', style: { top: ui.minutes(now) * ppm + 'px' }, 'aria-hidden': 'true' }));
    });
  };
  setInterval(() => {
    if (!isCalendarPage() || document.hidden) return;
    const wrapper = document.querySelector(sc('styles__ColumnsWrapper'));
    if (!wrapper || !sessionsCache.length) return;
    // Re-render so sessions that just ended drop off and the line moves.
    render(true);
  }, 5 * 60 * 1000);

  // Sidebar controls: "Show hidden (n)" and the families you've hidden, each with Unhide.
  const updateControls = (sessions, hid) => {
    const box = document.querySelector('.cc-cal-controls');
    if (!box) return;
    const count = sessions.filter((s) => !s.attending && isHidden(s, hid)).length;
    const input = h('input', { type: 'checkbox' });
    input.checked = showHiddenPref();
    input.disabled = !count;
    input.addEventListener('change', () => { setShowHidden(input.checked); render(true); });
    const fams = hid.families.map((fk) => {
      const sample = sessions.find((x) => familyOf(x) && famKey(familyOf(x)) === fk);
      const label = sample ? familyOf(sample) : fk;
      const b = h('button', { type: 'button', class: 'cc-chip cc-chip-btn', title: 'Unhide all' }, `${label} ✕`);
      b.addEventListener('click', () => unhideFamily(fk));
      return b;
    });
    CC.fill(box,
      h('label', { class: 'cc-allsessions-toggle' + (count ? '' : ' cc-muted') }, input, ` Show hidden (${count})`),
      fams.length > 0 && h('div', { class: 'cc-hidden-fams' }, h('span', { class: 'cc-small cc-muted' }, 'Hidden groups: '), fams));
  };

  // One set of document listeners closes the View popover (not one per header render).
  const closeViewPops = () => CC.$$('.cc-view-pop').forEach((p) => { p.hidden = true; });
  document.addEventListener('click', closeViewPops);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeViewPops(); });

  // A small "View" button in the calendar's top-left corner holds the view options (the old
  // Appearance sidebar is hidden so the calendar gets the full width).
  const injectToggle = () => {
    const row = document.querySelector(sc('desktop-date-header__HeaderRow'));
    if (!row || row.querySelector(':scope > .cc-view')) return;
    const input = h('input', { type: 'checkbox' });
    input.checked = pref();
    input.addEventListener('change', () => { setPref(input.checked); render(true); });
    // Swapcard's own "Time zone and format" opener lives in the hidden sidebar; we click it for you.
    const tz = h('button', { type: 'button', class: 'cc-view-link' }, 'Time zone and format…');
    tz.addEventListener('click', () => {
      pop.hidden = true;
      const theirs = CC.$$('button, a, div').find((e) => e.textContent.trim() === 'Time zone and format' && e.closest(`[data-cc-col="aside"], ${sc('aside__Aside')}`));
      const target = theirs && (theirs.closest('button, a, [role="button"]') || theirs);
      if (target) target.click(); else ui.toast('Couldn’t find Swapcard’s time zone settings on this page.', 'error');
    });
    const pop = h('div', { class: 'cc-view-pop', hidden: true, role: 'dialog', 'aria-label': 'View options' },
      h('label', { class: 'cc-allsessions-toggle' }, input, ' Show sessions I’m not attending'),
      h('div', { class: 'cc-cal-controls' }),
      tz);
    const btn = h('button', { type: 'button', class: 'cc-view-btn', 'aria-haspopup': 'dialog', title: 'View options' }, 'View ▾');
    btn.addEventListener('click', (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; });
    pop.addEventListener('click', (e) => e.stopPropagation());
    row.append(h('div', { class: 'cc-view' }, btn, pop));
  };

  // The schedule is always the calendar: switch to it if needed, and hide the List/Calendar switch.
  let switched = false;
  const preferCalendar = () => {
    const r = CC.route();
    if (r.page !== 'my-schedule') return;
    const calBtn = CC.$$('button').find((b) => b.textContent.trim() === 'Calendar');
    const listBtn = CC.$$('button').find((b) => b.textContent.trim() === 'List');
    if (calBtn && listBtn) {
      const sw = calBtn.closest(sc('multi-switch__Container')) || (calBtn.parentElement === listBtn.parentElement ? calBtn.parentElement : null);
      if (sw && sw.contains(listBtn)) sw.classList.add('cc-hidden-cruft');
    }
    if (switched) return;
    const params = new URLSearchParams(location.search);
    if (params.get('appearance') === 'calendar' || (params.get('view') && params.get('view') !== 'schedule')) { switched = true; return; }
    if (calBtn) { switched = true; calBtn.click(); }
  };

  const columns = () => {
    const wrapper = document.querySelector(sc('styles__ColumnsWrapper'));
    return wrapper ? CC.$$(sc('styles__ColumnContainer'), wrapper) : [];
  };

  CC.calendar = { columns, render, sessionCard, hideSession, unhideSession, isHidden, familyOf, setDayFocus };
  CC.on('dom', () => { preferCalendar(); render(false); });
  CC.on('route', () => {
    switched = false; lastSig = ''; dayFocus = null; scrolledToMorning = false;
    document.documentElement.classList.remove('cc-dayview');
    if (CC.route().page !== 'my-schedule') document.documentElement.classList.remove('cc-ghosts-on');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dayFocus && !(CC.drawer && CC.drawer.isOpen())) setDayFocus(null);
  });
  CC.on('event-changed', () => { sessionsCache = []; dayFocus = null; lastSig = ''; });
  CC.on('schedule-changed', () => setTimeout(() => render(true), 600));
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      CC.$$('[data-cc-fit]').forEach((e) => { delete e.dataset.ccFit; });
      CC.$$(sc('styles__ColumnContainer')).forEach(fitBlocks);
    }, 150);
  });
})();
