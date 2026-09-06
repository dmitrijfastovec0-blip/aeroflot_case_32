import React, { useState } from 'react';
import { ThemeMode, DispatchStat } from '../types/index';
import { AIRCRAFT_DOWNTIME_COST_PER_MIN } from '../constants/index';
import { BarChart3, TrendingDown, Clock, ShieldCheck, Wallet, X, Cpu, Compass, Layers, GitMerge, Clock3 } from 'lucide-react';

interface AnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  roiMetrics: { completedCount: number; systemEtaSumMinutes: number; intuitiveEtaSumMinutes: number };
  dispatchStats: DispatchStat[];
  theme: ThemeMode;
}

export type SolutionAnalog =
  | 'MANUAL_DISPATCH'
  | 'NEAREST_ENGINEER'
  | 'ERP_EAM'
  | 'AIRPORT_OPERATIONS'
  | 'VOZDUHAN';

interface AnalogInfo {
  id: SolutionAnalog;
  title: string;
  shortTitle: string;
  icon: React.ReactNode;
  tagline: string;
  route: string;
  qualification: string;
  workload: string;
  sla: string;
  source: string;
  description: string;
  pros: string[];
  cons: string[];
}

const ANALOGS: AnalogInfo[] = [
  {
    id: 'MANUAL_DISPATCH',
    title: 'Ручная диспетчеризация',
    shortTitle: 'Ручной процесс',
    icon: <Cpu className="w-5 h-5 text-emerald-400" />,
    tagline: 'Звонок или сообщение диспетчеру и ручное назначение сотрудника',
    route: 'Обычно не рассчитывается автоматически',
    qualification: 'Проверяется человеком',
    workload: 'Оценивается вручную',
    sla: 'Зависит от оператора',
    source: 'Базовый процесс из конкурсного задания',
    description: 'Базовый процесс для сравнения: диспетчер получает вызов, сверяет расположение и занятость сотрудников, затем вручную назначает исполнителя.',
    pros: [
      'Не требует сложной ИТ-инфраструктуры',
      'Гибко учитывает нестандартные обстоятельства'
    ],
    cons: [
      'Высокая зависимость от человеческого фактора',
      'Плохо масштабируется при массовых вызовах'
    ]
  },
  {
    id: 'NEAREST_ENGINEER',
    title: 'Ближайший свободный инженер',
    shortTitle: 'Ближайший',
    icon: <GitMerge className="w-5 h-5 text-sky-400" />,
    tagline: 'Простой автоматический baseline без глобального планирования',
    route: 'Прямая или локальная оценка расстояния',
    qualification: 'Фильтр по категории',
    workload: 'Обычно учитывается только занятость',
    sla: 'Проверяется после выбора',
    source: 'Baseline прототипа: straight-line nearest',
    description: 'Типовой локальный аналог: система выбирает ближайшего подходящего сотрудника для одного вызова, не оптимизируя одновременно очередь и ресурсы.',
    pros: [
      'Простая реализация',
      'Быстро работает на одиночном вызове'
    ],
    cons: [
      'Может занять редкого специалиста для менее срочного вызова',
      'Не видит конфликтов в очереди'
    ]
  },
  {
    id: 'ERP_EAM',
    title: 'ERP/EAM-система ТОиР',
    shortTitle: 'ERP / EAM',
    icon: <Clock3 className="w-5 h-5 text-purple-400" />,
    tagline: 'Управление заявками, ресурсами, регламентами и историей ТО',
    route: 'Зависит от интеграции с картой аэропорта',
    qualification: 'Обычно поддерживается через справочники персонала',
    workload: 'Поддерживается через статусы и наряды',
    sla: 'Настраивается правилами предприятия',
    source: 'SAP Asset Management: sap.com/products/erp/asset-management.html',
    description: 'Класс корпоративных систем управления техническим обслуживанием. Сильная сторона — единый контур заявок и истории работ, но оперативная маршрутизация по дорожному графу требует отдельной интеграции.',
    pros: [
      'Единый учёт заявок и истории обслуживания',
      'Поддержка регламентных процессов и отчётности'
    ],
    cons: [
      'Не является специализированной картой оперативного перрона',
      'Требует внедрения и интеграции'
    ]
  },
  {
    id: 'AIRPORT_OPERATIONS',
    title: 'Airport Operations Management',
    shortTitle: 'Airport Ops',
    icon: <Compass className="w-5 h-5 text-amber-400" />,
    tagline: 'Оперативное управление ресурсами и событиями аэропорта',
    route: 'Может использовать GIS/карту объектов',
    qualification: 'Зависит от конкретного продукта',
    workload: 'Обычно учитывается в операционном контуре',
    sla: 'Контролируется через операционные KPI',
    source: 'SITA Airport Operations: sita.aero/solutions/',
    description: 'Широкий класс систем управления аэропортом: перрон, объекты, транспорт и события. Предлагаемый прототип сфокусирован на узкой задаче ОТО и может быть подключён к такому контуру.',
    pros: [
      'Широкий контекст операционной деятельности',
      'Возможность интеграции с картой и телеметрией'
    ],
    cons: [
      'Часто требует сложной интеграции',
      'Может быть избыточным для узкой задачи ОТО'
    ]
  },
  {
    id: 'VOZDUHAN',
    title: 'Воздухан — предлагаемый прототип',
    shortTitle: 'Воздухан',
    icon: <Layers className="w-5 h-5 text-rose-400" />,
    tagline: 'Квалификация + загрузка + ETA + дорожный граф в одном прототипе',
    route: 'Dijkstra по графу дорог SVO/CUSTOM',
    qualification: 'B1, B2, A и составы бригад ATA',
    workload: 'Статусы, занятость, резервы и перераспределение',
    sla: 'Проверяется до назначения, норматив 15 минут',
    source: 'Измеряется в текущем прототипе по DispatchStat',
    description: 'Предлагаемая система автоматизирует диспетчерский цикл: принимает вызов, формирует требования по дефекту, выбирает допустимый состав, рассчитывает путь и визуализирует движение.',
    pros: [
      'Сочетает глобальное назначение и граф маршрутов',
      'Поддерживает интерактивный пользовательский полигон',
      'Позволяет воспроизводимо проверять сценарии'
    ],
    cons: [
      'Прототип использует симулированные координаты',
      'Для промышленной эксплуатации нужны интеграции с телеметрией и ТОиР'
    ]
  }
];

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({
  isOpen,
  onClose,
  roiMetrics,
  dispatchStats,
  theme
}) => {
  const [activeTab, setActiveTab] = useState<'ALGORITHMS' | 'ANALOGS'>('ALGORITHMS');
  const [selectedAnalogId, setSelectedAnalogId] = useState<SolutionAnalog>('VOZDUHAN');
  const selectedAnalog = ANALOGS.find(a => a.id === selectedAnalogId) || ANALOGS[0];

  const completedCount = roiMetrics.completedCount;
  const savedMinTotal = completedCount > 0
    ? Math.max(0, Math.round((roiMetrics.intuitiveEtaSumMinutes - roiMetrics.systemEtaSumMinutes) * 10) / 10)
    : 0;
  const preventedLossRub = Math.round(savedMinTotal * AIRCRAFT_DOWNTIME_COST_PER_MIN);

  const measuredAlgorithms = [
    {
      id: 'VOZDUHAN',
      title: 'Воздухан: глобальное min-cost назначение',
      eta: roiMetrics.completedCount > 0 ? roiMetrics.systemEtaSumMinutes / roiMetrics.completedCount : null,
      sla: dispatchStats.length > 0 ? dispatchStats.filter(stat => stat.within15).length / dispatchStats.length * 100 : null,
      sample: dispatchStats.length,
      note: 'Фактические назначения системы'
    },
    {
      id: 'GREEDY',
      title: 'Greedy baseline: ближайший по прямой',
      eta: dispatchStats.length > 0
        ? dispatchStats.reduce((sum, stat) => sum + stat.intuitiveEtaMinutes, 0) / dispatchStats.length
        : null,
      sla: dispatchStats.length > 0
        ? dispatchStats.filter(stat => stat.intuitiveEtaMinutes <= 15).length / dispatchStats.length * 100
        : null,
      sample: dispatchStats.length,
      note: 'Тот же набор назначений, baseline без глобальной оптимизации'
    }
  ];

  const fmtRub = (n: number) => n.toLocaleString('ru-RU');

  const modalBg = theme === 'dark'
    ? 'bg-[#070a0e]/95 border-[#1e2a3a] text-gray-100 backdrop-blur-2xl shadow-2xl'
    : 'bg-white/95 border-slate-200 text-slate-900 backdrop-blur-2xl shadow-2xl';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none animate-fadeIn font-mono text-sm">
      <div className={`w-full max-w-5xl rounded-3xl border p-6 flex flex-col space-y-6 max-h-[92vh] overflow-y-auto ${modalBg}`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-4 border-slate-200 dark:border-[#1e2a3a]">
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/25">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-wider uppercase flex items-center gap-2 text-slate-900 dark:text-white">
                 Сравнительный анализ диспетчеризации
              </h2>
              <p className="text-xs text-gray-500 font-medium">
                 Сравнение аналогов и фактических результатов прототипа
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex gap-2 border-b border-slate-200 dark:border-[#1e2a3a] pb-3">
          <button
            onClick={() => setActiveTab('ALGORITHMS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${activeTab === 'ALGORITHMS' ? 'bg-sky-500 text-white' : 'bg-slate-100 dark:bg-[#101724] text-gray-400'}`}
          >
            Алгоритмы и метрики
          </button>
          <button
            onClick={() => setActiveTab('ANALOGS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${activeTab === 'ANALOGS' ? 'bg-sky-500 text-white' : 'bg-slate-100 dark:bg-[#101724] text-gray-400'}`}
          >
            Аналоги рынка
          </button>
        </div>

        {activeTab === 'ALGORITHMS' ? (
          <>
            <div className="p-4 rounded-2xl border bg-slate-100/70 dark:bg-[#101724] border-slate-300 dark:border-[#1e2a3a]">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white">Сравнение реализованных алгоритмов</h3>
                  <p className="text-xs text-gray-500 mt-1">Все числа рассчитаны по текущей фактической выборке назначений. При отсутствии выборки показывается «—».</p>
                </div>
                <span className="text-xs font-bold text-emerald-400">n = {dispatchStats.length}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-gray-500 border-b border-slate-300 dark:border-[#263345]">
                    <tr><th className="py-2 pr-3">Алгоритм</th><th className="py-2 pr-3">Средний ETA</th><th className="py-2 pr-3">SLA &lt;= 15 мин</th><th className="py-2">Выборка</th></tr>
                  </thead>
                  <tbody>
                    {measuredAlgorithms.map((algorithm, index) => (
                      <tr key={algorithm.id} className="border-b border-slate-200 dark:border-[#1b2635]">
                        <td className={`py-3 pr-3 font-bold ${index === 0 ? 'text-emerald-400' : 'text-slate-700 dark:text-gray-300'}`}>
                          {index === 0 && '★ '}{algorithm.title}
                          <div className="text-[10px] font-normal text-gray-500 mt-1">{algorithm.note}</div>
                        </td>
                        <td className="py-3 pr-3 font-bold text-sky-400">{algorithm.eta == null ? '—' : `${algorithm.eta.toFixed(2)} мин`}</td>
                        <td className="py-3 pr-3 font-bold text-amber-400">{algorithm.sla == null ? '—' : `${algorithm.sla.toFixed(1)}%`}</td>
                        <td className="py-3 text-gray-400">{algorithm.sample || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl border bg-emerald-500/10 border-emerald-500/30">
                <div className="text-xs text-gray-400 uppercase font-bold">Воздухан: средний ETA</div>
                <div className="text-2xl font-extrabold text-emerald-400 mt-2">{measuredAlgorithms[0].eta == null ? '—' : `${measuredAlgorithms[0].eta.toFixed(2)} мин`}</div>
                <div className="text-[11px] text-gray-500 mt-1">по завершённым назначениям</div>
              </div>
              <div className="p-4 rounded-2xl border bg-sky-500/10 border-sky-500/30">
                <div className="text-xs text-gray-400 uppercase font-bold">Выигрыш против baseline</div>
                <div className="text-2xl font-extrabold text-sky-400 mt-2">{savedMinTotal > 0 ? `${savedMinTotal.toFixed(2)} мин` : '—'}</div>
                <div className="text-[11px] text-gray-500 mt-1">суммарно по текущей выборке</div>
              </div>
              <div className="p-4 rounded-2xl border bg-amber-500/10 border-amber-500/30">
                <div className="text-xs text-gray-400 uppercase font-bold">Пройдено SLA</div>
                <div className="text-2xl font-extrabold text-amber-400 mt-2">{measuredAlgorithms[0].sla == null ? '—' : `${measuredAlgorithms[0].sla.toFixed(1)}%`}</div>
                <div className="text-[11px] text-gray-500 mt-1">реальные записи диспетчеризации</div>
              </div>
            </div>

            <div className="p-4 rounded-2xl border bg-slate-100/50 dark:bg-[#101724]/50 border-slate-300 dark:border-[#1e2a3a]">
              <div className="text-xs font-bold uppercase text-gray-400 mb-3">Последние измерения</div>
              {dispatchStats.length === 0 ? <div className="text-xs text-gray-500">Запустите сценарий и дождитесь назначения, чтобы получить метрики.</div> : (
                <div className="space-y-2">
                  {dispatchStats.slice(0, 8).map(stat => (
                    <div key={stat.taskId} className="grid grid-cols-4 gap-2 text-[11px] border-b border-slate-200 dark:border-[#1b2635] pb-2">
                      <span className="text-gray-300 truncate">{stat.standLabel}</span>
                      <span className="text-sky-400">система {stat.systemEtaMinutes.toFixed(2)} м</span>
                      <span className="text-gray-400">baseline {stat.intuitiveEtaMinutes.toFixed(2)} м</span>
                      <span className={stat.within15 ? 'text-emerald-400' : 'text-rose-400'}>{stat.within15 ? 'SLA OK' : 'SLA breach'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
        <>
        {/* SOLUTION ANALOG SELECTOR */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Выберите класс решения для сравнения:
          </label>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {ANALOGS.map(analog => {
              const isSelected = analog.id === selectedAnalogId;
              return (
                <button
                  key={analog.id}
                  onClick={() => setSelectedAnalogId(analog.id)}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                    isSelected
                      ? 'bg-sky-500/15 border-sky-500 ring-2 ring-sky-500/40 shadow-lg text-white'
                      : 'bg-slate-100/60 dark:bg-[#101724] border-slate-300 dark:border-[#1e2a3a] text-gray-400 hover:border-sky-500/50'
                  }`}
                >
                  <div className="flex items-center space-x-2 font-bold text-xs text-slate-900 dark:text-white truncate">
                    {analog.icon}
                    <span className="truncate">{analog.shortTitle}</span>
                  </div>
                  <div className="text-[10px] font-bold pt-1 border-t border-slate-200 dark:border-[#1a2433] text-sky-400">
                    Сравнительный профиль
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* DETAILED ALGORITHM DESCRIPTION CARD */}
        <div className="p-4 rounded-2xl border bg-slate-100/70 dark:bg-[#101724] border-slate-300 dark:border-[#1e2a3a] space-y-3">
          <div className="flex items-center justify-between border-b pb-2 border-slate-200 dark:border-[#1e2a3a]">
            <div className="flex items-center space-x-2 font-extrabold text-base text-slate-900 dark:text-white">
              {selectedAnalog.icon}
              <span>{selectedAnalog.title}</span>
            </div>
            <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-sky-500/20 text-sky-400 border border-sky-500/30">
              Сопоставление возможностей
            </span>
          </div>

           <p className="text-xs text-slate-700 dark:text-gray-300 leading-relaxed font-medium">
            {selectedAnalog.description}
          </p>
          <div className="text-[11px] text-gray-500 border-t border-slate-200 dark:border-[#1e2a3a] pt-2">
            Источник / способ проверки: <span className="text-sky-400">{selectedAnalog.source}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
              <span className="font-bold text-xs text-emerald-400 uppercase"> Преимущества:</span>
              <ul className="text-xs text-slate-700 dark:text-gray-300 space-y-1 list-disc pl-4 font-medium">
                {selectedAnalog.pros.map((pro, i) => (
                  <li key={i}>{pro}</li>
                ))}
              </ul>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-1">
              <span className="font-bold text-xs text-amber-400 uppercase"> Особенности и ограничения:</span>
              <ul className="text-xs text-slate-700 dark:text-gray-300 space-y-1 list-disc pl-4 font-medium">
                {selectedAnalog.cons.map((con, i) => (
                  <li key={i}>{con}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Top KPI Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Prevented Loss */}
          <div className="p-4 rounded-2xl border bg-emerald-500/10 border-emerald-500/30 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-gray-400 uppercase">Предотвращенный ущерб</span>
              <Wallet className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-extrabold text-emerald-400">{fmtRub(preventedLossRub)} ₽</div>
              <div className="text-xs text-gray-400 mt-1 flex items-center gap-1 font-medium">
                <TrendingDown className="w-4 h-4 text-emerald-400" />
                Сокращение простоя: <b className="text-emerald-400">-{savedMinTotal} мин</b>
              </div>
            </div>
          </div>

          {/* Card 2: Measured Average ETA */}
          <div className="p-4 rounded-2xl border bg-sky-500/10 border-sky-500/30 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-gray-400 uppercase">Среднее время прибытия</span>
              <Clock className="w-5 h-5 text-sky-400" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-extrabold text-sky-400">
                {completedCount > 0 ? (roiMetrics.systemEtaSumMinutes / completedCount).toFixed(1) : '—'} мин
              </div>
              <div className="text-xs text-gray-400 mt-1 font-medium">
                Фактическое среднее по закрытым вызовам
              </div>
            </div>
          </div>

          {/* Card 3: Measured Sample */}
          <div className="p-4 rounded-2xl border bg-amber-500/10 border-amber-500/30 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-gray-400 uppercase">Измеренная выборка</span>
              <ShieldCheck className="w-5 h-5 text-amber-400" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-extrabold text-amber-400">{completedCount}</div>
              <div className="text-xs text-gray-400 mt-1 font-medium">
                закрытых вызовов, использованных в расчёте
              </div>
            </div>
          </div>
        </div>

        {/* Transparent Analog Comparison */}
        <div className="p-4 rounded-2xl border bg-slate-100/50 dark:bg-[#101724]/50 border-slate-300 dark:border-[#1e2a3a] space-y-3">
          <div className="flex justify-between items-center text-xs font-bold uppercase text-gray-400">
            <span>Матрица возможностей аналогов</span>
            <span className="text-sky-400">Без неподтверждённых KPI</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-[11px]">
            <div className="font-bold text-gray-500">Решение</div>
            <div className="font-bold text-gray-500">Маршрут</div>
            <div className="font-bold text-gray-500">Квалификация</div>
            <div className="font-bold text-gray-500">Загрузка / SLA</div>
            {ANALOGS.map(analog => (
              <React.Fragment key={analog.id}>
                <div className={analog.id === selectedAnalogId ? 'font-bold text-emerald-400' : 'text-gray-300'}>{analog.shortTitle}</div>
                <div className="text-gray-400">{analog.route}</div>
                <div className="text-gray-400">{analog.qualification}</div>
                <div className="text-gray-400">{analog.workload}; {analog.sla}</div>
              </React.Fragment>
            ))}
          </div>
        </div>

        </>
        )}

        {/* Footer */}
        <div className="pt-2 border-t border-slate-200 dark:border-[#1e2a3a] flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-mono font-bold text-sm uppercase tracking-wider cursor-pointer shadow-lg shadow-sky-500/20"
          >
            Закрыть Аналитику
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsModal;
