const MAX_MESSAGES = 30;
const MAX_CONTENT_LENGTH = 4000;

// Sliding-window rate limiter: 20 requests per 60 s per user
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const rateLimitMap = new Map();

function checkRateLimit(key) {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(key) ?? []).filter(t => now - t < RATE_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT) return false;
  timestamps.push(now);
  rateLimitMap.set(key, timestamps);
  return true;
}

function getRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .slice(-MAX_MESSAGES)
    .filter(message => message?.role === 'user' || message?.role === 'assistant')
    .map(message => ({
      role: message.role,
      content: String(message.content ?? '').slice(0, MAX_CONTENT_LENGTH),
    }))
    .filter(message => message.content.trim());
}

// Returns the user's UUID on success, null on failure.
async function verifySupabaseToken(token) {
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL)?.trim();
  const anonKey = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY)?.trim();
  if (!supabaseUrl || !anonKey || !token) return null;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.id ?? null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require auth when Supabase is configured; derive rate-limit key from user ID or IP
  const supabaseConfigured = !!(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL)?.trim();
  let rateLimitKey;
  if (supabaseConfigured) {
    const token = req.headers['x-supabase-auth'];
    const userId = await verifySupabaseToken(token);
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    rateLimitKey = userId;
  } else {
    rateLimitKey = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.socket?.remoteAddress ?? 'local';
  }

  if (!checkRateLimit(rateLimitKey)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests — please wait a moment' });
  }

  try {
    const aiBase = getRequiredEnv('AI_BASE_URL').replace(/\/+$/, '');
    const aiModel = getRequiredEnv('AI_MODEL');
    const aiKey = getRequiredEnv('AI_API_KEY');
    const systemPrompt = String(req.body?.systemPrompt ?? '').slice(0, MAX_CONTENT_LENGTH);
    const messages = sanitizeMessages(req.body?.messages);

    if (!systemPrompt || messages.length === 0) {
      return res.status(400).json({ error: 'Missing chat prompt or messages' });
    }

    const upstream = await fetch(`${aiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiKey}`,
      },
      body: JSON.stringify({
        model: aiModel,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => upstream.statusText);
      return res.status(upstream.status).json({
        error: `AI request failed (${upstream.status})`,
        detail: text.slice(0, 500),
      });
    }

    const data = await upstream.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return res.status(502).json({ error: 'Empty response from AI' });

    return res.status(200).json({ content });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'AI request failed',
    });
  }
}
