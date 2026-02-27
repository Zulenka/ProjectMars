# ProjectMars

MVP implementation of the `MARS` Torn war tracker browser extension from the provided plan.

## Current Status

- Loadable unpacked in Chrome / Chromium-based browsers
- MVP overlay, options, popup, and background polling implemented
- Background worker logic is modularized (`api`, `storage`, parsing, scheduler logic)
- Build/package scaffolding added for Chrome / Firefox / Opera
- Firefox manifest is included, but runtime compatibility is not fully validated yet

## Load in Chrome (Unpacked)

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this project folder
5. Open extension `Options`
6. Paste and validate your Torn API key
7. Open `https://www.torn.com/`

## Build Packages

1. Run `npm run build`
2. Output folders are created in `dist/chrome/`, `dist/firefox/`, and `dist/opera/`
3. Zip archives are generated in `dist/` when PowerShell `Compress-Archive` is available

## Run Tests

- `npm test`
- Covers background API/storage/parser/scheduler logic plus war-detector/poller orchestration, sort/timer/settings helper logic, and shared utility parsing/normalization smoke tests

## Version Bumping

- `npm run version:bump:patch`
- `npm run version:bump:minor`
- `npm run version:bump:major`

## Manual QA

- Use `docs/MANUAL_SMOKE_TEST_CHECKLIST.txt` before release packaging/submission.
- For Firefox temporary add-ons, rebuild (`npm run build`) and reload/re-add the add-on after code changes.

## Remaining Plan Items

- Execute manual browser smoke tests (Chrome/Firefox/Opera)
- Expand automated tests (API fetcher, storage adapter, integration scenarios)
- Finalize privacy policy/docs for store submission
