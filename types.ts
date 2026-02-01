export interface DashboardConfig {
  // Module A: Position Sizing
  baseQty: number;
  
  // Module B: Pyramiding (One-Level)
  pyramidGap: number;        // Points from base to trigger pyramid (e.g., 50)
  pyramidMultiplier: number; // Multiplier for base qty (e.g., 4x)
  pyramidSLBuffer: number;   // Points below trigger for new SL (e.g., 2)
  maxReentryAttempts: number; // How many times to re-try entry after SL hit

  // Module C: Risk & Reward
  initialSLPoints: number;
  targetPoints: number;
}

// Flattrade / Industry Standard Enums
export type OrderType = 'LMT' | 'MKT' | 'SL' | 'SL-M';
export type TransactionType = 'BUY' | 'SELL';
export type OrderStatus = 'OPEN' | 'COMPLETE' | 'CANCELLED' | 'REJECTED' | 'TRIGGER PENDING';
export type ProductType = 'NRML' | 'MIS';

export interface Watcher {
  id: string;
  orderId?: string; // Linked Server Order ID
  symbol: string;
  type: 'CE' | 'PE';
  strike: string;
  triggerPrice: number;
  qty: number;
  slBuffer: number;
  targetPoints: number;
  attemptsLeft: number;
  basePrice: number;
}

export interface Position {
  id: string;
  type: 'CE' | 'PE';
  strike: string;
  qty: number;
  avgPrice: number;
  basePrice: number;    // The original entry price to calculate trigger from
  ltp: number;
  pnl: number;
  
  // Risk Management
  slPrice: number;
  targetPrice: number;
  
  status: 'OPEN' | 'CLOSED';
  realizedPnl: number;
  scalingCount: number; 
  isPyramided: boolean; // Track if the one-time pyramid has happened
  pyramidTriggerPrice?: number; // The price level that triggered the pyramid/re-entry
  reentryAttemptsLeft: number; // Count down for auto re-entries
}

export interface Order {
  id: string;
  time: string;
  symbol: string;
  type: OrderType;
  side: TransactionType;
  product: ProductType;
  qty: number;
  price: number;
  triggerPrice?: number;
  status: OrderStatus;
  averagePrice?: number;
  message?: string;
  exchangeOrderId?: string; // Broker Order ID
}

export interface Trade {
  id: string;
  orderId: string;
  time: string;
  symbol: string;
  side: TransactionType;
  product: ProductType;
  qty: number;
  price: number;
  triggerPrice?: number; // For slippage calculation
  slippage: number;      // (Avg Price - Trigger Price) difference
  value: number;
  charges: number;       // Estimated brokerage + taxes
}

export interface FundLimits {
  availableMargin: number;
  usedMargin: number;
  totalCash: number;
  openingBalance: number;
  payIn: number;
  payOut: number;
}

export interface StrikeOption {
  value: string;
  label: string;
}

// Stats for the top cards
export interface SessionStats {
  totalMtm: number;
  totalCharges: number;
  netPnl: number;
  totalSlippage: number;
  totalTurnover: number;
}