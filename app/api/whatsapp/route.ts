import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { phone, apikey, message } = await req.json();
    
    if (!phone || !apikey) {
      return NextResponse.json({ error: 'Phone and API key required' }, { status: 400 });
    }

    const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(message)}&apikey=${apikey}`;
    const res = await fetch(url);
    
    if (!res.ok) throw new Error('Gagal mengirim WhatsApp');
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}