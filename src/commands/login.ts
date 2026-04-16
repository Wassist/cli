import * as p from '@clack/prompts';
import { sendCode, verifyCode } from '../lib/api';
import { saveToken, savePhoneNumber, setActiveNumber } from '../lib/config';

export async function login() {   
  p.intro('wassist login');

  const phone = await p.text({
    message: 'Enter your phone number to get started',
    placeholder: '447xxxxxxxxx',
    validate(value) {
      if (!value || value.length < 8) return 'Enter a valid phone number';
      if (!/^\+?\d+$/.test(value)) return 'Phone number must contain only digits (optional leading +)';
    },
  });

  if (p.isCancel(phone)) {
    p.cancel('Login cancelled.');
    process.exit(0);
  }

  const s = p.spinner();
  s.start('Sending verification code…');

  let sessionId: string;
  try {
    const res = await sendCode(phone);
    sessionId = res.sessionId;
    s.stop('Code sent via WhatsApp!');
  } catch (err) {
    console.log(err);
    s.stop('Failed to send code.');
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const code = await p.password({
    message: 'Enter the code sent to you',
    validate(value) {
      if (!value || value.length < 4) return 'Code must be at least 4 digits';
    },
  });

  if (p.isCancel(code)) {
    p.cancel('Login cancelled.');
    process.exit(0);
  }

  s.start('Verifying…');

  try {
    const res = await verifyCode(sessionId, code);

    if (!res.success || !res.token) {
      s.stop('Verification failed.');
      p.log.error(res.message ?? 'Unknown error');
      process.exit(1);
    }

    saveToken(res.token);
    savePhoneNumber(phone);
    setActiveNumber('sandbox');
    s.stop('Verified!');
    p.log.info('You are using the sandbox number. Use `wassist use <number>` to switch.');
    p.outro('Logged in ✅');
  } catch (err) {
    s.stop('Verification failed.');
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
