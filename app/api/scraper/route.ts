import { NextResponse } from 'next/server';
import { Scraper } from 'forexfactory-scraper';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const scraper = new Scraper();
    // Mengambil data kalender minggu ini
    const events = await scraper.scrapeCalendar();
    
    // Format data agar sesuai dengan tampilan Forex Factory
    const formattedEvents = events.map((ev: any) => ({
      title: ev.title,
      country: ev.country,
      date: ev.date,
      impact: ev.impact,
      actual: ev.actual || '-',
      forecast: ev.forecast || '-',
      previous: ev.previous || '-',
      // Forex Factory biasanya memiliki detail seperti 'Alert' atau 'Detail'
      detail: ev.detail || ''
    }));

    return NextResponse.json(formattedEvents);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}