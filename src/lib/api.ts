import { getApiBase, getToken } from './config';

interface SendCodeResponse {
  success: boolean;
  sessionId: string;
  message: string;
}

interface VerifyCodeResponse {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    phoneNumber: string;
    whatsappName: string | null;
  };
  message?: string;
}

interface GetMeResponse {
  id: string;
  phone_number: string;
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const base = getApiBase();
  const url = `${base}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Token ${token}`;
  }

  const res = await fetch(url, { ...options, headers });
  const body = await res.json() as T & { message?: string };

  if (!res.ok) {
    throw new ApiError(res.status, body.message ?? `Request failed (${res.status})`);
  }

  return body;
}

export async function sendCode(phoneNumber: string): Promise<SendCodeResponse> {
  return request<SendCodeResponse>('/api/v1/auth/send-code/', {
    method: 'POST',
    body: JSON.stringify({ phoneNumber }),
  });
}

export async function verifyCode(sessionId: string, code: string): Promise<VerifyCodeResponse> {
  return request<VerifyCodeResponse>('/api/v1/auth/verify-code/', {
    method: 'POST',
    body: JSON.stringify({ sessionId, code }),
  });
}

export async function getMe(): Promise<GetMeResponse> {
  return request<GetMeResponse>('/api/get-me/');
}
