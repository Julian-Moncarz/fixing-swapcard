---
name: live-test
description: Test Calmer Card changes in a real Swapcard tab without reloading the extension. Use after editing src/ and before committing or releasing, or when the user reports something broken on app.swapcard.com.
---

# Live-test Calmer Card on Swapcard

Testing happens in the user's own logged-in Swapcard tab (Claude in Chrome). It's a real event with real people: read and look freely, but never accept, decline, book, connect, message or change availability for a real attendee unless the user has allowed it for that person (see `CLAUDE.local.md`). Undo anything you change.

## Load the latest code into a tab

The installed extension keeps running old code until the user reloads it in `chrome://extensions`. To test your edits now:

1. `node scripts/build-bundle.mjs`, and make sure `python3 scripts/dev-server.py` is running (port 8765).
2. In the tab: `localStorage.setItem('cc:off','1')`, then reload the page. The installed copy now stays off.
3. After the page loads:
   ```js
   localStorage.removeItem('cc:off');
   const t = await (await fetch('http://127.0.0.1:8765/calmercard.bundle.js', { cache: 'no-store' })).text();
   (0, eval)(t);
   ```
   Wait ~8 s for boot. `window.CalmerCard` is now your build.
4. A full page reload brings back the installed copy. Use `window.next.router.push(url)` for in-app navigation so your build stays loaded.

Leave `cc:off` removed when you're done, or the user's extension stays off in that browser.

## Tool quirks (Claude in Chrome)

- **Redacted output:** `javascript_tool` output that looks like base64, a JWT or a query string comes back as `[BLOCKED: …]`. Swapcard ids are base64, so return counts and booleans rather than ids, and replace `?&=` in strings you print.
- **Two coordinate frames:** screenshots use a scaled frame (shown in the result), and that's what clicks take. The `zoom` action at `scale: 0.99` returns retina-resolution crops.
- **Swapcard's own toasts** (new requests) cover the top right. Dismiss them before judging layout.
- **Don't change the window size:** resizing may not apply when the window is maximized.

## Checklist (run what your change touches; all of it before a release)

Run each check as a script that returns facts. Look at screenshots only to judge layout.

- **Schedule** (`/my-schedule`):
  - the nav shows Schedule and Inbox, inline; `[data-cc-navbox]` and `[data-cc-topbar]` exist;
  - `[data-cc-col]` is `wrap,aside,main`;
  - the now line and `.cc-day-info` render;
  - availability bands `.cc-avail-off` and `.cc-avail-hint` render;
  - **no redraw loop:** a MutationObserver counting changes over 3 idle seconds reports 0.
- **Calendar (grey sessions):** turn on "Show sessions I'm not attending" (`.cc-allsessions-toggle input`):
  - blocks are squeezed and ghosts render;
  - after you turn it off again, every block's `style` attribute matches what it was before;
  - a `.cc-ghost-chip` click opens the day view, and Esc exits;
  - finally, restore the user's setting (`cc:showAllSessions`).
- **Availability:** a drag over a hatched band reopens it and the toast's Undo restores it. Check through `CC.data.availability()`.
- **Inbox** (`/messages`):
  - rows render, including contacts marked "Connected · no messages yet";
  - selecting a request shows "About the meeting" where a description exists;
  - the right column profile loads;
  - a contact's Message button lands on `/person/…?openConnection=true` with a "Talk to …" box.
- **Attendees:**
  - the "Need to meet?" and "Online now" boxes are hidden;
  - a person link opens the side panel;
  - in the panel, Book a 1:1 shows day tabs and slots, and the hour axis lines up with the columns (0 px offset);
  - the list's own Message button opens the chat, not the side panel.
- **Profile page:** Meet opens Swapcard's dialog with `.cc-book` inside it. Close it without sending.
- **Feedback:** the button opens the dialog. Don't send unless asked.
- **Redirects:** `router.push` to `/event/<slug>` and to `/plannings/…` both land on `my-schedule`.
- **Health:** `CalmerCard.health.missing()` is `[]`.

If anything in this skill turns out to be wrong or out of date, fix it here as soon as you notice, and add what you learn.
