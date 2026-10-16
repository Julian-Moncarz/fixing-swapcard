// Demo-recording helper (not part of the extension): replaces attendees' names, job titles,
// organizations, photos and personal text with consistent fake ones, so screenshots and videos of
// a real event can be shared. Paste into the console (or eval) on app.swapcard.com. Works with
// Calmer Card on or off. Your own name and photo are kept. Re-applies itself as the page changes.
(() => {
  if (window.__ccAnon) return window.__ccAnon.apply();

  const FIRST = ['Alex', 'Priya', 'Sam', 'Maya', 'Jordan', 'Lena', 'Omar', 'Hana', 'Theo', 'Ines', 'Ravi', 'Clara', 'Mateo', 'Yuki', 'Noah', 'Amara', 'Felix', 'Sofia', 'Ben', 'Leila', 'Kai', 'Nora', 'Daniel', 'Zoe', 'Elias', 'Mira', 'Owen', 'Talia', 'Hugo', 'Ana', 'Iris', 'Luca', 'Nadia', 'Simon', 'Freya', 'Tomas', 'Aisha', 'Jonah', 'Vera', 'Rafael', 'Elena', 'Malik', 'Greta', 'Paolo', 'Rosa', 'Kian', 'Lucia', 'Arjun', 'Esme', 'Bruno'];
  const LAST = ['Rivera', 'Shah', 'Okafor', 'Lindqvist', 'Moreau', 'Tanaka', 'Haddad', 'Novak', 'Brennan', 'Costa', 'Iyer', 'Weber', 'Santos', 'Kim', 'Fischer', 'Mensah', 'Rossi', 'Kowalski', 'Ahmed', 'Larsen', 'Nguyen', 'Duarte', 'Berg', 'Osei', 'Park', 'Klein', 'Silva', 'Murphy', 'Varga', 'Cohen', 'Byrne', 'Andersen', 'Petrov', 'Romero', 'Hoffmann', 'Ito', 'Mwangi', 'Dubois', 'Reyes', 'Lund', 'Bauer', 'Chen', 'Khan', 'Oliveira', 'Sato'];
  const TITLES = ['Research Scientist', 'Policy Analyst', 'Founder', 'Program Manager', 'PhD Student', 'Software Engineer', 'Operations Lead', 'Grantmaker', 'Researcher', 'Product Manager'];
  const ORGS = ['Northbridge Institute', 'Clearwater Lab', 'Open Futures', 'Meridian Policy', 'Lumen Research', 'Harbor Foundation', 'Atlas University', 'Signal Works', 'Cedar Collective', 'Brightline'];
  const BIOS = [
    'I research how to evaluate frontier AI systems, with a focus on dangerous capability evaluations. Before this I worked as a data scientist in healthcare.',
    'Policy researcher working on compute governance and international coordination. Previously at a think tank in Brussels.',
    'I run a university AI safety group and help new organizers get started. Interested in field-building and mentorship.',
    'Software engineer moving into alignment research. I have been working through interpretability papers and building small replications.',
    'Grantmaker focused on technical AI safety. Happy to talk about funding landscapes and what makes a strong proposal.',
  ];
  const FILLER = [
    'I work on evaluating frontier AI systems and want to meet people thinking about governance and safety careers.',
    'Happy to chat about research directions, hiring, or how to get started in the field. Open to 1:1s all weekend.',
    'Looking forward to meeting! I would love to hear about your work and share what our team is doing.',
    'Thanks for reaching out. Saturday afternoon works well for me, see you at the meeting point.',
    'I am exploring a move into AI policy and would value advice from people a few steps ahead.',
  ];

  // FNV-1a plus a murmur3 finalizer, so similar names spread evenly over the pools.
  const hash = (s) => {
    let h = 2166136261;
    for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  };
  const pick = (arr, s, salt = '') => arr[hash(salt + s) % arr.length];

  // ---- who is on the page: walk Swapcard's Apollo caches for people ----
  const fiberOf = (el) => { const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$')); return k && el[k]; };
  let clientsMemo = null;
  const findClients = () => {
    if (clientsMemo && clientsMemo.length > 1) return clientsMemo;
    const out = new Set();
    if (window.__APOLLO_CLIENT__) out.add(window.__APOLLO_CLIENT__);
    const root = document.getElementById('__next');
    // Walk the whole React tree (child and sibling links); providers can sit on any branch.
    // Providers sit above the DOM nodes, so climb to the React root first, then walk down.
    let top = root && root.firstElementChild && fiberOf(root.firstElementChild);
    while (top && top.return) top = top.return;
    const stack = [top];
    for (let n = 0; stack.length && n < 200000; n++) {
      const f = stack.pop();
      if (!f) continue;
      const c = f.memoizedProps && f.memoizedProps.client;
      if (c && c.cache && typeof c.cache.extract === 'function') out.add(c);
      if (f.sibling) stack.push(f.sibling);
      if (f.child) stack.push(f.child);
    }
    try { (window.CalmerCard && window.CalmerCard.clients && Object.values(window.CalmerCard.clients() || {}) || []).forEach((c) => c && c.cache && out.add(c)); } catch {}
    clientsMemo = [...out];
    return clientsMemo;
  };
  let me = null;
  const people = new Map(); // "First Last" -> fake {first, last, title, org}
  const exact = new Map();  // real string -> fake string (titles, orgs, single names)
  const singles = new Map(); // first name only (people we only know by first name)
  const addPerson = (first, last, title, org) => {
    if (!first) return;
    first = first.trim(); last = (last || '').trim();
    // Never learn our own fake names back from the page.
    if (FIRST.includes(first) && (!last || LAST.includes(last.split(' ').pop()))) return;
    if (!last) { if (first.length > 2 && !(me && me.startsWith(first + ' '))) singles.set(first, pick(FIRST, first, 'f')); return; }
    const real = `${first} ${last}`;
    if (me && real === me) return;
    if (people.has(real)) return;
    const f = { first: pick(FIRST, real, 'f'), last: pick(LAST, real, 'l') };
    // Title and organization follow from the fake name, so every screen agrees.
    [f.title, f.org] = [pick(TITLES, `${f.first} ${f.last}`, 't'), pick(ORGS, `${f.first} ${f.last}`, 'o')];
    people.set(real, f);
    const generic = (v) => /^(n\/?a|none|null|student|self|self-employed|independent|-+|\.+)$/i.test(v.trim());
    if (title && title.length > 2 && !generic(title)) exact.set(title.trim(), f.title);
    if (org && org.length > 2 && !generic(org)) exact.set(org.trim(), f.org);
  };
  const scan = () => {
    for (const c of findClients()) {
      let data = {};
      try { data = c.cache.extract(); } catch {}
      for (const o of Object.values(data)) {
        if (!o || typeof o !== 'object') continue;
        const first = o.firstName || o.firstname, last = o.lastName || o.lastname;
        if (typeof first === 'string') addPerson(first, last, o.jobTitle || o.title, o.organization || o.company);
        else if (typeof o.displayName === 'string') { const [f, ...l] = o.displayName.trim().split(/\s+/); addPerson(f, l.join(' ')); }
      }
    }
    // Names shown on the page: person links, Inbox rows, image alts.
    const asName = (txt) => {
      const t = (txt || '').trim().replace(/\s+/g, ' ');
      // Every word capitalized ("Ana de Souza" style particles allowed), so UI phrases aren't names.
      if (!/^\p{Lu}[\p{L}'’.-]+( (?:\p{Lu}[\p{L}'’.-]+|de|da|van|von|der|di|du|le|la|bin|al))*( \p{Lu}[\p{L}'’.-]+)$/u.test(t) || t.length > 40) return;
      if (/^(Chat|Meeting|Book|Send|See|My|Your|Event|Show|Open|Full|Add|Not|Give|Make|Pick|Speed|Office|Relaxed|Lunch)\b/.test(t)) return;
      const [f, ...l] = t.split(' ');
      addPerson(f, l.join(' '));
    };
    document.querySelectorAll('.cc-ib-name, .cc-p-name, .cc-drawer-title').forEach((e) => asName(e.textContent));
    document.querySelectorAll('a[href*="/person/"]').forEach((a) => {
      const leaf = [...a.querySelectorAll('*')].find((e) => !e.childElementCount && e.textContent.trim().length > 3);
      asName(leaf ? leaf.textContent : a.textContent);
    });
    document.querySelectorAll('img[alt]').forEach((i) => asName(i.alt));
  };
  // Your own name, from the avatar menu image alt or the top bar.
  try {
    const img = document.querySelector('[class*="top-bar__DropDownWrapper-sc-"] img');
    if (img && img.alt) me = img.alt.trim();
  } catch {}
  if (!me) me = 'Julian Moncarz';

  // ---- replace on screen ----
  // Fake title and organization for a fake full name (the same everywhere it appears).
  const fakeJob = (nm) => {
    return [pick(TITLES, nm, 't'), pick(ORGS, nm, 'o')];
  };
  const avatar = (seed, label) => {
    const hue = hash(seed) % 360;
    const ini = label.split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="hsl(${hue},45%,72%)"/><text x="50%" y="54%" font-family="Helvetica,Arial" font-size="38" font-weight="600" fill="#fff" text-anchor="middle" dominant-baseline="middle">${ini}</text></svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  };
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let re = null, firstRe = null, bothRe = null, lastRe = null, firstMap = new Map(), lastMap = new Map();
  const buildRe = () => {
    const names = [...people.keys()].sort((a, b) => b.length - a.length);
    re = names.length ? new RegExp(names.map(escapeRe).join('|'), 'g') : null;
    // First names alone ("Meeting with Sophie", "Aashka wants to meet").
    firstMap = new Map();
    for (const [real, f] of people) { const fn = real.split(' ')[0]; if (fn.length > 2 && !firstMap.has(fn)) firstMap.set(fn, f.first); }
    for (const [fn, fake] of singles) if (!firstMap.has(fn)) firstMap.set(fn, fake);
    // First names that are also ordinary words or place names are only replaced as part of a full name.
    for (const w of ['New', 'York', 'May', 'June', 'April', 'Sun', 'Lunch', 'Global', 'Speed', 'Office', 'Meetup', 'Student', 'Venue', 'Early', 'Badge']) firstMap.delete(w);
    const myFirst = me.split(' ')[0];
    firstMap.delete(myFirst);
    const fns = [...firstMap.keys()].sort((a, b) => b.length - a.length);
    firstRe = fns.length ? new RegExp(`\\b(${fns.map(escapeRe).join('|')})\\b`, 'g') : null;
    // Safety net: a real surname (4+ letters) never shows, even split from its first name.
    lastMap = new Map();
    for (const [real, f] of people) { const ln = real.split(' ').slice(1).join(' '); if (ln.length >= 4 && !LAST.includes(ln) && !lastMap.has(ln)) lastMap.set(ln, f.last); }
    const lns = [...lastMap.keys()].sort((a, b) => b.length - a.length);
    lastRe = lns.length ? new RegExp(`\\b(${lns.map(escapeRe).join('|')})\\b`, 'g') : null;
    const parts = names.map(escapeRe).concat(fns.map((f) => `\\b${escapeRe(f)}\\b`));
    bothRe = parts.length ? new RegExp(parts.join('|'), 'g') : null;
  };
  // Personal free text lives on profiles, chats and requests. Session descriptions are public.
  const personalContext = (el) => !!el.closest([
    '.cc-drawer-body', '.cc-ib', '.cc-request-msg', '.cc-ib-side', '[class*="content__MessageWrapper-sc-"]',
    '[class*="notification"]', '[class*="Notification"]', '[class*="profile"]', '[class*="Profile"]',
  ].join(',')) || /\/person\//.test(location.pathname);
  const isSessionText = (el) => !!el.closest('[class*="timeline-block__"], .cc-ghost, .cc-ghost-chip, .cc-grid-session, .cc-day-info, [class*="planning"], .cc-s-head, .cc-s-desc, .cc-hover-card, [class*="hover"]');

  const usedIn = new WeakMap(); // panel -> filler indexes already used there
  const done = new WeakMap(); // text node -> what we wrote, so we don't redo our own output
  const fixText = (t) => {
    const v = t.nodeValue;
    if (!v || !v.trim() || done.get(t) === v) return;
    let n = v;
    // One pass over full names and first names, so a fake name is never replaced again.
    const firstToo = !isSessionText(t.parentElement || document.body);
    const both = firstToo ? bothRe : re;
    if (both) n = n.replace(both, (m) => { const f = people.get(m); return f ? `${f.first} ${f.last}` : firstMap.get(m) || m; });
    if (lastRe && firstToo) n = n.replace(lastRe, (m) => lastMap.get(m) || m);
    const trimmed = n.trim();
    if (exact.has(trimmed)) n = n.replace(trimmed, exact.get(trimmed));
    const el = t.parentElement;
    // Chat bubbles and Inbox previews: any message text. Elsewhere on personal pages: long text.
    const isMsg = el && el.closest('[class*="content__MessageWrapper-sc-"], .cc-ib-what:not(.cc-ib-meeting):not(.cc-ib-connect), .cc-request-msg');
    if (el && isMsg && trimmed.length > 12 && !el.closest('time')) n = pick(FILLER, trimmed);
    else if (el && trimmed.length > 60 && personalContext(el) && !isSessionText(el) && !el.closest('button, a[href*="/planning"], .cc-request-done, .cc-toast, .cc-p-label, .cc-empty, .cc-muted')) {
      // Salted by the section label above, so About and Goals don't read the same.
      const label = (el.previousElementSibling || el.parentElement.previousElementSibling || {}).textContent || '';
      // Never the same filler twice in one panel.
      const box = el.closest('.cc-drawer-body, .cc-ib-side, [class*="aside__Aside-sc-"], main') || document.body;
      const used = usedIn.get(box) || new Set();
      let i = hash(label + trimmed) % BIOS.length;
      for (let k = 0; k < BIOS.length && used.has(i); k++) i = (i + 1) % BIOS.length;
      used.add(i); usedIn.set(box, used);
      n = BIOS[i];
    }
    // "Job title · organization" under a name in person lists.
    if (el && el.classList.contains('cc-person-row-sub')) {
      const nm = (el.parentElement.querySelector('.cc-person-row-name') || {}).textContent || n;
      n = fakeJob(nm.trim()).join(' · ');
    }
    // A profile header's "job title · organization" line.
    const head = el && el.closest('.cc-p-headtext');
    if (head && el.classList.contains('cc-p-sub') && head.querySelector('.cc-p-sub') === el && head.parentElement.querySelector('img, [class*="avatar"]')) {
      const nm = (head.querySelector('.cc-p-name') || {}).textContent || n;
      n = fakeJob(nm.trim()).join(' · ');
    }
    if (n !== v) t.nodeValue = n;
    done.set(t, t.nodeValue);
  };
  // The closest fake full name in the same card (walking up a few levels), or null.
  const nearestFakeName = (el) => {
    const names = new Set([...people.values()].map((f) => `${f.first} ${f.last}`));
    let card = el;
    for (let k = 0; k < 6 && card; k++) {
      card = card.parentElement;
      const hit = card && [...card.querySelectorAll('*')].find((x) => !x.childElementCount && names.has(x.textContent.trim()));
      if (hit) return hit.textContent.trim();
    }
    return null;
  };
  const isMeImg = (img) => (img.alt || '').trim() === me || !!img.closest('[class*="top-bar__DropDownWrapper-sc-"]');
  const fixImg = (img) => {
    if (img.dataset.ccAnon || isMeImg(img)) return;
    const r = img.getBoundingClientRect();
    // Avatars only: small, roughly square images.
    if (r.width > 220 || (r.width && Math.abs(r.width - r.height) > 6)) return;
    if (!/swapcard|cloudfront|amazonaws|googleusercontent|gravatar|linkedin/i.test(img.currentSrc || img.src)) return;
    // Initials from the (already fake) name shown beside it, when there is one.
    const shown = nearestFakeName(img);
    const label = shown ? shown : img.alt && people.has(img.alt.trim()) ? `${people.get(img.alt.trim()).first} ${people.get(img.alt.trim()).last}` : pick(FIRST, img.src) + ' ' + pick(LAST, img.src);
    img.dataset.ccAnon = '1';
    img.srcset = '';
    img.src = avatar(img.src, label);
    if (img.alt) img.alt = label;
  };
  const apply = () => {
    scan();
    buildRe();
    // React renders {first} {last} as separate text nodes; merge those so full names match.
    if (re) document.querySelectorAll('body *').forEach((el) => {
      if (el.childElementCount || el.childNodes.length < 2 || el.closest('script, style')) return;
      const v = el.textContent;
      re.lastIndex = 0;
      if (re.test(v)) { re.lastIndex = 0; el.textContent = v.replace(re, (m) => { const f = people.get(m); return `${f.first} ${f.last}`; }); }
    });
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = w.nextNode())) fixText(t);
    document.querySelectorAll('img').forEach(fixImg);
    // Initials circles (people without a photo): initials of the fake name beside them.
    document.querySelectorAll('.cc-avatar-initials, [class*="avatar__Initials"], [class*="Avatar"] > span:only-child').forEach((el) => {
      const shown = nearestFakeName(el);
      if (!shown) return;
      const ini = shown.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
      if (el.textContent.trim().length <= 3 && el.textContent !== ini) el.textContent = ini;
    });
    // Swapcard's person cards: the one or two short lines right after a name are job title and
    // organization (bell drawer, lists). They become that fake person's title and organization.
    const fakeNames = new Set([...people.values()].map((f) => `${f.first} ${f.last}`));
    document.querySelectorAll('span, div, p, h1, h2, h3, h4, h5').forEach((el) => {
      if (el.childElementCount || !fakeNames.has(el.textContent.trim())) return;
      if (el.closest('.cc-p-headtext, .cc-person-row, .cc-ib-row, .cc-drawer-head')) return; // ours: handled above
      const nm = el.textContent.trim();
      let branch = el;
      for (let k = 0; k < 3 && branch.parentElement && branch.parentElement.children.length < 2; k++) branch = branch.parentElement;
      const sibs = [];
      for (let n = branch.nextElementSibling; n && sibs.length < 2; n = n.nextElementSibling) sibs.push(n);
      const fake = fakeJob(nm);
      sibs.forEach((sib, i) => {
        const v = sib.textContent.trim();
        if (!v || v.length > 70 || sib.querySelector('button, a, img, svg') || /\d{1,2}:\d{2}|Accept|Decline|ago$/i.test(v)) return;
        if (v === fake[0] || v === fake[1] || TITLES.includes(v) || ORGS.includes(v)) return;
        const leaf = sib.childElementCount ? [...sib.querySelectorAll('*')].find((x) => !x.childElementCount && x.textContent.trim()) : sib;
        if (leaf) leaf.textContent = fake[i];
      });
    });
    // Swapcard's own initials circles: 1-3 capital letters in a round box next to a name.
    document.querySelectorAll('span, div, p').forEach((el) => {
      if (el.childElementCount || !/^[A-Z]{1,3}$/.test(el.textContent.trim()) || el.dataset.ccAnonIni === el.textContent) return;
      let round = el, isRound = false;
      for (let k = 0; k < 3 && round; k++, round = round.parentElement) {
        const cs = getComputedStyle(round);
        if (cs.borderRadius.includes('50%') || parseFloat(cs.borderRadius) >= round.offsetWidth / 2 - 1) { isRound = true; break; }
      }
      if (!isRound) return;
      let card = el;
      for (let k = 0; k < 6 && card; k++) {
        card = card.parentElement;
        const nm = card && [...card.querySelectorAll('*')].find((x) => !x.childElementCount && /^\p{Lu}\p{L}+ \p{Lu}[\p{L}'-]+$/u.test(x.textContent.trim()));
        if (nm) {
          const ini = nm.textContent.trim().split(' ').map((w) => w[0]).join('');
          el.textContent = ini; el.dataset.ccAnonIni = ini;
          break;
        }
      }
    });
    // Search boxes that contain a real name.
    document.querySelectorAll('input[type="search"], input[type="text"], input:not([type])').forEach((el) => {
      const v = el.value && el.value.trim();
      if (v && bothRe && new RegExp(`^(?:${bothRe.source})$`).test(v)) { bothRe.lastIndex = 0; el.value = v.replace(bothRe, (m) => (people.get(m) ? people.get(m).first : firstMap.get(m) || m)); }
    });
    document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach((el) => {
      if (!bothRe) return;
      const nv = el.placeholder.replace(bothRe, (m) => (people.get(m) ? people.get(m).first : firstMap.get(m) || m));
      if (nv !== el.placeholder) el.placeholder = nv;
    });
    return people.size;
  };
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; apply(); });
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  window.__ccAnon = { apply, people };
  return apply();
})();
