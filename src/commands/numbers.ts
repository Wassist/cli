import * as p from '@clack/prompts';
import { getToken, getActiveNumber, setActiveNumber, getFrontendBase } from '../lib/config';
import {
  listPhoneNumbers,
  listWhatsAppAccounts,
  getAccountPhoneNumbers,
  listAvailableNumbers,
  createLinkSession,
  getLinkSession,
  managePhoneNumber,
  addNumber,
  getSubscriptionStatus,
  createCheckoutSession,
  type WhatsAppAccount,
} from '../lib/api';

function requireAuth() {
  if (!getToken()) {
    p.log.warn('Not logged in. Run `wassist login` first.');
    process.exit(1);
  }
}

export async function numbersList() {
  requireAuth();

  const s = p.spinner();
  s.start('Fetching numbers…');

  try {
    const numbers = await listPhoneNumbers();
    s.stop('');

    const active = getActiveNumber();

    const rows: string[] = [];

    const sandboxLabel = active === 'sandbox' ? 'sandbox (active)' : 'sandbox';
    rows.push(`  ${sandboxLabel}`);

    for (const num of numbers) {
      const parts: string[] = [`+${num.number}`];

      if (num.whatsappBusinessAccount?.name) {
        parts.push(num.whatsappBusinessAccount.name);
      }

      if (num.activeAgent) {
        parts.push('(wassist agent attached)');
      }

      if (active === num.number) {
        parts.push('(active)');
      }

      rows.push(`  ${parts.join('  ')}`);
    }

    p.log.message(rows.join('\n'));
  } catch (err) {
    s.stop('Failed.');
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

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

async function pollLinkSession(sessionId: string): Promise<string> {
  const maxAttempts = 120;
  const intervalMs = 2000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const session = await getLinkSession(sessionId);

    if (session.status === 'SUCCESS') {
      return session.id;
    }
    if (session.status === 'FAILED' || session.status === 'EXPIRED') {
      throw new Error(`Link session ${session.status.toLowerCase()}.`);
    }
  }

  throw new Error('Timed out waiting for WhatsApp Business Account connection.');
}

async function selectOrConnectWaba(): Promise<WhatsAppAccount> {
  const s = p.spinner();
  s.start('Loading accounts…');
  const accounts = await listWhatsAppAccounts();
  s.stop('');

  const CONNECT_NEW = '__connect_new__';

  const options: { value: string; label: string }[] = accounts.map((a) => ({
    value: a.id,
    label: `${a.name ?? 'Unnamed'} (${a.waId})`,
  }));
  options.push({ value: CONNECT_NEW, label: '+ Connect a new WhatsApp Business Account' });

  const choice = await p.select({
    message: 'Select a WhatsApp Business Account',
    options,
  });

  if (p.isCancel(choice)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  if (choice !== CONNECT_NEW) {
    return accounts.find((a) => a.id === choice)!;
  }

  const frontendBase = getFrontendBase();
  const returnUrl = `${frontendBase}/link-fail`;
  const successUrl = `${frontendBase}/link-complete`;

  const session = await createLinkSession(returnUrl, successUrl);

  p.log.info(`Opening browser to connect your WhatsApp Business Account…`);
  await openBrowser(session.linkUrl);

  const pollSpinner = p.spinner();
  pollSpinner.start('Waiting for confirmation… (press Ctrl+C to cancel)');

  try {
    await pollLinkSession(session.id);
    pollSpinner.stop('Confirmed!');
  } catch (err) {
    console.log(err);
    pollSpinner.stop('Connection failed.');
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const refreshed = await listWhatsAppAccounts();
  const newest = refreshed[refreshed.length - 1];
  if (!newest) {
    p.log.error('Could not find the newly connected account.');
    process.exit(1);
  }

  p.log.success(`WhatsApp Business Account "${newest.name ?? newest.waId}" connected.`);
  return newest;
}

async function selectNumberToAdd(account: WhatsAppAccount): Promise<string> {
  const s0 = p.spinner();
  s0.start('Fetching phone numbers…');
  const metaNumbers = await getAccountPhoneNumbers(account.id);
  const unlinked = metaNumbers.filter((n) => !n.isLinkedToWassist);
  s0.stop('');

  const GET_NEW = '__get_new__';

  const options: { value: string; label: string; hint?: string }[] = unlinked.map((n) => ({
    value: n.display_phone_number,
    label: n.display_phone_number,
    hint: n.verified_name,
  }));
  options.push({ value: GET_NEW, label: '+ Get a new number' });

  if (unlinked.length === 0) {
    p.log.info('No unlinked numbers found on this account.');
  }

  const choice = await p.select({
    message: 'Select a number to add',
    options,
  });

  if (p.isCancel(choice)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  const s = p.spinner();

  if (choice === GET_NEW) {
    s.start('Fetching available numbers…');
    const available = await listAvailableNumbers();
    s.stop('');

    if (available.length === 0) {
      p.log.error('No new numbers are available right now. Please try again later.');
      process.exit(1);
    }

    const numChoice = await p.select({
      message: 'Select an available number',
      options: available.available_numbers.map((n: { id: string; phone_number: string }) => ({
        value: n.id,
        label: n.phone_number,
      })),
    });

    if (p.isCancel(numChoice)) {
      p.cancel('Cancelled.');
      process.exit(0);
    }

    const selected = available.find((n) => n.id === numChoice)!;

    s.start('Adding number…');
    await addNumber(account.id, selected.id, selected.phone_number);
    s.stop(`Number ${selected.phone_number} added.`);

    return selected.phone_number.replace(/[^\d]/g, '');
  }

  s.start('Adding number…');
  await managePhoneNumber(account.id, choice as string);
  s.stop(`Number ${choice} added.`);

  return (choice as string).replace(/[^\d]/g, '');
}

async function requireStarterOrAbove(): Promise<void> {
  const s = p.spinner();
  s.start('Checking subscription…');
  const sub = await getSubscriptionStatus();
  s.stop('');

  if (sub.level !== 'hobby') return;

  p.log.warn('Adding phone numbers requires a Starter subscription or above.');
  const shouldUpgrade = await p.confirm({
    message: 'Would you like to upgrade to Starter now?',
    initialValue: true,
  });

  if (p.isCancel(shouldUpgrade) || !shouldUpgrade) {
    p.log.info('You can upgrade anytime with `wassist upgrade`.');
    process.exit(0);
  }

  const frontendBase = getFrontendBase();

  const checkout = await createCheckoutSession('starter', {
    successUrl: `${frontendBase}/upgrade-complete`,
    returnUrl: `${frontendBase}/upgrade-cancelled`,
  });

  p.log.info('Opening Stripe checkout in your browser…');
  await openBrowser(checkout.url);

  const poll = p.spinner();
  poll.start('Waiting for payment confirmation… (press Ctrl+C to cancel)');

  const maxAttempts = 90;
  const intervalMs = 2000;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const updated = await getSubscriptionStatus();
    if (updated.level !== 'hobby') {
      poll.stop('Subscription activated!');
      p.log.success(`You're now on the ${updated.level.charAt(0).toUpperCase() + updated.level.slice(1)} plan.`);
      return;
    }
  }

  poll.stop('Timed out.');
  p.log.error('Subscription not detected yet. If you completed payment, try again in a moment.');
  process.exit(1);
}

export async function numbersAdd() {
  requireAuth();

  p.intro('wassist numbers add');

  await requireStarterOrAbove();

  let account: WhatsAppAccount;
  try {
    account = await selectOrConnectWaba();
  } catch (err) {
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  let addedNumber: string;
  try {
    addedNumber = await selectNumberToAdd(account);
  } catch (err) {
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const useNow = await p.confirm({
    message: 'Would you like to use this number now?',
    initialValue: true,
  });

  if (p.isCancel(useNow)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  if (useNow) {
    setActiveNumber(addedNumber);
    p.outro(`Switched to +${addedNumber}`);
  } else {
    p.outro(`Use \`wassist use ${addedNumber}\` to switch to this number.`);
  }
}
