# Changelog

## 0.2.0 (2026-04-17)

- `wassist messages listen` — stream inbound messages live over a WebSocket (no polling), with `--interactive` mode to reply inline
- `wassist messages send` — new flags for rich messaging:
  - `--footer <text>` — add a footer (max 60 chars)
  - `--media <url>` — attach image, video, audio, or document
  - `--url-button <label|url>` — add a URL button
  - `--reply <label|id>` — add up to 3 quick-reply buttons (repeatable)

## 0.1.0 (2026-04-15)

Initial release.

- `wassist login` — authenticate with your phone number via OTP
- `wassist whoami` — show the currently authenticated user and plan
- `wassist use <number>` — set the active number (or `sandbox`)
- `wassist numbers list` — list your WhatsApp numbers
- `wassist numbers add` — add a new WhatsApp number
- `wassist messages list` — list conversations
- `wassist messages read` — view messages for a contact
- `wassist messages send` — send a message (with template fallback)
- `wassist upgrade` — upgrade your subscription plan
