# Calmer Card

Chrome MV3 extension that restyles and rewires Swapcard's attendee web app (app.swapcard.com). Content scripts run in the page's MAIN world and drive Swapcard's own React tree and Apollo clients.

- Code map and dev loop: `CONTRIBUTING.md`. Swapcard internals (screens, components, GraphQL operations, DOM hooks): `CATALOG.md`. Read the catalogue before adding a query or a DOM hook.
- Procedures live in skills: `/live-test` (test changes in a real Swapcard tab), `/release` (version bump to GitHub release and store zip), `/demo-video` (record, anonymize, render, embed), `/find-swapcard-api` (discover a GraphQL operation).
- Personal setup (install path, test contacts, store account) goes in `CLAUDE.local.md`, which is git-ignored.
- **Keep these files true.** If you find something here, in a skill or in `CATALOG.md` that's wrong or out of date, fix it when you notice, not later. When you learn something a future session would need (a Swapcard change, a gotcha, a working procedure), add it in the right place: facts here, procedures in the skill, Swapcard internals in `CATALOG.md`.

## Commands

- `node scripts/build-bundle.mjs`: `dist/calmercard.bundle.js`, all CSS and JS in manifest order.
- `python3 scripts/dev-server.py`: serves `dist/` on 127.0.0.1:8765 (CORS for app.swapcard.com), rebuilding on every request.
- `bash scripts/package.sh`: `dist/calmercard.zip` (folder inside, for Load unpacked / GitHub release) and `dist/calmercard-store.zip` (manifest at root, for the Chrome Web Store).
- `node --check src/*.js`: there is no test suite or linter. Syntax-check, then test live.

## Facts that bite

- **The version lives in two places:** `manifest.json` `"version"` and `src/core.js` `CC.version`. Bump both.
- **New source files** must be added to `manifest.json` `content_scripts[0].js`. Order matters: `core.js` first, `boot.js` last. The bundle follows the same order.
- **Every module starts** with `if (!CC || CC.<name>) return;`. `localStorage['cc:off'] = '1'` stops `core.js`, so nothing runs. The dev bundle respects that switch too, and it also refuses to load if `window.CalmerCard` already exists (the installed extension is running).
- **Chrome caches unpacked extensions.** Editing files does nothing until the extension is reloaded in `chrome://extensions`, which only the user can click. To test new code without that, use the `/live-test` injection procedure.
- **Swapcard deploys without notice and sometimes renames things.** On 2026-10-16 it moved parts of the app from styled-components (`name__Part-sc-hash`) to atomic classes. Find elements by href, ARIA, role or text; mark them once with `CC.tag(key, …)` (`data-cc-*`) and point CSS at the mark. `CATALOG.md` §7 lists every hook. `CC.health` reports missing hooks in the console and in feedback issues.
- **Calendar blocks** are positioned by Swapcard with inline `inset-inline-start` / `left` / `width`, often as `calc()`. `calendar.js` records Swapcard's values in `data-cc-orig-*` and must restore them exactly. Never leave our `left` on a block that has `inset-inline-start`.
- **The router patch** in `drawer.js` turns navigations to person, session and meeting pages into the side panel. Navigations that carry an intent (`?openConnection=true` = Swapcard's Message button) must pass through.
- **Swapcard's GraphQL accepts any query text but has introspection disabled.** Field and argument names come from Swapcard's own bundle (see `/find-swapcard-api`). Request dates with `(format: ISO8601)`; without it, they come back as event-local times with no offset.
- **Everything is real.** Accepting, declining, booking, connecting, messaging and changing availability all reach real people, and Swapcard shows them to the other person. Do none of it against real attendees unless the user explicitly allows it for that person. Read-only queries are fine.
- **Privacy:** never commit or publish attendee data (names, messages, photos, ids). Screenshots and videos must go through `scripts/demo-anonymize.js` first. `docs/demo/*.mp4` is git-ignored; videos ship as GitHub attachments and release assets.

## Conventions

- Match the surrounding code: small IIFE modules on the `window.CalmerCard` namespace (`CC`), helpers `CC.h`, `CC.fill`, `CC.$$`, `CC.sc`, `CC.tag`, data in `CC.data`, UI in `CC.ui`.
- Colors come from Swapcard's theme as `--cc-*` CSS variables. Don't hard-code brand colors.
- User-facing copy: plain, short, no em dashes; dates like "Sun, Oct 18" or ISO, never numeric month/day.
- Commit messages explain why; push only when asked.
