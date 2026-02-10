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
  const [expiryStr, setExpiryStr] = useState("04OCT24"); // DEFAULT EXPIRY - CHANGE AS NEEDED
  const [spotPrice, setSpotPrice] = useState(0);
  
  // STRIKES & ENTRY
  const [selectedCeStrike, setSelectedCeStrike] = useState("82000");
  const [selectedPeStrike, setSelectedPeStrike] = useState("82000");
  const [ceEntryPrice, setCeEntryPrice] = useState<string>("0");
  const [peEntryPrice, setPeEntryPrice] = useState<string>("0");
  
  // VALIDATED SCRIP DETAILS
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
  
  const wsRef = useRef<WebSocket | null>(null);

  // 1. AUTH CODE HANDLING (Runs once on load if code exists)
  useEffect(() => {
    const initAuth = async () => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');

        if (code && !authProcessed) {
            authProcessed = true;
            setIsLoggingIn(true);
            setBackendError(null);
            