import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { event, marketContext } = await req.json();
    
    if (!process.env.DEEPSEEK_API_KEY) {
      return NextResponse.json({ error: 'DeepSeek API Key missing' }, { status: 500 });
    }

    const systemPrompt = `
      Anda adalah seorang Senior Forex Trader institusional. Tugas Anda adalah memberikan sinyal trading (BUY/SELL) yang SIAP EKSEKUSI berdasarkan berita ekonomi dan harga saat ini.
      
      ATURAN KETAT:
      1. Anda HARUS memberikan "direction" berupa "buy" atau "sell" (Hindari "no_trade" kecuali berita benar-benar 0% korelasinya dengan pair, misal: GDP Arab vs EUR/USD).
      2. Anda WAJIB menghitung dan memberikan level pasti untuk "entry_zone", "stop_loss", dan "take_profit" berdasarkan "current_price" yang diberikan.
      3. Hitung Risk/Reward Ratio (RR) minimal 1:1.5.
      4. Tentukan "timeframe" (Scalping, Intraday, atau Swing).
      5. Berikan alasan singkat (Surprise, Historical, Sentiment).

      Output HARUS berupa JSON valid dengan skema berikut:
      {
        "direction": "buy" | "sell",
        "confidence": 80,
        "relevance_score": 85,
        "risk_score": 40,
        "timeframe": "Intraday",
        "entry_zone": "1.0850 - 1.0855",
        "stop_loss": "1.0820",
        "take_profit": "1.0910",
        "invalidation": "Harga close di bawah 1.0800",
        "rationale": {
          "surprise": "CPI naik di atas ekspektasi",
          "historical": "Pair ini historisnya turun 30 pips pasca CPI AS",
          "sentiment": "USD sedang kuat minggu ini"
        }
      }
    `;

    const userPayload = {
      event: event,
      marketContext: marketContext,
      instruction: "Berikan sinyal trading dan level eksekusi (Entry, SL, TP) berdasarkan data ini."
    };

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
          { role: 'user', content: JSON.stringify(userPayload) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    });

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content;
    
    if (!raw) throw new Error('Empty response from AI');

    const parsed = JSON.parse(raw);
    return NextResponse.json(parsed);
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}