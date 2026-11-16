export const NOVA_USER_KEY_PREFIX = 'nova_user_';
export const NOVA_CURRENT_USER_KEY = 'nova_current_user';

export interface LocalAuthResult {
  ok: boolean;
  email?: string;
  message: string;
}

export function getTodayDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentLocalUser(): string | null {
  try {
    const email = window.localStorage.getItem(NOVA_CURRENT_USER_KEY);
    return email && email.trim() ? email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

export function localSignUp(rawEmail: string, password: string): LocalAuthResult {
  const email = rawEmail.trim().toLowerCase();
  if (!email.includes('@')) {
    return { ok: false, message: 'Enter valid email' };
  }
  if (password.length < 6) {
    return { ok: false, message: 'Password must be 6+ characters' };
  }
  try {
    window.localStorage.setItem(`${NOVA_USER_KEY_PREFIX}${email}`, password);
    window.localStorage.setItem(NOVA_CURRENT_USER_KEY, email);
  } catch {
    return { ok: false, message: 'Could not save account on this device.' };
  }
  return { ok: true, email, message: `Account created! Welcome ${email}` };
}

export function localSignIn(rawEmail: string, password: string): LocalAuthResult {
  const email = rawEmail.trim().toLowerCase();
  if (!email.includes('@')) {
    return { ok: false, message: 'Enter valid email' };
  }
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(`${NOVA_USER_KEY_PREFIX}${email}`);
  } catch {
    saved = null;
  }
  if (!saved) {
    return { ok: false, message: 'No account with this email. Please Sign Up first.' };
  }
  if (saved !== password) {
    return { ok: false, message: 'Wrong password. Try again.' };
  }
  try {
    window.localStorage.setItem(NOVA_CURRENT_USER_KEY, email);
  } catch {
    // ignore storage errors
  }
  return { ok: true, email, message: `Welcome back ${email}` };
}

export function localLogout(): void {
  try {
    window.localStorage.removeItem(NOVA_CURRENT_USER_KEY);
  } catch {
    // ignore storage errors
  }
}
