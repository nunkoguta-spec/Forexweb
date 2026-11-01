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
  const [selectedPair, setSelectedPair] = useState<string>('XAU/USD');
  
  // State Jurnal & Filter
  const [isSavingTrade, setIsSavingTrade] = useState(false);
  const [filterMonth, setFilterMonth] = useState('');
  const [focusMode, setFocusMode] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [dateFilter, setDateFilter] = useState<'yesterday' | 'today' | 'tomorrow'>('today');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // State Refresh
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  // Fungsi untuk Tombol Refresh
  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      await Promise.all([fetchNews(), fetchMarketData(), fetchJournal()]);
    } catch (err) {
      console.error("Gagal refresh data", err);
    }
    // Beri sedikit jeda agar animasi berputar terlihat
    setTimeout(() => setIsRefreshing(false), 800);
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
          hide_top_toolbar: true,
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
    e.preventDefault(); 
    setIsAnalyzing(true); 
    setAnalysis(null);
    
    const currentPrice = marketData?.[selectedPair]?.price;

    if (!currentPrice || currentPrice === '...') {
       alert("Harga Live tidak tersedia. Pastikan API Key Twelve Data sudah benar.");
       setIsAnalyzing(false);
       return;
    }

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: JSON.stringify({ 
          event: selectedEvent, 
          marketContext: { pair: selectedPair, current_price: currentPrice, trend: "Unknown" } 
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      setAnalysis({ ...data, pair: selectedPair, current_price: currentPrice });
    } catch (err: any) { 
      alert('Gagal: ' + err.message); 
    }
    setIsAnalyzing(false);
  }

  async function saveTradeToJournal(result: 'win' | 'loss') {
    if (!analysis) return; setIsSavingTrade(true);
    let pips = result === 'win' ? 20 : -15; 
    const { error } = await supabase.from('trade_journal').insert([{
      pair: analysis.pair, direction: analysis.direction, result: result, pips: pips, notes: `Sinyal dari: ${selectedEvent.title}`
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
    if (focusMode) return e.impact === 'High';
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
  const highImpactToday = filteredByDate.filter(e => e.impact === 'High').length;

  let rrRatio = "0";
  if (analysis && analysis.direction !== 'no_trade' && analysis.entry_zone && analysis.stop_loss && analysis.take_profit) {
    const parseNum = (str: string) => parseFloat(String(str).split('-')[0].replace(/[^0-9.]/g, ''));
    const entry = parseNum(analysis.entry_zone);
    const sl = parseNum(analysis.stop_loss);
    const tp = parseNum(analysis.take_profit);
    if (!isNaN(entry) && !isNaN(sl) && !isNaN(tp) && entry !== sl) {
      rrRatio = (Math.abs(tp - entry) / Math.abs(entry - sl)).toFixed(1);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#050505] font-sans selection:bg-[#D4AF37]/30 pb-20 lg:pb-10">
      
      {/* HEADER - RESPONSIVE */}
      <header className="border-b border-white/5 bg-[#050505]/90 backdrop-blur-2xl sticky top-0 z-40">
        <div className="max-w-[1500px] mx-auto px-4 lg:px-6 h-16 lg:h-20 flex items-center justify-between">
          <div className="flex items-center gap-6 lg:gap-10">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className="w-7 h-7 lg:w-8 lg:h-8 rounded-full border border-[#D4AF37]/50 flex items-center justify-center font-serif text-xs lg:text-sm text-[#D4AF37]">F</div>
              <span className="text-sm lg:text-lg font-serif text-white tracking-[0.2em] uppercase">Forex Intel</span>
            </div>
            
            {/* NAVIGASI DESKTOP */}
            <nav className="hidden lg:flex gap-1">
              {['calendar', 'history', 'performance', 'calculator'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={`px-5 py-2 rounded-full text-xs font-medium tracking-wider uppercase transition-all ${
                    activeTab === tab 
                      ? 'bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30' 
                      : 'text-gray-500 hover:text-white border border-transparent'
                  }`}
                >
                  {tab === 'calendar' ? 'Terminal' : tab === 'history' ? 'Arsip' : tab === 'performance' ? 'Jurnal' : 'Kalkulator'}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3 lg:gap-6">
            
            {/* TOMBOL REFRESH */}
            <button 
              onClick={handleRefresh} 
              disabled={isRefreshing}
              title="Refresh Data"
              className="w-8 h-8 lg:w-9 lg:h-9 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 transition-all disabled:opacity-50"
            >
              <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#D4AF37]' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            <div className="hidden sm:flex flex-col items-end border-l border-white/10 pl-3 lg:pl-6">
              <span className="text-[9px] lg:text-[10px] text-gray-500 uppercase tracking-[0.2em] mb-0.5 lg:mb-1">Waktu Server</span>
              <span className="text-xs lg:text-sm font-mono text-white">{currentTime}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[9px] lg:text-[10px] text-gray-500 uppercase tracking-[0.2em] mb-0.5 lg:mb-1">Gold</span>
              <strong className="text-sm lg:text-lg font-mono text-[#D4AF37] lg:text-white tracking-tight">{marketData?.['XAU/USD']?.price || '...'}</strong>
            </div>
          </div>
        </div>
      </header>

      {/* DAILY BRIEFING */}
      <div className="bg-[#D4AF37]/5 border-b border-[#D4AF37]/10">
        <div className="max-w-[1500px] mx-auto px-4 lg:px-6 py-2 lg:py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 lg:gap-4">
          <div className="flex items-center gap-2 lg:gap-4 text-[10px] lg:text-xs tracking-wider text-gray-400">
            <span className="bg-[#D4AF37]/20 text-[#D4AF37] px-2 lg:px-3 py-1 rounded-full uppercase font-bold">Briefing</span>
            <span><strong className="text-white">{highImpactToday} High Impact</strong> hari ini.</span>
          </div>
          
          {nextHighImpact && (
            <div className="flex items-center gap-2 lg:gap-3 w-full sm:w-auto justify-between sm:justify-end">
              <span className="text-[10px] lg:text-xs text-gray-400 uppercase tracking-widest hidden sm:block">Next:</span>
              <span className="text-[10px] lg:text-xs text-white font-bold truncate max-w-[150px]">{nextHighImpact.title}</span>
              <div className="font-mono text-xs lg:text-sm text-[#D4AF37] tracking-widest bg-[#D4AF37]/10 px-2 lg:px-3 py-1 rounded-lg">
                T-MINUS {countdown}
              </div>
            </div>
          )}
        </div>
      </div>

      <main className="flex-1 max-w-[1500px] w-full mx-auto px-4 lg:px-6 py-4 lg:py-8">
        {errorMessage && (
          <div className="mb-4 lg:mb-6 p-3 lg:p-4 bg-red-900/10 border border-red-500/20 rounded-xl text-red-400 text-xs lg:text-sm">
            {errorMessage}
          </div>
        )}

        {/* TAB 1: TERMINAL */}
        {activeTab === 'calendar' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 lg:gap-8 animate-in fade-in duration-500">
            
            <div className="xl:col-span-8 flex flex-col gap-6 lg:gap-8">
              {/* CHART */}
              <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden shadow-2xl relative">
                <div className="absolute top-3 lg:top-4 left-4 lg:left-6 z-10 pointer-events-none">
                  <h2 className="text-xs lg:text-sm font-serif text-white tracking-widest uppercase">XAU/USD Live</h2>
                </div>
                <div id="tradingview_chart" ref={chartContainerRef} className="w-full h-[250px] lg:h-[350px]" />
              </div>

              {/* JADWAL & FOCUS MODE */}
              <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
                <div className="p-4 lg:p-5 border-b border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 lg:gap-4">
                  <div>
                    <h2 className="text-sm lg:text-base font-serif text-white tracking-widest uppercase">Economic Catalyst</h2>
                    <div className="flex items-center gap-1.5 lg:gap-2 mt-2">
                      <button onClick={() => setDateFilter('yesterday')} className={`px-2 lg:px-3 py-1 text-[9px] lg:text-[10px] uppercase font-bold rounded ${dateFilter === 'yesterday' ? 'bg-[#D4AF37]/20 text-[#D4AF37]' : 'text-gray-500'}`}>Yesterday</button>
                      <button onClick={() => setDateFilter('today')} className={`px-2 lg:px-3 py-1 text-[9px] lg:text-[10px] uppercase font-bold rounded ${dateFilter === 'today' ? 'bg-[#D4AF37]/20 text-[#D4AF37]' : 'text-gray-500'}`}>Today</button>
                      <button onClick={() => setDateFilter('tomorrow')} className={`px-2 lg:px-3 py-1 text-[9px] lg:text-[10px] uppercase font-bold rounded ${dateFilter === 'tomorrow' ? 'bg-[#D4AF37]/20 text-[#D4AF37]' : 'text-gray-500'}`}>Tomorrow</button>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 lg:gap-3 bg-[#111] px-3 lg:px-4 py-2 rounded-xl border border-white/5 cursor-pointer" onClick={() => setFocusMode(!focusMode)}>
                    <div className={`w-7 lg:w-8 h-3.5 lg:h-4 rounded-full relative transition-colors ${focusMode ? 'bg-[#D4AF37]' : 'bg-gray-700'}`}>
                      <div className={`absolute top-0.5 w-2.5 lg:w-3 h-2.5 lg:h-3 rounded-full bg-white transition-all ${focusMode ? 'left-3.5 lg:left-4.5' : 'left-0.5'}`}></div>
                    </div>
                    <span className="text-[9px] lg:text-[10px] uppercase tracking-widest text-gray-300">High Impact Only</span>
                  </div>
                </div>

                {/* TAMPILAN DESKTOP (TABEL) */}
                <div className="hidden md:block overflow-x-auto max-h-[500px] custom-scrollbar">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-[#050505] text-gray-500 text-[10px] uppercase tracking-[0.2em] sticky top-0 z-10 border-b border-white/5">
                      <tr>
                        <th className="px-6 py-4 font-normal">Time</th>
                        <th className="px-6 py-4 font-normal">Currency</th>
                        <th className="px-6 py-4 font-normal">Event</th>
                        <th className="px-6 py-4 font-normal text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {importantEvents.length === 0 && (
                        <tr><td colSpan={4} className="text-center py-12 text-gray-600">No events found.</td></tr>
                      )}
                      {importantEvents.map((ev, i) => (
                        <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="px-6 py-4">
                            <div className="text-white font-mono text-sm">{formatTimeWIB(ev.date)}</div>
                            <div className="text-[10px] text-gray-500 uppercase mt-0.5">{formatDateWIB(ev.date)}</div>
                          </td>
                          <td className="px-6 py-4 font-bold text-gray-400 text-xs">{ev.country}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <span className={`w-1.5 h-1.5 rounded-full ${ev.impact === 'High' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-amber-500'}`}></span>
                              <span className="text-gray-200 text-sm">{ev.title}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={() => { setSelectedEvent(ev); setAnalysis(null); setSelectedPair(ev.country === 'USD' ? 'XAU/USD' : 'EUR/USD'); }} 
                              className="opacity-0 group-hover:opacity-100 border border-white/10 text-white hover:bg-[#D4AF37] hover:border-[#D4AF37] hover:text-black px-4 py-1.5 rounded-lg text-xs tracking-wider transition-all"
                            >
                              Analyze
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* TAMPILAN MOBILE (KARTU) */}
                <div className="md:hidden flex flex-col divide-y divide-white/5 max-h-[500px] overflow-y-auto custom-scrollbar">
                   {importantEvents.length === 0 && (
                      <div className="text-center py-8 text-gray-600 text-sm">Tidak ada berita.</div>
                   )}
                   {importantEvents.map((ev, i) => (
                      <div key={i} className="p-4 flex items-center justify-between hover:bg-white/[0.02]">
                         <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                               <span className={`w-1.5 h-1.5 rounded-full ${ev.impact === 'High' ? 'bg-red-500' : 'bg-amber-500'}`}></span>
                               <span className="text-white text-xs font-bold">{ev.country}</span>
                               <span className="text-gray-500 text-[10px] font-mono">{formatTimeWIB(ev.date)}</span>
                            </div>
                            <span className="text-gray-300 text-sm leading-tight pr-4">{ev.title}</span>
                         </div>
                         <button 
                            onClick={() => { setSelectedEvent(ev); setAnalysis(null); setSelectedPair(ev.country === 'USD' ? 'XAU/USD' : 'EUR/USD'); }} 
                            className="border border-white/10 text-[#D4AF37] px-3 py-1.5 rounded-lg text-[10px] tracking-wider uppercase shrink-0"
                         >
                            Analyze
                         </button>
                      </div>
                   ))}
                </div>

              </div>
            </div>

            {/* KANAN: PANEL AI (Hanya muncul di Desktop) */}
            <div className="hidden xl:block xl:col-span-4 h-fit sticky top-32">
              <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
                <div className="p-6 border-b border-white/5 bg-gradient-to-b from-[#D4AF37]/5 to-transparent">
                  <h2 className="text-base font-serif text-white tracking-widest uppercase">Execution Signal</h2>
                </div>
                
                <div className="p-6">
                  {analysis ? (
                    <div className="space-y-5 animate-in fade-in duration-300">
                      
                      <div className={`p-6 rounded-xl border flex flex-col items-center justify-center text-center ${
                        analysis.direction === 'buy' ? 'bg-green-500/5 border-green-500/20' : 
                        analysis.direction === 'sell' ? 'bg-red-500/5 border-red-500/20' : 
                        'bg-gray-800/30 border-white/5'
                      }`}>
                        <p className="text-[10px] text-gray-400 mb-1 font-mono tracking-widest uppercase">{analysis.pair} • {analysis.timeframe}</p>
                        <p className={`font-serif text-5xl tracking-[0.2em] uppercase ${
                          analysis.direction === 'buy' ? 'text-green-400' : 
                          analysis.direction === 'sell' ? 'text-red-400' : 'text-gray-300'
                        }`}>{analysis.direction}</p>
                        <p className="text-xs text-gray-500 mt-2">Live Price: {analysis.current_price}</p>
                      </div>

                      {analysis.direction !== 'no_trade' && (
                        <div className="bg-[#111] border border-white/5 rounded-xl p-4 space-y-3">
                           <div className="flex justify-between items-center border-b border-white/5 pb-2">
                              <span className="text-[10px] text-gray-500 uppercase tracking-widest">Entry Zone</span>
                              <span className="font-mono text-sm text-white font-bold">{analysis.entry_zone}</span>
                           </div>
                           <div className="flex justify-between items-center">
                              <span className="text-[10px] text-red-400 uppercase tracking-widest">Stop Loss</span>
                              <span className="font-mono text-sm text-red-400 font-bold">{analysis.stop_loss}</span>
                           </div>
                           <div className="flex justify-between items-center">
                              <span className="text-[10px] text-green-400 uppercase tracking-widest">Take Profit</span>
                              <span className="font-mono text-sm text-green-400 font-bold">{analysis.take_profit}</span>
                           </div>
                           <div className="flex justify-between items-center pt-2 border-t border-white/5">
                              <span className="text-[10px] text-[#D4AF37] uppercase tracking-widest">Risk/Reward</span>
                              <span className="font-mono text-sm text-[#D4AF37] font-bold">1 : {rrRatio}</span>
                           </div>
                        </div>
                      )}

                      <div>
                        <h3 className="text-[10px] text-gray-500 uppercase tracking-[0.2em] mb-2">Trade Rationale</h3>
                        {analysis.direction === 'no_trade' ? (
                          <p className="text-sm text-red-400 italic">"{analysis.no_trade_reason}"</p>
                        ) : (
                          <ul className="text-xs text-gray-400 space-y-1.5 list-disc list-inside">
                            <li><strong className="text-gray-200">Surprise:</strong> {analysis.rationale?.surprise}</li>
                            <li><strong className="text-gray-200">History:</strong> {analysis.rationale?.historical}</li>
                          </ul>
                        )}
                      </div>
                      
                      <div className="pt-4 border-t border-white/5">
                        <div className="flex gap-3">
                          <button onClick={() => saveTradeToJournal('win')} disabled={isSavingTrade} className="flex-1 border border-green-500/20 text-green-400 hover:bg-green-500 hover:text-black py-2.5 rounded-lg text-xs font-bold tracking-widest transition-all">WIN</button>
                          <button onClick={() => saveTradeToJournal('loss')} disabled={isSavingTrade} className="flex-1 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-black py-2.5 rounded-lg text-xs font-bold tracking-widest transition-all">LOSS</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-20 opacity-30">
                      <p className="text-sm font-serif italic text-gray-400 tracking-wider">Select an event to<br/>generate execution signal.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ARSIP DATA */}
        {activeTab === 'history' && (
           <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden shadow-2xl animate-in fade-in duration-500">
             <div className="p-4 lg:p-6 border-b border-white/5"><h2 className="text-sm lg:text-base font-serif text-white tracking-widest uppercase">Historical Archive</h2></div>
             <div className="overflow-x-auto">
               <table className="w-full text-left text-sm whitespace-nowrap">
                 <thead className="bg-[#050505] text-gray-500 text-[10px] uppercase tracking-[0.2em]">
                   <tr>
                     <th className="px-4 lg:px-6 py-3 lg:py-4 font-normal">Date</th>
                     <th className="px-4 lg:px-6 py-3 lg:py-4 font-normal">Currency</th>
                     <th className="px-4 lg:px-6 py-3 lg:py-4 font-normal">Event</th>
                     <th className="px-4 lg:px-6 py-3 lg:py-4 font-normal text-center">Actual</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-white/5">
                   {pastEvents.map((ev, i) => (
                     <tr key={i} className="hover:bg-white/[0.02]">
                       <td className="px-4 lg:px-6 py-3 lg:py-4 text-gray-500 font-mono text-[10px] lg:text-xs">{formatDateWIB(ev.date)}</td>
                       <td className="px-4 lg:px-6 py-3 lg:py-4 font-bold text-gray-400 text-[10px] lg:text-xs">{ev.country}</td>
                       <td className="px-4 lg:px-6 py-3 lg:py-4 text-gray-300 text-xs lg:text-sm">{ev.title}</td>
                       <td className="px-4 lg:px-6 py-3 lg:py-4 text-center font-bold font-mono text-[#D4AF37] text-xs lg:text-sm">{ev.actual || 'Pending'}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
           </div>
        )}

        {/* TAB 3: JURNAL & PERFORMA */}
        {activeTab === 'performance' && (
          <div className="space-y-4 lg:space-y-6 animate-in fade-in duration-500">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4">
              {[
                { label: 'Total Trades', val: totalTrades, color: 'text-white' },
                { label: 'Win Rate', val: `${winRate}%`, color: Number(winRate) >= 50 ? 'text-[#D4AF37]' : 'text-red-400' },
                { label: 'Net Pips', val: `${totalPips > 0 ? '+' : ''}${totalPips}`, color: totalPips >= 0 ? 'text-[#D4AF37]' : 'text-red-400' },
                { label: 'W / L', val: `${wins} / ${losses}`, color: 'text-white' },
              ].map((stat, idx) => (
                <div key={idx} className="bg-[#0a0a0a] p-4 lg:p-6 rounded-2xl border border-white/5 shadow-xl">
                  <p className="text-[9px] lg:text-[10px] text-gray-500 uppercase tracking-widest mb-1 lg:mb-2">{stat.label}</p>
                  <p className={`text-xl lg:text-3xl font-serif tracking-wider ${stat.color}`}>{stat.val}</p>
                </div>
              ))}
            </div>

            <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-4 lg:p-6 border-b border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <h2 className="text-sm lg:text-base font-serif text-white tracking-widest uppercase">Execution Ledger</h2>
                <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="w-full sm:w-auto bg-[#050505] text-gray-300 text-xs px-3 py-2 rounded-xl border border-white/5 outline-none focus:border-[#D4AF37]/50" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-[#050505] text-gray-500 text-[10px] uppercase tracking-[0.2em]">
                    <tr>
                      <th className="px-4 lg:px-6 py-3 lg:py-4 font-normal">Date</th>
                      <th className="px-4 lg:px-6 py-3 lg:py-4 font-normal">Pair</th>
                      <th className="px-4 lg:px-6 py-3 lg:py-4 font-normal">Result</th>
                      <th className="px-4 lg:px-6 py-3 lg:py-4 font-normal text-right">Pips</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredJournal.map((trade, i) => (
                      <tr key={i} className="hover:bg-white/[0.02]">
                        <td className="px-4 lg:px-6 py-3 lg:py-4 text-gray-500 font-mono text-[10px] lg:text-xs">{new Date(trade.closed_at).toLocaleDateString('id-ID')}</td>
                        <td className="px-4 lg:px-6 py-3 lg:py-4 font-bold text-white text-xs">{trade.pair}</td>
                        <td className="px-4 lg:px-6 py-3 lg:py-4">
                          <span className={`px-2 lg:px-3 py-1 rounded-full text-[9px] lg:text-[10px] tracking-widest font-bold ${trade.result === 'win' ? 'bg-[#D4AF37]/10 text-[#D4AF37]' : 'bg-red-500/10 text-red-400'}`}>{trade.result.toUpperCase()}</span>
                        </td>
                        <td className={`px-4 lg:px-6 py-3 lg:py-4 text-right font-mono text-xs lg:text-sm ${trade.pips > 0 ? 'text-[#D4AF37]' : 'text-red-400'}`}>{trade.pips > 0 ? '+' : ''}{trade.pips}</td>
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
          <div className="max-w-3xl mx-auto animate-in fade-in duration-500">
            <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl shadow-2xl overflow-hidden">
              <div className="p-4 lg:p-6 border-b border-white/5 bg-gradient-to-r from-[#D4AF37]/10 to-transparent">
                <h2 className="text-sm lg:text-base font-serif text-white tracking-widest uppercase">Risk Management</h2>
              </div>
              <div className="p-4 lg:p-8 grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
                <div className="space-y-4 lg:space-y-5">
                  <div>
                    <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-1.5 lg:mb-2">Account Balance (USD)</label>
                    <input type="number" value={calcBalance} onChange={(e) => setCalcBalance(Number(e.target.value))} className="w-full bg-[#050505] p-3 lg:p-4 rounded-xl border border-white/5 text-white font-mono text-base lg:text-lg outline-none focus:border-[#D4AF37]/50" />
                  </div>
                  <div className="grid grid-cols-2 gap-3 lg:gap-4">
                    <div>
                      <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-1.5 lg:mb-2">Risk %</label>
                      <input type="number" value={calcRisk} onChange={(e) => setCalcRisk(Number(e.target.value))} className="w-full bg-[#050505] p-3 lg:p-4 rounded-xl border border-white/5 text-white font-mono text-base lg:text-lg outline-none focus:border-[#D4AF37]/50" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-1.5 lg:mb-2">Stop Loss (Pips)</label>
                      <input type="number" value={calcSl} onChange={(e) => setCalcSl(Number(e.target.value))} className="w-full bg-[#050505] p-3 lg:p-4 rounded-xl border border-white/5 text-white font-mono text-base lg:text-lg outline-none focus:border-[#D4AF37]/50" />
                    </div>
                  </div>
                </div>

                <div className="bg-[#050505] rounded-xl p-5 lg:p-6 border border-white/5 flex flex-col justify-center space-y-4">
                  <div className="text-center">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Risk Amount</p>
                    <p className="text-xl lg:text-2xl font-mono text-red-400">${riskAmountUSD.toFixed(2)}</p>
                  </div>
                  <div className="h-px w-full bg-white/5"></div>
                  <div className="text-center">
                    <p className="text-[10px] text-[#D4AF37] uppercase tracking-widest mb-1">Standard Lots</p>
                    <p className="text-3xl lg:text-4xl font-mono text-[#D4AF37] tracking-widest">{lotSizeStandard.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* MOBILE BOTTOM NAVIGATION */}
      <nav className="lg:hidden fixed bottom-0 left-0 w-full bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-white/5 z-40 pb-safe">
        <div className="flex justify-around items-center h-16">
           <button onClick={() => setActiveTab('calendar')} className={`flex flex-col items-center gap-1 w-full ${activeTab === 'calendar' ? 'text-[#D4AF37]' : 'text-gray-500'}`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              <span className="text-[9px] font-medium uppercase tracking-wider">Terminal</span>
           </button>
           <button onClick={() => setActiveTab('history')} className={`flex flex-col items-center gap-1 w-full ${activeTab === 'history' ? 'text-[#D4AF37]' : 'text-gray-500'}`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="text-[9px] font-medium uppercase tracking-wider">Arsip</span>
           </button>
           <button onClick={() => setActiveTab('performance')} className={`flex flex-col items-center gap-1 w-full ${activeTab === 'performance' ? 'text-[#D4AF37]' : 'text-gray-500'}`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              <span className="text-[9px] font-medium uppercase tracking-wider">Jurnal</span>
           </button>
           <button onClick={() => setActiveTab('calculator')} className={`flex flex-col items-center gap-1 w-full ${activeTab === 'calculator' ? 'text-[#D4AF37]' : 'text-gray-500'}`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
              <span className="text-[9px] font-medium uppercase tracking-wider">Kalkulator</span>
           </button>
        </div>
      </nav>

      {/* MODAL ANALISIS */}
      {selectedEvent && !analysis && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 sm:fade-in duration-300">
          <div className="bg-[#0a0a0a] p-6 lg:p-8 rounded-t-3xl sm:rounded-2xl w-full max-w-sm border-t sm:border border-white/10 shadow-[0_0_50px_rgba(212,175,55,0.1)] animate-in slide-in-from-bottom-1/2 sm:zoom-in-95">
            <div className="mb-6 text-center">
              <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-4 sm:hidden"></div>
              <h3 className="text-base lg:text-lg font-serif text-white tracking-widest uppercase mb-1">Generate Signal</h3>
              <p className="text-[10px] text-gray-500 tracking-wider">{selectedEvent.title}</p>
            </div>
            
            <form onSubmit={handleAnalyze} className="space-y-4 lg:space-y-5">
              <div>
                <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-2 text-center">Pilih Pair</label>
                <select 
                  value={selectedPair}
                  onChange={(e) => setSelectedPair(e.target.value)}
                  className="w-full bg-[#050505] p-3 rounded-xl border border-white/5 text-white text-center font-mono tracking-widest outline-none focus:border-[#D4AF37]/50 text-sm"
                >
                  <option value="EUR/USD">EUR/USD</option>
                  <option value="XAU/USD">XAU/USD (Gold)</option>
                  <option value="USD/JPY">USD/JPY</option>
                </select>
              </div>

              {/* LIVE PRICE BOX */}
              <div className="bg-[#111] p-3 rounded-xl border border-white/5 text-center">
                <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-1">Harga Live Saat Ini</p>
                <p className={`text-lg font-mono font-bold ${marketData?.[selectedPair]?.price ? 'text-[#D4AF37]' : 'text-red-400'}`}>
                  {marketData?.[selectedPair]?.price || 'Tidak Tersedia'}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setSelectedEvent(null)} className="flex-1 px-4 py-3 rounded-xl text-gray-500 hover:text-white text-xs font-bold tracking-widest transition-colors">CANCEL</button>
                <button type="submit" disabled={isAnalyzing} className="flex-[2] bg-[#D4AF37] hover:bg-[#c4a030] text-black px-4 py-3 rounded-xl text-xs font-bold tracking-widest transition-all disabled:opacity-50">
                  {isAnalyzing ? 'CALCULATING...' : 'GET SIGNAL'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* HASIL ANALISIS DI MOBILE */}
      {analysis && (
         <div className="xl:hidden fixed inset-0 bg-black/90 backdrop-blur-md z-50 overflow-y-auto p-4 flex flex-col animate-in slide-in-from-bottom duration-500">
            <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-md mx-auto my-auto shadow-2xl overflow-hidden">
               <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#111]">
                  <h2 className="text-sm font-serif text-white tracking-widest uppercase">Signal Result</h2>
                  <button onClick={() => { setAnalysis(null); setSelectedEvent(null); }} className="text-gray-500 hover:text-white bg-white/5 p-2 rounded-full">
                     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
               </div>
               
               <div className="p-5 space-y-5">
                  <div className={`p-5 rounded-xl border flex flex-col items-center justify-center text-center ${
                    analysis.direction === 'buy' ? 'bg-green-500/5 border-green-500/20' : 
                    analysis.direction === 'sell' ? 'bg-red-500/5 border-red-500/20' : 
                    'bg-gray-800/30 border-white/5'
                  }`}>
                    <p className="text-[10px] text-gray-400 mb-1 font-mono tracking-widest uppercase">{analysis.pair} • {analysis.timeframe}</p>
                    <p className={`font-serif text-4xl tracking-[0.2em] uppercase ${
                      analysis.direction === 'buy' ? 'text-green-400' : 
                      analysis.direction === 'sell' ? 'text-red-400' : 'text-gray-300'
                    }`}>{analysis.direction}</p>
                    <p className="text-xs text-gray-500 mt-1">Live Price: {analysis.current_price}</p>
                  </div>

                  {analysis.direction !== 'no_trade' && (
                    <div className="bg-[#111] border border-white/5 rounded-xl p-4 space-y-3">
                       <div className="flex justify-between items-center border-b border-white/5 pb-2">
                          <span className="text-[10px] text-gray-500 uppercase tracking-widest">Entry Zone</span>
                          <span className="font-mono text-sm text-white font-bold">{analysis.entry_zone}</span>
                       </div>
                       <div className="flex justify-between items-center">
                          <span className="text-[10px] text-red-400 uppercase tracking-widest">Stop Loss</span>
                          <span className="font-mono text-sm text-red-400 font-bold">{analysis.stop_loss}</span>
                       </div>
                       <div className="flex justify-between items-center">
                          <span className="text-[10px] text-green-400 uppercase tracking-widest">Take Profit</span>
                          <span className="font-mono text-sm text-green-400 font-bold">{analysis.take_profit}</span>
                       </div>
                       <div className="flex justify-between items-center pt-2 border-t border-white/5">
                          <span className="text-[10px] text-[#D4AF37] uppercase tracking-widest">Risk/Reward</span>
                          <span className="font-mono text-sm text-[#D4AF37] font-bold">1 : {rrRatio}</span>
                       </div>
                    </div>
                  )}

                  <div>
                    <h3 className="text-[10px] text-gray-500 uppercase tracking-[0.2em] mb-2">Trade Rationale</h3>
                    {analysis.direction === 'no_trade' ? (
                      <p className="text-sm text-red-400 italic">"{analysis.no_trade_reason}"</p>
                    ) : (
                      <ul className="text-xs text-gray-400 space-y-1.5 list-disc list-inside">
                        <li><strong className="text-gray-200">Surprise:</strong> {analysis.rationale?.surprise}</li>
                        <li><strong className="text-gray-200">History:</strong> {analysis.rationale?.historical}</li>
                      </ul>
                    )}
                  </div>

                  <div className="pt-4 border-t border-white/5">
                    <div className="flex gap-3">
                      <button onClick={() => saveTradeToJournal('win')} disabled={isSavingTrade} className="flex-1 border border-green-500/20 text-green-400 hover:bg-green-500 hover:text-black py-3 rounded-lg text-xs font-bold tracking-widest transition-all">WIN</button>
                      <button onClick={() => saveTradeToJournal('loss')} disabled={isSavingTrade} className="flex-1 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-black py-3 rounded-lg text-xs font-bold tracking-widest transition-all">LOSS</button>
                    </div>
                  </div>
               </div>
            </div>
         </div>
      )}
    </div>
  );
}