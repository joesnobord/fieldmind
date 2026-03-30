const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const authHeader = event.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Not authenticated' }) };

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid session' }) };

    // Get priceId from request body, fall back to env default
    const body = JSON.parse(event.body || '{}');
    const VALID_PRICES = [
      // Test mode
      'price_1TGnKiGdsQzGCcrlIycPHXQC', // Homeowner monthly
      'price_1TGnKiGdsQzGCcrls542mmEJ', // Homeowner annual
      'price_1TGnKiGdsQzGCcrlCmNSKVwd', // Pro monthly
      'price_1TGnKiGdsQzGCcrlcyvc7k60', // Pro annual
      'price_1TGnKjGdsQzGCcrl7179fkUd', // Team annual
      // Live mode
      'price_1TGnDhGdsQzGCcrlg1ddeNwE', // Homeowner monthly
      'price_1TGnDhGdsQzGCcrlWVRbHiTq', // Homeowner annual
      'price_1TGnDhGdsQzGCcrl4zEgH1Wy', // Pro monthly
      'price_1TGnDiGdsQzGCcrlIhtKdPnN', // Pro annual
      'price_1TGnDiGdsQzGCcrlAGd9lGSn'  // Team annual
    ];
    const priceId = VALID_PRICES.includes(body.priceId) ? body.priceId : process.env.STRIPE_PRICE_ID;

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{
        price: priceId,
        quantity: 1
      }],
      customer_email: user.email,
      client_reference_id: user.id, // used in webhook to match user
      success_url: `https://fieldmind.net/?upgraded=true`,
      cancel_url: `https://fieldmind.net/?cancelled=true`,
      metadata: {
        supabase_user_id: user.id
      }
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ url: session.url })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
