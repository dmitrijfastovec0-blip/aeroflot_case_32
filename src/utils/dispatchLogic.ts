import { Worker, Stand, CategoryCode, TaskCrewMember, VehicleType, Category, WorkerStatus } from '../types';
import { REAL_SVO_FACILITIES, REALISTIC_SVO_CONFIG, SVO_STANDS, SVO_NODES, SVO_EDGES, SVO_FACILITIES, SVO_MAP_METERS, TECHNICIAN_NAMES } from '../constants';

export function categoryCodeToEnum(code: CategoryCode): Category {
  switch (code) {
    case 'B1': return 'ENGINES_AIRFRAME';
    case 'B2': return 'AVIONICS';
    case 'A': return 'GENERAL_MECHANIC';
  }
}

export function categoryEnumToCode(cat: Category): CategoryCode {
  switch (cat) {
    case 'ENGINES_AIRFRAME': return 'B1';
    case 'AVIONICS': return 'B2';
    case 'GENERAL_MECHANIC': return 'A';
  }
}

// Generate Shift Workers: 85% stationary at bases, 15% patrolling. ALL INITIAL WORKERS ARE GREEN!
export function generateShiftWorkers(count: number): Worker[] {
  const b1Count = Math.round(count * REALISTIC_SVO_CONFIG.qualificationsRatio.ENGINES_AIRFRAME);
  const b2Count = Math.round(count * REALISTIC_SVO_CONFIG.qualificationsRatio.AVIONICS);
  const catACount = Math.max(0, count - b1Count - b2Count);

  const categories: Category[] = [
    ...Array(b1Count).fill('ENGINES_AIRFRAME'),
    ...Array(b2Count).fill('AVIONICS'),
    ...Array(catACount).fill('GENERAL_MECHANIC')
  ];

  return categories.map((cat, idx) => {
    const facility = REAL_SVO_FACILITIES[idx % REAL_SVO_FACILITIES.length];
    const nameIndex = idx % TECHNICIAN_NAMES.length;
    const name = `Инженер ${TECHNICIAN_NAMES[nameIndex]}`;

    // 85% FREE_STATIONARY at base, 15% FREE_PATROLLING on apron road graph
    let status: WorkerStatus = 'FREE_STATIONARY';
    let currentX = facility.x;
    let currentY = facility.y;

    if (idx % 7 === 1) { // ~15%
      status = 'FREE_PATROLLING';
      const wayNodes = SVO_NODES.filter(n => n.type === 'WAYPOINT');
      const wayNode = wayNodes[idx % wayNodes.length];
      currentX = wayNode.x;
      currentY = wayNode.y;
    } else {
      currentX += (Math.sin(idx * 2.5) * 2.0);
      currentY += (Math.cos(idx * 2.5) * 2.0);
    }

    const hasVehicle = idx < REALISTIC_SVO_CONFIG.availableVehicles;
    const vehicle: VehicleType = hasVehicle ? 'APRON_VEHICLE' : 'PEDESTRIAN';

    return {
      id: `WRK-${String(idx + 1).padStart(3, '0')}`,
      name,
      category: cat,
      categoryCode: categoryEnumToCode(cat),
      status,
      baseId: facility.id,
      x: Math.max(5, Math.min(95, currentX)),
      y: Math.max(5, Math.min(95, currentY)),
      vehicle
    };
  });
}

// Distance in meters between two percentage coordinates
export function getDistanceMetersBetweenPct(x1: number, y1: number, x2: number, y2: number): number {
  const dxMeters = ((x2 - x1) / 100) * SVO_MAP_METERS.width;
  const dyMeters = ((y2 - y1) / 100) * SVO_MAP_METERS.height;
  return Math.round(Math.hypot(dxMeters, dyMeters));
}

// Node Position Map Lookup
export function getNodePosById(id: string): { x: number; y: number } {
  const fac = REAL_SVO_FACILITIES.find(f => f.id === id);
  if (fac) return { x: fac.x, y: fac.y };

  const node = SVO_NODES.find(n => n.id === id);
  if (node) return { x: node.x, y: node.y };

  return { x: 50, y: 50 };
}

// Find closest graph node ID to a point (x, y)
export function getClosestNodeId(x: number, y: number): string {
  let closestId = SVO_FACILITIES[0].id;
  let minDist = Infinity;

  const allNodes = [
    ...REAL_SVO_FACILITIES.map(f => ({ id: f.id, x: f.x, y: f.y })),
    ...SVO_NODES.map(n => ({ id: n.id, x: n.x, y: n.y }))
  ];

  for (const n of allNodes) {
    const dist = Math.hypot(n.x - x, n.y - y);
    if (dist < minDist) {
      minDist = dist;
      closestId = n.id;
    }
  }

  return closestId;
}

// Dijkstra Pathfinder algorithm on SVO_EDGES graph
export function findDijkstraShortestPath(startNodeId: string, endNodeId: string): string[] {
  if (startNodeId === endNodeId) return [startNodeId];

  const allNodeIds = new Set<string>();
  const adj = new Map<string, { to: string; weight: number }[]>();

  SVO_EDGES.forEach(edge => {
    allNodeIds.add(edge.from);
    allNodeIds.add(edge.to);

    const pos1 = getNodePosById(edge.from);
    const pos2 = getNodePosById(edge.to);
    let weight = getDistanceMetersBetweenPct(pos1.x, pos1.y, pos2.x, pos2.y);
    if (edge.type === 'TUNNEL') weight += 400;

    if (!adj.has(edge.from)) adj.set(edge.from, []);
    if (!adj.has(edge.to)) adj.set(edge.to, []);

    adj.get(edge.from)!.push({ to: edge.to, weight });
    adj.get(edge.to)!.push({ to: edge.from, weight });
  });

  const distances = new Map<string, number>();
  const previous = new Map<string, string | null>();
  const unvisited = new Set<string>(allNodeIds);

  allNodeIds.forEach(id => {
    distances.set(id, Infinity);
    previous.set(id, null);
  });
  distances.set(startNodeId, 0);

  while (unvisited.size > 0) {
    let currNode: string | null = null;
    let minD = Infinity;

    unvisited.forEach(id => {
      const d = distances.get(id)!;
      if (d < minD) {
        minD = d;
        currNode = id;
      }
    });

    if (!currNode || currNode === endNodeId || minD === Infinity) break;

    unvisited.delete(currNode);

    const neighbors = adj.get(currNode) || [];
    for (const neighbor of neighbors) {
      if (unvisited.has(neighbor.to)) {
        const alt = distances.get(currNode)! + neighbor.weight;
        if (alt < distances.get(neighbor.to)!) {
          distances.set(neighbor.to, alt);
          previous.set(neighbor.to, currNode);
        }
      }
    }
  }

  const path: string[] = [];
  let curr: string | null = endNodeId;
  while (curr) {
    path.unshift(curr);
    curr = previous.get(curr) || null;
  }

  return path[0] === startNodeId ? path : [startNodeId, endNodeId];
}

// Convert path node IDs to array of coordinate waypoints
export function getWaypointsForNodePath(
  startPos: { x: number; y: number },
  nodePath: string[]
): { x: number; y: number }[] {
  const waypoints: { x: number; y: number }[] = [];
  waypoints.push({ x: startPos.x, y: startPos.y });

  for (const nodeId of nodePath) {
    const pos = getNodePosById(nodeId);
    const lastWay = waypoints[waypoints.length - 1];
    if (Math.hypot(lastWay.x - pos.x, lastWay.y - pos.y) > 0.5) {
      waypoints.push(pos);
    }
  }

  return waypoints;
}

// Calculate ETA and Waypoint Path for a worker from CURRENT POSITION to target stand
export function calculateWorkerToStandEta(
  worker: Worker,
  stand: Stand
): TaskCrewMember {
  const startNodeId = getClosestNodeId(worker.x, worker.y);
  const nodePath = findDijkstraShortestPath(startNodeId, stand.id);
  const waypoints = getWaypointsForNodePath({ x: worker.x, y: worker.y }, nodePath);

  let totalDistanceMeters = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    totalDistanceMeters += getDistanceMetersBetweenPct(
      waypoints[i].x, waypoints[i].y,
      waypoints[i + 1].x, waypoints[i + 1].y
    );
  }

  const workerIsNorth = worker.y < 45;
  const standIsNorth = stand.y < 45;
  const isCrossComplex = workerIsNorth !== standIsNorth;

  let vehicle: VehicleType = worker.vehicle;
  let vehicleLabel = '🚶 Пешком (4.5 км/ч)';
  let etaMinutes = 0;

  if (isCrossComplex) {
    vehicle = 'SHUTTLE';
    vehicleLabel = '🚇 Тоннельный шаттл (40 км/ч)';
    const speedMetersPerMin = (REALISTIC_SVO_CONFIG.speeds.interTerminalShuttleKmH * 1000) / 60;
    const travelSec = (totalDistanceMeters / speedMetersPerMin) * 60;
    const totalSec = travelSec + REALISTIC_SVO_CONFIG.penaltiesSec.interTerminalShuttle;
    etaMinutes = Math.round((totalSec / 60) * 10) / 10;
  } else if (worker.vehicle === 'APRON_VEHICLE') {
    vehicleLabel = '🚘 Автомобиль ОТО (20 км/ч)';
    const speedMetersPerMin = (REALISTIC_SVO_CONFIG.speeds.apronVehicleKmH * 1000) / 60;
    const travelSec = (totalDistanceMeters / speedMetersPerMin) * 60;
    const totalSec = travelSec + REALISTIC_SVO_CONFIG.penaltiesSec.apronVehicle;
    etaMinutes = Math.round((totalSec / 60) * 10) / 10;
  } else {
    const speedMetersPerMin = (REALISTIC_SVO_CONFIG.speeds.pedestrianKmH * 1000) / 60;
    const travelSec = (totalDistanceMeters / speedMetersPerMin) * 60;
    etaMinutes = Math.round((travelSec / 60) * 10) / 10;
  }

  let startLocationText = `Дежурка (${worker.baseId})`;
  if (worker.status === 'FREE_PATROLLING') startLocationText = 'Патруль перрона';
  if (worker.status === 'WORKING_ON_SITE') startLocationText = 'Стоянка ВС';

  return {
    workerId: worker.id,
    workerName: worker.name,
    categoryCode: worker.categoryCode,
    startLocationText,
    distanceMeters: Math.round(totalDistanceMeters),
    vehicle,
    vehicleLabel,
    etaMinutes,
    waypoints,
    hasArrived: false
  };
}

// Find nearest FREE worker of specific category code (B1, B2, A)
export function findNearestFreeWorkerOfCategory(
  categoryCode: CategoryCode,
  targetStand: Stand,
  workers: Worker[],
  alreadySelectedWorkerIds: Set<string>
): TaskCrewMember | null {
  const freeWorkers = workers.filter(w =>
    (w.status === 'FREE_STATIONARY' || w.status === 'FREE_PATROLLING') &&
    !alreadySelectedWorkerIds.has(w.id)
  );

  const matchingCandidates = freeWorkers.filter(w => {
    if (categoryCode === 'B1') return w.categoryCode === 'B1';
    if (categoryCode === 'B2') return w.categoryCode === 'B2';
    return true;
  });

  const candidates = matchingCandidates.length > 0 ? matchingCandidates : freeWorkers;

  if (candidates.length === 0) return null;

  let bestMember: TaskCrewMember | null = null;
  let minEta = Infinity;

  for (const worker of candidates) {
    const member = calculateWorkerToStandEta(worker, targetStand);
    if (member.etaMinutes < minEta) {
      minEta = member.etaMinutes;
      bestMember = member;
    }
  }

  return bestMember;
}

export function calculateCrewMaxEta(
  crew: TaskCrewMember[],
  slaLimitMinutes = 15.0
): { maxEtaMinutes: number; withinSla: boolean } {
  if (crew.length === 0) return { maxEtaMinutes: 0, withinSla: true };
  const maxEtaMinutes = Math.max(...crew.map(c => c.etaMinutes));
  const withinSla = maxEtaMinutes <= slaLimitMinutes;
  return { maxEtaMinutes, withinSla };
}
