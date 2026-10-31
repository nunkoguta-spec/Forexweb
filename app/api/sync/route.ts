import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const res = await fetch('https://biquote.io/api/calendar', { cache: 'no-store' });
    const data = await res.json();
    const rawEvents = Array.isArray(data) ? data : (data.data || []);
    
    const now = new Date();

    // Hanya ambil berita yang sudah lewat dan punya nilai Actual
    const releasedEvents = rawEvents.filter((e: any) => {
      const eventDate = new Date(e.date || e.time || new Date());
      const isPast = eventDate <= now;
      const hasActual = e.actual !== null && e.actual !== '' && e.actual !== '-' && e.actual !== undefined;
      return isPast && hasActual;
    });

    if (releasedEvents.length === 0) {
      return NextResponse.json({ message: 'Belum ada data actual baru.' });
    }

    const toInsert = releasedEvents.map((e: any) => ({
      event_name: e.event || e.name || e.title || 'Unknown',
      country: e.currency || e.country || '-',
      release_date: e.date || e.time || new Date().toISOString(),
      impact: e.impact || e.importance || 'Low',
      previous: e.previous || '-',
      forecast: e.forecast || '-',
      actual: e.actual
    }));

    // Upsert: Update jika sudah ada, Insert jika belum ada
    const { error } = await supabase
      .from('news_history')
      .upsert(toInsert, { onConflict: 'event_name, release_date' });

    if (error) throw error;

    return NextResponse.json({ success: true, count: releasedEvents.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}