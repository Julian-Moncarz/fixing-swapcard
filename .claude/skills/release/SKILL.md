---
name: release
description: Ship a new Calmer Card version - bump the version, package, push, create the GitHub release and build the Chrome Web Store zip. Use when the user says ship, release, cut a version or publish.
---

# Release Calmer Card

Only release what you have tested live (`/live-test`) and what the user asked to ship. Pushing and publishing are outward-facing: confirm first unless the user just told you to.

1. **Clean tree:** `git status` is clean apart from the release change, and `git pull --ff-only` succeeds. If the remote moved (the user sometimes edits the README on GitHub), merge it and keep their wording.
2. **Version:** bump `manifest.json` `"version"` and `src/core.js` `version: '…'` together, then `node --check src/*.js`.
3. **Commit and push:** a short message with the version and what changed for users.
4. **Package:** `bash scripts/package.sh`. Check the version inside both zips:
   ```bash
   unzip -p dist/calmercard.zip calmercard/manifest.json | grep '"version"'
   unzip -p dist/calmercard-store.zip manifest.json | grep '"version"'
   ```
5. **GitHub release:**
   ```bash
   gh release create vX.Y.Z dist/calmercard.zip --title "Calmer Card X.Y.Z" --notes "…"
   ```
   Notes: what's new and what's fixed for attendees, then "Install or update: download calmercard.zip, unzip it (over your old folder if updating), and reload the extension in chrome://extensions." The README's install link is `releases/latest/download/calmercard.zip`. Download it and check its version.
6. **Store zip:** copy `dist/calmercard-store.zip` to the user's Desktop as `calmercard-store-X.Y.Z.zip` and delete older ones there, so the wrong one can't be uploaded. Uploading to the Chrome Web Store dashboard is the user's step (no API access), and each upload is reviewed again.
7. **Installed copy:** copy `manifest.json src icons` into the user's unpacked folder (path in `CLAUDE.local.md`). Tell them to click reload in `chrome://extensions`.

Never put attendee data in release notes or assets. `docs/demo/*.mp4` is git-ignored; attach videos as release assets or GitHub user-attachments (`/demo-video`).

If anything in this skill turns out to be wrong or out of date, fix it here as soon as you notice, and add what you learn.
