'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

function formatCountdown(diffMs: number): string {
  if (diffMs <= 0) return '00:00:00';
  const h = Math.floor(diffMs / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  const s = Math.floor((diffMs % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getMaxDurationHours(timeframe: string): number {
  const tf = (timeframe || '').toLowerCase();
  if (tf.includes('scalp') || tf.includes('m15') || tf.includes('m5')) return 4;
  if (tf.includes('swing') || tf.includes('daily') || tf.includes('d1')) return 168;
  return 24; // default Intraday
}

function parseNum(str: string): number {
  return parseFloat(String(str).split('-')[0].replace(/[^0-9.]/g, ''));
}

function LiveClock({ className = '' }: { className?: string }) {
  const [time, setTime] = useState('');
  useEffect(() => {
    function tick() { setTime(new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })); }
    tick();
    const timer = setInterval(tick, 1000);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  return <span className={className}>{time || '--:--:--'}</span>;
}

function CountdownTimer({ targetDate, className = '' }: { targetDate: string | null; className?: string }) {
  const [display, setDisplay] = useState('00:00:00');
  useEffect(() => {
    if (!targetDate) { setDisplay('—'); return; }
    const target = new Date(targetDate).getTime();
    if (isNaN(target)) { setDisplay('—'); return; }
    function tick() { setDisplay(formatCountdown(target - Date.now())); }
    tick();
    const timer = setInterval(tick, 1000);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVis); };
  }, [targetDate]);
  return <span className={`font-mono tabular-nums ${className}`}>{display}</span>;
}

const SESSION_DATA = [
  { key: 'SYD', name: 'Sydney', openUTC: 21, closeUTC: 6 },
  { key: 'TYO', name: 'Tokyo', openUTC: 0, closeUTC: 9 },
  { key: 'LDN', name: 'London', openUTC: 7, closeUTC: 16 },
  { key: 'NYC', name: 'New York', openUTC: 12, closeUTC: 21 },
];

function SessionsTracker() {
  const [sessions, setSessions] = useState<{ key: string; name: string; isOpen: boolean; timeInfo: string }[]>([]);
  useEffect(() => {
    function calc() {
      const now = new Date();
      const utcH = now.getUTCHours() + now.getUTCMinutes() / 60;
      const result = SESSION_DATA.map(s => {
        let isOpen: boolean, closeDiff: number;
        if (s.openUTC < s.closeUTC) {
          isOpen = utcH >= s.openUTC && utcH < s.closeUTC;
          closeDiff = isOpen ? s.closeUTC - utcH : (s.openUTC > utcH ? s.openUTC - utcH : 24 - utcH + s.openUTC);
        } else {
          isOpen = utcH >= s.openUTC || utcH < s.closeUTC;
          closeDiff = isOpen ? (utcH < s.closeUTC ? s.closeUTC - utcH : 24 - utcH + s.closeUTC) : (s.openUTC - utcH);
        }
        const h = Math.floor(closeDiff);
        const m = Math.floor((closeDiff - h) * 60);
        return { key: s.key, name: s.name, isOpen, timeInfo: isOpen ? `${h}h ${m}m left` : `in ${h}h ${m}m` };
      });
      setSessions(result);
    }
    calc();
    const timer = setInterval(calc, 1000);
    const onVis = () => { if (document.visibilityState === 'visible') calc(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  
  return (
    <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar">
      {sessions.map((s) => (
        <div key={s.key} className={`flex items-center gap-1.5 px-2 py-1 rounded-md border shrink-0 ${s.isOpen ? 'bg-green-500/10 border-green-500/30' : 'bg-white/[0.02] border-white/5'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${s.isOpen ? 'bg-green-400 shadow-[0_0_6px_rgba(34,197,94,0.8)]' : 'bg-gray-600'}`}></span>
          <span className={`text-[9px] font-bold tracking-wider ${s.isOpen ? 'text-green-400' : 'text-gray-500'}`}>{s.key}</span>
          <span className={`text-[9px] tabular-nums hidden sm:inline ${s.isOpen ? 'text-green-400/70' : 'text-gray-600'}`}>{s.timeInfo}</span>
        </div>
      ))}
    </div>
  );
}

type PriceAlert = { id: string; pair: string; target: number; direction: 'above' | 'below'; triggered: boolean; createdAt: number };

export default function Dashboard() {
  const [session, setSession] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authMessage, setAuthMessage] = useState<{ type: 'error' | 'success', text: string } | null>(null);
  const [isAuthProcessing, setIsAuthProcessing] = useState(false);

  const [activeTab, setActiveTab] = useState<'calendar' | 'daily' | 'history' | 'performance' | 'calculator'>('calendar');
  const [marketData, setMarketData] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [journal, setJournal] = useState<any[]>([]);
  const [dailySignals, setDailySignals] = useState<any[]>([]);
  const [isGeneratingDaily, setIsGeneratingDaily] = useState(false);
  const [chartInterval, setChartInterval] = useState('15'); 
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [selectedPair, setSelectedPair] = useState<string>('XAU/USD');
  const [isSavingTrade, setIsSavingTrade] = useState(false);
  const [filterMonth, setFilterMonth] = useState('');
  const [focusMode, setFocusMode] = useState(false);
  const [dateFilter, setDateFilter] = useState<'yesterday' | 'today' | 'tomorrow'>('today');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [calcBalance, setCalcBalance] = useState<number | ''>(10000);
  const [calcRisk, setCalcRisk] = useState<number | ''>(1);
  const [calcSl, setCalcSl] = useState<number | ''>(20);
  const [nextHighImpact, setNextHighImpact] = useState<any>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const strengthChartRef = useRef<HTMLDivElement>(null);
  const [notifPermission, setNotifPermission] = useState<string>('default');
  const [notifiedEvents, setNotifiedEvents] = useState<string[]>([]);

  // ==== SIGNAL EVALUATION STATE ====
  const [lastEvaluatedAt, setLastEvaluatedAt] = useState<number | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [signalFilter, setSignalFilter] = useState<'all' | 'pending' | 'resolved'>('all');
  const marketDataRef = useRef<any>(null);

  // Keep marketDataRef in sync
  useEffect(() => { marketDataRef.current = marketData; }, [marketData]);

  // ==== PRICE ALERTS ====
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const [alertsModalOpen, setAlertsModalOpen] = useState(false);
  const [newAlertPair, setNewAlertPair] = useState('XAU/USD');
  const [newAlertPrice, setNewAlertPrice] = useState('');
  const [newAlertDirection, setNewAlertDirection] = useState<'above' | 'below'>('above');

  // ==== CHAT ====
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    try {
      const stored = localStorage.getItem('newssai_price_alerts');
      if (stored) setPriceAlerts(JSON.parse(stored));
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem('newssai_price_alerts', JSON.stringify(priceAlerts)); } catch (e) { /* ignore */ }
  }, [priceAlerts]);

  // Check price alerts
  useEffect(() => {
    if (!marketData) return;
    const timer = setInterval(() => {
      setPriceAlerts(prev => {
        const triggered = prev.filter(a => !a.triggered && (
          a.direction === 'above' 
            ? Number(marketData[a.pair]?.price) >= a.target
            : Number(marketData[a.pair]?.price) <= a.target
        ));
        if (triggered.length === 0) return prev;
        triggered.forEach(a => {
          if (notifPermission === 'granted') {
            new Notification(`🎯 ${a.pair} Alert`, {
              body: `Price hit ${Number(marketData[a.pair]?.price).toFixed(2)} (target: ${a.direction} ${a.target})`,
              icon: '/logo.png',
            });
          }
        });
        return prev.map(a => triggered.find(t => t.id === a.id) ? { ...a, triggered: true } : a);
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [marketData, notifPermission]);

  // ============================================================
  // CORE: EVALUATE ALL PENDING SIGNALS
  // ============================================================
  const evaluateAllPendingSignals = useCallback(async () => {
    const currentMarket = marketDataRef.current;
    if (!currentMarket || isEvaluating) return;
    
    setIsEvaluating(true);
    try {
      // Fetch ALL pending signals (not just today)
      const { data: pendingSignals, error } = await supabase
        .from('daily_signals')
        .select('*')
        .eq('status', 'pending');
      
      if (error || !pendingSignals || pendingSignals.length === 0) {
        setLastEvaluatedAt(Date.now());
        setIsEvaluating(false);
        return;
      }

      const now = Date.now();
      let changed = false;

      for (const sig of pendingSignals) {
        const currentPrice = Number(currentMarket[sig.pair]?.price);
        if (!currentPrice || isNaN(currentPrice)) continue;

        const entry = parseNum(sig.entry_zone);
        const sl = parseNum(sig.stop_loss);
        const tp = parseNum(sig.take_profit);
        if (isNaN(entry) || isNaN(sl) || isNaN(tp)) continue;

        let newStatus: 'win' | 'loss' | null = null;
        let resolvedPrice = currentPrice;
        let pipsResult = 0;

        // Check TP hit
        if (sig.direction === 'buy' && currentPrice >= tp) {
          newStatus = 'win';
          resolvedPrice = tp;
          pipsResult = tp - entry;
        } else if (sig.direction === 'sell' && currentPrice <= tp) {
          newStatus = 'win';
          resolvedPrice = tp;
          pipsResult = entry - tp;
        }
        // Check SL hit
        else if (sig.direction === 'buy' && currentPrice <= sl) {
          newStatus = 'loss';
          resolvedPrice = sl;
          pipsResult = sl - entry;
        } else if (sig.direction === 'sell' && currentPrice >= sl) {
          newStatus = 'loss';
          resolvedPrice = sl;
          pipsResult = entry - sl;
        }
        // Check expiry
        else {
          const createdAt = new Date(sig.created_at || sig.signal_date).getTime();
          const maxHours = getMaxDurationHours(sig.timeframe);
          const hoursElapsed = (now - createdAt) / 3600000;

          if (hoursElapsed >= maxHours) {
            const profit = sig.direction === 'buy' ? currentPrice - entry : entry - currentPrice;
            newStatus = profit > 0 ? 'win' : 'loss';
            resolvedPrice = currentPrice;
            pipsResult = profit;
          }
        }

        if (newStatus) {
          await supabase.from('daily_signals').update({
            status: newStatus,
            resolved_price: resolvedPrice,
            resolved_at: new Date().toISOString(),
            pips_result: pipsResult,
          }).eq('id', sig.id);
          changed = true;
        }
      }

      setLastEvaluatedAt(Date.now());
      if (changed) fetchDailySignals();
    } catch (err) {
      console.error('Evaluate error:', err);
    }
    setIsEvaluating(false);
  }, [isEvaluating]);

  // Auto-evaluate every 30s + on visibility change
  useEffect(() => {
    if (!session || !marketData) return;
    
    // Immediate evaluation on mount/marketData change
    evaluateAllPendingSignals();
    
    // Every 30s
    const interval = setInterval(() => {
      evaluateAllPendingSignals();
    }, 30000);
    
    // On tab visible
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        evaluateAllPendingSignals();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [session, marketData, evaluateAllPendingSignals]);

  // Chart effect
  useEffect(() => {
    if (activeTab === 'calendar' && typeof window !== 'undefined' && chartContainerRef.current) {
      chartContainerRef.current.innerHTML = '';
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      script.onload = () => {
        new (window as any).TradingView.widget({
          autosize: true, symbol: "OANDA:XAUUSD", interval: chartInterval,
          timezone: "Asia/Jakarta", theme: "dark", style: "1", locale: "id", toolbar_bg: "#09090B",
          enable_publishing: false, hide_top_toolbar: true, hide_legend: true, save_image: false,
          container_id: chartContainerRef.current?.id,
        });
      };
      chartContainerRef.current.appendChild(script);
    }
  }, [activeTab, session, chartInterval]);

  useEffect(() => {
    if (activeTab === 'calendar' && typeof window !== 'undefined' && strengthChartRef.current && !strengthChartRef.current.hasChildNodes()) {
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-forex-heat-map.js';
      script.async = true;
      script.innerHTML = JSON.stringify({
        width: "100%", height: "100%",
        currencies: ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD"],
        isTransparent: true, colorTheme: "dark", locale: "id",
      });
      strengthChartRef.current.appendChild(script);
    }
  }, [activeTab]);

  useEffect(() => {
    if (chatOpen && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, chatOpen]);

  async function requestNotifPermission() {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotifPermission(permission);
      if (permission === 'granted') new Notification("NewssAI", { body: "Notifications activated.", icon: '/logo.png' });
    }
  }

  useEffect(() => {
    if (notifPermission !== 'granted' || !nextHighImpact) return;
    const timer = setInterval(() => {
      const eventTime = new Date(nextHighImpact.date).getTime();
      const diffMinutes = (eventTime - Date.now()) / 60000;
      if (diffMinutes > 0 && diffMinutes <= 15 && !notifiedEvents.includes(nextHighImpact.title)) {
        new Notification("High Impact Alert", { body: `${nextHighImpact.title} in ${Math.ceil(diffMinutes)} min`, icon: '/logo.png' });
        setNotifiedEvents(prev => [...prev, nextHighImpact.title]);
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [nextHighImpact, notifPermission, notifiedEvents]);

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
    const syncData = async () => { try { await fetch('/api/sync'); fetchMarketData(); } catch (err) {} };
    fetchNews(); fetchMarketData(); fetchJournal(); fetchDailySignals(); syncData();
    const interval = setInterval(() => { fetchNews(); syncData(); }, 60000); 
    return () => { clearInterval(interval); };
  }, [session]);

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
    // Fetch last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data, error } = await supabase
      .from('daily_signals')
      .select('*')
      .gte('signal_date', thirtyDaysAgo.toISOString().slice(0, 10))
      .order('signal_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);
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
        take_profit: s.take_profit, invalidation: s.invalidation, rationale: s.rationale, 
        status: 'pending', created_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from('daily_signals').upsert(toInsert, { onConflict: 'signal_date,pair' });
      if (error) throw error;
      fetchDailySignals();
      // Immediately try to evaluate (in case any already hit TP/SL)
      setTimeout(() => evaluateAllPendingSignals(), 2000);
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

  // MANUAL RESOLVE
  async function manualResolve(sig: any, forceStatus: 'win' | 'loss' | 'expire') {
    const currentPrice = Number(marketData?.[sig.pair]?.price);
    if (!currentPrice || isNaN(currentPrice)) return alert("No live price available.");
    
    const entry = parseNum(sig.entry_zone);
    let newStatus: 'win' | 'loss';
    let pipsResult: number;
    
    if (forceStatus === 'win') {
      newStatus = 'win';
      pipsResult = Math.abs(parseNum(sig.take_profit) - entry) || 20;
    } else if (forceStatus === 'loss') {
      newStatus = 'loss';
      pipsResult = -Math.abs(parseNum(sig.stop_loss) - entry) || -15;
    } else {
      // Expire by current price
      const profit = sig.direction === 'buy' ? currentPrice - entry : entry - currentPrice;
      newStatus = profit > 0 ? 'win' : 'loss';
      pipsResult = profit;
    }
    
    const { error } = await supabase.from('daily_signals').update({
      status: newStatus,
      resolved_price: currentPrice,
      resolved_at: new Date().toISOString(),
      pips_result: pipsResult,
    }).eq('id', sig.id);
    
    if (!error) fetchDailySignals();
  }

  function addPriceAlert() {
    if (!newAlertPrice || isNaN(Number(newAlertPrice))) return alert("Masukkan harga valid.");
    const newAlert: PriceAlert = {
      id: crypto.randomUUID(), pair: newAlertPair, target: Number(newAlertPrice),
      direction: newAlertDirection, triggered: false, createdAt: Date.now(),
    };
    setPriceAlerts(prev => [newAlert, ...prev]);
    setNewAlertPrice('');
  }

  function removePriceAlert(id: string) { setPriceAlerts(prev => prev.filter(a => a.id !== id)); }

  async function sendChatMessage(e?: React.FormEvent) {
    e?.preventDefault();
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = { role: 'user' as const, content: chatInput.trim() };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput('');
    setChatLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          marketContext: {
            XAU_USD: marketData?.['XAU/USD']?.price,
            EUR_USD: marketData?.['EUR/USD']?.price,
            GBP_USD: marketData?.['GBP/USD']?.price,
            USD_JPY: marketData?.['USD/JPY']?.price,
            next_high_impact: nextHighImpact?.title,
            next_high_impact_time: nextHighImpact ? formatTimeWIB(nextHighImpact.date) : null,
            time_wib: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
          },
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Error: ' + err.message }]);
    }
    setChatLoading(false);
  }

  // ============================================
  // COMPUTED STATS
  // ============================================
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

  // AI stats (from resolved only)
  const aiResolved = dailySignals.filter(s => s.status !== 'pending');
  const aiPending = dailySignals.filter(s => s.status === 'pending');
  const aiWins = aiResolved.filter(s => s.status === 'win').length;
  const aiLosses = aiResolved.filter(s => s.status === 'loss').length;
  const aiWinRate = aiResolved.length > 0 ? ((aiWins / aiResolved.length) * 100).toFixed(1) : "0.0";
  const aiTotalPips = aiResolved.reduce((acc, s) => acc + (Number(s.pips_result) || 0), 0);

  // Filtered signals for display
  const displayedSignals = dailySignals.filter(s => {
    if (signalFilter === 'pending') return s.status === 'pending';
    if (signalFilter === 'resolved') return s.status !== 'pending';
    return true;
  });

  let rrRatio = "0.0";
  if (analysis && analysis.direction !== 'no_trade' && analysis.entry_zone && analysis.stop_loss && analysis.take_profit) {
    const entry = parseNum(analysis.entry_zone); const sl = parseNum(analysis.stop_loss); const tp = parseNum(analysis.take_profit);
    if (!isNaN(entry) && !isNaN(sl) && !isNaN(tp) && entry !== sl) {
      rrRatio = (Math.abs(tp - entry) / Math.abs(entry - sl)).toFixed(1);
    }
  }

  const navTabs = [
    { id: 'calendar', label: 'Markets', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13l4-4 3 3 4-6 4 5 3-3" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18" />
      </svg>
    )},
    { id: 'daily', label: 'Signals', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    )},
    { id: 'history', label: 'Archive', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
      </svg>
    )},
    { id: 'performance', label: 'Journal', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )},
    { id: 'calculator', label: 'Risk', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m-6 4h6m-6 4h6m-6 4h6M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" />
      </svg>
    )},
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
      <div className="min-h-screen bg-[#09090B] flex items-center justify-center p-4 font-sans text-white relative">
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
    <div className="min-h-screen flex flex-col bg-[#09090B] text-gray-300 font-sans text-sm selection:bg-[#FF6600] selection:text-black pb-28 lg:pb-0 relative">
      
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-[#FF6600] opacity-[0.03] rounded-full blur-[120px]"></div>
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-[#FF6600] opacity-[0.02] rounded-full blur-[120px]"></div>
      </div>

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
                <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${activeTab === tab.id ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}>
                  {tab.icon}{tab.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden md:flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-full px-4 py-1.5">
              <span className="text-[10px] font-mono"><span className="text-gray-500">XAU</span> <span className="text-[#FF6600]">{marketData?.['XAU/USD']?.price || '—'}</span></span>
            </div>
            <button onClick={() => setAlertsModalOpen(true)}
              className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/[0.03] border border-white/5 hover:bg-[#FF6600]/10 hover:border-[#FF6600]/30 flex items-center justify-center transition-all">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
              {priceAlerts.filter(a => !a.triggered).length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#FF6600] text-black text-[9px] font-bold rounded-full flex items-center justify-center">
                  {priceAlerts.filter(a => !a.triggered).length}
                </span>
              )}
            </button>
            {notifPermission !== 'granted' && (
              <button onClick={requestNotifPermission} className="text-[10px] font-semibold text-[#FF6600] hover:text-white transition-colors px-2.5 sm:px-3 py-1.5 rounded-lg border border-[#FF6600]/30 hover:bg-[#FF6600]/10">
                <span className="hidden sm:inline">Enable Alerts</span><span className="sm:hidden">🔔</span>
              </button>
            )}
            <button onClick={handleRefresh} disabled={isRefreshing} className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] flex items-center justify-center transition-all">
              <svg className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
            <button onClick={handleLogout} className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/[0.03] border border-white/5 hover:bg-red-500/10 hover:border-red-500/30 flex items-center justify-center transition-all group">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 group-hover:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </div>
        </div>
        <div className="border-t border-white/5 bg-[#09090B]">
          <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-[9px] text-gray-500 uppercase tracking-widest font-bold hidden lg:inline shrink-0">Sessions</span>
              <div className="overflow-x-auto custom-scrollbar min-w-0"><SessionsTracker /></div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 bg-white/[0.03] border border-white/5 rounded-full px-2.5 sm:px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              <LiveClock className="text-[10px] sm:text-[11px] text-gray-200 font-mono tracking-wider tabular-nums" />
              <span className="text-[9px] sm:text-[10px] text-gray-500 font-medium">WIB</span>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-[1600px] w-full mx-auto p-4 lg:p-6">
        {errorMessage && (<div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-300 text-xs backdrop-blur-xl">{errorMessage}</div>)}

        {activeTab === 'calendar' && (
          <div className="animate-in fade-in duration-500">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4 mb-6">
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3"><span className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">Gold</span><span className="text-[10px] text-green-400 font-mono">▲</span></div>
                <div className="text-xl sm:text-2xl font-mono font-semibold text-white">{marketData?.['XAU/USD']?.price || '—'}</div>
                <div className="text-[10px] text-gray-500 mt-1">XAU / USD</div>
              </div>
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3"><span className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">Euro</span><span className="text-[10px] text-red-400 font-mono">▼</span></div>
                <div className="text-xl sm:text-2xl font-mono font-semibold text-white">{marketData?.['EUR/USD']?.price || '—'}</div>
                <div className="text-[10px] text-gray-500 mt-1">EUR / USD</div>
              </div>
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3"><span className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">High Impact</span><span className="text-[10px] text-[#FF6600] font-mono">Today</span></div>
                <div className="text-xl sm:text-2xl font-mono font-semibold text-white">{highImpactToday}</div>
                <div className="text-[10px] text-gray-500 mt-1">Major events</div>
              </div>
              <div className="bg-gradient-to-br from-[#FF6600]/10 to-transparent backdrop-blur-xl border border-[#FF6600]/20 rounded-2xl p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3"><span className="text-[10px] text-[#FF6600] uppercase tracking-widest font-medium">Next</span><CountdownTimer targetDate={nextHighImpact?.date || null} className="text-[10px] text-[#FF6600]" /></div>
                <div className="text-sm font-semibold text-white truncate">{nextHighImpact?.title || 'No events'}</div>
                <div className="text-[10px] text-gray-500 mt-1">{nextHighImpact ? `${nextHighImpact.country} · ${formatTimeWIB(nextHighImpact.date)}` : '—'}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 mb-6">
              <div className="lg:col-span-4 bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-3xl flex flex-col h-[650px] overflow-hidden">
                <div className="p-5 flex justify-between items-center border-b border-white/5">
                  <div><h2 className="text-sm font-semibold text-white">Calendar</h2><p className="text-[10px] text-gray-500 mt-0.5">Filter by date</p></div>
                  <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
                    {['yesterday', 'today', 'tomorrow'].map((f) => (
                      <button key={f} onClick={() => setDateFilter(f as any)}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-medium uppercase transition-all ${dateFilter === f ? 'bg-[#FF6600] text-black' : 'text-gray-400 hover:text-white'}`}>
                        {f === 'yesterday' ? 'Yest' : f === 'today' ? 'Today' : 'Tmrw'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {importantEvents.length === 0 && <div className="p-8 text-center text-gray-600 text-xs">No events</div>}
                  {importantEvents.map((ev, i) => (
                    <div key={i} className="p-4 border-b border-white/5 hover:bg-white/[0.02] transition-colors group cursor-pointer"
                      onClick={() => { setSelectedEvent(ev); setAnalysis(null); setSelectedPair(ev.country === 'USD' ? 'XAU/USD' : 'EUR/USD'); }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${ev.impact === 'High' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'bg-amber-400'}`}></span>
                          <span className="text-[10px] text-gray-500 font-mono">{formatDateWIB(ev.date)} · {formatTimeWIB(ev.date)}</span>
                        </div>
                        <span className="text-[10px] font-bold text-[#FF6600] opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                      </div>
                      <div className="flex items-center gap-2"><span className="text-[10px] font-bold text-[#FF6600] w-8">{ev.country}</span><span className="text-xs text-gray-200 flex-1">{ev.title}</span></div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-5 bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-3xl flex flex-col h-[650px] overflow-hidden">
                <div className="p-5 border-b border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <svg className="w-4 h-4 text-[#FF6600]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                    XAU / USD
                  </h2>
                  <div className="flex items-center gap-1 bg-[#09090B] border border-white/10 rounded-xl p-1">
                    {['1', '5', '15', '60', '240', 'D'].map((tf) => (
                      <button key={tf} onClick={() => setChartInterval(tf)}
                        className={`px-2 sm:px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${chartInterval === tf ? 'bg-[#FF6600] text-black shadow-[0_0_10px_rgba(255,102,0,0.3)]' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                        {tf === 'D' ? '1D' : tf === '60' ? '1H' : tf === '240' ? '4H' : `${tf}m`}
                      </button>
                    ))}
                  </div>
                </div>
                <div id="tradingview_chart" ref={chartContainerRef} className="w-full flex-1 rounded-b-3xl overflow-hidden" />
              </div>

              <div className="lg:col-span-3 bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-3xl flex flex-col h-[650px] overflow-hidden">
                <div className="p-5 border-b border-white/5">
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[#FF6600] animate-pulse"></div>AI Signal</h2>
                  <p className="text-[10px] text-gray-500 mt-0.5">DeepSeek Engine</p>
                </div>
                <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
                  {analysis ? (
                    <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
                      <div className={`relative rounded-2xl p-6 overflow-hidden ${analysis.direction === 'buy' ? 'bg-gradient-to-br from-green-500/20 via-green-500/5 to-transparent border border-green-500/30' : analysis.direction === 'sell' ? 'bg-gradient-to-br from-red-500/20 via-red-500/5 to-transparent border border-red-500/30' : 'bg-gradient-to-br from-gray-500/20 via-gray-500/5 to-transparent border border-gray-500/30'}`}>
                        <div className="absolute top-0 right-0 w-32 h-32 blur-3xl opacity-30 rounded-full" style={{ background: analysis.direction === 'buy' ? '#22c55e' : analysis.direction === 'sell' ? '#ef4444' : '#6b7280' }}></div>
                        <div className="relative">
                          <div className="text-[10px] text-white/60 font-mono tracking-wider mb-2">{analysis.pair} · {analysis.timeframe}</div>
                          <div className={`text-4xl font-bold tracking-tight ${analysis.direction === 'buy' ? 'text-green-400' : analysis.direction === 'sell' ? 'text-red-400' : 'text-gray-400'}`}>
                            {analysis.direction === 'buy' ? '▲ BUY' : analysis.direction === 'sell' ? '▼ SELL' : analysis.direction.toUpperCase()}
                          </div>
                          <div className="text-[10px] text-white/40 font-mono mt-2">Live: {analysis.current_price}</div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between items-center py-2.5 border-b border-white/5"><span className="text-[10px] text-gray-500 uppercase tracking-wider">Entry</span><span className="text-sm font-mono font-semibold text-white">{analysis.entry_zone}</span></div>
                        <div className="flex justify-between items-center py-2.5 border-b border-white/5"><span className="text-[10px] text-red-400/70 uppercase tracking-wider">Stop</span><span className="text-sm font-mono font-semibold text-red-400">{analysis.stop_loss}</span></div>
                        <div className="flex justify-between items-center py-2.5 border-b border-white/5"><span className="text-[10px] text-green-400/70 uppercase tracking-wider">Target</span><span className="text-sm font-mono font-semibold text-green-400">{analysis.take_profit}</span></div>
                        <div className="flex justify-between items-center py-2.5"><span className="text-[10px] text-[#FF6600] uppercase tracking-wider font-medium">R:R</span><span className="text-sm font-mono font-semibold text-[#FF6600]">1:{rrRatio}</span></div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <button onClick={() => saveTradeToJournal('win')} className="bg-green-500/10 hover:bg-green-500 text-green-400 hover:text-black border border-green-500/30 py-2.5 rounded-xl text-xs font-semibold transition-all">WIN</button>
                        <button onClick={() => saveTradeToJournal('loss')} className="bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-black border border-red-500/30 py-2.5 rounded-xl text-xs font-semibold transition-all">LOSS</button>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center px-4">
                      <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center mb-4">
                        <svg className="w-7 h-7 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed">Select an economic event<br/>to generate an AI signal.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-3xl overflow-hidden">
              <div className="p-5 border-b border-white/5 flex justify-between items-center">
                <div>
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <svg className="w-4 h-4 text-[#FF6600]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                    Currency Strength Heatmap
                  </h2>
                  <p className="text-[10px] text-gray-500 mt-0.5">Real-time movement · 8 majors</p>
                </div>
                <span className="text-[10px] font-mono px-2 py-1 rounded-md bg-[#FF6600]/10 text-[#FF6600] border border-[#FF6600]/20">LIVE</span>
              </div>
              <div ref={strengthChartRef} className="tradingview-widget-container w-full h-[400px]" />
            </div>
          </div>
        )}

        {activeTab === 'daily' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            
            {/* HEADER WITH EVALUATE */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">Daily Signals</h2>
                <p className="text-xs text-gray-500 mt-1">
                  Auto-evaluated every 30s · {lastEvaluatedAt ? `Last: ${new Date(lastEvaluatedAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })}` : 'Not yet evaluated'}
                </p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <button onClick={evaluateAllPendingSignals} disabled={isEvaluating}
                  className="flex-1 sm:flex-none bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 text-white px-4 py-2.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  <svg className={`w-3.5 h-3.5 ${isEvaluating ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {isEvaluating ? 'Evaluating...' : 'Evaluate Now'}
                </button>
                <button onClick={generateDailySignals} disabled={isGeneratingDaily}
                  className="flex-1 sm:flex-none bg-[#FF6600] text-black px-5 py-2.5 rounded-xl text-xs font-semibold tracking-wider uppercase shadow-lg shadow-[#FF6600]/20 hover:bg-[#E65C00] disabled:opacity-50 transition-all">
                  {isGeneratingDaily ? 'Generating...' : 'Generate Signals'}
                </button>
              </div>
            </div>

            {/* STATS */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4">
                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Total</div>
                <div className="text-2xl font-mono font-semibold text-white">{dailySignals.length}</div>
              </div>
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4">
                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Pending</div>
                <div className="text-2xl font-mono font-semibold text-amber-400">{aiPending.length}</div>
              </div>
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4">
                <div className="text-[10px] text-green-400/70 uppercase tracking-widest mb-1">Won</div>
                <div className="text-2xl font-mono font-semibold text-green-400">{aiWins}</div>
              </div>
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4">
                <div className="text-[10px] text-red-400/70 uppercase tracking-widest mb-1">Lost</div>
                <div className="text-2xl font-mono font-semibold text-red-400">{aiLosses}</div>
              </div>
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4">
                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Net Pips</div>
                <div className={`text-2xl font-mono font-semibold ${aiTotalPips >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {aiTotalPips > 0 ? '+' : ''}{aiTotalPips.toFixed(0)}
                </div>
              </div>
              <div className="bg-gradient-to-br from-[#FF6600]/20 to-[#FF6600]/5 backdrop-blur-xl border border-[#FF6600]/30 rounded-2xl p-4">
                <div className="text-[10px] text-[#FF6600] uppercase tracking-widest font-medium mb-1">Accuracy</div>
                <div className="text-2xl font-mono font-semibold text-[#FF6600]">{aiWinRate}%</div>
              </div>
            </div>

            {/* FILTER TABS */}
            <div className="flex gap-1 mb-4 bg-white/[0.02] border border-white/[0.06] p-1 rounded-xl w-fit">
              {[
                { id: 'all', label: `All (${dailySignals.length})` },
                { id: 'pending', label: `Pending (${aiPending.length})` },
                { id: 'resolved', label: `Resolved (${aiResolved.length})` },
              ].map(f => (
                <button key={f.id} onClick={() => setSignalFilter(f.id as any)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${signalFilter === f.id ? 'bg-[#FF6600] text-black' : 'text-gray-400 hover:text-white'}`}>
                  {f.label}
                </button>
              ))}
            </div>

            {displayedSignals.length === 0 && !isGeneratingDaily && (
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-3xl p-16 text-center">
                <p className="text-sm text-gray-400 font-medium">No signals</p>
                <p className="text-xs text-gray-600 mt-1">Click "Generate Signals" to create new signals.</p>
              </div>
            )}

            {isGeneratingDaily && (
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-3xl p-16 text-center">
                <div className="w-8 h-8 border-2 border-[#FF6600] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-sm text-[#FF6600] font-medium">AI is analyzing markets...</p>
              </div>
            )}

            {displayedSignals.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {displayedSignals.map((sig, i) => {
                  const e = parseNum(sig.entry_zone); const s = parseNum(sig.stop_loss); const t = parseNum(sig.take_profit);
                  let rr = "-";
                  if (!isNaN(e) && !isNaN(s) && !isNaN(t) && e !== s) rr = `1:${(Math.abs(t - e) / Math.abs(e - s)).toFixed(1)}`;
                  
                  const isPending = sig.status === 'pending';
                  const isWin = sig.status === 'win';
                  const isLoss = sig.status === 'loss';
                  const pips = Number(sig.pips_result) || 0;

                  return (
                    <div key={i} className={`relative bg-white/[0.02] backdrop-blur-xl border rounded-3xl overflow-hidden transition-all ${
                      isPending ? 'border-white/[0.06]' : 
                      isWin ? 'border-green-500/30' : 'border-red-500/30'
                    }`}>
                      <div className={`absolute top-4 right-4 px-2.5 py-1 text-[9px] font-bold rounded-full ${
                        isPending ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 
                        isWin ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 
                        'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}>
                        {isPending ? '● PENDING' : isWin ? '✓ WIN' : '✗ LOSS'}
                      </div>
                      
                      <div className="p-6 border-b border-white/5">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`w-2 h-2 rounded-full ${sig.direction === 'buy' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${sig.direction === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                            {sig.direction === 'buy' ? 'Bullish' : 'Bearish'}
                          </span>
                        </div>
                        <div className="text-xl font-bold text-white">{sig.pair}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">{sig.timeframe} · {formatDateWIB(sig.signal_date)}</div>
                      </div>

                      <div className="p-5 space-y-2.5 text-xs font-mono">
                        <div className="flex justify-between"><span className="text-gray-500">Entry</span><span className="text-white font-semibold">{sig.entry_zone}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">SL</span><span className="text-red-400 font-semibold">{sig.stop_loss}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">TP</span><span className="text-green-400 font-semibold">{sig.take_profit}</span></div>
                        
                        {!isPending && (
                          <>
                            <div className="flex justify-between pt-2 border-t border-white/5 mt-2">
                              <span className="text-gray-500">Resolved</span>
                              <span className="text-gray-300 font-semibold">{sig.resolved_price ? Number(sig.resolved_price).toFixed(2) : '—'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className={`font-medium ${pips >= 0 ? 'text-green-400' : 'text-red-400'}`}>Pips</span>
                              <span className={`font-bold ${pips >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {pips > 0 ? '+' : ''}{pips.toFixed(1)}
                              </span>
                            </div>
                          </>
                        )}
                        
                        <div className="flex justify-between pt-2 border-t border-white/5">
                          <span className="text-[#FF6600] font-medium">R:R</span>
                          <span className="text-[#FF6600] font-semibold">{rr}</span>
                        </div>
                      </div>

                      {/* MANUAL RESOLVE (only for pending) */}
                      {isPending && (
                        <div className="p-4 bg-white/[0.01] border-t border-white/5">
                          <div className="text-[9px] text-gray-500 uppercase tracking-widest mb-2 text-center">Manual Resolve</div>
                          <div className="grid grid-cols-3 gap-1">
                            <button onClick={() => manualResolve(sig, 'win')} className="bg-green-500/10 hover:bg-green-500 text-green-400 hover:text-black border border-green-500/20 py-1.5 rounded-lg text-[10px] font-bold transition-all">
                              WIN
                            </button>
                            <button onClick={() => manualResolve(sig, 'expire')} className="bg-white/5 hover:bg-white/10 text-gray-400 border border-white/10 py-1.5 rounded-lg text-[10px] font-bold transition-all">
                              EXPIRE
                            </button>
                            <button onClick={() => manualResolve(sig, 'loss')} className="bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-black border border-red-500/20 py-1.5 rounded-lg text-[10px] font-bold transition-all">
                              LOSS
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {!isPending && (
                        <div className="p-4 bg-white/[0.01] border-t border-white/5">
                          <p className="text-[10px] text-gray-500 italic leading-relaxed line-clamp-2">"{sig.rationale}"</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white tracking-tight">Historical Archive</h2>
              <p className="text-xs text-gray-500 mt-1">Past economic events</p>
            </div>
            <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-3xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-white/[0.02] text-gray-500 text-[10px] uppercase tracking-widest border-b border-white/5">
                    <tr><th className="px-4 sm:px-6 py-4 font-medium">Date</th><th className="px-4 sm:px-6 py-4 font-medium">Cur</th><th className="px-4 sm:px-6 py-4 font-medium">Event</th><th className="px-4 sm:px-6 py-4 text-center font-medium">Actual</th></tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {pastEvents.map((ev, i) => (
                      <tr key={i} className="hover:bg-white/[0.02]">
                        <td className="px-4 sm:px-6 py-4 text-gray-400 font-mono">{formatDateWIB(ev.date)}</td>
                        <td className="px-4 sm:px-6 py-4"><span className="px-2 py-1 rounded-md bg-[#FF6600]/10 text-[#FF6600] font-semibold text-[10px]">{ev.country}</span></td>
                        <td className="px-4 sm:px-6 py-4 text-gray-300">{ev.title}</td>
                        <td className="px-4 sm:px-6 py-4 text-center text-white font-mono font-semibold">{ev.actual || '—'}</td>
                      </tr>
                    ))}
                    {pastEvents.length === 0 && (<tr><td colSpan={4} className="text-center py-12 text-gray-600 text-sm">No archived events.</td></tr>)}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'performance' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="mb-8"><h2 className="text-2xl font-bold text-white tracking-tight">Trade Journal</h2><p className="text-xs text-gray-500 mt-1">Execution ledger</p></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4 mb-8">
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4 sm:p-6"><div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Trades</div><div className="text-2xl sm:text-3xl font-mono font-semibold text-white">{totalTrades}</div></div>
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4 sm:p-6"><div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Win Rate</div><div className={`text-2xl sm:text-3xl font-mono font-semibold ${Number(winRate) >= 50 ? 'text-green-400' : 'text-red-400'}`}>{winRate}%</div></div>
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4 sm:p-6"><div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Net Pips</div><div className={`text-2xl sm:text-3xl font-mono font-semibold ${totalPips >= 0 ? 'text-green-400' : 'text-red-400'}`}>{totalPips > 0 ? '+' : ''}{totalPips}</div></div>
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4 sm:p-6"><div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">W / L</div><div className="text-2xl sm:text-3xl font-mono font-semibold text-white">{wins}/{losses}</div></div>
            </div>
            <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-3xl overflow-hidden">
              <div className="p-5 sm:p-6 border-b border-white/5 flex justify-between items-center">
                <h3 className="text-sm font-semibold text-white">Ledger</h3>
                <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="bg-white/5 border border-white/10 text-white text-xs px-3 py-2 rounded-lg outline-none focus:border-[#FF6600]/50 transition-all" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-white/[0.02] text-gray-500 text-[10px] uppercase tracking-widest border-b border-white/5">
                    <tr><th className="px-4 sm:px-6 py-4 font-medium">Date</th><th className="px-4 sm:px-6 py-4 font-medium">Pair</th><th className="px-4 sm:px-6 py-4 font-medium">Result</th><th className="px-4 sm:px-6 py-4 text-right font-medium">Pips</th></tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredJournal.map((trade, i) => (
                      <tr key={i} className="hover:bg-white/[0.02]">
                        <td className="px-4 sm:px-6 py-4 text-gray-400 font-mono">{new Date(trade.closed_at).toLocaleDateString('id-ID')}</td>
                        <td className="px-4 sm:px-6 py-4 font-semibold text-white">{trade.pair}</td>
                        <td className="px-4 sm:px-6 py-4"><span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${trade.result === 'win' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}><span className={`w-1 h-1 rounded-full ${trade.result === 'win' ? 'bg-green-400' : 'bg-red-400'}`}></span>{trade.result.toUpperCase()}</span></td>
                        <td className={`px-4 sm:px-6 py-4 text-right font-mono font-semibold ${trade.pips > 0 ? 'text-green-400' : 'text-red-400'}`}>{trade.pips > 0 ? '+' : ''}{trade.pips}</td>
                      </tr>
                    ))}
                    {filteredJournal.length === 0 && (<tr><td colSpan={4} className="text-center py-12 text-gray-600 text-sm">No trades.</td></tr>)}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'calculator' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="mb-8"><h2 className="text-2xl font-bold text-white tracking-tight">Risk</h2><p className="text-xs text-gray-500 mt-1">Position sizing</p></div>
            <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-3xl p-5 sm:p-8 space-y-5">
                <div><label className="block text-[10px] text-gray-500 font-medium mb-2 uppercase tracking-widest">Balance</label><div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span><input type="number" value={calcBalance} onChange={(e) => setCalcBalance(Number(e.target.value))} className="w-full bg-white/5 border border-white/10 rounded-xl text-white pl-8 pr-4 py-3 text-lg font-mono outline-none focus:border-[#FF6600]/50 transition-all" /></div></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-[10px] text-gray-500 font-medium mb-2 uppercase tracking-widest">Risk %</label><div className="relative"><input type="number" value={calcRisk} onChange={(e) => setCalcRisk(Number(e.target.value))} className="w-full bg-white/5 border border-white/10 rounded-xl text-white px-4 py-3 text-lg font-mono outline-none focus:border-[#FF6600]/50 transition-all" /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">%</span></div></div>
                  <div><label className="block text-[10px] text-gray-500 font-medium mb-2 uppercase tracking-widest">SL</label><div className="relative"><input type="number" value={calcSl} onChange={(e) => setCalcSl(Number(e.target.value))} className="w-full bg-white/5 border border-white/10 rounded-xl text-white px-4 py-3 text-lg font-mono outline-none focus:border-[#FF6600]/50 transition-all" /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-xs">pips</span></div></div>
                </div>
              </div>
              <div className="bg-gradient-to-br from-[#FF6600]/10 via-white/[0.02] to-transparent backdrop-blur-xl border border-[#FF6600]/20 rounded-3xl p-5 sm:p-8 flex flex-col justify-center">
                <div className="text-center mb-6"><div className="text-[10px] text-gray-500 font-medium uppercase tracking-widest mb-2">Risk Amount</div><div className="text-3xl sm:text-4xl font-mono font-bold text-red-400">${riskAmountUSD.toFixed(2)}</div></div>
                <div className="w-full h-px bg-white/10 mb-6"></div>
                <div className="text-center"><div className="text-[10px] text-[#FF6600] font-medium uppercase tracking-widest mb-2">Position Size</div><div className="text-4xl sm:text-5xl font-mono font-bold text-[#FF6600] mb-1">{lotSizeStandard.toFixed(2)}</div><div className="text-[10px] text-gray-500 uppercase tracking-widest">Standard Lots</div></div>
              </div>
            </div>
          </div>
        )}
      </main>

      <nav className="lg:hidden fixed bottom-3 left-3 right-3 z-40">
        <div className="bg-[#09090B]/95 backdrop-blur-2xl border border-white/10 rounded-2xl flex justify-around items-center h-[68px] shadow-2xl px-1">
          {navTabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex flex-col items-center justify-center gap-0.5 w-full h-full rounded-xl transition-all ${activeTab === tab.id ? 'text-[#FF6600] bg-[#FF6600]/10' : 'text-gray-500 active:scale-95'}`}>
              <div className={`${activeTab === tab.id ? 'scale-110' : ''} transition-transform`}>{tab.icon}</div>
              <span className="text-[9px] font-semibold tracking-wide">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <button onClick={() => setChatOpen(true)} className="fixed bottom-[100px] lg:bottom-6 right-4 lg:right-6 z-40 w-14 h-14 rounded-full bg-[#FF6600] shadow-[0_8px_32px_rgba(255,102,0,0.5)] hover:shadow-[0_8px_40px_rgba(255,102,0,0.7)] flex items-center justify-center transition-all hover:scale-110 active:scale-95" title="AI Chat">
        <svg className="w-6 h-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse border-2 border-[#09090B]"></span>
      </button>

      {alertsModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-[#09090B] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-white/5 flex justify-between items-center">
              <div><h3 className="text-sm font-semibold text-white">Price Alerts</h3><p className="text-[10px] text-gray-500 mt-0.5">Get notified when price hits target</p></div>
              <button onClick={() => setAlertsModalOpen(false)} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5 border-b border-white/5">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest font-medium mb-3">Create New Alert</div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <select value={newAlertPair} onChange={(e) => setNewAlertPair(e.target.value)} className="bg-white/5 border border-white/10 text-white p-2.5 rounded-lg text-xs font-mono outline-none focus:border-[#FF6600]/50">
                    <option value="XAU/USD">XAU/USD</option><option value="EUR/USD">EUR/USD</option><option value="GBP/USD">GBP/USD</option><option value="USD/JPY">USD/JPY</option>
                  </select>
                  <select value={newAlertDirection} onChange={(e) => setNewAlertDirection(e.target.value as any)} className="bg-white/5 border border-white/10 text-white p-2.5 rounded-lg text-xs font-mono outline-none focus:border-[#FF6600]/50">
                    <option value="above">Above ↑</option><option value="below">Below ↓</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <input type="number" value={newAlertPrice} onChange={(e) => setNewAlertPrice(e.target.value)} placeholder={`Target (current: ${marketData?.[newAlertPair]?.price || '—'})`} className="flex-1 bg-white/5 border border-white/10 text-white px-3 py-2.5 rounded-lg text-xs font-mono outline-none focus:border-[#FF6600]/50 placeholder-gray-600" />
                  <button onClick={addPriceAlert} className="bg-[#FF6600] text-black px-4 py-2.5 rounded-lg text-xs font-semibold hover:bg-[#E65C00] transition-all">Add</button>
                </div>
                {notifPermission !== 'granted' && (<button onClick={requestNotifPermission} className="w-full text-[10px] text-[#FF6600] border border-[#FF6600]/30 rounded-lg py-2 hover:bg-[#FF6600]/10 transition-all">⚠️ Enable notifications to receive alerts</button>)}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {priceAlerts.length === 0 ? (<div className="p-8 text-center text-gray-600 text-xs">No alerts set.</div>) : (
                <div className="divide-y divide-white/5">
                  {priceAlerts.map(a => (
                    <div key={a.id} className={`p-4 flex items-center justify-between ${a.triggered ? 'opacity-50' : ''}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-white">{a.pair}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-md font-mono ${a.direction === 'above' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{a.direction === 'above' ? '↑' : '↓'} {a.target}</span>
                          {a.triggered && <span className="text-[9px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">✓</span>}
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono">Current: {marketData?.[a.pair]?.price || '—'}</div>
                      </div>
                      <button onClick={() => removePriceAlert(a.id)} className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition-all">
                        <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {chatOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-[#09090B] border border-white/10 rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col h-[85vh] sm:h-[600px] animate-in slide-in-from-bottom sm:zoom-in-95 duration-300">
            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#0a0a0a]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#FF6600] flex items-center justify-center shadow-[0_0_15px_rgba(255,102,0,0.4)]">
                  <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <div><div className="text-sm font-semibold text-white">AI Analyst</div><div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span><span className="text-[10px] text-green-400">Online</span></div></div>
              </div>
              <button onClick={() => setChatOpen(false)} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {chatMessages.length === 0 && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-2xl bg-[#FF6600]/10 border border-[#FF6600]/20 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-[#FF6600]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                  </div>
                  <p className="text-sm text-white font-semibold mb-1">Ask me anything</p>
                  <p className="text-xs text-gray-500 mb-4">I have access to live prices, news, and signals</p>
                  <div className="space-y-2">
                    {['Analisa XAU/USD hari ini?', 'Berita high impact berikutnya kapan?', 'Kapan waktu terbaik entry EUR/USD?'].map((q, i) => (
                      <button key={i} onClick={() => setChatInput(q)} className="block w-full text-left text-xs text-gray-400 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-2 transition-all">"{q}"</button>
                    ))}
                  </div>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-xs leading-relaxed ${msg.role === 'user' ? 'bg-[#FF6600] text-black rounded-br-md' : 'bg-white/5 text-gray-200 border border-white/10 rounded-bl-md'}`}>{msg.content}</div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-white/5 border border-white/10 px-4 py-3 rounded-2xl rounded-bl-md">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 rounded-full bg-[#FF6600] animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 rounded-full bg-[#FF6600] animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 rounded-full bg-[#FF6600] animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={sendChatMessage} className="p-3 border-t border-white/5 bg-[#0a0a0a]">
              <div className="flex gap-2">
                <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Ask about markets..." disabled={chatLoading} className="flex-1 bg-white/5 border border-white/10 text-white px-4 py-3 rounded-xl text-xs outline-none focus:border-[#FF6600]/50 transition-all placeholder-gray-600 disabled:opacity-50" />
                <button type="submit" disabled={chatLoading || !chatInput.trim()} className="w-11 h-11 rounded-xl bg-[#FF6600] hover:bg-[#E65C00] disabled:opacity-50 flex items-center justify-center transition-all">
                  <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" /></svg>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedEvent && !analysis && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-[#09090B] border border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-white/5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-xl bg-[#FF6600]/10 border border-[#FF6600]/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-[#FF6600]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <div><h3 className="text-sm font-semibold text-white">Generate Signal</h3><p className="text-[10px] text-gray-500 truncate">{selectedEvent.title}</p></div>
              </div>
            </div>
            <div className="p-6">
              <form onSubmit={handleAnalyze} className="space-y-4">
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-2 font-medium">Pair</label>
                  <select value={selectedPair} onChange={(e) => setSelectedPair(e.target.value)} className="w-full bg-white/5 border border-white/10 text-white p-3 rounded-xl text-sm font-mono outline-none focus:border-[#FF6600]/50 transition-all">
                    <option value="EUR/USD">EUR/USD</option><option value="XAU/USD">XAU/USD</option><option value="USD/JPY">USD/JPY</option>
                  </select>
                </div>
                <div className="bg-white/[0.03] border border-white/5 p-4 rounded-xl text-center">
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Live Price</div>
                  <div className="text-lg font-mono text-[#FF6600] font-semibold">{marketData?.[selectedPair]?.price || '—'}</div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setSelectedEvent(null)} className="flex-1 px-4 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 text-xs font-medium transition-all">Cancel</button>
                  <button type="submit" disabled={isAnalyzing} className="flex-[2] bg-[#FF6600] text-black font-semibold py-3 rounded-xl text-xs shadow-lg shadow-[#FF6600]/20 hover:bg-[#E65C00] disabled:opacity-50 transition-all">{isAnalyzing ? 'Processing...' : 'Analyze'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {analysis && (
        <div className="lg:hidden fixed inset-0 bg-black/90 backdrop-blur-md z-50 overflow-y-auto p-4 flex flex-col">
          <div className="bg-[#09090B] border border-white/10 rounded-3xl w-full max-w-sm mx-auto my-auto shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-5 border-b border-white/5 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-white">Signal</h3>
              <button onClick={() => { setAnalysis(null); setSelectedEvent(null); }} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className={`relative rounded-2xl p-6 overflow-hidden ${analysis.direction === 'buy' ? 'bg-gradient-to-br from-green-500/20 to-transparent border border-green-500/30' : analysis.direction === 'sell' ? 'bg-gradient-to-br from-red-500/20 to-transparent border border-red-500/30' : 'bg-gradient-to-br from-gray-500/20 to-transparent border border-gray-500/30'}`}>
                <div className="text-[10px] text-white/60 font-mono tracking-wider mb-2">{analysis.pair} · {analysis.timeframe}</div>
                <div className={`text-5xl font-bold tracking-tight ${analysis.direction === 'buy' ? 'text-green-400' : analysis.direction === 'sell' ? 'text-red-400' : 'text-gray-400'}`}>{analysis.direction === 'buy' ? '▲ BUY' : analysis.direction === 'sell' ? '▼ SELL' : analysis.direction.toUpperCase()}</div>
                <div className="text-[10px] text-white/40 font-mono mt-2">Live: {analysis.current_price}</div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between items-center py-2 border-b border-white/5"><span className="text-[10px] text-gray-500 uppercase tracking-wider">Entry</span><span className="text-sm font-mono font-semibold text-white">{analysis.entry_zone}</span></div>
                <div className="flex justify-between items-center py-2 border-b border-white/5"><span className="text-[10px] text-red-400/70 uppercase tracking-wider">SL</span><span className="text-sm font-mono font-semibold text-red-400">{analysis.stop_loss}</span></div>
                <div className="flex justify-between items-center py-2 border-b border-white/5"><span className="text-[10px] text-green-400/70 uppercase tracking-wider">TP</span><span className="text-sm font-mono font-semibold text-green-400">{analysis.take_profit}</span></div>
                <div className="flex justify-between items-center py-2"><span className="text-[10px] text-[#FF6600] uppercase tracking-wider font-medium">R:R</span><span className="text-sm font-mono font-semibold text-[#FF6600]">1:{rrRatio}</span></div>
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