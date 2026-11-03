import * as p from '@clack/prompts';
import { listOrganizations, listPhoneNumbers, type Organization } from '../lib/api';
import {
  getActiveNumber,
  getOrganization,
  getToken,
  setActiveNumber,
  setOrganization,
} from '../lib/config';

function requireAuth() {
  if (!getToken()) {
    p.log.warn('Not logged in. Run `wassist login` first.');
    process.exit(1);
  }
}

function isActive(org: Organization, activeId: string | undefined): boolean {
  return activeId ? org.id === activeId : org.isPersonal;
}

export async function orgsList() {
  requireAuth();

  const s = p.spinner();
  s.start('Fetching organizations…');

  try {
    const orgs = await listOrganizations();
    s.stop('');
    const activeId = getOrganization()?.id;

    const rows = orgs.map((org) => {
      const parts = [org.name];
      if (org.isPersonal) parts.push('(personal)');
      if (org.role) parts.push(org.role);
      parts.push(org.id);
      if (isActive(org, activeId)) parts.push('(active)');
      return `  ${parts.join('  ')}`;
    });

    p.log.message(rows.join('\n'));
    p.log.info('Your sandbox chat is yours in every organization. Switch with `wassist orgs use <id|name|personal>`.');
  } catch (err) {
    s.stop('Failed.');
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

export async function orgsUse(target: string) {
  requireAuth();

  const s = p.spinner();
  s.start('Switching organization…');

  try {
    const orgs = await listOrganizations();
    const needle = target.toLowerCase();
    const matches =
      needle === 'personal'
        ? orgs.filter((o) => o.isPersonal)
        : orgs.filter(
            (o) => o.id === target || o.slug === target || o.name.toLowerCase() === needle,
          );

    if (matches.length !== 1) {
      s.stop(matches.length ? 'More than one organization matches.' : 'Organization not found.');
      p.log.error(
        matches.length
          ? `Several organizations are called "${target}". Use its id from \`wassist orgs list\`.`
          : `You're not a member of "${target}". Run \`wassist orgs list\` to see your organizations.`,
      );
      process.exit(1);
    }

    const [org] = matches;
    setOrganization(org.isPersonal ? null : { id: org.id, name: org.name });

    // Sandbox chats follow you across orgs; owned numbers don't.
    const active = getActiveNumber();
    let note = '';
    if (active !== 'sandbox') {
      const numbers = await listPhoneNumbers();
      if (!numbers.some((n) => n.number === active)) {
        setActiveNumber('sandbox');
        note = ` +${active} isn't in this organization, so you're back on the sandbox.`;
      }
    }

    s.stop(`Switched to ${org.name}.${note}`);
  } catch (err) {
    s.stop('Failed.');
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
