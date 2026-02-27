# BSP Integration Plan (Project Mars)

Date: 2026-02-24
Status: Planned (feature remains inactive until BSP key is entered and validated)

## Goal

Add optional Battle Stats Predictor (BSP) data to the MARS overlay so each target can display a predicted battle-stats total (and optionally score), while keeping the feature fully disabled unless the user explicitly enables it and provides a valid BSP key.

## Constraints / Requirements

- BSP is a third-party service (lol-manager.com), not Torn.
- BSP requires sending a BSP/Torn API key to the BSP backend.
- MARS must not call BSP endpoints unless the user has:
  - enabled BSP integration
  - entered a BSP key
  - passed key validation (or a successful BSP fetch confirms usability)
- UI must clearly indicate BSP is optional and inactive until configured.
- Privacy policy/docs must disclose third-party key transmission.

## BSP Endpoints Identified (from BSP userscript)

Base:
- `http://www.lol-manager.com/api`

Used for target prediction:
- `GET /battlestats/{PrimaryAPIKey}/{targetId}/{scriptVersion}`

Related (not required for MVP BSP display in MARS):
- `GET /battlestats/user/{PrimaryAPIKey}/{scriptVersion}` (subscription/user info)
- `GET /battlestats/uploaddata/{UploadDataAPIKey}/{scriptVersion}` (upload feature)

## Product Behavior (MARS)

### Default State (No BSP configured)

- BSP integration is OFF by default.
- Overlay/popup render normally with no BSP fields.
- No requests to `lol-manager.com`.
- UI shows a neutral note in options:
  - "BSP integration is optional and inactive until configured."

### Configured State (BSP enabled + key valid)

- MARS fetches BSP prediction for visible/due targets (rate-limited and cached).
- Overlay displays a compact predicted value (e.g. `BSP: 1.2b`) under target status/subline.
- If BSP fails for a target, MARS degrades gracefully and keeps base Torn data visible.

## Implementation Plan

## 1. Data Model and Settings (Feature Gate)

Add new settings fields:
- `enableBsp` (boolean, default `false`)
- `showBspValue` (boolean, default `true`)
- `bspDisplayMode` (`"tbs"` | `"score"`, default `"tbs"`) [optional for first pass]

Add storage keys:
- `bspApiKeyObfuscated`
- `bspState` (optional status cache for validation/subscription/last error)

Add target fields (optional, per target):
- `bsp` object:
  - `status` (`ok`, `disabled`, `missing_key`, `error`, `stale`)
  - `tbs` (number|null)
  - `score` (number|null)
  - `source` (string|null, e.g. `bsp`, `spy`)
  - `updatedAt` (unix timestamp)
  - `errorMessage` (string|null)

Acceptance:
- With defaults only, existing behavior is unchanged.
- No BSP requests occur when `enableBsp !== true`.

## 2. Options UI (Config + Inactive Until Key)

Add a BSP section to `src/options/options.html` / `src/options/options.js`:
- Toggle: `Enable BSP integration`
- Input: `BSP API Key` (masked)
- Button: `Validate BSP Key`
- Status line:
  - inactive (default)
  - validating
  - valid
  - error (with sanitized message)
- Optional link to BSP forum/docs (manual)

Behavior:
- If `enableBsp` is checked but no valid key exists, show warning:
  - "BSP is enabled but inactive until a valid BSP key is saved."
- Save BSP key only after validation (or allow save + show inactive until first success, choose stricter path first: validate then save).

Acceptance:
- Feature remains inactive until key validation succeeds.
- Status survives reload (via stored BSP key + state).

## 3. Background BSP API Client (Isolated Module)

Add new module:
- `src/background/bsp-api.js`

Functions:
- `buildBspUrl(base, endpointParts...)`
- `redactBspSecret(message, key)`
- `parseBspPredictionResponse(json)` -> normalized `{ tbs, score, source, rawStatus }`
- `createBspClient({ fetchImpl, getBspKey, queueRequest, enabledFlag })`

Hardening requirements:
- Fixed allowlisted host only (`lol-manager.com`)
- No dynamic host from settings/user input
- Redact key from all thrown errors/messages
- Timeout support (if feasible)
- Reject invalid target IDs

Acceptance:
- No requests if disabled or no key.
- Errors returned sanitized (no key leakage).

## 4. BSP Validation Flow

Option A (recommended MVP):
- Validate key by calling a single target prediction fetch on a known safe target ID only when user clicks Validate.
- If API behavior is inconsistent, use BSP user endpoint:
  - `/battlestats/user/{key}/{version}`

Implementation:
- Add background message types:
  - `VALIDATE_BSP_API_KEY`
  - `VALIDATE_BSP_API_KEY_RESPONSE`
- Extend message router to validate payload and route requests.

Acceptance:
- Invalid key returns error without exposing secret.
- Valid key stores obfuscated key + marks BSP active.

## 5. BSP Cache and Poll Integration

Integrate into poll cycle without breaking Torn polling:
- Only fetch BSP for targets that are currently visible or due (limit scope)
- Add separate rate limit budget for BSP (conservative defaults)
- Cache per-target BSP results with TTL (e.g. 1-24h, configurable later)

Recommended MVP behavior:
- Fetch BSP only for targets in current `warData.targets` that are rendered/eligible
- Limit concurrent/queued BSP calls (e.g. 1-2 at a time)
- Cache TTL:
  - `ok` results: 24h
  - `error` results: short backoff (e.g. 10m)

Acceptance:
- MARS remains responsive with BSP disabled/enabled.
- BSP failures do not block Torn polling or UI updates.

## 6. UI Rendering (Overlay + Popup)

Overlay (`src/content/content.js`):
- Add a small BSP line/label in each row:
  - `BSP 1.2b` or `BSP 845m`
- Render with `textContent` only
- If unavailable:
  - show nothing (cleanest default)
  - optional subtle placeholder only when BSP enabled (`BSP ...`)

Popup (`src/popup/popup.js`):
- Optional phase 2: show BSP value on top attackable targets

Formatting:
- Reuse/port a compact number formatter similar to BSP userscript (`k/m/b/t`)
- Keep values secondary to status/hospital timer

Acceptance:
- No layout break on long names or missing BSP values.
- UI remains unchanged when BSP is off.

## 7. Privacy / Permissions / Disclosure

Update docs:
- `docs/TORN_API_KEY_PRIVACY_POLICY.txt`
- `docs/PRIVACY_POLICY.txt` (if separate policy retained)
- store listing descriptions if needed

Add disclosures:
- BSP integration is optional
- BSP key is sent to `lol-manager.com` when enabled
- MARS does not send BSP key anywhere else
- How to disable/remove BSP key

Permissions:
- Add host permission only if needed for extension fetch:
  - `http://www.lol-manager.com/*` (or `https` if supported/available)

Note:
- Prefer HTTPS endpoint if BSP supports it. Verify before shipping.

Acceptance:
- No BSP host permission/network use unless feature is enabled by user.

## 8. Security Hardening (BSP-Specific)

- Validate/whitelist BSP message payloads in message router
- Obfuscate BSP key in storage (same pattern as Torn key)
- Redact BSP key from errors/logs/UI messages
- Enforce numeric target ID coercion before requests
- Add per-target/request retry backoff (avoid hammering third-party service)
- Do not inject any BSP-returned HTML (text only)

Acceptance:
- Static tests and unit tests cover key redaction + URL safety.

## 9. Testing Plan

Unit tests:
- `bsp-api` URL builder allowlist + invalid input rejection
- key redaction helper
- response parser normalization for success/error/invalid payloads
- cache TTL behavior (if extracted)

Integration/unit tests:
- background message router BSP validation message handling
- poller integration path when BSP disabled (no BSP calls)
- poller integration path when enabled + key present

Manual tests:
- BSP disabled by default -> no calls
- Enable BSP without key -> inactive warning, no calls
- Invalid BSP key -> error, no key leak
- Valid BSP key -> values appear on overlay for targets
- BSP outage -> base MARS remains usable

## 10. Rollout Strategy

Phase 1 (safe MVP)
- Option UI + key validation + background client + per-target cached TBS
- Overlay display only
- Feature default OFF / inactive until key validated

Phase 2
- Popup BSP values
- score/TBS toggle
- optional source indicator (BSP vs spy)
- improved caching/rate controls

Phase 3
- richer comparison display (if user also provides personal stats)
- sortable by BSP value (optional)

## 11. Open Questions (Must Decide Before Implementation)

1. Should MARS use BSP over `http://` exactly as the userscript does, or only if HTTPS is available?
2. Which key should users provide in MARS:
   - BSP "Primary API Key" (recommended, matches userscript endpoint usage)
   - separate MARS-specific BSP key if supported (unknown)
3. Should BSP values display as:
   - TBS only (simplest)
   - score only
   - toggle between TBS/score
4. Do we want to cache BSP values in `warData.targets[*].bsp` or in a separate cache store?

## 12. Definition of Done (MVP BSP Integration)

- BSP feature is OFF/inactive by default
- BSP key can be entered, validated, and stored safely
- No BSP requests occur until valid key is present and feature is enabled
- Overlay shows clean formatted predicted stat total for targets when available
- Errors do not leak keys and do not break core war tracking
- Tests added for BSP URL building, redaction, and validation flow
- Privacy docs updated with optional BSP third-party disclosure
