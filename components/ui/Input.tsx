import React from 'react';
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> { label: string; subLabel?: string; borderColor?: string; }
export const NumberInput: React.FC<InputProps> = ({ label, subLabel, borderColor = "border-slate-700", className, ...props }) => {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex justify-between items-baseline"><label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</label>{subLabel && <span className="text-[10px] text-slate-500">{subLabel}</span>}</div>
      <input type="number" className={`bg-slate-850 text-white p-3 rounded-lg border ${borderColor} focus:border-blue-500 outline-none font-mono text-lg font-medium shadow-sm ${className}`} {...props} />
    </div>
  );
};