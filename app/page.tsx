'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default function Dashboard() {
  // --- STATE AUTHENTICATION ---
  const [session, setSession] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authMessage, setAuthMessage] = useState<{ type: 'error' | 'success', text: string } | null>(null);
  const [isAuthProcessing, setIsAuthProcessing] = useState(false);

  // --- STATE APLIKASI ---
  const [activeTab, setActiveTab] = useState<'calendar' | 'daily' | 'history' | 'performance' | 'calculator'>('calendar');
  const [marketData, setMarketData] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [journal, setJournal] = useState<any[]>([]);
  const [dailySignals, setDailySignals] = useState<any[]>([]);
  const [isGeneratingDaily, setIsGeneratingDaily] = useState(false);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [selectedPair, setSelectedPair] = useState<string>('XAU/USD');
  
  const [isSavingTrade, setIsSavingTrade] = useState(false);
  const [filterMonth, setFilterMonth] = useState('');
  const [focusMode, setFocusMode] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [dateFilter, setDateFilter] = useState<'yesterday' | 'today' | 'tomorrow'>('today');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [calcBalance, setCalcBalance] = useState<number | ''>(10000);
  const [calcRisk, setCalcRisk] = useState<number | ''>(1);
  const [calcSl, setCalcSl] = useState<number | ''>(20);

  const [nextHighImpact, setNextHighImpact] = useState<any>(null);
  const [countdown, setCountdown] = useState<string>('');
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const [notifPermission, setNotifPermission] = useState<string>('default');
  const [notifiedEvents, setNotifiedEvents] = useState<string[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission);
    }
    return () => subscription.unsubscribe();
  }, []);

  async function requestNotifPermission() {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotifPermission(permission);
      if (permission === 'granted') new Notification("NewssAI", { body: "Notifications activated.", icon: '/logo.png' });
    }
  }

  useEffect(() => {
    if (notifPermission !== 'granted' || !nextHighImpact) return;
    const eventTime = new Date(nextHighImpact.date).getTime();
    const now = new Date().getTime();
    const diffMinutes = (eventTime - now) / 60000;
    if (diffMinutes > 0 && diffMinutes <= 15 && !notifiedEvents.includes(nextHighImpact.title)) {
      new Notification("High Impact Alert", { body: `${nextHighImpact.title} in ${Math.ceil(diffMinutes)} min`, icon: '/logo.png' });
      setNotifiedEvents(prev => [...prev, nextHighImpact.title]);
    }
  }, [currentTime, nextHighImpact, notifPermission, notifiedEvents]);

  useEffect(() => {
    if (!marketData || dailySignals.length === 0) return;
    async function evaluateSignals() {
      for (const sig of dailySignals) {
        if (sig.status !== 'pending') continue;
        const currentPrice = Number(marketData[sig.pair]?.price);
        if (!currentPrice) continue;
        const parseNum = (str: string) => parseFloat(String(str).split('-')[0].replace(/[^0-9.]/g, ''));
        const sl = parseNum(sig.stop_loss);
        const tp = parseNum(sig.take_profit);
        let isWin = false, isLoss = false;
        if (sig.direction === 'buy') {
          if (currentPrice >= tp) isWin = true;
          if (currentPrice <= sl) isLoss = true;
        } else if (sig.direction === 'sell') {
          if (currentPrice <= tp) isWin = true;
          if (currentPrice >= sl) isLoss = true;
        }
        if (isWin || isLoss) {
          await supabase.from('daily_signals').update({ status: isWin ? 'win' : 'loss' }).eq('id', sig.id);
          fetchDailySignals();
        }
      }
    }
    evaluateSignals();
  }, [marketData, dailySignals]);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault(); setIsAuthProcessing(true); setAuthMessage(null);
    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
        if (error) throw error;
        setAuthMessage({ type: 'success', text: 'Account created. Please sign in.' });
        setAuthMode('login');
      }
    } catch (err: any) { setAuthMessage({ type: 'error', text: err.message }); }
    setIsAuthProcessing(false);
  }

  async function handleLogout() { await supabase.auth.signOut(); setSession(null); }

  function formatTimeWIB(dateString: string) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
  }
  function formatDateWIB(dateString: string) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' });
  }

  async function handleRefresh() {
    setIsRefreshing(true);
    try { await Promise.all([fetchNews(), fetchMarketData(), fetchJournal(), fetchDailySignals()]); } catch (err) {}
    setTimeout(() => setIsRefreshing(false), 800);
  }

  useEffect(() => {
    if (!session) return;
    setFilterMonth(new Date().toISOString().slice(0, 7));
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false }));
      if (nextHighImpact) {
        const now = new Date().getTime();
        const eventTime = new Date(nextHighImpact.date).getTime();
        const diff = eventTime - now;
        if (diff > 0) {
          const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const s = Math.floor((diff % (1000 * 60)) / 1000);
          setCountdown(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
        } else setCountdown('00:00:00');
      }
    }, 1000);
    const syncData = async () => { try { await fetch('/api/sync'); fetchMarketData(); } catch (err) {} };
    fetchNews(); fetchMarketData(); fetchJournal(); fetchDailySignals(); syncData();
    const interval = setInterval(() => { fetchNews(); syncData(); }, 60000); 
    return () => { clearInterval(interval); clearInterval(timer); };
  }, [nextHighImpact, session]);

  useEffect(() => {
    if (activeTab === 'calendar' && typeof window !== 'undefined' && chartContainerRef.current) {
      chartContainerRef.current.innerHTML = '';
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      script.onload = () => {
        new (window as any).TradingView.widget({
          autosize: true, symbol: "OANDA:XAUUSD", interval: "15", timezone: "Asia/Jakarta",
          theme: "dark", style: "1", locale: "id", toolbar_bg: "#09090B",
          enable_publishing: false, hide_top_toolbar: true, hide_legend: true, save_image: false,
          container_id: chartContainerRef.current?.id,
        });
      };
      chartContainerRef.current.appendChild(script);
    }
  }, [activeTab, session]);

  async function fetchNews() {
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/news?t=${new Date().getTime()}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setEvents(data);
        const now = new Date();
        const upcomingHigh = data.filter(e => e.impact === 'High' && new Date(e.date) > now)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
        setNextHighImpact(upcomingHigh || null);
      } else { setErrorMessage(data.error || "Data error"); setEvents([]); }
    } catch (err) { setErrorMessage("Connection lost"); setEvents([]); }
  }

  async function fetchMarketData() {
    try { const res = await fetch('/api/market'); const data = await res.json(); if (!data.error && !data.code) setMarketData(data); } catch (err) {}
  }

  async function fetchJournal() {
    const { data, error } = await supabase.from('trade_journal').select('*').order('closed_at', { ascending: false });
    if (!error && data) setJournal(data);
  }
  
  async function fetchDailySignals() {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase.from('daily_signals').select('*').eq('signal_date', today);
    if (!error && data) setDailySignals(data);
  }

  async function generateDailySignals() {
    if (!marketData || !marketData['XAU/USD']?.price) return alert("Live price unavailable.");
    setIsGeneratingDaily(true);
    try {
      const pairsToAnalyze = [
        { pair: 'XAU/USD', price: marketData?.['XAU/USD']?.price },
        { pair: 'EUR/USD', price: marketData?.['EUR/USD']?.price },
        { pair: 'GBP/USD', price: marketData?.['GBP/USD']?.price },
        { pair: 'USD/JPY', price: marketData?.['USD/JPY']?.price },
      ].filter(p => p.price && p.price !== '...');
      if (pairsToAnalyze.length === 0) throw new Error("NO LIVE DATA");
      const res = await fetch('/api/daily-signal', { method: 'POST', body: JSON.stringify({ pairs: pairsToAnalyze }) });
      const signals = await res.json();
      if (!Array.isArray(signals)) throw new Error(signals.error || 'AI FAILED');
      const today = new Date().toISOString().slice(0, 10);
      const toInsert = signals.map((s: any) => ({
        signal_date: today, pair: s.pair, direction: s.direction, confidence: s.confidence,
        timeframe: s.timeframe, entry_zone: s.entry_zone, stop_loss: s.stop_loss,
        take_profit: s.take_profit, invalidation: s.invalidation, rationale: s.rationale, status: 'pending'
      }));
      const { error } = await supabase.from('daily_signals').upsert(toInsert, { onConflict: 'signal_date,pair' });
      if (error) throw error;
      fetchDailySignals();
    } catch (err: any) { alert('ERROR: ' + err.message); }
    setIsGeneratingDaily(false);
  }

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault(); setIsAnalyzing(true); setAnalysis(null);
    const currentPrice = marketData?.[selectedPair]?.price;
    if (!currentPrice || currentPrice === '...') { alert("Live price unavailable."); setIsAnalyzing(false); return; }
    try {
      const res = await fetch('/api/analyze', { method: 'POST', body: JSON.stringify({ event: selectedEvent, marketContext: { pair: selectedPair, current_price: currentPrice, trend: "Unknown" } }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAnalysis({ ...data, pair: selectedPair, current_price: currentPrice });
    } catch (err: any) { alert('ERROR: ' + err.message); }
    setIsAnalyzing(false);
  }

  async function saveTradeToJournal(result: 'win' | 'loss') {
    if (!analysis) return; setIsSavingTrade(true);
    let pips = result === 'win' ? 20 : -15;
    const { error } = await supabase.from('trade_journal').insert([{
      pair: analysis.pair, direction: analysis.direction, result: result, pips: pips, notes: `EXEC: ${selectedEvent.title}`, user_id: session?.user?.id
    }]);
    if (error) alert("Save failed: " + error.message);
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

  const aiTotalSignals = dailySignals.length;
  const aiWins = dailySignals.filter(s => s.status === 'win').length;
  const aiLosses = dailySignals.filter(s => s.status === 'loss').length;
  const aiPending = dailySignals.filter(s => s.status === 'pending').length;
  const aiWinRate = (aiWins + aiLosses) > 0 ? ((aiWins / (aiWins + aiLosses)) * 100).toFixed(1) : "0.0";

  let rrRatio = "0.0";
  if (analysis && analysis.direction !== 'no_trade' && analysis.entry_zone && analysis.stop_loss && analysis.take_profit) {
    const parseNum = (str: string) => parseFloat(String(str).split('-')[0].replace(/[^0-9.]/g, ''));
    const entry = parseNum(analysis.entry_zone); const sl = parseNum(analysis.stop_loss); const tp = parseNum(analysis.take_profit);
    if (!isNaN(entry) && !isNaN(sl) && !isNaN(tp) && entry !== sl) {
      rrRatio = (Math.abs(tp - entry) / Math.abs(entry - sl)).toFixed(1);
    }
  }

  const navTabs = [
    { id: 'calendar', label: 'Markets' },
    { id: 'daily', label: 'Signals' },
    { id: 'history', label: 'Archive' },
    { id: 'performance', label: 'Journal' },
    { id: 'calculator', label: 'Risk' },
  ];

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#09090B] flex items-center justify-center font-sans text-white/50 text-sm">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#FF6600] animate-pulse"></div>
          Initializing terminal...
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#09090B] flex items-center justify-center p-4 font-sans text-white overflow-hidden relative">
        {/* Ambient Glow */}
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#FF6600] opacity-10 rounded-full blur-[120px] pointer-events-none"></div>
        
        <div className="relative z-10 w-full max-w-sm">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#FF6600] shadow-[0_0_40px_rgba(255,102,0,0.4)] mb-6">
              <img src="/logo.png" alt="Logo" className="h-10 w-10 object-contain" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-2">NewssAI</h1>
            <p className="text-xs text-gray-500 tracking-widest uppercase">Terminal Access</p>
          </div>

          <div className="bg-white/[0.02] backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
            <h2 className="text-lg font-semibold text-white text-center mb-8">
              {authMode === 'login' ? 'Welcome back' : 'Create account'}
            </h2>

            {authMessage && (
              <div className={`mb-6 p-3 text-xs rounded-xl border ${authMessage.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-green-500/10 border-green-500/30 text-green-300'}`}>
                {authMessage.text}
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-2 font-medium">Email</label>
                <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} required className="w-full bg-white/5 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-[#FF6600]/50 focus:bg-white/[0.07] transition-all placeholder-gray-600" placeholder="name@domain.com" />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-2 font-medium">Password</label>
                <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} required className="w-full bg-white/5 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-[#FF6600]/50 focus:bg-white/[0.07] transition-all placeholder-gray-600" placeholder="••••••••" />
              </div>
              <button type="submit" disabled={isAuthProcessing} className="w-full bg-[#FF6600] text-black font-bold py-3.5 rounded-xl text-sm shadow-lg shadow-[#FF6600]/20 hover:bg-[#E65C00] disabled:opacity-50 transition-all mt-2">
                {isAuthProcessing ? 'Processing...' : authMode === 'login' ? 'Sign in' : 'Create account'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthMessage(null); }} className="text-xs text-gray-500 hover:text-[#FF6600] transition-colors">
                {authMode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#09090B] text-gray-300 font-sans text-sm selection:bg-[#FF6600] selection:text-black pb-24 lg:pb-0 relative">
      
      {/* Ambient Glow Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-[#FF6600] opacity-[0.03] rounded-full blur-[120px]"></div>
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-[#FF6600] opacity-[0.02] rounded-full blur-[120px]"></div>
      </div>

      {/* HEADER */}
      <header className="relative z-30 bg-[#09090B]/80 backdrop-blur-2xl border-b border-white/5 sticky top-0">
        <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-[#FF6600] to-transparent opacity-50"></div>
        
        <div className="max-w-[1600px] mx-auto px-4 lg:px-6 h-16 flex items-center justify-between">
          
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#FF6600] flex items-center justify-center shadow-[0_0_15px_rgba(255,102,0,0.4)]">
                <img src="/logo.png" alt="Logo" className="h-5 w-5 object-contain" />
              </div>
              <span className="text-base font-bold text-white tracking-widest uppercase">Newss<span className="text-[#FF6600]">AI</span></span>
            </div>

            <nav className="hidden lg:flex gap-1">
              {navTabs.map((tab) => (
                <button 
                  key={tab.id} 
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === tab.id 
                      ? 'bg-white/10 text-white shadow-sm' 
                      : 'text-gray-500 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-4 bg-white/[0.03] border border-white/5 rounded-full px-4 py-1.5">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-[10px] text-gray-400 font-mono tracking-wider">{currentTime} WIB</span>
              </div>
              <span className="text-white/10">|</span>
              <span className="text-[10px] font-mono"><span className="text-gray-500">XAU</span> <span className="text-[#FF6600]">{marketData?.['XAU/USD']?.price || '—'}</span></span>
              <span className="text-white/10">|</span>
              <span className="text-[10px] font-mono"><span className="text-gray-500">EUR</span> <span className="text-[#FF6600]">{marketData?.['EUR/USD']?.price || '—'}</span></span>
            </div>

            {notifPermission !== 'granted' && (
              <button onClick={requestNotifPermission} className="text-[10px] font-semibold text-[#FF6600] hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-[#FF6600]/30 hover:bg-[#FF6600]/10">
                Enable Alerts
              </button>
            )}
            
            <button onClick={handleRefresh} disabled={isRefreshing} className="w-9 h-9 rounded-full bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] flex items-center justify-center transition-all">
              <svg className={`w-4 h-4 text-gray-400 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            <button onClick={handleLogout} className="w-9 h-9 rounded-full bg-white/[0.03] border border-white/5 hover:bg-red-500/10 hover:border-red-500/30 flex items-center justify-center transition-all group">
              <svg className="w-4 h-4 text-gray-400 group-hover:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-[1600px] w-full mx-auto p-4 lg:p-6">
        
        {errorMessage && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-300 text-xs backdrop-blur-xl">
            {errorMessage}
          </div>
        )}

        {/* ============ TAB: MARKETS ============ */}
        {activeTab === 'calendar' && (
          <div className="animate-in fade-in duration-500">
            
            {/* HERO STATS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4 mb-6">
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 hover:border-[#FF6600]/20 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">Gold Spot</span>
                  <span className="text-[10px] text-green-400 font-mono">▲ Live</span>
                </div>
                <div className="text-2xl font-mono font-semibold text-white">{marketData?.['XAU/USD']?.price || '—'}</div>
                <div className="text-[10px] text-gray-500 mt-1">XAU / USD</div>
              </div>

              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 hover:border-[#FF6600]/20 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">Euro</span>
                  <span className="text-[10px] text-red-400 font-mono">▼ Live</span>
                </div>
                <div className="text-2xl font-mono font-semibold text-white">{marketData?.['EUR/USD']?.price || '—'}</div>
                <div className="text-[10px] text-gray-500 mt-1">EUR / USD</div>
              </div>

              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 hover:border-[#FF6600]/20 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">High Impact</span>
                  <span className="text-[10px] text-[#FF6600] font-mono">Today</span>
                </div>
                <div className="text-2xl font-mono font-semibold text-white">{highImpactToday}</div>
                <div className="text-[10px] text-gray-500 mt-1">Major events</div>
              </div>

              <div className="bg-gradient-to-br from-[#FF6600]/10 to-transparent backdrop-blur-xl border border-[#FF6600]/20 rounded-2xl p-5 hover:border-[#FF6600]/40 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] text-[#FF6600] uppercase tracking-widest font-medium">Next Catalyst</span>
                  <span className="text-[10px] text-[#FF6600] font-mono">{countdown}</span>
                </div>
                <div className="text-sm font-semibold text-white truncate">{nextHighImpact?.title || 'No events'}</div>
                <div className="text-[10px] text-gray-500 mt-1">{nextHighImpact ? `${nextHighImpact.country} · ${formatTimeWIB(nextHighImpact.date)} WIB` : '—'}</div>
              </div>
            </div>

            {/* MAIN GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
              
              {/* CALENDAR */}
              <div className="lg:col-span-4 bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-3xl flex flex-col h-[650px] overflow-hidden">
                <div className="p-5 flex justify-between items-center border-b border-white/5">
                  <div>
                    <h2 className="text-sm font-semibold text-white">Economic Calendar</h2>
                    <p className="text-[10px] text-gray-500 mt-0.5">Filter by date</p>
                  </div>
                  <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
                    {['yesterday', 'today', 'tomorrow'].map((f) => (
                      <button key={f} onClick={() => setDateFilter(f as any)}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-medium uppercase transition-all ${
                          dateFilter === f ? 'bg-[#FF6600] text-black' : 'text-gray-400 hover:text-white'
                        }`}
                      >{f === 'yesterday' ? 'Yest' : f === 'today' ? 'Today' : 'Tmrw'}</button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {importantEvents.length === 0 && (
                    <div className="p-8 text-center text-gray-600 text-xs">No events</div>
                  )}
                  {importantEvents.map((ev, i) => (
                    <div key={i} className="p-4 border-b border-white/5 hover:bg-white/[0.02] transition-colors group cursor-pointer"
                      onClick={() => { setSelectedEvent(ev); setAnalysis(null); setSelectedPair(ev.country === 'USD' ? 'XAU/USD' : 'EUR/USD'); }}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${ev.impact === 'High' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'bg-amber-400'}`}></span>
                          <span className="text-[10px] text-gray-500 font-mono">{formatDateWIB(ev.date)} · {formatTimeWIB(ev.date)}</span>
                        </div>
                        <span className="text-[10px] font-bold text-[#FF6600] opacity-0 group-hover:opacity-100 transition-opacity">ANALYZE →</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-[#FF6600] w-8">{ev.country}</span>
                        <span className="text-xs text-gray-200 flex-1">{ev.title}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* CHART */}
              <div className="lg:col-span-5 bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-3xl flex flex-col h-[650px] overflow-hidden">
                <div className="p-5 border-b border-white/5 flex justify-between items-center">
                  <div>
                    <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                      <svg className="w-4 h-4 text-[#FF6600]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                      Gold / U.S. Dollar
                    </h2>
                    <p className="text-[10px] text-gray-500 mt-0.5">15-minute interval · Live</p>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-1 rounded-md bg-[#FF6600]/10 text-[#FF6600] border border-[#FF6600]/20">LIVE</span>
                </div>
                <div id="tradingview_chart" ref={chartContainerRef} className="w-full flex-1 rounded-b-3xl overflow-hidden" />
              </div>

              {/* AI PANEL */}
              <div className="lg:col-span-3 bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-3xl flex flex-col h-[650px] overflow-hidden">
                <div className="p-5 border-b border-white/5 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#FF6600] animate-pulse"></div>
                      AI Signal
                    </h2>
                    <p className="text-[10px] text-gray-500 mt-0.5">DeepSeek Engine</p>
                  </div>
                </div>
                <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
                  {analysis ? (
                    <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
                      
                      {/* SIGNAL CARD */}
                      <div className={`relative rounded-2xl p-6 overflow-hidden ${
                        analysis.direction === 'buy' ? 'bg-gradient-to-br from-green-500/20 via-green-500/5 to-transparent border border-green-500/30' : 
                        analysis.direction === 'sell' ? 'bg-gradient-to-br from-red-500/20 via-red-500/5 to-transparent border border-red-500/30' : 
                        'bg-gradient-to-br from-gray-500/20 via-gray-500/5 to-transparent border border-gray-500/30'
                      }`}>
                        <div className="absolute top-0 right-0 w-32 h-32 blur-3xl opacity-30 rounded-full" style={{ background: analysis.direction === 'buy' ? '#22c55e' : analysis.direction === 'sell' ? '#ef4444' : '#6b7280' }}></div>
                        <div className="relative">
                          <div className="text-[10px] text-white/60 font-mono tracking-wider mb-2">{analysis.pair} · {analysis.timeframe}</div>
                          <div className={`text-4xl font-bold tracking-tight ${analysis.direction === 'buy' ? 'text-green-400' : analysis.direction === 'sell' ? 'text-red-400' : 'text-gray-400'}`}>
                            {analysis.direction === 'buy' ? '▲ BUY' : analysis.direction === 'sell' ? '▼ SELL' : analysis.direction.toUpperCase()}
                          </div>
                          <div className="text-[10px] text-white/40 font-mono mt-2">Live: {analysis.current_price}</div>
                        </div>
                      </div>
                      
                      {/* LEVELS */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center py-2.5 border-b border-white/5">
                          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Entry</span>
                          <span className="text-sm font-mono font-semibold text-white">{analysis.entry_zone}</span>
                        </div>
                        <div className="flex justify-between items-center py-2.5 border-b border-white/5">
                          <span className="text-[10px] text-red-400/70 uppercase tracking-wider">Stop Loss</span>
                          <span className="text-sm font-mono font-semibold text-red-400">{analysis.stop_loss}</span>
                        </div>
                        <div className="flex justify-between items-center py-2.5 border-b border-white/5">
                          <span className="text-[10px] text-green-400/70 uppercase tracking-wider">Take Profit</span>
                          <span className="text-sm font-mono font-semibold text-green-400">{analysis.take_profit}</span>
                        </div>
                        <div className="flex justify-between items-center py-2.5">
                          <span className="text-[10px] text-[#FF6600] uppercase tracking-wider font-medium">R:R</span>
                          <span className="text-sm font-mono font-semibold text-[#FF6600]">1:{rrRatio}</span>
                        </div>
                      </div>

                      {/* RATIONALE */}
                      <div className="pt-2">
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Rationale</div>
                        <div className="text-xs text-gray-300 leading-relaxed">
                          {analysis.direction === 'no_trade' ? analysis.no_trade_reason : (
                            <ul className="space-y-1.5">
                              <li className="flex gap-2"><span className="text-[#FF6600]">·</span>{analysis.rationale?.surprise}</li>
                              <li className="flex gap-2"><span className="text-[#FF6600]">·</span>{analysis.rationale?.historical}</li>
                            </ul>
                          )}
                        </div>
                      </div>

                      {/* ACTIONS */}
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <button onClick={() => saveTradeToJournal('win')} className="bg-green-500/10 hover:bg-green-500 text-green-400 hover:text-black border border-green-500/30 py-2.5 rounded-xl text-xs font-semibold transition-all">WIN</button>
                        <button onClick={() => saveTradeToJournal('loss')} className="bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-black border border-red-500/30 py-2.5 rounded-xl text-xs font-semibold transition-all">LOSS</button>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center px-4">
                      <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center mb-4">
                        <svg className="w-7 h-7 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed">Select an economic event<br/>to generate an AI signal.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============ TAB: SIGNALS ============ */}
        {activeTab === 'daily' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">Daily Signals</h2>
                <p className="text-xs text-gray-500 mt-1">AI-powered setups published for today</p>
              </div>
              <button 
                onClick={generateDailySignals} 
                disabled={isGeneratingDaily}
                className="bg-[#FF6600] text-black px-5 py-2.5 rounded-xl text-xs font-semibold tracking-wider uppercase shadow-lg shadow-[#FF6600]/20 hover:bg-[#E65C00] disabled:opacity-50 transition-all"
              >
                {isGeneratingDaily ? 'Generating...' : dailySignals.length > 0 ? 'Regenerate' : 'Generate Signals'}
              </button>
            </div>

            {/* BENTO STATS */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5">
                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Total Signals</div>
                <div className="text-3xl font-mono font-semibold text-white">{aiTotalSignals}</div>
              </div>
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5">
                <div className="text-[10px] text-green-400/70 uppercase tracking-widest mb-2">Won</div>
                <div className="text-3xl font-mono font-semibold text-green-400">{aiWins}</div>
              </div>
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5">
                <div className="text-[10px] text-red-400/70 uppercase tracking-widest mb-2">Lost</div>
                <div className="text-3xl font-mono font-semibold text-red-400">{aiLosses}</div>
              </div>
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5">
                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Pending</div>
                <div className="text-3xl font-mono font-semibold text-gray-400">{aiPending}</div>
              </div>
              <div className="bg-gradient-to-br from-[#FF6600]/20 to-[#FF6600]/5 backdrop-blur-xl border border-[#FF6600]/30 rounded-2xl p-5">
                <div className="text-[10px] text-[#FF6600] uppercase tracking-widest mb-2 font-medium">Accuracy</div>
                <div className="text-3xl font-mono font-semibold text-[#FF6600]">{aiWinRate}%</div>
              </div>
            </div>

            {dailySignals.length === 0 && !isGeneratingDaily && (
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-3xl p-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-400 font-medium">No signals yet</p>
                <p className="text-xs text-gray-600 mt-1">Click "Generate Signals" to start.</p>
              </div>
            )}

            {isGeneratingDaily && (
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-3xl p-16 text-center">
                <div className="w-8 h-8 border-2 border-[#FF6600] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-sm text-[#FF6600] font-medium">AI is analyzing markets...</p>
              </div>
            )}

            {dailySignals.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {dailySignals.map((sig, i) => {
                  let rr = "-";
                  const parseNum = (str: string) => parseFloat(String(str).split('-')[0].replace(/[^0-9.]/g, ''));
                  const e = parseNum(sig.entry_zone); const s = parseNum(sig.stop_loss); const t = parseNum(sig.take_profit);
                  if (!isNaN(e) && !isNaN(s) && !isNaN(t) && e !== s) rr = `1:${(Math.abs(t - e) / Math.abs(e - s)).toFixed(1)}`;

                  return (
                    <div key={i} className="relative bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-3xl overflow-hidden hover:border-[#FF6600]/30 transition-all group">
                      {sig.status !== 'pending' && (
                        <div className={`absolute top-4 right-4 px-2.5 py-1 text-[9px] font-bold rounded-full ${
                          sig.status === 'win' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 
                          'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}>
                          {sig.status.toUpperCase()}
                        </div>
                      )}
                      
                      <div className="p-6 border-b border-white/5">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`w-2 h-2 rounded-full ${sig.direction === 'buy' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${sig.direction === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                            {sig.direction === 'buy' ? 'Bullish' : 'Bearish'}
                          </span>
                        </div>
                        <div className="text-xl font-bold text-white">{sig.pair}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">{sig.timeframe}</div>
                      </div>

                      <div className="p-5 space-y-2.5 text-xs font-mono">
                        <div className="flex justify-between"><span className="text-gray-500">Entry</span><span className="text-white font-semibold">{sig.entry_zone}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">SL</span><span className="text-red-400 font-semibold">{sig.stop_loss}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">TP</span><span className="text-green-400 font-semibold">{sig.take_profit}</span></div>
                        <div className="flex justify-between pt-2 border-t border-white/5 mt-2">
                          <span className="text-[#FF6600] font-medium">R:R</span>
                          <span className="text-[#FF6600] font-semibold">{rr}</span>
                        </div>
                      </div>

                      <div className="p-4 bg-white/[0.01] border-t border-white/5">
                        <p className="text-[10px] text-gray-500 italic leading-relaxed line-clamp-2">"{sig.rationale}"</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ============ TAB: ARCHIVE ============ */}
        {activeTab === 'history' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white tracking-tight">Historical Archive</h2>
              <p className="text-xs text-gray-500 mt-1">Past economic events and their outcomes</p>
            </div>
            <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-3xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-white/[0.02] text-gray-500 text-[10px] uppercase tracking-widest border-b border-white/5">
                    <tr>
                      <th className="px-6 py-4 font-medium">Date</th>
                      <th className="px-6 py-4 font-medium">Currency</th>
                      <th className="px-6 py-4 font-medium">Event</th>
                      <th className="px-6 py-4 text-center font-medium">Actual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {pastEvents.map((ev, i) => (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4 text-gray-400 font-mono">{formatDateWIB(ev.date)}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 rounded-md bg-[#FF6600]/10 text-[#FF6600] font-semibold text-[10px]">{ev.country}</span>
                        </td>
                        <td className="px-6 py-4 text-gray-300">{ev.title}</td>
                        <td className="px-6 py-4 text-center text-white font-mono font-semibold">{ev.actual || '—'}</td>
                      </tr>
                    ))}
                    {pastEvents.length === 0 && (
                      <tr><td colSpan={4} className="text-center py-12 text-gray-600 text-sm">No archived events.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============ TAB: JOURNAL ============ */}
        {activeTab === 'performance' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white tracking-tight">Trade Journal</h2>
              <p className="text-xs text-gray-500 mt-1">Your personal execution ledger</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4 mb-8">
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6">
                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Total Trades</div>
                <div className="text-3xl font-mono font-semibold text-white">{totalTrades}</div>
              </div>
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6">
                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Win Rate</div>
                <div className={`text-3xl font-mono font-semibold ${Number(winRate) >= 50 ? 'text-green-400' : 'text-red-400'}`}>{winRate}%</div>
              </div>
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6">
                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Net Pips</div>
                <div className={`text-3xl font-mono font-semibold ${totalPips >= 0 ? 'text-green-400' : 'text-red-400'}`}>{totalPips > 0 ? '+' : ''}{totalPips}</div>
              </div>
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6">
                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">W / L</div>
                <div className="text-3xl font-mono font-semibold text-white">{wins}/{losses}</div>
              </div>
            </div>

            <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-3xl overflow-hidden">
              <div className="p-6 border-b border-white/5 flex justify-between items-center">
                <h3 className="text-sm font-semibold text-white">Execution Ledger</h3>
                <input 
                  type="month" 
                  value={filterMonth} 
                  onChange={(e) => setFilterMonth(e.target.value)} 
                  className="bg-white/5 border border-white/10 text-white text-xs px-3 py-2 rounded-lg outline-none focus:border-[#FF6600]/50 transition-all" 
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-white/[0.02] text-gray-500 text-[10px] uppercase tracking-widest border-b border-white/5">
                    <tr>
                      <th className="px-6 py-4 font-medium">Date</th>
                      <th className="px-6 py-4 font-medium">Pair</th>
                      <th className="px-6 py-4 font-medium">Result</th>
                      <th className="px-6 py-4 text-right font-medium">Pips</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredJournal.map((trade, i) => (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4 text-gray-400 font-mono">{new Date(trade.closed_at).toLocaleDateString('id-ID')}</td>
                        <td className="px-6 py-4 font-semibold text-white">{trade.pair}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            trade.result === 'win' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                          }`}>
                            <span className={`w-1 h-1 rounded-full ${trade.result === 'win' ? 'bg-green-400' : 'bg-red-400'}`}></span>
                            {trade.result.toUpperCase()}
                          </span>
                        </td>
                        <td className={`px-6 py-4 text-right font-mono font-semibold ${trade.pips > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {trade.pips > 0 ? '+' : ''}{trade.pips}
                        </td>
                      </tr>
                    ))}
                    {filteredJournal.length === 0 && (
                      <tr><td colSpan={4} className="text-center py-12 text-gray-600 text-sm">No trades recorded.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============ TAB: RISK ============ */}
        {activeTab === 'calculator' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white tracking-tight">Risk Management</h2>
              <p className="text-xs text-gray-500 mt-1">Position sizing calculator</p>
            </div>

            <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-3xl p-6 lg:p-8 space-y-5">
                <div>
                  <label className="block text-[10px] text-gray-500 font-medium mb-2 uppercase tracking-widest">Account Balance</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                    <input 
                      type="number" 
                      value={calcBalance} 
                      onChange={(e) => setCalcBalance(Number(e.target.value))} 
                      className="w-full bg-white/5 border border-white/10 rounded-xl text-white pl-8 pr-4 py-3 text-lg font-mono outline-none focus:border-[#FF6600]/50 transition-all" 
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] text-gray-500 font-medium mb-2 uppercase tracking-widest">Risk %</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        value={calcRisk} 
                        onChange={(e) => setCalcRisk(Number(e.target.value))} 
                        className="w-full bg-white/5 border border-white/10 rounded-xl text-white px-4 py-3 text-lg font-mono outline-none focus:border-[#FF6600]/50 transition-all" 
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 font-medium mb-2 uppercase tracking-widest">Stop Loss</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        value={calcSl} 
                        onChange={(e) => setCalcSl(Number(e.target.value))} 
                        className="w-full bg-white/5 border border-white/10 rounded-xl text-white px-4 py-3 text-lg font-mono outline-none focus:border-[#FF6600]/50 transition-all" 
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-xs">pips</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-[#FF6600]/10 via-white/[0.02] to-transparent backdrop-blur-xl border border-[#FF6600]/20 rounded-3xl p-6 lg:p-8 flex flex-col justify-center">
                <div className="text-center mb-6">
                  <div className="text-[10px] text-gray-500 font-medium uppercase tracking-widest mb-2">Risk Amount</div>
                  <div className="text-4xl font-mono font-bold text-red-400">${riskAmountUSD.toFixed(2)}</div>
                </div>
                <div className="w-full h-px bg-white/10 mb-6"></div>
                <div className="text-center">
                  <div className="text-[10px] text-[#FF6600] font-medium uppercase tracking-widest mb-2">Position Size</div>
                  <div className="text-5xl font-mono font-bold text-[#FF6600] mb-1">{lotSizeStandard.toFixed(2)}</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest">Standard Lots</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MOBILE BOTTOM NAV */}
      <nav className="lg:hidden fixed bottom-4 left-4 right-4 z-40">
        <div className="bg-[#09090B]/90 backdrop-blur-2xl border border-white/10 rounded-2xl flex justify-around items-center h-16 shadow-2xl">
          {navTabs.map((tab) => (
            <button 
              key={tab.id} 
              onClick={() => setActiveTab(tab.id as any)} 
              className={`flex flex-col items-center justify-center gap-1 w-full h-full rounded-xl mx-1 transition-all ${
                activeTab === tab.id ? 'text-[#FF6600] bg-[#FF6600]/10' : 'text-gray-500'
              }`}
            >
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* MODAL ANALISIS */}
      {selectedEvent && !analysis && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-[#09090B] border border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-white/5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-xl bg-[#FF6600]/10 border border-[#FF6600]/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-[#FF6600]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Generate Signal</h3>
                  <p className="text-[10px] text-gray-500 truncate">{selectedEvent.title}</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <form onSubmit={handleAnalyze} className="space-y-4">
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-2 font-medium">Select Pair</label>
                  <select 
                    value={selectedPair} 
                    onChange={(e) => setSelectedPair(e.target.value)} 
                    className="w-full bg-white/5 border border-white/10 text-white p-3 rounded-xl text-sm font-mono outline-none focus:border-[#FF6600]/50 transition-all"
                  >
                    <option value="EUR/USD">EUR/USD</option>
                    <option value="XAU/USD">XAU/USD</option>
                    <option value="USD/JPY">USD/JPY</option>
                  </select>
                </div>
                <div className="bg-white/[0.03] border border-white/5 p-4 rounded-xl text-center">
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Live Price</div>
                  <div className="text-lg font-mono text-[#FF6600] font-semibold">{marketData?.[selectedPair]?.price || '—'}</div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button 
                    type="button" 
                    onClick={() => setSelectedEvent(null)} 
                    className="flex-1 px-4 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 text-xs font-medium transition-all"
                  >Cancel</button>
                  <button 
                    type="submit" 
                    disabled={isAnalyzing} 
                    className="flex-[2] bg-[#FF6600] text-black font-semibold py-3 rounded-xl text-xs shadow-lg shadow-[#FF6600]/20 hover:bg-[#E65C00] disabled:opacity-50 transition-all"
                  >{isAnalyzing ? 'Processing...' : 'Analyze'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE SIGNAL RESULT */}
      {analysis && (
        <div className="lg:hidden fixed inset-0 bg-black/90 backdrop-blur-md z-50 overflow-y-auto p-4 flex flex-col">
          <div className="bg-[#09090B] border border-white/10 rounded-3xl w-full max-w-sm mx-auto my-auto shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-5 border-b border-white/5 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-white">Signal Result</h3>
              <button 
                onClick={() => { setAnalysis(null); setSelectedEvent(null); }} 
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className={`relative rounded-2xl p-6 overflow-hidden ${
                analysis.direction === 'buy' ? 'bg-gradient-to-br from-green-500/20 to-transparent border border-green-500/30' : 
                analysis.direction === 'sell' ? 'bg-gradient-to-br from-red-500/20 to-transparent border border-red-500/30' : 
                'bg-gradient-to-br from-gray-500/20 to-transparent border border-gray-500/30'
              }`}>
                <div className="text-[10px] text-white/60 font-mono tracking-wider mb-2">{analysis.pair} · {analysis.timeframe}</div>
                <div className={`text-5xl font-bold tracking-tight ${analysis.direction === 'buy' ? 'text-green-400' : analysis.direction === 'sell' ? 'text-red-400' : 'text-gray-400'}`}>
                  {analysis.direction === 'buy' ? '▲ BUY' : analysis.direction === 'sell' ? '▼ SELL' : analysis.direction.toUpperCase()}
                </div>
                <div className="text-[10px] text-white/40 font-mono mt-2">Live: {analysis.current_price}</div>
              </div>
              
              <div className="space-y-1">
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider">Entry</span>
                  <span className="text-sm font-mono font-semibold text-white">{analysis.entry_zone}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-[10px] text-red-400/70 uppercase tracking-wider">Stop Loss</span>
                  <span className="text-sm font-mono font-semibold text-red-400">{analysis.stop_loss}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-[10px] text-green-400/70 uppercase tracking-wider">Take Profit</span>
                  <span className="text-sm font-mono font-semibold text-green-400">{analysis.take_profit}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-[10px] text-[#FF6600] uppercase tracking-wider font-medium">R:R</span>
                  <span className="text-sm font-mono font-semibold text-[#FF6600]">1:{rrRatio}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button onClick={() => saveTradeToJournal('win')} className="bg-green-500/10 hover:bg-green-500 text-green-400 hover:text-black border border-green-500/30 py-3 rounded-xl text-xs font-semibold transition-all">WIN</button>
                <button onClick={() => saveTradeToJournal('loss')} className="bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-black border border-red-500/30 py-3 rounded-xl text-xs font-semibold transition-all">LOSS</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}