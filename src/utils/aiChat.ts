const AI_BASE = (import.meta.env.VITE_AI_BASE_URL as string)?.replace(/\/+$/, '');
const AI_MODEL = import.meta.env.VITE_AI_MODEL as string;
const AI_KEY = import.meta.env.VITE_AI_API_KEY as string;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function sendChatMessage(
  messages: ChatMessage[],
  systemPrompt: string,
): Promise<string> {
  const res = await fetch(`${AI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AI_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`AI request failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Empty response from AI');
  // Strip <think>...</think> reasoning blocks some models prepend
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}
