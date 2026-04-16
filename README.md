# Wassist CLI

Send and receive WhatsApp messages from your terminal, powered by the official [WhatsApp Business API](https://developers.facebook.com/docs/whatsapp) and powered by [Wassist](https://wassist.app).

## Installation

```bash
npm install -g @wassist/cli
```

Requires Node.js >= 22.

## Quick start

**1. Log in with your whatsapp number**

```bash
wassist login
```

You'll be prompted to enter your phone number, then a verification code sent via SMS.

**2. Send a WhatsApp message to the sandbox**

After logging in you're automatically connected to the Wassist sandbox. Open WhatsApp on your phone and send any message to the sandbox number that send the 2FA code to your phone number.

**3. Read your message**

```bash
wassist messages read
```

You'll see the message you just sent appear in the terminal.

**4. Send a reply**

```bash
wassist messages send "hello world"
```

The reply will arrive in your WhatsApp chat.

## Sending messages

The `messages send` command supports the full WhatsApp unified message format: text, media, buttons, and footers — all composable via flags.

### Text only

```bash
wassist messages send "Hello world"
```

### With media

Attach an image, video, audio clip, or document by URL:

```bash
wassist messages send "Check this out" --media https://picsum.photos/200/300
```

Media-only (no text body):

```bash
wassist messages send --media https://picsum.photos/200/300
```

Supported media types: JPEG, PNG, MP4, 3GPP, AAC, MP4 audio, MPEG, AMR, OGG, PDF, DOCX, XLSX, PPTX.

### With a URL button

Add a tappable link button (max 1):

```bash
wassist messages send "Visit us" --url-button "Shop Now|https://shop.com"
```

### With quick reply buttons

Add up to 3 quick reply buttons:

```bash
wassist messages send "Choose one" --reply "Yes|confirm" --reply "No|deny"
```

### Full combination

```bash
wassist messages send "Spring sale is live! " \
  --media "https://picsum.photos/200/300" \
  --reply "Interested|yes" --reply "Not now|no"
```

### Validation rules

- Buttons: max 3 total, all must be the same type (`--url-button` and `--reply` cannot be mixed)
- URL buttons: max 1 per message
- Quick reply buttons: max 3 per message
- Text body: max 1024 characters
- Media: must be a publicly accessible URL; the server validates the MIME type against WhatsApp's allowlist
- Button labels: max 20 characters, formatted as `"Label|value"` separated by a pipe

### Template messages

If the 24-hour WhatsApp conversation window has expired (no user message in the last 24 hours), the CLI will prompt you to select and send a pre-approved template message instead.

## Using your own number

The sandbox is great for getting started, but to message real contacts you'll need your own WhatsApp Business number.

**1. Upgrade your plan**

A Wassist subscription is required to connect your own number:

```bash
wassist upgrade
```

**2. Link your WhatsApp Business Account**

```bash
wassist numbers add
```

This walks you through connecting a Meta Business Account and selecting a phone number to manage through Wassist. You'll be guided through Meta's embedded signup flow in your browser.

**3. Switch to your number**

```bash
wassist numbers list          # see your available numbers
wassist use 441234567890      # set your number as active
```

**4. Send messages to real contacts**

With your own number active, include the recipient's phone number:

```bash
wassist messages send 441234567890 "Hey, this is from my own number!"
wassist messages read 441234567890
```

To switch back to the sandbox at any time:

```bash
wassist use sandbox
```

## Commands

### Authentication

| Command | Description |
|---------|-------------|
| `wassist login` | Authenticate with your phone number via OTP |
| `wassist whoami` | Show the currently authenticated user and plan |

### Number management

| Command | Description |
|---------|-------------|
| `wassist use <number>` | Set the active number for the current session. Use `sandbox` to switch back to the sandbox number |
| `wassist numbers list` | List all your WhatsApp numbers, showing which is active |
| `wassist numbers add` | Add a new WhatsApp number (requires Starter plan or above) |

### Messaging

All message commands operate on the currently active number. In sandbox mode, phone number arguments are not needed — the CLI auto-resolves your single sandbox conversation.

| Command | Description |
|---------|-------------|
| `wassist messages list` | List conversations for the active number |
| `wassist messages read [phone-number]` | View messages for a contact |
| `wassist messages send [to-number] [message]` | Send a message to a contact |

**`messages read` options:**

- `--limit <n>` — Number of messages to show (default: 20)
- `--page <n>` — Page number, 1-based (default: 1)

**`messages send` options:**

- `--footer <text>` — Footer text (max 60 chars)
- `--media <url>` — Media URL (image, video, audio, document)
- `--url-button <label|url>` — URL button (max 1, format: `"Label|https://..."`)
- `--reply <label|id>` — Quick reply button (max 3, repeatable, format: `"Label|reply_id"`)


### Billing

| Command | Description |
|---------|-------------|
| `wassist upgrade` | Upgrade your subscription plan |

## Configuration

The CLI stores its config (auth token, active number) locally via [conf](https://github.com/sindresorhus/conf). Run `wassist login` to get started.

The default API backend is `https://backend.wassist.app`. This can be overridden in the config if needed for development.
