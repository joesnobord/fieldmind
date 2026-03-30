const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Team plan price IDs (test + live)
const TEAM_PRICE_IDS = [
  'price_1TGnKjGdsQzGCcrl7179fkUd', // test
  'price_1TGnDiGdsQzGCcrlAGd9lGSn'  // live
];

async function getPriceId(sessionOrSub) {
  // For checkout.session.completed, fetch the subscription to get price
  if (sessionOrSub.object === 'checkout.session') {
    const sub = await stripe.subscriptions.retrieve(sessionOrSub.subscription);
    return sub.items.data[0]?.price?.id;
  }
  return sessionOrSub.items?.data[0]?.price?.id;
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const sig = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  const obj = stripeEvent.data.object;
  const userId = obj.metadata?.supabase_user_id || obj.client_reference_id;

  switch (stripeEvent.type) {

    case 'checkout.session.completed': {
      if (!userId) break;
      const priceId = await getPriceId(obj);
      const isTeam = TEAM_PRICE_IDS.includes(priceId);

      if (isTeam) {
        // Create a team record for this owner
        const { data: team } = await supabase.from('teams').insert({
          owner_id: userId,
          max_seats: 5,
          stripe_subscription_id: obj.subscription,
          stripe_customer_id: obj.customer
        }).select().single();

        if (team) {
          // Set owner's plan to pro and link to team
          await supabase.from('profiles')
            .update({ plan: 'pro', team_id: team.id })
            .eq('id', userId);
        }
      } else {
        // Individual plan — just upgrade to pro
        await supabase.from('profiles').update({ plan: 'pro' }).eq('id', userId);
      }
      break;
    }

    case 'customer.subscription.updated': {
      if (!userId) break;
      const priceId = obj.items?.data[0]?.price?.id;
      const isTeam = TEAM_PRICE_IDS.includes(priceId);
      const isActive = ['active', 'trialing'].includes(obj.status);

      if (isActive) {
        await supabase.from('profiles').update({ plan: 'pro' }).eq('id', userId);
        if (isTeam) {
          // Ensure team exists
          const { data: existing } = await supabase.from('teams')
            .select('id').eq('owner_id', userId).single();
          if (!existing) {
            await supabase.from('teams').insert({
              owner_id: userId,
              max_seats: 5,
              stripe_subscription_id: obj.id,
              stripe_customer_id: obj.customer
            });
          }
        }
      }
      break;
    }

    case 'customer.subscription.deleted':
    case 'invoice.payment_failed': {
      if (!userId) break;
      // Downgrade owner
      await supabase.from('profiles')
        .update({ plan: 'free', team_id: null })
        .eq('id', userId);
      // Downgrade all team members if this was a team subscription
      const { data: team } = await supabase.from('teams')
        .select('id').eq('owner_id', userId).single();
      if (team) {
        // Get all active members
        const { data: members } = await supabase.from('team_members')
          .select('user_id').eq('team_id', team.id).eq('status', 'active');
        if (members?.length) {
          const memberIds = members.map(m => m.user_id).filter(Boolean);
          await supabase.from('profiles')
            .update({ plan: 'free', team_id: null })
            .in('id', memberIds);
        }
        // Delete the team
        await supabase.from('teams').delete().eq('id', team.id);
      }
      break;
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
