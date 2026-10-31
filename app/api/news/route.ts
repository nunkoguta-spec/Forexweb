import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const url = 'https://biquote.io/api/calendar'; 
    
    // Timeout 10 detik agar aplikasi tidak hang
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, { 
      cache: 'no-store',
      signal: controller.signal 
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) throw new Error(`Status: ${response.status}`);

    const data = await response.json();
    const rawEvents = Array.isArray(data) ? data : (data.data || []);
    
    // Menerjemahkan format API ke aplikasi kita
    const formattedEvents = rawEvents.map((ev: any) => {
      let impactText = (ev.impact || ev.importance || ev.volatility || 'low').toString().toLowerCase();
      let finalImpact = 'Low';
      if (impactText.includes('high') || impactText === '3' || impactText === 'red') finalImpact = 'High';
      else if (impactText.includes('medium') || impactText === '2' || impactText === 'orange') finalImpact = 'Medium';

      return {
        title: ev.event || ev.name || ev.title || 'Unknown Event',
        country: ev.currency || ev.country || '-',
        date: ev.date || ev.time || ev.datetime || new Date().toISOString(),
        impact: finalImpact,
        previous: ev.previous || '-',
        forecast: ev.forecast || '-',
        actual: ev.actual || null
      };
    });

    return NextResponse.json(formattedEvents);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}