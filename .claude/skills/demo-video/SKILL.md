---
name: demo-video
description: Record, anonymize, edit and publish Calmer Card demo videos (before/after flows with captions, spotlight, click counter and music), and embed them so they play in the README. Use when the user asks for a demo, a video, new footage or caption changes.
---

# Make a Calmer Card demo video

The pipeline: anonymize the live page, capture stills, define a timeline in `scripts/demo/make_video.py`, render with ffmpeg, compress, upload as a GitHub attachment, then embed the attachment URL in the README.

## 1. Capture (Claude in Chrome, the user's real Swapcard tab)

- **Anonymize first, on every page load:** fetch `scripts/demo-anonymize.js` from the dev server (`cp scripts/demo-anonymize.js dist/`; it serves `dist/`) and `eval` it. Before each capture, check that no real name is on screen:
  ```js
  [...window.__ccAnon.people.keys()].filter((n) => document.body.innerText.includes(n)).length === 0
  ```
  Things it doesn't cover, which you must handle:
  - text inside `<textarea>` values: swap the displayed value for the capture, then restore the real value before anything is sent;
  - real first names in notes you type: don't type them, or swap them as above;
  - Swapcard's own notification toasts: dismiss them;
  - your own name and photo, which stay real.
- **Stock Swapcard shots:** set `localStorage['cc:off']='1'`, reload, run the anonymizer. **Calmer Card shots:** load the current build (`/live-test`), then run the anonymizer.
- **Capture method:** each frame is two half-screen crops via `computer` `zoom` at `scale: 0.99`, regions `[0,0,W/2,H]` and `[W/2,0,W,H]` in the screenshot frame. They come back at retina resolution (about 2000 px wide stitched). Save them as `shots/<name>_L.png` and `<name>_R.png` in the scratchpad.
- **Frames:** note the screenshot frame (`ERA` in the script: `A` 1384x868, `B` 1413x840). All coordinates for spotlights, ripples and cameras use that frame. The default 16:9 crop cuts off the bottom of a B frame (the bottom 45 px), so use the camera `(0, 45, 1413)` for shots whose action sits at the bottom (Send buttons, the feedback button).
- **Hover the mouse** where the next click goes before capturing; the real cursor shows in the shot.
- **Real actions:** a "full flow" may need a real booking or send. Only do it with people the user has cleared (`CLAUDE.local.md`), add a note saying it's for the demo, and tell the user afterwards.

## 2. Edit (`scripts/demo/make_video.py`)

- **`TIMELINES`** holds one list per video (`main`, `decide`, …), rendered with `--cut NAME`.
- **Cards:**
  - `flow_card(title)`: dark screen with the flow's name;
  - `old_card('')`: red "With current Swapcard";
  - `new_card()`: green "With Calmer Card";
  - `dict(kind='outro', bullets=[…])`: end screen, bullets appear one by one.
- **`shot(name, era, dur, cams, caption, tag, counter, ripples=, focus=, cap_top=, closeups=, img=)`:**
  - `cams=STILL_A`/`STILL_B` for no zoom, and keep zooms rare and gentle (the user disliked aggressive ones);
  - `focus=` is the spotlight rect (or `[(u, rect), …]` to move it);
  - `counter` is the cumulative click count for current-Swapcard flows only (it ticks up from the previous shot);
  - `cap_top=True` when the action is near the bottom;
  - captions support `*italic*` and emoji.
- **Style the user approved:**
  - short, clear captions that say what to do or what you see;
  - a shot holds about 3 to 4 s;
  - the intro is about 1.3 s and flow titles about 2.4 s;
  - a click counter only on current-Swapcard flows;
  - no top tags.
- **Preview** with `--preview` (one still per item) and build a contact sheet before a full render.
- **Music:** "Hip Hop Beat" by JonasBlakewood (Pixabay license, no credit needed). Trim and fade it to the video's exact length with ffmpeg (`afade=t=out:st=<len-3>:d=3,loudnorm=I=-15`), or the fade gets cut off. Downloading any new track needs the user's OK.
- **Renders** go to `docs/demo/*.mp4` (git-ignored). Python deps live in a venv (Pillow, numpy, scipy); fonts are Poppins from `~/Library/Fonts` and Apple Color Emoji.

## 3. Publish (inline in the README)

GitHub plays a video inline only when it's a `https://github.com/user-attachments/assets/…` URL on its own line. The free-plan limit is 10 MB, so compress first:
```bash
ffmpeg -i in.mp4 -c:v libx264 -preset slow -crf 25 -tune stillimage -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart out-web.mp4
```
Upload without posting anything:
1. Open `github.com/<repo>/issues/new`. GitHub's CSP blocks fetching from localhost, and the editor has no file input until the native picker opens.
2. Add a temporary `<input type=file>` to the page with JS, find it, and put the file in it with `file_upload`.
3. Dispatch `dragenter`/`dragover`/`drop` on the description `textarea` with a `DataTransfer` holding that file.
4. Poll the textarea for the `user-attachments` URL.
5. Clear the textarea (native value setter + `input` event), remove the temporary input, and leave without creating the issue.

Show every new cut to the user for approval before embedding or publishing.

If anything in this skill turns out to be wrong or out of date, fix it here as soon as you notice, and add what you learn.
