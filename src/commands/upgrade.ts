import * as p from '@clack/prompts';
import {
  getSubscriptionStatus,
  createCheckoutSession,
  createPortalSession,
} from '../lib/api';
import { getToken, getFrontendBase } from '../lib/config';

async function openBrowser(url: string) {
  const { exec } = await import('child_process');
  const cmd =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start'
        : 'xdg-open';

  return new Promise<void>((resolve, reject) => {
    exec(`${cmd} "${url}"`, (err) => (err ? reject(err) : resolve()));
  });
}

async function pollForUpgrade(): Promise<boolean> {
  const maxAttempts = 90;
  const intervalMs = 2000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const updated = await getSubscriptionStatus();
    if (updated.level !== 'hobby') {
      return true;
    }
  }
  return false;
}

export async function upgrade() {
  if (!getToken()) {
    p.log.warn('Not logged in. Run `wassist login` first.');
    process.exit(1);
  }

  p.intro('wassist upgrade');

  const s = p.spinner();
  s.start('Checking current plan…');
  const sub = await getSubscriptionStatus();
  s.stop('');

  if (sub.level !== 'hobby') {
    const plan = sub.level.charAt(0).toUpperCase() + sub.level.slice(1);
    p.log.info(`You're on the ${plan} plan.`);

    const manage = await p.confirm({
      message: 'Would you like to manage your subscription in Stripe?',
      initialValue: true,
    });

    if (p.isCancel(manage) || !manage) {
      p.outro('Done.');
      return;
    }

    const portal = await createPortalSession();
    p.log.info('Opening Stripe billing portal…');
    await openBrowser(portal.url);
    p.outro('Billing portal opened in your browser.');
    return;
  }

  p.log.info('You are currently on the Free plan.');

  const level = await p.select({
    message: 'Which plan would you like to subscribe to?',
    options: [
      { value: 'starter' as const, label: 'Starter', hint: 'Connect phone numbers & deploy agents' },
      { value: 'pro' as const, label: 'Pro', hint: 'Advanced features & higher limits' },
    ],
  });

  if (p.isCancel(level)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  const frontendBase = getFrontendBase();
  const checkout = await createCheckoutSession(level, {
    successUrl: `${frontendBase}/upgrade-complete`,
    cancelUrl: `${frontendBase}/upgrade-cancelled`,
  });
  p.log.info('Opening Stripe checkout in your browser…');
  await openBrowser(checkout.url);

  const poll = p.spinner();
  poll.start('Waiting for payment confirmation… (press Ctrl+C to cancel)');

  const upgraded = await pollForUpgrade();

  if (upgraded) {
    const updated = await getSubscriptionStatus();
    const plan = updated.level.charAt(0).toUpperCase() + updated.level.slice(1);
    poll.stop('Subscription activated!');
    p.outro(`You're now on the ${plan} plan.`);
  } else {
    poll.stop('Timed out.');
    p.log.error('Subscription not detected yet. If you completed payment, try again in a moment.');
    process.exit(1);
  }
}
