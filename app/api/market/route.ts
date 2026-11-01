import { NextResponse } from 'next/server';
import Biquote from 'biquote';

const bq = new Biquote();

export async function GET() {
  try {
    const symbols = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY'];
    const ticks = await bq.latest(symbols);

    // Format agar sesuai dengan yang diharapkan frontend (XAU/USD, EUR/USD, dll.)
    const formatted: Record<string, { price: string }> = {};
    for (const symbol of symbols) {
      const tick = ticks[symbol];
      if (tick && tick.mid) {
        const pairKey = symbol.replace('XAUUSD', 'XAU/USD')
                               .replace('EURUSD', 'EUR/USD')
                               .replace('GBPUSD', 'GBP/USD')
                               .replace('USDJPY', 'USD/JPY');
        formatted[pairKey] = { price: tick.mid.toString() };
      }
    }

    return NextResponse.json(formatted);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}