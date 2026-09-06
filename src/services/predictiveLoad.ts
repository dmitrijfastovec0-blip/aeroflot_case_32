import { OtoTask, CategoryCode, Worker } from '../types/index';

export interface PredictiveLoadInsight {
  categoryCode: CategoryCode;
  queuedDemand: number;
  availableSupply: number;
  deficit: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
}

export function buildPredictiveLoadInsights(tasks: OtoTask[], workers: Worker[]): PredictiveLoadInsight[] {
  const categories: CategoryCode[] = ['B1', 'B2', 'A'];
  const demand: Record<CategoryCode, number> = { B1: 0, B2: 0, A: 0 };
  const supply: Record<CategoryCode, number> = { B1: 0, B2: 0, A: 0 };

  tasks
    .filter(task => task.status === 'QUEUED')
    .forEach(task => {
      const requirements = task.requiredCrew && task.requiredCrew.length > 0
        ? task.requiredCrew
        : [{ categoryCode: task.categoryCode, count: 1 }];
      requirements.forEach(requirement => {
        demand[requirement.categoryCode] += requirement.count;
      });
    });

  workers
    .filter(worker => worker.status === 'FREE_STATIONARY' || worker.status === 'FREE_PATROLLING')
    .forEach(worker => {
      supply[worker.categoryCode] += 1;
      if (worker.categoryCode !== 'A') supply.A += 1;
    });

  return categories.map(categoryCode => {
    const deficit = Math.max(0, demand[categoryCode] - supply[categoryCode]);
    const ratio = demand[categoryCode] === 0 ? 0 : deficit / demand[categoryCode];
    return {
      categoryCode,
      queuedDemand: demand[categoryCode],
      availableSupply: supply[categoryCode],
      deficit,
      risk: deficit === 0 ? 'LOW' : ratio >= 0.5 ? 'HIGH' : 'MEDIUM'
    };
  });
}
