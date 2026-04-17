import Conf from 'conf';

interface WassistConfig {
  token?: string;
  apiBase: string;
  phoneNumber?: string;
  activeNumber?: string;
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

export function getSandboxNumber(): string {
  return process.env.WASSIST_SANDBOX_NUMBER ?? '447424845871';
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

export function clearAuth(): void {
  config().delete('token');
  config().delete('phoneNumber');
  config().delete('activeNumber');
}
