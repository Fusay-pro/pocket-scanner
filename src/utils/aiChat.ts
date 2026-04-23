export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function sendChatMessage(
  messages: ChatMessage[],
  systemPrompt: string,
): Promise<string> {
  const res = await fetch('/api/ai-chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`AI request failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const raw = data.content;
  if (!raw) throw new Error('Empty response from AI');
  // Strip <think>...</think> reasoning blocks some models prepend
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}
