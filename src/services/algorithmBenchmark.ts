import { computeDispatchPlan, DispatcherContext } from '../core/dispatcher';
import { CategoryCode, OtoTask, Stand, TaskCrewMember, Worker } from '../types/index';

export interface AlgorithmBenchmarkResult {
  id: string;
  name: string;
  sampleSize: number;
  dispatchedCount: number;
  averageEtaMinutes: number | null;
  medianEtaMinutes: number | null;
  p95EtaMinutes: number | null;
  slaCompliancePct: number | null;
  averageDistanceMeters: number | null;
  calculationMs: number;
  note: string;
}

export interface BenchmarkContext extends DispatcherContext {
  calculateDirectEta?: (worker: Worker, stand: Stand) => number;
}

interface Assignment {
  task: OtoTask;
  workers: Worker[];
  members: TaskCrewMember[];
}

const isFree = (worker: Worker): boolean =>
  worker.status === 'FREE_STATIONARY' || worker.status === 'FREE_PATROLLING';

const requirements = (task: OtoTask) =>
  task.requiredCrew && task.requiredCrew.length > 0
    ? task.requiredCrew
    : [{ categoryCode: task.categoryCode, count: 1 }];

const priorityRank: Record<OtoTask['priority'], number> = {
  AOG: 0,
  URGENT: 1,
  ROUTINE: 2
};

const orderedTasks = (tasks: OtoTask[]): OtoTask[] =>
  tasks
    .filter(task => task.status === 'QUEUED')
    .slice()
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);

const metric = (
  id: string,
  name: string,
  sample: OtoTask[],
  assignments: Assignment[],
  startedAt: number,
  note: string
): AlgorithmBenchmarkResult => {
  const etas = assignments.map(item => Math.max(...item.members.map(member => member.etaMinutes))).filter(Number.isFinite).sort((a, b) => a - b);
  const distances = assignments.map(item => item.members.reduce((sum, member) => sum + member.distanceMeters, 0)).filter(Number.isFinite);
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
    slaCompliancePct: etas.length ? etas.filter(value => value <= 15).length / etas.length * 100 : null,
    averageDistanceMeters: distances.length ? distances.reduce((sum, value) => sum + value, 0) / distances.length : null,
    calculationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    note
  };
};

const runSimplePolicy = (
  tasks: OtoTask[],
  workers: Worker[],
  stands: Map<string, Stand>,
  calculateEta: BenchmarkContext['calculateEta'],
  policy: 'GREEDY' | 'FIFO' | 'ZONE'
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

    for (const requirement of requirements(task)) {
      for (let slot = 0; slot < requirement.count; slot++) {
        const candidates = free
          .filter(worker => !selectedWorkers.some(selected => selected.id === worker.id))
          .filter(worker => requirement.categoryCode === 'A' || worker.categoryCode === requirement.categoryCode)
          .map(worker => ({ worker, member: calculateEta(worker, stand) }))
          .filter(candidate => Number.isFinite(candidate.member.etaMinutes) && candidate.member.waypoints.length > 0);
        if (candidates.length === 0) {
          complete = false;
          break;
        }

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

export function runAlgorithmBenchmark(context: BenchmarkContext): AlgorithmBenchmarkResult[] {
  const sample = context.tasks.filter(task => task.status === 'QUEUED');
  const results: AlgorithmBenchmarkResult[] = [];

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
  results.push(metric('VOZDUHAN', 'Воздухан: global min-cost', sample, optimalAssignments, optimalStarted, 'Полный диспетчерский алгоритм проекта'));

  const policies: { id: string; name: string; policy: 'GREEDY' | 'FIFO' | 'ZONE'; note: string }[] = [
    { id: 'GREEDY_NEAREST', name: 'Greedy nearest', policy: 'GREEDY', note: 'Ближайший допустимый сотрудник' },
    { id: 'FIFO_QUALIFICATION', name: 'FIFO qualification', policy: 'FIFO', note: 'Первый свободный сотрудник нужной квалификации' },
    { id: 'ZONE_FIRST', name: 'Zone-first', policy: 'ZONE', note: 'Сначала сотрудник из той же зоны' }
  ];

  for (const algorithm of policies) {
    const startedAt = performance.now();
    const assignments = runSimplePolicy(sample, context.workers, context.standById, context.calculateEta, algorithm.policy);
    results.push(metric(algorithm.id, algorithm.name, sample, assignments, startedAt, algorithm.note));
  }

  return results;
}
