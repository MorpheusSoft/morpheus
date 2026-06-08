'use client';
import React from 'react';

interface Dataset {
  label: string;
  data: number[];
}

interface SvgChartProps {
  type: 'bar' | 'line' | 'pie';
  labels: string[];
  datasets: Dataset[];
}

export function SvgChart({ type, labels, datasets }: SvgChartProps) {
  const data = datasets?.[0]?.data || [];
  const label = datasets?.[0]?.label || '';
  
  if (data.length === 0) return null;

  const width = 500;
  const height = 260;
  const paddingLeft = 50;
  const paddingRight = 20;
  const paddingTop = 30;
  const paddingBottom = 40;

  const maxVal = Math.max(...data, 1) * 1.1; // Add 10% headroom

  const colors = [
    '#f43f5e', // Rose
    '#3b82f6', // Blue
    '#10b981', // Emerald
    '#8b5cf6', // Violet
    '#f59e0b', // Amber
    '#06b6d4', // Cyan
    '#ec4899', // Pink
  ];

  if (type === 'bar') {
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;
    const barWidth = Math.max(10, (chartWidth / data.length) * 0.6);
    const step = chartWidth / data.length;

    return (
      <div className="w-full max-w-lg mx-auto bg-slate-50/50 backdrop-blur-md p-4 rounded-2xl border border-slate-100/50 shadow-sm mt-4">
        <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-3 text-center">{label}</h4>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          <defs>
            <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" />
              <stop offset="100%" stopColor="#be123c" />
            </linearGradient>
          </defs>
          
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
            const y = paddingTop + chartHeight * (1 - ratio);
            const val = (maxVal * ratio).toFixed(1);
            return (
              <g key={idx} className="opacity-40">
                <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 4" />
                <text x={paddingLeft - 10} y={y + 4} textAnchor="end" className="text-[10px] fill-slate-400 font-bold font-mono">${val}</text>
              </g>
            );
          })}

          {data.map((val, idx) => {
            const barHeight = (val / maxVal) * chartHeight;
            const x = paddingLeft + idx * step + (step - barWidth) / 2;
            const y = height - paddingBottom - barHeight;

            return (
              <g key={idx} className="group">
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill="url(#barGrad)"
                  rx="6"
                  ry="6"
                  className="transition-all duration-300 hover:opacity-80"
                />
                <text
                  x={x + barWidth / 2}
                  y={y - 8}
                  textAnchor="middle"
                  className="text-[10px] font-extrabold fill-rose-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                >
                  ${val.toFixed(2)}
                </text>
                <text
                  x={x + barWidth / 2}
                  y={height - paddingBottom + 16}
                  textAnchor="middle"
                  className="text-[9px] fill-slate-500 font-semibold max-w-[40px] truncate"
                >
                  {labels[idx] ? (labels[idx].length > 10 ? labels[idx].substring(0, 8) + '..' : labels[idx]) : ''}
                </text>
              </g>
            );
          })}

          <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} stroke="#94a3b8" strokeWidth="2" />
        </svg>
      </div>
    );
  }

  if (type === 'line') {
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;
    const step = chartWidth / (data.length - 1 || 1);

    const points = data.map((val, idx) => {
      const x = paddingLeft + idx * step;
      const y = paddingTop + chartHeight * (1 - (val / maxVal));
      return { x, y, val };
    });

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaPath = points.length > 0 
      ? `${linePath} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`
      : '';

    return (
      <div className="w-full max-w-lg mx-auto bg-slate-50/50 backdrop-blur-md p-4 rounded-2xl border border-slate-100/50 shadow-sm mt-4">
        <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-3 text-center">{label}</h4>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          <defs>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
            const y = paddingTop + chartHeight * (1 - ratio);
            const val = (maxVal * ratio).toFixed(1);
            return (
              <g key={idx} className="opacity-40">
                <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 4" />
                <text x={paddingLeft - 10} y={y + 4} textAnchor="end" className="text-[10px] fill-slate-400 font-bold font-mono">${val}</text>
              </g>
            );
          })}

          {areaPath && <path d={areaPath} fill="url(#lineGrad)" />}
          <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          {points.map((p, idx) => (
            <g key={idx} className="group">
              <circle
                cx={p.x}
                cy={p.y}
                r="5"
                fill="#ffffff"
                stroke="#3b82f6"
                strokeWidth="3"
                className="transition-all duration-300 hover:r-[7px] cursor-pointer"
              />
              <text
                x={p.x}
                y={p.y - 10}
                textAnchor="middle"
                className="text-[10px] font-extrabold fill-blue-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              >
                ${p.val.toFixed(2)}
              </text>
              <text
                x={p.x}
                y={height - paddingBottom + 16}
                textAnchor="middle"
                className="text-[9px] fill-slate-500 font-semibold"
              >
                {labels[idx] ? (labels[idx].length > 10 ? labels[idx].substring(0, 8) + '..' : labels[idx]) : ''}
              </text>
            </g>
          ))}

          <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} stroke="#94a3b8" strokeWidth="2" />
        </svg>
      </div>
    );
  }

  if (type === 'pie') {
    const total = data.reduce((a, b) => a + b, 0);
    let accumulatedPercent = 0;

    const donutSegments = data.map((val, idx) => {
      const percent = val / total;
      const startAngle = accumulatedPercent * 360;
      accumulatedPercent += percent;
      const endAngle = accumulatedPercent * 360;
      
      const radius = 70;
      const cx = 100;
      const cy = 100;
      
      const startRad = ((startAngle - 90) * Math.PI) / 180;
      const endRad = ((endAngle - 90) * Math.PI) / 180;
      
      const x1 = cx + radius * Math.cos(startRad);
      const y1 = cy + radius * Math.sin(startRad);
      const x2 = cx + radius * Math.cos(endRad);
      const y2 = cy + radius * Math.sin(endRad);
      
      const largeArcFlag = percent > 0.5 ? 1 : 0;
      
      const pathData = `
        M ${x1} ${y1}
        A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}
      `;

      return {
        pathData,
        label: labels[idx],
        val,
        pct: (percent * 100).toFixed(1),
        color: colors[idx % colors.length]
      };
    });

    return (
      <div className="w-full max-w-lg mx-auto bg-slate-50/50 backdrop-blur-md p-4 rounded-2xl border border-slate-100/50 shadow-sm mt-4 flex flex-col sm:flex-row items-center gap-6">
        <div className="w-1/2 flex justify-center">
          <svg viewBox="0 0 200 200" className="w-[180px] h-[180px]">
            {donutSegments.map((segment, idx) => (
              <path
                key={idx}
                d={segment.pathData}
                fill="none"
                stroke={segment.color}
                strokeWidth="24"
                className="transition-all duration-300 hover:opacity-85 cursor-pointer"
              />
            ))}
            <circle cx="100" cy="100" r="56" fill="#f8fafc" />
            <text x="100" y="105" textAnchor="middle" className="text-[12px] font-extrabold fill-slate-700">Total</text>
            <text x="100" y="120" textAnchor="middle" className="text-[10px] font-bold fill-slate-400">${total.toFixed(0)}</text>
          </svg>
        </div>
        
        <div className="w-1/2 flex flex-col gap-2">
          <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">{label}</h4>
          {donutSegments.map((seg, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }}></span>
              <span className="font-semibold text-slate-600 truncate max-w-[120px]">{seg.label || 'N/A'}</span>
              <span className="font-bold text-slate-400 ml-auto">{seg.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
