import React, { useState } from 'react';
import { Worker, OtoTask, ThemeMode, WeatherMode } from '../types/index';
import { useCanvasEngine } from '../hooks/useCanvasEngine';

interface CanvasMapProps {
  workersRef: React.MutableRefObject<Worker[]>;
  tasksRef: React.MutableRefObject<OtoTask[]>;
  selectedStandId: string | null;
  onSelectStand: (standId: string) => void;
  theme: ThemeMode;
  weatherMode?: WeatherMode;
  isDevMode: boolean;
  onDevPointClick?: (pctX: number, pctY: number) => void;
  showMapSublayer: boolean;
  trackedWorkerId?: string | null;
  onStopTracking?: () => void;
  onOpenRadialMenu?: (stand: any, x: number, y: number) => void;
}

export const CanvasMap: React.FC<CanvasMapProps> = (props) => {
  const {
    containerRef,
    canvasRef,
    hoverTooltip,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleClick,
    handlePresetFocus
  } = useCanvasEngine(props);

  const { theme, trackedWorkerId, onStopTracking, workersRef } = props;
  const [focusPreset, setFocusPreset] = useState<'ALL' | 'NORTH' | 'SOUTH' | 'RESET'>('ALL');

  const trackedWorker = trackedWorkerId ? workersRef.current.find(w => w.id === trackedWorkerId) : null;

  const onPreset = (preset: 'ALL' | 'NORTH' | 'SOUTH' | 'RESET') => {
    setFocusPreset(preset);
    handlePresetFocus(preset);
  };

  // Smooth, premium map control buttons (shared styles)
  const btnBase =
    'px-3 py-1.5 rounded-lg font-mono text-xs font-bold transition-all duration-200 ease-out ' +
    'hover:-translate-y-0.5 hover:shadow-lg active:scale-95 active:translate-y-0 cursor-pointer select-none';
  const btnNeutral = (active: boolean, tint: string) =>
    active
      ? `bg-gradient-to-br ${tint} text-white shadow-lg border border-transparent`
      : theme === 'dark'
        ? 'bg-[#121820] hover:bg-[#1e293b] text-gray-200 border-[#263345]'
        : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300';

  return (
    <div
      ref={containerRef}
      className={`relative flex-1 h-full w-full overflow-hidden cursor-crosshair select-none transition-colors ${
        theme === 'dark' ? 'bg-[#090d11]' : 'bg-[#f1f5f9]'
      }`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Floating View Controls */}
      <div className={`absolute top-3 left-3 flex items-center border rounded-xl p-1.5 space-x-1.5 shadow-lg z-10 font-mono text-xs backdrop-blur-sm ${
        theme === 'dark' ? 'bg-[#070a0e]/85 border-[#263345]' : 'bg-white/85 border-slate-300'
      }`}>
        <button
          onClick={() => onPreset('ALL')}
          className={`${btnBase} ${btnNeutral(focusPreset === 'ALL', 'from-sky-600 to-blue-700 text-sky-100')}`}
        >
          🗺️ Весь SVO
        </button>
        <button
          onClick={() => onPreset('NORTH')}
          className={`${btnBase} ${btnNeutral(focusPreset === 'NORTH', 'from-cyan-500 to-sky-600 text-cyan-50')}`}
        >
          🏢 Север B/C
        </button>
        <button
          onClick={() => onPreset('SOUTH')}
          className={`${btnBase} ${btnNeutral(focusPreset === 'SOUTH', 'from-emerald-500 to-teal-600 text-emerald-50')}`}
        >
          🏬 Юг D/E/F
        </button>
        <div className="h-4 w-px bg-slate-400 dark:bg-[#263345] mx-1" />
        <button
          onClick={() => onPreset('RESET')}
          className={`${btnBase} ${btnNeutral(focusPreset === 'RESET', 'from-slate-600 to-slate-700 text-slate-100')}`}
        >
          🔍 Сброс
        </button>
      </div>

      {/* TRACK MODE ACTIVE BANNER */}
      {trackedWorker && (
        <div className="absolute top-3 right-3 z-30 flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-sky-600/90 text-white font-mono text-xs font-bold border border-sky-400 shadow-xl backdrop-blur-md animate-pulse">
          <span>🎯 Слежение: {trackedWorker.name} ({trackedWorker.categoryCode})</span>
          <button
            onClick={onStopTracking}
            className="ml-2 px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer text-[11px]"
          >
            Сброс (Esc)
          </button>
        </div>
      )}

      {/* Map Legend (Positioned above bottom console) */}
      <div className={`absolute bottom-16 left-3 border rounded-xl px-3.5 py-2.5 font-mono text-xs space-y-1.5 z-10 backdrop-blur-md shadow-xl ${
        theme === 'dark' ? 'bg-[#070a0e]/90 border-[#263345] text-gray-300' : 'bg-white/90 border-slate-300 text-slate-800 shadow-md'
      }`}>
        <div className="font-bold border-b border-slate-300 dark:border-[#263345] pb-1 text-xs text-sky-400">ДИСЛОКАЦИЯ И СТАТУСЫ</div>
        <div className="flex items-center space-x-2">
          <span className="w-3 h-3 rounded-full bg-[#238636]" />
          <span>🟢 Свободен (дежурство / патруль)</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-3 h-3 rounded-full bg-[#38bdf8]" />
          <span>🔵 В пути на вызов ОТО</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-3 h-3 rounded-full bg-[#f43f5e]" />
          <span>🔴 AOG (Срочный перехват)</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-3 h-3 rounded-full bg-[#da3633]" />
          <span>🔧 На объекте (ТО на ВС)</span>
        </div>
      </div>

      {/* Beautiful High-Tech Hover Tooltip Popover Card */}
      {hoverTooltip && (
        <div
          className={`fixed z-50 pointer-events-none border rounded-2xl p-3.5 shadow-2xl min-w-[280px] max-w-[360px] font-mono text-sm backdrop-blur-xl animate-fadeIn ${
            theme === 'dark'
              ? 'bg-[#070a0e]/95 border-[#238636] text-gray-100 shadow-emerald-950/40'
              : 'bg-white/95 border-emerald-600 text-slate-900 shadow-xl'
          }`}
          style={{
            left: `${Math.min(window.innerWidth - 380, hoverTooltip.x + 20)}px`,
            top: `${Math.min(window.innerHeight - 240, hoverTooltip.y + 20)}px`
          }}
        >
          <div className="flex items-center justify-between border-b pb-2 border-slate-200 dark:border-[#263345] mb-2">
            <span className="font-extrabold text-base text-emerald-400">
              {hoverTooltip.title}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
              {hoverTooltip.type === 'WORKER' ? 'ИНЖЕНЕР ОТО' : hoverTooltip.type === 'STAND' ? 'СТОЯНКА ВС' : 'БАЗА ПТО'}
            </span>
          </div>

          <div className="text-xs font-bold text-sky-400 mb-2">
            {hoverTooltip.subtitle}
          </div>

          <div className="space-y-1.5 text-xs font-medium">
            {hoverTooltip.details.map((d, idx) => (
              <div key={idx} className="flex justify-between items-center">
                <span className="text-gray-400">{d.label}</span>
                <span className="font-bold text-slate-900 dark:text-white ml-2 text-right">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
