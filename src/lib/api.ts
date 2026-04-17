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

export interface PhoneNumberAgent {
  id: string;
  name: string;
  icebreakers: string[];
}

export interface PhoneNumberWaba {
  id: string;
  waId: string;
  name: string;
}

export interface PhoneNumber {
  id: string;
  number: string;
  whatsappPhoneNumberId: string;
  whatsappBusinessAccount: PhoneNumberWaba | null;
  activeAgent: PhoneNumberAgent | null;
}

export interface WhatsAppAccount {
  id: string;
  name: string;
  waId: string;
  phoneNumbers: { id: string; number: string; bot: { id: string; name: string } | null }[];
}

export interface MetaPhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name: string;
  isLinkedToWassist: boolean;
  wassistPhoneNumberId?: string;
}

export interface AvailableNumber {
  id: string;
  phone_number: string;
}

export interface LinkSession {
  id: string;
  successUrl: string;
  returnUrl: string;
  status: string;
  linkUrl: string;
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

export async function listPhoneNumbers(): Promise<PhoneNumber[]> {
  return request<PhoneNumber[]>('/api/v1/phone-numbers/');
}

export async function listWhatsAppAccounts(): Promise<WhatsAppAccount[]> {
  return request<WhatsAppAccount[]>('/api/v1/whatsapp-accounts/');
}

export async function getAccountPhoneNumbers(accountId: string): Promise<MetaPhoneNumber[]> {
  const res = await request<{ data: MetaPhoneNumber[] }>(`/api/v1/whatsapp-accounts/${accountId}/phone-numbers/`);
  return res.data;
}

export async function listAvailableNumbers(): Promise<AvailableNumber[]> {
  return request<AvailableNumber[]>('/api/v1/available-numbers/');
}

export async function createLinkSession(returnUrl: string, successUrl: string): Promise<LinkSession> {
  return request<LinkSession>('/api/v1/whatsapp-link-sessions/', {
    method: 'POST',
    body: JSON.stringify({ returnUrl, successUrl }),
  });
}

export async function getLinkSession(sessionId: string): Promise<LinkSession> {
  return request<LinkSession>(`/api/v1/whatsapp-link-sessions/${sessionId}/public/`);
}

export async function managePhoneNumber(accountId: string, phoneNumber: string): Promise<WhatsAppAccount> {
  return request<WhatsAppAccount>(`/api/v1/whatsapp-accounts/${accountId}/manage/`, {
    method: 'POST',
    body: JSON.stringify({ phoneNumber }),
  });
}

export async function addNumber(accountId: string, numberId: string, name: string): Promise<WhatsAppAccount> {
  return request<WhatsAppAccount>(`/api/v1/whatsapp-accounts/${accountId}/add-number/`, {
    method: 'POST',
    body: JSON.stringify({ id: numberId, name }),
  });
}

export type SubscriptionLevel = 'hobby' | 'starter' | 'pro' | 'business' | 'enterprise';

export interface SubscriptionStatus {
  level: SubscriptionLevel;
  stripeCustomerId: string | null;
  cancelAtPeriodEnd?: boolean;
  periodEnd?: string | null;
  pendingDowngrade?: string | null;
}

export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  return request<SubscriptionStatus>('/api/v1/subscriptions/status/');
}

export async function createCheckoutSession(
  level: 'starter' | 'pro',
  opts?: { successUrl?: string; cancelUrl?: string },
): Promise<{ url: string }> {
  return request<{ url: string }>('/api/v1/subscriptions/checkout/', {
    method: 'POST',
    body: JSON.stringify({
      level,
      successUrl: opts?.successUrl ?? null,
      cancelUrl: opts?.cancelUrl ?? null,
    }),
  });
}

export async function createPortalSession(): Promise<{ url: string }> {
  return request<{ url: string }>('/api/v1/subscriptions/portal/', {
    method: 'POST',
  });
}

// ── Conversations & Messages ──────────────────────────────────────────

export interface ConversationContact {
  phoneNumber: string;
  name: string | null;
}

export interface ConversationLastMessage {
  body: string;
  createdAt: string;
  role: 'user' | 'assistant' | 'system';
}

export interface Conversation {
  id: string;
  contact: ConversationContact;
  activeAgent: { id: string; name: string } | null;
  active: boolean;
  chatWindowRemainingTime: number;
  lastMessage: ConversationLastMessage | null;
  isHumanTakeover: boolean;
}

export interface ConversationListParams {
  whatsappNumber?: string;
  contact?: string;
  status?: 'active' | 'closed';
  offset?: number;
  limit?: number;
}

interface ConversationListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Conversation[];
}

export async function listConversations(params?: ConversationListParams): Promise<ConversationListResponse> {
  const qs = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) qs.set(k, String(v));
    }
  }
  const query = qs.toString();

  return request<ConversationListResponse>(`/api/v1/conversations/${query ? `?${query}` : ''}`);
}

export interface UnifiedMessageButton {
  type: 'url' | 'quick_reply';
  text: string;
  url?: string;
  quickReplyId?: string;
}

export interface UnifiedMessageMedia {
  url: string;
  mimeType: string;
}

export interface UnifiedMessageData {
  body: string | null;
  footer: string | null;
  buttons: UnifiedMessageButton[];
  media: UnifiedMessageMedia[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  type: string;
  status: string | null;
  createdAt: string;
  text: { body: string } | null;
  image: { caption: string | null; url: string } | null;
  cta: { body: string; buttonText: string; url: string } | null;
  template: { name: string } | null;
  unified: UnifiedMessageData | null;
  quickReply: { body: string } | null;
}

export async function getConversationMessages(
  conversationId: string,
  params?: { offset?: number; limit?: number },
): Promise<Message[]> {
  const qs = new URLSearchParams();
  if (params?.offset !== undefined) qs.set('offset', String(params.offset));
  if (params?.limit !== undefined) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return request<Message[]>(`/api/v1/conversations/${conversationId}/messages/${query ? `?${query}` : ''}`);
}

export interface SendUnifiedButton {
  type: 'url' | 'quick_reply';
  text: string;
  url?: string;
  quickReplyId?: string;
}

export interface SendUnifiedMedia {
  url: string;
}

export interface SendUnifiedInput {
  text?: string;
  footer?: string;
  media?: SendUnifiedMedia;
  buttons?: SendUnifiedButton[];
}

export interface SendMessageInput {
  type: 'unified' | 'template';
  unified?: SendUnifiedInput;
  template?: { name: string; variables?: Record<string, string[]> };
}

export async function sendMessage(conversationId: string, input: SendMessageInput): Promise<Message> {
  return request<Message>(`/api/v1/conversations/${conversationId}/messages/`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface CreateConversationInput {
  toNumber: string;
  fromNumber: string;
  agentId?: string;
}

export async function createConversation(input: CreateConversationInput): Promise<Conversation> {
  return request<Conversation>('/api/v1/conversations/', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface WhatsAppTemplateLocal {
  id: string;
  name: string;
  category: string;
  language: string;
  components: any[];
}

export async function listTemplates(): Promise<WhatsAppTemplateLocal[]> {
  return request<WhatsAppTemplateLocal[]>('/api/v1/whatsapp-templates/');
}


// ── CLI Listen Sessions (WebSocket relay) ─────────────────────────────

export interface ListenSession {
  sessionId: string;
  wsUrl: string;
  token: string;
  expiresAt: string;
}

export async function createListenSession(): Promise<ListenSession> {
  return request<ListenSession>('/api/v1/cli-listen-sessions/', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function deleteListenSession(sessionId: string): Promise<void> {
  const base = getApiBase();
  const token = getToken();
  const res = await fetch(`${base}/api/v1/cli-listen-sessions/${sessionId}/`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Token ${token}` } : {}),
    },
  });
  if (!res.ok && res.status !== 404) {
    throw new ApiError(res.status, `Delete failed (${res.status})`);
  }
}
