import { Stand, Facility, Worker, TaskCrewMember, AirportElement, AirportConnection, CategoryCode } from '../types/index';
import { SVO_FACILITIES, REAL_SVO_FACILITIES } from '../constants/index';
import { getWeatherSpeeds } from './dijkstra';

export interface RouteResult {
  points: { x: number; y: number }[];
  waypoints: { x: number; y: number }[];
  distanceMeters: number;
  reachable: boolean;
}

// Metric coordinate scaling: canvas is 100% x 100% representing 4000m x 2800m
export const distBetweenMeters = (p1: { x: number; y: number }, p2: { x: number; y: number }) =>
  Math.hypot((p2.x - p1.x) * 40, (p2.y - p1.y) * 28);

/**
 * Extracts stand list from custom elements
 */
export function extractCustomStands(elements: AirportElement[]): Stand[] {
  return elements
    .filter(e => e.kind === 'STAND')
    .map(e => ({
      id: e.id,
      label: e.label || e.id.replace('CUST-ST-', ''),
      complex: e.complex || (e.y < 45 ? 'NORTH' : 'SOUTH'),
      x: e.x,
      y: e.y,
      aircraftType: e.aircraftType || 'Airbus A320-200',
      airline: 'Испытательный авиапарк',
      status: 'IDLE'
    }));
}

/**
 * Extracts facility bases (PTO, Hangar, Parking) from custom elements.
 * Passenger terminals are excluded so personnel only spawn at operational bases.
 */
export function extractCustomFacilities(elements: AirportElement[]): Facility[] {
  const facs = elements.filter(e =>
    e.kind === 'DUTY_STATION' || e.kind === 'HANGAR' || e.kind === 'PARKING'
  );

  if (facs.length > 0) {
    return facs.map(e => ({
      id: e.id,
      name: e.label,
      code: e.code || (e.kind === 'DUTY_STATION' ? 'ПТО' : e.kind === 'HANGAR' ? 'АК' : '🅿️'),
      complex: e.complex || (e.y < 45 ? 'NORTH' : 'SOUTH'),
      x: e.x,
      y: e.y,
      type: e.kind === 'HANGAR' ? 'HANGAR_BASE' : 'DUTY_STATION'
    }));
  }

  const stands = elements.filter(e => e.kind === 'STAND');
  if (stands.length > 0) {
    return [{
      id: 'BASE_CUSTOM_AUTO',
      name: 'Дежурный пункт перрона',
      code: 'ПТО',
      complex: 'NORTH',
      x: stands[0].x,
      y: stands[0].y,
      type: 'DUTY_STATION'
    }];
  }

  if (elements.length > 0) {
    const first = elements[0];
    return [{
      id: 'BASE_CUSTOM_MAIN',
      name: 'Главный пункт полигона',
      code: 'ПТО-1',
      complex: 'NORTH',
      x: first.x,
      y: first.y,
      type: 'DUTY_STATION'
    }];
  }

  return REAL_SVO_FACILITIES;
}

interface Point2D {
  x: number;
  y: number;
  id?: string;
}

// Compute projection of point P onto segment AB (returns closest point on segment and distance)
function projectPointOnSegment(p: Point2D, a: Point2D, b: Point2D): { point: Point2D; distMeters: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq < 1e-6) {
    return { point: { x: a.x, y: a.y }, distMeters: distBetweenMeters(p, a), t: 0 };
  }

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  return { point: proj, distMeters: distBetweenMeters(p, proj), t };
}

// Compute line segment intersection between AB and CD
function getSegmentIntersection(a: Point2D, b: Point2D, c: Point2D, d: Point2D): Point2D | null {
  const denom = (d.y - c.y) * (b.x - a.x) - (d.x - c.x) * (b.y - a.y);
  if (Math.abs(denom) < 1e-6) return null; // parallel

  const ua = ((d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x)) / denom;
  const ub = ((b.x - a.x) * (a.y - c.y) - (b.y - a.y) * (a.x - c.x)) / denom;

  if (ua >= 0.02 && ua <= 0.98 && ub >= 0.02 && ub <= 0.98) {
    return {
      x: a.x + ua * (b.x - a.x),
      y: a.y + ua * (b.y - a.y)
    };
  }
  return null;
}

/**
 * Builds a 100% interconnected, topologically accurate road graph.
 * Segments are split at intersections, vertices are merged at junctions,
 * and all facilities are linked to the closest road segments.
 */
function buildCompleteAirfieldGraph(elements: AirportElement[], connections: AirportConnection[]) {
  // 1. Collect all raw road segments
  const rawSegments: { p1: Point2D; p2: Point2D }[] = [];

  connections.forEach(conn => {
    const routePts: Point2D[] = conn.points && conn.points.length >= 2
      ? conn.points
      : (conn.from && conn.to
          ? (() => {
              const from = elements.find(e => e.id === conn.from);
              const to = elements.find(e => e.id === conn.to);
              return from && to ? [{ x: from.x, y: from.y }, { x: to.x, y: to.y }] : [];
            })()
          : []);

    for (let i = 0; i < routePts.length - 1; i++) {
      const a = routePts[i];
      const b = routePts[i + 1];
      if (Math.hypot(b.x - a.x, b.y - a.y) > 0.01) {
        rawSegments.push({ p1: { x: a.x, y: a.y }, p2: { x: b.x, y: b.y } });
      }
    }
  });

  // 2. Split crossing segments at intersections
  const segments: { p1: Point2D; p2: Point2D }[] = [...rawSegments];
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 20) {
    changed = false;
    iterations++;
    for (let i = 0; i < segments.length; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        const inter = getSegmentIntersection(segments[i].p1, segments[i].p2, segments[j].p1, segments[j].p2);
        if (inter) {
          const s1 = segments[i];
          const s2 = segments[j];
          segments.splice(j, 1);
          segments.splice(i, 1);

          segments.push({ p1: s1.p1, p2: inter });
          segments.push({ p1: inter, p2: s1.p2 });
          segments.push({ p1: s2.p1, p2: inter });
          segments.push({ p1: inter, p2: s2.p2 });

          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }

  // 3. Build unique vertex list (with 0.4% tolerance)
  const vertices: Point2D[] = [];
  const findOrAddVertex = (pt: Point2D, tol = 0.4): number => {
    for (let i = 0; i < vertices.length; i++) {
      if (Math.hypot(vertices[i].x - pt.x, vertices[i].y - pt.y) <= tol) {
        if (pt.id && !vertices[i].id) vertices[i].id = pt.id;
        return i;
      }
    }
    const idx = vertices.length;
    vertices.push({ x: pt.x, y: pt.y, id: pt.id });
    return idx;
  };

  // Add all element positions into vertex list
  const elemVertexMap = new Map<string, number>();
  elements.forEach(e => {
    const idx = findOrAddVertex({ x: e.x, y: e.y, id: e.id });
    elemVertexMap.set(e.id, idx);
  });

  const edges: { u: number; v: number; dist: number }[] = [];
  const edgeSet = new Set<string>();
  const addEdge = (u: number, v: number) => {
    if (u === v) return;
    const key = u < v ? `${u}_${v}` : `${v}_${u}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      const d = Math.max(1, distBetweenMeters(vertices[u], vertices[v]));
      edges.push({ u, v, dist: d });
    }
  };

  segments.forEach(seg => {
    const u = findOrAddVertex(seg.p1);
    const v = findOrAddVertex(seg.p2);
    addEdge(u, v);
  });

  // Build adjacency list
  const adj: { to: number; dist: number }[][] = Array.from({ length: vertices.length }, () => []);
  edges.forEach(e => {
    adj[e.u].push({ to: e.v, dist: e.dist });
    adj[e.v].push({ to: e.u, dist: e.dist });
  });

  return { vertices, edges, adj };
}

type Graph = ReturnType<typeof buildCompleteAirfieldGraph>;

// Attach a moving endpoint to an existing road segment without inventing a
// shortcut. The returned point is always on an explicitly drawn segment.
function attachPointToGraph(point: Point2D, graph: Graph): number {
  let nearestVertex = -1;
  let nearestVertexDistance = Infinity;
  graph.vertices.forEach((vertex, index) => {
    const distance = distBetweenMeters(point, vertex);
    if (distance < nearestVertexDistance) {
      nearestVertexDistance = distance;
      nearestVertex = index;
    }
  });

  if (nearestVertex >= 0 && nearestVertexDistance <= 0.5) return nearestVertex;

  let bestProjection: { edge: { u: number; v: number }; point: Point2D; distance: number } | null = null;
  for (const edge of graph.edges) {
    const projection = projectPointOnSegment(point, graph.vertices[edge.u], graph.vertices[edge.v]);
    if (!bestProjection || projection.distMeters < bestProjection.distance) {
      bestProjection = { edge, point: projection.point, distance: projection.distMeters };
    }
  }

  // Never attach a facility to an unrelated road across the polygon.
  if (!bestProjection || bestProjection.distance > 350) return -1;

  const pointIndex = graph.vertices.length;
  graph.vertices.push(bestProjection.point);
  graph.adj.push([]);
  const addAttachedEdge = (to: number) => {
    const distance = distBetweenMeters(bestProjection!.point, graph.vertices[to]);
    graph.adj[pointIndex].push({ to, dist: distance });
    graph.adj[to].push({ to: pointIndex, dist: distance });
  };
  addAttachedEdge(bestProjection.edge.u);
  addAttachedEdge(bestProjection.edge.v);
  return pointIndex;
}

function connectPointsAlongOriginalEdges(graph: Graph): void {
  for (const edge of graph.edges) {
    const a = graph.vertices[edge.u];
    const b = graph.vertices[edge.v];
    const pointsOnEdge = graph.vertices
      .map((point, index) => ({ index, projection: projectPointOnSegment(point, a, b) }))
      .filter(item => item.projection.distMeters <= 0.5)
      .sort((left, right) => left.projection.t - right.projection.t);

    for (let i = 0; i < pointsOnEdge.length - 1; i++) {
      const from = pointsOnEdge[i].index;
      const to = pointsOnEdge[i + 1].index;
      if (from === to) continue;
      const distance = distBetweenMeters(graph.vertices[from], graph.vertices[to]);
      if (!graph.adj[from].some(item => item.to === to)) {
        graph.adj[from].push({ to, dist: distance });
      }
      if (!graph.adj[to].some(item => item.to === from)) {
        graph.adj[to].push({ to: from, dist: distance });
      }
    }
  }
}

/**
 * Dijkstra shortest path routing strictly over the Airfield Graph
 */
export function computeCustomAirfieldRoute(
  start: { x: number; y: number },
  target: { x: number; y: number },
  elements: AirportElement[],
  connections: AirportConnection[]
): RouteResult {
  const directDist = distBetweenMeters(start, target);

  if (elements.length === 0 && connections.length === 0) {
    const pts = [start, target];
    return { points: pts, waypoints: pts, distanceMeters: Math.max(10, directDist), reachable: false };
  }

  const graph = buildCompleteAirfieldGraph(elements, connections);
  const { vertices, adj } = graph;

  if (graph.edges.length === 0) {
    return { points: [], waypoints: [], distanceMeters: Infinity, reachable: false };
  }

  const startNode = attachPointToGraph(start, graph);
  const targetNode = attachPointToGraph(target, graph);
  if (startNode < 0 || targetNode < 0) {
    return { points: [], waypoints: [], distanceMeters: Infinity, reachable: false };
  }
  connectPointsAlongOriginalEdges(graph);

  // Dijkstra Shortest Path Search
  const dist = new Array(vertices.length).fill(Infinity);
  const prev = new Array(vertices.length).fill(-1);
  const visited = new Set<number>();

  dist[startNode] = 0;

  for (let step = 0; step < vertices.length; step++) {
    let u = -1;
    let minU = Infinity;
    for (let i = 0; i < vertices.length; i++) {
      if (!visited.has(i) && dist[i] < minU) {
        minU = dist[i];
        u = i;
      }
    }
    if (u === -1 || minU === Infinity) break;
    if (u === targetNode) break;
    visited.add(u);

    adj[u].forEach(edge => {
      if (!visited.has(edge.to)) {
        const alt = dist[u] + edge.dist;
        if (alt < dist[edge.to]) {
          dist[edge.to] = alt;
          prev[edge.to] = u;
        }
      }
    });
  }

  // Reconstruct graph path
  const graphPath: Point2D[] = [];
  if (dist[targetNode] < Infinity) {
    let curr = targetNode;
    while (curr !== -1) {
      graphPath.unshift({ x: vertices[curr].x, y: vertices[curr].y });
      if (curr === startNode) break;
      curr = prev[curr];
    }
  }

  if (graphPath.length === 0) {
    return { points: [], waypoints: [], distanceMeters: Infinity, reachable: false };
  }

  // The endpoints are projected onto the road graph, so every segment after
  // the initial short approach follows a user-drawn connection.
  const fullPath: { x: number; y: number }[] = [];
  graphPath.forEach(pt => {
    const last = fullPath[fullPath.length - 1];
    if (!last || Math.hypot(last.x - pt.x, last.y - pt.y) > 0.15) {
      fullPath.push({ x: pt.x, y: pt.y });
    }
  });

  const last = fullPath[fullPath.length - 1];

  // Guarantee at least 2 distinct points for linear interpolation
  if (fullPath.length === 1) {
    return { points: fullPath, waypoints: fullPath, distanceMeters: 0, reachable: true };
  }

  // Calculate real distance along the road graph
  let totalDistanceMeters = 0;
  for (let i = 0; i < fullPath.length - 1; i++) {
    totalDistanceMeters += distBetweenMeters(fullPath[i], fullPath[i + 1]);
  }

  return {
    points: fullPath,
    waypoints: fullPath,
    distanceMeters: Math.max(10, totalDistanceMeters),
    reachable: true
  };
}

/**
 * Calculates modular ETA for any worker moving to any target stand
 */
export function calculateModularWorkerEta(
  worker: Worker,
  stand: Stand,
  elements: AirportElement[],
  connections: AirportConnection[]
): TaskCrewMember {
  const ws = getWeatherSpeeds();
  const isVehicle = worker.vehicle === 'APRON_VEHICLE';
  const speedKmH = isVehicle ? ws.vehicleKmH : ws.pedestrianKmH;
  const speedMetersPerMin = (speedKmH * 1000) / 60;

  const route = computeCustomAirfieldRoute({ x: worker.x, y: worker.y }, { x: stand.x, y: stand.y }, elements, connections);
  const travelMin = route.distanceMeters / speedMetersPerMin;
  const penaltyMin = isVehicle ? 0.3 : 0;
  const etaMinutes = Math.max(0.2, Number((travelMin + penaltyMin).toFixed(1)));

  const facs = extractCustomFacilities(elements);
  const facObj = facs.find(f => f.id === worker.baseId);
  const startLoc = facObj ? facObj.code : (worker.dutyStandId ? `Стоянка ${worker.dutyStandId}` : (worker.baseId || 'Полигон'));

  return {
    workerId: worker.id,
    workerName: worker.name,
    categoryCode: worker.categoryCode,
    startLocationText: startLoc,
    distanceMeters: Math.round(route.distanceMeters),
    vehicle: worker.vehicle,
    vehicleLabel: isVehicle ? '🚘 Спецавтомобиль' : '🚶 Пешком',
    etaMinutes,
    waypoints: route.waypoints
  };
}

/**
 * Candidate lookup for categories on custom airfields
 */
export function findNearestFreeCustomWorker(
  catCode: CategoryCode,
  targetStand: Stand,
  allWorkers: Worker[],
  busyWorkerIds: Set<string>,
  elements: AirportElement[],
  connections: AirportConnection[]
): TaskCrewMember | null {
  const eligible = allWorkers.filter(w => {
    if (busyWorkerIds.has(w.id)) return false;
    if (w.status !== 'FREE_STATIONARY' && w.status !== 'FREE_PATROLLING') return false;
    if (catCode === 'A') return true;
    return w.categoryCode === catCode;
  });

  if (eligible.length === 0) return null;

  let best: TaskCrewMember | null = null;
  let minCost = Infinity;

  eligible.forEach(w => {
    const candidate = calculateModularWorkerEta(w, targetStand, elements, connections);
    const isExact = w.categoryCode === catCode;
    const cost = candidate.etaMinutes + (isExact ? 0 : 5.0);
    if (cost < minCost) {
      minCost = cost;
      best = candidate;
    }
  });

  return best;
}

/**
 * Generates local sector inspection patrol waypoints for a worker on a custom airfield
 * Strictly limits targets to nearby stands (distance < 20%) within the worker's home base sector.
 * Excludes tunnels during routine patrol so personnel never cross between sectors without task assignment.
 */
export function getCustomPatrolWaypoints(
  worker: Worker,
  elements: AirportElement[],
  connections: AirportConnection[]
): { x: number; y: number }[] {
  const stands = elements.filter(e => e.kind === 'STAND');
  const baseElem = elements.find(e => e.id === worker.baseId) || { x: worker.x, y: worker.y };

  // Strict local base sector: only stands within 20% distance of the worker's home base
  const localSectorStands = stands
    .map(s => ({ stand: s, distFromBase: Math.hypot(s.x - baseElem.x, s.y - baseElem.y), distFromWorker: Math.hypot(s.x - worker.x, s.y - worker.y) }))
    .filter(s => s.distFromBase <= 22 && s.distFromWorker > 1.5)
    .sort((a, b) => a.distFromWorker - b.distFromWorker)
    .map(s => s.stand);

  const fallbackStands = stands
    .map(s => ({ stand: s, dist: Math.hypot(s.x - baseElem.x, s.y - baseElem.y) }))
    .sort((a, b) => a.dist - b.dist)
    .map(s => s.stand);

  const target = localSectorStands.length > 0
    ? localSectorStands[Math.floor(Math.random() * Math.min(3, localSectorStands.length))]
    : (fallbackStands.length > 0 ? fallbackStands[0] : elements[0]);

  if (!target) return [{ x: worker.x, y: worker.y }, { x: worker.x + 0.1, y: worker.y + 0.1 }];

  // Routine patrol strictly avoids tunnels (no cross-sector migrations)
  const patrolConnections = connections.filter(c => c.kind !== 'TUNNEL');
  if (patrolConnections.length === 0) return [];

  const route = computeCustomAirfieldRoute(
    { x: worker.x, y: worker.y },
    { x: target.x, y: target.y },
    elements,
    patrolConnections
  );
  return route.reachable ? route.waypoints : [];
}

/**
 * Generates return-to-base waypoints for a worker on a custom airfield
 */
export function getCustomReturnToBaseWaypoints(
  worker: Worker,
  elements: AirportElement[],
  connections: AirportConnection[]
): { x: number; y: number }[] {
  let targetX = worker.x;
  let targetY = worker.y;

  if (worker.dutyStandId) {
    const stand = elements.find(e => e.id === worker.dutyStandId);
    if (stand) {
      targetX = stand.x;
      targetY = stand.y;
    }
  } else {
    const facs = extractCustomFacilities(elements);
    const base = facs.find(f => f.id === worker.baseId) || facs[0];
    if (base) {
      targetX = base.x;
      targetY = base.y;
    }
  }

  const route = computeCustomAirfieldRoute({ x: worker.x, y: worker.y }, { x: targetX, y: targetY }, elements, connections);
  return route.reachable ? route.waypoints : [];
}
