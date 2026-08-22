import { describe, it, expect } from 'vitest';
import {
  findNearestFreeWorkerOfCategory,
  generateShiftWorkersWithCustomCounts,
  calculateWorkerToStandEta,
  applyWeatherOverrides,
  resetWeatherOverrides,
  findNaiveNearestWorkerOfCategory
} from '../dijkstra';
import { computeDispatchPlan } from '../../core/dispatcher';
import { SVO_STANDS, DEFECT_TYPES } from '../../constants/index';
import { OtoTask, Stand, Worker } from '../../types/index';

const standMap = new Map<string, Stand>(SVO_STANDS.map(s => [s.id, s]));

describe('SVO OTO Dispatcher & Algorithm Suite', () => {
  it('1. Correctly enforces Category Qualification Matching (B1 for Engine, B2 for Avionics, A for Mechanic)', () => {
    const workers = generateShiftWorkersWithCustomCounts(10, 10, 5, 10);
    const targetStand = SVO_STANDS[0]; // Stand B12
    const emptySet = new Set<string>();

    // Test B1 (Engines/Airframe)
    const candidateB1 = findNearestFreeWorkerOfCategory('B1', targetStand, workers, emptySet);
    expect(candidateB1).toBeDefined();
    const w1 = workers.find(w => w.id === candidateB1?.workerId);
    expect(w1?.categoryCode).toBe('B1');

    // Test B2 (Avionics)
    const candidateB2 = findNearestFreeWorkerOfCategory('B2', targetStand, workers, emptySet);
    expect(candidateB2).toBeDefined();
    const w2 = workers.find(w => w.id === candidateB2?.workerId);
    expect(w2?.categoryCode).toBe('B2');

    // Test A (General Mechanic)
    const candidateA = findNearestFreeWorkerOfCategory('A', targetStand, workers, emptySet);
    expect(candidateA).toBeDefined();
    const w3 = workers.find(w => w.id === candidateA?.workerId);
    expect(['B1', 'B2', 'A']).toContain(w3?.categoryCode);
  });

  it('2. Enforces 15-Minute SLA Limits & Adjusts Speed under Severe Weather', () => {
    resetWeatherOverrides();
    const workers = generateShiftWorkersWithCustomCounts(5, 5, 5, 5);
    const stand = SVO_STANDS[SVO_STANDS.length - 1]; // Remote stand
    const emptySet = new Set<string>();

    const resClear = findNearestFreeWorkerOfCategory('B1', stand, workers, emptySet);
    expect(resClear).toBeDefined();
    expect(resClear!.etaMinutes).toBeLessThan(15.0);

    // Apply Blizzard SVO weather override
    applyWeatherOverrides(3.2, 12.0); // reduced vehicle speed
    const resBlizzard = findNearestFreeWorkerOfCategory('B1', stand, workers, emptySet);
    expect(resBlizzard).toBeDefined();
    expect(resBlizzard!.etaMinutes).toBeGreaterThanOrEqual(resClear!.etaMinutes);

    resetWeatherOverrides();
  });

  it('3. Computes Dispatch Plan within SLA constraint time (far below hackathon requirement threshold of 10 seconds)', () => {
    const workers = generateShiftWorkersWithCustomCounts(22, 12, 6, 20);
    const mockTasks: OtoTask[] = [
      {
        id: 'test-task-1',
        standId: SVO_STANDS[0].id,
        standLabel: SVO_STANDS[0].label,
        aircraftType: 'A320neo',
        categoryCode: 'B1',
        categoryLabel: 'B1 — Планер и Двигатели',
        defectLabel: DEFECT_TYPES[0].name,
        priority: 'AOG',
        status: 'QUEUED',
        createdAt: '14:00',
        requiredCrew: DEFECT_TYPES[0].requiredCrew,
        crew: [],
        arrivedCount: 0,
        maxEtaMinutes: 12.0,
        slaLimitMinutes: 15.0,
        withinSla: true,
        elapsedWorkSec: 0,
        targetWorkSec: 40
      }
    ];

    const ctx = {
      tasks: mockTasks,
      workers,
      standById: standMap,
      calculateEta: (w: Worker, s: Stand) => calculateWorkerToStandEta(w, s),
      findNaiveNearest: (cat: any, s: Stand, wrks: Worker[], busy?: Set<string>) =>
        findNaiveNearestWorkerOfCategory(cat, s, wrks, busy || new Set())
    };

    const startTime = performance.now();
    const plan = computeDispatchPlan(ctx);
    const durationMs = performance.now() - startTime;

    expect(durationMs).toBeLessThan(10000.0); // Required by specification: calculation time <= 10 seconds (10000ms)
    expect(plan).toBeDefined();
  });

  it('4. Evaluates all 5 Real Dispatch Algorithms without exceptions', () => {
    const workers = generateShiftWorkersWithCustomCounts(15, 10, 5, 10);
    const mockTasks: OtoTask[] = [
      {
        id: 'test-task-2',
        standId: SVO_STANDS[2].id,
        standLabel: SVO_STANDS[2].label,
        aircraftType: 'B777-300ER',
        categoryCode: 'B2',
        categoryLabel: 'B2 — Авионика',
        defectLabel: DEFECT_TYPES[1].name,
        priority: 'URGENT',
        status: 'QUEUED',
        createdAt: '14:05',
        requiredCrew: DEFECT_TYPES[1].requiredCrew,
        crew: [],
        arrivedCount: 0,
        maxEtaMinutes: 10.0,
        slaLimitMinutes: 15.0,
        withinSla: true,
        elapsedWorkSec: 0,
        targetWorkSec: 40
      }
    ];

    const ctx = {
      tasks: mockTasks,
      workers,
      standById: standMap,
      calculateEta: (w: Worker, s: Stand) => calculateWorkerToStandEta(w, s),
      findNaiveNearest: (cat: any, s: Stand, wrks: Worker[], busy?: Set<string>) =>
        findNaiveNearestWorkerOfCategory(cat, s, wrks, busy || new Set())
    };

    const plan = computeDispatchPlan(ctx);
    expect(plan).toBeDefined();
  });
});
