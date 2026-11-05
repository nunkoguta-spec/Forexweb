import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { pairs } = await req.json();
    if (!process.env.DEEPSEEK_API_KEY) {
      return NextResponse.json({ error: 'DeepSeek API Key missing' }, { status: 500 });
    }

    const systemPrompt = `Anda adalah Senior Quantitative Analyst Hedge Fund. Gunakan ANALISIS GABUNGAN TEKNIKAL + FUNDAMENTAL untuk setiap signal.

STRICT RULES:
1. Setiap signal WAJIB didukung DUA analisis:
   - FUNDAMENTAL: dampak berita ekonomi (surprise vs forecast, sentimen USD, korelasi pair)
   - TEKNIKAL: tren, support/resistance, RSI, price action di timeframe terkait
2. Entry HARUS dalam 1% dari harga live yang diberikan.
3. BUY: SL < Entry < TP. SELL: TP < Entry < SL.
4. Confidence (0-100) mencerminkan KEKUATAN GABUNGAN kedua analisis. Hanya pair dengan confidence >= 60 yang layak.
5. DILARANG mengarang harga. Pakai harga real-time.
6. Timeframe: Scalping/Intraday/Swing.

OUTPUT JSON (semua pair, urut confidence tertinggi dulu):
{
  "signals": [
    {
      "pair": "XAU/USD",
      "direction": "buy",
      "confidence": 85,
      "timeframe": "Intraday",
      "entry_zone": "4035 - 4040",
      "stop_loss": "4015",
      "take_profit": "4080",
      "invalidation": "Close below 4010",
      "fundamental_reason": "NFP stronger than expected → USD bullish, gold pressured",
      "technical_reason": "Rejection from 4045 resistance, RSI overbought on H1",
      "rationale": "USD strength + rejection at key resistance"
    }
  ]
}`;

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
          { role: 'user', content: JSON.stringify({ pairs, instruction: 'Analisis teknikal + fundamental. Kembalikan semua signal dengan confidence tertinggi.' }) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      }),
    });

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) throw new Error('Empty AI response');

    const parsed = JSON.parse(raw);
    return NextResponse.json(parsed.signals || []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}