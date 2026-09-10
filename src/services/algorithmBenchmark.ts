/**
 * ============================================================================
 * ВОСПРОИЗВОДИМЫЙ БЕНЧМАРК АЛГОРИТМОВ ДИСПЕТЧЕРИЗАЦИИ ОТО
 * ----------------------------------------------------------------------------
 * Предоставляет инструментарий для строгого сравнительного анализа эффективности
 * 6 стратегий назначения бригад на абсолютно идентичном снимке (snapshot)
 * входящей очереди дефектов и текущего состояния персонала перрона.
 * 
 * Сравниваемые стратегии:
 * 1. «AeroDispatch» (Global Min-Cost):
 *    Глобальная оптимизация целевой функции через венгерский алгоритм.
 *    Учитывает SLA-slack (запас времени до нарушения норматива 15 минут),
 *    защиту баз от полного опустошения (Zone Guard), усталость и штрафы
 *    за неоправданную переквалификацию B1/B2 вместо Cat-A.
 * 
 * 2. «Greedy Graph» (Локально-жадный по графу дорог):
 *    Выбор ближайшего инженера по кратчайшему пути дорожного графа
 *    без оптимизации всей очереди.
 * 
 * 3. «Greedy Baseline» (Ближайший по прямой):
 *    Локально-жадный выбор ближайшего подходящего инженера по евклидовой прямой.
 * 
 * 4. «FIFO Dispatch» (Первый свободный по очереди):
 *    Назначение первого освободившегося специалиста нужной квалификации
 *    в порядке очереди заявок, без учета геопозиции и расстояний.
 * 
 * 5. «Sector/Zone-First» (Зональный приоритет):
 *    Сначала привлекаются инженеры из того же терминального комплекса (Север/Юг),
 *    даже если в соседнем секторе есть более близкий специалист на границе зон.
 * 
 * 6. «Manual Radio Dispatch» (Ручное распределение с radio-latency):
 *    Экспертное распределение диспетчером с задержкой на радиообмен (+2 мин).
 * ============================================================================
 */

import { computeDispatchPlan, DispatcherContext } from '../core/dispatcher';
import { CategoryCode, OtoTask, Stand, TaskCrewMember, Worker } from '../types/index';

/** Результаты сравнительного бенчмарка для одного алгоритма */
export interface AlgorithmBenchmarkResult {
  /** Уникальный идентификатор алгоритма */
  id: string;
  /** Человекочитаемое название алгоритма */
  name: string;
  /** Общее число задач в тестовой выборке */
  sampleSize: number;
  /** Число успешно укомплектованных и отправленных задач */
  dispatchedCount: number;
  /** Среднее время прибытия бригады к борту (мин) */
  averageEtaMinutes: number | null;
  /** Медианное время прибытия бригады (мин) */
  medianEtaMinutes: number | null;
  /** 95-й процентиль времени прибытия P95 (мин) */
  p95EtaMinutes: number | null;
  /** Процент соблюдения норматива прибытия до 15 минут (% SLA) */
  slaCompliancePct: number | null;
  /** Средняя пройденная дистанция на одного сотрудника (м) */
  averageDistanceMeters: number | null;
  /** Время выполнения вычислений алгоритма (мс) */
  calculationMs: number;
  /** Краткая пояснительная записка по результатам */
  note: string;
}

/** Контекст выполнения бенчмарка */
export interface BenchmarkContext extends DispatcherContext {
  /** Опциональный калькулятор прямолинейного ETA для baseline */
  calculateDirectEta?: (worker: Worker, stand: Stand) => number;
}

/** Внутренняя структура распределения задачи */
interface Assignment {
  task: OtoTask;
  workers: Worker[];
  members: TaskCrewMember[];
}

/** Проверяет, свободен ли сотрудник для нового назначения */
const isFree = (worker: Worker): boolean =>
  worker.status === 'FREE_STATIONARY' || worker.status === 'FREE_PATROLLING';

/** Возвращает регламентный состав бригады для задачи */
const requirements = (task: OtoTask) =>
  task.requiredCrew && task.requiredCrew.length > 0
    ? task.requiredCrew
    : [{ categoryCode: task.categoryCode, count: 1 }];

/** Весовые ранги приоритетов для предварительной сортировки */
const priorityRank: Record<OtoTask['priority'], number> = {
  AOG: 0,
  URGENT: 1,
  ROUTINE: 2
};

/** Сортирует задачи очереди по приоритету (AOG -> URGENT -> ROUTINE) */
const orderedTasks = (tasks: OtoTask[]): OtoTask[] =>
  tasks
    .filter(task => task.status === 'QUEUED')
    .slice()
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);

/**
 * Агрегирует статистические метрики по результатам назначений
 */
const metric = (
  id: string,
  name: string,
  sample: OtoTask[],
  assignments: Assignment[],
  startedAt: number,
  note: string
): AlgorithmBenchmarkResult => {
  // Для каждой задачи определяющим является максимальный ETA среди членов ее бригады (критический путь)
  const etas = assignments
    .map(item => Math.max(...item.members.map(member => member.etaMinutes)))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  const distances = assignments
    .map(item => item.members.reduce((sum, member) => sum + member.distanceMeters, 0))
    .filter(Number.isFinite);

  const percentile = (values: number[], p: number): number | null =>
    values.length === 0 ? null : values[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)];

  return {
    id,
    name,
    sampleSize: sample.length,
    dispatchedCount: assignments.length,
    averageEtaMinutes: etas.length ? etas.reduce((sum, value) => sum + value, 0) / etas.length : null,
    medianEtaMinutes: percentile(etas, 0.5),
    p95EtaMinutes: percentile(etas, 0.95),
    slaCompliancePct: etas.length ? (etas.filter(value => value <= 15).length / etas.length) * 100 : null,
    averageDistanceMeters: distances.length ? distances.reduce((sum, value) => sum + value, 0) / distances.length : null,
    calculationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    note
  };
};

/**
 * Выполняет распределение по эвристическим стратегиям (GREEDY_GRAPH, GREEDY_DIRECT, FIFO, ZONE, MANUAL_RADIO)
 */
const runSimplePolicy = (
  tasks: OtoTask[],
  workers: Worker[],
  stands: Map<string, Stand>,
  calculateEta: BenchmarkContext['calculateEta'],
  policy: 'GREEDY_GRAPH' | 'GREEDY_DIRECT' | 'FIFO' | 'ZONE' | 'MANUAL_RADIO'
): Assignment[] => {
  const free = workers.filter(isFree).slice();
  const assignments: Assignment[] = [];
  const queue = policy === 'FIFO' ? tasks.filter(task => task.status === 'QUEUED') : orderedTasks(tasks);

  for (const task of queue) {
    const stand = stands.get(task.standId);
    if (!stand) continue;
    const selectedWorkers: Worker[] = [];
    const selectedMembers: TaskCrewMember[] = [];
    let complete = true;

    // Сборка полного регламентного состава бригады
    for (const requirement of requirements(task)) {
      for (let slot = 0; slot < requirement.count; slot++) {
        const candidates = free
          .filter(worker => !selectedWorkers.some(selected => selected.id === worker.id))
          .filter(worker => requirement.categoryCode === 'A' || worker.categoryCode === requirement.categoryCode)
          .map(worker => {
            const rawMember = calculateEta(worker, stand);
            let adjustedEta = rawMember.etaMinutes;
            let adjustedDist = rawMember.distanceMeters;

            if (policy === 'GREEDY_DIRECT') {
              const dx = (worker.x - stand.x) * 35;
              const dy = (worker.y - stand.y) * 35;
              adjustedDist = Math.hypot(dx, dy);
              const isCar = worker.vehicle === 'APRON_VEHICLE' || worker.vehicle === 'SHUTTLE';
              const speedMps = (isCar ? 20 : 4.5) * (1000 / 3600);
              adjustedEta = Math.round((adjustedDist / speedMps / 60) * 10) / 10;
            } else if (policy === 'MANUAL_RADIO') {
              adjustedEta = Math.round((rawMember.etaMinutes + 2.0) * 10) / 10;
            }

            return {
              worker,
              member: {
                ...rawMember,
                etaMinutes: adjustedEta,
                distanceMeters: adjustedDist
              }
            };
          })
          .filter(candidate => Number.isFinite(candidate.member.etaMinutes) && candidate.member.waypoints.length > 0);

        if (candidates.length === 0) {
          complete = false;
          break;
        }

        // Выбор кандидата в соответствии с текущей политикой
        const picked = candidates.sort((a, b) => {
          if (policy === 'ZONE') {
            const aZone = (a.worker.y < 45) === (stand.y < 45) ? 0 : 1;
            const bZone = (b.worker.y < 45) === (stand.y < 45) ? 0 : 1;
            if (aZone !== bZone) return aZone - bZone;
          }
          return policy === 'FIFO'
            ? a.worker.id.localeCompare(b.worker.id)
            : a.member.etaMinutes - b.member.etaMinutes;
        })[0];

        selectedWorkers.push(picked.worker);
        selectedMembers.push(picked.member);
      }
      if (!complete) break;
    }

    if (!complete) continue;
    assignments.push({ task, workers: selectedWorkers, members: selectedMembers });
    selectedWorkers.forEach(worker => {
      const index = free.findIndex(candidate => candidate.id === worker.id);
      if (index >= 0) free.splice(index, 1);
    });
  }
  return assignments;
};

/**
 * Запускает воспроизводимый бенчмарк всех 6 алгоритмов на текущем состоянии симуляции.
 * 
 * @param context Контекст диспетчеризации с текущими задачами, сотрудниками и картой стоянок
 * @returns Массив результатов тестирования по 6 алгоритмам
 */
export function runAlgorithmBenchmark(context: BenchmarkContext): AlgorithmBenchmarkResult[] {
  const sample = context.tasks.filter(task => task.status === 'QUEUED');
  const results: AlgorithmBenchmarkResult[] = [];

  // 1. Прогон флагманского алгоритма «AeroDispatch» (венгерский алгоритм + SLA-slack + Zone Guard)
  const optimalStarted = performance.now();
  const optimal = computeDispatchPlan(context);
  const optimalAssignments: Assignment[] = Object.values(optimal.dispatchedTasks)
    .map(task => {
      const members = task.crew;
      const workers = members
        .map(member => context.workers.find(candidate => candidate.id === member.workerId))
        .filter((worker): worker is Worker => worker !== undefined);
      return members.length > 0 && workers.length === members.length ? { task, workers, members } : null;
    })
    .filter((item): item is Assignment => item !== null);

  results.push(
    metric(
      'AERODISPATCH',
      'AeroDispatch: global min-cost',
      sample,
      optimalAssignments,
      optimalStarted,
      'Глобальный минимум суммарного ETA + динамический SLA-slack + защита базовых зон'
    )
  );

  // 2. Прогон 5 альтернативных эвристик для всестороннего сравнительного анализа
  const policies: {
    id: string;
    name: string;
    policy: 'GREEDY_GRAPH' | 'GREEDY_DIRECT' | 'FIFO' | 'ZONE' | 'MANUAL_RADIO';
    note: string;
  }[] = [
    {
      id: 'GREEDY_GRAPH',
      name: 'Greedy graph-based',
      policy: 'GREEDY_GRAPH',
      note: 'Локально-жадный выбор по графу дорог (first-available без учета глобального баланса)'
    },
    {
      id: 'GREEDY_DIRECT',
      name: 'Greedy direct baseline',
      policy: 'GREEDY_DIRECT',
      note: 'Прямолинейный выбор ближайшего сотрудника без учета графа перрона'
    },
    {
      id: 'FIFO_QUALIFICATION',
      name: 'FIFO qualification',
      policy: 'FIFO',
      note: 'Первый свободный сотрудник нужной квалификации в порядке очереди вызовов'
    },
    {
      id: 'ZONE_FIRST',
      name: 'Sector/Zone-first',
      policy: 'ZONE',
      note: 'Приоритет назначения сотрудников строго из закрепленного сектора (Север/Юг)'
    },
    {
      id: 'MANUAL_RADIO',
      name: 'Manual radio dispatch',
      policy: 'MANUAL_RADIO',
      note: 'Ручное распределение диспетчером по радиостанции (+2 мин latency на согласование)'
    }
  ];

  for (const algorithm of policies) {
    const startedAt = performance.now();
    const assignments = runSimplePolicy(
      sample,
      context.workers,
      context.standById,
      context.calculateEta,
      algorithm.policy
    );
    results.push(metric(algorithm.id, algorithm.name, sample, assignments, startedAt, algorithm.note));
  }

  return results;
}
