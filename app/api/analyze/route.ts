import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { event, marketContext } = await req.json();
    
    if (!process.env.DEEPSEEK_API_KEY) {
      return NextResponse.json({ error: 'DeepSeek API Key missing' }, { status: 500 });
    }

    const systemPrompt = `
      Anda adalah seorang Senior Quantitative Analyst di Hedge Fund global.
      Tugas Anda adalah mengevaluasi berita ekonomi dan memberikan sinyal trading berprobabilitas tinggi.
      
      ATURAN KETAT (WAJIB DIPATUHI):
      1. RELEVANSI: Hitung "relevance_score" (0-100). Seberapa kuat berita (currency/negara) mempengaruhi pair yang dipilih? 
         - Contoh: Berita GDP Arab Saudi TIDAK relevan dengan XAU/USD (skor < 30). Jika skor < 50, Anda WAJIB mengeluarkan "direction": "no_trade".
      2. STRUKTUR EKSEKUSI: Jika direction "buy" atau "sell", Anda WAJIB memberikan "entry_zone", "stop_loss", "take_profit", dan "timeframe" (Scalping/Swing).
      3. INVALIDASI: Berikan kondisi harga pasti yang membuat sinyal ini batal.
      4. RISIKO: Berikan "risk_score" (0-100). 100 = sangat berbahaya (whipsaw tinggi).
      5. RATIONALE: Jangan pakai paragraf panjang. Berikan poin-poin singkat: (a) Arah surprise, (b) Deviasi ekspektasi, (c) Sensitivitas historis.

      Output HARUS berupa JSON valid dengan skema berikut:
      {
        "relevance_score": 85,
        "direction": "buy" | "sell" | "no_trade",
        "confidence": 75,
        "risk_score": 40,
        "timeframe": "Swing (1-3 hari)",
        "entry_zone": "2350 - 2355",
        "stop_loss": "2340",
        "take_profit": "2380",
        "invalidation": "Harga close di bawah 2335",
        "rationale": {
          "surprise": "CPI naik 0.2% di atas ekspektasi",
          "historical": "XAU/USD historisnya turun 30 pips dalam 15 menit setelah CPI AS",
          "sentiment": "USD sedang kuat minggu ini"
        },
        "no_trade_reason": "Korelasi lemah" // Isi jika direction no_trade
      }
    `;

    const userPayload = {
      event: event,
      marketContext: marketContext,
      instruction: "Analisis korelasi dan berikan output JSON."
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
        temperature: 0.1, // Dibuat sangat rendah agar AI tidak berhalusinasi
      }),
    });

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content;
    
    if (!raw) throw new Error('Empty response from AI');

    const parsed = JSON.parse(raw);

    // Guardrail: Jika relevansi rendah, paksa no_trade
    if (parsed.relevance_score < 50) {
      parsed.direction = 'no_trade';
      parsed.no_trade_reason = 'Relevance score too low. Event does not directly impact this pair.';
    }

    return NextResponse.json(parsed);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}