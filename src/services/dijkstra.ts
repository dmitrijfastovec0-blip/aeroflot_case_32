import { Worker, Stand, CategoryCode, TaskCrewMember, Category } from '../types/index';
import { SVO_NODES, SVO_EDGES, SVO_FACILITIES, TECHNICIAN_NAMES } from '../constants/index';

// 1. Find Closest Node by Percentage Coordinates
export function getClosestNodeId(pctX: number, pctY: number): string {
  let minDistanceSq = Infinity;
  let closestId = SVO_NODES[0].id;

  for (const node of SVO_NODES) {
    const dx = node.x - pctX;
    const dy = node.y - pctY;
    const distSq = dx * dx + dy * dy;
    if (distSq < minDistanceSq) {
      minDistanceSq = distSq;
      closestId = node.id;
    }
  }
  return closestId;
}

// 2. Dijkstra Shortest Path Finder
export function findDijkstraShortestPath(startNodeId: string, endNodeId: string): string[] {
  if (startNodeId === endNodeId) return [startNodeId];

  // Graph vertices = road nodes + facilities (bases). Facilities appear as edge endpoints.
  const vertices = new Set<string>();
  SVO_NODES.forEach(n => vertices.add(n.id));
  SVO_FACILITIES.forEach(f => vertices.add(f.id));
  SVO_EDGES.forEach(e => { vertices.add(e.from); vertices.add(e.to); });

  // Resolve an id that may be a facility (base) down to a traversable graph vertex
  const resolveVertex = (id: string): string => {
    if (vertices.has(id)) return id;
    const fac = SVO_FACILITIES.find(f => f.id === id);
    if (fac) return getClosestNodeId(fac.x, fac.y);
    const node = SVO_NODES.find(n => n.id === id);
    if (node) return getClosestNodeId(node.x, node.y);
    return SVO_NODES[0].id;
  };

  const startId = resolveVertex(startNodeId);
  const endId = resolveVertex(endNodeId);

  if (startId === endId) return [startNodeId, endNodeId];

  const distances: Record<string, number> = {};
  const previous: Record<string, string | null> = {};
  const unvisited = new Set<string>();

  vertices.forEach(vId => {
    distances[vId] = Infinity;
    previous[vId] = null;
    unvisited.add(vId);
  });
  distances[startId] = 0;

  const adjList: Record<string, { to: string; distance: number }[]> = {};
  vertices.forEach(vId => { adjList[vId] = []; });

  SVO_EDGES.forEach(e => {
    adjList[e.from]?.push({ to: e.to, distance: e.distance });
    adjList[e.to]?.push({ to: e.from, distance: e.distance });
  });

  while (unvisited.size > 0) {
    let currentId: string | null = null;
    let smallestDist = Infinity;

    for (const nodeId of unvisited) {
      if (distances[nodeId] < smallestDist) {
        smallestDist = distances[nodeId];
        currentId = nodeId;
      }
    }

    if (!currentId || smallestDist === Infinity) break;
    if (currentId === endId) break;

    unvisited.delete(currentId);

    const neighbors = adjList[currentId] || [];
    for (const neighbor of neighbors) {
      if (unvisited.has(neighbor.to)) {
        const alt = distances[currentId] + neighbor.distance;
        if (alt < distances[neighbor.to]) {
          distances[neighbor.to] = alt;
          previous[neighbor.to] = currentId;
        }
      }
    }
  }

  const path: string[] = [];
  let curr: string | null = endId;

  while (curr) {
    path.unshift(curr);
    curr = previous[curr];
  }

  // Always anchor the path with the original endpoints (which may be base facilities)
  if (path[0] !== startNodeId) path.unshift(startNodeId);
  if (path[path.length - 1] !== endNodeId) path.push(endNodeId);

  if (path.length === 1) return [startNodeId, endNodeId];

  return path;
}

// 3. Convert Node Path to Percentage Waypoints
export function getWaypointsForNodePath(startPoint: { x: number; y: number }, nodePath: string[]): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [startPoint];

  for (const nodeId of nodePath) {
    const node = SVO_NODES.find(n => n.id === nodeId);
    if (node) {
      points.push({ x: node.x, y: node.y });
      continue;
    }

    // Facility/base nodes (PTO_1, AK_4, ...) live in SVO_FACILITIES, not SVO_NODES
    const fac = SVO_FACILITIES.find(f => f.id === nodeId);
    if (fac) {
      points.push({ x: fac.x, y: fac.y });
    }
  }

  // GUARANTEE AT LEAST 2 POINTS SO ANIMATION LOOP NEVER SKIPS!
  if (points.length === 1) {
    points.push({ x: startPoint.x + 0.01, y: startPoint.y + 0.01 });
  }

  return points;
}

// 4. Calculate ETA for Single Worker to Target Stand
export function calculateWorkerToStandEta(worker: Worker, stand: Stand): TaskCrewMember {
  const startNodeId = getClosestNodeId(worker.x, worker.y);
  const targetNodeId = stand.id;
  const nodePath = findDijkstraShortestPath(startNodeId, targetNodeId);

  let totalDistanceMeters = 0;
  let hasTunnel = false;

  for (let i = 0; i < nodePath.length - 1; i++) {
    const fromId = nodePath[i];
    const toId = nodePath[i + 1];
    const edge = SVO_EDGES.find(
      e => (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId)
    );

    if (edge) {
      totalDistanceMeters += edge.distance;
      if (edge.type === 'TUNNEL') hasTunnel = true;
    } else {
      totalDistanceMeters += 300;
    }
  }

  const isVehicle = worker.vehicle === 'APRON_VEHICLE';
  const speedKmH = isVehicle ? (hasTunnel ? 35 : 20) : 4.5;
  const speedMetersPerMin = (speedKmH * 1000) / 60;

  const penaltyMinutes = isVehicle ? (hasTunnel ? 2.0 : 1.0) : 0;
  const travelMinutes = totalDistanceMeters / speedMetersPerMin;
  const etaMinutes = Math.max(1.0, Math.round((travelMinutes + penaltyMinutes) * 10) / 10);

  const waypoints = getWaypointsForNodePath({ x: worker.x, y: worker.y }, nodePath);
  const baseObj = SVO_FACILITIES.find(f => f.id === worker.baseId);

  return {
    workerId: worker.id,
    workerName: worker.name,
    categoryCode: worker.categoryCode,
    startLocationText: baseObj ? baseObj.code : `База (${worker.baseId})`,
    distanceMeters: Math.round(totalDistanceMeters),
    vehicle: worker.vehicle,
    vehicleLabel: isVehicle ? (hasTunnel ? '🏎️ Шаттл тоннеля' : '🚘 Спецавтомобиль') : '🚶 Пешком',
    etaMinutes,
    waypoints
  };
}

// 5. Find Nearest Free Worker of Specific Category
export function findNearestFreeWorkerOfCategory(
  catCode: CategoryCode,
  targetStand: Stand,
  allWorkers: Worker[],
  alreadySelectedWorkerIds: Set<string>
): TaskCrewMember | null {
  const eligibleWorkers = allWorkers.filter(w => {
    if (alreadySelectedWorkerIds.has(w.id)) return false;
    if (w.status !== 'FREE_STATIONARY' && w.status !== 'FREE_PATROLLING') return false;

    if (catCode === 'A') return true; // Cat A can be done by B1, B2, or A
    return w.categoryCode === catCode;
  });

  if (eligibleWorkers.length === 0) return null;

  let bestMember: TaskCrewMember | null = null;
  let minEta = Infinity;

  for (const worker of eligibleWorkers) {
    const memberCandidate = calculateWorkerToStandEta(worker, targetStand);
    if (memberCandidate.etaMinutes < minEta) {
      minEta = memberCandidate.etaMinutes;
      bestMember = memberCandidate;
    }
  }

  return bestMember;
}

// 6. Calculate Maximum Crew ETA
export function calculateCrewMaxEta(crew: TaskCrewMember[], slaLimitMinutes: number = 15.0) {
  if (crew.length === 0) return { maxEtaMinutes: 0, withinSla: true };
  const maxEtaMinutes = Math.max(...crew.map(c => c.etaMinutes));
  return {
    maxEtaMinutes,
    withinSla: maxEtaMinutes <= slaLimitMinutes
  };
}

// 7. Generate Shift Personnel with Custom Counts & Vivid Apron Patrol
export function generateShiftWorkersWithCustomCounts(
  b1Count: number = 22,
  b2Count: number = 12,
  catACount: number = 6,
  vehiclesCount: number = 20
): Worker[] {
  const workers: Worker[] = [];
  let nameIdx = 0;
  let vehicleAllocated = 0;

  const bases = SVO_FACILITIES;
  const roadWaypoints = SVO_NODES.filter(n => n.type === 'WAYPOINT').map(n => n.id);

  const createWorkerBatch = (count: number, cat: Category, code: CategoryCode) => {
    for (let i = 0; i < count; i++) {
      const baseObj = bases[(workers.length) % bases.length];
      const hasVehicle = vehicleAllocated < vehiclesCount;
      if (hasVehicle) vehicleAllocated++;

      const isPatrolling = i % 2 === 1;
      let waypoints: { x: number; y: number }[] | undefined = undefined;

      if (isPatrolling && roadWaypoints.length > 0) {
        const startNodeId = getClosestNodeId(baseObj.x, baseObj.y);
        const randomTargetId = roadWaypoints[Math.floor(Math.random() * roadWaypoints.length)];
        const nodePath = findDijkstraShortestPath(startNodeId, randomTargetId);
        waypoints = getWaypointsForNodePath({ x: baseObj.x, y: baseObj.y }, nodePath);
      }

      workers.push({
        id: `WRK-${String(workers.length + 1).padStart(3, '0')}`,
        name: TECHNICIAN_NAMES[nameIdx % TECHNICIAN_NAMES.length] + (nameIdx >= TECHNICIAN_NAMES.length ? ` ${Math.floor(nameIdx / TECHNICIAN_NAMES.length) + 1}` : ''),
        category: cat,
        categoryCode: code,
        status: isPatrolling ? 'FREE_PATROLLING' : 'FREE_STATIONARY',
        baseId: baseObj.id,
        x: baseObj.x,
        y: baseObj.y,
        vehicle: hasVehicle ? 'APRON_VEHICLE' : 'PEDESTRIAN',
        pathWaypoints: waypoints,
        currentSegmentIndex: 0
      });
      nameIdx++;
    }
  };

  createWorkerBatch(b1Count, 'ENGINES_AIRFRAME', 'B1');
  createWorkerBatch(b2Count, 'AVIONICS', 'B2');
  createWorkerBatch(catACount, 'GENERAL_MECHANIC', 'A');

  return workers;
}
