import { describe, expect, it } from 'vitest';
import { runAlgorithmBenchmark } from '../algorithmBenchmark';
import { calculateModularWorkerEta, findNearestFreeCustomWorker } from '../airfieldGraph';
import { AirportConnection, AirportElement, OtoTask, Worker } from '../../types/index';

describe('algorithm benchmark', () => {
  it('runs every algorithm on the same queue snapshot without mutating it', () => {
    const elements: AirportElement[] = [
      { id: 'PTO', kind: 'DUTY_STATION', label: 'ПТО', x: 10, y: 10 },
      { id: 'STAND-A', kind: 'STAND', label: 'A', x: 50, y: 10, aircraftType: 'A320' },
      { id: 'STAND-B', kind: 'STAND', label: 'B', x: 90, y: 10, aircraftType: 'A320' }
    ];
    const connections: AirportConnection[] = [
      { id: 'ROAD-A', from: 'PTO', to: 'STAND-A', kind: 'ROAD' },
      { id: 'ROAD-B', from: 'STAND-A', to: 'STAND-B', kind: 'ROAD' }
    ];
    const worker: Worker = {
      id: 'worker-1',
      name: 'Инженер',
      category: 'ENGINES_AIRFRAME',
      categoryCode: 'B1',
      status: 'FREE_STATIONARY',
      baseId: 'PTO',
      x: 10,
      y: 10,
      vehicle: 'WALK',
      dispatchedCount: 0
    };
    const catAWorker: Worker = {
      ...worker,
      id: 'worker-2',
      name: 'Инженер A',
      category: 'GENERAL_MECHANIC',
      categoryCode: 'A'
    };
    const tasks: OtoTask[] = [
      {
        id: 'task-a', standId: 'STAND-A', standLabel: 'A', aircraftType: 'A320', categoryCode: 'B1', categoryLabel: 'ATA 72', priority: 'AOG', status: 'QUEUED', crew: [], arrivedCount: 0, maxEtaMinutes: 15, slaLimitMinutes: 15, withinSla: true, createdAt: '12:00', elapsedWorkSec: 0, targetWorkSec: 40
      },
      {
        id: 'task-b', standId: 'STAND-B', standLabel: 'B', aircraftType: 'A320', categoryCode: 'B1', categoryLabel: 'ATA 72', requiredCrew: [{ categoryCode: 'B1', count: 1 }, { categoryCode: 'A', count: 1 }], priority: 'ROUTINE', status: 'QUEUED', crew: [], arrivedCount: 0, maxEtaMinutes: 15, slaLimitMinutes: 15, withinSla: true, createdAt: '12:01', elapsedWorkSec: 0, targetWorkSec: 40
      }
    ];
    const workersBefore = JSON.stringify([worker, catAWorker]);
    const tasksBefore = JSON.stringify(tasks);
    const stands = new Map(elements.filter(element => element.kind === 'STAND').map(element => [element.id, {
      id: element.id, label: element.label, complex: 'NORTH' as const, x: element.x, y: element.y, aircraftType: element.aircraftType || 'A320'
    }]));

    const results = runAlgorithmBenchmark({
      tasks,
      workers: [worker, catAWorker],
      standById: stands,
      calculateEta: (w, s) => calculateModularWorkerEta(w, s, elements, connections),
      findNaiveNearest: (cat, s, allWorkers, busy) => findNearestFreeCustomWorker(cat, s, allWorkers, busy || new Set(), elements, connections)
    });

    expect(results.map(result => result.id)).toEqual(['VOZDUHAN', 'GREEDY_NEAREST', 'FIFO_QUALIFICATION', 'ZONE_FIRST']);
    expect(results.every(result => result.sampleSize === 2)).toBe(true);
    expect(results.every(result => result.calculationMs >= 0)).toBe(true);
    expect(JSON.stringify([worker, catAWorker])).toBe(workersBefore);
    expect(JSON.stringify(tasks)).toBe(tasksBefore);
  });
});
