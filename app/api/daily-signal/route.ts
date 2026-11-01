import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { pairs } = await req.json();
    if (!process.env.DEEPSEEK_API_KEY) return NextResponse.json({ error: 'DeepSeek API Key missing' }, { status: 500 });

    const systemPrompt = `Anda Senior Trader Institusional. Berikan analisis trading harian untuk pair berikut.
Harga real-time diberikan. DILARANG pakai harga dari memori.
Aturan:
1. Entry Zone harus dalam 0.5% dari harga saat ini.
2. BUY: SL < Entry < TP. SELL: TP < Entry < SL.
3. Timeframe: Scalping, Intraday, atau Swing.
4. Rationale maksimal 15 kata.

Output JSON:
{
  "signals": [
    { "pair": "XAU/USD", "direction": "buy", "confidence": 80, "timeframe": "Intraday", "entry_zone": "4030 - 4035", "stop_loss": "4010", "take_profit": "4070", "invalidation": "Close di bawah 4005", "rationale": "Momentum bullish dari CPI" }
  ]
}`;

    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(pairs) }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    });

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(raw);
    return NextResponse.json(parsed.signals || []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}