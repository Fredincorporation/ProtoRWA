'use client';

import * as React from 'react';

interface CandlestickChartProps {
  ticker: string;
  projectTitle: string;
  currentPrice: string;
}

/**
 * High-Precision Interactive Candlestick & Milestone Anchor Canvas
 * Ported directly from Stitch Screen 23 (SHLFROST Individual Claim Trading Terminal).
 */
export function CandlestickChart({ ticker, projectTitle, currentPrice }: CandlestickChartProps) {
  const [timeframe, setTimeframe] = React.useState<'15M' | '1H' | '4H' | '1D' | '1W'>('1H');
  const [viewMode, setViewMode] = React.useState<'candles' | 'line'>('candles');

  return (
    <div className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low p-space-md flex flex-col gap-space-sm shadow-md">
      {/* Chart Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-xs">
          <div className="flex items-center bg-surface-container rounded-lg p-0.5 text-on-surface-variant">
            {(['15M', '1H', '4H', '1D', '1W'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-1 rounded font-mono text-label-sm transition-colors ${
                  timeframe === tf
                    ? 'bg-primary text-on-primary font-semibold shadow-sm'
                    : 'hover:text-on-surface'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className="hidden sm:flex items-center gap-space-xs pl-space-xs">
            <button
              onClick={() => setViewMode('candles')}
              className={`px-2 py-1 rounded font-mono text-label-sm flex items-center gap-1 transition-colors ${
                viewMode === 'candles'
                  ? 'bg-surface-container-high text-primary font-semibold'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Candles
            </button>
            <button
              onClick={() => setViewMode('line')}
              className={`px-2 py-1 rounded font-mono text-label-sm flex items-center gap-1 transition-colors ${
                viewMode === 'line'
                  ? 'bg-surface-container-high text-primary font-semibold'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Par Line ($1.00)
            </button>
          </div>
        </div>

        {/* Milestones Quick Anchors Legend */}
        <div className="flex items-center gap-space-xs font-mono text-label-sm">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-surface-container text-on-surface-variant">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            <span>M1 QA Pass (Settled)</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-primary/10 text-primary font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
            <span>M2 Tooling (Live Vote)</span>
          </div>
          <div className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded bg-surface-container text-outline">
            <span className="w-1.5 h-1.5 rounded-full bg-outline" />
            <span>M3 Pilot Delivery</span>
          </div>
        </div>
      </div>

      {/* High-Precision SVG Financial Candlestick Canvas */}
      <div className="relative w-full h-80 bg-surface-container-lowest rounded-lg p-space-xs overflow-hidden flex flex-col justify-between border border-outline-variant/20">
        {/* Price Coordinates Grid Lines */}
        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-3 opacity-25">
          <div className="w-full flex justify-between text-on-surface-variant font-mono text-label-sm">
            <span>0.0150 ETH</span>
            <div className="w-full ml-2 mt-2 bg-outline-variant h-[1px]" />
          </div>
          <div className="w-full flex justify-between text-on-surface-variant font-mono text-label-sm">
            <span>0.0135 ETH</span>
            <div className="w-full ml-2 mt-2 bg-outline-variant h-[1px]" />
          </div>
          <div className="w-full flex justify-between text-primary font-mono text-label-sm font-semibold">
            <span>0.0120 ETH (PAR VALUE)</span>
            <div className="w-full ml-2 mt-2 bg-primary/40 h-[1px]" />
          </div>
          <div className="w-full flex justify-between text-on-surface-variant font-mono text-label-sm">
            <span>0.0100 ETH</span>
            <div className="w-full ml-2 mt-2 bg-outline-variant h-[1px]" />
          </div>
          <div className="w-full flex justify-between text-on-surface-variant font-mono text-label-sm">
            <span>0.0080 ETH</span>
            <div className="w-full ml-2 mt-2 bg-outline-variant h-[1px]" />
          </div>
        </div>

        {/* Milestone Vertical Guideline Pins */}
        <div className="absolute left-1/4 top-0 bottom-6 w-[1px] bg-primary/40 flex flex-col justify-between items-center pointer-events-none z-10">
          <span className="px-1.5 py-0.5 rounded bg-primary font-mono text-[9px] font-bold text-on-primary -translate-x-1/2 mt-2 shadow-sm">
            M1: QA PASS
          </span>
          <div className="w-2 h-2 rounded-full bg-primary -translate-x-1/2" />
        </div>
        <div className="absolute left-2/3 top-0 bottom-6 w-[1px] bg-tertiary/50 flex flex-col justify-between items-center pointer-events-none z-10">
          <span className="px-1.5 py-0.5 rounded bg-tertiary font-mono text-[9px] font-bold text-on-tertiary -translate-x-1/2 mt-2 shadow-sm">
            M2: TOOLING ACTIVE
          </span>
          <div className="w-2 h-2 rounded-full bg-tertiary -translate-x-1/2 animate-pulse" />
        </div>
        <div className="absolute left-[88%] top-0 bottom-6 w-[1px] bg-outline-variant/60 flex flex-col justify-between items-center pointer-events-none z-10">
          <span className="px-1.5 py-0.5 rounded bg-surface-container font-mono text-[9px] text-on-surface-variant -translate-x-1/2 mt-2">
            M3 UNLOCK
          </span>
          <div className="w-1.5 h-1.5 rounded-full bg-outline -translate-x-1/2" />
        </div>

        {/* Candlestick SVG Component */}
        <svg className="w-full h-full pt-4 pb-6 z-0" preserveAspectRatio="none" viewBox="0 0 900 260">
          {/* Baseline Par Value dashed line */}
          <line x1="0" y1="140" x2="900" y2="140" stroke="#4edea3" strokeDasharray="4 4" strokeWidth="1" opacity="0.4" />

          {/* Volume Histogram (Bottom) */}
          <rect x="50" y="220" width="14" height="40" fill="#4edea3" opacity="0.3" />
          <rect x="80" y="210" width="14" height="50" fill="#4edea3" opacity="0.4" />
          <rect x="110" y="235" width="14" height="25" fill="#ffb4ab" opacity="0.3" />
          <rect x="140" y="200" width="14" height="60" fill="#4edea3" opacity="0.5" />
          <rect x="170" y="215" width="14" height="45" fill="#ffb4ab" opacity="0.3" />
          <rect x="200" y="195" width="14" height="65" fill="#4edea3" opacity="0.6" />
          <rect x="230" y="190" width="14" height="70" fill="#4edea3" opacity="0.7" />
          <rect x="260" y="220" width="14" height="40" fill="#ffb4ab" opacity="0.4" />
          <rect x="290" y="210" width="14" height="50" fill="#ffb4ab" opacity="0.3" />
          <rect x="320" y="180" width="14" height="80" fill="#4edea3" opacity="0.7" />
          <rect x="350" y="160" width="14" height="100" fill="#4edea3" opacity="0.85" />
          <rect x="380" y="190" width="14" height="70" fill="#ffb4ab" opacity="0.5" />
          <rect x="410" y="170" width="14" height="90" fill="#4edea3" opacity="0.7" />
          <rect x="440" y="185" width="14" height="75" fill="#ffb4ab" opacity="0.4" />
          <rect x="470" y="165" width="14" height="95" fill="#4edea3" opacity="0.8" />
          <rect x="500" y="175" width="14" height="85" fill="#ffb4ab" opacity="0.4" />
          <rect x="530" y="150" width="14" height="110" fill="#4edea3" opacity="0.9" />
          <rect x="560" y="140" width="14" height="120" fill="#4edea3" opacity="0.95" />
          <rect x="590" y="155" width="14" height="105" fill="#ffb4ab" opacity="0.6" />
          <rect x="620" y="130" width="14" height="130" fill="#4edea3" opacity="1.0" />
          <rect x="650" y="145" width="14" height="115" fill="#ffb4ab" opacity="0.5" />
          <rect x="680" y="125" width="14" height="135" fill="#4edea3" opacity="1.0" />
          <rect x="710" y="135" width="14" height="125" fill="#ffb4ab" opacity="0.5" />
          <rect x="740" y="115" width="14" height="145" fill="#4edea3" opacity="1.0" />
          <rect x="770" y="110" width="14" height="150" fill="#4edea3" opacity="1.0" />
          <rect x="800" y="120" width="14" height="140" fill="#ffb4ab" opacity="0.6" />
          <rect x="830" y="95" width="14" height="165" fill="#4edea3" opacity="1.0" />
          <rect x="860" y="90" width="14" height="170" fill="#4edea3" opacity="1.0" />

          {/* Candle Sticks & Bodies */}
          {/* #1 Bull */}
          <line x1="57" y1="190" x2="57" y2="155" stroke="#4edea3" strokeWidth="1.5" />
          <rect x="52" y="165" width="10" height="20" fill="#4edea3" />
          {/* #2 Bull */}
          <line x1="87" y1="180" x2="87" y2="148" stroke="#4edea3" strokeWidth="1.5" />
          <rect x="82" y="152" width="10" height="22" fill="#4edea3" />
          {/* #3 Bear */}
          <line x1="117" y1="172" x2="117" y2="145" stroke="#ffb4ab" strokeWidth="1.5" />
          <rect x="112" y="150" width="10" height="18" fill="#ffb4ab" />
          {/* #4 Bull Strong */}
          <line x1="147" y1="168" x2="147" y2="132" stroke="#4edea3" strokeWidth="1.5" />
          <rect x="142" y="135" width="10" height="30" fill="#4edea3" />
          {/* #5 Bear Pullback */}
          <line x1="177" y1="155" x2="177" y2="128" stroke="#ffb4ab" strokeWidth="1.5" />
          <rect x="172" y="132" width="10" height="16" fill="#ffb4ab" />
          {/* #6 Bull */}
          <line x1="207" y1="152" x2="207" y2="120" stroke="#4edea3" strokeWidth="1.5" />
          <rect x="202" y="123" width="10" height="24" fill="#4edea3" />
          {/* #7 Bull Breakthrough */}
          <line x1="237" y1="142" x2="237" y2="110" stroke="#4edea3" strokeWidth="1.5" />
          <rect x="232" y="112" width="10" height="26" fill="#4edea3" />
          {/* #8 Bear test Par */}
          <line x1="267" y1="145" x2="267" y2="114" stroke="#ffb4ab" strokeWidth="1.5" />
          <rect x="262" y="118" width="10" height="22" fill="#ffb4ab" />
          {/* #9 Bear */}
          <line x1="297" y1="150" x2="297" y2="122" stroke="#ffb4ab" strokeWidth="1.5" />
          <rect x="292" y="125" width="10" height="18" fill="#ffb4ab" />
          {/* #10 Bull Bounce off Par */}
          <line x1="327" y1="148" x2="327" y2="105" stroke="#4edea3" strokeWidth="1.5" />
          <rect x="322" y="108" width="10" height="35" fill="#4edea3" />
          {/* #11 Big Green (M1 QA Approval) */}
          <line x1="357" y1="125" x2="357" y2="78" stroke="#4edea3" strokeWidth="1.5" />
          <rect x="352" y="80" width="10" height="42" fill="#4edea3" />
          {/* #12 Bear */}
          <line x1="387" y1="105" x2="387" y2="75" stroke="#ffb4ab" strokeWidth="1.5" />
          <rect x="382" y="80" width="10" height="20" fill="#ffb4ab" />
          {/* #13 Green */}
          <line x1="417" y1="100" x2="417" y2="68" stroke="#4edea3" strokeWidth="1.5" />
          <rect x="412" y="72" width="10" height="22" fill="#4edea3" />
          {/* #14 Bear */}
          <line x1="447" y1="92" x2="447" y2="65" stroke="#ffb4ab" strokeWidth="1.5" />
          <rect x="442" y="70" width="10" height="15" fill="#ffb4ab" />
          {/* #15 Bull Surge */}
          <line x1="477" y1="88" x2="477" y2="52" stroke="#4edea3" strokeWidth="1.5" />
          <rect x="472" y="55" width="10" height="28" fill="#4edea3" />
          {/* #16 Bear */}
          <line x1="507" y1="78" x2="507" y2="48" stroke="#ffb4ab" strokeWidth="1.5" />
          <rect x="502" y="54" width="10" height="18" fill="#ffb4ab" />
          {/* #17 Long green leg */}
          <line x1="537" y1="72" x2="537" y2="40" stroke="#4edea3" strokeWidth="1.5" />
          <rect x="532" y="42" width="10" height="26" fill="#4edea3" />
          {/* #18 Bull Continuation */}
          <line x1="567" y1="62" x2="567" y2="30" stroke="#4edea3" strokeWidth="1.5" />
          <rect x="562" y="32" width="10" height="28" fill="#4edea3" />
          {/* #19 Bear wick */}
          <line x1="597" y1="58" x2="597" y2="25" stroke="#ffb4ab" strokeWidth="1.5" />
          <rect x="592" y="32" width="10" height="18" fill="#ffb4ab" />
          {/* #20 Bull */}
          <line x1="627" y1="50" x2="627" y2="18" stroke="#4edea3" strokeWidth="1.5" />
          <rect x="622" y="20" width="10" height="24" fill="#4edea3" />
          {/* #21 Consolidation */}
          <line x1="657" y1="44" x2="657" y2="15" stroke="#ffb4ab" strokeWidth="1.5" />
          <rect x="652" y="22" width="10" height="16" fill="#ffb4ab" />
          {/* #22 Bull Expansion */}
          <line x1="687" y1="38" x2="687" y2="10" stroke="#4edea3" strokeWidth="1.5" />
          <rect x="682" y="12" width="10" height="22" fill="#4edea3" />
          {/* #23 Slight Dip */}
          <line x1="717" y1="35" x2="717" y2="12" stroke="#ffb4ab" strokeWidth="1.5" />
          <rect x="712" y="16" width="10" height="14" fill="#ffb4ab" />
          {/* #24 Powerful Bull */}
          <line x1="747" y1="30" x2="747" y2="6" stroke="#4edea3" strokeWidth="1.5" />
          <rect x="742" y="8" width="10" height="20" fill="#4edea3" />
          {/* #25 Peak */}
          <line x1="777" y1="28" x2="777" y2="2" stroke="#4edea3" strokeWidth="1.5" />
          <rect x="772" y="4" width="10" height="18" fill="#4edea3" />
          {/* #26 Retest */}
          <line x1="807" y1="26" x2="807" y2="8" stroke="#ffb4ab" strokeWidth="1.5" />
          <rect x="802" y="8" width="10" height="14" fill="#ffb4ab" />
          {/* #27 Active Live Candle */}
          <line x1="837" y1="22" x2="837" y2="4" stroke="#4edea3" strokeWidth="2" />
          <rect x="832" y="6" width="10" height="15" fill="#4edea3" />
          {/* #28 Current Tick */}
          <line x1="867" y1="18" x2="867" y2="2" stroke="#4edea3" strokeWidth="2" />
          <rect x="862" y="3" width="10" height="12" fill="#4edea3" />

          {/* Area/Line Overlay for 'line' mode */}
          {viewMode === 'line' && (
            <path
              d="M 57 165 L 87 152 L 117 150 L 147 135 L 177 132 L 207 123 L 237 112 L 267 118 L 297 125 L 327 108 L 357 80 L 387 80 L 417 72 L 447 70 L 477 55 L 507 54 L 537 42 L 567 32 L 597 32 L 627 20 L 657 22 L 687 12 L 717 16 L 747 8 L 777 4 L 807 8 L 837 6 L 867 3"
              fill="none"
              stroke="#4edea3"
              strokeWidth="2.5"
            />
          )}
        </svg>

        {/* Bottom Time Range Coordinates */}
        <div className="flex justify-between items-center px-space-md py-1 border-t border-outline-variant/30 text-outline font-mono text-[10px]">
          <span>09:00 UTC</span>
          <span>12:00 UTC</span>
          <span className="text-primary font-semibold">15:00 UTC (M1 PASS)</span>
          <span>18:00 UTC</span>
          <span>21:00 UTC</span>
          <span className="text-tertiary font-semibold">NOW (M2 LIVE)</span>
        </div>
      </div>
    </div>
  );
}

