/**
 * The rules the change-password form enforces before it troubles the server.
 * Kept apart from the component so they can be tested directly -- the server
 * repeats every one of them, since a browser check guards nothing.
 */
export interface PasswordChangeInput { current: string; next: string; confirm: string }

export const MIN_PASSWORD = 12;
export const MAX_PASSWORD = 200;

export function validatePasswordChange({ current, next, confirm }: PasswordChangeInput): string | null {
  if (!current) return 'Enter your current password.';
  if (next.length < MIN_PASSWORD) return `The new password must be at least ${MIN_PASSWORD} characters.`;
  if (next.length > MAX_PASSWORD) return `The new password must be at most ${MAX_PASSWORD} characters.`;
  if (next !== confirm) return 'The new passwords do not match.';
  if (next === current) return 'The new password must be different from your current one.';
  return null;
}
