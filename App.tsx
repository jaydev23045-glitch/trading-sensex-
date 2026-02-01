import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, Zap, TrendingUp, TrendingDown, RotateCcw, Plus, Minus, 
  BookOpen, Shield, Activity, Play, Wallet, Layers, Download, ArrowUpRight,
  ArrowDownLeft, AlertTriangle, CheckCircle2, XCircle, ChevronDown, ChevronUp,
  Eye, Timer, Lock, RefreshCw, MousePointerClick, Crosshair, RefreshCcw,
  Hourglass, Server, Calculator, Coins, ArrowRightLeft, BarChart3, Target
} from 'lucide-react';
import { NumberInput } from './components/ui/Input';
import { StatusBadge } from './components/ui/StatusBadge';
import { DashboardConfig, Position, SessionStats, Order, Trade, FundLimits, Watcher, OrderType, OrderStatus } from './types';
import { DEFAULT_DASHBOARD_CONFIG } from './constants';

// Helper for currency formatting
const formatCurrency = (val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val);
const formatTime = () => new Date().toLocaleTimeString('en-US', { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

type MarketIndex = 'SENSEX' | 'NIFTY' | 'BANKNIFTY';

const App: React.FC = () => {
  // --- Configuration State ---
  const [config, setConfig] = useState<DashboardConfig>(DEFAULT_DASHBOARD_CONFIG);
  const [expandedModules, setExpandedModules] = useState({
    A: true,
    B: true,
    C: true
  });
  
  // --- State (Refs for performance/closure avoidance) ---
  const stateRef = useRef({
    positions: [] as Position[],
    orders: [] as Order[],
    trades: [] as Trade[],
    watchers: [] as Watcher[], 
    funds: {
      availableMargin: 0,
      usedMargin: 0,
      totalCash: 0,
      openingBalance: 0,
      payIn: 0,
      payOut: 0
    } as FundLimits,
    ceLtp: 0, 
    peLtp: 0,
    stats: {
      totalMtm: 0.00,
      totalCharges: 0.00,
      netPnl: 0.00,
      totalSlippage: 0.00,
      totalTurnover: 0.00
    } as SessionStats
  });

  // --- UI State (Synced from Ref) ---
  const [renderTrigger, setRenderTrigger] = useState(0); 
  const [activeTab, setActiveTab] = useState<'POSITIONS' | 'ORDERS' | 'TRADES' | 'FUNDS'>('POSITIONS');
  
  // Market Selection State
  const [selectedIndex, setSelectedIndex] = useState<MarketIndex>('SENSEX');
  const [spotPrice, setSpotPrice] = useState(0);
  
  const [selectedCeStrike, setSelectedCeStrike] = useState("82000");
  const [selectedPeStrike, setSelectedPeStrike] = useState("82000");
  const [ceEntryPrice, setCeEntryPrice] = useState<string>("0");
  const [peEntryPrice, setPeEntryPrice] = useState<string>("0");
  const [latency, setLatency] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // --- 1. Handle Login Callback ---
  useEffect(() => {
    const handleAuthCallback = async () => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code'); // Flattrade returns ?code=...

        if (code) {
            setIsLoggingIn(true);
            // Clean the URL immediately so the user doesn't see the code
            window.history.replaceState({}, document.title, window.location.pathname);
            
            try {
                const response = await fetch('http://localhost:5000/authenticate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code })
                });

                const data = await response.json();
                if (data.success) {
                    setIsConnected(true);
                    alert("Login Successful! Connected to Flattrade.");
                } else {
                    alert("Login Failed: " + JSON.stringify(data.error));
                }
            } catch (e) {
                console.error(e);
                alert("Login Error: Could not reach VPS Server.");
            } finally {
                setIsLoggingIn(false);
            }
        }
    };

    handleAuthCallback();
  }, []);

  // --- 2. WebSocket Connection (Backend) ---
  useEffect(() => {
    let ws: WebSocket | null = null;
    
    try {
        ws = new WebSocket('ws://localhost:8080');

        ws.onopen = () => {
          setIsConnected(true);
          console.log("Connected to Backend Socket");
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const now = Date.now();
            
            if (data.symbol === selectedIndex) {
                setSpotPrice(data.lp); 
            }
            if (data.symbol.includes('CE')) {
                stateRef.current.ceLtp = data.lp;
            }
            if (data.symbol.includes('PE')) {
                stateRef.current.peLtp = data.lp;
            }
            
            if (data.timestamp) {
               setLatency(now - data.timestamp);
            }
            
            setRenderTrigger(prev => prev + 1);
          } catch (e) {
            // console.error("Data parse error", e);
          }
        };

        ws.onclose = () => setIsConnected(false);
        ws.onerror = () => setIsConnected(false);
        
    } catch (e) {
        console.error("WebSocket setup failed:", e);
        setIsConnected(false);
    }

    return () => {
        if (ws) ws.close();
    };
  }, [selectedIndex]);

  // --- Engine Helpers ---
  const estimateCharges = (value: number, side: 'BUY' | 'SELL') => {
    const brokerage = 20; 
    const stt = side === 'SELL' ? value * 0.000625 : 0; 
    const txn = value * 0.0005; 
    const gst = (brokerage + txn) * 0.18; 
    const stamp = side === 'BUY' ? value * 0.00003 : 0; 
    return brokerage + stt + txn + gst + stamp;
  };

  const addOrder = (order: Order) => {
    stateRef.current.orders.unshift(order);
  };

  const addTrade = (trade: Trade) => {
    const state = stateRef.current;
    state.trades.unshift(trade);
    if (trade.side === 'BUY') {
      state.funds.usedMargin += trade.value;
      state.funds.availableMargin -= trade.value;
    } else {
      state.funds.usedMargin = Math.max(0, state.funds.usedMargin - trade.value);
      state.funds.availableMargin += trade.value;
    }
    state.stats.totalCharges += trade.charges;
    state.stats.totalSlippage += trade.slippage;
    state.stats.totalTurnover += trade.value;
  };

  const toggleModule = (mod: 'A' | 'B' | 'C') => {
    setExpandedModules(prev => ({...prev, [mod]: !prev[mod]}));
  };

  // --- API Actions ---
  const placeBackendOrder = async (orderData: any) => {
      try {
          const response = await fetch('http://localhost:5000/place-order', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(orderData)
          });
          if (!response.ok) {
            throw new Error(`Server status: ${response.status}`);
          }
          return await response.json();
      } catch (e) {
          console.error("Order Failed", e);
          return { status: "FAILED", message: "Connection Error. Check VPS." };
      }
  };

  const handleLogin = async () => {
    try {
        const res = await fetch('http://localhost:5000/login');
        if (!res.ok) throw new Error('Server unreachable');
        const data = await res.json();
        if (data.url) {
            window.location.href = data.url;
        } else {
            alert('Login URL not found');
        }
    } catch (e) {
        alert("Connection Failed: Cannot reach VPS Server at http://localhost:5000.\n\nPlease ensure:\n1. 'node vps-server.js' is running on the VPS.\n2. SSH Port Forwarding for port 5000 is active.");
    }
  };

  // --- Handle Index Change ---
  const handleIndexSwitch = (index: MarketIndex) => {
    setSelectedIndex(index);
    // Reset inputs for convenience
    if (index === 'SENSEX') {
      setSelectedCeStrike("82100");
      setSelectedPeStrike("82100");
    } else if (index === 'NIFTY') {
      setSelectedCeStrike("25100");
      setSelectedPeStrike("25100");
    } else if (index === 'BANKNIFTY') {
      setSelectedCeStrike("51500");
      setSelectedPeStrike("51400");
    }
  };

  // --- Quick Strike Selection Logic ---
  const getStep = () => selectedIndex === 'NIFTY' ? 50 : 100;
  
  const handleQuickStrikeSelection = (offset: number) => {
     if (spotPrice === 0) return; // Wait for data
     const step = getStep();
     const atm = Math.round(spotPrice / step) * step;
     const targetStrike = atm + (offset * step);
     
     setSelectedCeStrike(targetStrike.toString());
     setSelectedPeStrike(targetStrike.toString());
  };

  // --- User Actions ---
  const handleBuy = async (type: 'CE' | 'PE') => {
    const strike = type === 'CE' ? selectedCeStrike : selectedPeStrike;
    const reqPrice = parseFloat(type === 'CE' ? ceEntryPrice : peEntryPrice);
    const orderQty = config.baseQty;
    const isLimit = reqPrice > 0;
    
    // 1. Optimistic UI Update (Show pending immediately)
    const tempId = `ORD-${Date.now()}`;
    const newOrder: Order = {
      id: tempId,
      time: formatTime(),
      symbol: `${selectedIndex} ${strike} ${type}`,
      type: isLimit ? 'LMT' : 'MKT',
      side: 'BUY',
      product: 'NRML',
      qty: orderQty,
      price: reqPrice || 0,
      status: 'TRIGGER PENDING', // Waiting for API
      averagePrice: 0,
      message: 'Sending to Broker...'
    };
    addOrder(newOrder);
    setRenderTrigger(prev => prev + 1);

    // 2. Call Backend
    const result = await placeBackendOrder({
        exchange: 'NFO', // Or BFO for Sensex
        symbol: `${selectedIndex} ${strike} ${type}`, // Needs proper broker mapping in backend
        qty: orderQty,
        price: reqPrice || 0,
        type: isLimit ? 'LIMIT' : 'MARKET',
        side: 'BUY'
    });

    // 3. Update Order Status based on response
    const orderIndex = stateRef.current.orders.findIndex(o => o.id === tempId);
    if (stateRef.current.orders[orderIndex]) {
        if (result && result.ordernumber) {
            stateRef.current.orders[orderIndex].status = 'COMPLETE'; // Assume filled for scalper
            stateRef.current.orders[orderIndex].exchangeOrderId = result.ordernumber;
            stateRef.current.orders[orderIndex].message = 'Placed on Exchange';
            
            // Add to Positions
            const newPos: Position = {
                id: result.ordernumber,
                type,
                strike,
                qty: orderQty,
                avgPrice: reqPrice || stateRef.current.ceLtp, // Use limit or current LTP
                basePrice: reqPrice || stateRef.current.ceLtp,
                ltp: reqPrice || stateRef.current.ceLtp,
                pnl: 0,
                realizedPnl: 0,
                slPrice: (reqPrice || stateRef.current.ceLtp) - config.initialSLPoints,
                targetPrice: (reqPrice || stateRef.current.ceLtp) + config.targetPoints,
                status: 'OPEN',
                scalingCount: 0,
                isPyramided: false,
                reentryAttemptsLeft: config.maxReentryAttempts
            };
            stateRef.current.positions.push(newPos);

        } else {
            stateRef.current.orders[orderIndex].status = 'REJECTED';
            stateRef.current.orders[orderIndex].message = result?.message || 'API Error';
        }
        setRenderTrigger(prev => prev + 1);
    }
  };

  const handleManualExit = async (id: string) => {
    const pos = stateRef.current.positions.find(p => p.id === id);
    if (!pos || pos.status === 'CLOSED') return;

    // Call Backend to Exit
    await placeBackendOrder({
        exchange: 'NFO',
        symbol: `${selectedIndex} ${pos.strike} ${pos.type}`,
        qty: pos.qty,
        type: 'MARKET',
        side: 'SELL'
    });

    pos.status = 'CLOSED';
    setRenderTrigger(prev => prev + 1);
  };
  
  const cancelWatcher = (id: string) => {
    stateRef.current.watchers = stateRef.current.watchers.filter(w => w.id !== id);
    setRenderTrigger(prev => prev + 1);
  };
  
  const { positions, orders, trades, funds, stats, ceLtp, peLtp, watchers } = stateRef.current;
  const activePositions = positions.filter(p => p.status === 'OPEN');
  const pendingWatchers = watchers; 
  const displayPositions = [...activePositions].reverse();

  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 font-sans selection:bg-blue-500/30 pb-10">
      
      {/* HEADER */}
      <header className="h-16 border-b border-slate-800/50 bg-[#020617]/80 backdrop-blur-md sticky top-0 z-50 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6 text-blue-500 fill-blue-500/20" />
          <h1 className="text-xl font-bold text-white tracking-tight">{selectedIndex} <span className="text-blue-500">HFT</span> Scalper</h1>
        </div>
        <div className="flex items-center gap-4">
           {/* Login Button (If not connected) */}
           {!isConnected && (
             <button 
                onClick={handleLogin}
                className="px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded hover:bg-blue-500"
                disabled={isLoggingIn}
             >
                {isLoggingIn ? "CONNECTING..." : "LOGIN BROKER"}
             </button>
           )}
          <StatusBadge latency={latency} isConnected={isConnected} />
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6 space-y-6">
        
        {/* TOP METRICS ROW */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          {/* MTM CARD */}
          <div className="bg-[#0f172a] rounded-xl border border-slate-800 p-6 relative overflow-hidden group h-full">
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
              <TrendingUp className="w-24 h-24 text-emerald-500" />
            </div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Total MTM</h3>
            <div className={`text-5xl font-black tracking-tighter mb-4 font-mono ${stats.totalMtm >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              {formatCurrency(stats.totalMtm)}
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <div className={`w-2 h-2 rounded-full ${activePositions.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`}></div>
              {activePositions.length > 0 ? `${activePositions.length} ACTIVE POSITIONS` : 'NO ACTIVE POSITIONS'}
            </div>
          </div>

          {/* MARKET MONITOR CARD (NEW & IMPROVED) */}
          <div className="bg-[#0f172a] rounded-xl border border-slate-800 p-6 relative overflow-hidden flex flex-col justify-between h-full">
             {/* Header Row: Spot & ATM */}
             <div className="flex justify-between items-start mb-6">
                 <div>
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${selectedIndex === 'NIFTY' ? 'bg-blue-500' : selectedIndex === 'BANKNIFTY' ? 'bg-orange-500' : 'bg-purple-500'}`}></span>
                        {selectedIndex} SPOT
                    </h3>
                    <div className="text-4xl font-black text-white font-mono flex items-baseline gap-3">
                       {spotPrice > 0 ? spotPrice.toFixed(2) : <span className="text-slate-600">LOADING...</span>}
                    </div>
                 </div>
                 <div className="text-right">
                    <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Calculated ATM</div>
                    <div className={`text-2xl font-mono font-bold px-3 py-1 rounded border inline-block bg-slate-900 ${selectedIndex === 'NIFTY' ? 'text-blue-400 border-blue-500/30' : selectedIndex === 'BANKNIFTY' ? 'text-orange-400 border-orange-500/30' : 'text-purple-400 border-purple-500/30'}`}>
                        {spotPrice > 0 ? Math.round(spotPrice / getStep()) * getStep() : '---'}
                    </div>
                 </div>
             </div>

             {/* Divider */}
             <div className="h-px bg-slate-800 w-full mb-4"></div>

             {/* Quick Selectors */}
             <div>
                <div className="flex justify-between items-center mb-3">
                   <div className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-2">
                     <Target className="w-3 h-3 text-slate-500" /> 
                     Quick Strike Select
                   </div>
                   <div className="text-[10px] text-slate-600 font-mono">Updates Entry Inputs</div>
                </div>
                <div className="grid grid-cols-5 gap-2">
                   {[-2, -1, 0, 1, 2].map(offset => (
                      <button 
                        key={offset}
                        onClick={() => handleQuickStrikeSelection(offset)}
                        disabled={spotPrice === 0}
                        className={`py-2 rounded text-xs font-bold border transition-all relative group ${
                            offset === 0 
                            ? (selectedIndex === 'NIFTY' ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20' : selectedIndex === 'BANKNIFTY' ? 'bg-orange-600 text-white border-orange-500 shadow-lg shadow-orange-500/20' : 'bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-500/20')
                            : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:bg-slate-800 hover:text-white hover:border-slate-600'
                        }`}
                      >
                         {offset === 0 ? 'ATM' : offset > 0 ? `+${offset}` : offset}
                         {spotPrice > 0 && (
                             <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] px-2 py-1 rounded border border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20 shadow-xl">
                                {(Math.round(spotPrice / getStep()) * getStep()) + (offset * getStep())}
                             </span>
                         )}
                      </button>
                   ))}
                </div>
             </div>
          </div>
        </div>

        {/* INDEX SELECTION BAR */}
        <div className="flex items-center justify-center p-2 bg-slate-900/50 rounded-lg border border-slate-800 w-fit mx-auto gap-1">
             <button 
                onClick={() => handleIndexSwitch('NIFTY')}
                className={`px-6 py-2 rounded font-bold text-xs transition-all ${selectedIndex === 'NIFTY' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}
             >
               NIFTY
             </button>
             <button 
                onClick={() => handleIndexSwitch('BANKNIFTY')}
                className={`px-6 py-2 rounded font-bold text-xs transition-all ${selectedIndex === 'BANKNIFTY' ? 'bg-orange-600 text-white shadow-lg shadow-orange-500/25' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}
             >
               BANKNIFTY
             </button>
             <button 
                onClick={() => handleIndexSwitch('SENSEX')}
                className={`px-6 py-2 rounded font-bold text-xs transition-all ${selectedIndex === 'SENSEX' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/25' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}
             >
               SENSEX
             </button>
        </div>

        {/* CONTROL TOWER */}
        <div className="bg-[#0f172a] rounded-xl border border-slate-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/30">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Control Tower</h2>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Strategy Configuration</p>
              </div>
            </div>
          </div>

          <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* MODULE A */}
            <div className="space-y-4">
              <div 
                className="flex justify-between items-center mb-2 cursor-pointer hover:bg-slate-800/50 p-2 -mx-2 rounded transition-colors"
                onClick={() => toggleModule('A')}
              >
                <div className="flex items-center gap-2">
                   <Layers className="w-4 h-4 text-blue-500" />
                   <h3 className="text-xs font-bold text-white">Position Sizing</h3>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-600 uppercase">Module A</span>
                    {expandedModules.A ? <ChevronUp className="w-4 h-4 text-slate-500"/> : <ChevronDown className="w-4 h-4 text-slate-500"/>}
                </div>
              </div>
              {expandedModules.A && (
                <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800 space-y-4">
                   <NumberInput 
                      label="Base Qty" 
                      value={config.baseQty}
                      onChange={(e) => setConfig(c => ({...c, baseQty: parseInt(e.target.value) || 0}))}
                   />
                </div>
              )}
            </div>

            {/* MODULE B (NEW) */}
            <div className="space-y-4">
              <div 
                className="flex justify-between items-center mb-2 cursor-pointer hover:bg-slate-800/50 p-2 -mx-2 rounded transition-colors"
                onClick={() => toggleModule('B')}
              >
                <div className="flex items-center gap-2">
                   <ArrowUpRight className="w-4 h-4 text-purple-500" />
                   <h3 className="text-xs font-bold text-white">Pyramiding</h3>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-600 uppercase">Module B</span>
                    {expandedModules.B ? <ChevronUp className="w-4 h-4 text-slate-500"/> : <ChevronDown className="w-4 h-4 text-slate-500"/>}
                </div>
              </div>
              {expandedModules.B && (
                <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800 space-y-4 border-l-2 border-l-purple-500">
                   <div className="grid grid-cols-2 gap-4">
                       <NumberInput 
                          label="Trigger Gap" 
                          subLabel="Pts"
                          value={config.pyramidGap}
                          onChange={(e) => setConfig(c => ({...c, pyramidGap: parseInt(e.target.value) || 0}))}
                          className="text-purple-400"
                       />
                        <NumberInput 
                          label="SL Buffer" 
                          subLabel="Pts"
                          value={config.pyramidSLBuffer}
                          onChange={(e) => setConfig(c => ({...c, pyramidSLBuffer: parseInt(e.target.value) || 0}))}
                          className="text-rose-400"
                       />
                   </div>
                   <NumberInput 
                      label="Multiplier" 
                      subLabel="x Base Qty"
                      value={config.pyramidMultiplier}
                      onChange={(e) => setConfig(c => ({...c, pyramidMultiplier: parseInt(e.target.value) || 0}))}
                   />
                   <NumberInput 
                      label="Max Attempts" 
                      subLabel="Auto Re-entries"
                      value={config.maxReentryAttempts}
                      onChange={(e) => setConfig(c => ({...c, maxReentryAttempts: parseInt(e.target.value) || 0}))}
                   />
                </div>
              )}
            </div>

            {/* MODULE C */}
            <div className="space-y-4">
              <div 
                className="flex justify-between items-center mb-2 cursor-pointer hover:bg-slate-800/50 p-2 -mx-2 rounded transition-colors"
                onClick={() => toggleModule('C')}
              >
                <div className="flex items-center gap-2">
                   <Shield className="w-4 h-4 text-rose-500" />
                   <h3 className="text-xs font-bold text-white">Risk & Reward</h3>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-600 uppercase">Module C</span>
                    {expandedModules.C ? <ChevronUp className="w-4 h-4 text-slate-500"/> : <ChevronDown className="w-4 h-4 text-slate-500"/>}
                </div>
              </div>
              {expandedModules.C && (
                <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800 space-y-4">
                   <NumberInput 
                      label="Initial SL (Pts)" 
                      value={config.initialSLPoints}
                      onChange={(e) => setConfig(c => ({...c, initialSLPoints: parseInt(e.target.value) || 0}))}
                      className="text-rose-400"
                   />
                   <NumberInput 
                      label="Target (Pts)" 
                      value={config.targetPoints}
                      onChange={(e) => setConfig(c => ({...c, targetPoints: parseInt(e.target.value) || 0}))}
                      className="text-emerald-400"
                   />
                </div>
              )}
            </div>

          </div>
        </div>

        {/* STRIKE SELECTION ROW */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
           
           {/* CE PANEL */}
           <div className="bg-[#0f172a] rounded-xl border border-slate-800 p-6 flex flex-col gap-6 relative overflow-hidden">
              <div className="flex justify-between items-start z-10">
                 <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-500" />
                    <h2 className="text-lg font-black text-emerald-500 uppercase tracking-tighter">CE Strike</h2>
                 </div>
                 <div className="text-right">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">LTP (Live)</div>
                    <div className="text-xl font-bold font-mono text-white">{ceLtp > 0 ? ceLtp.toFixed(2) : '--'}</div>
                 </div>
              </div>
              <div className="space-y-4 z-10">
                 <NumberInput 
                    label="CE Strike" 
                    value={selectedCeStrike} 
                    onChange={(e) => setSelectedCeStrike(e.target.value)} 
                    placeholder="e.g. 82000"
                  />
                  <div className="relative">
                     <NumberInput 
                        label="Entry Price" 
                        value={ceEntryPrice}
                        onChange={(e) => setCeEntryPrice(e.target.value)}
                        placeholder="0 for Market"
                        className="text-emerald-500 border-emerald-500/20 focus:border-emerald-500"
                     />
                     <div className="absolute right-2 bottom-2">
                        <span className="text-[10px] font-bold text-orange-400 bg-orange-400/10 px-2 py-1 rounded border border-orange-400/20">SL-LMT</span>
                     </div>
                  </div>
                  <button 
                    onClick={() => handleBuy('CE')}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest rounded-lg shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                     <Play className="w-4 h-4 fill-current" /> Buy CE
                  </button>
              </div>
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
           </div>

           {/* PE PANEL */}
           <div className="bg-[#0f172a] rounded-xl border border-slate-800 p-6 flex flex-col gap-6 relative overflow-hidden">
              <div className="flex justify-between items-start z-10">
                 <div className="flex items-center gap-2">
                    <TrendingDown className="w-5 h-5 text-rose-500" />
                    <h2 className="text-lg font-black text-rose-500 uppercase tracking-tighter">PE Strike</h2>
                 </div>
                 <div className="text-right">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">LTP (Live)</div>
                    <div className="text-xl font-bold font-mono text-white">{peLtp > 0 ? peLtp.toFixed(2) : '--'}</div>
                 </div>
              </div>
              <div className="space-y-4 z-10">
                 <NumberInput 
                    label="PE Strike" 
                    value={selectedPeStrike} 
                    onChange={(e) => setSelectedPeStrike(e.target.value)} 
                    placeholder="e.g. 82000"
                  />
                  <div className="relative">
                     <NumberInput 
                        label="Entry Price" 
                        value={peEntryPrice}
                        onChange={(e) => setPeEntryPrice(e.target.value)}
                        placeholder="0 for Market"
                        className="text-rose-500 border-rose-500/20 focus:border-rose-500"
                     />
                     <div className="absolute right-2 bottom-2">
                        <span className="text-[10px] font-bold text-orange-400 bg-orange-400/10 px-2 py-1 rounded border border-orange-400/20">SL-LMT</span>
                     </div>
                  </div>
                  <button 
                    onClick={() => handleBuy('PE')}
                    className="w-full py-4 bg-rose-600 hover:bg-rose-500 text-white font-black uppercase tracking-widest rounded-lg shadow-lg shadow-rose-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                     <Play className="w-4 h-4 fill-current" /> Buy PE
                  </button>
              </div>
              <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
           </div>

        </div>

        {/* POSITIONS & ORDERS TABLE AREA */}
        <div className="bg-[#0f172a] rounded-xl border border-slate-800 overflow-hidden min-h-[400px]">
           <div className="grid grid-cols-4 divide-x divide-slate-800 bg-slate-900/50 border-b border-slate-800">
               {['MTM', 'MTM TGT', 'MTM SL', 'MTM TRAIL'].map((label, i) => (
                   <div key={label} className="p-4 text-center">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</div>
                      <div className={`text-lg font-bold font-mono ${i===0 ? (stats.totalMtm>=0 ? 'text-emerald-500' : 'text-rose-500') : 'text-slate-600'}`}>
                         {i===0 ? formatCurrency(stats.totalMtm) : '--'}
                      </div>
                   </div>
               ))}
           </div>

           <div className="flex items-center border-b border-slate-800 bg-slate-900/30 overflow-x-auto">
               {['POSITIONS', 'ORDERS', 'TRADES', 'FUNDS'].map(tab => (
                 <button 
                   key={tab}
                   onClick={() => setActiveTab(tab as any)}
                   className={`px-6 py-4 text-xs font-bold uppercase tracking-wider transition-colors border-r border-slate-800/50 min-w-[120px] ${activeTab === tab ? 'bg-[#0f172a] text-blue-500 border-t-2 border-t-blue-500' : 'text-slate-500 hover:text-slate-300'}`}
                 >
                   {tab === 'PENDING' ? (watchers.length > 0 ? `PENDING (${watchers.length})` : 'PENDING') : tab === 'ORDERS' ? 'ORDER BOOK' : tab === 'TRADES' ? 'TRADE BOOK' : tab}
                 </button>
               ))}
           </div>
           
           <div className="overflow-x-auto">
              {activeTab === 'POSITIONS' && (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900/20 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                        <th className="p-4">Instrument</th>
                        <th className="p-4 text-right">Qty</th>
                        <th className="p-4 text-right">Avg. Price</th>
                        <th className="p-4 text-right">LTP</th>
                        <th className="p-4 text-right text-rose-500">SL Price</th>
                        <th className="p-4 text-right text-emerald-500">Tgt Price</th>
                        <th className="p-4 text-right text-purple-400">Trigger / Level</th>
                        <th className="p-4 text-center text-purple-400">Attempts</th>
                        <th className="p-4 text-right">P&L</th>
                        <th className="p-4 text-center">Simulate Market</th>
                        <th className="p-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-xs font-mono">
                      {displayPositions.length === 0 && pendingWatchers.length === 0 ? (
                        <tr><td colSpan={11} className="p-12 text-center text-slate-600 font-sans">No active positions or pending re-entries.</td></tr>
                      ) : (
                        <>
                        {/* ACTIVE POSITIONS */}
                        {displayPositions.map(pos => {
                          const nextPyramidPrice = pos.basePrice + config.pyramidGap;
                          const showTriggered = pos.isPyramided;
                          return (
                            <tr key={pos.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="p-4 font-bold text-white flex items-center gap-2">
                               <span className={pos.type === 'CE' ? 'text-emerald-500' : 'text-rose-500'}>{pos.strike} {pos.type}</span>
                               <span className="text-[10px] text-slate-600 font-sans px-1.5 py-0.5 border border-slate-700 rounded bg-slate-900">NRML</span>
                               {pos.isPyramided && <span className="text-[10px] text-purple-400 font-sans px-1.5 py-0.5 border border-purple-500/30 rounded bg-purple-500/10">PYR</span>}
                            </td>
                            <td className="p-4 text-right text-white font-bold">
                              {pos.qty}
                            </td>
                            <td className="p-4 text-right text-slate-300">{pos.avgPrice.toFixed(2)}</td>
                            <td className={`p-4 text-right font-bold ${pos.ltp > pos.avgPrice ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {pos.ltp.toFixed(2)}
                            </td>
                            <td className="p-4 text-right text-rose-400 font-bold">
                              {pos.slPrice.toFixed(2)} 
                              <span className="ml-1 text-[8px] uppercase border border-rose-500/30 px-1 rounded text-rose-500">LMT</span>
                            </td>
                            <td className="p-4 text-right text-emerald-400 font-bold">{pos.targetPrice.toFixed(2)}</td>
                            
                            {/* PYRAMID LEVEL COLUMN */}
                            <td className="p-4 text-right font-bold">
                              {showTriggered ? (
                                <span className="text-purple-400 font-bold">PYRAMIDED</span>
                              ) : (
                                <span className="text-slate-500 group relative">
                                  {nextPyramidPrice.toFixed(2)}
                                </span>
                              )}
                            </td>

                            <td className="p-4 text-center">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                pos.reentryAttemptsLeft > 0 ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-slate-800 text-slate-500 border border-slate-700'
                              }`}>
                                {pos.reentryAttemptsLeft} LEFT
                              </span>
                            </td>
                            <td className={`p-4 text-right font-bold ${pos.pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                               {pos.pnl >= 0 ? '+' : ''}{pos.pnl.toFixed(2)}
                            </td>
                            
                            {/* SIMULATION BUTTONS */}
                            <td className="p-4 text-center">
                              {/* Removed Simulation buttons for Live Mode */}
                              <span className="text-xs text-slate-600">LIVE MODE</span>
                            </td>

                            <td className="p-4 text-right">
                              <button onClick={() => handleManualExit(pos.id)} className="text-[10px] font-bold text-rose-500 hover:text-white hover:bg-rose-600 px-3 py-1 rounded border border-rose-500/30 transition-all">
                                EXIT
                              </button>
                            </td>
                          </tr>
                          );
                        })}

                        {/* PENDING WATCHERS (RE-ENTRIES) */}
                        {pendingWatchers.map(w => (
                           <tr key={w.id} className="bg-slate-900/20 border-l-2 border-l-yellow-500">
                             <td className="p-4 font-bold text-slate-400 flex items-center gap-2">
                               <Hourglass className="w-3 h-3 text-yellow-500 animate-pulse" />
                               {w.symbol}
                             </td>
                             <td className="p-4 text-right text-slate-500">{w.qty}</td>
                             <td className="p-4 text-center text-slate-600 italic" colSpan={2}>STOP-LIMIT PLACED</td>
                             <td className="p-4 text-right text-slate-600">--</td>
                             <td className="p-4 text-right text-slate-600">--</td>
                             <td className="p-4 text-right text-yellow-500 font-bold">{w.triggerPrice.toFixed(2)}</td>
                             <td className="p-4 text-center">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
                                {w.attemptsLeft} LEFT
                              </span>
                             </td>
                             <td className="p-4 text-right text-slate-600">--</td>
                             <td className="p-4 text-center">
                                {/* Removed Force Trigger for Live Mode */}
                             </td>
                             <td className="p-4 text-right">
                               <button onClick={() => cancelWatcher(w.id)} className="text-[10px] font-bold text-slate-500 hover:text-white hover:bg-slate-700 px-2 py-1 rounded border border-slate-700 transition-all">
                                 CANCEL
                               </button>
                             </td>
                           </tr>
                        ))}
                        </>
                      )}
                    </tbody>
                  </table>
              )}

              {activeTab === 'ORDERS' && (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900/20 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                         <th className="p-4">Time</th>
                         <th className="p-4">Instrument</th>
                         <th className="p-4">Side</th>
                         <th className="p-4 text-right">Qty</th>
                         <th className="p-4 text-right">Price</th>
                         <th className="p-4 text-right">Status</th>
                         <th className="p-4">Info</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-xs font-mono">
                      {orders.map(order => (
                          <tr key={order.id} className="hover:bg-slate-800/30">
                             <td className="p-4 text-slate-400">{order.time}</td>
                             <td className="p-4 text-white font-bold">{order.symbol}</td>
                             <td className={`p-4 font-bold ${order.side === 'BUY' ? 'text-emerald-500' : 'text-rose-500'}`}>{order.side}</td>
                             <td className="p-4 text-right text-white">{order.qty}</td>
                             <td className="p-4 text-right text-white">{order.price.toFixed(2)}</td>
                             <td className="p-4 text-right">
                               <span className={`px-2 py-1 rounded text-[10px] border ${
                                 order.status === 'COMPLETE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                 order.status === 'TRIGGER PENDING' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                                 order.status === 'CANCELLED' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 line-through decoration-rose-500/50' :
                                 'bg-slate-700 text-slate-400 border-slate-600'
                               }`}>{order.status}</span>
                             </td>
                             <td className="p-4 text-slate-500 italic">{order.message}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
              )}

              {activeTab === 'TRADES' && (
                  <div className="flex flex-col h-full">
                    <div className="p-8 text-center text-slate-500">Trade book synced from Broker in real-time.</div>
                  </div>
              )}

              {activeTab === 'FUNDS' && (
                  <div className="p-8">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-6">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                              <Wallet className="w-4 h-4 text-blue-500"/> Margin Summary
                            </h3>
                            <div className="space-y-1">
                                <div className="flex justify-between text-xs text-slate-400 uppercase tracking-wider font-bold">
                                   <span>Available</span>
                                   <span>Used</span>
                                </div>
                                <div className="h-3 bg-slate-800 rounded-full overflow-hidden flex">
                                   <div className="bg-blue-500 h-full transition-all duration-500" style={{ width: `${Math.min(100, (funds.availableMargin / funds.totalCash) * 100)}%` }}></div>
                                   <div className="bg-slate-700 h-full transition-all duration-500" style={{ width: `${Math.min(100, (funds.usedMargin / funds.totalCash) * 100)}%` }}></div>
                                </div>
                                <div className="flex justify-between text-xs font-mono pt-1">
                                   <span className="text-emerald-500">{formatCurrency(funds.availableMargin)}</span>
                                   <span className="text-slate-400">{formatCurrency(funds.usedMargin)}</span>
                                </div>
                            </div>
                        </div>
                     </div>
                  </div>
              )}
           </div>

        </div>

      </main>
    </div>
  );
};

export default App;