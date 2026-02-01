import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, Zap, TrendingUp, TrendingDown, Wallet, Layers, ArrowUpRight,
  Shield, Play, Target, ChevronDown, ChevronUp, Hourglass, AlertTriangle
} from 'lucide-react';
import { NumberInput } from './components/ui/Input';
import { StatusBadge } from './components/ui/StatusBadge';
import { DashboardConfig, Position, SessionStats, Order, Trade, FundLimits, Watcher } from './types';
import { DEFAULT_DASHBOARD_CONFIG } from './constants';

// AUTOMATICALLY DETECT IP (Works on VPS and Localhost)
// Fix: Handle empty hostname by defaulting to localhost
const getHostname = () => window.location.hostname || 'localhost';
const API_BASE = `http://${getHostname()}:5000`;
const WS_URL = `ws://${getHostname()}:8080`;

const formatCurrency = (val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val);
const formatTime = () => new Date().toLocaleTimeString('en-US', { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

type MarketIndex = 'SENSEX' | 'NIFTY' | 'BANKNIFTY';

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
  const [selectedIndex, setSelectedIndex] = useState<MarketIndex>('SENSEX');
  const [spotPrice, setSpotPrice] = useState(0);
  const [selectedCeStrike, setSelectedCeStrike] = useState("82000");
  const [selectedPeStrike, setSelectedPeStrike] = useState("82000");
  const [ceEntryPrice, setCeEntryPrice] = useState<string>("0");
  const [peEntryPrice, setPeEntryPrice] = useState<string>("0");
  const [latency, setLatency] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    const handleAuthCallback = async () => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code'); 
        if (code) {
            setIsLoggingIn(true);
            window.history.replaceState({}, document.title, window.location.pathname);
            try {
                const response = await fetch(`${API_BASE}/authenticate`, {
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
                alert("Login Error: Could not reach VPS Server.\n\nMake sure the Backend is running on Port 5000.");
            } finally {
                setIsLoggingIn(false);
            }
        }
    };
    handleAuthCallback();
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectInterval: any = null;

    const connect = () => {
        try {
            console.log("Connecting to WebSocket:", WS_URL);
            ws = new WebSocket(WS_URL);
            ws.onopen = () => { setIsConnected(true); console.log("Connected to Backend Socket"); };
            ws.onmessage = (event) => {
              try {
                const data = JSON.parse(event.data);
                const now = Date.now();
                if (data.symbol === selectedIndex) setSpotPrice(data.lp); 
                if (data.symbol.includes('CE')) stateRef.current.ceLtp = data.lp;
                if (data.symbol.includes('PE')) stateRef.current.peLtp = data.lp;
                if (data.timestamp) setLatency(now - data.timestamp);
                setRenderTrigger(prev => prev + 1);
              } catch (e) {}
            };
            ws.onclose = () => { setIsConnected(false); };
            ws.onerror = (err) => { console.error("WebSocket Error:", err); setIsConnected(false); };
        } catch (e) { console.error("WebSocket setup failed:", e); setIsConnected(false); }
    };

    connect();
    reconnectInterval = setInterval(() => {
        if (!ws || ws.readyState === WebSocket.CLOSED) {
            connect();
        }
    }, 5000);

    return () => { if (ws) ws.close(); clearInterval(reconnectInterval); };
  }, [selectedIndex]);

  const addOrder = (order: Order) => { stateRef.current.orders.unshift(order); };
  const toggleModule = (mod: 'A' | 'B' | 'C') => { setExpandedModules(prev => ({...prev, [mod]: !prev[mod]})); };

  const placeBackendOrder = async (orderData: any) => {
      try {
          const response = await fetch(`${API_BASE}/place-order`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(orderData)
          });
          if (!response.ok) {
            let errorMsg = `Server status: ${response.status}`;
            try { const errData = await response.json(); if(errData.error) errorMsg = errData.error; } catch(e) {}
            throw new Error(errorMsg);
          }
          return await response.json();
      } catch (e: any) {
          console.error("Order Failed", e);
          const isNetworkError = e.message.includes('Failed to fetch') || e.message.includes('NetworkError');
          if (isNetworkError) {
             alert("CRITICAL ERROR: Failed to connect to VPS!\n\n1. Check if backend is running on Port 5000.");
          }
          return { status: "FAILED", message: isNetworkError ? "Connection Error" : e.message };
      }
  };

  const handleLogin = async () => {
    try {
        const res = await fetch(`${API_BASE}/login`);
        if (!res.ok) throw new Error('Server unreachable');
        const data = await res.json();
        if (data.url) window.location.href = data.url;
        else alert('Login URL not found');
    } catch (e) {
        alert("Connection Failed: Cannot reach VPS Server at Port 5000.");
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
            stateRef.current.orders[orderIndex].status = 'COMPLETE'; 
            stateRef.current.orders[orderIndex].exchangeOrderId = result.ordernumber;
            stateRef.current.orders[orderIndex].message = 'Placed on Exchange';
            
            const newPos: Position = {
                id: result.ordernumber, type, strike, qty: orderQty,
                avgPrice: reqPrice || stateRef.current.ceLtp, 
                basePrice: reqPrice || stateRef.current.ceLtp,
                ltp: reqPrice || stateRef.current.ceLtp, pnl: 0, realizedPnl: 0,
                slPrice: (reqPrice || stateRef.current.ceLtp) - config.initialSLPoints,
                targetPrice: (reqPrice || stateRef.current.ceLtp) + config.targetPoints,
                status: 'OPEN', scalingCount: 0, isPyramided: false,
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
    await placeBackendOrder({
        exchange: 'NFO', symbol: `${selectedIndex} ${pos.strike} ${pos.type}`,
        qty: pos.qty, type: 'MARKET', side: 'SELL'
    });
    pos.status = 'CLOSED';
    setRenderTrigger(prev => prev + 1);
  };
  
  const { positions, orders, funds, stats, ceLtp, peLtp, watchers } = stateRef.current;
  const activePositions = positions.filter(p => p.status === 'OPEN');
  const displayPositions = [...activePositions].reverse();

  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 font-sans selection:bg-blue-500/30 pb-10">
      <header className="h-16 border-b border-slate-800/50 bg-[#020617]/80 backdrop-blur-md sticky top-0 z-50 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6 text-blue-500 fill-blue-500/20" />
          <h1 className="text-xl font-bold text-white tracking-tight">{selectedIndex} <span className="text-blue-500">HFT</span> Scalper</h1>
        </div>
        <div className="flex items-center gap-4">
           {!isConnected && (
             <button onClick={handleLogin} className="px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded hover:bg-blue-500" disabled={isLoggingIn}>
                {isLoggingIn ? "CONNECTING..." : "LOGIN BROKER"}
             </button>
           )}
          <StatusBadge latency={latency} isConnected={isConnected} />
        </div>
      </header>

      {!isConnected && (
        <div className="bg-red-500/10 border-b border-red-500/20 py-2 text-center">
            <div className="flex items-center justify-center gap-2 text-red-400 text-xs font-bold">
                <AlertTriangle className="w-4 h-4" />
                <span>CONNECTION LOST. 1. Is 'node vps-server.js' running? 2. Is your SSH Tunnel active?</span>
            </div>
        </div>
      )}

      <main className="max-w-[1600px] mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          <div className="bg-[#0f172a] rounded-xl border border-slate-800 p-6 relative overflow-hidden group h-full">
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity"><TrendingUp className="w-24 h-24 text-emerald-500" /></div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Total MTM</h3>
            <div className={`text-5xl font-black tracking-tighter mb-4 font-mono ${stats.totalMtm >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{formatCurrency(stats.totalMtm)}</div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <div className={`w-2 h-2 rounded-full ${activePositions.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`}></div>
              {activePositions.length > 0 ? `${activePositions.length} ACTIVE POSITIONS` : 'NO ACTIVE POSITIONS'}
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
                  <table className="w-full text-left border-collapse">
                    <thead><tr className="bg-slate-900/20 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800"><th className="p-4">Time</th><th className="p-4">Instrument</th><th className="p-4">Side</th><th className="p-4 text-right">Qty</th><th className="p-4 text-right">Status</th></tr></thead>
                    <tbody className="divide-y divide-slate-800 text-xs font-mono">
                      {orders.map(order => (
                          <tr key={order.id} className="hover:bg-slate-800/30">
                             <td className="p-4 text-slate-400">{order.time}</td>
                             <td className="p-4 text-white font-bold">{order.symbol}</td>
                             <td className={`p-4 font-bold ${order.side === 'BUY' ? 'text-emerald-500' : 'text-rose-500'}`}>{order.side}</td>
                             <td className="p-4 text-right text-white">{order.qty}</td>
                             <td className="p-4 text-right"><span className={`px-2 py-1 rounded text-[10px] border ${order.status === 'COMPLETE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-700 text-slate-400 border-slate-600'}`}>{order.status}</span></td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
              )}
           </div>
        </div>
      </main>
    </div>
  );
};
export default App;