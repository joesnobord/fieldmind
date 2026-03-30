const { createClient } = require('@supabase/supabase-js');

exports.handler = async function(event) {
  const CORS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }, body: '' };
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const token = (event.headers.authorization || '').replace('Bearer ', '');
    if (!token) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Not authenticated' }) };

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Invalid session' }) };

    let { data: profile } = await supabase
      .from('profiles')
      .select('plan, messages_used, team_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      await supabase.from('profiles').insert({ id: user.id, email: user.email });
      profile = { plan: 'free', messages_used: 0, team_id: null };
    }

    // Check if user is a team owner
    const { data: ownedTeam } = await supabase
      .from('teams')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    return { statusCode: 200, headers: CORS, body: JSON.stringify({
      ...profile,
      is_team_owner: !!ownedTeam
    }) };
  } catch (err) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: err.message }) };
  }
};
