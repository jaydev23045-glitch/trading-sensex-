import React from 'react';
import { Activity, Wifi, WifiOff } from 'lucide-react';
interface StatusBadgeProps { latency: number; isConnected: boolean; }
export const StatusBadge: React.FC<StatusBadgeProps> = ({ latency, isConnected }) => {
  let statusColor = 'text-yellow-500'; let statusText = 'MODERATE';
  if (latency < 5) { statusColor = 'text-green-500'; statusText = 'EXCELLENT'; } 
  else if (latency > 100) { statusColor = 'text-red-500'; statusText = 'CRITICAL LAG'; } 
  else if (latency > 40) { statusColor = 'text-orange-500'; statusText = 'SLOW'; }
  return (
    <div className={`flex items-center gap-4 bg-slate-900/50 px-4 py-2 rounded-full border backdrop-blur-sm transition-colors duration-300 ${latency > 100 ? 'border-red-500/50 bg-red-500/10' : 'border-slate-800'}`}>
      <div className="flex items-center gap-2"><Activity className={`w-4 h-4 ${statusColor}`} /><span className={`text-xs font-mono font-bold ${statusColor}`}>VPS: {latency}ms ({statusText})</span></div>
      <div className="h-4 w-px bg-slate-700" />
      <div className="flex items-center gap-2">{isConnected ? (<Wifi className="w-4 h-4 text-green-500" />) : (<WifiOff className="w-4 h-4 text-red-500" />)}<span className={`text-xs font-semibold ${isConnected ? 'text-green-500' : 'text-red-500'}`}>{isConnected ? 'API V2 CONNECTED' : 'DISCONNECTED'}</span></div>
    </div>
  );
};