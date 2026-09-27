/**
 * Who runs this site, as the public pages state it. Razorpay reviews these
 * pages before switching an account to live payments, and the policies are
 * only honest once every bracketed value is replaced with the real one.
 */
export const SITE = {
  name: 'Price Escalation',
  operator: '[Your full name or registered business name]',
  email: '[support email address]',
  phone: '[phone number]',
  address: '[postal address, city, PIN]',
  /** The courts the Terms submit disputes to. */
  jurisdiction: '[city], Rajasthan',
  /** The date the current wording of the policies took effect. */
  effective: '27 September 2026',
} as const;
