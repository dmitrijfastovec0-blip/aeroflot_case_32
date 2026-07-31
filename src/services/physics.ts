import { Worker } from '../types/index';

// 1. LERP Math Helper
export function lerp(start: number, end: number, amt: number): number {
  return (1 - amt) * start + amt * end;
}

// 2. Group Transit Workers in Apron Vehicle
export function groupTransitWorkersByVehicle(workers: Worker[]): {
  grouped: Map<string, Worker[]>;
  individuals: Worker[];
} {
  const grouped = new Map<string, Worker[]>();
  const individuals: Worker[] = [];

  workers.forEach(worker => {
    if (worker.status === 'IN_TRANSIT' && worker.vehicle === 'APRON_VEHICLE' && worker.currentTaskId) {
      const key = `${worker.currentTaskId}_${worker.baseId}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(worker);
    } else {
      individuals.push(worker);
    }
  });

  return { grouped, individuals };
}
