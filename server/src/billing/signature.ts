import { createHmac, timingSafeEqual } from 'node:crypto';

function hmacHex(secret: string, data: string | Buffer): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

/** Constant-time, and false rather than a throw when the lengths differ. */
function sameHex(expected: string, given: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** What Checkout hands the page after a subscription payment. */
export function verifyCheckoutSignature(
  paymentId: string, subscriptionId: string, signature: string, keySecret: string,
): boolean {
  return sameHex(hmacHex(keySecret, `${paymentId}|${subscriptionId}`), signature);
}

/** Over the exact bytes received: re-serialised JSON would not match. */
export function verifyWebhookSignature(rawBody: Buffer, signature: string, webhookSecret: string): boolean {
  return sameHex(hmacHex(webhookSecret, rawBody), signature);
}
