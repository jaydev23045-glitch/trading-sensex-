import { DashboardConfig, StrikeOption } from './types';
export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  baseQty: 100, pyramidGap: 50, pyramidMultiplier: 4, pyramidSLBuffer: 2, maxReentryAttempts: 3, initialSLPoints: 80, targetPoints: 160
};
export const CE_STRIKES: StrikeOption[] = [ { value: "82000", label: "82000 CE" } ];
export const PE_STRIKES: StrikeOption[] = [ { value: "82000", label: "82000 PE" } ];