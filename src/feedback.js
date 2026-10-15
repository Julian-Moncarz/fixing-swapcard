// Feedback button: "How should this UI change?" with an optional screenshot you can mark up
// (pen, box, blur). Nothing is sent anywhere until the person clicks Send.
(() => {
  const CC = window.CalmerCard;
  if (!CC || CC.isEmbed || CC.feedback) return;
  const { h, ui } = CC;

  // Tally form that receives feedback. Fields are prefilled through URL params (see README).
  const FEEDBACK_FORM_URL = '';

  let modal, shot = null; // shot: { canvas, ops: [] }

  const capture = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) throw new Error('Screen capture isn’t available in this browser');
    modal.hidden = true;
    await CC.sleep(250);
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser' }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include' });
      const video = h('video', { muted: true, playsinline: true });
      video.srcObject = stream;
      await video.play();
      await CC.sleep(200);
      const c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      return c;
    } finally {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      modal.hidden = false;
    }
  };

  // ---------- markup editor ----------
  const editor = (base) => {
    const view = document.createElement('canvas');
    view.width = base.width; view.height = base.height;
    view.className = 'cc-fb-canvas';
    const ctx = view.getContext('2d');
    const ops = [];
    let tool = 'box', drag = null;

    const pixelate = (x, y, w, hgt) => {
      if (w < 0) { x += w; w = -w; }
      if (hgt < 0) { y += hgt; hgt = -hgt; }
      if (w < 2 || hgt < 2) return;
      const s = Math.max(6, Math.round(Math.min(w, hgt) / 12));
      const tmp = document.createElement('canvas');
      tmp.width = Math.max(1, Math.round(w / s)); tmp.height = Math.max(1, Math.round(hgt / s));
      const tctx = tmp.getContext('2d');
      tctx.drawImage(view, x, y, w, hgt, 0, 0, tmp.width, tmp.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, x, y, w, hgt);
      ctx.imageSmoothingEnabled = true;
    };
    const drawOp = (op) => {
      ctx.strokeStyle = '#e5243b'; ctx.lineWidth = Math.max(3, base.width / 400); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (op.t === 'box') ctx.strokeRect(op.x, op.y, op.w, op.h);
      if (op.t === 'blur') pixelate(op.x, op.y, op.w, op.h);
      if (op.t === 'pen') { ctx.beginPath(); op.pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.stroke(); }
    };
    const redraw = (extra) => {
      ctx.drawImage(base, 0, 0);
      // Blurs first so later boxes stay crisp on top of them.
      ops.filter((o) => o.t === 'blur').forEach(drawOp);
      ops.filter((o) => o.t !== 'blur').forEach(drawOp);
      if (extra) drawOp(extra);
    };
    const pos = (e) => {
      const r = view.getBoundingClientRect();
      return [(e.clientX - r.left) * (view.width / r.width), (e.clientY - r.top) * (view.height / r.height)];
    };
    view.addEventListener('pointerdown', (e) => {
      view.setPointerCapture(e.pointerId);
      const [x, y] = pos(e);
      drag = tool === 'pen' ? { t: 'pen', pts: [[x, y]] } : { t: tool, x, y, w: 0, h: 0 };
    });
    view.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const [x, y] = pos(e);
      if (drag.t === 'pen') drag.pts.push([x, y]); else { drag.w = x - drag.x; drag.h = y - drag.y; }
      redraw(drag);
    });
    view.addEventListener('pointerup', () => { if (drag) { ops.push(drag); drag = null; redraw(); } });
    redraw();

    const toolBtn = (id, label) => {
      const b = h('button', { type: 'button', class: 'cc-btn cc-btn-ghost cc-tool' + (tool === id ? ' cc-selected' : '') }, label);
      b.addEventListener('click', () => { tool = id; bar.querySelectorAll('.cc-tool').forEach((x) => x.classList.remove('cc-selected')); b.classList.add('cc-selected'); });
      return b;
    };
    const undo = h('button', { type: 'button', class: 'cc-btn cc-btn-ghost' }, 'Undo');
    undo.addEventListener('click', () => { ops.pop(); redraw(); });
    const bar = h('div', { class: 'cc-row cc-fb-tools' }, toolBtn('box', '▭ Box'), toolBtn('pen', '✎ Draw'), toolBtn('blur', '▦ Blur'), undo);
    return { el: h('div', { class: 'cc-fb-editor' }, bar, view), canvas: view };
  };

  const open = () => {
    if (!modal) build();
    modal.hidden = false;
    modal.querySelector('textarea').focus();
  };
  const close = () => { if (modal) modal.hidden = true; };

  const build = () => {
    const text = h('textarea', { class: 'cc-fb-text', rows: '4', placeholder: 'What should change? What’s annoying, missing, or confusing?' });
    const shotArea = h('div', { class: 'cc-fb-shot' });
    const addShot = ui.button('📸 Add screenshot', {
      onClick: async () => {
        const base = await capture();
        shot = editor(base);
        shotArea.replaceChildren(
          h('div', { class: 'cc-fb-note' }, 'Draw boxes around what you mean. Please blur other people’s names, photos and messages before sending.'),
          shot.el);
        addShot.textContent = '📸 Retake screenshot';
      },
    });
    const send = ui.button('Send feedback', {
      variant: 'primary',
      onClick: async () => {
        const comment = text.value.trim();
        if (!comment && !shot) { ui.toast('Add a comment or a screenshot first', 'error'); return; }
        if (shot) {
          const blob = await new Promise((r) => shot.canvas.toBlob(r, 'image/png'));
          try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); } catch (e) { CC.warn('clipboard', e); }
        }
        if (!FEEDBACK_FORM_URL) {
          try { await navigator.clipboard.writeText(comment); } catch {}
          ui.toast('The feedback form isn’t set up yet. Your comment was copied to the clipboard.', 'error', 7000);
          return;
        }
        const u = new URL(FEEDBACK_FORM_URL);
        u.searchParams.set('comment', comment);
        u.searchParams.set('page', CC.route().page || '');
        u.searchParams.set('version', CC.version);
        u.searchParams.set('screenshot', shot ? 'pasted' : 'none');
        window.open(u.toString(), '_blank', 'noopener');
        ui.toast(shot ? 'Form opened. Paste the screenshot (⌘V) into the upload field.' : 'Form opened in a new tab.', 'success', 7000);
        text.value = ''; shot = null; shotArea.replaceChildren(); addShot.textContent = '📸 Add screenshot';
        close();
      },
    });
    const closeBtn = h('button', { class: 'cc-icon-btn', type: 'button', 'aria-label': 'Close' }, '✕');
    closeBtn.addEventListener('click', close);
    modal = h('div', { class: 'cc-fb-modal', role: 'dialog', 'aria-label': 'Give feedback on this UI', hidden: true },
      h('div', { class: 'cc-fb-card' },
        h('div', { class: 'cc-drawer-head' }, h('div', { class: 'cc-drawer-title' }, 'How should this UI change?'), closeBtn),
        text, shotArea,
        h('div', { class: 'cc-fb-note cc-muted' }, 'Only what you type (and the screenshot, if you attach one) is shared, plus which page you were on.'),
        h('div', { class: 'cc-row cc-row-end' }, addShot, send)));
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });
    document.body.append(modal);
  };

  const mountButton = () => {
    if (document.querySelector('.cc-fb-button') || !document.body) return;
    const b = h('button', { class: 'cc-fb-button', type: 'button' }, '💬 Give feedback on this UI');
    b.addEventListener('click', open);
    document.body.append(b);
  };

  CC.feedback = { open };
  CC.on('dom', mountButton);
})();
