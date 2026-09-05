import { describe, it, expect } from 'vitest';
import {
  findNearestFreeWorkerOfCategory,
  generateShiftWorkersWithCustomCounts,
  calculateWorkerToStandEta,
  applyWeatherOverrides,
  resetWeatherOverrides,
  findNaiveNearestWorkerOfCategory,
  getCustomAirportStands,
  getCustomAirportFacilities,
  getSvoPatrolWaypoints
} from '../dijkstra';
import {
  extractCustomStands,
  calculateModularWorkerEta,
  getCustomPatrolWaypoints,
  getCustomReturnToBaseWaypoints
} from '../airfieldGraph';
import { spawnAirfieldShift } from '../shiftSpawner';
import { computeDispatchPlan } from '../../core/dispatcher';
import { SVO_STANDS, DEFECT_TYPES, SVO_EDGES, SVO_NODES, SVO_FACILITIES } from '../../constants/index';
import { OtoTask, Stand, Worker, AirportElement, AirportConnection } from '../../types/index';

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

  it('keeps stationary workers stationary instead of turning the whole shift into patrols', () => {
    const workers = generateShiftWorkersWithCustomCounts(10, 10, 5, 10);

    expect(workers.some(worker => worker.status === 'FREE_STATIONARY')).toBe(true);
    expect(workers.some(worker => worker.status === 'FREE_PATROLLING')).toBe(true);
    workers.forEach(worker => {
      expect(worker.isPatrolPreference).toBe(worker.status === 'FREE_PATROLLING');
    });
  });

  it('keeps every free SVO patrol segment on the declared road graph', () => {
    const coords = new Map<string, { x: number; y: number }>();
    SVO_NODES.forEach(node => coords.set(node.id, node));
    SVO_FACILITIES.forEach(facility => coords.set(facility.id, facility));
    const isOnSegment = (point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) return Math.hypot(point.x - a.x, point.y - a.y) < 0.01;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq));
      return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)) < 0.01;
    };

    const assertPatrolRoutesFollowRoads = (workers: Worker[]) => workers
      .filter(worker => worker.status === 'FREE_PATROLLING')
      .forEach(worker => {
      const route = getSvoPatrolWaypoints({ x: worker.x, y: worker.y }, worker.baseId);
      for (let i = 0; i < route.length - 1; i++) {
        const followsRoad = SVO_EDGES.some(edge => {
          const a = coords.get(edge.from);
          const b = coords.get(edge.to);
          return a && b && isOnSegment(route[i], a, b) && isOnSegment(route[i + 1], a, b);
        });
        expect(followsRoad).toBe(true);
      }
    });

    assertPatrolRoutesFollowRoads(spawnAirfieldShift({ b1Count: 22, b2Count: 12, catACount: 6, vehiclesCount: 20 }));
    // Shift reset/configuration uses this legacy entry point and must produce
    // the same graph-constrained patrol routes as the initial spawn path.
    assertPatrolRoutesFollowRoads(generateShiftWorkersWithCustomCounts(22, 12, 6, 20));
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

  it('5. Supports Custom Airfield Testbed: extracts custom stands/facilities, generates custom shift and routes via Dijkstra', () => {
    const customElements: AirportElement[] = [
      { id: 'CUST-RWY', kind: 'RUNWAY', label: 'ВПП 01/19', x: 50, y: 15, width: 60, height: 4 },
      { id: 'CUST-PTO', kind: 'DUTY_STATION', label: 'ПТО-1', x: 30, y: 50, width: 8, height: 6 },
      { id: 'CUST-PARK', kind: 'PARKING', label: 'Автопарк', x: 70, y: 50, width: 10, height: 6 },
      { id: 'CUST-ST-1', kind: 'STAND', label: '101', aircraftType: 'Airbus A320-200', x: 20, y: 35, width: 8, height: 6 },
      { id: 'CUST-ST-2', kind: 'STAND', label: '102', aircraftType: 'Boeing 737-800', x: 80, y: 35, width: 8, height: 6 }
    ];

    const customConnections: AirportConnection[] = [
      { id: 'LINK-1', from: 'CUST-PTO', to: 'CUST-ST-1', kind: 'ROAD' },
      { id: 'LINK-2', from: 'CUST-PTO', to: 'CUST-PARK', kind: 'ROAD' },
      { id: 'LINK-3', from: 'CUST-PARK', to: 'CUST-ST-2', kind: 'ROAD' }
    ];

    const stands = getCustomAirportStands(customElements);
    const facilities = getCustomAirportFacilities(customElements);

    expect(stands.length).toBe(2);
    expect(stands[0].label).toBe('101');
    expect(stands[0].aircraftType).toBe('Airbus A320-200');
    expect(facilities.length).toBe(2);

    const customWorkers = generateShiftWorkersWithCustomCounts(4, 2, 2, 4, facilities, stands);
    expect(customWorkers.length).toBe(8);

    // Verify workers are stationed at custom facilities or stands
    const allowedBases = new Set(facilities.map(f => f.id));
    customWorkers.forEach(w => {
      expect(allowedBases.has(w.baseId)).toBe(true);
    });

    // Test ETA calculation on custom graph
    const worker = customWorkers[0];
    const targetStand = stands[0];
    const etaMember = calculateWorkerToStandEta(worker, targetStand, customElements, customConnections);

    expect(etaMember).toBeDefined();
    expect(etaMember.etaMinutes).toBeGreaterThan(0);
    expect(etaMember.etaMinutes).toBeLessThan(15.0);
    expect(etaMember.waypoints.length).toBeGreaterThanOrEqual(2);
  });

  it('6. Successfully dispatches tasks on custom airfield with valid ETA within SLA limit', () => {
    const customElements: AirportElement[] = [
      { id: 'CUST-PTO', kind: 'DUTY_STATION', label: 'ПТО-1', x: 30, y: 50, width: 8, height: 6 },
      { id: 'CUST-ST-1', kind: 'STAND', label: '101', aircraftType: 'Airbus A320-200', x: 20, y: 35, width: 8, height: 6 }
    ];
    const customConnections: AirportConnection[] = [
      { id: 'LINK-1', from: 'CUST-PTO', to: 'CUST-ST-1', kind: 'ROAD' }
    ];

    const stands = getCustomAirportStands(customElements);
    const facilities = getCustomAirportFacilities(customElements);
    const customWorkers = generateShiftWorkersWithCustomCounts(6, 4, 2, 6, facilities, stands);

    const standById = new Map<string, Stand>(stands.map(s => [s.id, s]));

    const mockCustomTask: OtoTask = {
      id: 'custom-task-1',
      standId: stands[0].id,
      standLabel: `Стоянка ${stands[0].label}`,
      aircraftType: 'Airbus A320-200',
      categoryCode: 'B1',
      categoryLabel: 'ОТО (AOG)',
      priority: 'AOG',
      status: 'QUEUED',
      createdAt: '15:00',
      requiredCrew: [{ categoryCode: 'B1', count: 1 }],
      crew: [],
      arrivedCount: 0,
      maxEtaMinutes: 12.0,
      slaLimitMinutes: 15.0,
      withinSla: true,
      elapsedWorkSec: 0,
      targetWorkSec: 40
    };

    const ctx = {
      tasks: [mockCustomTask],
      workers: customWorkers,
      standById,
      calculateEta: (w: Worker, s: Stand) => calculateWorkerToStandEta(w, s, customElements, customConnections),
      findNaiveNearest: (cat: any, s: Stand, wrks: Worker[], busy?: Set<string>) =>
        findNaiveNearestWorkerOfCategory(cat, s, wrks, busy || new Set())
    };

    const plan = computeDispatchPlan(ctx);
    expect(plan.changed).toBe(true);
    expect(Object.keys(plan.dispatchedTasks).length).toBe(1);
    const dispatched = Object.values(plan.dispatchedTasks)[0];
    expect(dispatched.crew.length).toBe(1);
    expect(dispatched.crew[0].categoryCode).toBe('B1');
    expect(dispatched.maxEtaMinutes).toBeLessThanOrEqual(15.0);
  });

  it('7. Modular airfieldGraph computes accurate Dijkstra routes, waypoints and modular ETA', () => {
    const customElements: AirportElement[] = [
      { id: 'CUST-PTO-1', kind: 'DUTY_STATION', label: 'ПТО-1', x: 20, y: 40, width: 8, height: 6 },
      { id: 'CUST-WP-1', kind: 'WAYPOINT', label: 'Узел 1', x: 40, y: 40 },
      { id: 'CUST-ST-1', kind: 'STAND', label: '101', aircraftType: 'Airbus A320-200', x: 60, y: 40, width: 8, height: 6 }
    ];
    const customConnections: AirportConnection[] = [
      { id: 'L1', from: 'CUST-PTO-1', to: 'CUST-WP-1', kind: 'ROAD' },
      { id: 'L2', from: 'CUST-WP-1', to: 'CUST-ST-1', kind: 'ROAD' }
    ];

    const stands = extractCustomStands(customElements);
    expect(stands.length).toBe(1);

    const shift = spawnAirfieldShift({
      b1Count: 2,
      b2Count: 2,
      catACount: 1,
      vehiclesCount: 2,
      customElements,
      isCustomMode: true
    });
    expect(shift.length).toBe(5);

    const worker = shift[0];
    const eta = calculateModularWorkerEta(worker, stands[0], customElements, customConnections);
    expect(eta.waypoints.length).toBeGreaterThanOrEqual(2);
    expect(eta.distanceMeters).toBeGreaterThan(0);
    expect(eta.etaMinutes).toBeLessThan(15.0);

    const patrolPts = getCustomPatrolWaypoints(worker, customElements, customConnections);
    expect(patrolPts.length).toBeGreaterThanOrEqual(2);

    const returnPts = getCustomReturnToBaseWaypoints(worker, customElements, customConnections);
    expect(returnPts.length).toBeGreaterThanOrEqual(1);
  });

  it('8. Custom airfield workers follow curved roads and junctions strictly without straight line cutting', () => {
    // Road with 90 degree turn: PTO at (20, 20) -> Corner at (20, 60) -> Stand at (80, 60)
    const customElements: AirportElement[] = [
      { id: 'PTO-1', kind: 'DUTY_STATION', label: 'ПТО-1', x: 20, y: 20, width: 8, height: 6 },
      { id: 'STAND-1', kind: 'STAND', label: '101', aircraftType: 'Airbus A320-200', x: 80, y: 60, width: 8, height: 6 }
    ];
    const customConnections: AirportConnection[] = [
      {
        id: 'L-CURVE',
        from: 'PTO-1',
        to: 'STAND-1',
        kind: 'ROAD',
        points: [
          { x: 20, y: 20 },
          { x: 20, y: 60 }, // Corner turn
          { x: 80, y: 60 }
        ]
      }
    ];

    const stands = extractCustomStands(customElements);
    const shift = spawnAirfieldShift({
      b1Count: 1,
      b2Count: 0,
      catACount: 0,
      vehiclesCount: 1,
      customElements,
      customConnections,
      isCustomMode: true
    });

    const eta = calculateModularWorkerEta(shift[0], stands[0], customElements, customConnections);
    // Waypoints must include the corner at (20, 60)
    expect(eta.waypoints.length).toBeGreaterThanOrEqual(3);
    const hasCorner = eta.waypoints.some(pt => Math.hypot(pt.x - 20, pt.y - 60) < 1.0);
    expect(hasCorner).toBe(true);
  });

  it('does not invent a direct road between disconnected custom road segments', () => {
    const elements: AirportElement[] = [
      { id: 'PTO-1', kind: 'DUTY_STATION', label: 'ПТО-1', x: 10, y: 10 },
      { id: 'STAND-1', kind: 'STAND', label: '101', x: 90, y: 90 },
      { id: 'W-1', kind: 'WAYPOINT', label: 'Узел 1', x: 20, y: 10 },
      { id: 'W-2', kind: 'WAYPOINT', label: 'Узел 2', x: 80, y: 90 }
    ];
    const connections: AirportConnection[] = [
      { id: 'ROAD-1', from: 'PTO-1', to: 'W-1', kind: 'ROAD' },
      { id: 'ROAD-2', from: 'W-2', to: 'STAND-1', kind: 'ROAD' }
    ];

    const route = calculateModularWorkerEta(
      { ...generateShiftWorkersWithCustomCounts(1, 0, 0, 0)[0], x: 10, y: 10 },
      { id: 'STAND-1', label: '101', complex: 'SOUTH', x: 90, y: 90, aircraftType: 'A320' },
      elements,
      connections
    );

    expect(route.distanceMeters).toBe(Infinity);
    expect(route.waypoints).toHaveLength(0);
  });
});
