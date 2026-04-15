import * as p from '@clack/prompts';
import { getMe } from '../lib/api';
import { getToken, getPhoneNumber } from '../lib/config';

export async function whoami() {
  const token = getToken();

  if (!token) {
    p.log.warn('Not logged in. Run `wassist login` first.');
    process.exit(1);
  }

  const s = p.spinner();
  s.start('Fetching account info…');

  try {
    const me = await getMe();
    s.stop('Done!');
    p.log.info(`Phone: ${me.phone_number}`);
    p.log.info(`ID:    ${me.id}`);
  } catch {
    s.stop('Failed.');
    const phone = getPhoneNumber();
    if (phone) {
      p.log.info(`Locally stored phone: ${phone}`);
      p.log.warn('Could not reach the API — your token may be expired. Try `wassist login`.');
    } else {
      p.log.error('Session invalid. Run `wassist login` to re-authenticate.');
    }
    process.exit(1);
  }
}
