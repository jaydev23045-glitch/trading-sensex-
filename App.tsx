import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, Zap, TrendingUp, TrendingDown, Layers, ArrowUpRight,
  Shield, Play, Target, ChevronDown, ChevronUp, AlertTriangle, RefreshCw,
  Clock, FileText, CheckCircle2, XCircle, AlertCircle, History, Wallet, PieChart, ArrowRightCircle, WifiOff,
  Calculator, Receipt, Filter, Copy, Wifi, Check, Loader2, Search, Link
} from 'lucide-react';
import { NumberInput } from './components/ui/Input';
import { StatusBadge } from './components/ui/StatusBadge';
import { DashboardConfig, Position, SessionStats, Order, Trade, FundLimits, Watcher } from './types';
import { DEFAULT_DASHBOARD_CONFIG } from './constants';

const getHostname = () => window.location.hostname || 'localhost';
const API_BASE = `http://${getHostname()}:5000`;
const WS_URL = `ws://${getHostname()}:8080`;

const formatCurrency = (val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val);
const formatTime = () => new Date().toLocaleTimeString('en-US', { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

type MarketIndex = 'SENSEX' | 'NIFTY' | 'BANKNIFTY';

const calculateCharges = (turnover: number, side: 'BUY' | 'SELL') => {
    const brokerage = 0;
    const stt = side === 'SELL' ? turnover * 0.00125 : 0;
    const exchTxn = turnover * 0.0005;
    const stampDuty = side === 'BUY' ? turnover * 0.00003 : 0;
    const gst = (brokerage + exchTxn) * 0.18;
    const sebi = turnover * 0.000001;
    return brokerage + stt + exchTxn + stampDuty + gst + sebi;
};

// GLOBAL LOCK
let authProcessed = false;

const App: React.FC = () => {
  const [config, setConfig] = useState<DashboardConfig>(DEFAULT_DASHBOARD_CONFIG);
  const [expandedModules, setExpandedModules] = useState({ A: true, B: true, C: true });
  
  const stateRef = useRef({
    positions: [] as Position[],
    orders: [] as Order[],
    trades: [] as Trade[],
    watchers: [] as Watcher[], 
    funds: { availableMargin: 0, usedMargin: 0, totalCash: 0, openingBalance: 0, payIn: 0, payOut: 0 } as FundLimits,
    ceLtp: 0, peLtp: 0,
    stats: { totalMtm: 0.00, totalCharges: 0.00, netPnl: 0.00, totalSlippage: 0.00, totalTurnover: 0.00 } as SessionStats
  });

  const [renderTrigger, setRenderTrigger] = useState(0); 
  const [activeTab, setActiveTab] = useState<'POSITIONS' | 'ORDERS' | 'TRADES' | 'FUNDS'>('POSITIONS');
  const [orderFilter, setOrderFilter] = useState<'ALL' | 'OPEN' | 'EXECUTED' | 'REJECTED'>('ALL');
  
  // MARKET CONTEXT
  const [selectedIndex, setSelectedIndex] = useState<MarketIndex>('SENSEX');
  const [expiryStr, setExpiryStr] = useState("04OCT24"); // User must set this manually or we can calc it
  const [spotPrice, setSpotPrice] = useState(0);
  
  // STRIKES & ENTRY
  const [selectedCeStrike, setSelectedCeStrike] = useState("82000");
  const [selectedPeStrike, setSelectedPeStrike] = useState("82000");
  const [ceEntryPrice, setCeEntryPrice] = useState<string>("0");
  const [peEntryPrice, setPeEntryPrice] = useState<string>("0");
  
  // VALIDATED SCRIP DETAILS (From Broker)
  const [scripMaster, setScripMaster] = useState<{
    ce: { ts: string, token: string, ltp: number } | null,
    pe: { ts: string, token: string, ltp: number } | null
  }>({ ce: null, pe: null });
  
  const [isSyncing, setIsSyncing] = useState(false);

  // SYSTEM
  const [latency, setLatency] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [backendError, setBackendError] = useState<string | null>("Initializing...");
  const [isLoadingFunds, setIsLoadingFunds] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  
  // WS REF
  const wsRef = useRef<WebSocket | null>(null);

  // 1. MAIN INITIALIZATION
  useEffect(() => {
    const init = async () => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');

        if (code) {
            if (authProcessed) return; 
            authProcessed = true;
            window.history.replaceState({}, document.title, window.location.pathname);
            setIsLoggingIn(true);
            setBackendError(null);
            try {
                const response = await fetch(`${API_BASE}/authenticate`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code })
                });
                const data = await response.json();
                if (data.success) { setIsConnected(true); setShowSuccessModal(true); } 
                else { console.error("Login Failed:", data); }
            } catch (e) { console.error("Auth Error", e); } 
            finally { setIsLoggingIn(false); }
        } else {
            checkConnection();
            const interval = setInterval(checkConnection, 3000);
            return () => clearInterval(interval);
        }
    };
    init();
  }, []);

  const checkConnection = async () => {
      if (isLoggingIn) return;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const [pingRes, authRes] = await Promise.all([
            fetch(`${API_BASE}/ping`, { signal: controller.signal }).catch(() => null),
            fetch(`${API_BASE}/check-auth`, { signal: controller.signal }).catch(() => null)
        ]);
        clearTimeout(timeoutId);

        if (!pingRes) { setBackendError("VPS SERVER OFFLINE"); setIsConnected(false); return; }
        setBackendError(null);
        if (authRes && authRes.ok) {
            const authData = await authRes.json();
            setIsConnected(authData.isLoggedIn === true);
        }
      } catch (e) { setBackendError("VPS UNREACHABLE"); setIsConnected(false); }
  };

  // 2. WEBSOCKET HANDLER
  useEffect(() => {
    let reconnectInterval: any = null;
    const connect = () => {
        try {
            const ws = new WebSocket(WS_URL);
            wsRef.current = ws;
            ws.onopen = () => { console.log("WS Connected"); };
            ws.onmessage = (event) => {
              try {
                const rawData = JSON.parse(event.data);
                const updates = Array.isArray(rawData) ? rawData : [rawData];
                let shouldUpdateUI = false;
                const now = Date.now();

                updates.forEach(data => {
                    // Flattrade standard fields: tk (Token), lp (LTP), ts (TradingSymbol)
                    const token = data.tk || data.token;
                    const price = parseFloat(data.lp || data.ltp || "0");
                    const symbolStr = data.ts || data.symbol || "";

                    if (price > 0) {
                        // UPDATE VIA TOKEN ID MATCH (Most Reliable)
                        if (scripMaster.ce && token === scripMaster.ce.token) {
                            stateRef.current.ceLtp = price;
                            shouldUpdateUI = true;
                        }
                        else if (scripMaster.pe && token === scripMaster.pe.token) {
                            stateRef.current.peLtp = price;
                            shouldUpdateUI = true;
                        }
                        // FALLBACK: STRING MATCH
                        else if (symbolStr) {
                             if (symbolStr.includes('CE')) { stateRef.current.ceLtp = price; shouldUpdateUI = true; }
                             if (symbolStr.includes('PE')) { stateRef.current.peLtp = price; shouldUpdateUI = true; }
                             if (!symbolStr.includes('CE') && !symbolStr.includes('PE')) { setSpotPrice(price); shouldUpdateUI = true; }
                        }
                    }
                    if (data.timestamp) setLatency(now - data.timestamp);
                });

                if (shouldUpdateUI) {
                    recalcPnl();
                    setRenderTrigger(prev => prev + 1);
                }
              } catch (e) { }
            };
        } catch (e) { console.error("WS Error", e); }
    };
    connect();
    reconnectInterval = setInterval(() => { if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) connect(); }, 5000);
    return () => { if (wsRef.current) wsRef.current.close(); clearInterval(reconnectInterval); };
  }, [scripMaster]);

  const recalcPnl = () => {
      let unrealizedMtm = 0;
      let realizedMtm = 0;
      stateRef.current.positions.forEach(pos => {
          if (pos.status === 'OPEN') {
              // Try to find exact LTP from ScripMaster first, then StateRef
              let liveLtp = 0;
              if (pos.type === 'CE') liveLtp = stateRef.current.ceLtp;
              if (pos.type === 'PE') liveLtp = stateRef.current.peLtp;
              
              if (liveLtp > 0) {
                  pos.ltp = liveLtp;
                  pos.pnl = (liveLtp - pos.avgPrice) * pos.qty;
              }
              unrealizedMtm += pos.pnl;
          }
          realizedMtm += (pos.realizedPnl || 0);
      });
      stateRef.current.stats.totalMtm = realizedMtm + unrealizedMtm;
  };

  // 3. FUNDS & HELPERS
  const fetchFunds = async () => {
    setIsLoadingFunds(true);
    try {
        const res = await fetch(`${API_BASE}/funds`);
        const data = await res.json();
        if (data && (data.stat === "Ok" || data.cash)) {
             const safeParse = (val: any) => parseFloat(String(val).replace(/,/g, '')) || 0;
             const cash = safeParse(data.cash);
             const used = safeParse(data.marginused);
             stateRef.current.funds = {
                availableMargin: cash - used, usedMargin: used, totalCash: cash,
                openingBalance: cash - safeParse(data.payin) + safeParse(data.payout), 
                payIn: safeParse(data.payin), payOut: safeParse(data.payout)
             };
             setRenderTrigger(prev => prev + 1);
        }
    } catch (e) { } finally { setIsLoadingFunds(false); }
  };

  useEffect(() => { if (activeTab === 'FUNDS') { fetchFunds(); } }, [activeTab]);

  const handleLogin = async () => {
    if (backendError && backendError !== "Initializing...") {
        alert("VPS OFFLINE. Please start the server."); return;
    }
    setIsLoggingIn(true);
    try {
        const res = await fetch(`${API_BASE}/login`);
        const data = await res.json();
        if (data.url) window.location.href = data.url;
    } catch (e) { setIsLoggingIn(false); }
  };

  const handleIndexSwitch = (index: MarketIndex) => {
    setSelectedIndex(index);
    if (index === 'SENSEX') { setSelectedCeStrike("82100"); setSelectedPeStrike("82100"); } 
    else if (index === 'NIFTY') { setSelectedCeStrike("25100"); setSelectedPeStrike("25100"); } 
    else if (index === 'BANKNIFTY') { setSelectedCeStrike("51500"); setSelectedPeStrike("51400"); }
    // Reset Scrip Master on switch
    setScripMaster({ ce: null, pe: null });
  };

  const getStep = () => selectedIndex === 'NIFTY' ? 50 : 100;
  const handleQuickStrikeSelection = (offset: number) => {
     if (spotPrice === 0) return; 
     const step = getStep();
     const atm = Math.round(spotPrice / step) * step;
     const targetStrike = atm + (offset * step);
     setSelectedCeStrike(targetStrike.toString());
     setSelectedPeStrike(targetStrike.toString());
  };

  // ----------------------------------------------------------------------
  // 4. SCRIP SEARCH & SUBSCRIPTION (THE FIX)
  // ----------------------------------------------------------------------
  const getExchange = () => selectedIndex === 'SENSEX' ? 'BFO' : 'NFO';

  const handleSyncSymbols = async () => {
    setIsSyncing(true);
    try {
        const exch = getExchange();
        // Construct search terms. e.g. "SENSEX 82000 CE" -> Broker expects "SENSEX 82000 CE" or close to it
        // Better: Search for "SENSEX 82000" and filter
        // Even Better: Construct the rough symbol and let backend fuzzy match if possible, 
        // OR standard format: "SENSEX 24OCT 82000 CE"
        
        // Search CE
        const ceQuery = `${selectedIndex} ${expiryStr} ${selectedCeStrike} CE`; 
        const peQuery = `${selectedIndex} ${expiryStr} ${selectedPeStrike} PE`;
        
        const [ceRes, peRes] = await Promise.all([
            fetch(`${API_BASE}/search-scrip`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ search: ceQuery, exchange: exch })
            }),
            fetch(`${API_BASE}/search-scrip`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ search: peQuery, exchange: exch })
            })
        ]);

        const ceData = await ceRes.json();
        const peData = await peRes.json();

        const newScrip = { ce: null, pe: null } as any;

        if (ceData.success && ceData.token) {
            newScrip.ce = { ts: ceData.ts, token: ceData.token, ltp: 0 };
        }
        if (peData.success && peData.token) {
            newScrip.pe = { ts: peData.ts, token: peData.token, ltp: 0 };
        }

        setScripMaster(newScrip);

        // SEND SUBSCRIPTION TO WEBSOCKET
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const tokens = [];
            if (newScrip.ce) tokens.push(`${exch}|${newScrip.ce.token}`);
            if (newScrip.pe) tokens.push(`${exch}|${newScrip.pe.token}`);
            
            if (tokens.length > 0) {
                const subReq = { t: "t", k: tokens.join(',') };
                wsRef.current.send(JSON.stringify(subReq));
                console.log("Subscribed to:", subReq);
            }
        }

    } catch (e) { console.error(e); alert("Sync Failed. Check Expiry/Strikes."); }
    finally { setIsSyncing(false); }
  };


  // 5. ORDER PLACEMENT (CORRECTED MAPPING)
  const handleBuy = async (type: 'CE' | 'PE') => {
    // Determine Symbol: Use Validated Scrip TS if available, else construct manually
    let finalSymbol = "";
    let finalExchange = getExchange();

    if (type === 'CE' && scripMaster.ce) finalSymbol = scripMaster.ce.ts;
    else if (type === 'PE' && scripMaster.pe) finalSymbol = scripMaster.pe.ts;
    else {
        // Manual Fallback: Try to construct standard format
        // e.g. SENSEX24OCT82000CE
        // Remove spaces from ExpiryStr just in case
        const cleanExpiry = expiryStr.trim().toUpperCase();
        const strike = type === 'CE' ? selectedCeStrike : selectedPeStrike;
        finalSymbol = `${selectedIndex}${cleanExpiry}${strike}${type}`;
    }

    const reqPrice = parseFloat(type === 'CE' ? ceEntryPrice : peEntryPrice);
    const orderQty = config.baseQty;
    const isLimit = reqPrice > 0;
    
    // Add to Local Order Book
    const tempId = `ORD-${Date.now()}`;
    const newOrder: Order = {
      id: tempId, time: formatTime(), symbol: finalSymbol,
      type: isLimit ? 'LMT' : 'MKT', side: 'BUY', product: 'NRML', qty: orderQty, price: reqPrice || 0,
      status: 'TRIGGER PENDING', averagePrice: 0, message: 'Sending...'
    };
    stateRef.current.orders.unshift(newOrder);
    setRenderTrigger(prev => prev + 1);

    try {
        const response = await fetch(`${API_BASE}/place-order`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, 
              body: JSON.stringify({
                  exchange: finalExchange,
                  symbol: finalSymbol,
                  qty: orderQty,
                  price: reqPrice || 0,
                  type: isLimit ? 'LIMIT' : 'MARKET',
                  side: 'BUY',
                  product: 'NRML' // Maps to 'M' in backend
              })
        });
        const result = await response.json();
        
        const orderIndex = stateRef.current.orders.findIndex(o => o.id === tempId);
        if (stateRef.current.orders[orderIndex]) {
            if (result && result.nOrdNo) { // Flattrade returns nOrdNo on success
                stateRef.current.orders[orderIndex].status = 'COMPLETE'; 
                stateRef.current.orders[orderIndex].exchangeOrderId = result.nOrdNo;
                stateRef.current.orders[orderIndex].message = 'Placed';
                // Add Position
                const filledPrice = reqPrice || (type==='CE' ? stateRef.current.ceLtp : stateRef.current.peLtp);
                stateRef.current.positions.push({
                    id: result.nOrdNo, type, strike: (type==='CE'?selectedCeStrike:selectedPeStrike), 
                    qty: orderQty, avgPrice: filledPrice, basePrice: filledPrice,
                    ltp: filledPrice, pnl: 0, realizedPnl: 0, slPrice: 0, targetPrice: 0, 
                    status: 'OPEN', scalingCount: 0, isPyramided: false, reentryAttemptsLeft: 3
                });
            } else {
                stateRef.current.orders[orderIndex].status = 'REJECTED';
                stateRef.current.orders[orderIndex].message = result.message || result.error || 'Broker Rejected';
            }
        }
    } catch (e: any) {
        console.error(e);
    }
    setRenderTrigger(prev => prev + 1);
  };
  
  const handleManualExit = async (id: string) => {
    const pos = stateRef.current.positions.find(p => p.id === id);
    if (!pos || pos.status === 'CLOSED') return;
    
    // Attempt to reconstruct symbol or use saved
    const cleanExpiry = expiryStr.trim().toUpperCase();
    const finalSymbol = `${selectedIndex}${cleanExpiry}${pos.strike}${pos.type}`; // Fallback

    const tempId = `EXIT-${Date.now()}`;
    const newOrder: Order = {
      id: tempId, time: formatTime(), symbol: finalSymbol,
      type: 'MKT', side: 'SELL', product: 'NRML', qty: pos.qty, price: 0, status: 'TRIGGER PENDING'
    };
    stateRef.current.orders.unshift(newOrder);
    setRenderTrigger(prev => prev + 1);

    try {
        const response = await fetch(`${API_BASE}/place-order`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, 
              body: JSON.stringify({
                  exchange: getExchange(), symbol: finalSymbol, qty: pos.qty,
                  price: 0, type: 'MARKET', side: 'SELL', product: 'NRML'
              })
        });
        const result = await response.json();
        const orderIndex = stateRef.current.orders.findIndex(o => o.id === tempId);
        if (stateRef.current.orders[orderIndex]) {
            if (result && result.nOrdNo) {
                 stateRef.current.orders[orderIndex].status = 'COMPLETE';
                 pos.status = 'CLOSED';
            } else {
                 stateRef.current.orders[orderIndex].status = 'REJECTED';
                 stateRef.current.orders[orderIndex].message = result.message || 'Error';
            }
        }
    } catch (e) {}
    setRenderTrigger(prev => prev + 1);
  };

  const { positions, orders, stats, ceLtp, peLtp, funds } = stateRef.current;
  const activePositions = positions.filter(p => p.status === 'OPEN').reverse();

  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 font-sans selection:bg-blue-500/30 pb-10 relative">
      {/* SUCCESS MODAL */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0f172a] border border-emerald-500/30 p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center">
                <h2 className="text-2xl font-black text-white mb-2">Connected!</h2>
                <button onClick={() => setShowSuccessModal(false)} className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl mt-4">Start Trading</button>
            </div>
        </div>
      )}

      {/* HEADER */}
      <header className="h-16 border-b border-slate-800/50 bg-[#020617]/80 backdrop-blur-md sticky top-0 z-50 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6 text-blue-500 fill-blue-500/20" />
          <h1 className="text-xl font-bold text-white tracking-tight">{selectedIndex} <span className="text-blue-500">HFT</span> Scalper</h1>
        </div>
        <div className="flex items-center gap-4">
           <button onClick={isConnected ? undefined : handleLogin} disabled={isLoggingIn || isConnected} className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded shadow-lg transition-all ${isConnected ? 'bg-emerald-500 text-white cursor-default' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}>
                {isConnected ? <><Wifi className="w-3 h-3" /> ONLINE</> : <><Zap className="w-3 h-3" /> LOGIN BROKER</>}
            </button>
          <StatusBadge latency={latency} isConnected={isConnected} />
        </div>
      </header>
      
      {backendError && <div className="bg-red-500 text-white py-2 text-center text-xs font-bold tracking-widest">{backendError}</div>}

      <main className="max-w-[1600px] mx-auto p-6 space-y-6">
        {/* CONTROL TOWER & EXPIRY SETTINGS */}
        <div className="bg-[#0f172a] rounded-xl border border-slate-800 p-6">
            <div className="flex flex-wrap items-end gap-6">
                 <div className="flex-1">
                     <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Index & Expiry</label>
                     <div className="flex gap-2">
                        {['NIFTY', 'BANKNIFTY', 'SENSEX'].map(idx => (
                            <button key={idx} onClick={() => handleIndexSwitch(idx as any)} className={`px-4 py-3 rounded-lg font-bold text-xs ${selectedIndex === idx ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500 hover:text-white'}`}>{idx}</button>
                        ))}
                     </div>
                 </div>
                 <div className="w-48">
                     <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Expiry (DDMMMYY)</label>
                     <input type="text" value={expiryStr} onChange={(e) => setExpiryStr(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white font-mono font-bold placeholder-slate-600 focus:border-blue-500 outline-none" placeholder="e.g. 04OCT24" />
                 </div>
                 <div>
                     <button onClick={handleSyncSymbols} disabled={isSyncing || !isConnected} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-lg flex items-center gap-2 shadow-lg shadow-indigo-500/20">
                        {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />} SYNC SYMBOLS
                     </button>
                 </div>
            </div>
        </div>

        {/* TRADING TERMINAL */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
           {/* CE SIDE */}
           <div className={`rounded-xl border p-6 flex flex-col gap-6 relative overflow-hidden transition-all ${scripMaster.ce ? 'bg-emerald-950/10 border-emerald-500/30' : 'bg-[#0f172a] border-slate-800'}`}>
              <div className="flex justify-between items-start z-10">
                  <div>
                      <h2 className="text-lg font-black text-emerald-500 uppercase flex items-center gap-2"><TrendingUp className="w-5 h-5" /> CE SIDE</h2>
                      <div className="text-[10px] font-mono text-emerald-400/60 mt-1">{scripMaster.ce ? scripMaster.ce.ts : 'Symbol Not Synced'}</div>
                  </div>
                  <div className="text-right">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">LTP</div>
                      <div className="text-3xl font-black font-mono text-white tracking-tighter">{stateRef.current.ceLtp > 0 ? stateRef.current.ceLtp.toFixed(2) : '--'}</div>
                  </div>
              </div>
              <div className="space-y-4 z-10">
                  <NumberInput label="Strike" value={selectedCeStrike} onChange={(e) => setSelectedCeStrike(e.target.value)} />
                  <NumberInput label="Price (0 = MKT)" value={ceEntryPrice} onChange={(e) => setCeEntryPrice(e.target.value)} borderColor="border-emerald-500/30" className="text-emerald-500" />
                  <button onClick={() => handleBuy('CE')} className="w-full py-4 font-black uppercase tracking-widest rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-2">
                    <Play className="w-4 h-4 fill-current" /> BUY CE
                  </button>
              </div>
           </div>

           {/* PE SIDE */}
           <div className={`rounded-xl border p-6 flex flex-col gap-6 relative overflow-hidden transition-all ${scripMaster.pe ? 'bg-rose-950/10 border-rose-500/30' : 'bg-[#0f172a] border-slate-800'}`}>
              <div className="flex justify-between items-start z-10">
                  <div>
                      <h2 className="text-lg font-black text-rose-500 uppercase flex items-center gap-2"><TrendingDown className="w-5 h-5" /> PE SIDE</h2>
                      <div className="text-[10px] font-mono text-rose-400/60 mt-1">{scripMaster.pe ? scripMaster.pe.ts : 'Symbol Not Synced'}</div>
                  </div>
                  <div className="text-right">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">LTP</div>
                      <div className="text-3xl font-black font-mono text-white tracking-tighter">{stateRef.current.peLtp > 0 ? stateRef.current.peLtp.toFixed(2) : '--'}</div>
                  </div>
              </div>
              <div className="space-y-4 z-10">
                  <NumberInput label="Strike" value={selectedPeStrike} onChange={(e) => setSelectedPeStrike(e.target.value)} />
                  <NumberInput label="Price (0 = MKT)" value={peEntryPrice} onChange={(e) => setPeEntryPrice(e.target.value)} borderColor="border-rose-500/30" className="text-rose-500" />
                  <button onClick={() => handleBuy('PE')} className="w-full py-4 font-black uppercase tracking-widest rounded-lg bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-500/20 active:scale-95 flex items-center justify-center gap-2">
                    <Play className="w-4 h-4 fill-current" /> BUY PE
                  </button>
              </div>
           </div>
        </div>
        
        {/* POSITIONS TABLE (Simplified) */}
        <div className="bg-[#0f172a] rounded-xl border border-slate-800 overflow-hidden">
             <div className="px-6 py-4 bg-slate-900/30 border-b border-slate-800 text-xs font-bold text-slate-500 uppercase">Open Positions</div>
             {activePositions.length === 0 ? (
                 <div className="p-8 text-center text-slate-600 text-sm">No active positions</div>
             ) : (
                 <div className="divide-y divide-slate-800">
                     {activePositions.map(pos => (
                         <div key={pos.id} className="p-4 flex items-center justify-between hover:bg-slate-800/30">
                             <div>
                                 <div className={`font-bold ${pos.type === 'CE' ? 'text-emerald-500' : 'text-rose-500'}`}>{pos.strike} {pos.type}</div>
                                 <div className="text-[10px] text-slate-500 font-mono mt-1">ID: {pos.id}</div>
                             </div>
                             <div className="text-right">
                                 <div className="font-mono font-bold text-white">{pos.qty} Qty</div>
                                 <div className="text-xs text-slate-400">Avg: {pos.avgPrice.toFixed(2)}</div>
                             </div>
                             <div className="text-right">
                                 <div className={`font-mono font-bold text-lg ${pos.pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{pos.pnl.toFixed(2)}</div>
                                 <div className="text-[10px] text-slate-500">LTP: {pos.ltp.toFixed(2)}</div>
                             </div>
                             <button onClick={() => handleManualExit(pos.id)} className="bg-slate-800 hover:bg-rose-600 hover:text-white text-slate-400 text-xs font-bold px-4 py-2 rounded transition-colors">EXIT</button>
                         </div>
                     ))}
                 </div>
             )}
        </div>

      </main>
    </div>
  );
};
export default App;