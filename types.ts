export interface DashboardConfig {
  baseQty: number;
  pyramidGap: number;
  pyramidMultiplier: number;
  pyramidSLBuffer: number;
  maxReentryAttempts: number;
  initialSLPoints: number;
  targetPoints: number;
}
export type OrderType = 'LMT' | 'MKT' | 'SL' | 'SL-M';
export type TransactionType = 'BUY' | 'SELL';
export type OrderStatus = 'OPEN' | 'COMPLETE' | 'CANCELLED' | 'REJECTED' | 'TRIGGER PENDING';
export type ProductType = 'NRML' | 'MIS';
export interface Watcher {
  id: string; orderId?: string; symbol: string; type: 'CE' | 'PE'; strike: string;
  triggerPrice: number; qty: number; slBuffer: number; targetPoints: number; attemptsLeft: number; basePrice: number;
}
export interface Position {
  id: string; type: 'CE' | 'PE'; strike: string; qty: number; avgPrice: number; basePrice: number; ltp: number; pnl: number;
  slPrice: number; targetPrice: number; status: 'OPEN' | 'CLOSED'; realizedPnl: number; scalingCount: number; isPyramided: boolean;
  pyramidTriggerPrice?: number; reentryAttemptsLeft: number;
}
export interface Order {
  id: string; time: string; symbol: string; type: OrderType; side: TransactionType; product: ProductType; qty: number; price: number;
  triggerPrice?: number; status: OrderStatus; averagePrice?: number; message?: string; exchangeOrderId?: string;
}
export interface Trade {
  id: string; orderId: string; time: string; symbol: string; side: TransactionType; product: ProductType; qty: number; price: number;
  triggerPrice?: number; slippage: number; value: number; charges: number;
}
export interface FundLimits {
  availableMargin: number; usedMargin: number; totalCash: number; openingBalance: number; payIn: number; payOut: number;
}
export interface StrikeOption { value: string; label: string; }
export interface SessionStats {
  totalMtm: number; totalCharges: number; netPnl: number; totalSlippage: number; totalTurnover: number;
}