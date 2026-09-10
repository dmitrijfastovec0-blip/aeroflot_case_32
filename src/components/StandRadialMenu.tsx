/**
 * ============================================================================
 * РАДИАЛЬНОЕ КОНТЕКСТНОЕ МЕНЮ СТОЯНКИ ВС (STAND RADIAL MENU)
 * ----------------------------------------------------------------------------
 * Всплывающее меню быстрого действия при клике на стоянку:
 * - Экспресс-вызов дефектов (ATA 24, ATA 32, ATA 34, ATA 49, ATA 72) в 1 клик
 * - Центрирование камеры перрона на стоянке (Focus Camera)
 * - Открытие детальной панели параметров борта в RightPanel
 * ============================================================================
 */

import React from 'react';
import { Stand, ThemeMode } from '../types';
import { DEFECT_TYPES } from '../constants';
import { Wrench, Zap, Eye, X, ChevronRight, Navigation, Sparkles } from 'lucide-react';

/** Свойства контекстного меню стоянки */
interface StandRadialMenuProps {

  stand: Stand;
  x: number;
  y: number;
  onClose: () => void;
  onQuickLaunch: (defectId: string) => void;
  onOpenPanel: () => void;
  onFocusCamera: () => void;
  theme: ThemeMode;
}

export const StandRadialMenu: React.FC<StandRadialMenuProps> = ({
  stand,
  x,
  y,
  onClose,
  onQuickLaunch,
  onOpenPanel,
  onFocusCamera,
  theme
}) => {
  // Quick pre-selected defects
  const b1Defect = DEFECT_TYPES.find(d => d.id === 'ATA72') || DEFECT_TYPES[0]; // Двигатели B1
  const b2Defect = DEFECT_TYPES.find(d => d.id === 'ATA34') || DEFECT_TYPES[2]; // Навигация B2
  const catADefect = DEFECT_TYPES.find(d => d.id === 'ATA05') || DEFECT_TYPES[4]; // Transit Check A

  // Constrain position within viewport
  const menuWidth = 260;
  const menuHeight = 280;
  const clampedX = Math.max(16, Math.min(window.innerWidth - menuWidth - 16, x - menuWidth / 2));
  const clampedY = Math.max(16, Math.min(window.innerHeight - menuHeight - 16, y - menuHeight / 2));

  return (
    <>
      {/* Invisible backdrop to dismiss */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div
        className={`fixed z-50 rounded-2xl border shadow-2xl overflow-hidden backdrop-blur-md animate-in zoom-in-95 duration-150 font-mono text-xs ${
          theme === 'dark'
            ? 'bg-[#070a0e]/95 border-sky-500/40 text-gray-100 shadow-sky-500/10'
            : 'bg-white/95 border-sky-500/50 text-slate-900 shadow-xl'
        }`}
        style={{
          left: `${clampedX}px`,
          top: `${clampedY}px`,
          width: `${menuWidth}px`
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-gradient-to-r from-sky-600 to-blue-700 text-white">
          <div className="flex items-center space-x-1.5 font-bold">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Стоянка {stand.label}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/20 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5 text-white" />
          </button>
        </div>

        {/* Aircraft Info */}
        <div className="px-3.5 py-2 bg-slate-500/10 border-b border-slate-200 dark:border-[#1e2a3a] flex items-center justify-between text-[11px]">
          <span className="text-gray-400">Тип ВС:</span>
          <span className="font-bold text-sky-400">{stand.aircraftType || 'Airbus A320'}</span>
        </div>

        {/* Action Buttons */}
        <div className="p-2 space-y-1">
          {/* Quick B1 Dispatch */}
          <button
            onClick={() => {
              onQuickLaunch(b1Defect.id);
              onClose();
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition-all font-bold group cursor-pointer"
          >
            <div className="flex items-center space-x-2">
              <Zap className="w-3.5 h-3.5" />
              <span>Срочный B1 (Двигатель)</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>

          {/* Quick B2 Dispatch */}
          <button
            onClick={() => {
              onQuickLaunch(b2Defect.id);
              onClose();
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 transition-all font-bold group cursor-pointer"
          >
            <div className="flex items-center space-x-2">
              <Wrench className="w-3.5 h-3.5" />
              <span>Вызов B2 (Авионика)</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>

          {/* Quick Cat A Daily/Transit Check */}
          <button
            onClick={() => {
              onQuickLaunch(catADefect.id);
              onClose();
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-all font-bold group cursor-pointer"
          >
            <div className="flex items-center space-x-2">
              <Eye className="w-3.5 h-3.5" />
              <span>Осмотр Cat A (Transit)</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>

          {/* Divider */}
          <div className="h-px bg-slate-200 dark:bg-[#1e2a3a] my-1" />

          {/* Focus Camera */}
          <button
            onClick={() => {
              onFocusCamera();
              onClose();
            }}
            className="w-full flex items-center space-x-2 px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-gray-300 transition-colors cursor-pointer text-[11px]"
          >
            <Navigation className="w-3 h-3 text-sky-400" />
            <span>Центрировать камеру</span>
          </button>

          {/* Full Task Panel */}
          <button
            onClick={() => {
              onOpenPanel();
              onClose();
            }}
            className="w-full flex items-center space-x-2 px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-gray-300 transition-colors cursor-pointer text-[11px]"
          >
            <Wrench className="w-3 h-3 text-emerald-400" />
            <span>Открыть панель задач ОТО</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default StandRadialMenu;
