// As of Stripe API version 2025-03-31.basil (the SDK here defaults to
// 2026-02-25.clover), `current_period_end` was removed from the Subscription
// object and now lives on each subscription item. Reading the old field gave
// `undefined`, and `new Date(undefined * 1000).toISOString()` throws
// RangeError — which is what made cancelling a subscription fail even though
// Stripe had already accepted the cancellation.
export function subscriptionPeriodEnd(subscription) {
  const seconds =
    subscription?.items?.data?.[0]?.current_period_end ??
    subscription?.current_period_end ??
    null

  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
    return null
  }

  return new Date(seconds * 1000).toISOString()
}
