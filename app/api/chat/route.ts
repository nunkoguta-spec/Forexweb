import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { messages, marketContext } = await req.json();
    
    if (!process.env.DEEPSEEK_API_KEY) {
      return NextResponse.json({ error: 'AI unavailable' }, { status: 500 });
    }

    const systemPrompt = `You are NewssAI's senior trading analyst. You help users analyze forex, gold, and economic events.

CURRENT LIVE MARKET DATA:
${JSON.stringify(marketContext, null, 2)}

STRICT RULES:
- Be concise. 2-3 short paragraphs max.
- Use specific numbers from the market data above.
- NEVER invent prices or news not in the data.
- If user asks for trade idea, give: direction, entry, SL, TP with clear reasoning.
- If data is insufficient, say so honestly.
- Respond in the SAME language as user (Indonesian or English).
- You are not giving financial advice - encourage user to use their own judgment.`;

    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) throw new Error('Empty AI response');
    return NextResponse.json({ reply: content });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}