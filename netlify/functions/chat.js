const { createClient } = require('@supabase/supabase-js');

const FREE_LIMIT = 10;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // service role key — bypasses RLS
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
    const body = JSON.parse(event.body);
    const messages = body.messages;
    const systemPrompt = body.system;
    const authHeader = event.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');

    if (!messages) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing messages' }) };
    }

    // ── Verify user + check usage ──────────────────────────────
    if (!token) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Not authenticated' }) };
    }

    // Get user from JWT
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid session' }) };
    }

    // Get profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('plan, messages_used, messages_reset_at')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Profile not found' }) };
    }

    // Reset monthly counter if needed
    const resetAt = new Date(profile.messages_reset_at);
    const now = new Date();
    const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    let messagesUsed = profile.messages_used;

    if (resetAt < monthAgo) {
      messagesUsed = 0;
      await supabase.from('profiles').update({
        messages_used: 0,
        messages_reset_at: now.toISOString()
      }).eq('id', user.id);
    }

    // Check limit for free users
    if (profile.plan === 'free' && messagesUsed >= FREE_LIMIT) {
      return {
        statusCode: 402,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          error: 'limit_reached',
          messages_used: messagesUsed,
          limit: FREE_LIMIT
        })
      };
    }

    // ── Call Claude ────────────────────────────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: systemPrompt,
        messages: messages
      })
    });

    const data = await response.json();

    // Increment usage on success
    if (data.content && data.content[0]) {
      await supabase.from('profiles').update({
        messages_used: messagesUsed + 1
      }).eq('id', user.id);
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        ...data,
        usage_info: {
          plan: profile.plan,
          messages_used: messagesUsed + 1,
          limit: profile.plan === 'free' ? FREE_LIMIT : null
        }
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
