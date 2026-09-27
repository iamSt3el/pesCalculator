import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { billingConfigFromEnv, TOTAL_COUNT } from '../src/billing/config.ts';
import { verifyCheckoutSignature, verifyWebhookSignature } from '../src/billing/signature.ts';

const FULL = {
  NODE_ENV: 'production',
  RAZORPAY_KEY_ID: 'rzp_test_1',
  RAZORPAY_KEY_SECRET: 'secret',
  RAZORPAY_WEBHOOK_SECRET: 'hook',
  RAZORPAY_PLAN_MONTHLY: 'plan_m',
  RAZORPAY_PLAN_HALF_YEARLY: 'plan_h',
  RAZORPAY_PLAN_YEARLY: 'plan_y',
};

test('billing is configured when all six variables are set', () => {
  assert.deepEqual(billingConfigFromEnv(FULL), {
    keyId: 'rzp_test_1', keySecret: 'secret', webhookSecret: 'hook',
    plans: { monthly: 'plan_m', half_yearly: 'plan_h', yearly: 'plan_y' },
  });
});

test('one missing or blank variable leaves billing unconfigured', () => {
  for (const key of Object.keys(FULL).filter((k) => k.startsWith('RAZORPAY_'))) {
    assert.equal(billingConfigFromEnv({ ...FULL, [key]: undefined }), null, `${key} missing`);
    assert.equal(billingConfigFromEnv({ ...FULL, [key]: '  ' }), null, `${key} blank`);
  }
});

test('tests never pick billing up from the environment', () => {
  assert.equal(billingConfigFromEnv({ ...FULL, NODE_ENV: 'test' }), null);
});

test('every period asks Razorpay for ten years of cycles', () => {
  assert.deepEqual(TOTAL_COUNT, { monthly: 120, half_yearly: 20, yearly: 10 });
});

test('a checkout signature is HMAC-SHA256 of payment id | subscription id', () => {
  const good = createHmac('sha256', 'secret').update('pay_1|sub_1').digest('hex');
  assert.equal(verifyCheckoutSignature('pay_1', 'sub_1', good, 'secret'), true);
  assert.equal(verifyCheckoutSignature('pay_1', 'sub_2', good, 'secret'), false);
  assert.equal(verifyCheckoutSignature('pay_1', 'sub_1', good, 'other'), false);
  assert.equal(verifyCheckoutSignature('pay_1', 'sub_1', '', 'secret'), false);
  assert.equal(verifyCheckoutSignature('pay_1', 'sub_1', 'short', 'secret'), false);
});

test('a webhook signature is HMAC-SHA256 of the exact raw body', () => {
  const body = Buffer.from('{"event":"subscription.activated"}');
  const good = createHmac('sha256', 'hook').update(body).digest('hex');
  assert.equal(verifyWebhookSignature(body, good, 'hook'), true);
  assert.equal(verifyWebhookSignature(Buffer.from('{"event": "subscription.activated"}'), good, 'hook'), false);
  assert.equal(verifyWebhookSignature(body, good.toUpperCase(), 'hook'), false);
});
