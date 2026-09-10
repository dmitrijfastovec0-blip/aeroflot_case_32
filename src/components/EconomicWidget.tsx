/**
 * ============================================================================
 * ВИДЖЕТ ЭКОНОМИЧЕСКОЙ ЭФФЕКТИВНОСТИ И ROI (ECONOMIC WIDGET)
 * ----------------------------------------------------------------------------
 * Информационная карточка реального времени, демонстрирующая экономический эффект:
 * - Среднее время прибытия системы («LineOps») против базового диспетчера.
 * - Суммарно сэкономленные минуты простоя воздушных судов.
 * - Расчетная сумма предотвращенного финансового ущерба (в рублях).
 * ============================================================================
 */

import React from 'react';
import { ThemeMode } from '../types';
import { AIRCRAFT_DOWNTIME_COST_PER_MIN } from '../constants';
import { Wallet, TrendingDown, Timer, ShieldCheck } from 'lucide-react';

/** Свойства экономического виджета */
interface EconomicWidgetProps {

  roiMetrics: { completedCount: number; systemEtaSumMinutes: number; intuitiveEtaSumMinutes: number };
  theme: ThemeMode;
}

// Economic constants used by the ROI model
export const SLA_BASELINE_MINUTES = 15.0;
// Единая ставка простоя ВС — единственный источник в constants/index.ts
export const PREVENTED_LOSS_RUB_PER_MIN = AIRCRAFT_DOWNTIME_COST_PER_MIN;

export const EconomicWidget: React.FC<EconomicWidgetProps> = ({ roiMetrics, theme }) => {
  const { completedCount, systemEtaSumMinutes, intuitiveEtaSumMinutes } = roiMetrics;

  // Live baselines — no hardcoded "manual average": the naive dispatcher runs
  // in parallel in the sim, so the comparison is honest and demonstrable.
  const systemAvgMinutes = completedCount > 0
    ? Math.round((systemEtaSumMinutes / completedCount) * 10) / 10
    : 0;
  const manualAvgMinutes = completedCount > 0
    ? Math.round((intuitiveEtaSumMinutes / completedCount) * 10) / 10
    : 0;

  // ΔT = (Manual Avg − System Avg) × Completed Tasks Count
  const savedMinutes = completedCount > 0
    ? Math.max(0, Math.round((manualAvgMinutes - systemAvgMinutes) * completedCount * 10) / 10)
    : 0;

  // Prevented Loss (RUB) = ΔT × 13,500 RUB/min
  const preventedLossRub = Math.round(savedMinutes * PREVENTED_LOSS_RUB_PER_MIN);

  const fmtRub = (n: number) => n.toLocaleString('ru-RU');
  const fmtMin = (n: number) => (n.toFixed(1));

  const card = theme === 'dark'
    ? 'bg-[#121820] border-[#263345]'
    : 'bg-white border-slate-300 shadow-sm';

  return (
    <div className={`flex items-center gap-4 px-4 h-[38px] min-h-[38px] border-b font-mono text-xs ${card}`}>
      {/* SLA Baseline */}
      <div className="flex items-center space-x-1.5" title="Норматив SLA">
        <ShieldCheck className="w-3.5 h-3.5 text-sky-400 shrink-0" />
        <span className="text-gray-500">SLA норматив:</span>
        <span className="font-bold text-sky-400">{SLA_BASELINE_MINUTES} мин</span>
      </div>

      {/* Manual vs System avg (live baseline) */}
      <div className="flex items-center space-x-1.5" title="Сравнение диспетчеров">
        <Timer className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <span className="text-gray-500">Ручной диспетчер:</span>
        <span className={`font-bold ${manualAvgMinutes > 0 ? 'text-amber-400' : 'text-gray-500'}`}>
          {manualAvgMinutes > 0 ? `${fmtMin(manualAvgMinutes)} мин` : '—'}
        </span>
        <span className="text-gray-600 dark:text-gray-500">→</span>
        <span className="text-gray-500">Система (сред. ETA):</span>
        <span className={`font-bold ${systemAvgMinutes > 0 && systemAvgMinutes < manualAvgMinutes ? 'text-emerald-400' : 'text-red-400'}`}>
          {systemAvgMinutes > 0 ? `${fmtMin(systemAvgMinutes)} мин` : '—'}
        </span>
        <span className="text-gray-600 dark:text-gray-500">({completedCount} вызовов закрыто)</span>
      </div>

      <div className="w-px h-4 bg-slate-400 dark:bg-[#263345] mx-1" />

      {/* Prevented Loss (RUB) */}
      <div className="flex items-center space-x-1.5" title="Сэкономленные деньги за счёт быстрого реагирования">
        <Wallet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="text-gray-500">💰 Сэкономлено ПАО «Аэрофлот»:</span>
        <span className="font-black text-emerald-400">{fmtRub(preventedLossRub)} руб.</span>
        <span className="text-gray-500">(Сокращение ожидания:</span>
        <span className={`font-black flex items-center gap-1 ${savedMinutes > 0 ? 'text-emerald-400' : 'text-gray-500'}`}>
          <TrendingDown className="w-3.5 h-3.5" />
          {savedMinutes > 0 ? `-${fmtMin(savedMinutes)} мин` : '0.0 мин'}
        </span>
        <span className="text-gray-500">)</span>
      </div>
    </div>
  );
};

export default EconomicWidget;
