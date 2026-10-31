import { NextResponse } from 'next/server';
import { Scraper } from 'forexfactory-scraper';

export async function GET() {
  try {
    const scraper = new Scraper();
    const events = await scraper.scrapeCalendar();
    
    const formattedEvents = events.map((ev: any) => ({
      title: ev.title || ev.event || 'Unknown Event',
      country: ev.country || ev.currency || '-',
      date: ev.date || ev.time || new Date().toISOString(),
      impact: ev.impact || 'Low',
      actual: ev.actual || '-',
      forecast: ev.forecast || '-',
      previous: ev.previous || '-',
      detail: ev.detail || ''
    }));

    return NextResponse.json(formattedEvents);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}