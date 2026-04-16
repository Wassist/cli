import * as p from '@clack/prompts';
import { getToken } from '../lib/config';
import { listWebhooks, createWebhook, deleteWebhook } from '../lib/api';

function requireAuth() {
  if (!getToken()) {
    p.log.warn('Not logged in. Run `wassist login` first.');
    process.exit(1);
  }
}

export async function webhooksList() {
  requireAuth();

  const s = p.spinner();
  s.start('Fetching webhooks…');

  try {
    const webhooks = await listWebhooks();
    s.stop('');

    if (webhooks.length === 0) {
      p.log.info('No webhooks configured. Create one with `wassist webhooks create`.');
      return;
    }

    const rows: string[] = [];
    for (const wh of webhooks) {
      const status = wh.active ? 'active' : 'inactive';
      rows.push(`  ${wh.name}  ${wh.url}  (${wh.type}, ${status})`);
    }

    p.log.message(rows.join('\n'));
  } catch (err) {
    s.stop('Failed.');
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

export async function webhooksCreate() {
  requireAuth();

  p.intro('wassist webhooks create');

  const name = await p.text({
    message: 'Webhook name',
    placeholder: 'My Webhook',
    validate: (v) => (v.trim() ? undefined : 'Name is required'),
  });

  if (p.isCancel(name)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  const url = await p.text({
    message: 'Webhook URL',
    placeholder: 'https://example.com/webhook',
    validate: (v) => {
      try {
        new URL(v);
        return undefined;
      } catch {
        return 'Must be a valid URL';
      }
    },
  });

  if (p.isCancel(url)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  const s = p.spinner();
  s.start('Creating webhook…');

  try {
    const webhook = await createWebhook(name as string, url as string);
    s.stop('Webhook created!');

    p.log.success(`ID:     ${webhook.id}`);
    p.log.success(`Secret: ${webhook.secret}`);
    p.log.info('Save the secret — it won\'t be shown in full again.');

    p.outro('Done.');
  } catch (err) {
    s.stop('Failed.');
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

export async function webhooksDelete() {
  requireAuth();

  const s = p.spinner();
  s.start('Fetching webhooks…');

  try {
    const webhooks = await listWebhooks();
    s.stop('');

    if (webhooks.length === 0) {
      p.log.info('No webhooks to delete.');
      return;
    }

    const choice = await p.select({
      message: 'Select a webhook to delete',
      options: webhooks.map((wh) => ({
        value: wh.id,
        label: `${wh.name} — ${wh.url}`,
      })),
    });

    if (p.isCancel(choice)) {
      p.cancel('Cancelled.');
      process.exit(0);
    }

    const confirm = await p.confirm({
      message: 'Are you sure you want to delete this webhook?',
      initialValue: false,
    });

    if (p.isCancel(confirm) || !confirm) {
      p.cancel('Cancelled.');
      process.exit(0);
    }

    const ds = p.spinner();
    ds.start('Deleting…');
    await deleteWebhook(choice as string);
    ds.stop('Webhook deleted.');
  } catch (err) {
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
