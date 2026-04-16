import Conf from 'conf';

interface WassistConfig {
  token?: string;
  apiBase: string;
  phoneNumber?: string;
  activeNumber?: string;
}

let _config: Conf<WassistConfig> | undefined;

function config(): Conf<WassistConfig> {
  if (!_config) {
    _config = new Conf<WassistConfig>({
      projectName: 'wassist',
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
  return config().get('apiBase');
}

export function setApiBase(url: string): void {
  config().set('apiBase', url);
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
