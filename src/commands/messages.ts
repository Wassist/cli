import * as p from '@clack/prompts';
import * as readline from 'node:readline';
import { getToken, getActiveNumber, getPhoneNumber, getSandboxNumber } from '../lib/config';
import {
  listConversations,
  getConversationMessages,
  sendMessage,
  createConversation,
  listTemplates,
  createListenSession,
  deleteListenSession,
  type Conversation,
  type Message,
  type ConversationListParams,
  type SendUnifiedInput,
  type SendUnifiedButton,
} from '../lib/api';

function requireAuth() {
  if (!getToken()) {
    p.log.warn('Not logged in. Run `wassist login` first.');
    process.exit(1);
  }
}

function isSandbox(): boolean {
  return getActiveNumber() === 'sandbox';
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

function getMessageBody(msg: Message): string {
  if (msg.text) return msg.text.body;

  if (msg.unified) {
    const lines: string[] = [];
    if (msg.unified.body) lines.push(msg.unified.body);
    for (const m of msg.unified.media ?? []) {
      const label = m.mimeType?.split('/')[0] ?? 'Media';
      lines.push(`[${label}: ${m.url}]`);
    }
    for (const b of msg.unified.buttons ?? []) {
      if (b.type === 'url') {
        lines.push(`[${b.text} -> ${b.url}]`);
      } else {
        lines.push(`[${b.text}]`);
      }
    }
    if (msg.unified.footer) lines.push(`— ${msg.unified.footer}`);
    return lines.length > 0 ? lines.join('\n    ') : '[unified]';
  }

  if (msg.template) return `[Template: ${msg.template.name}]`;
  if (msg.cta) return msg.cta.body;
  if (msg.image) return msg.image.caption ?? '[Image]';
  if (msg.quickReply) return msg.quickReply.body;
  return `[${msg.type}]`;
}

function roleLabel(role: string): string {
  switch (role) {
    case 'user': return 'USER';
    case 'assistant': return 'AGENT';
    case 'system': return 'SYS';
    default: return role.toUpperCase();
  }
}

async function resolveConversation(contactNumber?: string): Promise<Conversation> {
  const activeNumber = getActiveNumber();

  const params: ConversationListParams = {};
  if (isSandbox()) {
    params.whatsappNumber = getSandboxNumber();
  } else {
    params.whatsappNumber = activeNumber;
  }
  if (contactNumber) {
    params.contact = contactNumber;
  }

  const res = await listConversations(params);

  if (res.results.length === 0) {
    throw new Error(
      isSandbox()
        ? 'No conversation found. Send a message to the sandbox number first.'
        : `No conversation found for +${contactNumber} on +${activeNumber}.`,
    );
  }

  return res.results[0];
}

// ── messages list ─────────────────────────────────────────────────────

export async function messagesList() {
  requireAuth();

  const s = p.spinner();
  s.start('Fetching conversations…');

  try {
    const activeNumber = getActiveNumber();
    const params: ConversationListParams = {};
    if (isSandbox()) {
      params.whatsappNumber = getSandboxNumber();
      params.contact = getPhoneNumber() ?? '';
    } else {
      params.whatsappNumber = activeNumber;
    }

    const res = await listConversations(params);
    s.stop('');

    if (res.results.length === 0) {
      p.log.info('No conversations found.');
      return;
    }

    const rows: string[] = [];
    for (const conv of res.results) {
      const phone = `+${conv.contact.phoneNumber}`;
      const name = conv.contact.name ? ` (${conv.contact.name})` : '';
      const status = conv.active ? 'active' : 'closed';
      const preview = conv.lastMessage
        ? `${conv.lastMessage.body.slice(0, 60)}${conv.lastMessage.body.length > 60 ? '…' : ''}`
        : '(no messages)';
      const time = conv.lastMessage ? formatTimestamp(conv.lastMessage.createdAt) : '';

      rows.push(`  ${phone}${name}  [${status}]  ${time}\n    ${preview}`);
 
    }

    p.log.message(rows.join('\n\n'));
  } catch (err) {
    s.stop('Failed.');
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// ── messages read ─────────────────────────────────────────────────────

export async function messagesRead(
  phoneNumber: string | undefined,
  opts: { limit: string; page: string },
) {
  requireAuth();

  if (!isSandbox() && !phoneNumber) {
    p.log.error('A phone number is required when using a real number. Usage: wassist messages read <phone-number>');
    process.exit(1);
  }

  const limit = Math.max(1, parseInt(opts.limit, 10) || 20);
  const page = Math.max(1, parseInt(opts.page, 10) || 1);
  const offset = (page - 1) * limit;

  const s = p.spinner();
  s.start('Fetching messages…');

  try {
    const conv = await resolveConversation(phoneNumber);
    const messages = await getConversationMessages(conv.id, { limit, offset });
    s.stop('');

    if (messages.length === 0) {
      p.log.info(page > 1 ? 'No more messages.' : 'No messages in this conversation.');
      return;
    }

    const display = [...messages].reverse();

    const contactLabel = `+${conv.contact.phoneNumber}${conv.contact.name ? ` (${conv.contact.name})` : ''}`;
    p.log.info(`Conversation with ${contactLabel}  (page ${page}, showing ${messages.length} messages)`);

    const rows: string[] = [];
    for (const msg of display) {
      const role = roleLabel(msg.role);
      const time = formatTimestamp(msg.createdAt);
      const body = getMessageBody(msg);
      rows.push(`  [${role}] ${time}\n    ${body}`);
    }

    p.log.message(rows.join('\n\n'));

    if (messages.length === limit) {
      p.log.info(`More messages may be available. Use --page ${page + 1} to see older messages.`);
    }
  } catch (err) {
    s.stop('Failed.');
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// ── messages send ─────────────────────────────────────────────────────

interface SendOptions {
  footer?: string;
  media?: string;
  urlButton?: string;
  reply?: string[];
}

class SendInputError extends Error {}

function parseButton(raw: string, type: 'url' | 'quick_reply'): SendUnifiedButton {
  const pipeIdx = raw.indexOf('|');
  if (pipeIdx === -1) {
    throw new SendInputError(`Invalid button format: "${raw}". Expected "Label|value" separated by |`);
  }
  const text = raw.slice(0, pipeIdx).trim();
  const value = raw.slice(pipeIdx + 1).trim();
  if (!text || !value) {
    throw new SendInputError(`Invalid button format: "${raw}". Both label and value are required.`);
  }
  if (text.length > 20) {
    throw new SendInputError(`Button label "${text}" exceeds 20 character limit.`);
  }
  if (type === 'url') {
    return { type: 'url', text, url: value };
  }
  return { type: 'quick_reply', text, quickReplyId: value };
}

function buildUnifiedPayload(opts: SendOptions & { text?: string }): SendUnifiedInput {
  const { text, footer, media, urlButton, reply = [] } = opts;

  if (urlButton && reply.length > 0) {
    throw new SendInputError('Cannot mix --url-button and --reply. All buttons must be the same type.');
  }

  const buttons: SendUnifiedButton[] = [];
  if (urlButton) buttons.push(parseButton(urlButton, 'url'));
  for (const r of reply) buttons.push(parseButton(r, 'quick_reply'));
  if (buttons.length > 3) {
    throw new SendInputError('A maximum of 3 buttons is allowed.');
  }

  if (footer && footer.length > 60) {
    throw new SendInputError(`Footer exceeds 60 character limit (${footer.length} chars).`);
  }

  if (!text && !media) {
    throw new SendInputError('A message or --media is required.');
  }

  const unified: SendUnifiedInput = {};
  if (text) unified.text = text;
  if (footer) unified.footer = footer;
  if (media) unified.media = { url: media };
  if (buttons.length > 0) unified.buttons = buttons;
  return unified;
}

function tokenizeLine(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else if (ch === '\\' && i + 1 < input.length) {
        current += input[++i];
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '\\' && i + 1 < input.length) {
      current += input[++i];
    } else if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

function parseSendLine(line: string): SendOptions & { text?: string } {
  const tokens = tokenizeLine(line);
  const opts: SendOptions & { text?: string } = { reply: [] };
  const textParts: string[] = [];

  const takeValue = (flag: string, i: number): string => {
    if (i + 1 >= tokens.length) {
      throw new SendInputError(`Missing value for ${flag}.`);
    }
    return tokens[i + 1];
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '--footer') {
      opts.footer = takeValue(t, i);
      i++;
    } else if (t === '--media') {
      opts.media = takeValue(t, i);
      i++;
    } else if (t === '--url-button') {
      opts.urlButton = takeValue(t, i);
      i++;
    } else if (t === '--reply') {
      opts.reply!.push(takeValue(t, i));
      i++;
    } else if (t.startsWith('--')) {
      throw new SendInputError(`Unknown flag: ${t}`);
    } else {
      textParts.push(t);
    }
  }
  if (textParts.length > 0) opts.text = textParts.join(' ');
  return opts;
}

export async function messagesSend(
  toNumber: string | undefined,
  messageText: string | undefined,
  opts: SendOptions,
) {
  requireAuth();

  const { media } = opts;

  if (isSandbox()) {
    if (toNumber && !messageText) {
      messageText = toNumber;
      toNumber = undefined;
    }
    if (!messageText && !media) {
      p.log.error('Usage: wassist messages send <message> [options]');
      process.exit(1);
    }
  } else {
    if (!toNumber) {
      p.log.error('Usage: wassist messages send <to-number> [message] [options]');
      process.exit(1);
    }
    if (!messageText && !media) {
      p.log.error('A message or --media is required.');
      process.exit(1);
    }
  }

  let unified: SendUnifiedInput;
  try {
    unified = buildUnifiedPayload({ ...opts, text: messageText });
  } catch (err) {
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const s = p.spinner();

  try {
    s.start('Looking up conversation…');
    let conv: Conversation;

    if (isSandbox()) {
      conv = await resolveConversation();
    } else {
      try {
        conv = await resolveConversation(toNumber);
      } catch {
        s.stop('');
        s.start('Creating conversation…');
        conv = await createConversation({
          toNumber: toNumber!,
          fromNumber: getActiveNumber(),
        });
      }
    }
    s.stop('');

    if (conv.active) {
      s.start('Sending message…');
      await sendMessage(conv.id, { type: 'unified', unified });
      s.stop('');
      p.log.success(`Message sent to +${conv.contact.phoneNumber}`);
    } else {
      p.log.warn(
        'The conversation window has expired (no user message in the last 24 hours). You can only send a template message.',
      );

      const sendTemplate = await p.confirm({
        message: 'Would you like to send a template message instead?',
        initialValue: true,
      });

      if (p.isCancel(sendTemplate) || !sendTemplate) {
        p.cancel('Message not sent.');
        process.exit(0);
      }

      s.start('Fetching templates…');
      const templates = await listTemplates();
      s.stop('');

      if (templates.length === 0) {
        p.log.error('No templates available. Create a template in the dashboard first.');
        process.exit(1);
      }

      const templateChoice = await p.select({
        message: 'Select a template to send',
        options: templates.map((t) => ({
          value: t.name,
          label: t.name,
          hint: t.category,
        })),
      });

      if (p.isCancel(templateChoice)) {
        p.cancel('Cancelled.');
        process.exit(0);
      }

      const selectedTemplate = templates.find((t) => t.name === templateChoice)!;

      const variables: Record<string, string[]> = {};
      const bodyComponent = selectedTemplate.components.find(
        (c: any) => c.type === 'BODY',
      );
      if (bodyComponent?.example?.body_text?.[0]) {
        const varCount = bodyComponent.example.body_text[0].length;
        if (varCount > 0) {
          const bodyVars: string[] = [];
          for (let i = 0; i < varCount; i++) {
            const value = await p.text({
              message: `Enter value for body variable {{${i + 1}}}`,
            });
            if (p.isCancel(value)) {
              p.cancel('Cancelled.');
              process.exit(0);
            }
            bodyVars.push(value);
          }
          variables.body = bodyVars;
        }
      }

      const headerComponent = selectedTemplate.components.find(
        (c: any) => c.type === 'HEADER',
      );
      if (headerComponent?.example?.header_text) {
        const varCount = headerComponent.example.header_text.length;
        if (varCount > 0) {
          const headerVars: string[] = [];
          for (let i = 0; i < varCount; i++) {
            const value = await p.text({
              message: `Enter value for header variable {{${i + 1}}}`,
            });
            if (p.isCancel(value)) {
              p.cancel('Cancelled.');
              process.exit(0);
            }
            headerVars.push(value);
          }
          variables.header = headerVars;
        }
      }

      s.start('Sending template…');
      await sendMessage(conv.id, {
        type: 'template',
        template: {
          name: templateChoice as string,
          ...(Object.keys(variables).length > 0 ? { variables } : {}),
        },
      });
      s.stop('');
      p.log.success(`Template "${templateChoice}" sent to +${conv.contact.phoneNumber}`);
    }
  } catch (err) {
    s.stop('Failed.');
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// ── messages listen ───────────────────────────────────────────────────

interface WebhookMessagePayload {
  id: string;
  waId: string | null;
  body: string | null;
  media: Array<{ url: string; mimeType: string }>;
  buttons: Array<{ type: string; text: string; url?: string; quickReplyId?: string }>;
}

interface WebhookEventPayload {
  event: string;
  timestamp: string;
  webhookId: string;
  phoneNumber: string;
  from: string;
  contact: { name: string | null; phoneNumber: string };
  message: WebhookMessagePayload;
  conversationId: string;
}

function formatWebhookMessageBody(msg: WebhookMessagePayload): string {
  const lines: string[] = [];
  if (msg.body) lines.push(msg.body);
  for (const m of msg.media) {
    const label = m.mimeType?.split('/')[0] ?? 'Media';
    lines.push(`[${label}: ${m.url}]`);
  }
  for (const b of msg.buttons) {
    if (b.type === 'url' && b.url) {
      lines.push(`[${b.text} -> ${b.url}]`);
    } else {
      lines.push(`[${b.text}]`);
    }
  }
  return lines.length > 0 ? lines.join('\n    ') : '[empty]';
}

function shouldDisplayPayload(
  payload: WebhookEventPayload,
  contactFilter: string | undefined,
): boolean {
  if (isSandbox()) {
    const pn = getPhoneNumber();
    if (!pn) return true;
    return payload.from === pn;
  }

  const active = getActiveNumber();
  if (payload.phoneNumber !== active) return false;
  if (contactFilter && payload.from !== contactFilter) return false;
  return true;
}

interface ListenOptions {
  interactive?: boolean;
}

export async function messagesListen(
  phoneNumber: string | undefined,
  opts: ListenOptions = {},
) {
  requireAuth();

  if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === 'undefined') {
    p.log.error('This command requires Node.js 22+ (global WebSocket).');
    process.exit(1);
  }

  p.intro('wassist messages listen');

  const interactive = opts.interactive === true;

  // Interactive replies require a specific conversation. On the sandbox we
  // always have one; on a real line the user must pick a contact so we know
  // who we're replying to and which conversation's 24h window to enforce.
  if (interactive && !isSandbox() && !phoneNumber) {
    const listSpinner = p.spinner();
    listSpinner.start('Loading conversations…');
    let conversations;
    try {
      const res = await listConversations({ whatsappNumber: getActiveNumber() });
      conversations = res.results;
    } catch (err) {
      listSpinner.stop('Failed.');
      p.log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    listSpinner.stop('');

    if (conversations.length === 0) {
      p.log.error(
        `No conversations found on +${getActiveNumber()}. Wait for an inbound message or send one with \`wassist messages send\` first.`,
      );
      process.exit(1);
    }

    const choice = await p.select({
      message: 'Select a conversation to listen to',
      options: conversations.map((c) => ({
        value: c.contact.phoneNumber,
        label: `+${c.contact.phoneNumber}${c.contact.name ? ` (${c.contact.name})` : ''}`,
        hint: c.active ? 'active' : 'window closed',
      })),
    });

    if (p.isCancel(choice)) {
      p.cancel('Cancelled.');
      process.exit(0);
    }

    phoneNumber = choice as string;
  }

  const s = p.spinner();
  s.start('Opening listen session…');

  let session;
  try {
    session = await createListenSession();
  } catch (err) {
    s.stop('Failed.');
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  s.stop('Session ready.');

  const sessionId = session.sessionId;
  const wsUrl = session.wsUrl;

  const canReply = interactive && (isSandbox() || !!phoneNumber);
  const replyHint = canReply
    ? ' Type a message and hit enter to reply (flags: --footer, --media, --url-button, --reply).'
    : interactive
      ? ''
      : ' Pass --interactive to reply.';

  if (isSandbox()) {
    p.log.info(`Listening for sandbox messages. Press Ctrl+C to stop.${replyHint}`);
  } else {
    const filterLabel = phoneNumber ? ` from +${phoneNumber}` : '';
    p.log.info(
      `Listening for inbound messages on +${getActiveNumber()}${filterLabel}. Press Ctrl+C to stop.${replyHint}`,
    );
  }

  let shuttingDown = false;
  let socket: WebSocket | null = null;
  let attempt = 0;

  // Interactive reply setup
  const promptStr = canReply ? '> ' : '';
  const isTTY = Boolean((process.stdin as unknown as { isTTY?: boolean }).isTTY);
  const rl = canReply && isTTY
    ? readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: promptStr,
        terminal: true,
      })
    : null;

  // Track readline lifecycle so a stdin EOF (e.g. detached terminal overnight)
  // doesn't cause later writes to throw ERR_USE_AFTER_CLOSE and crash the process.
  let rlClosed = false;
  const rlActive = () => rl !== null && !rlClosed;

  const safePrompt = (preserveCursor = false) => {
    if (!rlActive()) return;
    try {
      rl!.prompt(preserveCursor);
    } catch {
      rlClosed = true;
    }
  };

  const writeAbovePrompt = (text: string) => {
    if (!rlActive()) {
      console.log(text);
      return;
    }
    try {
      // Erase current prompt line, print text, then restore prompt + in-progress input.
      process.stdout.write('\r\x1b[K');
      console.log(text);
      rl!.prompt(true);
      const pending = rl!.line;
      if (pending) {
        process.stdout.write(pending);
      }
    } catch {
      // Readline was closed between checks (e.g. stdin EOF). Fall back to plain log
      // and stop trying to use it so we don't throw an uncaught async error.
      rlClosed = true;
      console.log(text);
    }
  };

  // Always fetches a fresh conversation so we can trust the `active` flag for
  // the 24h messaging window right before we try to send.
  const fetchConversation = async (): Promise<Conversation> => {
    if (isSandbox()) {
      return resolveConversation();
    }
    try {
      return await resolveConversation(phoneNumber);
    } catch {
      return createConversation({
        toNumber: phoneNumber!,
        fromNumber: getActiveNumber(),
      });
    }
  };

  const handleReplyLine = async (raw: string) => {
    const line = raw.trim();
    if (!line) {
      safePrompt();
      return;
    }

    let parsed: SendOptions & { text?: string };
    let unified: SendUnifiedInput;
    try {
      parsed = parseSendLine(line);
      unified = buildUnifiedPayload(parsed);
    } catch (err) {
      writeAbovePrompt(`  [error] ${err instanceof Error ? err.message : String(err)}`);
      safePrompt();
      return;
    }

    try {
      const conv = await fetchConversation();
      if (!conv.active) {
        writeAbovePrompt(
          '  [error] Conversation window is closed (no message from this contact in the last 24h).\n    Send a template with `wassist messages send` or wait for a new message from the contact.',
        );
        safePrompt();
        return;
      }
      await sendMessage(conv.id, { type: 'unified', unified });
      const time = formatTimestamp(new Date().toISOString());
      const label = `+${conv.contact.phoneNumber}${conv.contact.name ? ` (${conv.contact.name})` : ''}`;
      const previewParts: string[] = [];
      if (unified.text) previewParts.push(unified.text);
      if (unified.media) previewParts.push(`[media: ${unified.media.url}]`);
      for (const b of unified.buttons ?? []) {
        previewParts.push(b.type === 'url' ? `[${b.text} -> ${b.url}]` : `[${b.text}]`);
      }
      if (unified.footer) previewParts.push(`— ${unified.footer}`);
      writeAbovePrompt(`  [${time}] → ${label}\n    ${previewParts.join('\n    ') || '[sent]'}`);
    } catch (err) {
      writeAbovePrompt(`  [error] ${err instanceof Error ? err.message : String(err)}`);
    }
    safePrompt();
  };

  const cleanup = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      rl?.close();
    } catch {
      // ignore
    }
    try {
      socket?.close();
    } catch {
      // ignore
    }
    try {
      await deleteListenSession(sessionId);
    } catch {
      // best-effort
    }
  };

  const handleSignal = async () => {
    await cleanup();
    process.exit(0);
  };
  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  // Keep the long-lived listener alive through transient readline / stream errors
  // (e.g. ERR_USE_AFTER_CLOSE if stdin closes while we're rendering an inbound msg).
  process.on('uncaughtException', (err) => {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ERR_USE_AFTER_CLOSE') {
      rlClosed = true;
      return;
    }
    console.error(`  [error] ${err instanceof Error ? err.message : String(err)}`);
  });

  if (rl) {
    rl.on('line', (line) => {
      void handleReplyLine(line);
    });
    rl.on('SIGINT', () => {
      void handleSignal();
    });
    rl.on('close', () => {
      // Could fire from stdin EOF (e.g. detached terminal) rather than our cleanup.
      // Mark it closed so later writes don't try to use it and crash the process.
      rlClosed = true;
    });
  }

  const connect = () => {
    if (shuttingDown) return;

    socket = new WebSocket(wsUrl);

    socket.addEventListener('open', () => {
      if (attempt > 0) {
        writeAbovePrompt('  [info] Reconnected.');
      }
      attempt = 0;
      safePrompt();
    });

    socket.addEventListener('message', (event: MessageEvent) => {
      const raw = typeof event.data === 'string' ? event.data : '';
      if (!raw) return;

      let payload: WebhookEventPayload;
      try {
        payload = JSON.parse(raw) as WebhookEventPayload;
      } catch {
        return;
      }

      if (!shouldDisplayPayload(payload, phoneNumber)) return;

      const time = formatTimestamp(payload.timestamp);
      const contactName = payload.contact?.name;
      const label = `+${payload.from}${contactName ? ` (${contactName})` : ''}`;
      const body = formatWebhookMessageBody(payload.message);
      writeAbovePrompt(`  [${time}] ${label}\n    ${body}`);
    });

    socket.addEventListener('close', () => {
      if (shuttingDown) return;
      attempt += 1;
      const delay = Math.min(30_000, 1000 * Math.pow(2, attempt - 1));
      writeAbovePrompt(`  [warn] Connection lost. Reconnecting in ${Math.round(delay / 1000)}s…`);
      setTimeout(connect, delay);
    });

    socket.addEventListener('error', () => {
      // The 'close' handler will fire next and manage reconnection.
    });
  };

  connect();

  await new Promise<void>(() => {
    // Block forever; process exits via SIGINT/SIGTERM handlers.
  });
}
