'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

/* ============ HELPERS ============ */
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
  return 24;
}

function parseNum(str: string): number {
  return parseFloat(String(str).split('-')[0].replace(/[^0-9.]/g, ''));
}

function getPairCurrencies(pair: string): string[] {
  if (pair === 'XAU/USD') return ['USD'];
  return pair.split('/');
}

// PIP MULTIPLIER per instrument
function getPipMultiplier(pair: string): number {
  const p = (pair || '').toUpperCase();
  if (p.includes('XAU')) return 1;        // Gold: 1 unit = 1 pip (e.g. 4012→4055 = +43)
  if (p.includes('JPY')) return 100;      // JPY pairs: 0.01 = 1 pip
  return 10000;                           // Forex majors: 0.0001 = 1 pip
}

// Compute pips correctly per pair
function computePips(sig: any): { pips: number; resolvedPrice: number | null } {
  const entry = parseNum(sig.entry_zone);
  const sl = parseNum(sig.stop_loss);
  const tp = parseNum(sig.take_profit);
  if (isNaN(entry) || isNaN(sl) || isNaN(tp)) return { pips: 0, resolvedPrice: null };
  
  const multiplier = getPipMultiplier(sig.pair);
  
  if (sig.status === 'win') {
    const diff = sig.direction === 'buy' ? tp - entry : entry - tp;
    return { pips: Math.abs(diff) * multiplier, resolvedPrice: sig.resolved_price || tp };
  }
  if (sig.status === 'loss') {
    const diff = sig.direction === 'buy' ? entry - sl : sl - entry;
    return { pips: -Math.abs(diff) * multiplier, resolvedPrice: sig.resolved_price || sl };
  }
  return { pips: 0, resolvedPrice: null };
}

// Get news name from triggered_news OR fallback lookup (High Impact ONLY)
function getNewsForSignal(sig: any, events: any[]): string {
  const genericValues = ['high impact news', 'high impact', '—', '', 'null', 'undefined'];
  const stored = (sig.triggered_news || '').toLowerCase().trim();
  
  if (sig.triggered_news && !genericValues.includes(stored)) return sig.triggered_news;
  if (!sig.signal_date) return '—';
  
  const dateStr = sig.signal_date;
  const currencies = getPairCurrencies(sig.pair);
  const relevant = events.filter(e => {
    const eDate = new Date(e.date).toISOString().slice(0, 10);
    const impact = (e.impact || '').toLowerCase();
    return eDate === dateStr && currencies.includes(e.country) && impact === 'high';
  });
  
  if (relevant.length > 0) return relevant[0].title;
  return '—';
}

// Get news name for NEW signal being generated (High Impact ONLY)
function getNewsForPair(pair: string, events: any[]): string | null {
  const today = new Date().toDateString();
  const currencies = getPairCurrencies(pair);
  const highEvents = events.filter(e => {
    const impact = (e.impact || '').toLowerCase();
    return new Date(e.date).toDateString() === today && impact === 'high' && currencies.includes(e.country);
  });
  return highEvents.length > 0 ? highEvents[0].title : null;
}

// Fix TP/SL if AI generated wrong direction
function fixSignalLevels(sig: any, livePrice: number): any | null {
  let entry = parseNum(sig.entry_zone);
  let sl = parseNum(sig.stop_loss);
  let tp = parseNum(sig.take_profit);
  if (isNaN(entry) || isNaN(sl) || isNaN(tp)) return null;
  const deviation = Math.abs(entry - livePrice) / livePrice;
  if (deviation > 0.02) entry = livePrice;
  if (sig.direction === 'buy') {
    if (tp < entry) { const tmp = tp; tp = entry; entry = tmp; }
    if (sl > entry) { const tmp = sl; sl = entry; entry = tmp; }
    if (sl >= entry) sl = entry - Math.abs(entry - sl || entry * 0.005);
    if (tp <= entry) tp = entry + Math.abs(tp - entry || entry * 0.01);
  } else if (sig.direction === 'sell') {
    if (tp > entry) { const tmp = tp; tp = entry; entry = tmp; }
    if (sl < entry) { const tmp = sl; sl = entry; entry = tmp; }
    if (sl <= entry) sl = entry + Math.abs(sl - entry || entry * 0.005);
    if (tp >= entry) tp = entry - Math.abs(tp - entry || entry * 0.01);
  } else return null;
  return {
    ...sig,
    entry_zone: entry.toFixed(entry > 100 ? 2 : 5),
    stop_loss: sl.toFixed(sl > 100 ? 2 : 5),
    take_profit: tp.toFixed(tp > 100 ? 2 : 5),
  };
}

/* ============ COMPONENTS ============ */
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

/* ============ MAIN ============ */
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
  const [focusMode, setFocusMode] = useState(false);
  const [dateFilter, setDateFilter] = useState<'yesterday' | 'today' | 'tomorrow'>('today');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [calcBalance, setCalcBalance] = useState<number | ''>(10000);
  const [calcRisk, setCalcRisk] = useState<number | ''>(1);
  const [calcSl, setCalcSl] = useState<number | ''>(20);
  const [nextHighImpact, setNextHighImpact] = useState<any>(null);
  const [notifPermission, setNotifPermission] = useState<string>('default');
  const [notifiedEvents, setNotifiedEvents] = useState<string[]>([]);

  const [lastEvaluatedAt, setLastEvaluatedAt] = useState<number | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [signalFilter, setSignalFilter] = useState<'all' | 'pending' | 'resolved'>('all');

  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const [alertsModalOpen, setAlertsModalOpen] = useState(false);
  const [newAlertPair, setNewAlertPair] = useState('XAU/USD');
  const [newAlertPrice, setNewAlertPrice] = useState('');
  const [newAlertDirection, setNewAlertDirection] = useState<'above' | 'below'>('above');

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const strengthChartRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const marketDataRef = useRef<any>(null);
  const evaluatingRef = useRef(false);
  const backfilledRef = useRef(false);

  useEffect(() => { marketDataRef.current = marketData; }, [marketData]);

  /* ============ AUTH ============ */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setIsAuthLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { setSession(session); });
    if (typeof window !== 'undefined' && 'Notification' in window) setNotifPermission(Notification.permission);
    return () => subscription.unsubscribe();
  }, []);

  /* ============ PRICE ALERTS ============ */
  useEffect(() => {
    try { const stored = localStorage.getItem('newssai_price_alerts'); if (stored) setPriceAlerts(JSON.parse(stored)); } catch (e) {}
  }, []);
  useEffect(() => { try { localStorage.setItem('newssai_price_alerts', JSON.stringify(priceAlerts)); } catch (e) {} }, [priceAlerts]);

  useEffect(() => {
    if (!marketData) return;
    const timer = setInterval(() => {
      setPriceAlerts(prev => {
        const triggered = prev.filter(a => !a.triggered && (a.direction === 'above' ? Number(marketData[a.pair]?.price) >= a.target : Number(marketData[a.pair]?.price) <= a.target));
        if (triggered.length === 0) return prev;
        triggered.forEach(a => {
          if (notifPermission === 'granted') new Notification(`🎯 ${a.pair} Alert`, { body: `Price hit ${Number(marketData[a.pair]?.price).toFixed(2)} (target: ${a.direction} ${a.target})`, icon: '/logo.png' });
        });
        return prev.map(a => triggered.find(t => t.id === a.id) ? { ...a, triggered: true } : a);
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [marketData, notifPermission]);

  /* ============ BACKFILL ============ */
  const backfillResolvedSignals = useCallback(async () => {
    if (backfilledRef.current) return;
    backfilledRef.current = true;
    setIsBackfilling(true);
    try {
      const { data: allResolved } = await supabase.from('daily_signals').select('*').in('status', ['win', 'loss']);
      if (!allResolved) { setIsBackfilling(false); return; }
      let fixed = 0;
      for (const sig of allResolved) {
        const { pips: correctPips, resolvedPrice: correctResolvedPrice } = computePips(sig);
        const storedPips = Number(sig.pips_result);
        const pipsZeroOrWrong = storedPips === 0 || isNaN(storedPips) || Math.abs(storedPips - correctPips) > 0.5;
        const needsResolvedPrice = !sig.resolved_price;
        if (pipsZeroOrWrong || needsResolvedPrice) {
          await supabase.from('daily_signals').update({ pips_result: correctPips, resolved_price: correctResolvedPrice, resolved_at: sig.resolved_at || new Date().toISOString() }).eq('id', sig.id);
          fixed++;
        }
      }
      if (fixed > 0) fetchDailySignals();
    } catch (err) { console.error('Backfill error:', err); }
    setIsBackfilling(false);
  }, []);

  /* ============ EVALUATE PENDING ============ */
  const evaluateAllPendingSignals = useCallback(async () => {
    if (evaluatingRef.current) return;
    const currentMarket = marketDataRef.current;
    if (!currentMarket) return;
    evaluatingRef.current = true;
    setIsEvaluating(true);
    try {
      const { data: pendingSignals } = await supabase.from('daily_signals').select('*').eq('status', 'pending');
      if (!pendingSignals || pendingSignals.length === 0) { setLastEvaluatedAt(Date.now()); evaluatingRef.current = false; setIsEvaluating(false); return; }
      const now = Date.now();
      let changed = false;
      for (const sig of pendingSignals) {
        const livePrice = Number(currentMarket[sig.pair]?.price);
        if (!livePrice || isNaN(livePrice)) continue;
        const entry = parseNum(sig.entry_zone);
        const sl = parseNum(sig.stop_loss);
        const tp = parseNum(sig.take_profit);
        if (isNaN(entry) || isNaN(sl) || isNaN(tp)) continue;
        const multiplier = getPipMultiplier(sig.pair);
        let newStatus: 'win' | 'loss' | null = null;
        let resolvedPrice = livePrice;
        let pipsResult = 0;
        if (sig.direction === 'buy') {
          if (livePrice >= tp && tp > entry) { newStatus = 'win'; resolvedPrice = tp; pipsResult = Math.abs(tp - entry) * multiplier; }
          else if (livePrice <= sl && sl < entry) { newStatus = 'loss'; resolvedPrice = sl; pipsResult = -Math.abs(sl - entry) * multiplier; }
        } else if (sig.direction === 'sell') {
          if (livePrice <= tp && tp < entry) { newStatus = 'win'; resolvedPrice = tp; pipsResult = Math.abs(entry - tp) * multiplier; }
          else if (livePrice >= sl && sl > entry) { newStatus = 'loss'; resolvedPrice = sl; pipsResult = -Math.abs(entry - sl) * multiplier; }
        }
        if (!newStatus) {
          const createdAt = new Date(sig.created_at || sig.signal_date).getTime();
          const maxHours = getMaxDurationHours(sig.timeframe);
          if ((now - createdAt) / 3600000 >= maxHours) {
            const profit = sig.direction === 'buy' ? livePrice - entry : entry - livePrice;
            newStatus = profit > 0 ? 'win' : 'loss';
            resolvedPrice = livePrice;
            pipsResult = profit * multiplier;
          }
        }
        if (newStatus) {
          await supabase.from('daily_signals').update({ status: newStatus, resolved_price: resolvedPrice, resolved_at: new Date().toISOString(), pips_result: pipsResult }).eq('id', sig.id);
          changed = true;
        }
      }
      setLastEvaluatedAt(Date.now());
      if (changed) fetchDailySignals();
    } catch (err) { console.error('Evaluate error:', err); }
    evaluatingRef.current = false;
    setIsEvaluating(false);
  }, []);

  useEffect(() => {
    if (!session || !marketData) return;
    evaluateAllPendingSignals();
    const interval = setInterval(() => evaluateAllPendingSignals(), 20000);
    const onVis = () => { if (document.visibilityState === 'visible') evaluateAllPendingSignals(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVis); };
  }, [session, marketData, evaluateAllPendingSignals]);

  useEffect(() => { if (session && dailySignals.length > 0 && !backfilledRef.current) backfillResolvedSignals(); }, [session, dailySignals.length, backfillResolvedSignals]);

  /* ============ CHART ============ */
  useEffect(() => {
    if (activeTab === 'calendar' && typeof window !== 'undefined' && chartContainerRef.current) {
      chartContainerRef.current.innerHTML = '';
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      script.onload = () => {
        new (window as any).TradingView.widget({ autosize: true, symbol: "OANDA:XAUUSD", interval: chartInterval, timezone: "Asia/Jakarta", theme: "dark", style: "1", locale: "id", toolbar_bg: "#09090B", enable_publishing: false, hide_top_toolbar: true, hide_legend: true, save_image: false, container_id: chartContainerRef.current?.id });
      };
      chartContainerRef.current.appendChild(script);
    }
  }, [activeTab, session, chartInterval]);

  useEffect(() => {
    if (activeTab === 'calendar' && typeof window !== 'undefined' && strengthChartRef.current && !strengthChartRef.current.hasChildNodes()) {
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-forex-heat-map.js';
      script.async = true;
      script.innerHTML = JSON.stringify({ width: "100%", height: "100%", currencies: ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD"], isTransparent: true, colorTheme: "dark", locale: "id" });
      strengthChartRef.current.appendChild(script);
    }
  }, [activeTab]);

  useEffect(() => { if (chatOpen && chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages, chatOpen]);

  /* ============ NOTIF ============ */
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

  async function requestNotifPermission() {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotifPermission(permission);
      if (permission === 'granted') new Notification("NewssAI", { body: "Notifications activated.", icon: '/logo.png' });
    }
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault(); setIsAuthProcessing(true); setAuthMessage(null);
    try {
      if (authMode === 'login') { const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword }); if (error) throw error; }
      else { const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword }); if (error) throw error; setAuthMessage({ type: 'success', text: 'Account created.' }); setAuthMode('login'); }
    } catch (err: any) { setAuthMessage({ type: 'error', text: err.message }); }
    setIsAuthProcessing(false);
  }

  async function handleLogout() { await supabase.auth.signOut(); setSession(null); }

  function formatTimeWIB(dateString: string) { if (!dateString) return '-'; return new Date(dateString).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }); }
  function formatDateWIB(dateString: string) { if (!dateString) return '-'; return new Date(dateString).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' }); }

  async function handleRefresh() {
    setIsRefreshing(true);
    try { await Promise.all([fetchNews(), fetchMarketData(), fetchJournal(), fetchDailySignals()]); } catch (err) {}
    setTimeout(() => setIsRefreshing(false), 800);
  }

  useEffect(() => {
    if (!session) return;
    const syncData = async () => { try { await fetch('/api/sync'); fetchMarketData(); } catch (err) {} };
    fetchNews(); fetchMarketData(); fetchJournal(); fetchDailySignals(); syncData();
    const interval = setInterval(() => { fetchNews(); syncData(); }, 20000);
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
        const upcomingHigh = data.filter(e => {
          const impact = (e.impact || '').toLowerCase();
          return impact === 'high' && new Date(e.date) > now;
        }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
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
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data, error } = await supabase.from('daily_signals').select('*').gte('signal_date', thirtyDaysAgo.toISOString().slice(0, 10)).order('signal_date', { ascending: false }).order('created_at', { ascending: false }).limit(100);
    if (!error && data) setDailySignals(data);
  }

  /* ============ GENERATE: HIGHEST CONFIDENCE ONLY ============ */
  async function generateDailySignals() {
    if (!marketData || !marketData['XAU/USD']?.price) return alert("Live price unavailable.");

    const today = new Date().toDateString();
    const todayHighEvents = events.filter(e => {
      const impact = (e.impact || '').toLowerCase();
      return new Date(e.date).toDateString() === today && impact === 'high';
    });
    if (todayHighEvents.length === 0) return alert("❌ Tidak ada High Impact news hari ini.\n\nSignal hanya dibuat saat ada high impact news.");

    const highCurrencies = new Set(todayHighEvents.map(e => e.country));
    const allPairs = [
      { pair: 'XAU/USD', price: marketData['XAU/USD']?.price, currencies: ['USD'] },
      { pair: 'EUR/USD', price: marketData['EUR/USD']?.price, currencies: ['EUR', 'USD'] },
      { pair: 'GBP/USD', price: marketData['GBP/USD']?.price, currencies: ['GBP', 'USD'] },
      { pair: 'USD/JPY', price: marketData['USD/JPY']?.price, currencies: ['USD', 'JPY'] },
    ].filter(p => p.price && p.price !== '...');

    const pairsToAnalyze = allPairs.filter(p => p.currencies.some(c => highCurrencies.has(c))).map(p => ({ pair: p.pair, price: p.price }));
    if (pairsToAnalyze.length === 0) return alert(`❌ High news (${Array.from(highCurrencies).join(', ')}) tidak relevan.`);

    setIsGeneratingDaily(true);
    try {
      const res = await fetch('/api/daily-signal', { method: 'POST', body: JSON.stringify({ pairs: pairsToAnalyze }) });
      const signals = await res.json();
      if (!Array.isArray(signals) || signals.length === 0) throw new Error(signals.error || 'AI tidak menghasilkan signal.');

      const fixedSignals = signals
        .map((s: any) => { const livePrice = Number(marketData[s.pair]?.price); return fixSignalLevels(s, livePrice); })
        .filter((s: any) => s !== null && s.confidence >= 60);

      if (fixedSignals.length === 0) throw new Error("Semua signal confidence < 60 atau invalid.");

      const best = fixedSignals.reduce((a: any, b: any) => (b.confidence > a.confidence ? b : a));
      const todayStr = new Date().toISOString().slice(0, 10);
      await supabase.from('daily_signals').delete().eq('signal_date', todayStr).eq('status', 'pending');

      const toInsert = {
        signal_date: todayStr, pair: best.pair, direction: best.direction, confidence: best.confidence,
        timeframe: best.timeframe, entry_zone: best.entry_zone, stop_loss: best.stop_loss,
        take_profit: best.take_profit, invalidation: best.invalidation, rationale: best.rationale,
        fundamental_reason: best.fundamental_reason || '', technical_reason: best.technical_reason || '',
        status: 'pending', created_at: new Date().toISOString(),
        news_impact: 'High', triggered_news: getNewsForPair(best.pair, events) || null,
      };

      const { error } = await supabase.from('daily_signals').insert([toInsert]);
      if (error) throw error;
      fetchDailySignals();
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
    if (!analysis) return;
    setIsSavingTrade(true);
    const { error } = await supabase.from('trade_journal').insert([{ pair: analysis.pair, direction: analysis.direction, result, pips: result === 'win' ? 20 : -15, notes: `EXEC: ${selectedEvent?.title}` }]);
    if (error) alert("Save failed: " + error.message);
    else { fetchJournal(); setAnalysis(null); setSelectedEvent(null); }
    setIsSavingTrade(false);
  }

  async function manualResolve(sig: any, forceStatus: 'win' | 'loss' | 'expire') {
    const currentPrice = Number(marketData?.[sig.pair]?.price);
    if (!currentPrice || isNaN(currentPrice)) return alert("No live price.");
    const entry = parseNum(sig.entry_zone);
    const sl = parseNum(sig.stop_loss);
    const tp = parseNum(sig.take_profit);
    const multiplier = getPipMultiplier(sig.pair);
    let newStatus: 'win' | 'loss'; let pipsResult: number; let resolvedPrice: number;
    if (forceStatus === 'win') { newStatus = 'win'; pipsResult = (sig.direction === 'buy' ? Math.abs(tp - entry) : Math.abs(entry - tp)) * multiplier; resolvedPrice = tp; }
    else if (forceStatus === 'loss') { newStatus = 'loss'; pipsResult = -(sig.direction === 'buy' ? Math.abs(sl - entry) : Math.abs(entry - sl)) * multiplier; resolvedPrice = sl; }
    else {
      const profit = sig.direction === 'buy' ? currentPrice - entry : entry - currentPrice;
      newStatus = profit > 0 ? 'win' : 'loss';
      pipsResult = profit * multiplier;
      resolvedPrice = currentPrice;
    }
    const { error } = await supabase.from('daily_signals').update({ status: newStatus, resolved_price: resolvedPrice, resolved_at: new Date().toISOString(), pips_result: pipsResult }).eq('id', sig.id);
    if (!error) fetchDailySignals();
  }

  function addPriceAlert() {
    if (!newAlertPrice || isNaN(Number(newAlertPrice))) return alert("Masukkan harga valid.");
    const newAlert: PriceAlert = { id: crypto.randomUUID(), pair: newAlertPair, target: Number(newAlertPrice), direction: newAlertDirection, triggered: false, createdAt: Date.now() };
    setPriceAlerts(prev => [newAlert, ...prev]);
    setNewAlertPrice('');
  }
  function removePriceAlert(id: string) { setPriceAlerts(prev => prev.filter(a => a.id !== id)); }

  async function sendChatMessage(e?: React.FormEvent) {
    e?.preventDefault();
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = { role: 'user' as const, content: chatInput.trim() };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages); setChatInput(''); setChatLoading(true);
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: newMessages, marketContext: { XAU_USD: marketData?.['XAU/USD']?.price, EUR_USD: marketData?.['EUR/USD']?.price, GBP_USD: marketData?.['GBP/USD']?.price, USD_JPY: marketData?.['USD/JPY']?.price, next_high_impact: nextHighImpact?.title, next_high_impact_time: nextHighImpact ? formatTimeWIB(nextHighImpact.date) : null, time_wib: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) } }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err: any) { setChatMessages(prev => [...prev, { role: 'assistant', content: 'Error: ' + err.message }]); }
    setChatLoading(false);
  }

  /* ============ COMPUTED ============ */
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
    const impact = (e.impact || '').toLowerCase();
    return focusMode ? impact === 'high' : (impact === 'high' || impact === 'medium');
  });
  const pastEvents = events.filter(e => new Date(e.date) < today).reverse();
  const riskAmountUSD = (Number(calcBalance) * Number(calcRisk)) / 100;
  const lotSizeStandard = riskAmountUSD / (Number(calcSl) * 10);
  const highImpactToday = filteredByDate.filter(e => (e.impact || '').toLowerCase() === 'high').length;

  const aiResolved = dailySignals.filter(s => s.status !== 'pending');
  const aiPending = dailySignals.filter(s => s.status === 'pending');
  const aiWins = aiResolved.filter(s => s.status === 'win').length;
  const aiLosses = aiResolved.filter(s => s.status === 'loss').length;
  const aiWinRate = aiResolved.length > 0 ? ((aiWins / aiResolved.length) * 100).toFixed(1) : "0.0";
  const aiTotalPips = aiResolved.reduce((acc, s) => { const { pips } = computePips(s); return acc + pips; }, 0);

  const displayedSignals = dailySignals.filter(s => {
    if (signalFilter === 'pending') return s.status === 'pending';
    if (signalFilter === 'resolved') return s.status !== 'pending';
    return true;
  });

  let rrRatio = "0.0";
  if (analysis && analysis.direction !== 'no_trade' && analysis.entry_zone && analysis.stop_loss && analysis.take_profit) {
    const entry = parseNum(analysis.entry_zone); const sl = parseNum(analysis.stop_loss); const tp = parseNum(analysis.take_profit);
    if (!isNaN(entry) && !isNaN(sl) && !isNaN(tp) && entry !== sl) rrRatio = (Math.abs(tp - entry) / Math.abs(entry - sl)).toFixed(1);
  }

  const navTabs = [
    { id: 'calendar', label: 'Markets', icon: (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13l4-4 3 3 4-6 4 5 3-3" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18" /></svg>) },
    { id: 'daily', label: 'Signals', icon: (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>) },
    { id: 'history', label: 'History', icon: (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>) },
    { id: 'performance', label: 'Journal', icon: (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>) },
    { id: 'calculator', label: 'Risk', icon: (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m-6 4h6m-6 4h6m-6 4h6M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" /></svg>) },
  ];

  /* ============ RENDER ============ */
  if (isAuthLoading) return <div className="min-h-screen bg-[#09090B] flex items-center justify-center font-sans text-white/50 text-sm"><div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-[#FF6600] animate-pulse"></div>Initializing...</div></div>;

  if (!session) {
    return (
      <div className="min-h-screen bg-[#09090B] flex items-center justify-center p-4 font-sans text-white relative">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#FF6600] opacity-10 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="relative z-10 w-full max-w-sm">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#FF6600] shadow-[0_0_40px_rgba(255,102,0,0.4)] mb-6"><img src="/logo.png" alt="Logo" className="h-10 w-10 object-contain" /></div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-2">NewssAI</h1>
            <p className="text-xs text-gray-500 tracking-widest uppercase">Terminal Access</p>
          </div>
          <div className="bg-white/[0.02] backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
            <h2 className="text-lg font-semibold text-white text-center mb-8">{authMode === 'login' ? 'Welcome back' : 'Create account'}</h2>
            {authMessage && <div className={`mb-6 p-3 text-xs rounded-xl border ${authMessage.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-green-500/10 border-green-500/30 text-green-300'}`}>{authMessage.text}</div>}
            <form onSubmit={handleAuth} className="space-y-4">
              <div><label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-2 font-medium">Email</label><input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} required className="w-full bg-white/5 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-[#FF6600]/50 transition-all placeholder-gray-600" placeholder="name@domain.com" /></div>
              <div><label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-2 font-medium">Password</label><input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} required className="w-full bg-white/5 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-[#FF6600]/50 transition-all placeholder-gray-600" placeholder="••••••••" /></div>
              <button type="submit" disabled={isAuthProcessing} className="w-full bg-[#FF6600] text-black font-bold py-3.5 rounded-xl text-sm shadow-lg shadow-[#FF6600]/20 hover:bg-[#E65C00] disabled:opacity-50 transition-all mt-2">{isAuthProcessing ? 'Processing...' : authMode === 'login' ? 'Sign in' : 'Create account'}</button>
            </form>
            <div className="mt-6 text-center"><button onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthMessage(null); }} className="text-xs text-gray-500 hover:text-[#FF6600] transition-colors">{authMode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}</button></div>
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
              <div className="w-8 h-8 rounded-lg bg-[#FF6600] flex items-center justify-center shadow-[0_0_15px_rgba(255,102,0,0.4)]"><img src="/logo.png" alt="Logo" className="h-5 w-5 object-contain" /></div>
              <span className="text-base font-bold text-white tracking-widest uppercase">Newss<span className="text-[#FF6600]">AI</span></span>
            </div>
            <nav className="hidden lg:flex gap-1">
              {navTabs.map((tab) => (<button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${activeTab === tab.id ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}>{tab.icon}{tab.label}</button>))}
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden md:flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-full px-4 py-1.5"><span className="text-[10px] font-mono"><span className="text-gray-500">XAU</span> <span className="text-[#FF6600]">{marketData?.['XAU/USD']?.price || '—'}</span></span></div>
            <button onClick={() => setAlertsModalOpen(true)} className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/[0.03] border border-white/5 hover:bg-[#FF6600]/10 flex items-center justify-center transition-all"><svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>{priceAlerts.filter(a => !a.triggered).length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#FF6600] text-black text-[9px] font-bold rounded-full flex items-center justify-center">{priceAlerts.filter(a => !a.triggered).length}</span>}</button>
            {notifPermission !== 'granted' && <button onClick={requestNotifPermission} className="text-[10px] font-semibold text-[#FF6600] hover:text-white transition-colors px-2.5 py-1.5 rounded-lg border border-[#FF6600]/30 hover:bg-[#FF6600]/10"><span className="hidden sm:inline">Enable Alerts</span><span className="sm:hidden">🔔</span></button>}
            <button onClick={handleRefresh} disabled={isRefreshing} className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] flex items-center justify-center transition-all"><svg className={`w-3.5 h-3.5 text-gray-400 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>
            <button onClick={handleLogout} className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/[0.03] border border-white/5 hover:bg-red-500/10 flex items-center justify-center transition-all group"><svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg></button>
          </div>
        </div>
        <div className="border-t border-white/5 bg-[#09090B]">
          <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1"><span className="text-[9px] text-gray-500 uppercase tracking-widest font-bold hidden lg:inline shrink-0">Sessions</span><div className="overflow-x-auto custom-scrollbar min-w-0"><SessionsTracker /></div></div>
            <div className="flex items-center gap-1.5 shrink-0 bg-white/[0.03] border border-white/5 rounded-full px-2.5 py-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span><LiveClock className="text-[10px] text-gray-200 font-mono tracking-wider tabular-nums" /><span className="text-[9px] text-gray-500 font-medium">WIB</span></div>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-[1600px] w-full mx-auto p-4 lg:p-6">
        {errorMessage && <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-300 text-xs backdrop-blur-xl">{errorMessage}</div>}

        {/* MARKETS */}
        {activeTab === 'calendar' && (
          <div className="animate-in fade-in duration-500">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4 mb-6">
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4 sm:p-5"><div className="flex items-center justify-between mb-3"><span className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">Gold</span><span className="text-[10px] text-green-400 font-mono">▲</span></div><div className="text-xl sm:text-2xl font-mono font-semibold text-white">{marketData?.['XAU/USD']?.price || '—'}</div><div className="text-[10px] text-gray-500 mt-1">XAU / USD</div></div>
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4 sm:p-5"><div className="flex items-center justify-between mb-3"><span className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">Euro</span><span className="text-[10px] text-red-400 font-mono">▼</span></div><div className="text-xl sm:text-2xl font-mono font-semibold text-white">{marketData?.['EUR/USD']?.price || '—'}</div><div className="text-[10px] text-gray-500 mt-1">EUR / USD</div></div>
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4 sm:p-5"><div className="flex items-center justify-between mb-3"><span className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">High Impact</span><span className="text-[10px] text-[#FF6600] font-mono">Today</span></div><div className="text-xl sm:text-2xl font-mono font-semibold text-white">{highImpactToday}</div><div className="text-[10px] text-gray-500 mt-1">Major events</div></div>
              <div className="bg-gradient-to-br from-[#FF6600]/10 to-transparent backdrop-blur-xl border border-[#FF6600]/20 rounded-2xl p-4 sm:p-5"><div className="flex items-center justify-between mb-3"><span className="text-[10px] text-[#FF6600] uppercase tracking-widest font-medium">Next</span><CountdownTimer targetDate={nextHighImpact?.date || null} className="text-[10px] text-[#FF6600]" /></div><div className="text-sm font-semibold text-white truncate">{nextHighImpact?.title || 'No events'}</div><div className="text-[10px] text-gray-500 mt-1">{nextHighImpact ? `${nextHighImpact.country} · ${formatTimeWIB(nextHighImpact.date)}` : '—'}</div></div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 mb-6">
              <div className="lg:col-span-4 bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-3xl flex flex-col h-[650px] overflow-hidden">
                <div className="p-5 flex justify-between items-center border-b border-white/5"><div><h2 className="text-sm font-semibold text-white">Calendar</h2></div><div className="flex gap-1 bg-white/5 rounded-lg p-0.5">{['yesterday', 'today', 'tomorrow'].map(f => <button key={f} onClick={() => setDateFilter(f as any)} className={`px-2.5 py-1 rounded-md text-[10px] font-medium uppercase transition-all ${dateFilter === f ? 'bg-[#FF6600] text-black' : 'text-gray-400 hover:text-white'}`}>{f === 'yesterday' ? 'Yest' : f === 'today' ? 'Today' : 'Tmrw'}</button>)}</div></div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {importantEvents.length === 0 && <div className="p-8 text-center text-gray-600 text-xs">No events</div>}
                  {importantEvents.map((ev, i) => (<div key={i} className="p-4 border-b border-white/5 hover:bg-white/[0.02] cursor-pointer" onClick={() => { setSelectedEvent(ev); setAnalysis(null); setSelectedPair(ev.country === 'USD' ? 'XAU/USD' : 'EUR/USD'); }}><div className="flex items-center justify-between mb-1.5"><div className="flex items-center gap-2"><span className={`w-1.5 h-1.5 rounded-full ${(ev.impact || '').toLowerCase() === 'high' ? 'bg-red-500' : 'bg-amber-400'}`}></span><span className="text-[10px] text-gray-500 font-mono">{formatDateWIB(ev.date)} · {formatTimeWIB(ev.date)}</span></div></div><div className="flex items-center gap-2"><span className="text-[10px] font-bold text-[#FF6600] w-8">{ev.country}</span><span className="text-xs text-gray-200 flex-1">{ev.title}</span></div></div>))}
                </div>
              </div>
              <div className="lg:col-span-5 bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-3xl flex flex-col h-[650px] overflow-hidden">
                <div className="p-5 border-b border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"><h2 className="text-sm font-semibold text-white">XAU / USD</h2><div className="flex items-center gap-1 bg-[#09090B] border border-white/10 rounded-xl p-1">{['1', '5', '15', '60', '240', 'D'].map(tf => <button key={tf} onClick={() => setChartInterval(tf)} className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${chartInterval === tf ? 'bg-[#FF6600] text-black' : 'text-gray-400 hover:text-white'}`}>{tf === 'D' ? '1D' : tf === '60' ? '1H' : tf === '240' ? '4H' : `${tf}m`}</button>)}</div></div>
                <div id="tradingview_chart" ref={chartContainerRef} className="w-full flex-1 rounded-b-3xl overflow-hidden" />
              </div>
              <div className="lg:col-span-3 bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-3xl flex flex-col h-[650px] overflow-hidden">
                <div className="p-5 border-b border-white/5"><h2 className="text-sm font-semibold text-white">AI Signal</h2></div>
                <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
                  {analysis ? (<div className="space-y-4">
                    <div className={`rounded-2xl p-6 text-center ${analysis.direction === 'buy' ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}><div className="text-[10px] text-white/60 font-mono mb-2">{analysis.pair} · {analysis.timeframe}</div><div className={`text-4xl font-bold ${analysis.direction === 'buy' ? 'text-green-400' : 'text-red-400'}`}>{analysis.direction === 'buy' ? '▲ BUY' : '▼ SELL'}</div><div className="text-[10px] text-white/40 font-mono mt-2">Live: {analysis.current_price}</div></div>
                    <div className="space-y-2 text-xs font-mono"><div className="flex justify-between py-2 border-b border-white/5"><span className="text-gray-500">Entry</span><span className="text-white font-semibold">{analysis.entry_zone}</span></div><div className="flex justify-between py-2 border-b border-white/5"><span className="text-red-400/70">SL</span><span className="text-red-400">{analysis.stop_loss}</span></div><div className="flex justify-between py-2 border-b border-white/5"><span className="text-green-400/70">TP</span><span className="text-green-400">{analysis.take_profit}</span></div><div className="flex justify-between py-2"><span className="text-[#FF6600]">R:R</span><span className="text-[#FF6600]">1:{rrRatio}</span></div></div>
                    <div className="grid grid-cols-2 gap-2"><button onClick={() => saveTradeToJournal('win')} className="bg-green-500/10 text-green-400 border border-green-500/30 py-2 rounded-xl text-xs">WIN</button><button onClick={() => saveTradeToJournal('loss')} className="bg-red-500/10 text-red-400 border border-red-500/30 py-2 rounded-xl text-xs">LOSS</button></div>
                  </div>) : (<div className="h-full flex items-center justify-center text-center text-gray-600 text-xs"><p>Select event<br/>to generate signal.</p></div>)}
                </div>
              </div>
            </div>

            <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-3xl overflow-hidden">
              <div className="p-5 border-b border-white/5"><h2 className="text-sm font-semibold text-white">Currency Strength Heatmap</h2></div>
              <div ref={strengthChartRef} className="tradingview-widget-container w-full h-[400px]" />
            </div>
          </div>
        )}

        {/* SIGNALS */}
        {activeTab === 'daily' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">Daily Signals</h2>
                <p className="text-xs text-gray-500 mt-1">{isBackfilling ? 'Fixing legacy data...' : `Auto-evaluated every 20s · ${lastEvaluatedAt ? `Last: ${new Date(lastEvaluatedAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })}` : 'Loading...'}`}</p>
                <p className="text-[10px] text-[#FF6600] mt-0.5">🔥 Dual analysis · 1 Signal confidence tertinggi</p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <button onClick={backfillResolvedSignals} disabled={isBackfilling} className="bg-white/[0.03] border border-white/10 text-white px-3 py-2.5 rounded-xl text-xs font-semibold disabled:opacity-50">Fix Data</button>
                <button onClick={evaluateAllPendingSignals} disabled={isEvaluating} className="bg-white/[0.03] border border-white/10 text-white px-3 py-2.5 rounded-xl text-xs font-semibold disabled:opacity-50">Evaluate</button>
                <button onClick={generateDailySignals} disabled={isGeneratingDaily} className="bg-[#FF6600] text-black px-4 py-2.5 rounded-xl text-xs font-semibold uppercase disabled:opacity-50">{isGeneratingDaily ? 'Generating...' : 'Generate'}</button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4"><div className="text-[10px] text-gray-500 uppercase mb-1">Total</div><div className="text-2xl font-mono font-semibold text-white">{dailySignals.length}</div></div>
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4"><div className="text-[10px] text-gray-500 uppercase mb-1">Pending</div><div className="text-2xl font-mono font-semibold text-amber-400">{aiPending.length}</div></div>
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4"><div className="text-[10px] text-green-400/70 uppercase mb-1">Won</div><div className="text-2xl font-mono font-semibold text-green-400">{aiWins}</div></div>
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4"><div className="text-[10px] text-red-400/70 uppercase mb-1">Lost</div><div className="text-2xl font-mono font-semibold text-red-400">{aiLosses}</div></div>
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4"><div className="text-[10px] text-gray-500 uppercase mb-1">Net Pips</div><div className={`text-2xl font-mono font-semibold ${aiTotalPips >= 0 ? 'text-green-400' : 'text-red-400'}`}>{aiTotalPips > 0 ? '+' : ''}{aiTotalPips.toFixed(1)}</div></div>
              <div className="bg-gradient-to-br from-[#FF6600]/20 to-[#FF6600]/5 border border-[#FF6600]/30 rounded-2xl p-4"><div className="text-[10px] text-[#FF6600] uppercase mb-1">Accuracy</div><div className="text-2xl font-mono font-semibold text-[#FF6600]">{aiWinRate}%</div></div>
            </div>

            <div className="flex gap-1 mb-4 bg-white/[0.02] border border-white/[0.06] p-1 rounded-xl w-fit">{[{ id: 'all', label: `All (${dailySignals.length})` }, { id: 'pending', label: `Pending (${aiPending.length})` }, { id: 'resolved', label: `Resolved (${aiResolved.length})` }].map(f => <button key={f.id} onClick={() => setSignalFilter(f.id as any)} className={`px-4 py-2 rounded-lg text-xs font-semibold ${signalFilter === f.id ? 'bg-[#FF6600] text-black' : 'text-gray-400'}`}>{f.label}</button>)}</div>

            {displayedSignals.length === 0 && !isGeneratingDaily && <div className="bg-white/[0.02] border border-white/[0.06] rounded-3xl p-16 text-center text-gray-500 text-sm">No signals. Klik "Generate" saat ada High Impact news.</div>}
            {isGeneratingDaily && <div className="bg-white/[0.02] border border-white/[0.06] rounded-3xl p-16 text-center text-[#FF6600] text-sm">AI is analyzing...</div>}

            {displayedSignals.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayedSignals.map((sig, i) => {
                  const isPending = sig.status === 'pending';
                  const isWin = sig.status === 'win';
                  const e = parseNum(sig.entry_zone); const s = parseNum(sig.stop_loss); const t = parseNum(sig.take_profit);
                  const rr = (!isNaN(e) && !isNaN(s) && !isNaN(t) && e !== s) ? (Math.abs(t - e) / Math.abs(e - s)).toFixed(1) : '-';
                  const { pips: computedPips, resolvedPrice: computedResolvedPrice } = computePips(sig);
                  const finalResolvedPrice = sig.resolved_price || computedResolvedPrice;
                  const newsName = getNewsForSignal(sig, events);

                  return (
                    <div key={i} className={`relative bg-white/[0.02] backdrop-blur-xl border rounded-3xl overflow-hidden ${isPending ? 'border-white/[0.06]' : isWin ? 'border-green-500/30' : 'border-red-500/30'}`}>
                      <div className={`absolute top-4 right-4 px-2.5 py-1 text-[9px] font-bold rounded-full ${isPending ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : isWin ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>{isPending ? '● PENDING' : isWin ? '✓ WIN' : '✗ LOSS'}</div>
                      
                      <div className="p-5 bg-gradient-to-r from-[#FF6600]/10 to-transparent border-b border-white/5">
                        <div className="text-[9px] text-[#FF6600] uppercase tracking-widest font-bold mb-1">📰 TRIGGERED BY</div>
                        <div className="text-sm font-semibold text-white leading-tight">{newsName}</div>
                      </div>
                      
                      <div className="p-5 border-b border-white/5">
                        <div className="flex items-center gap-2 mb-2"><span className={`w-2 h-2 rounded-full ${sig.direction === 'buy' ? 'bg-green-500' : 'bg-red-500'}`}></span><span className={`text-[10px] font-bold uppercase ${sig.direction === 'buy' ? 'text-green-400' : 'text-red-400'}`}>{sig.direction === 'buy' ? 'Bullish' : 'Bearish'}</span></div>
                        <div className="text-xl font-bold text-white">{sig.pair}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">{sig.timeframe} · {formatDateWIB(sig.signal_date)} · Confidence {sig.confidence}%</div>
                      </div>

                      <div className="p-5 space-y-2.5 text-xs font-mono">
                        <div className="flex justify-between"><span className="text-gray-500">Entry</span><span className="text-white font-semibold">{sig.entry_zone}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">SL</span><span className="text-red-400 font-semibold">{sig.stop_loss}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">TP</span><span className="text-green-400 font-semibold">{sig.take_profit}</span></div>
                        {!isPending && (
                          <>
                            <div className="flex justify-between pt-2 border-t border-white/5 mt-2"><span className="text-gray-500">Resolved</span><span className="text-gray-300">{finalResolvedPrice && !isNaN(Number(finalResolvedPrice)) ? Number(finalResolvedPrice).toFixed(2) : '—'}</span></div>
                            <div className="flex justify-between"><span className={`font-medium ${computedPips >= 0 ? 'text-green-400' : 'text-red-400'}`}>Pips</span><span className={`font-bold ${computedPips >= 0 ? 'text-green-400' : 'text-red-400'}`}>{computedPips > 0 ? '+' : ''}{computedPips.toFixed(1)}</span></div>
                          </>
                        )}
                        <div className="flex justify-between pt-2 border-t border-white/5"><span className="text-[#FF6600] font-medium">R:R</span><span className="text-[#FF6600]">1:{rr}</span></div>
                      </div>

                      {(sig.fundamental_reason || sig.technical_reason) && (
                        <div className="px-5 pb-5 space-y-2 border-t border-white/5 pt-3">
                          {sig.fundamental_reason && <div><div className="text-[9px] text-blue-400 uppercase tracking-widest font-bold mb-1">📊 Fundamental</div><div className="text-[10px] text-gray-400 leading-snug">{sig.fundamental_reason}</div></div>}
                          {sig.technical_reason && <div><div className="text-[9px] text-purple-400 uppercase tracking-widest font-bold mb-1">📈 Technical</div><div className="text-[10px] text-gray-400 leading-snug">{sig.technical_reason}</div></div>}
                        </div>
                      )}

                      {isPending && (
                        <div className="p-4 bg-white/[0.01] border-t border-white/5">
                          <div className="text-[9px] text-gray-500 uppercase mb-2 text-center">Manual Resolve</div>
                          <div className="grid grid-cols-3 gap-1">
                            <button onClick={() => manualResolve(sig, 'win')} className="bg-green-500/10 text-green-400 border border-green-500/20 py-1.5 rounded-lg text-[10px] font-bold">WIN</button>
                            <button onClick={() => manualResolve(sig, 'expire')} className="bg-white/5 text-gray-400 border border-white/10 py-1.5 rounded-lg text-[10px] font-bold">EXPIRE</button>
                            <button onClick={() => manualResolve(sig, 'loss')} className="bg-red-500/10 text-red-400 border border-red-500/20 py-1.5 rounded-lg text-[10px] font-bold">LOSS</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* HISTORY */}
        {activeTab === 'history' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white tracking-tight">News Archive</h2>
              <p className="text-xs text-gray-500 mt-1">Berita ekonomi lampau + nilai actual</p>
            </div>
            <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-3xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-white/[0.02] text-gray-500 text-[10px] uppercase tracking-widest border-b border-white/5">
                    <tr>
                      <th className="px-4 sm:px-6 py-4 font-medium">Date</th>
                      <th className="px-4 sm:px-6 py-4 font-medium">Currency</th>
                      <th className="px-4 sm:px-6 py-4 font-medium">Event</th>
                      <th className="px-4 sm:px-6 py-4 text-center font-medium">Actual</th>
                    </tr>
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

        {/* JOURNAL - NEWS RESULTS TABLE */}
        {activeTab === 'performance' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white tracking-tight">Trade Journal</h2>
              <p className="text-xs text-gray-500 mt-1">Hasil semua signal news (WIN/LOSS tracked dari live price)</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4 sm:p-5">
                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Total</div>
                <div className="text-2xl font-mono font-semibold text-white">{aiResolved.length}</div>
                <div className="text-[10px] text-gray-600 mt-0.5">{aiPending.length} pending</div>
              </div>
              <div className="bg-white/[0.02] backdrop-blur-xl border border-green-500/20 rounded-2xl p-4 sm:p-5">
                <div className="text-[10px] text-green-400/70 uppercase tracking-widest mb-1">Wins</div>
                <div className="text-2xl font-mono font-semibold text-green-400">{aiWins}</div>
              </div>
              <div className="bg-white/[0.02] backdrop-blur-xl border border-red-500/20 rounded-2xl p-4 sm:p-5">
                <div className="text-[10px] text-red-400/70 uppercase tracking-widest mb-1">Losses</div>
                <div className="text-2xl font-mono font-semibold text-red-400">{aiLosses}</div>
              </div>
              <div className="bg-white/[0.02] backdrop-blur-xl border border-[#FF6600]/30 rounded-2xl p-4 sm:p-5">
                <div className="text-[10px] text-[#FF6600] uppercase tracking-widest mb-1">Accuracy</div>
                <div className="text-2xl font-mono font-semibold text-[#FF6600]">{aiWinRate}%</div>
              </div>
              <div className="bg-gradient-to-br from-[#FF6600]/20 to-[#FF6600]/5 backdrop-blur-xl border border-[#FF6600]/30 rounded-2xl p-4 sm:p-5">
                <div className="text-[10px] text-[#FF6600] uppercase tracking-widest font-medium mb-1">Net Pips</div>
                <div className={`text-2xl font-mono font-semibold ${aiTotalPips >= 0 ? 'text-green-400' : 'text-red-400'}`}>{aiTotalPips > 0 ? '+' : ''}{aiTotalPips.toFixed(1)}</div>
              </div>
            </div>

            {aiResolved.length === 0 ? (
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-3xl p-16 text-center">
                <p className="text-sm text-gray-400 font-medium">Belum ada signal selesai</p>
                <p className="text-xs text-gray-600 mt-1">Signal akan muncul di sini setelah WIN atau LOSS.</p>
              </div>
            ) : (
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-3xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-white/[0.02] text-gray-500 text-[10px] uppercase tracking-widest border-b border-white/5">
                      <tr>
                        <th className="px-4 sm:px-6 py-4 font-medium">Tanggal</th>
                        <th className="px-4 sm:px-6 py-4 font-medium">Jam WIB</th>
                        <th className="px-4 sm:px-6 py-4 font-medium">Nama News</th>
                        <th className="px-4 sm:px-6 py-4 font-medium">Pair</th>
                        <th className="px-4 sm:px-6 py-4 font-medium text-center">Entry → Exit</th>
                        <th className="px-4 sm:px-6 py-4 font-medium text-right">Pips</th>
                        <th className="px-4 sm:px-6 py-4 font-medium text-center">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {aiResolved.slice().sort((a, b) => {
                        const aT = new Date(a.resolved_at || a.signal_date).getTime();
                        const bT = new Date(b.resolved_at || b.signal_date).getTime();
                        return bT - aT;
                      }).map((sig, i) => {
                        const { pips: computedPips, resolvedPrice: computedResolvedPrice } = computePips(sig);
                        const finalResolved = sig.resolved_price || computedResolvedPrice;
                        const entry = parseNum(sig.entry_zone);
                        const isWin = sig.status === 'win';
                        const newsName = getNewsForSignal(sig, events);
                        return (
                          <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                            <td className="px-4 sm:px-6 py-3 text-gray-400 font-mono">{formatDateWIB(sig.signal_date)}</td>
                            <td className="px-4 sm:px-6 py-3 text-gray-500 font-mono">{sig.created_at ? formatTimeWIB(sig.created_at) : '—'}</td>
                            <td className="px-4 sm:px-6 py-3 text-[#FF6600] max-w-[220px] truncate font-medium" title={newsName}>{newsName}</td>
                            <td className="px-4 sm:px-6 py-3">
                              <span className="text-white text-sm font-semibold">{sig.pair}</span>
                              <span className={`ml-2 text-[10px] font-bold uppercase ${sig.direction === 'buy' ? 'text-green-400' : 'text-red-400'}`}>{sig.direction}</span>
                            </td>
                            <td className="px-4 sm:px-6 py-3 text-center text-gray-300 font-mono text-[11px]">
                              {!isNaN(entry) ? entry.toFixed(entry > 100 ? 2 : 5) : '—'}
                              <span className="text-gray-600 mx-1.5">→</span>
                              {finalResolved && !isNaN(Number(finalResolved)) ? Number(finalResolved).toFixed(Number(finalResolved) > 100 ? 2 : 5) : '—'}
                            </td>
                            <td className={`px-4 sm:px-6 py-3 text-right font-mono font-bold ${computedPips >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {computedPips > 0 ? '+' : ''}{computedPips.toFixed(1)}
                            </td>
                            <td className="px-4 sm:px-6 py-3 text-center">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${isWin ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
                                {isWin ? '✓ WIN' : '✗ LOSS'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-white/5 p-4 bg-white/[0.01] flex flex-wrap justify-between items-center gap-4 text-xs">
                  <div className="text-gray-500">Total <strong className="text-white">{aiResolved.length}</strong> signal selesai</div>
                  <div className="flex gap-6">
                    <span className="text-gray-400">WIN: <strong className="text-green-400">{aiWins}</strong></span>
                    <span className="text-gray-400">LOSS: <strong className="text-red-400">{aiLosses}</strong></span>
                    <span className="text-[#FF6600]">Accuracy: <strong>{aiWinRate}%</strong></span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* RISK */}
        {activeTab === 'calculator' && (
          <div className="animate-in fade-in duration-500">
            <div className="mb-8"><h2 className="text-2xl font-bold text-white tracking-tight">Risk</h2></div>
            <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-3xl p-5 sm:p-8 space-y-5">
                <div><label className="block text-[10px] text-gray-500 font-medium mb-2 uppercase tracking-widest">Balance</label><input type="number" value={calcBalance} onChange={(e) => setCalcBalance(Number(e.target.value))} className="w-full bg-white/5 border border-white/10 rounded-xl text-white px-4 py-3 text-lg font-mono outline-none" /></div>
                <div className="grid grid-cols-2 gap-4"><div><label className="block text-[10px] text-gray-500 font-medium mb-2 uppercase">Risk %</label><input type="number" value={calcRisk} onChange={(e) => setCalcRisk(Number(e.target.value))} className="w-full bg-white/5 border border-white/10 rounded-xl text-white px-4 py-3 text-lg font-mono outline-none" /></div><div><label className="block text-[10px] text-gray-500 font-medium mb-2 uppercase">SL</label><input type="number" value={calcSl} onChange={(e) => setCalcSl(Number(e.target.value))} className="w-full bg-white/5 border border-white/10 rounded-xl text-white px-4 py-3 text-lg font-mono outline-none" /></div></div>
              </div>
              <div className="bg-gradient-to-br from-[#FF6600]/10 to-transparent border border-[#FF6600]/20 rounded-3xl p-5 sm:p-8 flex flex-col justify-center">
                <div className="text-center mb-6"><div className="text-[10px] text-gray-500 uppercase mb-2">Risk Amount</div><div className="text-3xl font-mono font-bold text-red-400">${riskAmountUSD.toFixed(2)}</div></div>
                <div className="text-center"><div className="text-[10px] text-[#FF6600] uppercase mb-2">Position Size</div><div className="text-4xl font-mono font-bold text-[#FF6600]">{lotSizeStandard.toFixed(2)}</div><div className="text-[10px] text-gray-500 uppercase">Standard Lots</div></div>
              </div>
            </div>
          </div>
        )}
      </main>

      <nav className="lg:hidden fixed bottom-3 left-3 right-3 z-40">
        <div className="bg-[#09090B]/95 backdrop-blur-2xl border border-white/10 rounded-2xl flex justify-around items-center h-[68px] shadow-2xl px-1">
          {navTabs.map((tab) => (<button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex flex-col items-center justify-center gap-0.5 w-full h-full rounded-xl ${activeTab === tab.id ? 'text-[#FF6600] bg-[#FF6600]/10' : 'text-gray-500'}`}><div className={activeTab === tab.id ? 'scale-110' : ''}>{tab.icon}</div><span className="text-[9px] font-semibold">{tab.label}</span></button>))}
        </div>
      </nav>

      <button onClick={() => setChatOpen(true)} className="fixed bottom-[100px] lg:bottom-6 right-4 lg:right-6 z-40 w-14 h-14 rounded-full bg-[#FF6600] shadow-[0_8px_32px_rgba(255,102,0,0.5)] flex items-center justify-center hover:scale-110 active:scale-95 transition-all">
        <svg className="w-6 h-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
      </button>

      {chatOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-[#09090B] border border-white/10 rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col h-[85vh] sm:h-[600px]">
            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#0a0a0a]">
              <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-[#FF6600] flex items-center justify-center"><svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div><div><div className="text-sm font-semibold text-white">AI Analyst</div><div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500"></span><span className="text-[10px] text-green-400">Online</span></div></div></div>
              <button onClick={() => setChatOpen(false)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center"><svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {chatMessages.length === 0 && (<div className="text-center py-8"><div className="w-16 h-16 rounded-2xl bg-[#FF6600]/10 border border-[#FF6600]/20 flex items-center justify-center mx-auto mb-4"><svg className="w-7 h-7 text-[#FF6600]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg></div><p className="text-sm text-white font-semibold mb-1">Ask me anything</p><div className="space-y-2 mt-4">{['Analisa XAU/USD hari ini?', 'Berita high impact berikutnya kapan?', 'Kapan waktu terbaik entry EUR/USD?'].map((q, i) => (<button key={i} onClick={() => setChatInput(q)} className="block w-full text-left text-xs text-gray-400 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-2">"{q}"</button>))}</div></div>)}
              {chatMessages.map((msg, i) => (<div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-xs leading-relaxed ${msg.role === 'user' ? 'bg-[#FF6600] text-black rounded-br-md' : 'bg-white/5 text-gray-200 border border-white/10 rounded-bl-md'}`}>{msg.content}</div></div>))}
              {chatLoading && (<div className="flex justify-start"><div className="bg-white/5 px-4 py-3 rounded-2xl rounded-bl-md"><div className="flex gap-1"><div className="w-2 h-2 rounded-full bg-[#FF6600] animate-bounce"></div><div className="w-2 h-2 rounded-full bg-[#FF6600] animate-bounce" style={{animationDelay:'150ms'}}></div><div className="w-2 h-2 rounded-full bg-[#FF6600] animate-bounce" style={{animationDelay:'300ms'}}></div></div></div></div>)}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={sendChatMessage} className="p-3 border-t border-white/5 bg-[#0a0a0a]"><div className="flex gap-2"><input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Ask about markets..." disabled={chatLoading} className="flex-1 bg-white/5 border border-white/10 text-white px-4 py-3 rounded-xl text-xs outline-none" /><button type="submit" disabled={chatLoading || !chatInput.trim()} className="w-11 h-11 rounded-xl bg-[#FF6600] disabled:opacity-50 flex items-center justify-center"><svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" /></svg></button></div></form>
          </div>
        </div>
      )}

      {alertsModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-[#09090B] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-white/5 flex justify-between items-center"><h3 className="text-sm font-semibold text-white">Price Alerts</h3><button onClick={() => setAlertsModalOpen(false)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center"><svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div>
            <div className="p-5 border-b border-white/5 space-y-3">
              <div className="grid grid-cols-2 gap-2"><select value={newAlertPair} onChange={(e) => setNewAlertPair(e.target.value)} className="bg-white/5 border border-white/10 text-white p-2.5 rounded-lg text-xs"><option value="XAU/USD">XAU/USD</option><option value="EUR/USD">EUR/USD</option><option value="GBP/USD">GBP/USD</option><option value="USD/JPY">USD/JPY</option></select><select value={newAlertDirection} onChange={(e) => setNewAlertDirection(e.target.value as any)} className="bg-white/5 border border-white/10 text-white p-2.5 rounded-lg text-xs"><option value="above">Above ↑</option><option value="below">Below ↓</option></select></div>
              <div className="flex gap-2"><input type="number" value={newAlertPrice} onChange={(e) => setNewAlertPrice(e.target.value)} placeholder="Target" className="flex-1 bg-white/5 border border-white/10 text-white px-3 py-2.5 rounded-lg text-xs" /><button onClick={addPriceAlert} className="bg-[#FF6600] text-black px-4 py-2.5 rounded-lg text-xs font-semibold">Add</button></div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-white/5">
              {priceAlerts.length === 0 ? <div className="p-8 text-center text-gray-600 text-xs">No alerts.</div> : priceAlerts.map(a => (<div key={a.id} className="p-4 flex items-center justify-between"><div><div className="text-sm text-white">{a.pair} {a.direction === 'above' ? '↑' : '↓'} {a.target}</div><div className="text-[10px] text-gray-500">Current: {marketData?.[a.pair]?.price || '—'}</div></div><button onClick={() => removePriceAlert(a.id)} className="text-red-400 text-xs">Delete</button></div>))}
            </div>
          </div>
        </div>
      )}

      {selectedEvent && !analysis && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-[#09090B] border border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-white/5"><h3 className="text-sm font-semibold text-white">Generate Signal</h3><p className="text-[10px] text-gray-500 truncate">{selectedEvent.title}</p></div>
            <div className="p-6">
              <form onSubmit={handleAnalyze} className="space-y-4">
                <select value={selectedPair} onChange={(e) => setSelectedPair(e.target.value)} className="w-full bg-white/5 border border-white/10 text-white p-3 rounded-xl text-sm"><option value="EUR/USD">EUR/USD</option><option value="XAU/USD">XAU/USD</option><option value="USD/JPY">USD/JPY</option></select>
                <div className="bg-white/[0.03] p-4 rounded-xl text-center"><div className="text-[10px] text-gray-500 uppercase mb-1">Live Price</div><div className="text-lg font-mono text-[#FF6600]">{marketData?.[selectedPair]?.price || '—'}</div></div>
                <div className="flex gap-2"><button type="button" onClick={() => setSelectedEvent(null)} className="flex-1 px-4 py-3 rounded-xl text-gray-400 text-xs">Cancel</button><button type="submit" disabled={isAnalyzing} className="flex-[2] bg-[#FF6600] text-black font-semibold py-3 rounded-xl text-xs disabled:opacity-50">{isAnalyzing ? 'Processing...' : 'Analyze'}</button></div>
              </form>
            </div>
          </div>
        </div>
      )}

      {analysis && (
        <div className="lg:hidden fixed inset-0 bg-black/90 backdrop-blur-md z-50 overflow-y-auto p-4 flex flex-col">
          <div className="bg-[#09090B] border border-white/10 rounded-3xl w-full max-w-sm mx-auto my-auto shadow-2xl">
            <div className="p-5 border-b border-white/5 flex justify-between items-center"><h3 className="text-sm font-semibold text-white">Signal</h3><button onClick={() => { setAnalysis(null); setSelectedEvent(null); }} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center"><svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div>
            <div className="p-5 space-y-4">
              <div className={`rounded-2xl p-6 text-center ${analysis.direction === 'buy' ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}><div className="text-[10px] text-white/60 font-mono mb-2">{analysis.pair} · {analysis.timeframe}</div><div className={`text-5xl font-bold ${analysis.direction === 'buy' ? 'text-green-400' : 'text-red-400'}`}>{analysis.direction === 'buy' ? '▲ BUY' : '▼ SELL'}</div></div>
              <div className="space-y-2 text-xs font-mono"><div className="flex justify-between py-2 border-b border-white/5"><span className="text-gray-500">Entry</span><span className="text-white">{analysis.entry_zone}</span></div><div className="flex justify-between py-2 border-b border-white/5"><span className="text-red-400/70">SL</span><span className="text-red-400">{analysis.stop_loss}</span></div><div className="flex justify-between py-2 border-b border-white/5"><span className="text-green-400/70">TP</span><span className="text-green-400">{analysis.take_profit}</span></div><div className="flex justify-between py-2"><span className="text-[#FF6600]">R:R</span><span className="text-[#FF6600]">1:{rrRatio}</span></div></div>
              <div className="grid grid-cols-2 gap-2"><button onClick={() => saveTradeToJournal('win')} className="bg-green-500/10 text-green-400 border border-green-500/30 py-3 rounded-xl text-xs">WIN</button><button onClick={() => saveTradeToJournal('loss')} className="bg-red-500/10 text-red-400 border border-red-500/30 py-3 rounded-xl text-xs">LOSS</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}