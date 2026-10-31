'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'calendar' | 'history' | 'performance'>('calendar');
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
  
  // State Filter Tanggal & Error
  const [dateFilter, setDateFilter] = useState<'yesterday' | 'today' | 'tomorrow'>('today');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // --- EFEK LIVE POLLING ---
  useEffect(() => {
    setFilterMonth(new Date().toISOString().slice(0, 7));
    
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false }) + ' WIB');
    }, 1000);

    const syncData = async () => {
      try {
        await fetch('/api/sync'); 
        fetchHistory();
        fetchMarketData();
      } catch (err) { console.error("Sync error", err); }
    };

    fetchNews();
    fetchMarketData();
    fetchJournal();
    fetchHistory();
    syncData();

    const interval = setInterval(() => {
      fetchNews(); 
      syncData();  
    }, 300000); 

    return () => { clearInterval(interval); clearInterval(timer); };
  }, []);

  async function fetchNews() {
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/news?t=${new Date().getTime()}`);
      const data = await res.json();
      
      if (data.error) {
        setErrorMessage("Gagal memuat data dari API: " + data.error);
        setEvents([]);
      } else if (Array.isArray(data)) {
        setEvents(data);
      } else {
        setEvents([]);
      }
    } catch (err) {
      setErrorMessage("Koneksi terputus. Periksa jaringan internet Anda.");
      setEvents([]);
    }
  }

  async function fetchMarketData() {
    try {
      const res = await fetch('/api/market');
      const data = await res.json();
      setMarketData(data);
    } catch (err) { console.error(err); }
  }

  async function fetchJournal() {
    const { data, error } = await supabase.from('trade_journal').select('*').order('closed_at', { ascending: false });
    if (!error && data) setJournal(data);
  }

  async function fetchHistory() {
    const { data, error } = await supabase.from('news_history').select('*').order('release_date', { ascending: false });
    if (!error && data) setSavedHistory(data);
  }

  function formatTimeWIB(dateString: string) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }) + " WIB";
  }

  function formatDateWIB(dateString: string) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short' });
  }

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    setIsAnalyzing(true);
    setAnalysis(null);

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
    } catch (err: any) {
      alert('Gagal menganalisis: ' + err.message);
    }
    setIsAnalyzing(false);
  }

  async function saveTradeToJournal(result: 'win' | 'loss' | 'breakeven') {
    if (!analysis) return;
    setIsSavingTrade(true);
    let pips = result === 'win' ? 20 : result === 'loss' ? -15 : 0; 

    const { error } = await supabase.from('trade_journal').insert([{
      pair: analysis.pair, direction: analysis.direction, result: result, pips: pips, notes: `Berita: ${selectedEvent.title}`
    }]);

    if (error) alert("Gagal simpan: " + error.message);
    else {
      fetchJournal();
      setAnalysis(null);
      setSelectedEvent(null);
    }
    setIsSavingTrade(false);
  }

  // --- LOGIKA FILTER TANGGAL & IMPACT ---
  const today = new Date(); 
  today.setHours(0, 0, 0, 0); 
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1); 

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1); 

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

  // --- LOGIKA JURNAL ---
  const filteredJournal = filterMonth ? journal.filter(t => t.closed_at.startsWith(filterMonth)) : journal;
  const totalTrades = filteredJournal.length;
  const wins = filteredJournal.filter(t => t.result === 'win').length;
  const losses = filteredJournal.filter(t => t.result === 'loss').length;
  const winRate = totalTrades > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : "0.0";
  const totalPips = filteredJournal.reduce((acc, curr) => acc + (Number(curr.pips) || 0), 0);

  return (
    <div className="min-h-screen flex flex-col bg-[#09090b]">
      
      {/* HEADER */}
      <header className="border-b border-white/5 bg-[#09090b]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">F</div>
              <span className="text-lg font-bold text-white tracking-tight">Forex Intel</span>
            </div>
            
            <nav className="hidden md:flex gap-1">
              {[
                { id: 'calendar', label: 'Terminal' },
                { id: 'history', label: 'Arsip Data' },
                { id: 'performance', label: 'Jurnal & Performa' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.id 
                      ? 'bg-white/10 text-white shadow-sm' 
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-sm font-medium text-slate-400 border-r border-white/10 pr-4">
              {currentTime}
            </div>
            <button 
              onClick={() => { fetchNews(); fetchMarketData(); }} 
              className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              Refresh
            </button>
            <div className="flex gap-4 bg-white/5 px-4 py-1.5 rounded-full border border-white/5">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">EUR/USD</span>
                <strong className="text-green-400 font-mono">{marketData?.['EUR/USD']?.price || '...'}</strong>
              </div>
              <div className="w-px bg-white/10"></div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">XAU/USD</span>
                <strong className="text-amber-400 font-mono">{marketData?.['XAU/USD']?.price || '...'}</strong>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* KONTEN UTAMA */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-8">
        
        {/* NOTIFIKASI ERROR (Jika API Gagal) */}
        {errorMessage && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 animate-in fade-in">
            <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-sm text-red-400">{errorMessage}</p>
          </div>
        )}

        {/* TAB 1: TERMINAL */}
        {activeTab === 'calendar' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 animate-in fade-in duration-500">
            
            <div className="xl:col-span-9 flex flex-col gap-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white/5 border border-white/5 p-4 rounded-xl">
                  <p className="text-xs text-slate-400 mb-1">Total Berita Penting</p>
                  <p className="text-2xl font-bold text-white">{importantEvents.length}</p>
                </div>
                <div className="bg-white/5 border border-white/5 p-4 rounded-xl">
                  <p className="text-xs text-slate-400 mb-1">High Impact Tersisa</p>
                  <p className="text-2xl font-bold text-red-400">{importantEvents.filter(e => e.impact === 'High').length}</p>
                </div>
                <div className="bg-white/5 border border-white/5 p-4 rounded-xl">
                  <p className="text-xs text-slate-400 mb-1">Sinyal Aktif AI</p>
                  <p className="text-2xl font-bold text-blue-400">{analysis ? '1' : '0'}</p>
                </div>
              </div>

              <div className="bg-[#121214] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
                <div className="p-5 border-b border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h2 className="text-base font-semibold text-white">Jadwal Ekonomi (Penting)</h2>
                    <p className="text-xs text-slate-500 mt-1">Hanya menampilkan berita High & Medium Impact</p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button onClick={() => setDateFilter('yesterday')} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${dateFilter === 'yesterday' ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-400 hover:text-white'}`}>Kemarin</button>
                    <button onClick={() => setDateFilter('today')} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${dateFilter === 'today' ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-400 hover:text-white'}`}>Hari Ini</button>
                    <button onClick={() => setDateFilter('tomorrow')} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${dateFilter === 'tomorrow' ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-400 hover:text-white'}`}>Besok</button>
                  </div>

                  <select value={filterImpact} onChange={(e) => setFilterImpact(e.target.value as any)} className="bg-[#09090b] text-slate-300 text-sm px-3 py-1.5 rounded-lg border border-white/10 outline-none focus:border-blue-500/50">
                    <option value="all">Semua Penting</option>
                    <option value="High">High Impact Saja</option>
                    <option value="Medium">Medium Impact Saja</option>
                  </select>
                </div>

                <div className="overflow-x-auto max-h-[700px] custom-scrollbar">
                  <table className="w-full text-left text-base whitespace-nowrap">
                    <thead className="bg-[#18181b] text-slate-400 text-xs uppercase tracking-wider sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-4 font-medium">Waktu (WIB)</th>
                        <th className="px-6 py-4 font-medium">Negara</th>
                        <th className="px-6 py-4 font-medium">Berita</th>
                        <th className="px-6 py-4 font-medium text-center">Prev</th>
                        <th className="px-6 py-4 font-medium text-center">Fcst</th>
                        <th className="px-6 py-4 font-medium text-center">Act</th>
                        <th className="px-6 py-4 font-medium text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {importantEvents.length === 0 && (
                        <tr><td colSpan={7} className="text-center py-12 text-slate-500">Tidak ada jadwal berita penting untuk filter ini.</td></tr>
                      )}
                      {importantEvents.map((ev, i) => (
                        <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="px-6 py-5">
                            <div className="text-white font-medium">{formatTimeWIB(ev.date)}</div>
                            <div className="text-xs text-slate-500 mt-1">{formatDateWIB(ev.date)}</div>
                          </td>
                          <td className="px-6 py-5 font-semibold text-slate-300">{ev.country}</td>
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-3">
                              <span className={`w-2 h-2 rounded-full ${ev.impact === 'High' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : ev.impact === 'Medium' ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                              <span className="text-slate-200 text-[15px]">{ev.title}</span>
                            </div>
                          </td>
                          <td className="px-6 py-5 text-center text-slate-500 font-mono text-sm">{ev.previous || '-'}</td>
                          <td className="px-6 py-5 text-center text-slate-400 font-mono text-sm">{ev.forecast || '-'}</td>
                          <td className={`px-6 py-5 text-center font-mono text-sm font-bold ${ev.actual ? 'text-blue-400' : 'text-slate-600'}`}>
                            {ev.actual || '-'}
                          </td>
                          <td className="px-6 py-5 text-right">
                            <button 
                              onClick={() => { setSelectedEvent(ev); setAnalysis(null); }} 
                              className="opacity-0 group-hover:opacity-100 bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white px-4 py-2 rounded text-sm font-medium transition-all"
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
            <div className="xl:col-span-3 h-fit sticky top-24">
              <div className="bg-[#121214] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
                <div className="p-5 border-b border-white/5 bg-gradient-to-r from-blue-600/10 to-transparent">
                  <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    Analisis AI
                  </h2>
                </div>
                
                <div className="p-5">
                  {analysis ? (
                    <div className="space-y-5 animate-in fade-in zoom-in-95 duration-300">
                      <div className={`p-5 rounded-xl border flex flex-col items-center justify-center text-center ${
                        analysis.direction === 'buy' ? 'bg-green-500/5 border-green-500/20' : 
                        analysis.direction === 'sell' ? 'bg-red-500/5 border-red-500/20' : 
                        'bg-slate-800/50 border-white/10'
                      }`}>
                        <p className="text-xs text-slate-400 mb-2 font-medium">{analysis.pair} - {analysis.current_price}</p>
                        <p className={`font-black text-3xl tracking-widest uppercase ${
                          analysis.direction === 'buy' ? 'text-green-400' : 
                          analysis.direction === 'sell' ? 'text-red-400' : 'text-slate-300'
                        }`}>{analysis.direction}</p>
                      </div>
                      
                      <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Alasan Fundamental</h3>
                        <p className="text-sm text-slate-300 leading-relaxed bg-white/5 p-3 rounded-lg border border-white/5">{analysis.fundamental_reason}</p>
                      </div>
                      
                      <div className="pt-5 border-t border-white/5">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 text-center">Catat Hasil Trade</p>
                        <div className="flex gap-2">
                          <button onClick={() => saveTradeToJournal('win')} disabled={isSavingTrade} className="flex-1 bg-green-500/10 hover:bg-green-500 text-green-400 hover:text-white border border-green-500/20 py-2.5 rounded-lg text-sm font-bold transition-all shadow-lg hover:shadow-green-500/20">WIN</button>
                          <button onClick={() => saveTradeToJournal('loss')} disabled={isSavingTrade} className="flex-1 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/20 py-2.5 rounded-lg text-sm font-bold transition-all shadow-lg hover:shadow-red-500/20">LOSS</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-20 flex flex-col items-center justify-center opacity-50">
                      <svg className="w-12 h-12 text-slate-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                      <p className="text-sm text-slate-500 text-center px-4">Pilih berita di tabel<br/>untuk melihat analisis AI.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ARSIP DATA */}
        {activeTab === 'history' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="bg-[#121214] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-5 border-b border-white/5">
                <h2 className="text-base font-semibold text-white">Berita Lampau</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-base whitespace-nowrap">
                  <thead className="bg-[#18181b] text-slate-400 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4 font-medium">Waktu (WIB)</th>
                      <th className="px-6 py-4 font-medium">Negara</th>
                      <th className="px-6 py-4 font-medium">Berita</th>
                      <th className="px-6 py-4 font-medium text-center">Prev</th>
                      <th className="px-6 py-4 font-medium text-center">Fcst</th>
                      <th className="px-6 py-4 font-medium text-center">Actual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {pastEvents.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-12 text-slate-500">Belum ada riwayat berita lampau.</td></tr>
                    )}
                    {pastEvents.map((ev, i) => (
                      <tr key={i} className="hover:bg-white/[0.02]">
                        <td className="px-6 py-5 text-slate-400">{formatDateWIB(ev.date)} - {formatTimeWIB(ev.date)}</td>
                        <td className="px-6 py-5 font-semibold text-slate-300">{ev.country}</td>
                        <td className="px-6 py-5 text-slate-200">{ev.title}</td>
                        <td className="px-6 py-5 text-center text-slate-500 font-mono text-sm">{ev.previous || '-'}</td>
                        <td className="px-6 py-5 text-center text-slate-400 font-mono text-sm">{ev.forecast || '-'}</td>
                        <td className="px-6 py-5 text-center font-bold font-mono text-sm text-blue-400">{ev.actual || 'Belum Rilis'}</td>
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
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-[#121214] p-5 rounded-2xl border border-white/5 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                <p className="text-xs text-slate-400 font-medium mb-1">Total Trade</p>
                <p className="text-3xl font-bold text-white">{totalTrades}</p>
              </div>
              <div className="bg-[#121214] p-5 rounded-2xl border border-white/5 shadow-xl relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-1 h-full ${Number(winRate) >= 50 ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <p className="text-xs text-slate-400 font-medium mb-1">Win Rate</p>
                <p className={`text-3xl font-bold ${Number(winRate) >= 50 ? 'text-green-400' : 'text-red-400'}`}>{winRate}%</p>
              </div>
              <div className="bg-[#121214] p-5 rounded-2xl border border-white/5 shadow-xl relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-1 h-full ${totalPips >= 0 ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <p className="text-xs text-slate-400 font-medium mb-1">Net Pips</p>
                <p className={`text-3xl font-bold ${totalPips >= 0 ? 'text-green-400' : 'text-red-400'}`}>{totalPips > 0 ? '+' : ''}{totalPips}</p>
              </div>
              <div className="bg-[#121214] p-5 rounded-2xl border border-white/5 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-slate-500"></div>
                <p className="text-xs text-slate-400 font-medium mb-1">Rasio W / L</p>
                <p className="text-3xl font-bold text-white">{wins} <span className="text-slate-500 text-xl">/</span> {losses}</p>
              </div>
            </div>

            <div className="bg-[#121214] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-5 border-b border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h2 className="text-base font-semibold text-white">Riwayat Trade</h2>
                </div>
                <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="bg-[#09090b] text-slate-300 text-sm px-3 py-1.5 rounded-lg border border-white/10 outline-none focus:border-blue-500/50" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-base whitespace-nowrap">
                  <thead className="bg-[#18181b] text-slate-400 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4 font-medium">Tanggal</th>
                      <th className="px-6 py-4 font-medium">Pair</th>
                      <th className="px-6 py-4 font-medium">Arah</th>
                      <th className="px-6 py-4 font-medium">Hasil</th>
                      <th className="px-6 py-4 font-medium text-right">Pips</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredJournal.length === 0 && (
                      <tr><td colSpan={5} className="text-center py-12 text-slate-500">Belum ada trade yang dicatat bulan ini.</td></tr>
                    )}
                    {filteredJournal.map((trade, i) => (
                      <tr key={i} className="hover:bg-white/[0.02]">
                        <td className="px-6 py-5 text-slate-400">{new Date(trade.closed_at).toLocaleDateString('id-ID')}</td>
                        <td className="px-6 py-5 font-bold text-white">{trade.pair}</td>
                        <td className="px-6 py-5">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${trade.direction === 'buy' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{trade.direction.toUpperCase()}</span>
                        </td>
                        <td className="px-6 py-5">
                          <span className={`font-bold ${trade.result === 'win' ? 'text-green-400' : trade.result === 'loss' ? 'text-red-400' : 'text-slate-400'}`}>{trade.result.toUpperCase()}</span>
                        </td>
                        <td className={`px-6 py-5 text-right font-bold font-mono ${trade.pips > 0 ? 'text-green-400' : 'text-red-400'}`}>{trade.pips > 0 ? '+' : ''}{trade.pips}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* MODAL ANALISIS */}
      {selectedEvent && !analysis && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-[#121214] p-6 rounded-2xl w-full max-w-md border border-white/10 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-lg font-bold text-white mb-1">Konfirmasi Analisis</h3>
                <p className="text-sm text-slate-400">{selectedEvent.title} <span className="text-slate-500">({selectedEvent.country})</span></p>
              </div>
              <button onClick={() => setSelectedEvent(null)} className="text-slate-500 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <form onSubmit={handleAnalyze} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Pilih Pair</label>
                <select name="pair" className="w-full bg-[#09090b] p-3 rounded-xl border border-white/10 text-white outline-none focus:border-blue-500/50">
                  <option value="EUR/USD">EUR/USD (Harga Otomatis)</option>
                  <option value="XAU/USD">XAU/USD (Harga Otomatis)</option>
                  <option value="USD/JPY">USD/JPY (Harga Otomatis)</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setSelectedEvent(null)} className="flex-1 px-4 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors font-medium">Batal</button>
                <button type="submit" disabled={isAnalyzing} className="flex-[2] bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50">
                  {isAnalyzing ? 'Memproses AI...' : 'Mulai Analisis'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}