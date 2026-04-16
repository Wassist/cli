import * as p from '@clack/prompts';
import { listPhoneNumbers } from '../lib/api';
import { getToken, setActiveNumber } from '../lib/config';

export async function use(number: string) {
  const token = getToken();
  if (!token) {
    p.log.warn('Not logged in. Run `wassist login` first.');
    process.exit(1);
  }

  if (number === 'sandbox') {
    setActiveNumber('sandbox');
    p.log.success('Switched to sandbox');
    return;
  }

  const normalized = number.replace(/^\+/, '');

  const s = p.spinner();
  s.start('Validating number…');

  try {
    const numbers = await listPhoneNumbers();
    const match = numbers.find(
      (n) => n.number === normalized || n.number === number,
    );

    if (!match) {
      s.stop('Number not found.');
      p.log.error(
        `Number ${number} is not on your account. Run \`wassist numbers list\` to see your numbers.`,
      );
      process.exit(1);
    }

    setActiveNumber(match.number);
    s.stop(`Switched to +${match.number}`);
  } catch (err) {
    s.stop('Failed.');
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
