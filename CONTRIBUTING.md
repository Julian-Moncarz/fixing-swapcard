# Contributing to Calmer Card

Thanks for helping make Swapcard calmer. Small, focused pull requests are easiest to review.

## Load the extension unpacked

1. Clone the repo.
2. Open `chrome://extensions`, turn on **Developer mode**.
3. Click **Load unpacked** and pick the repo folder (the one with `manifest.json`).
4. Open an event on https://app.swapcard.com. After editing files, click the reload icon on the extension card and refresh the Swapcard tab.

## Faster dev loop (no extension reloads)

```bash
node scripts/build-bundle.mjs      # builds dist/calmercard.bundle.js (all CSS + JS, manifest order)
python3 scripts/dev-server.py      # serves dist/ on 127.0.0.1:8765, rebuilding on every request
```

With the server running, paste this into the DevTools console of a Swapcard tab to load the latest code. Repeat after each edit (refresh the tab first if state gets confusing):

```js
const t = await (await fetch('http://127.0.0.1:8765/calmercard.bundle.js', { cache: 'no-store' })).text();
eval(t);
```

This is for local development only. The published extension never fetches or evaluates remote code.

Set `localStorage['cc:debug'] = '1'` in the page to turn on debug logging.

## Code map

| File | What it does |
|---|---|
| `src/core.js` | Hooks into Swapcard's runtime (webpack, React, Apollo, theme), routing events |
| `src/data.js` | Our GraphQL queries and mutations, sent through Swapcard's Apollo client |
| `src/ui.js` | Shared UI: formatting, toasts, hover cards, the day grid |
| `src/nav.js` | One Schedule tab, redirects, hides the bell and chat icons |
| `src/calendar.js` | Calendar with sessions you're not attending, hiding sessions, day view |
| `src/drawer.js` | Side panel for people, sessions and meetings; link interception |
| `src/inbox.js` | Email-style Inbox merging requests and chats |
| `src/booking.js` | Picking a mutual free time when booking a 1:1 |
| `src/feedback.js` | Feedback button and screenshot markup |
| `src/boot.js` | Startup: waits for Swapcard, applies theme, removes cruft, starts mods |
| `src/styles.css` | All styles (colors come from Swapcard's theme as `--cc-*` variables) |

`CATALOG.md` documents Swapcard's screens, components and data operations. Check it before adding a query.

## Open a pull request

1. Fork the repo and create a branch (`git checkout -b short-description`).
2. Make your change and test it on a live event page (check the console for `[CalmerCard]` errors).
3. Never commit real attendee data: no names, emails, messages, screenshots of other people, or Swapcard ids that identify a person. Use placeholders like "Jane Doe".
4. Push and open a PR against `main` describing what changed and how you tested it. A before/after screenshot (with other people's details blurred) helps.

By contributing you agree your work is released under the MIT License (see `LICENSE`).
