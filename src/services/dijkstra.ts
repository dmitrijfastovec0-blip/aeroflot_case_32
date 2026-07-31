import { Worker, Stand, CategoryCode, TaskCrewMember, Category, WorkerStatus } from '../types/index';
import { SVO_NODES, SVO_EDGES, SVO_FACILITIES, SVO_STANDS, TECHNICIAN_NAMES } from '../constants/index';

// ============================================================================
// OPTIMIZED ROUTING ENGINE
// ----------------------------------------------------------------------------
// The road graph is static and tiny (25 apron nodes + 4 duty stations, 33 edges),
// so instead of re-running Dijkstra (O(V^2) with a linear-scan priority queue)
// for EVERY worker->stand query, we precompute ALL-PAIRS shortest paths ONCE at
// module load using Dijkstra with a binary min-heap from each vertex.
// Then every ETA/distance/path lookup is O(1)/O(path length).
// ============================================================================

const NODE_COORD: Record<string, { x: number; y: number }> = {};
const GRAPH_VERTEX_IDS: string[] = [];
const GRAPH_INDEX: Record<string, number> = {};
const GRAPH_ADJ: { to: number; distance: number; isTunnel: boolean }[][] = [];
const TUNNEL_EDGE: Set<string> = new Set();

// Coordinates for an id that may be a node or a facility
const coordFor = (id: string): { x: number; y: number } => {
  const node = SVO_NODES.find(n => n.id === id);
  if (node) return { x: node.x, y: node.y };
  const fac = SVO_FACILITIES.find(f => f.id === id);
  if (fac) return { x: fac.x, y: fac.y };
  return { x: SVO_NODES[0].x, y: SVO_NODES[0].y };
};

// Build the vertex set: nodes + facilities (+ any stray edge endpoints)
{
  const seen = new Set<string>();
  const pushVertex = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const c = coordFor(id);
    NODE_COORD[id] = { x: c.x, y: c.y };
    GRAPH_INDEX[id] = GRAPH_VERTEX_IDS.length;
    GRAPH_VERTEX_IDS.push(id);
  };
  SVO_NODES.forEach(n => pushVertex(n.id));
  SVO_FACILITIES.forEach(f => pushVertex(f.id));
  SVO_EDGES.forEach(e => {
    pushVertex(e.from);
    pushVertex(e.to);
  });
  GRAPH_VERTEX_IDS.forEach(() => GRAPH_ADJ.push([]));
  SVO_EDGES.forEach(e => {
    const u = GRAPH_INDEX[e.from];
    const v = GRAPH_INDEX[e.to];
    if (u === undefined || v === undefined) return;
    const isTunnel = e.type === 'TUNNEL';
    if (isTunnel) {
      TUNNEL_EDGE.add(`${u}|${v}`);
      TUNNEL_EDGE.add(`${v}|${u}`);
    }
    GRAPH_ADJ[u].push({ to: v, distance: e.distance, isTunnel });
    GRAPH_ADJ[v].push({ to: u, distance: e.distance, isTunnel });
  });
}

// Binary min-heap keyed by an external distance array (Dijkstra priority queue)
class MinHeap {
  private items: number[] = [];
  private key: (i: number) => number;
  constructor(key: (i: number) => number) { this.key = key; }
  get size(): number { return this.items.length; }
  push(v: number): void {
    const a = this.items;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.key(a[p]) <= this.key(a[i])) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number | undefined {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.key(a[l]) < this.key(a[m])) m = l;
        if (r < a.length && this.key(a[r]) < this.key(a[m])) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

const N = GRAPH_VERTEX_IDS.length;

// ALL_PAIRS_DIST[s][t]  = shortest distance from vertex s to vertex t
// ALL_PAIRS_NEXT[s][t]  = predecessor index of t on the shortest path from s
const ALL_PAIRS_DIST: number[][] = new Array(N);
const ALL_PAIRS_NEXT: number[][] = new Array(N);

for (let s = 0; s < N; s++) {
  const dist = new Array<number>(N).fill(Infinity);
  const next = new Array<number>(N).fill(-1);
  dist[s] = 0;
  const heap = new MinHeap(i => dist[i]);
  heap.push(s);
  while (heap.size > 0) {
    const u = heap.pop()!;
    const du = dist[u];
    for (const e of GRAPH_ADJ[u]) {
      const alt = du + e.distance;
      if (alt < dist[e.to]) {
        dist[e.to] = alt;
        next[e.to] = u;
        heap.push(e.to);
      }
    }
  }
  ALL_PAIRS_DIST[s] = dist;
  ALL_PAIRS_NEXT[s] = next;
}

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

// Resolve any id (node / facility / stand / unknown) to a graph vertex index
const resolveVertexIndex = (id: string): number => {
  const direct = GRAPH_INDEX[id];
  if (direct !== undefined) return direct;
  return GRAPH_INDEX[getClosestNodeId(coordFor(id).x, coordFor(id).y)];
};

// Internal: O(1) distance + O(path length) tunnel detection + node path
const routeBetween = (startNodeId: string, endId: string) => {
  const s = resolveVertexIndex(startNodeId);
  const t = resolveVertexIndex(endId);
  const nodePath: string[] = [GRAPH_VERTEX_IDS[t]];
  let distanceMeters = 0;
  let hasTunnel = false;

  let cur = t;
  while (cur !== s) {
    const pred = ALL_PAIRS_NEXT[s][cur];
    if (pred === -1) {
      // Graph is connected in practice; guard for safety
      distanceMeters = Infinity;
      break;
    }
    if (TUNNEL_EDGE.has(`${pred}|${cur}`)) hasTunnel = true;
    nodePath.push(GRAPH_VERTEX_IDS[pred]);
    cur = pred;
  }

  nodePath.reverse();
  if (nodePath[0] !== startNodeId) nodePath.unshift(startNodeId);
  if (nodePath[nodePath.length - 1] !== endId) nodePath.push(endId);

  if (distanceMeters !== Infinity) {
    let acc = 0;
    for (let i = 0; i < nodePath.length - 1; i++) {
      const edge = SVO_EDGES.find(
        e => (e.from === nodePath[i] && e.to === nodePath[i + 1]) || (e.from === nodePath[i + 1] && e.to === nodePath[i])
      );
      acc += edge ? edge.distance : 300;
    }
    distanceMeters = acc;
  }

  return { nodePath, distanceMeters, hasTunnel };
};

// 2. Shortest Path Finder (O(1) lookup + path reconstruction from precomputed tables)
export function findDijkstraShortestPath(startNodeId: string, endNodeId: string): string[] {
  if (startNodeId === endNodeId) return [startNodeId, endNodeId];
  return routeBetween(startNodeId, endNodeId).nodePath;
}

// 3. Convert Node Path to Percentage Waypoints (O(path) with precomputed coords)
export function getWaypointsForNodePath(startPoint: { x: number; y: number }, nodePath: string[]): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [startPoint];

  for (const nodeId of nodePath) {
    const coord = NODE_COORD[nodeId];
    if (coord) points.push({ x: coord.x, y: coord.y });
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
  const { nodePath, distanceMeters, hasTunnel } = routeBetween(startNodeId, stand.id);

  const isVehicle = worker.vehicle === 'APRON_VEHICLE';
  const speedKmH = isVehicle ? (hasTunnel ? 35 : 20) : 4.5;
  const speedMetersPerMin = (speedKmH * 1000) / 60;

  const penaltyMinutes = isVehicle ? (hasTunnel ? 2.0 : 1.0) : 0;
  const travelMinutes = distanceMeters / speedMetersPerMin;
  const etaMinutes = Math.max(1.0, Math.round((travelMinutes + penaltyMinutes) * 10) / 10);

  const waypoints = getWaypointsForNodePath({ x: worker.x, y: worker.y }, nodePath);
  const baseObj = SVO_FACILITIES.find(f => f.id === worker.baseId);

  return {
    workerId: worker.id,
    workerName: worker.name,
    categoryCode: worker.categoryCode,
    startLocationText: baseObj ? baseObj.code : `База (${worker.baseId})`,
    distanceMeters: Math.round(distanceMeters),
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

// 6.1. Candidate list for a category (for "system vs intuitive" comparison & workload display)
export interface DispatchCandidate {
  workerId: string;
  workerName: string;
  categoryCode: CategoryCode;
  status: WorkerStatus;
  etaMinutes: number;
  vehicleLabel: string;
  startLocationText: string;
  isAvailable: boolean;
  load: number;
}

export function getCategoryCandidates(
  catCode: CategoryCode,
  targetStand: Stand,
  allWorkers: Worker[],
  busyIds?: Set<string>,
  loadMap?: Record<string, number>
): DispatchCandidate[] {
  const matches = (w: Worker) =>
    catCode === 'A' || w.categoryCode === catCode;

  const candidates: DispatchCandidate[] = allWorkers
    .filter(matches)
    .map(w => {
      const isAvailable = !busyIds?.has(w.id);
      const member = isAvailable ? calculateWorkerToStandEta(w, targetStand) : null;
      return {
        workerId: w.id,
        workerName: w.name,
        categoryCode: w.categoryCode,
        status: w.status,
        etaMinutes: member ? member.etaMinutes : 0,
        vehicleLabel: member ? member.vehicleLabel : w.vehicle === 'APRON_VEHICLE' ? '🚘 Спецавтомобиль' : '🚶 Пешком',
        startLocationText: member ? member.startLocationText : (SVO_FACILITIES.find(f => f.id === w.baseId)?.code ?? `База (${w.baseId})`),
        isAvailable,
        load: loadMap?.[w.id] || 0
      };
    });

  // Available candidates first, sorted by ETA; busy ones after
  return candidates.sort((a, b) => {
    if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
    if (a.isAvailable) return a.etaMinutes - b.etaMinutes;
    return a.workerId.localeCompare(b.workerId);
  });
}

// 6.2. "Intuitive" dispatcher pick: nearest by straight-line distance (paper data),
// ignoring the real road network. Used to prove the system beats the naive choice.
export function findNaiveNearestWorkerOfCategory(
  catCode: CategoryCode,
  targetStand: Stand,
  allWorkers: Worker[],
  busyIds?: Set<string>
): TaskCrewMember | null {
  const matches = (w: Worker) =>
    catCode === 'A' || w.categoryCode === catCode;

  let bestMember: TaskCrewMember | null = null;
  let bestStraightDist = Infinity;

  for (const worker of allWorkers) {
    if (!matches(worker)) continue;
    if (busyIds?.has(worker.id)) continue;
    if (worker.status !== 'FREE_STATIONARY' && worker.status !== 'FREE_PATROLLING') continue;

    const dx = worker.x - targetStand.x;
    const dy = worker.y - targetStand.y;
    const straightDist = Math.hypot(dx, dy);

    if (straightDist < bestStraightDist) {
      bestStraightDist = straightDist;
      bestMember = calculateWorkerToStandEta(worker, targetStand);
    }
  }

  return bestMember;
}

// Duty posts per base: stationary workers stand guard at the stands of their zone,
// so even the far apron corners (St-101/102/105, St-201/204, F45, E38) never empty out.
const BASE_POSTS: Record<string, string[]> = {
  'PTO_1': ['STAND_B10', 'STAND_B12', 'STAND_B14', 'STAND_C21', 'STAND_C25', 'STAND_C27'],
  'AK_4': ['STAND_101', 'STAND_102', 'STAND_105'],
  'PTO_2': ['STAND_D12', 'STAND_D14', 'STAND_D18', 'STAND_D24', 'STAND_E38', 'STAND_F45'],
  'AK_1': ['STAND_201', 'STAND_204', 'STAND_F45']
};

// Patrol targets cover the whole apron: roads AND remote stands, so patrolling
// crews regularly show up at the far corners instead of hugging the center.
export const PATROL_TARGET_IDS = [
  ...SVO_NODES.filter(n => n.type === 'WAYPOINT').map(n => n.id),
  ...SVO_STANDS.map(s => s.id)
];

// 7. Generate Shift Personnel with Custom Counts & Vivid Apron Patrol
export function generateShiftWorkersWithCustomCounts(
  b1Count: number = 22,
  b2Count: number = 12,
  catACount: number = 6,
  vehiclesCount: number = 20
): Worker[] {
  const workers: Worker[] = [];
  let nameIdx = 0;

  const bases = SVO_FACILITIES;

  // Global flow of all workers (categories in order: B1, B2, A). Stationary and
  // patrolling halves round-robin over the bases with INDEPENDENT counters, so
  // every base gets exactly the same headcount with a mix of standing + patrol,
  // and the far-corner bases AK-4 / AK-1 never end up empty or patrol-only.
  const total = b1Count + b2Count + catACount;
  const stationCount = Math.ceil(total / 2);
  const stationVehicles = Math.ceil(vehiclesCount / 2);
  let stationIdx = 0;
  let patrolIdx = 0;
  let vehicleAllocated = 0;
  const stationPerBase: Record<string, number> = {};

  for (let g = 0; g < total; g++) {
    const isPatrolling = g % 2 === 1;
    const cat: Category = g < b1Count ? 'ENGINES_AIRFRAME' : g < b1Count + b2Count ? 'AVIONICS' : 'GENERAL_MECHANIC';
    const code: CategoryCode = cat === 'ENGINES_AIRFRAME' ? 'B1' : cat === 'AVIONICS' ? 'B2' : 'A';

    const rr = isPatrolling ? patrolIdx++ : stationIdx++;
    const baseObj = bases[rr % bases.length];

    const hasVehicle = isPatrolling
      ? vehicleAllocated >= stationVehicles && vehicleAllocated < vehiclesCount
      : vehicleAllocated < stationVehicles;
    if (hasVehicle) vehicleAllocated++;

    // Stationary worker of this base mans the zone duty post (a nearby stand),
    // so remote stands always have technicians present.
    const posts = BASE_POSTS[baseObj.id] || [];
    const dutyStandId = isPatrolling
      ? undefined
      : (posts.length > 0
        ? posts[(stationPerBase[baseObj.id] = (stationPerBase[baseObj.id] || 0) + 1) % posts.length]
        : undefined);
    const dutyStand = dutyStandId ? SVO_STANDS.find(s => s.id === dutyStandId) : undefined;
    const startX = dutyStand ? dutyStand.x : baseObj.x;
    const startY = dutyStand ? dutyStand.y : baseObj.y;

    let waypoints: { x: number; y: number }[] | undefined = undefined;

    if (isPatrolling) {
      const startNodeId = getClosestNodeId(startX, startY);
      const randomTargetId = PATROL_TARGET_IDS[Math.floor(Math.random() * PATROL_TARGET_IDS.length)];
      const nodePath = findDijkstraShortestPath(startNodeId, randomTargetId);
      waypoints = getWaypointsForNodePath({ x: startX, y: startY }, nodePath);
    }

    workers.push({
      id: `WRK-${String(workers.length + 1).padStart(3, '0')}`,
      name: TECHNICIAN_NAMES[nameIdx % TECHNICIAN_NAMES.length] + (nameIdx >= TECHNICIAN_NAMES.length ? ` ${Math.floor(nameIdx / TECHNICIAN_NAMES.length) + 1}` : ''),
      category: cat,
      categoryCode: code,
      status: isPatrolling ? 'FREE_PATROLLING' : 'FREE_STATIONARY',
      baseId: baseObj.id,
      dutyStandId,
      isPatrolPreference: isPatrolling,
      x: startX,
      y: startY,
      vehicle: hasVehicle ? 'APRON_VEHICLE' : 'PEDESTRIAN',
      pathWaypoints: waypoints,
      currentSegmentIndex: 0
    });
    nameIdx++;
  }

  return workers;
}
