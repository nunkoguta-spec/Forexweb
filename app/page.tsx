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

  // State Countdown
  const [nextHighImpact, setNextHighImpact] = useState<any>(null);
  const [countdown, setCountdown] = useState<string>('');

  const chartContainerRef = useRef<HTMLDivElement>(null);

  function formatTimeWIB(dateString: string) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }) + " WIB";
  }

  function formatDateWIB(dateString: string) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short' });
  }

  useEffect(() => {
    setFilterMonth(new Date().toISOString().slice(0, 7));
    
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false }) + ' WIB');
      
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
      try { await fetch('/api/sync'); fetchMarketData(); } catch (err) {}
    };

    fetchNews(); fetchMarketData(); fetchJournal(); syncData();

    const interval = setInterval(() => { fetchNews(); syncData(); }, 300000); 

    return () => { clearInterval(interval); clearInterval(timer); };
  }, [nextHighImpact]);

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
          toolbar_bg: "#050505",
          enable_publishing: false,
          hide_top_toolbar: true, // Disembunyikan agar lebih bersih & eksklusif
          hide_legend: true,
          save_image: false,
          container_id: chartContainerRef.current?.id,
        });
      };
      chartContainerRef.current.appendChild(script);
    }
  }, []);

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
    <div className="min-h-screen flex flex-col bg-[#050505] font-sans selection:bg-[#D4AF37]/30">
      
      {/* HEADER - EXCLUSIVE STYLE */}
      <header className="border-b border-white/5 bg-[#050505]/80 backdrop-blur-2xl sticky top-0 z-40">
        <div className="max-w-[1500px] mx-auto px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-12">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full border border-[#D4AF37]/50 flex items-center justify-center font-serif text-sm text-[#D4AF37] shadow-[0_0_15px_rgba(212,175,55,0.2)]">F</div>
              <span className="text-lg font-serif text-white tracking-[0.2em] uppercase">Forex Intel</span>
            </div>
            
            <nav className="hidden lg:flex gap-1">
              {[
                { id: 'calendar', label: 'Terminal' },
                { id: 'history', label: 'Arsip' },
                { id: 'performance', label: 'Jurnal' },
                { id: 'calculator', label: 'Kalkulator' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-5 py-2 rounded-full text-xs font-medium tracking-wider uppercase transition-all duration-300 ${
                    activeTab === tab.id 
                      ? 'bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30' 
                      : 'text-gray-500 hover:text-white border border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-8">
            <div className="hidden sm:flex flex-col items-end border-r border-white/10 pr-8">
              <span className="text-[10px] text-gray-500 uppercase tracking-[0.2em] mb-1">Local Time</span>
              <span className="text-sm font-mono text-white">{currentTime}</span>
            </div>
            
            <div className="flex gap-8">
              <div className="flex flex-col items-end group cursor-default">
                <span className="text-[10px] text-gray-500 uppercase tracking-[0.2em] mb-1 group-hover:text-[#D4AF37] transition-colors">Gold</span>
                <strong className="text-lg font-mono text-white tracking-tight">{marketData?.['XAU/USD']?.price || '...'}</strong>
              </div>
              <div className="flex flex-col items-end group cursor-default">
                <span className="text-[10px] text-gray-500 uppercase tracking-[0.2em] mb-1 group-hover:text-[#D4AF37] transition-colors">Euro</span>
                <strong className="text-lg font-mono text-white tracking-tight">{marketData?.['EUR/USD']?.price || '...'}</strong>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* COUNTDOWN BANNER */}
      {nextHighImpact && (
        <div className="bg-[#D4AF37]/5 border-b border-[#D4AF37]/10">
          <div className="max-w-[1500px] mx-auto px-8 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="animate-pulse w-1.5 h-1.5 rounded-full bg-[#D4AF37]"></span>
              <span className="text-xs text-gray-400 tracking-wide uppercase">Next Catalyst: <strong className="text-white">{nextHighImpact.title}</strong></span>
            </div>
            <div className="font-mono text-sm text-[#D4AF37] tracking-[0.2em]">
              T-MINUS {countdown}
            </div>
          </div>
        </div>
      )}

      {/* KONTEN UTAMA */}
      <main className="flex-1 max-w-[1500px] w-full mx-auto px-8 py-10">
        
        {errorMessage && (
          <div className="mb-8 p-4 bg-red-900/10 border border-red-500/20 rounded-xl text-red-400 text-sm tracking-wide">
            {errorMessage}
          </div>
        )}

        {/* TAB 1: TERMINAL */}
        {activeTab === 'calendar' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-10 animate-in fade-in duration-700">
            
            <div className="xl:col-span-8 flex flex-col gap-10">
              
              {/* CHART SECTION */}
              <div className="bg-[#0a0a0a] border border-white/5 rounded-3xl overflow-hidden shadow-2xl relative">
                <div className="absolute top-6 left-8 z-10 pointer-events-none">
                  <h2 className="text-sm font-serif text-white tracking-widest uppercase">Gold Spot / U.S. Dollar</h2>
                  <p className="text-[10px] text-gray-500 tracking-widest mt-1">Institutional Feed</p>
                </div>
                <div id="tradingview_chart" ref={chartContainerRef} className="w-full h-[450px]" />
              </div>

              {/* JADWAL SECTION */}
              <div className="bg-[#0a0a0a] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
                <div className="p-8 border-b border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                  <div>
                    <h2 className="text-lg font-serif text-white tracking-widest uppercase">Economic Catalyst</h2>
                    <p className="text-xs text-gray-500 tracking-wider mt-1">High & Medium Impact Only</p>
                  </div>
                  
                  <div className="flex items-center gap-1 bg-[#050505] p-1 rounded-xl border border-white/5">
                    <button onClick={() => setDateFilter('yesterday')} className={`px-5 py-2 text-[10px] uppercase tracking-widest font-medium rounded-lg transition-all ${dateFilter === 'yesterday' ? 'bg-[#D4AF37]/20 text-[#D4AF37]' : 'text-gray-500 hover:text-white'}`}>Yesterday</button>
                    <button onClick={() => setDateFilter('today')} className={`px-5 py-2 text-[10px] uppercase tracking-widest font-medium rounded-lg transition-all ${dateFilter === 'today' ? 'bg-[#D4AF37]/20 text-[#D4AF37]' : 'text-gray-500 hover:text-white'}`}>Today</button>
                    <button onClick={() => setDateFilter('tomorrow')} className={`px-5 py-2 text-[10px] uppercase tracking-widest font-medium rounded-lg transition-all ${dateFilter === 'tomorrow' ? 'bg-[#D4AF37]/20 text-[#D4AF37]' : 'text-gray-500 hover:text-white'}`}>Tomorrow</button>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[500px] custom-scrollbar">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-[#050505] text-gray-500 text-[10px] uppercase tracking-[0.2em] sticky top-0 z-10 border-b border-white/5">
                      <tr>
                        <th className="px-8 py-5 font-normal">Time (WIB)</th>
                        <th className="px-8 py-5 font-normal">Currency</th>
                        <th className="px-8 py-5 font-normal">Event</th>
                        <th className="px-8 py-5 font-normal text-center">Act</th>
                        <th className="px-8 py-5 font-normal text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {importantEvents.length === 0 && (
                        <tr><td colSpan={5} className="text-center py-16 text-gray-600 tracking-wide">No upcoming catalysts.</td></tr>
                      )}
                      {importantEvents.map((ev, i) => (
                        <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="px-8 py-5">
                            <div className="text-white font-mono text-sm">{formatTimeWIB(ev.date)}</div>
                            <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">{formatDateWIB(ev.date)}</div>
                          </td>
                          <td className="px-8 py-5 font-bold text-gray-400 text-xs tracking-wider">{ev.country}</td>
                          <td className="px-8 py-5">
                            <div className="flex items-center gap-3">
                              <span className={`w-1.5 h-1.5 rounded-full ${ev.impact === 'High' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-amber-500'}`}></span>
                              <span className="text-gray-200 text-sm">{ev.title}</span>
                            </div>
                          </td>
                          <td className="px-8 py-5 text-center font-mono text-gray-400 text-sm">{ev.actual || '-'}</td>
                          <td className="px-8 py-5 text-right">
                            <button 
                              onClick={() => { setSelectedEvent(ev); setAnalysis(null); }} 
                              className="opacity-0 group-hover:opacity-100 border border-white/10 text-white hover:bg-white hover:text-black px-5 py-2 rounded-lg text-xs tracking-wider font-medium transition-all duration-300"
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
            <div className="xl:col-span-4 h-fit sticky top-32">
              <div className="bg-[#0a0a0a] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
                <div className="p-8 border-b border-white/5 bg-gradient-to-b from-[#D4AF37]/5 to-transparent">
                  <h2 className="text-lg font-serif text-white tracking-widest uppercase">DeepSeek Intel</h2>
                  <p className="text-[10px] text-gray-500 tracking-widest mt-1">Private Analysis</p>
                </div>
                
                <div className="p-8">
                  {analysis ? (
                    <div className="space-y-8 animate-in fade-in duration-500">
                      <div className={`p-8 rounded-2xl border flex flex-col items-center justify-center text-center ${
                        analysis.direction === 'buy' ? 'bg-green-500/5 border-green-500/10' : 
                        analysis.direction === 'sell' ? 'bg-red-500/5 border-red-500/10' : 
                        'bg-gray-800/30 border-white/5'
                      }`}>
                        <p className="text-[10px] text-gray-500 tracking-widest mb-2 uppercase">{analysis.pair} - {analysis.current_price}</p>
                        <p className={`font-serif text-4xl tracking-[0.2em] uppercase ${
                          analysis.direction === 'buy' ? 'text-green-400' : 
                          analysis.direction === 'sell' ? 'text-red-400' : 'text-gray-300'
                        }`}>{analysis.direction}</p>
                      </div>
                      
                      <div>
                        <h3 className="text-[10px] text-[#D4AF37] uppercase tracking-[0.2em] mb-3">Fundamental Logic</h3>
                        <p className="text-sm text-gray-400 leading-relaxed font-light">{analysis.fundamental_reason}</p>
                      </div>
                      
                      <div className="pt-8 border-t border-white/5">
                        <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em] mb-4 text-center">Record Execution</p>
                        <div className="flex gap-4">
                          <button onClick={() => saveTradeToJournal('win')} disabled={isSavingTrade} className="flex-1 border border-green-500/20 text-green-400 hover:bg-green-500 hover:text-black py-3 rounded-xl text-xs font-bold tracking-widest transition-all">WIN</button>
                          <button onClick={() => saveTradeToJournal('loss')} disabled={isSavingTrade} className="flex-1 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-black py-3 rounded-xl text-xs font-bold tracking-widest transition-all">LOSS</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-24 opacity-20">
                      <p className="text-sm font-serif italic text-gray-400 tracking-wider">Select an event to<br/>generate intelligence.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ARSIP DATA */}
        {activeTab === 'history' && (
          <div className="animate-in fade-in duration-700">
            <div className="bg-[#0a0a0a] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
              <div className="p-8 border-b border-white/5">
                <h2 className="text-lg font-serif text-white tracking-widest uppercase">Historical Archive</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-[#050505] text-gray-500 text-[10px] uppercase tracking-[0.2em]">
                    <tr>
                      <th className="px-8 py-5 font-normal">Date</th>
                      <th className="px-8 py-5 font-normal">Currency</th>
                      <th className="px-8 py-5 font-normal">Event</th>
                      <th className="px-8 py-5 font-normal text-center">Actual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {pastEvents.map((ev, i) => (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-8 py-5 text-gray-500 font-mono text-xs">{formatDateWIB(ev.date)} - {formatTimeWIB(ev.date)}</td>
                        <td className="px-8 py-5 font-bold text-gray-400 text-xs tracking-wider">{ev.country}</td>
                        <td className="px-8 py-5 text-gray-300 text-sm">{ev.title}</td>
                        <td className="px-8 py-5 text-center font-bold font-mono text-[#D4AF37] text-sm">{ev.actual || 'Pending'}</td>
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
          <div className="space-y-10 animate-in fade-in duration-700">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                { label: 'Total Trades', val: totalTrades, color: 'text-white' },
                { label: 'Win Rate', val: `${winRate}%`, color: Number(winRate) >= 50 ? 'text-[#D4AF37]' : 'text-red-400' },
                { label: 'Net Pips', val: `${totalPips > 0 ? '+' : ''}${totalPips}`, color: totalPips >= 0 ? 'text-[#D4AF37]' : 'text-red-400' },
                { label: 'W / L', val: `${wins} / ${losses}`, color: 'text-white' },
              ].map((stat, idx) => (
                <div key={idx} className="bg-[#0a0a0a] p-8 rounded-3xl border border-white/5 shadow-2xl">
                  <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em] mb-3">{stat.label}</p>
                  <p className={`text-3xl font-serif tracking-wider ${stat.color}`}>{stat.val}</p>
                </div>
              ))}
            </div>

            <div className="bg-[#0a0a0a] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
              <div className="p-8 border-b border-white/5 flex justify-between items-center">
                <h2 className="text-lg font-serif text-white tracking-widest uppercase">Execution Ledger</h2>
                <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="bg-[#050505] text-gray-300 text-xs px-5 py-3 rounded-xl border border-white/5 outline-none focus:border-[#D4AF37]/50 tracking-wider" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-[#050505] text-gray-500 text-[10px] uppercase tracking-[0.2em]">
                    <tr>
                      <th className="px-8 py-5 font-normal">Date</th>
                      <th className="px-8 py-5 font-normal">Pair</th>
                      <th className="px-8 py-5 font-normal">Direction</th>
                      <th className="px-8 py-5 font-normal">Result</th>
                      <th className="px-8 py-5 font-normal text-right">Pips</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredJournal.map((trade, i) => (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-8 py-5 text-gray-500 font-mono text-xs">{new Date(trade.closed_at).toLocaleDateString('id-ID')}</td>
                        <td className="px-8 py-5 font-bold text-white text-sm tracking-wider">{trade.pair}</td>
                        <td className="px-8 py-5 text-gray-400 text-xs tracking-wider">{trade.direction.toUpperCase()}</td>
                        <td className="px-8 py-5">
                          <span className={`px-4 py-1.5 rounded-full text-[10px] tracking-widest font-bold ${trade.result === 'win' ? 'bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>{trade.result.toUpperCase()}</span>
                        </td>
                        <td className={`px-8 py-5 text-right font-mono text-sm tracking-wider ${trade.pips > 0 ? 'text-[#D4AF37]' : 'text-red-400'}`}>{trade.pips > 0 ? '+' : ''}{trade.pips}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: KALKULATOR */}
        {activeTab === 'calculator' && (
          <div className="max-w-3xl mx-auto animate-in fade-in duration-700">
            <div className="bg-[#0a0a0a] border border-white/5 rounded-3xl shadow-2xl overflow-hidden">
              <div className="p-8 border-b border-white/5 bg-gradient-to-b from-[#D4AF37]/5 to-transparent">
                <h2 className="text-lg font-serif text-white tracking-widest uppercase">Risk Management</h2>
                <p className="text-[10px] text-gray-500 tracking-wider mt-1">Position Sizing Calculator</p>
              </div>
              <div className="p-10 grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="space-y-8">
                  <div>
                    <label className="block text-[10px] text-gray-500 uppercase tracking-[0.2em] mb-3">Account Balance (USD)</label>
                    <input type="number" value={calcBalance} onChange={(e) => setCalcBalance(Number(e.target.value))} className="w-full bg-[#050505] p-4 rounded-xl border border-white/5 text-white font-mono text-xl outline-none focus:border-[#D4AF37]/50 tracking-wider" />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] text-gray-500 uppercase tracking-[0.2em] mb-3">Risk %</label>
                      <input type="number" value={calcRisk} onChange={(e) => setCalcRisk(Number(e.target.value))} className="w-full bg-[#050505] p-4 rounded-xl border border-white/5 text-white font-mono text-xl outline-none focus:border-[#D4AF37]/50 tracking-wider" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 uppercase tracking-[0.2em] mb-3">Stop Loss (Pips)</label>
                      <input type="number" value={calcSl} onChange={(e) => setCalcSl(Number(e.target.value))} className="w-full bg-[#050505] p-4 rounded-xl border border-white/5 text-white font-mono text-xl outline-none focus:border-[#D4AF37]/50 tracking-wider" />
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-600 italic tracking-wider">*Asumsi: 1 Standard Lot = $10 / pip.</p>
                </div>

                <div className="bg-[#050505] rounded-2xl p-8 border border-white/5 flex flex-col justify-center space-y-8">
                  <div className="text-center">
                    <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em] mb-2">Risk Amount</p>
                    <p className="text-3xl font-mono text-red-400 tracking-wider">${riskAmountUSD.toFixed(2)}</p>
                  </div>
                  <div className="h-px w-full bg-white/5"></div>
                  <div className="text-center">
                    <p className="text-[10px] text-[#D4AF37] uppercase tracking-[0.2em] mb-2">Standard Lots</p>
                    <p className="text-5xl font-mono text-[#D4AF37] tracking-widest">{lotSizeStandard.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* MODAL ANALISIS */}
      {selectedEvent && !analysis && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 z-50 animate-in fade-in duration-500">
          <div className="bg-[#0a0a0a] p-10 rounded-3xl w-full max-w-md border border-white/10 shadow-[0_0_100px_rgba(212,175,55,0.05)] animate-in zoom-in-95">
            <div className="mb-10 text-center">
              <h3 className="text-xl font-serif text-white tracking-widest uppercase mb-2">Initiate Analysis</h3>
              <p className="text-xs text-gray-500 tracking-wider">{selectedEvent.title} <span className="text-[#D4AF37]">({selectedEvent.country})</span></p>
            </div>
            
            <form onSubmit={handleAnalyze} className="space-y-8">
              <div>
                <label className="block text-[10px] text-gray-500 uppercase tracking-[0.2em] mb-3 text-center">Select Target Asset</label>
                <select name="pair" className="w-full bg-[#050505] p-4 rounded-xl border border-white/5 text-white text-center font-mono tracking-widest outline-none focus:border-[#D4AF37]/50">
                  <option value="EUR/USD">EUR/USD</option>
                  <option value="XAU/USD">XAU/USD</option>
                  <option value="USD/JPY">USD/JPY</option>
                </select>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setSelectedEvent(null)} className="flex-1 px-4 py-4 rounded-xl text-gray-500 hover:text-white text-xs font-bold tracking-widest transition-colors">CANCEL</button>
                <button type="submit" disabled={isAnalyzing} className="flex-[2] bg-[#D4AF37] hover:bg-[#c4a030] text-black px-4 py-4 rounded-xl text-xs font-bold tracking-widest transition-all disabled:opacity-50">
                  {isAnalyzing ? 'PROCESSING...' : 'GENERATE'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}