import * as p from '@clack/prompts';
import { getToken, getActiveNumber, getPhoneNumber } from '../lib/config';
import {
  listConversations,
  getConversationMessages,
  sendMessage,
  createConversation,
  listTemplates,
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

const SANDBOX_WHATSAPP_NUMBER = '447424845871';

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
    params.whatsappNumber = SANDBOX_WHATSAPP_NUMBER;
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
      params.whatsappNumber = SANDBOX_WHATSAPP_NUMBER;
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

function parseButton(raw: string, type: 'url' | 'quick_reply'): SendUnifiedButton {
  const pipeIdx = raw.indexOf('|');
  if (pipeIdx === -1) {
    p.log.error(`Invalid button format: "${raw}". Expected "Label|value" separated by |`);
    process.exit(1);
  }
  const text = raw.slice(0, pipeIdx).trim();
  const value = raw.slice(pipeIdx + 1).trim();
  if (!text || !value) {
    p.log.error(`Invalid button format: "${raw}". Both label and value are required.`);
    process.exit(1);
  }
  if (text.length > 20) {
    p.log.error(`Button label "${text}" exceeds 20 character limit.`);
    process.exit(1);
  }
  if (type === 'url') {
    return { type: 'url', text, url: value };
  }
  return { type: 'quick_reply', text, quickReplyId: value };
}

export async function messagesSend(
  toNumber: string | undefined,
  messageText: string | undefined,
  opts: SendOptions,
) {
  requireAuth();

  const { footer, media, urlButton, reply = [] } = opts;

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

  // Validate button mutual exclusivity
  if (urlButton && reply.length > 0) {
    p.log.error('Cannot mix --url-button and --reply. All buttons must be the same type.');
    process.exit(1);
  }

  // Parse buttons
  const buttons: SendUnifiedButton[] = [];
  if (urlButton) {
    buttons.push(parseButton(urlButton, 'url'));
  }
  for (const r of reply) {
    buttons.push(parseButton(r, 'quick_reply'));
  }
  if (buttons.length > 3) {
    p.log.error('A maximum of 3 buttons is allowed.');
    process.exit(1);
  }

  // Validate footer length
  if (footer && footer.length > 60) {
    p.log.error(`Footer exceeds 60 character limit (${footer.length} chars).`);
    process.exit(1);
  }

  // Build the unified payload
  const unified: SendUnifiedInput = {};
  if (messageText) unified.text = messageText;
  if (footer) unified.footer = footer;
  if (media) unified.media = { url: media };
  if (buttons.length > 0) unified.buttons = buttons;

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
