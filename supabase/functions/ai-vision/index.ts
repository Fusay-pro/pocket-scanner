const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { imageBase64, mediaType } = await req.json();
    if (!imageBase64) throw new Error('Missing imageBase64');

    const ollamaUrl = Deno.env.get('OLLAMA_URL');
    const ollamaModel = Deno.env.get('OLLAMA_MODEL') ?? 'llava:7b';
    if (!ollamaUrl) throw new Error('OLLAMA_URL not set');

    const res = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        stream: false,
        messages: [
          {
            role: 'user',
            content: 'Look at this product image. Reply with ONLY a JSON object, no other text: {"name": "product name", "category": "one of: Food, Beverage, Dairy, Produce, Bakery, Frozen, Snacks, Personal Care, Cleaning, Other"}',
            images: [imageBase64],
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama error (${res.status}): ${text}`);
    }

    const data = await res.json();
    const raw = data?.message?.content ?? '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Could not parse model response');
    const parsed = JSON.parse(match[0]);

    if (!parsed.name || !parsed.category) throw new Error('Could not identify product');

    return new Response(JSON.stringify({ name: parsed.name, category: parsed.category }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
