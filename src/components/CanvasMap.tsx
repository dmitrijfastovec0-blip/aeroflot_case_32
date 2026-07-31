import React from 'react';
import { Worker, OtoTask, ThemeMode } from '../types/index';
import { useCanvasEngine } from '../hooks/useCanvasEngine';

interface CanvasMapProps {
  workers: Worker[];
  tasks: OtoTask[];
  selectedStandId: string | null;
  onSelectStand: (standId: string) => void;
  theme: ThemeMode;
  isDevMode: boolean;
  onDevPointClick?: (pctX: number, pctY: number) => void;
  showMapSublayer: boolean;
}

export const CanvasMap: React.FC<CanvasMapProps> = (props) => {
  const {
    containerRef,
    canvasRef,
    hoverTooltip,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleClick,
    handlePresetFocus
  } = useCanvasEngine(props);

  const { theme } = props;

  return (
    <div
      ref={containerRef}
      className={`relative flex-1 h-full w-full overflow-hidden cursor-crosshair select-none transition-colors ${
        theme === 'dark' ? 'bg-[#090d11]' : 'bg-[#f1f5f9]'
      }`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Floating View Controls */}
      <div className={`absolute top-3 left-3 flex items-center border rounded-lg p-1.5 space-x-1.5 shadow-lg z-10 font-mono text-xs ${
        theme === 'dark' ? 'bg-[#070a0e]/90 border-[#263345]' : 'bg-white/90 border-slate-300'
      }`}>
        <button
          onClick={() => handlePresetFocus('ALL')}
          className={`px-3 py-1 rounded border transition-colors ${
            theme === 'dark' ? 'bg-[#121820] hover:bg-[#1e293b] text-gray-200 border-[#263345]' : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
          }`}
        >
          🗺️ Весь SVO
        </button>
        <button
          onClick={() => handlePresetFocus('NORTH')}
          className={`px-3 py-1 rounded border transition-colors ${
            theme === 'dark' ? 'bg-[#121820] hover:bg-[#1e293b] text-sky-400 border-[#263345]' : 'bg-slate-100 hover:bg-slate-200 text-sky-600 border-slate-300'
          }`}
        >
          🏢 Север B/C
        </button>
        <button
          onClick={() => handlePresetFocus('SOUTH')}
          className={`px-3 py-1 rounded border transition-colors ${
            theme === 'dark' ? 'bg-[#121820] hover:bg-[#1e293b] text-emerald-400 border-[#263345]' : 'bg-slate-100 hover:bg-slate-200 text-emerald-600 border-slate-300'
          }`}
        >
          🏬 Юг D/E/F
        </button>
        <div className="h-4 w-px bg-slate-400 dark:bg-[#263345] mx-1" />
        <button
          onClick={() => handlePresetFocus('RESET')}
          className={`px-2.5 py-1 rounded border transition-colors ${
            theme === 'dark' ? 'bg-[#121820] hover:bg-[#1e293b] text-gray-400 border-[#263345]' : 'bg-slate-100 hover:bg-slate-200 text-slate-500 border-slate-300'
          }`}
        >
          🔍 Сброс
        </button>
      </div>

      {/* Map Legend */}
      <div className={`absolute bottom-3 left-3 border rounded-lg px-3 py-2 font-mono text-xs space-y-1.5 z-10 ${
        theme === 'dark' ? 'bg-[#070a0e]/90 border-[#263345] text-gray-300' : 'bg-white/90 border-slate-300 text-slate-800 shadow-md'
      }`}>
        <div className="font-bold border-b border-slate-300 dark:border-[#263345] pb-1 text-xs">ДИСЛОКАЦИЯ И СТАТУСЫ</div>
        <div className="flex items-center space-x-2">
          <span className="w-3 h-3 rounded-full bg-[#238636]" />
          <span>🟢 Свободен (дежурство / патруль)</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-3 h-3 rounded-full bg-[#38bdf8]" />
          <span>🔵 В пути на вызов ОТО</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-3 h-3 rounded-full bg-[#f59e0b]" />
          <span>🟡 Возврат на базу ПТО</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-3 h-3 rounded-full bg-[#da3633]" />
          <span>🔴 На объекте (ТО на ВС)</span>
        </div>
      </div>

      {/* Hover Tooltip Popover */}
      {hoverTooltip && (
        <div
          className={`fixed z-50 pointer-events-none border rounded-lg p-3 shadow-2xl min-w-[240px] max-w-[320px] font-mono text-xs ${
            theme === 'dark' ? 'bg-[#070a0e] border-[#238636] text-gray-200' : 'bg-white border-emerald-600 text-slate-900'
          }`}
          style={{
            left: `${Math.min(window.innerWidth - 340, hoverTooltip.x + 15)}px`,
            top: `${Math.min(window.innerHeight - 200, hoverTooltip.y + 15)}px`
          }}
        >
          <div className="font-bold text-sm text-emerald-500 border-b border-slate-300 dark:border-[#263345] pb-1 mb-1">
            {hoverTooltip.title}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">{hoverTooltip.subtitle}</div>
          <div className="space-y-1 text-xs">
            {hoverTooltip.details.map((d, idx) => (
              <div key={idx} className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">{d.label}</span>
                <span className="font-semibold ml-2 text-right">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
