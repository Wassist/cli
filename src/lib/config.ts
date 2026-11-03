import Conf from 'conf';

interface WassistConfig {
  token?: string;
  apiBase: string;
  phoneNumber?: string;
  activeNumber?: string;
  sandboxNumber?: string;
  organizationId?: string;
  organizationName?: string;
}

let _config: Conf<WassistConfig> | undefined;

// When WASSIST_API_BASE is set we isolate credentials in a per-server store
// so hitting a dev / staging / ngrok server doesn't clobber the prod token.
function projectName(): string {
  const override = process.env.WASSIST_API_BASE;
  if (!override) return 'wassist';
  const slug = override
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `wassist-${slug}`;
}

function config(): Conf<WassistConfig> {
  if (!_config) {
    _config = new Conf<WassistConfig>({
      projectName: projectName(),
      defaults: {
        apiBase: 'https://backend.wassist.app',
      },
    });
  }
  return _config;
}

export function getToken(): string | undefined {
  return config().get('token');
}

export function saveToken(token: string): void {
  config().set('token', token);
}

export function getApiBase(): string {
  return process.env.WASSIST_API_BASE ?? config().get('apiBase');
}

export function setApiBase(url: string): void {
  config().set('apiBase', url);
}

export function getFrontendBase(): string {
  if (process.env.WASSIST_FRONTEND_BASE) return process.env.WASSIST_FRONTEND_BASE;
  return getApiBase().replace('backend.', '').replace(/\/$/, '');
}

/** The sandbox number you picked with `wassist use`, or the env override. */
export function getPreferredSandboxNumber(): string | undefined {
  return process.env.WASSIST_SANDBOX_NUMBER?.replace(/^\+/, '') || config().get('sandboxNumber');
}

export function setPreferredSandboxNumber(number: string | null): void {
  if (number) config().set('sandboxNumber', number);
  else config().delete('sandboxNumber');
}

export function getPhoneNumber(): string | undefined {
  return config().get('phoneNumber');
}

export function savePhoneNumber(phone: string): void {
  config().set('phoneNumber', phone);
}

export function getActiveNumber(): string {
  return config().get('activeNumber') ?? 'sandbox';
}

export function setActiveNumber(number: string): void {
  config().set('activeNumber', number);
}

/** The organization requests act in; unset means your personal organization. */
export function getOrganization(): { id: string; name?: string } | undefined {
  const id = process.env.WASSIST_ORGANIZATION_ID ?? config().get('organizationId');
  if (!id) return undefined;
  return { id, name: process.env.WASSIST_ORGANIZATION_ID ? undefined : config().get('organizationName') };
}

export function setOrganization(org: { id: string; name: string } | null): void {
  if (org) {
    config().set('organizationId', org.id);
    config().set('organizationName', org.name);
  } else {
    config().delete('organizationId');
    config().delete('organizationName');
  }
}

export function clearAuth(): void {
  config().delete('token');
  config().delete('phoneNumber');
  config().delete('activeNumber');
  config().delete('sandboxNumber');
  config().delete('organizationId');
  config().delete('organizationName');
}
