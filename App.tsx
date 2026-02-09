import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, Zap, TrendingUp, TrendingDown, Layers, ArrowUpRight,
  Shield, Play, Target, ChevronDown, ChevronUp, AlertTriangle, RefreshCw,
  Clock, FileText, CheckCircle2, XCircle, AlertCircle, History, Wallet, PieChart, ArrowRightCircle, WifiOff,
  Calculator, Receipt, Filter, Copy
} from 'lucide-react';
import { NumberInput } from './components/ui/Input';
import { StatusBadge } from './components/ui/StatusBadge';
import { DashboardConfig, Position, SessionStats, Order, Trade, FundLimits, Watcher } from './types';
import { DEFAULT_DASHBOARD_CONFIG } from './constants';

// AUTOMATICALLY DETECT IP (Works on VPS and Localhost)
const getHostname = () => window.location.hostname || 'localhost';
const API_BASE = `http://${getHostname()}:5000`;
const WS_URL = `ws://${getHostname()}:8080`;

const formatCurrency = (val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val);
const formatTime = () => new Date().toLocaleTimeString('en-US', { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

type MarketIndex = 'SENSEX' | 'NIFTY' | 'BANKNIFTY';

// --- UTILITY: Calculate Indian F&O Charges (Estimates) ---
const calculateCharges = (turnover: number, side: 'BUY' | 'SELL') => {
    // Flattrade Brokerage: 0
    const brokerage = 0;
    // STT: 0.125% on Sell Only (Options)
    const stt = side === 'SELL' ? turnover * 0.00125 : 0;
    // Exchange Txn (NSE Options): ~0.05%
    const exchTxn = turnover * 0.0005;
    // Stamp Duty: 0.003% on Buy Only
    const stampDuty = side === 'BUY' ? turnover * 0.00003 : 0;
    // GST: 18% on (Brokerage + Exch Txn)
    const gst = (brokerage + exchTxn) * 0.18;
    // SEBI Charges: 10 per crore (~0.0001%)
    const sebi = turnover * 0.000001;

    return brokerage + stt + exchTxn + stampDuty + gst + sebi;
};

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
  const [selectedIndex, setSelectedIndex] = useState<MarketIndex>('SENSEX');
  const [spotPrice, setSpotPrice] = useState(0);
  const [selectedCeStrike, setSelectedCeStrike] = useState("82000");
  const [selectedPeStrike, setSelectedPeStrike] = useState("82000");
  const [ceEntryPrice, setCeEntryPrice] = useState<string>("0");
  const [peEntryPrice, setPeEntryPrice] = useState<string>("0");
  const [latency, setLatency] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [backendError, setBackendError] = useState<string | null>("Checking connection...");
  const [isLoadingFunds, setIsLoadingFunds] = useState(false);

  // 1. HEALTH CHECK INTERVAL
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        await fetch(`${API_BASE}/ping`, { signal: controller.signal });
        clearTimeout(timeoutId);
        setBackendError(null);
      } catch (e) {
        setBackendError("VPS SERVER OFFLINE");
      }
    };

    checkHealth(); // Initial check
    const interval = setInterval(checkHealth, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  // 2. AUTHENTICATION HANDLER
  useEffect(() => {
    const handleAuthCallback = async () => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code'); 
        if (code) {
            setIsLoggingIn(true);
            window.history.replaceState({}, document.title, window.location.pathname); // Clean URL
            try {
                const response = await fetch(`${API_BASE}/authenticate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code })
                });
                const data = await response.json();
                if (data.success) {
                    setIsConnected(true);
                    setBackendError(null);
                    alert("✅ Login Successful! Connected to Flattrade.");
                } else {
                    alert("❌ Login Failed: " + JSON.stringify(data.error));
                }
            } catch (e) {
                console.error(e);
                alert(`Login Error: Could not reach VPS Server.\n\nEnsure you have run 'npm run start-all' in your terminal.`);
            } finally {
                setIsLoggingIn(false);
            }
        }
    };
    handleAuthCallback();
  }, []);

  // 3. WEBSOCKET CONNECTION
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectInterval: any = null;

    const connect = () => {
        try {
            ws = new WebSocket(WS_URL);
            ws.onopen = () => { setIsConnected(true); console.log("Connected to Backend Socket"); };
            ws.onmessage = (event) => {
              try {
                const data = JSON.parse(event.data);
                const now = Date.now();
                
                // Update Spot/LTP
                if (data.symbol === selectedIndex) setSpotPrice(data.lp); 
                if (data.symbol.includes('CE')) stateRef.current.ceLtp = data.lp;
                if (data.symbol.includes('PE')) stateRef.current.peLtp = data.lp;
                if (data.timestamp) setLatency(now - data.timestamp);

                // Live PnL Calculation
                let unrealizedMtm = 0;
                let realizedMtm = 0;
                
                stateRef.current.positions.forEach(pos => {
                    if (pos.status === 'OPEN') {
                        // Use latest LTP
                        const liveLtp = pos.type === 'CE' ? stateRef.current.ceLtp : stateRef.current.peLtp;
                        if (liveLtp > 0) {
                            pos.ltp = liveLtp;
                            pos.pnl = (liveLtp - pos.avgPrice) * pos.qty;
                        }
                        unrealizedMtm += pos.pnl;
                    }
                    realizedMtm += (pos.realizedPnl || 0);
                });
                
                stateRef.current.stats.totalMtm = realizedMtm + unrealizedMtm;

                setRenderTrigger(prev => prev + 1);
              } catch (e) {}
            };
            ws.onclose = () => { setIsConnected(false); };
            ws.onerror = () => { setIsConnected(false); };
        } catch (e) { setIsConnected(false); }
    };

    connect();
    reconnectInterval = setInterval(() => {
        if (!ws || ws.readyState === WebSocket.CLOSED) connect();
    }, 5000);

    return () => { if (ws) ws.close(); clearInterval(reconnectInterval); };
  }, [selectedIndex]);

  // 4. FETCH FUNDS (New)
  const fetchFunds = async () => {
    if (!isConnected) return;
    setIsLoadingFunds(true);
    try {
        const res = await fetch(`${API_BASE}/funds`);
        const data = await res.json();
        
        if (data && (data.stat === "Ok" || data.cash)) {
             // Ensure safe parsing of string numbers (sometimes contain commas)
             const safeParse = (val: any) => {
                if (typeof val === 'number') return val;
                if (typeof val === 'string') return parseFloat(val.replace(/,/g, '')) || 0;
                return 0;
             };

             const cash = safeParse(data.cash);      // Gross Ledger Balance
             const used = safeParse(data.marginused); // Margin Blocked
             const payin = safeParse(data.payin);     // Today's Payin
             const payout = safeParse(data.payout);   // Today's Payout
             
             stateRef.current.funds = {
                availableMargin: cash - used, // Net Available for Trading
                usedMargin: used,
                totalCash: cash,
                openingBalance: cash - payin + payout, 
                payIn: payin,
                payOut: payout
             };
             setRenderTrigger(prev => prev + 1);
        }
    } catch (e) {
        console.error("Failed to fetch funds:", e);
    } finally {
        setIsLoadingFunds(false);
    }
  };

  useEffect(() => {
      if (activeTab === 'FUNDS') {
          fetchFunds();
          const id = setInterval(fetchFunds, 10000); 
          return () => clearInterval(id);
      }
  }, [activeTab, isConnected]);


  const addOrder = (order: Order) => { stateRef.current.orders.unshift(order); };
  const toggleModule = (mod: 'A' | 'B' | 'C') => { setExpandedModules(prev => ({...prev, [mod]: !prev[mod]})); };

  const placeBackendOrder = async (orderData: any) => {
      try {
          const response = await fetch(`${API_BASE}/place-order`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(orderData)
          });
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || result.message || `Server Error ${response.status}`);
          }
          return result;
      } catch (e: any) {
          const isNetworkError = e.message.includes('Failed to fetch') || e.message.includes('NetworkError');
          if (isNetworkError) {
             alert(`CRITICAL ERROR: Could not reach VPS Backend!\n\nPlease run 'npm run start-all' in your VPS terminal.`);
             return { status: "FAILED", message: "Network Error: VPS Unreachable" };
          }
          return { status: "FAILED", message: e.message };
      }
  };

  const handleLogin = async () => {
    if (backendError) {
        alert("Cannot Login: The VPS Server is Offline.\n\nPlease go to your VPS Terminal and run:\ncd trading-sensex\nnpm run start-all");
        return;
    }
    setIsLoggingIn(true);
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const res = await fetch(`${API_BASE}/login`, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`Server responded with ${res.status}`);
        
        const data = await res.json();
        if (data.url) {
            window.location.href = data.url;
        } else {
            alert('Error: Login URL not found in server response.');
        }
    } catch (e: any) {
        alert(`Login Failed: Could not connect to Port 5000.\n\n1. Check AWS Firewall (allow Port 5000)\n2. Ensure 'npm run start-all' is running.`);
    } finally {
        setIsLoggingIn(false);
    }
  };

  const handleIndexSwitch = (index: MarketIndex) => {
    setSelectedIndex(index);
    if (index === 'SENSEX') { setSelectedCeStrike("82100"); setSelectedPeStrike("82100"); } 
    else if (index === 'NIFTY') { setSelectedCeStrike("25100"); setSelectedPeStrike("25100"); } 
    else if (index === 'BANKNIFTY') { setSelectedCeStrike("51500"); setSelectedPeStrike("51400"); }
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

  const handleBuy = async (type: 'CE' | 'PE') => {
    const strike = type === 'CE' ? selectedCeStrike : selectedPeStrike;
    const reqPrice = parseFloat(type === 'CE' ? ceEntryPrice : peEntryPrice);
    const orderQty = config.baseQty;
    const isLimit = reqPrice > 0;
    
    // SNAPSHOT PRICE for Slippage Calculation
    const snapshotLtp = type === 'CE' ? stateRef.current.ceLtp : stateRef.current.peLtp;
    const intendedPrice = isLimit ? reqPrice : snapshotLtp;

    const tempId = `ORD-${Date.now()}`;
    const newOrder: Order = {
      id: tempId, time: formatTime(), symbol: `${selectedIndex} ${strike} ${type}`,
      type: isLimit ? 'LMT' : 'MKT', side: 'BUY', product: 'NRML', qty: orderQty, price: reqPrice || 0,
      status: 'TRIGGER PENDING', averagePrice: 0, message: 'Sending to Broker...'
    };
    addOrder(newOrder);
    setRenderTrigger(prev => prev + 1);

    const result = await placeBackendOrder({
        exchange: 'NFO', symbol: `${selectedIndex} ${strike} ${type}`,
        qty: orderQty, price: reqPrice || 0, type: isLimit ? 'LIMIT' : 'MARKET', side: 'BUY'
    });

    const orderIndex = stateRef.current.orders.findIndex(o => o.id === tempId);
    if (stateRef.current.orders[orderIndex]) {
        if (result && result.ordernumber) {
            // ORDER SUCCESS
            const filledPrice = parseFloat(result.averagePrice) || (reqPrice || snapshotLtp); // API might return string
            
            stateRef.current.orders[orderIndex].status = 'COMPLETE'; 
            stateRef.current.orders[orderIndex].exchangeOrderId = result.ordernumber;
            stateRef.current.orders[orderIndex].message = 'Placed on Exchange';
            stateRef.current.orders[orderIndex].averagePrice = filledPrice;

            // --- ADVANCED CALCULATIONS ---
            // Slippage: Intended - Actual. (Ex: Wanted 100, Got 101. Slippage = -1). 
            const slippage = intendedPrice - filledPrice;
            const turnover = filledPrice * orderQty;
            const charges = calculateCharges(turnover, 'BUY');

            // Update Session Stats
            stateRef.current.stats.totalTurnover += turnover;
            stateRef.current.stats.totalCharges += charges;
            stateRef.current.stats.totalSlippage += (slippage * orderQty);

            // RECORD TRADE
            const newTrade: Trade = {
                id: `TRD-${Date.now()}`,
                orderId: result.ordernumber,
                time: formatTime(),
                symbol: `${selectedIndex} ${strike} ${type}`,
                side: 'BUY',
                product: 'NRML',
                qty: orderQty,
                price: filledPrice,
                value: turnover,
                triggerPrice: intendedPrice, // Store what we wanted
                slippage: slippage,
                charges: charges
            };
            stateRef.current.trades.unshift(newTrade);
            
            // OPEN POSITION
            const newPos: Position = {
                id: result.ordernumber, type, strike, qty: orderQty,
                avgPrice: filledPrice, 
                basePrice: filledPrice,
                ltp: filledPrice, pnl: 0, realizedPnl: 0,
                slPrice: filledPrice - config.initialSLPoints,
                targetPrice: filledPrice + config.targetPoints,
                status: 'OPEN', scalingCount: 0, isPyramided: false,
                reentryAttemptsLeft: config.maxReentryAttempts
            };
            stateRef.current.positions.push(newPos);
        } else {
            // ORDER REJECTED
            stateRef.current.orders[orderIndex].status = 'REJECTED';
            stateRef.current.orders[orderIndex].message = result.message || 'Unknown Error';
        }
        setRenderTrigger(prev => prev + 1);
    }
  };

  const handleManualExit = async (id: string) => {
    const pos = stateRef.current.positions.find(p => p.id === id);
    if (!pos || pos.status === 'CLOSED') return;
    
    // SNAPSHOT PRICE for Slippage
    const snapshotLtp = pos.type === 'CE' ? stateRef.current.ceLtp : stateRef.current.peLtp;

    // Create Exit Order
    const tempId = `ORD-EXIT-${Date.now()}`;
    const newOrder: Order = {
      id: tempId, time: formatTime(), symbol: `${selectedIndex} ${pos.strike} ${pos.type}`,
      type: 'MKT', side: 'SELL', product: 'NRML', qty: pos.qty, price: 0,
      status: 'TRIGGER PENDING', averagePrice: 0, message: 'Exiting...'
    };
    addOrder(newOrder);
    setRenderTrigger(prev => prev + 1);

    const result = await placeBackendOrder({
        exchange: 'NFO', symbol: `${selectedIndex} ${pos.strike} ${pos.type}`,
        qty: pos.qty, type: 'MARKET', side: 'SELL'
    });

    const orderIndex = stateRef.current.orders.findIndex(o => o.id === tempId);
    if (stateRef.current.orders[orderIndex]) {
        if (result && result.ordernumber) {
             const exitPrice = parseFloat(result.averagePrice) || snapshotLtp;

             stateRef.current.orders[orderIndex].status = 'COMPLETE';
             stateRef.current.orders[orderIndex].exchangeOrderId = result.ordernumber;
             stateRef.current.orders[orderIndex].averagePrice = exitPrice;

             // --- ADVANCED CALCULATIONS ---
             // Sell Slippage: Actual - Intended (Ex: Wanted 100, Got 99. Slippage = -1)
             const slippage = exitPrice - snapshotLtp; 
             const turnover = exitPrice * pos.qty;
             const charges = calculateCharges(turnover, 'SELL');

             // Update Session Stats
             stateRef.current.stats.totalTurnover += turnover;
             stateRef.current.stats.totalCharges += charges;
             stateRef.current.stats.totalSlippage += (slippage * pos.qty);

             // RECORD EXIT TRADE
             const newTrade: Trade = {
                id: `TRD-${Date.now()}`,
                orderId: result.ordernumber,
                time: formatTime(),
                symbol: `${selectedIndex} ${pos.strike} ${pos.type}`,
                side: 'SELL',
                product: 'NRML',
                qty: pos.qty,
                price: exitPrice,
                value: turnover,
                triggerPrice: snapshotLtp,
                slippage: slippage,
                charges: charges
            };
            stateRef.current.trades.unshift(newTrade);

            pos.status = 'CLOSED';
            pos.realizedPnl = (exitPrice - pos.avgPrice) * pos.qty;
        } else {
            stateRef.current.orders[orderIndex].status = 'REJECTED';
            stateRef.current.orders[orderIndex].message = result.message || 'Exit Failed';
        }
    }
    setRenderTrigger(prev => prev + 1);
  };
  
  const { positions, orders, trades, stats, ceLtp, peLtp, watchers, funds } = stateRef.current;
  const activePositions = positions.filter(p => p.status === 'OPEN');
  const displayPositions = [...activePositions].reverse();

  // Helper for Funds Progress Bar
  const totalFunds = funds.totalCash > 0 ? funds.totalCash : 1;
  const usedPercentage = Math.min((funds.usedMargin / totalFunds) * 100, 100);

  // Filter Orders for Display
  const filteredOrders = orders.filter(o => {
     if (orderFilter === 'ALL') return true;
     if (orderFilter === 'OPEN') return ['OPEN', 'TRIGGER PENDING'].includes(o.status);
     if (orderFilter === 'EXECUTED') return o.status === 'COMPLETE';
     if (orderFilter === 'REJECTED') return o.status === 'REJECTED';
     return true;
  });

  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 font-sans selection:bg-blue-500/30 pb-10">
      <header className="h-16 border-b border-slate-800/50 bg-[#020617]/80 backdrop-blur-md sticky top-0 z-50 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6 text-blue-500 fill-blue-500/20" />
          <h1 className="text-xl font-bold text-white tracking-tight">{selectedIndex} <span className="text-blue-500">HFT</span> Scalper</h1>
        </div>
        <div className="flex items-center gap-4">
           {!isConnected && (
             <button onClick={handleLogin} className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${backendError ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-500'}`} disabled={isLoggingIn || !!backendError}>
                {isLoggingIn ? "OPENING..." : "LOGIN BROKER"}
             </button>
           )}
          <StatusBadge latency={latency} isConnected={isConnected} />
        </div>
      </header>

      {backendError && (
        <div className="bg-red-500 text-white py-3 px-4 text-center animate-pulse">
            <div className="flex items-center justify-center gap-2 text-sm font-bold">
                <AlertTriangle className="w-5 h-5" />
                <span>{backendError === "VPS SERVER OFFLINE" ? "VPS DISCONNECTED: Run 'cd trading-sensex && npm run start-all' in terminal" : backendError}</span>
            </div>
        </div>
      )}

      <main className="max-w-[1600px] mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          {/* CARD 1: SESSION PERFORMANCE */}
          <div className="bg-[#0f172a] rounded-xl border border-slate-800 p-6 relative overflow-hidden group h-full flex flex-col justify-between">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity"><Wallet className="w-32 h-32 text-slate-600" /></div>
            
            <div className="relative z-10">
                 <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-500" /> Session Performance</h3>
                 
                 <div className="grid grid-cols-2 gap-6 mb-6">
                     <div>
                         <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Gross P&L</div>
                         <div className={`text-3xl font-black font-mono tracking-tighter ${stats.totalMtm >= 0 ? 'text-white' : 'text-rose-400'}`}>
                             {formatCurrency(stats.totalMtm)}
                         </div>
                     </div>
                     <div>
                         <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Net P&L</div>
                         <div className={`text-3xl font-black font-mono tracking-tighter ${stats.totalMtm - stats.totalCharges >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {formatCurrency(stats.totalMtm - stats.totalCharges)} 
                         </div>
                     </div>
                 </div>

                 <div className="pt-4 border-t border-slate-800 grid grid-cols-3 gap-2">
                      <div className="bg-slate-900/50 p-2 rounded border border-slate-800">
                          <div className="text-[10px] text-slate-500 font-bold uppercase">Charges</div>
                          <div className="text-xs font-mono font-bold text-rose-400 mt-1">-{formatCurrency(stats.totalCharges)}</div>
                      </div>
                      <div className="bg-slate-900/50 p-2 rounded border border-slate-800">
                          <div className="text-[10px] text-slate-500 font-bold uppercase">Slippage</div>
                          <div className={`text-xs font-mono font-bold mt-1 ${stats.totalSlippage > 0 ? 'text-emerald-500' : stats.totalSlippage < 0 ? 'text-rose-500' : 'text-slate-500'}`}>
                              {stats.totalSlippage > 0 ? '+' : ''}{formatCurrency(stats.totalSlippage)}
                          </div>
                      </div>
                      <div className="bg-slate-900/50 p-2 rounded border border-slate-800">
                          <div className="text-[10px] text-slate-500 font-bold uppercase">Active</div>
                          <div className="text-xs font-mono font-bold text-blue-400 mt-1">{activePositions.length} Pos</div>
                      </div>
                 </div>
            </div>
          </div>
          <div className="bg-[#0f172a] rounded-xl border border-slate-800 p-6 relative overflow-hidden flex flex-col justify-between h-full">
             <div className="flex justify-between items-start mb-6">
                 <div>
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${selectedIndex === 'NIFTY' ? 'bg-blue-500' : selectedIndex === 'BANKNIFTY' ? 'bg-orange-500' : 'bg-purple-500'}`}></span>
                        {selectedIndex} SPOT
                    </h3>
                    <div className="text-4xl font-black text-white font-mono flex items-baseline gap-3">{spotPrice > 0 ? spotPrice.toFixed(2) : <span className="text-slate-600">LOADING...</span>}</div>
                 </div>
                 <div className="text-right">
                    <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Calculated ATM</div>
                    <div className={`text-2xl font-mono font-bold px-3 py-1 rounded border inline-block bg-slate-900 ${selectedIndex === 'NIFTY' ? 'text-blue-400 border-blue-500/30' : selectedIndex === 'BANKNIFTY' ? 'text-orange-400 border-orange-500/30' : 'text-purple-400 border-purple-500/30'}`}>{spotPrice > 0 ? Math.round(spotPrice / getStep()) * getStep() : '---'}</div>
                 </div>
             </div>
             <div className="h-px bg-slate-800 w-full mb-4"></div>
             <div>
                <div className="flex justify-between items-center mb-3">
                   <div className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-2"><Target className="w-3 h-3 text-slate-500" /> Quick Strike Select</div>
                </div>
                <div className="grid grid-cols-5 gap-2">
                   {[-2, -1, 0, 1, 2].map(offset => (
                      <button key={offset} onClick={() => handleQuickStrikeSelection(offset)} disabled={spotPrice === 0}
                        className={`py-2 rounded text-xs font-bold border transition-all ${offset === 0 ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:bg-slate-800 hover:text-white'}`}>
                         {offset === 0 ? 'ATM' : offset > 0 ? `+${offset}` : offset}
                      </button>
                   ))}
                </div>
             </div>
          </div>
        </div>
        <div className="flex items-center justify-center p-2 bg-slate-900/50 rounded-lg border border-slate-800 w-fit mx-auto gap-1">
             {['NIFTY', 'BANKNIFTY', 'SENSEX'].map(idx => (
                 <button key={idx} onClick={() => handleIndexSwitch(idx as MarketIndex)} className={`px-6 py-2 rounded font-bold text-xs transition-all ${selectedIndex === idx ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}>{idx}</button>
             ))}
        </div>
        <div className="bg-[#0f172a] rounded-xl border border-slate-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/30">
            <div className="flex items-center gap-3"><div className="p-2 bg-blue-500/10 rounded-lg text-blue-500"><Settings className="w-5 h-5" /></div><div><h2 className="text-sm font-bold text-white">Control Tower</h2></div></div>
          </div>
          <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-2 cursor-pointer" onClick={() => toggleModule('A')}><div className="flex items-center gap-2"><Layers className="w-4 h-4 text-blue-500" /><h3 className="text-xs font-bold text-white">Position Sizing</h3></div>{expandedModules.A ? <ChevronUp className="w-4 h-4 text-slate-500"/> : <ChevronDown className="w-4 h-4 text-slate-500"/>}</div>
              {expandedModules.A && (<div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800 space-y-4"><NumberInput label="Base Qty" value={config.baseQty} onChange={(e) => setConfig(c => ({...c, baseQty: parseInt(e.target.value) || 0}))} /></div>)}
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-2 cursor-pointer" onClick={() => toggleModule('B')}><div className="flex items-center gap-2"><ArrowUpRight className="w-4 h-4 text-purple-500" /><h3 className="text-xs font-bold text-white">Pyramiding</h3></div>{expandedModules.B ? <ChevronUp className="w-4 h-4 text-slate-500"/> : <ChevronDown className="w-4 h-4 text-slate-500"/>}</div>
              {expandedModules.B && (<div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800 space-y-4 border-l-2 border-l-purple-500"><div className="grid grid-cols-2 gap-4"><NumberInput label="Trigger Gap" subLabel="Pts" value={config.pyramidGap} onChange={(e) => setConfig(c => ({...c, pyramidGap: parseInt(e.target.value) || 0}))} className="text-purple-400" /><NumberInput label="SL Buffer" subLabel="Pts" value={config.pyramidSLBuffer} onChange={(e) => setConfig(c => ({...c, pyramidSLBuffer: parseInt(e.target.value) || 0}))} className="text-rose-400" /></div><NumberInput label="Multiplier" value={config.pyramidMultiplier} onChange={(e) => setConfig(c => ({...c, pyramidMultiplier: parseInt(e.target.value) || 0}))} /><NumberInput label="Max Attempts" value={config.maxReentryAttempts} onChange={(e) => setConfig(c => ({...c, maxReentryAttempts: parseInt(e.target.value) || 0}))} /></div>)}
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-2 cursor-pointer" onClick={() => toggleModule('C')}><div className="flex items-center gap-2"><Shield className="w-4 h-4 text-rose-500" /><h3 className="text-xs font-bold text-white">Risk & Reward</h3></div>{expandedModules.C ? <ChevronUp className="w-4 h-4 text-slate-500"/> : <ChevronDown className="w-4 h-4 text-slate-500"/>}</div>
              {expandedModules.C && (<div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800 space-y-4"><NumberInput label="Initial SL (Pts)" value={config.initialSLPoints} onChange={(e) => setConfig(c => ({...c, initialSLPoints: parseInt(e.target.value) || 0}))} className="text-rose-400" /><NumberInput label="Target (Pts)" value={config.targetPoints} onChange={(e) => setConfig(c => ({...c, targetPoints: parseInt(e.target.value) || 0}))} className="text-emerald-400" /></div>)}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
           <div className="bg-[#0f172a] rounded-xl border border-slate-800 p-6 flex flex-col gap-6 relative overflow-hidden">
              <div className="flex justify-between items-start z-10"><div className="flex items-center gap-2"><TrendingUp className="w-5 h-5 text-emerald-500" /><h2 className="text-lg font-black text-emerald-500 uppercase tracking-tighter">CE Strike</h2></div><div className="text-right"><div className="text-[10px] font-bold text-slate-500 uppercase">LTP (Live)</div><div className="text-xl font-bold font-mono text-white">{ceLtp > 0 ? ceLtp.toFixed(2) : '--'}</div></div></div>
              <div className="space-y-4 z-10"><NumberInput label="CE Strike" value={selectedCeStrike} onChange={(e) => setSelectedCeStrike(e.target.value)} placeholder="e.g. 82000" /><div className="relative"><NumberInput label="Entry Price" value={ceEntryPrice} onChange={(e) => setCeEntryPrice(e.target.value)} placeholder="0 for Market" className="text-emerald-500 border-emerald-500/20 focus:border-emerald-500" /></div><button onClick={() => handleBuy('CE')} className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest rounded-lg shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"><Play className="w-4 h-4 fill-current" /> Buy CE</button></div>
           </div>
           <div className="bg-[#0f172a] rounded-xl border border-slate-800 p-6 flex flex-col gap-6 relative overflow-hidden">
              <div className="flex justify-between items-start z-10"><div className="flex items-center gap-2"><TrendingDown className="w-5 h-5 text-rose-500" /><h2 className="text-lg font-black text-rose-500 uppercase tracking-tighter">PE Strike</h2></div><div className="text-right"><div className="text-[10px] font-bold text-slate-500 uppercase">LTP (Live)</div><div className="text-xl font-bold font-mono text-white">{peLtp > 0 ? peLtp.toFixed(2) : '--'}</div></div></div>
              <div className="space-y-4 z-10"><NumberInput label="PE Strike" value={selectedPeStrike} onChange={(e) => setSelectedPeStrike(e.target.value)} placeholder="e.g. 82000" /><div className="relative"><NumberInput label="Entry Price" value={peEntryPrice} onChange={(e) => setPeEntryPrice(e.target.value)} placeholder="0 for Market" className="text-rose-500 border-rose-500/20 focus:border-rose-500" /></div><button onClick={() => handleBuy('PE')} className="w-full py-4 bg-rose-600 hover:bg-rose-500 text-white font-black uppercase tracking-widest rounded-lg shadow-lg shadow-rose-500/20 transition-all flex items-center justify-center gap-2"><Play className="w-4 h-4 fill-current" /> Buy PE</button></div>
           </div>
        </div>
        <div className="bg-[#0f172a] rounded-xl border border-slate-800 overflow-hidden min-h-[400px]">
           <div className="flex items-center border-b border-slate-800 bg-slate-900/30 overflow-x-auto">
               {['POSITIONS', 'ORDERS', 'TRADES', 'FUNDS'].map(tab => (
                 <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-6 py-4 text-xs font-bold uppercase tracking-wider transition-colors border-r border-slate-800/50 min-w-[120px] ${activeTab === tab ? 'bg-[#0f172a] text-blue-500 border-t-2 border-t-blue-500' : 'text-slate-500 hover:text-slate-300'}`}>{tab === 'PENDING' ? (watchers.length > 0 ? `PENDING (${watchers.length})` : 'PENDING') : tab}</button>
               ))}
           </div>
           <div className="overflow-x-auto">
              {activeTab === 'POSITIONS' && (
                  <table className="w-full text-left border-collapse">
                    <thead><tr className="bg-slate-900/20 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800"><th className="p-4">Instrument</th><th className="p-4 text-right">Qty</th><th className="p-4 text-right">LTP</th><th className="p-4 text-right">P&L</th><th className="p-4 text-right">Action</th></tr></thead>
                    <tbody className="divide-y divide-slate-800 text-xs font-mono">
                      {displayPositions.length === 0 ? (<tr><td colSpan={5} className="p-12 text-center text-slate-600 font-sans">No active positions.</td></tr>) : (
                        displayPositions.map(pos => (
                            <tr key={pos.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="p-4 font-bold text-white"><span className={pos.type === 'CE' ? 'text-emerald-500' : 'text-rose-500'}>{pos.strike} {pos.type}</span></td>
                            <td className="p-4 text-right text-white font-bold">{pos.qty}</td>
                            <td className={`p-4 text-right font-bold ${pos.ltp > pos.avgPrice ? 'text-emerald-500' : 'text-rose-500'}`}>{pos.ltp.toFixed(2)}</td>
                            <td className={`p-4 text-right font-bold ${pos.pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{pos.pnl.toFixed(2)}</td>
                            <td className="p-4 text-right"><button onClick={() => handleManualExit(pos.id)} className="text-[10px] font-bold text-rose-500 hover:text-white hover:bg-rose-600 px-3 py-1 rounded border border-rose-500/30 transition-all">EXIT</button></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
              )}
              {activeTab === 'ORDERS' && (
                  <div className="p-6">
                      {/* FILTERS */}
                      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                          <h3 className="text-sm font-bold text-white flex items-center gap-2"><FileText className="w-4 h-4 text-blue-500" /> Order Book</h3>
                          <div className="flex bg-slate-900/50 p-1 rounded-lg border border-slate-800">
                              {['ALL', 'OPEN', 'EXECUTED', 'REJECTED'].map(f => (
                                  <button key={f} onClick={() => setOrderFilter(f as any)} className={`px-3 py-1.5 text-[10px] font-bold rounded transition-all ${orderFilter === f ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
                                      {f}
                                  </button>
                              ))}
                          </div>
                      </div>

                      <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-900/20 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                                <th className="p-4 whitespace-nowrap"><div className="flex items-center gap-1"><Clock className="w-3 h-3" /> Time / ID</div></th>
                                <th className="p-4"><div className="flex items-center gap-1"><Layers className="w-3 h-3" /> Instrument</div></th>
                                <th className="p-4">Side</th>
                                <th className="p-4 text-right">Details</th>
                                <th className="p-4">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 text-xs font-mono">
                          {filteredOrders.length === 0 ? (
                            <tr><td colSpan={5} className="p-12 text-center text-slate-600 font-sans italic">No orders found matching filter.</td></tr>
                          ) : (
                            filteredOrders.map(order => (
                              <tr key={order.id} className="hover:bg-slate-800/30 transition-colors group">
                                 <td className="p-4 align-top">
                                    <div className="text-slate-300 font-bold">{order.time}</div>
                                    <div className="flex items-center gap-1 mt-1 cursor-pointer group/id" onClick={() => navigator.clipboard.writeText(order.id)}>
                                        <div className="text-[10px] text-slate-600 font-mono group-hover/id:text-blue-400 transition-colors">{order.id}</div>
                                        <Copy className="w-3 h-3 text-slate-700 group-hover/id:text-blue-500 opacity-0 group-hover/id:opacity-100 transition-opacity" />
                                    </div>
                                 </td>
                                 <td className="p-4 align-top">
                                    <div className="text-white font-bold text-sm">{order.symbol}</div>
                                    <div className="flex items-center gap-2 mt-2">
                                        <span className="text-[10px] font-bold bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded border border-slate-700">{order.product}</span>
                                        <span className="text-[10px] font-bold bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded border border-slate-700">{order.type}</span>
                                    </div>
                                 </td>
                                 <td className="p-4 align-top">
                                    <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider border ${order.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                                        {order.side}
                                    </span>
                                 </td>
                                 <td className="p-4 text-right align-top">
                                    <div className="text-white font-bold text-sm">{order.qty} Qty</div>
                                    <div className="flex flex-col items-end gap-0.5 mt-1">
                                        {order.type === 'LMT' ? (
                                           <span className="text-[10px] text-slate-500">Req: {order.price}</span>
                                        ) : (
                                           <span className="text-[10px] text-slate-600 italic">MKT Order</span>
                                        )}
                                        {order.averagePrice ? (
                                            <span className={`text-[10px] font-bold ${order.side === 'BUY' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                Avg: {order.averagePrice}
                                            </span>
                                        ) : (
                                            <span className="text-[10px] text-slate-700">--</span>
                                        )}
                                    </div>
                                 </td>
                                 <td className="p-4 align-top min-w-[200px]">
                                    <div className="flex flex-col gap-2">
                                        {order.status === 'COMPLETE' && (
                                            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[10px] bg-emerald-500/10 px-2 py-1 rounded w-fit border border-emerald-500/20">
                                                <CheckCircle2 className="w-3 h-3" /> COMPLETE
                                            </div>
                                        )}
                                        {order.status === 'REJECTED' && (
                                            <div className="flex items-center gap-1.5 text-rose-400 font-bold text-[10px] bg-rose-500/10 px-2 py-1 rounded w-fit border border-rose-500/20">
                                                <XCircle className="w-3 h-3" /> REJECTED
                                            </div>
                                        )}
                                        {(order.status === 'TRIGGER PENDING' || order.status === 'OPEN') && (
                                            <div className="flex items-center gap-1.5 text-blue-400 font-bold text-[10px] bg-blue-500/10 px-2 py-1 rounded w-fit border border-blue-500/20 animate-pulse">
                                                <Clock className="w-3 h-3" /> PENDING
                                            </div>
                                        )}
                                        
                                        {/* FULL REJECTION DETAILS */}
                                        {order.status === 'REJECTED' && order.message && (
                                            <div className="p-2 bg-rose-950/30 border border-rose-500/20 rounded text-rose-300 text-[10px] font-mono whitespace-pre-wrap break-words mt-1">
                                                <div className="flex items-center gap-1 mb-1 font-bold text-rose-500 uppercase">
                                                    <AlertCircle className="w-3 h-3" /> Broker Message:
                                                </div>
                                                {order.message}
                                            </div>
                                        )}
                                    </div>
                                 </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                  </div>
              )}
              {activeTab === 'TRADES' && (
                  <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-900/20 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                            <th className="p-4"><div className="flex items-center gap-1"><History className="w-3 h-3" /> Time</div></th>
                            <th className="p-4">Instrument</th>
                            <th className="p-4">Type</th>
                            <th className="p-4 text-right">Details</th>
                            <th className="p-4 text-right">Execution</th>
                            <th className="p-4 text-right">Net Value</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-xs font-mono">
                      {trades.length === 0 ? (
                        <tr><td colSpan={6} className="p-12 text-center text-slate-600 font-sans italic">No trades recorded yet.</td></tr>
                      ) : (
                        trades.map(trade => {
                            const isBuy = trade.side === 'BUY';
                            
                            return (
                          <tr key={trade.id} className="hover:bg-slate-800/30 transition-colors group">
                             <td className="p-4 align-top text-slate-400">{trade.time}</td>
                             <td className="p-4 align-top">
                                <div className="text-white font-bold">{trade.symbol}</div>
                                <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1"><Receipt className="w-3 h-3" /> ID: {trade.orderId}</div>
                             </td>
                             <td className="p-4 align-top">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${isBuy ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                                    {trade.side}
                                </span>
                             </td>
                             <td className="p-4 text-right align-top">
                                <div className="text-white font-bold">{trade.qty} Qty</div>
                                <div className="text-[10px] text-slate-500 mt-1">Trig: {trade.triggerPrice?.toFixed(2)}</div>
                             </td>
                             <td className="p-4 text-right align-top">
                                <div className="text-white font-bold">{trade.price.toFixed(2)}</div>
                                {trade.slippage !== undefined && (
                                    <div className={`text-[10px] mt-1 font-bold flex items-center justify-end gap-1 ${trade.slippage > 0 ? 'text-emerald-500' : trade.slippage < 0 ? 'text-rose-500' : 'text-slate-500'}`}>
                                        {trade.slippage > 0 ? <TrendingUp className="w-3 h-3" /> : trade.slippage < 0 ? <AlertTriangle className="w-3 h-3" /> : null}
                                        {trade.slippage > 0 ? '+' : ''}{trade.slippage.toFixed(2)} Slip
                                    </div>
                                )}
                             </td>
                             <td className="p-4 text-right align-top">
                                <div className="text-slate-300 font-bold">{formatCurrency(trade.value)}</div>
                                <div className="text-[10px] text-slate-500 mt-1" title="Includes Exchange Txn, STT, GST, Stamp Duty">
                                    Tax: -{formatCurrency(trade.charges || 0)}
                                </div>
                             </td>
                          </tr>
                        )})
                      )}
                    </tbody>
                  </table>
              )}
              {activeTab === 'FUNDS' && (
                  <div className="p-6">
                      {!isConnected ? (
                           <div className="flex flex-col items-center justify-center p-12 text-slate-500 bg-slate-800/20 rounded-lg border border-slate-800 border-dashed">
                               <WifiOff className="w-12 h-12 mb-4 opacity-50" />
                               <h3 className="text-lg font-bold text-slate-400">Broker Disconnected</h3>
                               <p className="text-sm">Please login to view account funds.</p>
                           </div>
                      ) : (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-bold text-white flex items-center gap-2"><Wallet className="w-4 h-4 text-blue-500" /> Account Overview</h3>
                                <button onClick={fetchFunds} disabled={isLoadingFunds} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded text-slate-300 transition-colors">
                                    <RefreshCw className={`w-3 h-3 ${isLoadingFunds ? 'animate-spin' : ''}`} /> Refresh
                                </button>
                            </div>

                            {/* MAIN SUMMARY CARD */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-gradient-to-br from-slate-900 to-slate-950 p-6 rounded-xl border border-slate-800 relative overflow-hidden">
                                     <div className="absolute top-0 right-0 p-6 opacity-5"><PieChart className="w-32 h-32 text-blue-500" /></div>
                                     <div className="relative z-10">
                                         <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Net Available Margin</p>
                                         <h2 className="text-4xl font-black text-emerald-400 font-mono mb-6">{formatCurrency(funds.availableMargin)}</h2>
                                         
                                         {/* Progress Bar */}
                                         <div className="space-y-2">
                                             <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500">
                                                 <span>Used: {usedPercentage.toFixed(1)}%</span>
                                                 <span>Total: {formatCurrency(totalFunds)}</span>
                                             </div>
                                             <div className="relative h-3 w-full bg-slate-800 rounded-full overflow-hidden">
                                                 <div 
                                                    className={`h-full transition-all duration-500 ${usedPercentage > 90 ? 'bg-rose-500' : usedPercentage > 50 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                                                    style={{ width: `${usedPercentage}%` }}
                                                 ></div>
                                                 <div className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white/80 drop-shadow-md">
                                                    {usedPercentage.toFixed(1)}% Utilized
                                                 </div>
                                             </div>
                                         </div>
                                     </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex flex-col justify-center">
                                         <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1"><ArrowUpRight className="w-3 h-3 text-blue-400" /> Used Margin</p>
                                         <p className="text-xl font-bold text-white font-mono">{formatCurrency(funds.usedMargin)}</p>
                                    </div>
                                    <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex flex-col justify-center">
                                         <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1"><History className="w-3 h-3 text-slate-400" /> Opening Balance</p>
                                         <p className="text-xl font-bold text-white font-mono">{formatCurrency(funds.openingBalance)}</p>
                                    </div>
                                    <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex flex-col justify-center">
                                         <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1"><ArrowRightCircle className="w-3 h-3 text-emerald-500" /> Pay In</p>
                                         <p className="text-xl font-bold text-emerald-400 font-mono">{formatCurrency(funds.payIn)}</p>
                                    </div>
                                    <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex flex-col justify-center">
                                         <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1"><ArrowRightCircle className="w-3 h-3 text-rose-500" /> Pay Out</p>
                                         <p className="text-xl font-bold text-rose-400 font-mono">{formatCurrency(funds.payOut)}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 bg-slate-900/30 rounded-lg border border-slate-800/50 text-[10px] text-slate-500">
                                <p><strong>Note:</strong> 'Available Margin' is calculated as Cash Balance - Margin Used. Data is fetched directly from the Broker API.</p>
                            </div>
                        </div>
                      )}
                  </div>
              )}
           </div>
        </div>
      </main>
    </div>
  );
};
export default App;