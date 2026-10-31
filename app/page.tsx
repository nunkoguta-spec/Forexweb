'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'calendar' | 'history' | 'performance' | 'calculator'>('calendar');
  const [marketData, setMarketData] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [savedHistory, setSavedHistory] = useState<any[]>([]);
  const [journal, setJournal] = useState<any[]>([]);
  
  // State Analisis
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  
  // State Jurnal & Filter
  const [isSavingTrade, setIsSavingTrade] = useState(false);
  const [filterMonth, setFilterMonth] = useState('');
  const [filterImpact, setFilterImpact] = useState<'all' | 'High' | 'Medium'>('all');
  const [currentTime, setCurrentTime] = useState('');
  const [dateFilter, setDateFilter] = useState<'yesterday' | 'today' | 'tomorrow'>('today');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // State Kalkulator Risiko
  const [calcBalance, setCalcBalance] = useState<number | ''>(10000);
  const [calcRisk, setCalcRisk] = useState<number | ''>(1);
  const [calcSl, setCalcSl] = useState<number | ''>(20);

  // State Countdown & WhatsApp
  const [nextHighImpact, setNextHighImpact] = useState<any>(null);
  const [countdown, setCountdown] = useState<string>('');
  const [waPhone, setWaPhone] = useState('');
  const [waApiKey, setWaApiKey] = useState('');
  const [isSendingWa, setIsSendingWa] = useState(false);

  // Ref untuk TradingView Chart
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // --- FUNGSI FORMAT WAKTU (YANG HILANG TADI) ---
  function formatTimeWIB(dateString: string) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }) + " WIB";
  }

  function formatDateWIB(dateString: string) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short' });
  }

  // --- EFEK LIVE POLLING & CLOCK & COUNTDOWN ---
  useEffect(() => {
    setFilterMonth(new Date().toISOString().slice(0, 7));
    
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false }) + ' WIB');
      
      // Logika Countdown
      if (nextHighImpact) {
        const now = new Date().getTime();
        const eventTime = new Date(nextHighImpact.date).getTime();
        const diff = eventTime - now;

        if (diff > 0) {
          const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const s = Math.floor((diff % (1000 * 60)) / 1000);
          setCountdown(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
        } else {
          setCountdown('Rilis!');
        }
      }
    }, 1000);

    const syncData = async () => {
      try { await fetch('/api/sync'); fetchHistory(); fetchMarketData(); } catch (err) {}
    };

    fetchNews(); fetchMarketData(); fetchJournal(); fetchHistory(); syncData();

    const interval = setInterval(() => { fetchNews(); syncData(); }, 300000); 

    return () => { clearInterval(interval); clearInterval(timer); };
  }, [nextHighImpact]);

  // --- SETUP TRADINGVIEW CHART ---
  useEffect(() => {
    if (typeof window !== 'undefined' && chartContainerRef.current && !chartContainerRef.current.hasChildNodes()) {
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      script.onload = () => {
        new (window as any).TradingView.widget({
          autosize: true,
          symbol: "OANDA:XAUUSD",
          interval: "15",
          timezone: "Asia/Jakarta",
          theme: "dark",
          style: "1",
          locale: "id",
          toolbar_bg: "#0a0a0a",
          enable_publishing: false,
          hide_top_toolbar: false,
          save_image: false,
          container_id: chartContainerRef.current?.id,
        });
      };
      chartContainerRef.current.appendChild(script);
    }
  }, []);

  // --- FUNGSI FETCH DATA ---
  async function fetchNews() {
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/news?t=${new Date().getTime()}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setEvents(data);
        const now = new Date();
        const upcomingHigh = data
          .filter(e => e.impact === 'High' && new Date(e.date) > now)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
        setNextHighImpact(upcomingHigh || null);
      } else {
        setErrorMessage(data.error || "Format data salah");
        setEvents([]);
      }
    } catch (err) { setErrorMessage("Koneksi terputus."); setEvents([]); }
  }

  async function fetchMarketData() {
    try { const res = await fetch('/api/market'); setMarketData(await res.json()); } catch (err) {}
  }
  async function fetchJournal() {
    const { data, error } = await supabase.from('trade_journal').select('*').order('closed_at', { ascending: false });
    if (!error && data) setJournal(data);
  }
  async function fetchHistory() {
    const { data, error } = await supabase.from('news_history').select('*').order('release_date', { ascending: false });
    if (!error && data) setSavedHistory(data);
  }

  // --- FUNGSI AKSI ---
  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault(); setIsAnalyzing(true); setAnalysis(null);
    const form = e.target as HTMLFormElement;
    const pair = (form.elements.namedItem('pair') as HTMLSelectElement).value;
    let price = marketData?.[pair]?.price || "Unknown";

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: JSON.stringify({ event: selectedEvent, marketContext: { pair, current_price: price, trend: "Unknown" } }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAnalysis({ ...data, pair, current_price: price });
    } catch (err: any) { alert('Gagal: ' + err.message); }
    setIsAnalyzing(false);
  }

  async function saveTradeToJournal(result: 'win' | 'loss') {
    if (!analysis) return; setIsSavingTrade(true);
    let pips = result === 'win' ? 20 : -15; 
    const { error } = await supabase.from('trade_journal').insert([{
      pair: analysis.pair, direction: analysis.direction, result: result, pips: pips, notes: `Berita: ${selectedEvent.title}`
    }]);
    if (error) alert("Gagal simpan: " + error.message);
    else { fetchJournal(); setAnalysis(null); setSelectedEvent(null); }
    setIsSavingTrade(false);
  }

  async function testWhatsApp() {
    if (!waPhone || !waApiKey) return alert('Masukkan Nomor dan API Key CallMeBot!');
    setIsSendingWa(true);
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        body: JSON.stringify({ phone: waPhone, apikey: waApiKey, message: "Test Notifikasi Forex Intel: Sistem siap!" }),
      });
      if (res.ok) alert('Pesan WhatsApp berhasil dikirim!');
      else alert('Gagal. Pastikan nomor dan API Key benar.');
    } catch { alert('Error jaringan'); }
    setIsSendingWa(false);
  }

  // --- LOGIKA DATA ---
  const today = new Date(); today.setHours(0, 0, 0, 0); 
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1); 
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1); 

  const filteredByDate = events.filter(ev => {
    const evDate = new Date(ev.date);
    if (dateFilter === 'today') return evDate >= today && evDate < tomorrow;
    if (dateFilter === 'tomorrow') return evDate >= tomorrow;
    if (dateFilter === 'yesterday') return evDate >= yesterday && evDate < today;
    return true;
  });

  const importantEvents = filteredByDate.filter(e => {
    if (filterImpact === 'High') return e.impact === 'High';
    if (filterImpact === 'Medium') return e.impact === 'Medium';
    return e.impact === 'High' || e.impact === 'Medium';
  });

  const pastEvents = events.filter(e => new Date(e.date) < today).reverse(); 

  const filteredJournal = filterMonth ? journal.filter(t => t.closed_at.startsWith(filterMonth)) : journal;
  const totalTrades = filteredJournal.length;
  const wins = filteredJournal.filter(t => t.result === 'win').length;
  const losses = filteredJournal.filter(t => t.result === 'loss').length;
  const winRate = totalTrades > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : "0.0";
  const totalPips = filteredJournal.reduce((acc, curr) => acc + (Number(curr.pips) || 0), 0);

  const riskAmountUSD = (Number(calcBalance) * Number(calcRisk)) / 100;
  const lotSizeStandard = riskAmountUSD / (Number(calcSl) * 10);

  return (
    <div className="min-h-screen flex flex-col bg-[#050505] font-sans">
      
      {/* HEADER - LUXURY STYLE */}
      <header className="border-b border-[#D4AF37]/20 bg-[#0a0a0a]/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-[1500px] mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full border border-[#D4AF37] flex items-center justify-center font-serif text-xl text-[#D4AF37]">F</div>
              <span className="text-xl font-serif text-white tracking-widest uppercase">Forex Intel</span>
            </div>
            
            <nav className="hidden lg:flex gap-2">
              {[
                { id: 'calendar', label: 'Terminal' },
                { id: 'history', label: 'Arsip' },
                { id: 'performance', label: 'Jurnal' },
                { id: 'calculator', label: 'Kalkulator' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-5 py-2 rounded-full text-sm font-medium tracking-wide transition-all ${
                    activeTab === tab.id 
                      ? 'bg-[#D4AF37] text-black shadow-[0_0_15px_rgba(212,175,55,0.4)]' 
                      : 'text-gray-400 hover:text-[#D4AF37]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden sm:flex flex-col items-end border-r border-white/10 pr-6">
              <span className="text-[10px] text-gray-500 uppercase tracking-widest">Local Time (WIB)</span>
              <span className="text-sm font-mono text-[#D4AF37]">{currentTime}</span>
            </div>
            
            <div className="flex gap-6">
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-gray-500 uppercase tracking-widest">XAU/USD</span>
                <strong className="text-lg font-mono text-white">{marketData?.['XAU/USD']?.price || '...'}</strong>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-gray-500 uppercase tracking-widest">EUR/USD</span>
                <strong className="text-lg font-mono text-white">{marketData?.['EUR/USD']?.price || '...'}</strong>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* COUNTDOWN BANNER */}
      {nextHighImpact && (
        <div className="bg-gradient-to-r from-red-900/40 via-[#0a0a0a] to-[#0a0a0a] border-b border-red-900/30">
          <div className="max-w-[1500px] mx-auto px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="animate-pulse w-2 h-2 rounded-full bg-red-500"></span>
              <span className="text-sm text-gray-300">Next High Impact: <strong className="text-white">{nextHighImpact.title}</strong> ({nextHighImpact.country})</span>
            </div>
            <div className="font-mono text-xl text-red-400 font-bold tracking-widest">
              {countdown}
            </div>
          </div>
        </div>
      )}

      {/* KONTEN UTAMA */}
      <main className="flex-1 max-w-[1500px] w-full mx-auto px-6 py-8">
        
        {errorMessage && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-500/30 rounded-xl text-red-400 text-sm">
            {errorMessage}
          </div>
        )}

        {/* TAB 1: TERMINAL */}
        {activeTab === 'calendar' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 animate-in fade-in duration-500">
            
            <div className="xl:col-span-8 flex flex-col gap-8">
              
              {/* CHART SECTION */}
              <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden shadow-2xl relative">
                <div className="absolute top-4 left-6 z-10">
                  <h2 className="text-lg font-serif text-white">XAU/USD Live Chart</h2>
                  <p className="text-xs text-gray-500">Sumber: TradingView</p>
                </div>
                <div id="tradingview_chart" ref={chartContainerRef} className="w-full h-[400px]" />
              </div>

              {/* JADWAL SECTION */}
              <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
                <div className="p-6 border-b border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h2 className="text-xl font-serif text-white">Economic Calendar</h2>
                    <p className="text-xs text-gray-500 mt-1">High & Medium Impact Only</p>
                  </div>
                  
                  <div className="flex items-center gap-2 bg-[#111] p-1 rounded-lg border border-white/5">
                    <button onClick={() => setDateFilter('yesterday')} className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${dateFilter === 'yesterday' ? 'bg-[#D4AF37] text-black' : 'text-gray-400 hover:text-white'}`}>Yesterday</button>
                    <button onClick={() => setDateFilter('today')} className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${dateFilter === 'today' ? 'bg-[#D4AF37] text-black' : 'text-gray-400 hover:text-white'}`}>Today</button>
                    <button onClick={() => setDateFilter('tomorrow')} className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${dateFilter === 'tomorrow' ? 'bg-[#D4AF37] text-black' : 'text-gray-400 hover:text-white'}`}>Tomorrow</button>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[500px] custom-scrollbar">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-[#111] text-gray-500 text-xs uppercase tracking-widest sticky top-0 z-10 border-b border-white/5">
                      <tr>
                        <th className="px-6 py-4 font-normal">Time (WIB)</th>
                        <th className="px-6 py-4 font-normal">Currency</th>
                        <th className="px-6 py-4 font-normal">Event</th>
                        <th className="px-6 py-4 font-normal text-center">Act</th>
                        <th className="px-6 py-4 font-normal text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {importantEvents.length === 0 && (
                        <tr><td colSpan={5} className="text-center py-12 text-gray-600">No upcoming events.</td></tr>
                      )}
                      {importantEvents.map((ev, i) => (
                        <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="px-6 py-4">
                            <div className="text-white font-mono">{formatTimeWIB(ev.date)}</div>
                            <div className="text-[10px] text-gray-500 uppercase">{formatDateWIB(ev.date)}</div>
                          </td>
                          <td className="px-6 py-4 font-bold text-gray-300">{ev.country}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <span className={`w-1.5 h-1.5 rounded-full ${ev.impact === 'High' ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]' : 'bg-amber-500'}`}></span>
                              <span className="text-gray-200">{ev.title}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center font-mono text-gray-400">{ev.actual || '-'}</td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={() => { setSelectedEvent(ev); setAnalysis(null); }} 
                              className="opacity-0 group-hover:opacity-100 border border-[#D4AF37]/50 text-[#D4AF37] hover:bg-[#D4AF37] hover:text-black px-4 py-1.5 rounded-full text-xs font-medium transition-all"
                            >
                              Analyze
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* KANAN: PANEL AI */}
            <div className="xl:col-span-4 h-fit sticky top-28">
              <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(212,175,55,0.05)]">
                <div className="p-6 border-b border-white/5">
                  <h2 className="text-xl font-serif text-white">AI Analysis</h2>
                  <p className="text-xs text-gray-500 mt-1">DeepSeek Intelligence</p>
                </div>
                
                <div className="p-6">
                  {analysis ? (
                    <div className="space-y-6 animate-in fade-in duration-300">
                      <div className={`p-6 rounded-xl border flex flex-col items-center justify-center text-center ${
                        analysis.direction === 'buy' ? 'bg-green-500/5 border-green-500/20' : 
                        analysis.direction === 'sell' ? 'bg-red-500/5 border-red-500/20' : 
                        'bg-gray-800/50 border-white/10'
                      }`}>
                        <p className="text-xs text-gray-400 mb-1 font-mono">{analysis.pair} - {analysis.current_price}</p>
                        <p className={`font-serif text-4xl tracking-widest uppercase ${
                          analysis.direction === 'buy' ? 'text-green-400' : 
                          analysis.direction === 'sell' ? 'text-red-400' : 'text-gray-300'
                        }`}>{analysis.direction}</p>
                      </div>
                      
                      <div>
                        <h3 className="text-xs text-[#D4AF37] uppercase tracking-widest mb-2">Fundamental Logic</h3>
                        <p className="text-sm text-gray-300 leading-relaxed font-light">{analysis.fundamental_reason}</p>
                      </div>
                      
                      <div className="pt-6 border-t border-white/5">
                        <p className="text-xs text-gray-500 uppercase tracking-widest mb-3 text-center">Record Result</p>
                        <div className="flex gap-3">
                          <button onClick={() => saveTradeToJournal('win')} disabled={isSavingTrade} className="flex-1 border border-green-500/30 text-green-400 hover:bg-green-500 hover:text-black py-2.5 rounded-lg text-sm font-bold transition-all">WIN</button>
                          <button onClick={() => saveTradeToJournal('loss')} disabled={isSavingTrade} className="flex-1 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-black py-2.5 rounded-lg text-sm font-bold transition-all">LOSS</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-20 opacity-30">
                      <p className="text-sm font-serif italic text-gray-400">Select an event to<br/>generate intelligence.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ARSIP DATA */}
        {activeTab === 'history' && (
          <div className="animate-in fade-in duration-500">
            <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-white/5">
                <h2 className="text-xl font-serif text-white">Past Events</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-[#111] text-gray-500 text-xs uppercase tracking-widest">
                    <tr>
                      <th className="px-6 py-4 font-normal">Date</th>
                      <th className="px-6 py-4 font-normal">Currency</th>
                      <th className="px-6 py-4 font-normal">Event</th>
                      <th className="px-6 py-4 font-normal text-center">Actual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {pastEvents.map((ev, i) => (
                      <tr key={i} className="hover:bg-white/[0.02]">
                        <td className="px-6 py-4 text-gray-400 font-mono text-xs">{formatDateWIB(ev.date)} - {formatTimeWIB(ev.date)}</td>
                        <td className="px-6 py-4 font-bold text-gray-300">{ev.country}</td>
                        <td className="px-6 py-4 text-gray-200">{ev.title}</td>
                        <td className="px-6 py-4 text-center font-bold font-mono text-[#D4AF37]">{ev.actual || 'Pending'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: JURNAL & PERFORMA */}
        {activeTab === 'performance' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                { label: 'Total Trades', val: totalTrades, color: 'text-white' },
                { label: 'Win Rate', val: `${winRate}%`, color: Number(winRate) >= 50 ? 'text-[#D4AF37]' : 'text-red-400' },
                { label: 'Net Pips', val: `${totalPips > 0 ? '+' : ''}${totalPips}`, color: totalPips >= 0 ? 'text-[#D4AF37]' : 'text-red-400' },
                { label: 'W / L', val: `${wins} / ${losses}`, color: 'text-white' },
              ].map((stat, idx) => (
                <div key={idx} className="bg-[#0a0a0a] p-6 rounded-2xl border border-white/5 shadow-xl">
                  <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">{stat.label}</p>
                  <p className={`text-3xl font-serif ${stat.color}`}>{stat.val}</p>
                </div>
              ))}
            </div>

            <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-white/5 flex justify-between items-center">
                <h2 className="text-xl font-serif text-white">Trade History</h2>
                <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="bg-[#111] text-gray-300 text-sm px-4 py-2 rounded-lg border border-white/10 outline-none focus:border-[#D4AF37]" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-[#111] text-gray-500 text-xs uppercase tracking-widest">
                    <tr>
                      <th className="px-6 py-4 font-normal">Date</th>
                      <th className="px-6 py-4 font-normal">Pair</th>
                      <th className="px-6 py-4 font-normal">Direction</th>
                      <th className="px-6 py-4 font-normal">Result</th>
                      <th className="px-6 py-4 font-normal text-right">Pips</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredJournal.map((trade, i) => (
                      <tr key={i} className="hover:bg-white/[0.02]">
                        <td className="px-6 py-4 text-gray-400 font-mono text-xs">{new Date(trade.closed_at).toLocaleDateString('id-ID')}</td>
                        <td className="px-6 py-4 font-bold text-white">{trade.pair}</td>
                        <td className="px-6 py-4 text-gray-400">{trade.direction.toUpperCase()}</td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${trade.result === 'win' ? 'bg-[#D4AF37]/10 text-[#D4AF37]' : 'bg-red-500/10 text-red-400'}`}>{trade.result.toUpperCase()}</span>
                        </td>
                        <td className={`px-6 py-4 text-right font-mono ${trade.pips > 0 ? 'text-[#D4AF37]' : 'text-red-400'}`}>{trade.pips > 0 ? '+' : ''}{trade.pips}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: KALKULATOR & WHATSAPP */}
        {activeTab === 'calculator' && (
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in duration-500">
            
            {/* Kalkulator */}
            <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-white/5 bg-gradient-to-r from-[#D4AF37]/10 to-transparent">
                <h2 className="text-xl font-serif text-white">Risk Calculator</h2>
              </div>
              <div className="p-8 space-y-6">
                <div>
                  <label className="block text-xs text-gray-500 uppercase tracking-widest mb-2">Account Balance (USD)</label>
                  <input type="number" value={calcBalance} onChange={(e) => setCalcBalance(Number(e.target.value))} className="w-full bg-[#111] p-4 rounded-xl border border-white/10 text-white font-mono text-xl outline-none focus:border-[#D4AF37]" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 uppercase tracking-widest mb-2">Risk %</label>
                    <input type="number" value={calcRisk} onChange={(e) => setCalcRisk(Number(e.target.value))} className="w-full bg-[#111] p-4 rounded-xl border border-white/10 text-white font-mono text-xl outline-none focus:border-[#D4AF37]" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 uppercase tracking-widest mb-2">Stop Loss (Pips)</label>
                    <input type="number" value={calcSl} onChange={(e) => setCalcSl(Number(e.target.value))} className="w-full bg-[#111] p-4 rounded-xl border border-white/10 text-white font-mono text-xl outline-none focus:border-[#D4AF37]" />
                  </div>
                </div>
                <div className="pt-6 border-t border-white/5 grid grid-cols-2 gap-4">
                  <div className="bg-[#111] p-4 rounded-xl text-center border border-white/5">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Risk Amount</p>
                    <p className="text-2xl font-mono text-red-400">${riskAmountUSD.toFixed(2)}</p>
                  </div>
                  <div className="bg-[#D4AF37]/10 p-4 rounded-xl text-center border border-[#D4AF37]/30">
                    <p className="text-[10px] text-[#D4AF37] uppercase tracking-widest mb-1">Standard Lot</p>
                    <p className="text-2xl font-mono text-[#D4AF37]">{lotSizeStandard.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* WhatsApp Setup */}
            <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl shadow-2xl overflow-hidden h-fit">
              <div className="p-6 border-b border-white/5 bg-gradient-to-r from-green-600/10 to-transparent">
                <h2 className="text-xl font-serif text-white">WhatsApp Notifications</h2>
                <p className="text-xs text-gray-500 mt-1">Powered by CallMeBot</p>
              </div>
              <div className="p-8 space-y-5">
                <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-xl mb-4">
                  <p className="text-xs text-green-400 leading-relaxed">
                    <strong>Cara Daftar:</strong> Simpan nomor <strong>+34 644 51 95 23</strong>. Kirim pesan WhatsApp ke nomor tersebut: <em>"I allow callmebot to send me messages"</em>. Anda akan dibalas dengan API Key.
                  </p>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 uppercase tracking-widest mb-2">Nomor WhatsApp (Gunakan kode negara, cth: 62812...)</label>
                  <input type="text" value={waPhone} onChange={(e) => setWaPhone(e.target.value)} className="w-full bg-[#111] p-4 rounded-xl border border-white/10 text-white font-mono outline-none focus:border-green-500" placeholder="628123456789" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 uppercase tracking-widest mb-2">CallMeBot API Key</label>
                  <input type="text" value={waApiKey} onChange={(e) => setWaApiKey(e.target.value)} className="w-full bg-[#111] p-4 rounded-xl border border-white/10 text-white font-mono outline-none focus:border-green-500" placeholder="123456" />
                </div>
                <button onClick={testWhatsApp} disabled={isSendingWa} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-green-600/20">
                  {isSendingWa ? 'Mengirim...' : 'Tes Kirim WhatsApp'}
                </button>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* MODAL ANALISIS */}
      {selectedEvent && !analysis && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
          <div className="bg-[#0a0a0a] p-8 rounded-2xl w-full max-w-md border border-white/10 shadow-[0_0_50px_rgba(212,175,55,0.1)] animate-in zoom-in-95">
            <div className="mb-8">
              <h3 className="text-2xl font-serif text-white mb-2">Run Analysis</h3>
              <p className="text-sm text-gray-400">{selectedEvent.title} <span className="text-[#D4AF37]">({selectedEvent.country})</span></p>
            </div>
            
            <form onSubmit={handleAnalyze} className="space-y-6">
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-widest mb-2">Target Pair</label>
                <select name="pair" className="w-full bg-[#111] p-4 rounded-xl border border-white/10 text-white outline-none focus:border-[#D4AF37]">
                  <option value="EUR/USD">EUR/USD</option>
                  <option value="XAU/USD">XAU/USD (Gold)</option>
                  <option value="USD/JPY">USD/JPY</option>
                </select>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setSelectedEvent(null)} className="flex-1 px-4 py-3 rounded-xl text-gray-400 hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={isAnalyzing} className="flex-[2] bg-[#D4AF37] hover:bg-[#c4a030] text-black px-4 py-3 rounded-xl font-bold transition-all shadow-lg shadow-[#D4AF37]/20 disabled:opacity-50">
                  {isAnalyzing ? 'Processing...' : 'Generate Signal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}