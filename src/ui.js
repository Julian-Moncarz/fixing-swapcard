// Calmer Card shared UI: formatting, toasts, hover cards, and the day grid used for booking.
(() => {
  const CC = window.CalmerCard;
  if (!CC || CC.ui) return;
  const { h } = CC;

  const tz = () => (CC._tz || undefined);
  CC.data && CC.data.event().then((ev) => { if (ev) CC._tz = ev.timezone; }).catch(() => {});

  const fmt = (d, opts) => new Intl.DateTimeFormat(undefined, { timeZone: tz(), ...opts }).format(d);
  const ui = (CC.ui = {
    time: (d) => fmt(d, { hour: 'numeric', minute: '2-digit' }),
    day: (d) => fmt(d, { weekday: 'short', month: 'short', day: 'numeric' }),
    // YYYY-MM-DD in the event timezone (en-CA formats dates as ISO).
    dayKey: (d) => new Intl.DateTimeFormat('en-CA', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(d),
    range: (a, b) => `${ui.time(a)} to ${ui.time(b)}`,
    // Minutes since midnight in the event timezone.
    minutes: (d) => {
      const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz(), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
      const g = (t) => +p.find((x) => x.type === t).value;
      return g('hour') * 60 + g('minute');
    },
    relative: (d) => {
      const s = (Date.now() - d.getTime()) / 1000;
      if (s < 60) return 'just now';
      if (s < 3600) return Math.floor(s / 60) + 'm ago';
      if (s < 86400) return Math.floor(s / 3600) + 'h ago';
      return ui.day(d);
    },
  });

  // ---------- toast ----------
  let toastEl;
  ui.toast = (msg, kind = 'info', ms = 3500) => {
    toastEl = toastEl || document.body.appendChild(h('div', { class: 'cc-toast-wrap' }));
    const t = h('div', { class: 'cc-toast cc-toast-' + kind, role: 'status' }, msg);
    toastEl.append(t);
    setTimeout(() => t.classList.add('cc-toast-out'), ms);
    setTimeout(() => t.remove(), ms + 400);
  };

  // Wrap an async click handler: disable the button, show errors as toasts.
  ui.action = (btn, fn, { busy = 'Working…' } = {}) => async (e) => {
    e && e.preventDefault();
    e && e.stopPropagation();
    if (btn.disabled) return;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = busy;
    try {
      await fn();
    } catch (err) {
      CC.warn(err);
      ui.toast('Something went wrong: ' + (err.message || err), 'error', 6000);
    } finally {
      btn.disabled = false;
      if (btn.textContent === busy) btn.textContent = label;
    }
  };

  ui.button = (label, { variant = 'secondary', onClick, title } = {}) => {
    const b = h('button', { class: 'cc-btn cc-btn-' + variant, type: 'button', title });
    b.textContent = label;
    if (onClick) b.addEventListener('click', ui.action(b, onClick));
    return b;
  };

  ui.avatar = (url, name, size = 40) => {
    const initials = (name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    return url
      ? h('img', { class: 'cc-avatar', src: url, alt: '', width: size, height: size, style: { width: size + 'px', height: size + 'px' } })
      : h('span', { class: 'cc-avatar cc-avatar-initials', style: { width: size + 'px', height: size + 'px' } }, initials);
  };

  // ---------- hover card ----------
  let card, hideTimer;
  ui.hoverCard = (anchor, build) => {
    const show = () => {
      clearTimeout(hideTimer);
      card = card || document.body.appendChild(h('div', { class: 'cc-hovercard', role: 'tooltip' }));
      card.replaceChildren(build());
      card.style.display = 'block';
      const r = anchor.getBoundingClientRect();
      const cw = card.offsetWidth, ch = card.offsetHeight;
      let left = r.right + 8;
      if (left + cw > innerWidth - 8) left = r.left - cw - 8;
      if (left < 8) left = Math.max(8, Math.min(innerWidth - cw - 8, r.left));
      let top = Math.min(Math.max(8, r.top), innerHeight - ch - 8);
      card.style.left = left + 'px';
      card.style.top = top + 'px';
    };
    const hide = () => { hideTimer = setTimeout(() => { if (card) card.style.display = 'none'; }, 150); };
    anchor.addEventListener('mouseenter', show);
    anchor.addEventListener('mouseleave', hide);
    anchor.addEventListener('focus', show);
    anchor.addEventListener('blur', hide);
    if (!ui._cardBound) {
      ui._cardBound = true;
      document.addEventListener('mouseover', (e) => {
        if (card && card.contains(e.target)) clearTimeout(hideTimer);
      });
      document.addEventListener('mouseout', (e) => {
        if (card && card.contains(e.target) && !card.contains(e.relatedTarget)) hide();
      });
    }
  };
  ui.hideHoverCard = () => { if (card) card.style.display = 'none'; };

  // ---------- day grid (booking calendar) ----------
  // items: [{start, end, title, kind: 'meeting'|'session'}], slots: [{id, start, end}]
  ui.dayGrid = ({ days, items, slots, selectedSlotId, onPick, pxPerMin = 1.4 }) => {
    const byDay = (arr, key) => arr.filter((x) => ui.dayKey(x.start) === key);
    const all = items.concat(slots);
    const mins = all.map((x) => ui.minutes(x.start));
    const maxs = all.map((x) => ui.minutes(x.end) || 1440);
    let from = Math.max(0, Math.floor((Math.min(...mins, 9 * 60) - 30) / 60) * 60);
    let to = Math.min(1440, Math.ceil((Math.max(...maxs, 18 * 60) + 30) / 60) * 60);
    const height = (to - from) * pxPerMin;

    const axis = h('div', { class: 'cc-grid-axis', style: { height: height + 'px' } });
    for (let m = from; m < to; m += 60) {
      const d = new Date(2000, 0, 1, m / 60);
      axis.append(h('div', { class: 'cc-grid-hour', style: { top: (m - from) * pxPerMin + 'px' } },
        new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(d)));
    }

    const cols = days.map((day) => {
      const col = h('div', { class: 'cc-grid-col', style: { height: height + 'px' } });
      for (let m = from; m < to; m += 60) col.append(h('div', { class: 'cc-grid-line', style: { top: (m - from) * pxPerMin + 'px' } }));
      const place = (el, x) => {
        const top = (ui.minutes(x.start) - from) * pxPerMin;
        const hgt = Math.max(14, ((x.end - x.start) / 60000) * pxPerMin - 2);
        el.style.top = top + 'px';
        el.style.height = hgt + 'px';
        return el;
      };
      for (const it of byDay(items, day.key)) {
        const pending = it.kind === 'meeting' && it.status === 'PENDING';
        col.append(place(h('div', { class: 'cc-grid-item cc-grid-' + it.kind + (pending ? ' cc-grid-pending' : ''), title: `${it.title}${pending ? ' (pending)' : ''}\n${ui.range(it.start, it.end)}${it.place ? '\n' + it.place : ''}` },
          h('span', { class: 'cc-grid-item-title' }, it.title)), it));
      }
      const dayItems = byDay(items, day.key);
      for (const s of byDay(slots, day.key)) {
        // Swapcard counts a slot as free even if you're in a session then; flag those.
        const clash = dayItems.find((it) => it.start < s.end && it.end > s.start);
        const b = place(h('button', {
          type: 'button',
          class: 'cc-grid-slot' + (s.id === selectedSlotId ? ' cc-selected' : '') + (clash ? ' cc-grid-clash' : ''),
          title: 'Book ' + ui.range(s.start, s.end) + (clash ? `\nOverlaps: ${clash.title}` : ''),
        }, ui.time(s.start), clash ? h('span', { class: 'cc-clash-note' }, ' · overlaps') : null), s);
        b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onPick(s); });
        col.append(b);
      }
      return h('div', { class: 'cc-grid-daywrap' }, h('div', { class: 'cc-grid-dayhead' }, day.label), col);
    });

    return h('div', { class: 'cc-grid' },
      h('div', { class: 'cc-grid-axiswrap' }, h('div', { class: 'cc-grid-dayhead' }, ''), axis),
      ...cols);
  };
})();
