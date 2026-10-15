# Calmer Card (fixing-swapcard)

A Chrome extension that makes Swapcard's attendee web app calmer to use. It works on any Swapcard event and reuses as much of Swapcard as possible: their calendar, Messages page, Meet modal, theme, and their own GraphQL client.

## What it changes

| Where | Change |
|---|---|
| **Navigation** | One **Schedule** tab (the calendar) replaces Home, My Schedule and Agenda; those URLs redirect to it. Schedule and Inbox come first. The bell and chat icons are gone (Inbox covers both). |
| **Schedule** | Always the calendar (no list view). Sessions you're not attending show in light grey at their times (busy times collapse into a list). Hover for details, one click to add. Toggle under *Appearance*. Uses the full screen width. |
| **Inbox** (new nav item) | Email-style: one list of people on the left (requests and chats merged per person, "Needs you" first, with a filter and search), Swapcard's conversation in the middle with any pending request pinned on top (time, whether you're free, Accept / Decline / Suggest another time), and the full profile on the right. Keyboard: J/K move, A accept, D decline, R reply, / search. Badge counts incoming requests plus unread chats. |
| **Any person link** | Opens a profile drawer instead of navigating away: LinkedIn at the top, full bio, goals, "how I can help", interests. Accept/Decline a pending request, Connect with a note, or **Book a 1:1** on a calendar of your day with mutual free slots highlighted. |
| **Swapcard's Meet modal** | The "Date & time" step gets the same calendar. Picking a slot clicks Swapcard's matching slot, so the rest of their flow is unchanged. |
| **Cruft** | Hides the "Online now" carousel, the "Need to meet? / +N requests sent" promo, and the lead-qualification box. |
| **Feedback** | "Give feedback on this UI" button (bottom left): comment plus an optional screenshot you can mark up (box, draw, blur). |

## Install (for now: developer mode)

1. Download this repo (or `git clone`).
2. Open `chrome://extensions`, turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick this folder.
4. Open any Swapcard event at `app.swapcard.com`.

To update: pull the repo, then click the reload icon on the extension card.

The plan is to publish it unlisted on the Chrome Web Store after EA Global NYC 2026, so installing becomes one click with automatic updates.

## How it works

See [CATALOG.md](CATALOG.md) for the full map of Swapcard's screens, components and GraphQL operations.

- Content scripts run in the page's main world so they can reach Swapcard's React tree.
- Data goes through **Swapcard's own Apollo client** (found by walking React fibers), so auth is handled and their UI stays in sync after our actions. Queries are our own text (`src/data.js`), not their persisted-query hashes, so Swapcard deploys don't break them.
- Styling reads Swapcard's theme object at runtime and exposes it as `--cc-*` CSS variables.
- Swapcard's CSP forbids framing its own pages, so the profile drawer renders their data itself rather than embedding their profile page.

| File | Role |
|---|---|
| `src/core.js` | Hooks: webpack require, gql tag, Apollo clients, theme, route and DOM events, helpers |
| `src/data.js` | Queries and mutations |
| `src/ui.js` | Formatting, toasts, hover card, day grid |
| `src/nav.js` | One Schedule tab, redirects, hides the bell and chat icons |
| `src/calendar.js` | Grey sessions in My Schedule's calendar |
| `src/drawer.js` | Profile drawer and link interception |
| `src/inbox.js` | Inbox nav item, requests section, profile column |
| `src/booking.js` | Calendar picker for the drawer and Swapcard's Meet modal |
| `src/feedback.js` | Feedback button and screenshot markup |
| `src/boot.js` | Startup, page classes, cruft removal |

## Feedback

The "Give feedback on this UI" button opens a pre-filled GitHub issue on this repo (comment, page and version; a marked-up screenshot is copied to the clipboard to paste in). It also links here for anyone who would rather send a pull request. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

```bash
node scripts/build-bundle.mjs
```

Builds `dist/calmercard.bundle.js` (all CSS + JS in one file). `scripts/dev-server.py` serves it on `127.0.0.1:8765` and rebuilds on each request, so a test tab can load the latest code without reloading the extension:

```js
const t = await (await fetch('http://127.0.0.1:8765/calmercard.bundle.js', { cache: 'no-store' })).text();
(0, eval)(t);
```

Debug logging: `localStorage.setItem('cc:debug', '1')`.

```bash
bash scripts/package.sh
```

Builds `dist/calmercard.zip` for the Chrome Web Store.
