const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const authHeader = event.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Not authenticated' }) };

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Invalid session' }) };

    const body = JSON.parse(event.body || '{}');
    const { action } = body;

    // GET TEAM INFO
    if (action === 'get') {
      const { data: team } = await supabase.from('teams')
        .select('*, team_members(*)').eq('owner_id', user.id).single();
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ team: team || null }) };
    }

    // INVITE A MEMBER
    if (action === 'invite') {
      const { email } = body;
      if (!email) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Email required' }) };

      // Get team
      const { data: team } = await supabase.from('teams')
        .select('*, team_members(*)').eq('owner_id', user.id).single();
      if (!team) return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'No team found. Purchase a Team plan first.' }) };

      const activeMembers = team.team_members.filter(m => m.status === 'active').length;
      const pendingMembers = team.team_members.filter(m => m.status === 'pending').length;
      const totalSlots = activeMembers + pendingMembers + 1; // +1 for owner

      if (totalSlots >= team.max_seats) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: `Team is full (${team.max_seats} seats max)` }) };
      }

      // Add invite record
      const { error: insertError } = await supabase.from('team_members').insert({
        team_id: team.id,
        invited_email: email.toLowerCase(),
        status: 'pending'
      });
      if (insertError) {
        if (insertError.code === '23505') {
          return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'That email has already been invited' }) };
        }
        throw insertError;
      }

      // Send invite email
      const inviteUrl = `https://fieldmind.net/?team_invite=${team.id}&email=${encodeURIComponent(email)}`;
      await resend.emails.send({
        from: 'FieldMind <noreply@fieldmind.net>',
        to: email,
        subject: "You've been invited to FieldMind",
        html: `
          <h2 style="font-family:sans-serif;">You're invited to FieldMind</h2>
          <p style="font-family:sans-serif; color:#555;">
            ${user.email} has invited you to join their FieldMind team. 
            FieldMind is an AI-powered HVAC diagnostic assistant built by real techs.
          </p>
          <p style="text-align:center; margin:32px 0;">
            <a href="${inviteUrl}" style="background:#00d4ff; color:#000; font-family:sans-serif; font-weight:700; padding:12px 28px; border-radius:8px; text-decoration:none; display:inline-block;">
              Accept Invite
            </a>
          </p>
          <p style="font-family:sans-serif; color:#999; font-size:12px;">
            If you didn't expect this, you can ignore this email.
          </p>
          <p style="font-family:sans-serif; color:#999; font-size:12px;">— The FieldMind Team</p>
        `
      });

      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
    }

    // ACCEPT INVITE (called when invited user signs up/in)
    if (action === 'accept') {
      const { team_id } = body;
      if (!team_id) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'team_id required' }) };

      // Find the pending invite for this email
      const { data: invite } = await supabase.from('team_members')
        .select('*').eq('team_id', team_id).eq('invited_email', user.email.toLowerCase()).eq('status', 'pending').single();

      if (!invite) return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Invite not found or already used' }) };

      // Activate membership
      await supabase.from('team_members').update({
        status: 'active',
        user_id: user.id,
        joined_at: new Date().toISOString()
      }).eq('id', invite.id);

      // Give them pro access
      await supabase.from('profiles').update({ plan: 'pro', team_id: team_id }).eq('id', user.id);

      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
    }

    // REMOVE A MEMBER
    if (action === 'remove') {
      const { email } = body;
      const { data: team } = await supabase.from('teams').select('id').eq('owner_id', user.id).single();
      if (!team) return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Not a team owner' }) };

      const { data: member } = await supabase.from('team_members')
        .select('user_id').eq('team_id', team.id).eq('invited_email', email.toLowerCase()).single();

      if (member?.user_id) {
        await supabase.from('profiles').update({ plan: 'free', team_id: null }).eq('id', member.user_id);
      }
      await supabase.from('team_members').delete().eq('team_id', team.id).eq('invited_email', email.toLowerCase());

      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Unknown action' }) };

  } catch (err) {
    console.error('team function error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
