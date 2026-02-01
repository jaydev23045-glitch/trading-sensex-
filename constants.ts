import { DashboardConfig, StrikeOption } from './types';

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  // Module A
  baseQty: 100,
  
  // Module B: Pyramiding
  pyramidGap: 50,       // Example: 100 -> 150 Trigger
  pyramidMultiplier: 4, // Example: 100 Qty -> Add 400 Qty
  pyramidSLBuffer: 2,   // Example: Trigger 150 -> SL 148
  maxReentryAttempts: 3,// Try 3 times to catch the breakout

  // Module C
  initialSLPoints: 80,
  targetPoints: 160
};

export const CE_STRIKES: StrikeOption[] = [
  { value: "82000", label: "82000 CE" },
  { value: "82100", label: "82100 CE" },
  { value: "82200", label: "82200 CE" },
  { value: "82300", label: "82300 CE" },
  { value: "82400", label: "82400 CE" },
  { value: "82500", label: "82500 CE" },
];

export const PE_STRIKES: StrikeOption[] = [
  { value: "82000", label: "82000 PE" },
  { value: "82100", label: "82100 PE" },
  { value: "82200", label: "82200 PE" },
  { value: "82300", label: "82300 PE" },
  { value: "82400", label: "82400 PE" },
  { value: "82500", label: "82500 PE" },
];