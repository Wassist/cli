# Wassist CLI

Manage your WhatsApp agents from the terminal.

## Installation

```bash
npm install -g @wassist/cli
```

Requires Node.js >= 22.

## Quick start

```bash
wassist login          # authenticate with your phone number
wassist whoami         # check who you're logged in as
wassist numbers list   # see your available numbers
wassist use <number>   # set the active number (or "sandbox")
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

All message commands operate on the currently active number. In sandbox mode, phone number arguments are not needed -- the CLI auto-resolves your single sandbox conversation.

| Command | Description |
|---------|-------------|
| `wassist messages list` | List conversations for the active number |
| `wassist messages read [phone-number]` | View messages for a contact |
| `wassist messages send [to-number] [message]` | Send a message to a contact |

**`messages read` options:**

- `--limit <n>` -- Number of messages to show (default: 20)
- `--page <n>` -- Page number, 1-based (default: 1)

**`messages send` behaviour:**

- If the conversation is within the 24-hour WhatsApp window, the message is sent as a unified message.
- If the window has expired, the CLI prompts you to select and send a template message instead.

### Webhooks

| Command | Description |
|---------|-------------|
| `wassist webhooks list` | List your configured webhooks |
| `wassist webhooks create` | Create a new webhook |
| `wassist webhooks delete` | Delete a webhook |

### Billing

| Command | Description |
|---------|-------------|
| `wassist upgrade` | Upgrade your subscription plan |

## Configuration

The CLI stores its config (auth token, active number) locally via [conf](https://github.com/sindresorhus/conf). Run `wassist login` to get started.

The default API backend is `https://backend.wassist.app`. This can be overridden in the config if needed for development.
