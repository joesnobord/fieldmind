const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const sig = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      webhookSecret
    );
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  const userId = stripeEvent.data.object.metadata?.supabase_user_id
    || stripeEvent.data.object.client_reference_id;

  switch (stripeEvent.type) {
    case 'checkout.session.completed':
    case 'customer.subscription.updated': {
      // Subscription active — upgrade to pro
      if (userId) {
        await supabase.from('profiles').update({ plan: 'pro' }).eq('id', userId);
      }
      break;
    }
    case 'customer.subscription.deleted':
    case 'invoice.payment_failed': {
      // Subscription cancelled or payment failed — downgrade to free
      if (userId) {
        await supabase.from('profiles').update({ plan: 'free' }).eq('id', userId);
      }
      break;
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
