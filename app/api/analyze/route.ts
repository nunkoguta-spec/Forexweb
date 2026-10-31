import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { event, marketContext } = await req.json();
    
    if (!process.env.DEEPSEEK_API_KEY) {
      return NextResponse.json({ error: 'DeepSeek API Key missing' }, { status: 500 });
    }

    const currentPrice = marketContext?.current_price;

    if (!currentPrice || currentPrice === "Unknown" || isNaN(parseFloat(currentPrice))) {
      return NextResponse.json({ error: 'Harga live tidak tersedia. Cek Twelve Data API Key Anda.' }, { status: 400 });
    }

    const systemPrompt = `
      Anda adalah Senior Trader Institusional. 
      
      ATURAN MUTLAK:
      1. Harga saat ini (Current Price) untuk ${marketContext.pair} adalah ${currentPrice}. INI ADALAH HARGA REAL-TIME YANG 100% AKURAT.
      2. DILARANG KERAS menggunakan harga dari pengetahuan lama Anda (jangan pakai harga Emas 2000 jika current price adalah 4000).
      3. "entry_zone" HARUS berada dalam jarak 0.5% dari ${currentPrice}.
      4. Jika direction "buy", maka Stop Loss < Entry < Take Profit. Jika "sell", maka Take Profit < Entry < Stop Loss.
      5. Berikan output JSON valid.

      Skema Output:
      {
        "direction": "buy" | "sell",
        "confidence": 80,
        "relevance_score": 85,
        "risk_score": 40,
        "timeframe": "Intraday",
        "entry_zone": "HARGA (Angka saja, contoh: 4036.81)",
        "stop_loss": "HARGA",
        "take_profit": "HARGA",
        "invalidation": "String",
        "rationale": { "surprise": "String", "historical": "String", "sentiment": "String" }
      }
    `;

    const userPayload = {
      event: event,
      current_price: currentPrice,
      instruction: "Berikan sinyal trading berdasarkan Current Price yang diberikan."
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
        temperature: 0.1,
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