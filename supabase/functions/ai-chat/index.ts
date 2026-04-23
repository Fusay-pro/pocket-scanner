const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_MESSAGES = 30;
const MAX_CONTENT_LENGTH = 4000;

function sanitizeMessages(messages: unknown) {
  if (!Array.isArray(messages)) return [];

  return messages
    .slice(-MAX_MESSAGES)
    .filter((message) => message?.role === 'user' || message?.role === 'assistant')
    .map((message) => ({
      role: message.role,
      content: String(message.content ?? '').slice(0, MAX_CONTENT_LENGTH),
    }))
    .filter((message) => message.content.trim());
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { messages, systemPrompt } = await req.json();
    const safeSystemPrompt = String(systemPrompt ?? '').slice(0, MAX_CONTENT_LENGTH);
    const safeMessages = sanitizeMessages(messages);

    const baseUrl = Deno.env.get('MINIMAX_BASE_URL') ?? 'https://api.minimaxi.com/v1';
    const model = Deno.env.get('MINIMAX_MODEL') ?? 'MiniMax-M2.7-highspeed';
    const apiKey = Deno.env.get('MINIMAX_API_KEY');

    if (!apiKey) throw new Error('MINIMAX_API_KEY not set');
    if (!safeSystemPrompt || safeMessages.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing chat prompt or messages' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: safeSystemPrompt },
          ...safeMessages,
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`MiniMax error (${res.status}): ${text}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from MiniMax');

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
