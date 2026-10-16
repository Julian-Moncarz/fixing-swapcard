# Chrome Web Store listing: Calmer Card

Copy for the Chrome Web Store developer dashboard. Visibility: **Unlisted**.

## Name

Calmer Card

## Short description (132 characters max)

A calmer Swapcard for conference attendees: one calendar for your schedule, one inbox for requests and chats, profiles in place.

## Category

Productivity (Workflow and Planning)

## Detailed description

Calmer Card makes the Swapcard attendee web app (app.swapcard.com) easier to use at a busy conference. It changes how Swapcard looks and behaves in your own browser tab. It does not change anything on Swapcard's servers beyond the actions you take yourself (for example, accepting a meeting request).

What it changes:

- **One Schedule tab.** Home, My Schedule and Agenda become a single calendar. Your meetings and the sessions you registered for appear as usual, and every session you are not attending is drawn in light grey at its time, so you can see what else is on and add it in one click.
- **Hide sessions.** Remove sessions you don't want from your calendar, one at a time or a whole family at once (for example, all "Office hours"). Undo is always one click away, and you can show hidden sessions again at any time.
- **Day view.** Click a day or a busy time slot to see just that day, full width, with every session as a readable block.
- **An email-style Inbox.** Meeting requests, connection requests and chats are merged into one list, one row per person, with the ones that need you first. A pending request is pinned above the conversation, showing whether you are free at the proposed time. Keyboard shortcuts let you move through the list and accept or decline quickly.
- **Side panel.** Clicking a person, a session or a meeting opens it in a side panel instead of navigating away, so you never lose your place.
- **Book 1:1s on mutual free time.** When you ask someone to meet, you see your own day (meetings and sessions) with the times you are both free highlighted, then pick one.
- **Feedback button.** Tell us how the interface should change, with an optional screenshot you can mark up and blur before sharing.

Calmer Card is an independent, open-source project. It is not affiliated with, endorsed by, or sponsored by Swapcard. "Swapcard" is a trademark of its owner and is used here only to describe what the extension works with.

Source code: https://github.com/Julian-Moncarz/fixing-swapcard

## Single purpose

Calmer Card has one purpose: to make the Swapcard attendee web app at app.swapcard.com calmer and easier to use, by reorganizing its schedule, messages, requests and profile views within the page.

## Permission justifications

### Host permission: `https://app.swapcard.com/*`

The extension only modifies the Swapcard attendee web app, so its content scripts and styles must run on pages at app.swapcard.com. It requests no other host and does not run on any other site.

### Content script in the page's main world (`"world": "MAIN"`)

Calmer Card reuses Swapcard's own page runtime instead of making its own network connections: it reads the app's theme so its additions match Swapcard's look, and it sends its queries and actions (for example, loading the session list or accepting a request) through the GraphQL client the Swapcard page already uses, with the session the user is already signed in with. These objects only exist in the page's JavaScript context, so the content script must run in the main world. The extension declares no other permissions (no tabs, storage, cookies, history or background service worker).

### Remote code

None. All JavaScript and CSS ship inside the extension package. The extension does not load or evaluate code from any server.

## Data use disclosure

For the "Privacy practices" tab:

- **Data collected:** none. The extension does not collect, transmit, sell or share any user data with the developer or any third party.
- **Network traffic:** the only requests Calmer Card makes go to Swapcard's own servers, through the Swapcard page's existing client and your existing sign-in, to load and act on the same data the Swapcard app already shows you.
- **Stored locally:** your hidden-session choices and two display preferences (show sessions I'm not attending, show hidden sessions) are saved in the browser's `localStorage` for app.swapcard.com. They never leave your browser, and clearing site data removes them.
- **Feedback:** the feedback button opens a pre-filled GitHub issue page in a new tab with your comment, the page you were on, the extension version and the names of any Swapcard page parts the extension couldn't find (no personal data). Nothing is sent until you choose to submit it on GitHub, under your own GitHub account. If you add a screenshot, it is captured and marked up locally and copied to your clipboard so you can paste it in yourself.
- **Certifications** (tick all three in the dashboard): the developer does not sell or transfer user data to third parties outside the approved use cases; does not use or transfer user data for purposes unrelated to the item's single purpose; does not use or transfer user data to determine creditworthiness or for lending purposes.

Privacy policy URL: https://github.com/Julian-Moncarz/fixing-swapcard/blob/main/PRIVACY.md
