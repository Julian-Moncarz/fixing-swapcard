// Calmer Card core: hooks into Swapcard's own runtime (webpack, React, Apollo, theme).
// Runs in the page's MAIN world so it can reach React fibers and webpack modules.
(() => {
  if (window.CalmerCard) return;
  // Off switch for comparing with stock Swapcard (demo recordings, bug reports):
  // localStorage.setItem('cc:off', '1') and reload. Every module checks for CC, so nothing runs.
  try { if (localStorage.getItem('cc:off') === '1') return; } catch {}
  const CC = (window.CalmerCard = { version: '0.1.2' });

  CC.debug = (() => { try { return localStorage.getItem('cc:debug') === '1'; } catch { return false; } })();
  CC.log = (...a) => CC.debug && console.log('[CalmerCard]', ...a);
  CC.warn = (...a) => console.warn('[CalmerCard]', ...a);

  // ---------- tiny event bus ----------
  const handlers = {};
  CC.on = (ev, fn) => ((handlers[ev] = handlers[ev] || []).push(fn), fn);
  CC.emit = (ev, ...a) => (handlers[ev] || []).forEach((fn) => {
    try {
      const r = fn(...a);
      if (r && typeof r.catch === 'function') r.catch((e) => CC.warn(ev, e));
    } catch (e) { CC.warn(ev, e); }
  });

  // ---------- route changes (Next.js client routing) ----------
  let lastPath = location.pathname + location.search;
  const routeCheck = () => {
    const p = location.pathname + location.search;
    if (p !== lastPath) { lastPath = p; CC.emit('route', location); }
  };
  for (const m of ['pushState', 'replaceState']) {
    const orig = history[m];
    history[m] = function () { const r = orig.apply(this, arguments); setTimeout(routeCheck, 0); return r; };
  }
  window.addEventListener('popstate', () => setTimeout(routeCheck, 0));

  // ---------- DOM change hook, throttled to one call per frame ----------
  // 'tag' runs from the first frame (it only marks Swapcard's elements with our data-cc-*
  // attributes, so CSS can target them before the rest is ready); 'dom' waits for boot.
  let domQueued = false;
  new MutationObserver(() => {
    if (domQueued) return;
    domQueued = true;
    requestAnimationFrame(() => { domQueued = false; CC.emit('tag'); if (CC.isReady) CC.emit('dom'); });
  }).observe(document.documentElement, { childList: true, subtree: true });

  // The current time. A function so tests can simulate a moment during the event.
  CC.now = () => new Date();
  CC.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  CC.waitFor = async (fn, { timeout = 15000, every = 100 } = {}) => {
    const t0 = Date.now();
    for (;;) {
      let v;
      try { v = fn(); } catch { v = null; }
      if (v) return v;
      if (Date.now() - t0 > timeout) return null;
      await CC.sleep(every);
    }
  };

  // ---------- hook health ----------
  // Swapcard deploys can rename what we hook into; features then fall back to stock Swapcard
  // without a sound. Hooks that found nothing are recorded here (warned once each, and listed
  // in feedback reports) so a breakage shows up before many people hit it.
  const missing = new Map(); // hook name -> Set of pages
  CC.health = {
    report: (names, page = CC.route().page || 'none') => {
      const fresh = names.filter((n) => !(missing.get(n) || new Set()).has(page));
      if (!fresh.length) return;
      fresh.forEach((n) => missing.set(n, (missing.get(n) || new Set()).add(page)));
      CC.warn(`hook missing: ${fresh.join(', ')} (page: ${page})`);
    },
    // A hook found later on the same page (slow wifi, late render) is no longer missing.
    resolve: (names, page = CC.route().page || 'none') => {
      for (const n of names) {
        const pages = missing.get(n);
        if (pages && pages.delete(page) && !pages.size) missing.delete(n);
      }
    },
    missing: () => [...missing].map(([n, pages]) => `${n} (${[...pages].join(', ')})`),
  };

  // ---------- route parsing ----------
  CC.route = () => {
    const m = location.pathname.match(/^\/event\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?/);
    if (!m) return { slug: null, page: null, id: null };
    return { slug: m[1], page: m[2] || 'home', id: m[3] || null };
  };

  // ---------- webpack require ----------
  CC.webpackRequire = () => {
    if (CC._req) return CC._req;
    const chunk = window.webpackChunk_N_E;
    if (!chunk) return null;
    chunk.push([['calmercard_' + Date.now()], {}, (r) => { CC._req = r; }]);
    return CC._req;
  };

  // gql tag: find the graphql-tag module by probing exports of modules that contain the parser.
  CC.gql = (() => {
    let fn = null;
    const find = () => {
      const req = CC.webpackRequire();
      if (!req) return null;
      for (const id of Object.keys(req.m)) {
        let src;
        try { src = req.m[id].toString(); } catch { continue; }
        if (!/Syntax Error|disableFragmentWarnings/.test(src)) continue;
        let ex;
        try { ex = req(id); } catch { continue; }
        const fns = typeof ex === 'function' ? [ex] : Object.values(ex || {}).filter((v) => typeof v === 'function');
        for (const f of fns) {
          try {
            const d = f(['query CalmerCardProbe { __typename }']);
            if (d && d.kind === 'Document') return f;
          } catch {}
        }
      }
      return null;
    };
    return (text) => {
      fn = fn || find();
      if (!fn) throw new Error('CalmerCard: gql tag not found');
      return fn([text]);
    };
  })();

  // ---------- React fiber helpers ----------
  CC.fiberOf = (el) => {
    if (!el) return null;
    const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$'));
    return k ? el[k] : null;
  };
  CC.findInFibers = (el, pred) => {
    let f = CC.fiberOf(el);
    while (f) {
      const v = pred(f);
      if (v) return v;
      f = f.return;
    }
    return null;
  };

  // Apollo clients: walk up from any rendered element. The chat client is the one on window.
  CC.clients = () => {
    if (CC._main) return { main: CC._main, chat: CC._chat || window.__APOLLO_CLIENT__ };
    const el = document.querySelector('#__next a, #__next button, #__next div div');
    const found = [];
    let f = CC.fiberOf(el);
    while (f) {
      const p = f.memoizedProps;
      if (p && p.client && p.client.cache && p.client.query && !found.includes(p.client)) found.push(p.client);
      f = f.return;
    }
    const chat = window.__APOLLO_CLIENT__;
    CC._main = found.find((c) => c !== chat) || null;
    CC._chat = chat || null;
    return { main: CC._main, chat: CC._chat };
  };

  CC.theme = () => {
    if (CC._theme) return CC._theme;
    CC._theme = CC.findInFibers(document.querySelector('#__next a, #__next div div'), (f) => {
      const p = f.memoizedProps;
      return p && p.theme && p.theme.colors ? p.theme : null;
    });
    return CC._theme;
  };

  // Expose Swapcard's theme as CSS variables so our UI matches without hard-coding colors.
  CC.applyThemeVars = () => {
    const t = CC.theme();
    if (!t || CC._themeApplied) return !!t;
    const c = t.colors;
    const vars = {
      '--cc-font': t.fonts.main,
      '--cc-text': c.text.base,
      '--cc-text-muted': c.surface.on,
      '--cc-bg': c.background.base,
      '--cc-surface-variant': c.surface.variant,
      '--cc-disabled': c.surface.disabled,
      '--cc-on-disabled': c.surface.onDisabled,
      '--cc-outline': c.outline.base,
      '--cc-focus': c.outline.focus,
      '--cc-primary': c.primary.base,
      '--cc-on-primary': c.primary.on,
      '--cc-tertiary': c.tertiary.base,
      '--cc-tertiary-container': c.tertiary.container,
      '--cc-success': c.success.base,
      '--cc-success-container': c.success.container,
      '--cc-warning': c.warning.base,
      '--cc-warning-container': c.warning.container,
      '--cc-danger': c.danger.base,
      '--cc-danger-container': c.danger.container,
      '--cc-notification': c.notification.base,
      '--cc-overlay': c.overlay,
      '--cc-radius-sm': t.radius.sm,
      '--cc-radius-md': t.radius.md,
      '--cc-radius-lg': t.radius.lg,
      '--cc-shadow-sm': t.shadow.sm,
      '--cc-shadow-md': t.shadow.md,
      '--cc-shadow-lg': t.shadow.lg,
      '--cc-z-modal': t.zIndex.modal,
    };
    const root = document.documentElement.style;
    for (const [k, v] of Object.entries(vars)) if (v != null) root.setProperty(k, String(v));
    CC._themeApplied = true;
    return true;
  };

  // ---------- GraphQL through Swapcard's own clients ----------
  const docCache = new Map();
  const doc = (text) => {
    if (!docCache.has(text)) docCache.set(text, CC.gql(text));
    return docCache.get(text);
  };
  CC.query = async (text, variables = {}, { client = 'main', fetchPolicy = 'network-only' } = {}) => {
    const c = CC.clients()[client];
    if (!c) throw new Error('CalmerCard: Apollo client not ready');
    // Swapcard batches requests; a batch of never-seen persisted queries occasionally fails at the
    // network level. Retry those (never GraphQL errors) a couple of times.
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await c.query({ query: doc(text), variables, fetchPolicy });
        return r.data;
      } catch (e) {
        const network = e && e.networkError && !(e.graphQLErrors && e.graphQLErrors.length) && !(e.networkError.result);
        if (!network || attempt >= 2) throw e;
        await CC.sleep(300 * (attempt + 1));
      }
    }
  };
  CC.mutate = async (text, variables = {}, { client = 'main', refetch = [] } = {}) => {
    const c = CC.clients()[client];
    if (!c) throw new Error('CalmerCard: Apollo client not ready');
    const r = await c.mutate({ mutation: doc(text), variables });
    if (refetch.length) {
      try { await c.refetchQueries({ include: refetch }); } catch (e) { CC.warn('refetch', e); }
    }
    return r.data;
  };

  // ---------- small DOM helpers ----------
  CC.h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  };
  // Like el.replaceChildren, but flattens arrays and skips null/false like CC.h does.
  CC.fill = (el, ...kids) => {
    el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false && k !== ''));
    return el;
  };
  CC.$ = (sel, root = document) => root.querySelector(sel);
  CC.$$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  // Styled-components class prefix selector, e.g. sc('meeting-item__Container').
  CC.sc = (name) => `[class*="${name}-sc-"]`;
  // Mark an element as one of ours to find again (data-cc-<key>="<value>"), and clear the mark
  // from any element that no longer qualifies. A data attribute, not a class: React leaves
  // attributes it doesn't own alone even when a styled-components class changes.
  CC.tag = (key, els) => {
    const attr = 'data-cc-' + key;
    const keep = new Map(els.filter(Boolean).map(([el, v]) => [el, v]));
    for (const el of document.querySelectorAll(`[${attr}]`)) if (!keep.has(el)) el.removeAttribute(attr);
    for (const [el, v] of keep) if (el.getAttribute(attr) !== v) el.setAttribute(attr, v);
  };
  // The page's 3-column layout columns (left aside, main, right aside). Prefixes like
  // "wrapper__Wrapper" are reused by unrelated components, so anchor on the page content:
  // the grid is a child or grandchild of content__Inner (Swapcard sometimes wraps it in a
  // <main> since their October 2026 update). Found here only; everything else, CSS included,
  // uses the data-cc-col marks: wrap, aside, main.
  CC.layoutColumns = () => {
    // Candidates: wrapper__Wrapper children/grandchildren of content__Inner. The prefix also
    // matches tabs-wrapper__Wrapper and friends, so prefer the one that holds main__Main.
    let wrap = null;
    for (const inner of document.querySelectorAll(CC.sc('content__Inner'))) {
      const kids = [...inner.children];
      const cands = kids.filter((k) => k.tagName === 'MAIN').flatMap((k) => [...k.children])
        .concat(kids, ...kids.map((k) => [...k.children]))
        .filter((k) => k.matches(CC.sc('wrapper__Wrapper')));
      wrap = cands.find((k) => [...k.children].some((c) => c.matches(CC.sc('main__Main')))) || cands[0] || null;
      if (wrap) break;
    }
    const kids = wrap ? [...wrap.children] : [];
    const asides = kids.filter((k) => k.matches(CC.sc('aside__Aside')));
    const main = kids.find((k) => k.matches(CC.sc('main__Main'))) || null;
    CC.tag('col', [wrap && [wrap, 'wrap'], ...asides.map((a) => [a, 'aside']), main && [main, 'main']]);
    return { wrap, asides, main };
  };
  CC.on('tag', CC.layoutColumns);

  // Strip tags from Swapcard's HTML descriptions without executing anything.
  CC.textFromHtml = (html) => {
    const d = new DOMParser().parseFromString(html || '', 'text/html');
    return (d.body.textContent || '').replace(/\s+\n/g, '\n').trim();
  };
  // Keep only safe formatting from Swapcard's HTML descriptions.
  CC.safeHtml = (html) => {
    const d = new DOMParser().parseFromString(html || '', 'text/html');
    const allowed = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'UL', 'OL', 'LI', 'A', 'SPAN']);
    const drop = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE']);
    // Deepest first, so unwrapping a parent never skips its children.
    for (const c of [...d.body.querySelectorAll('*')].reverse()) {
      if (drop.has(c.tagName)) { c.remove(); continue; }
      if (!allowed.has(c.tagName)) { c.replaceWith(...c.childNodes); continue; }
      for (const a of [...c.attributes]) {
        if (!(c.tagName === 'A' && a.name === 'href' && /^https?:/i.test(a.value))) c.removeAttribute(a.name);
      }
      if (c.tagName === 'A') { c.target = '_blank'; c.rel = 'noopener noreferrer'; }
    }
    return d.body.innerHTML;
  };
})();
