import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { event, marketContext } = await req.json();
    
    if (!process.env.DEEPSEEK_API_KEY) {
      return NextResponse.json({ error: 'DeepSeek API key missing' }, { status: 500 });
    }

        const prompt = `
      Anda adalah analis forex profesional. 
      Data Berita: ${JSON.stringify(event)}
      Data Pasar: ${JSON.stringify(marketContext)}
      
      Tugas Anda:
      Berikan analisis arah trading (BUY atau SELL) berdasarkan ekspektasi pasar terhadap berita ini. 
      JIKA berita belum rilis (actual kosong), berikan sinyal PRE-NEWS berdasarkan forecast vs previous.
      JIKA berita sudah rilis (ada actual), bandingkan actual vs forecast.
      
      Berikan hasil dalam format JSON valid dengan skema:
      {
        "direction": "buy" | "sell" | "no_trade",
        "confidence": number (0-100),
        "fundamental_reason": "string",
        "technical_reason": "string"
      }
      Hanya isi "no_trade" jika data benar-benar tidak ada (kosong melompong).
    `;

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error?.message || 'Gagal memanggil DeepSeek API');
    }

    const result = JSON.parse(data.choices[0].message.content);

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}