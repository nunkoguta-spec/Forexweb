import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const apiKey = process.env.TWELVE_DATA_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'API Key missing' }, { status: 500 });

    // Mengambil harga EUR/USD dan XAU/USD
    const symbols = 'EUR/USD,XAU/USD';
    const url = `https://api.twelvedata.com/price?symbol=${symbols}&apikey=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}