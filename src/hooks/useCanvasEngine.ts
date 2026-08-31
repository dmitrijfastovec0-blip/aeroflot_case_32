import { useRef, useEffect, useState, useCallback } from 'react';
import { Worker, OtoTask, HoverTooltipData, ThemeMode, WeatherMode, TaskCrewMember, AirportElement, AirportConnection, AirfieldMode } from '../types/index';
import { SVO_BUILDINGS, SVO_FACILITIES, SVO_STANDS, SVO_NODES, SVO_EDGES, CANVAS_THEMES } from '../constants/index';

// Polyfill for CanvasRenderingContext2D.roundRect (missing in older Safari/Firefox)
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (
    x: number,
    y: number,
    w: number,
    h: number,
    r?: number | number[]
  ): void {
    const radii = Array.isArray(r) ? r : [r ?? 0, r ?? 0, r ?? 0, r ?? 0];
    const [tl, tr, br, bl] = [
      Math.min(radii[0] ?? 0, w / 2, h / 2),
      Math.min(radii[1] ?? radii[0] ?? 0, w / 2, h / 2),
      Math.min(radii[2] ?? radii[0] ?? 0, w / 2, h / 2),
      Math.min(radii[3] ?? radii[0] ?? 0, w / 2, h / 2)
    ];

    this.moveTo(x + tl, y);
    this.lineTo(x + w - tr, y);
    this.arcTo(x + w, y, x + w, y + tr, tr);
    this.lineTo(x + w, y + h - br);
    this.arcTo(x + w, y + h, x + w - br, y + h, br);
    this.lineTo(x + bl, y + h);
    this.arcTo(x, y + h, x + bl, y + h, bl);
    this.lineTo(x, y + tl);
    this.arcTo(x, y, x + tl, y, tl);
    this.closePath();
  };
}

// ============================================================================
// SMOOTH VECTOR HELPERS
// ----------------------------------------------------------------------------
// The map no longer draws raw polylines: building footprints use rounded
// corners (arcTo) and the road graph gets rounded junctions, so the whole
// vector layer looks like a clean CAD drawing instead of a jagged sketch.
// ============================================================================

interface Pos { x: number; y: number }

// Rounded polygon path: walks the outline but rounds every corner with arcTo.
function roundedPolygonPath(ctx: CanvasRenderingContext2D, pts: Pos[], radius: number) {
  const n = pts.length;
  if (n < 3) return;
  const prev = pts[n - 1];
  ctx.moveTo((prev.x + pts[0].x) / 2, (prev.y + pts[0].y) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const next = pts[(i + 1) % n];
    ctx.arcTo(p.x, p.y, next.x, next.y, radius);
  }
  ctx.closePath();
}

// Strokes a full road network as ONE path with rounded junctions: straight
// segments are trimmed at radius from each junction node, and an arc reconnects
// every pair of outgoing roads — so crossings get clean fillets, not spikes.
function buildRoadNetworkPath(
  edges: { from: string; to: string }[],
  getPos: (id: string) => Pos,
  radius: number
): Path2D {
  const path = new Path2D();
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, new Set());
    if (!adj.has(e.to)) adj.set(e.to, new Set());
    adj.get(e.from)!.add(e.to);
    adj.get(e.to)!.add(e.from);
  }

  const drawn = new Set<string>();
  for (const e of edges) {
    const key = e.from < e.to ? e.from + '|' + e.to : e.to + '|' + e.from;
    if (drawn.has(key)) continue;
    drawn.add(key);
    const p1 = getPos(e.from);
    const p2 = getPos(e.to);
    const trim1 = (adj.get(e.from)?.size ?? 1) > 1 ? radius : 0;
    const trim2 = (adj.get(e.to)?.size ?? 1) > 1 ? radius : 0;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len <= trim1 + trim2) continue;
    const ux = dx / len;
    const uy = dy / len;
    path.moveTo(p1.x + ux * trim1, p1.y + uy * trim1);
    path.lineTo(p2.x - ux * trim2, p2.y - uy * trim2);
  }

  for (const [nodeId, neighbors] of adj) {
    const n = neighbors.size;
    if (n < 2) continue;
    const pos = getPos(nodeId);
    const items = [...neighbors].map(id => {
      const p = getPos(id);
      return { a: Math.atan2(p.y - pos.y, p.x - pos.x) };
    });
    items.sort((a, b) => a.a - b.a);
    for (let i = 0; i < n; i++) {
      const a = items[i];
      const b = items[(i + 1) % n];
      let delta = b.a - a.a;
      if (delta < 0) delta += Math.PI * 2;
      if (delta < 0.08 || delta > Math.PI * 1.5) continue;
      path.moveTo(pos.x + Math.cos(a.a) * radius, pos.y + Math.sin(a.a) * radius);
      path.arc(pos.x, pos.y, radius, a.a, b.a, false);
    }
  }

  return path;
}

// ============================================================================
// CLUSTER LAYOUT HELPERS
// ----------------------------------------------------------------------------
// Engineers at a base / stand are packed into a tight hexagonal ring cluster
// (dense, no overlap, no "vertical line" look). Slots are assigned by the
// worker's position inside its group (sorted by id), so clusters stay stable
// and compact, and re-pack smoothly when someone is dispatched.
// ============================================================================

// Ring-packing slot: idx 0 = center, then rings of 6, 12, 18, ...
const ringSlot = (idx: number, spacing: number) => {
  if (idx <= 0) return { x: 0, y: 0 };
  let ring = 1;
  let base = 1;
  while (idx >= base + ring * 6) {
    base += ring * 6;
    ring++;
  }
  const inRing = idx - base;
  const seg = Math.floor(inRing / ring);
  const along = inRing % ring;
  const angle = (seg / 6) * Math.PI * 2 + (along / ring) * (Math.PI / 3) - Math.PI / 2;
  const radius = ring * spacing;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
};

interface ClusterIndexes {
  baseSlotIndex: Map<string, number>;
  siteSlotIndex: Map<string, number>;
}

// Build stable per-group slot indexes for duty workers (by base) and
// on-site workers (by their task), sorted by qualification then ID for
// deterministic, neat, organized military-unit packing.
function buildClusterIndexes(workers: Worker[]): ClusterIndexes {
  const baseGroups = new Map<string, Worker[]>();
  const siteGroups = new Map<string, Worker[]>();

  for (const w of workers) {
    if (w.status === 'FREE_STATIONARY') {
      let g = baseGroups.get(w.baseId);
      if (!g) { g = []; baseGroups.set(w.baseId, g); }
      g.push(w);
    } else if (w.status === 'WORKING_ON_SITE') {
      const key = w.currentTaskId || w.baseId;
      let g = siteGroups.get(key);
      if (!g) { g = []; siteGroups.set(key, g); }
      g.push(w);
    }
  }

  const baseSlotIndex = new Map<string, number>();
  const siteSlotIndex = new Map<string, number>();
  for (const g of baseGroups.values()) {
    g.sort((a, b) => a.categoryCode.localeCompare(b.categoryCode) || a.id.localeCompare(b.id));
    g.forEach((w, i) => baseSlotIndex.set(w.id, i));
  }
  for (const g of siteGroups.values()) {
    g.sort((a, b) => a.categoryCode.localeCompare(b.categoryCode) || a.id.localeCompare(b.id));
    g.forEach((w, i) => siteSlotIndex.set(w.id, i));
  }
  return { baseSlotIndex, siteSlotIndex };
}

// Target render position for a worker (percent units, strictly tracking live physical position)
function workerClusterPos(worker: Worker, hash: number, idx: ClusterIndexes, _customElements: AirportElement[] = []) {
  const anchorX = worker.x;
  const anchorY = worker.y;

  if (worker.status === 'FREE_STATIONARY') {
    const slot = idx.baseSlotIndex.get(worker.id) ?? 0;
    const s = ringSlot(slot, 1.2);
    return { x: anchorX + s.x, y: anchorY + s.y };
  }

  if (worker.status === 'WORKING_ON_SITE') {
    const slot = idx.siteSlotIndex.get(worker.id) ?? 0;
    const s = ringSlot(slot, 1.2);
    return { x: anchorX + s.x, y: anchorY + s.y };
  }

  if (worker.status === 'IN_TRANSIT' || worker.status === 'RETURNING_TO_BASE' || worker.status === 'FREE_PATROLLING') {
    return {
      x: worker.x + ((hash % 3) - 1) * 0.4,
      y: worker.y + ((Math.floor(hash / 3) % 3) - 1) * 0.4
    };
  }

  return { x: anchorX, y: anchorY };
}

interface UseCanvasEngineProps {
  workersRef: React.MutableRefObject<Worker[]>;
  tasksRef: React.MutableRefObject<OtoTask[]>;
  selectedStandId: string | null;
  onSelectStand: (standId: string) => void;
  onOpenStandContext?: (standId: string) => void;
  customElements?: AirportElement[];
  customConnections?: AirportConnection[];
  airfieldMode?: AirfieldMode;
  theme: ThemeMode;
  weatherMode?: WeatherMode;
  isDevMode: boolean;
  onDevPointClick?: (pctX: number, pctY: number) => void;
  showMapSublayer: boolean;
  trackedWorkerId?: string | null;
  onStopTracking?: () => void;
  onSelectWorker?: (worker: Worker) => void;
}

export function useCanvasEngine({
  workersRef,
  tasksRef,
  selectedStandId,
  onSelectStand,
  onOpenStandContext,
  customElements = [],
  customConnections = [],
  airfieldMode = 'SVO',
  theme,
  weatherMode = 'CLEAR',
  isDevMode,
  onDevPointClick,
  showMapSublayer,
  trackedWorkerId,
  onStopTracking,
  onSelectWorker
}: UseCanvasEngineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Cached static road-network geometry: built ONCE (positions are fixed logical
  // coords), stroked 3×/frame with different styles + dash offsets. Avoids
  // rebuilding Map/Set/sort topology on every animation frame (GC churn).
  const roadPathRef = useRef<Path2D | null>(null);

  // Pan & Zoom Matrix
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Hover Tooltip state
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoverTooltip, setHoverTooltip] = useState<HoverTooltipData | null>(null);

  // Smooth-render refs: exponential interpolation so workers glide (no jumping)
  // and zoom/pan ease in beautifully instead of snapping.
  const workerSmoothRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const currentZoomRef = useRef<number>(1);
  const currentPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastFrameTimeRef = useRef<number>(performance.now());

  const LOGICAL_WIDTH = 1000;
  const LOGICAL_HEIGHT = 700;

  const pctToLogical = useCallback((pctX: number, pctY: number) => {
    return {
      x: (pctX / 100) * LOGICAL_WIDTH,
      y: (pctY / 100) * LOGICAL_HEIGHT
    };
  }, []);

  const getNodePos = useCallback((id: string) => {
    const fac = SVO_FACILITIES.find(f => f.id === id);
    if (fac) return pctToLogical(fac.x, fac.y);

    const node = SVO_NODES.find(n => n.id === id);
    if (node) return pctToLogical(node.x, node.y);

    return { x: 0, y: 0 };
  }, [pctToLogical]);

  // Main Render Loop
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const workers = workersRef.current;
    const tasks = tasksRef.current;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Resize the backing store ONLY when it actually changed — assigning
    // canvas.width/height every frame resets the context state and forces a
    // full clear + re-layout, a hidden stutter source at high DPR.
    const targetW = Math.max(1, Math.round(width * dpr));
    const targetH = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const palette = CANVAS_THEMES[theme];

    ctx.save();
    ctx.scale(dpr, dpr);

    // LAYER 1: BACKGROUND LAYER
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, width, height);

    // Frame timing for all animations in this render
    const now = performance.now();
    const dtSec = Math.min(0.1, (now - lastFrameTimeRef.current) / 1000);
    lastFrameTimeRef.current = now;
    const dashOffset = -(now / 26) % 20; // time-based flowing dashes (no React state churn)

    const zs = zoomScale;
    const ps = panOffset;

    ctx.save();
    ctx.translate(ps.x, ps.y);
    ctx.scale(zs, zs);

    // CAD Grid (Ultra subtle backdrop decor)
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= LOGICAL_WIDTH; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, LOGICAL_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y <= LOGICAL_HEIGHT; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(LOGICAL_WIDTH, y);
      ctx.stroke();
    }
    ctx.restore();

    // Draw each dispatched crew member's route strictly as its own independent polyline along the graph
    const selectedTask = tasks.find(t => t.standId === selectedStandId && t.status !== 'COMPLETED');
    if (selectedTask && selectedTask.crew.length > 0) {
      selectedTask.crew.forEach(member => {
        const route = member.waypoints;
        if (route && route.length > 1) {
          ctx.save();
          ctx.strokeStyle = selectedTask.priority === 'AOG' ? '#fb7185' : '#38bdf8';
          ctx.globalAlpha = 0.85;
          ctx.lineWidth = 2.5;
          ctx.setLineDash([7, 5]);
          ctx.beginPath();
          route.forEach((point, index) => {
            const pos = pctToLogical(point.x, point.y);
            if (index === 0) ctx.moveTo(pos.x, pos.y);
            else ctx.lineTo(pos.x, pos.y);
          });
          ctx.stroke();
          ctx.restore();
        }
      });
    }

    const isCustomMode = airfieldMode === 'CUSTOM';

    if (isCustomMode) {
      // 1. CUSTOM CONNECTIONS (Drawn under elements)
      customConnections.forEach(connection => {
        const from = customElements.find(element => element.id === connection.from);
        const to = customElements.find(element => element.id === connection.to);
        const routePoints = connection.points && connection.points.length >= 2
          ? connection.points
          : (from && to ? [{ x: from.x, y: from.y }, { x: to.x, y: to.y }] : []);

        if (routePoints.length < 2) return;
        const logicalPts = routePoints.map(p => pctToLogical(p.x, p.y));

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (connection.kind === 'ROAD') {
          ctx.strokeStyle = theme === 'dark' ? '#334155' : '#64748b';
          ctx.lineWidth = 4;
          ctx.beginPath();
          logicalPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
          ctx.stroke();

          ctx.strokeStyle = theme === 'dark' ? '#94a3b8' : '#e2e8f0';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 6]);
          ctx.lineDashOffset = dashOffset * 0.4;
          ctx.stroke();
        } else if (connection.kind === 'TAXIWAY') {
          ctx.strokeStyle = theme === 'dark' ? '#475569' : '#94a3b8';
          ctx.lineWidth = 5;
          ctx.beginPath();
          logicalPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
          ctx.stroke();

          ctx.strokeStyle = '#eab308';
          ctx.lineWidth = 1.2;
          ctx.setLineDash([6, 6]);
          ctx.stroke();
        } else if (connection.kind === 'TUNNEL') {
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 3.5;
          ctx.setLineDash([8, 4]);
          ctx.lineDashOffset = dashOffset * 0.5;
          ctx.beginPath();
          logicalPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
          ctx.stroke();
        } else { // SERVICE
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          logicalPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
          ctx.stroke();
        }
        ctx.restore();
      });

      // 2. CUSTOM RUNWAYS
      customElements.filter(e => e.kind === 'RUNWAY').forEach(element => {
        const pos = pctToLogical(element.x, element.y);
        const width = (element.width || 32) / 100 * LOGICAL_WIDTH;
        const height = (element.height || 4) / 100 * LOGICAL_HEIGHT;
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.fillStyle = theme === 'dark' ? '#1e293b' : '#94a3b8';
        ctx.strokeStyle = theme === 'dark' ? '#475569' : '#64748b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(-width / 2, -height / 2, width, height, 4);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(-width / 2 + 15, 0);
        ctx.lineTo(width / 2 - 15, 0);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#ffffff';
        for (let i = -3; i <= 3; i++) {
          ctx.fillRect(-width / 2 + 3, i * 2 - 0.7, 6, 1.4);
          ctx.fillRect(width / 2 - 9, i * 2 - 0.7, 6, 1.4);
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = '800 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(element.label, 0, height / 2 + 10);
        ctx.restore();
      });

      // 3. CUSTOM TERMINALS
      customElements.filter(e => e.kind === 'TERMINAL').forEach(element => {
        const pos = pctToLogical(element.x, element.y);
        const width = (element.width || 16) / 100 * LOGICAL_WIDTH;
        const height = (element.height || 10) / 100 * LOGICAL_HEIGHT;
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.fillStyle = theme === 'dark' ? 'rgba(14, 165, 233, 0.15)' : 'rgba(14, 165, 233, 0.12)';
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.roundRect(-width / 2, -height / 2, width, height, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.font = '800 11px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`🏢 ${element.label}`, 0, -2);

        ctx.fillStyle = palette.textSubtle;
        ctx.font = '600 8.5px "JetBrains Mono", monospace';
        ctx.fillText('ТЕРМИНАЛЬНЫЙ КОМПЛЕКС', 0, 10);
        ctx.restore();
      });

      // 4. CUSTOM HANGARS
      customElements.filter(e => e.kind === 'HANGAR').forEach(element => {
        const pos = pctToLogical(element.x, element.y);
        const width = (element.width || 12) / 100 * LOGICAL_WIDTH;
        const height = (element.height || 8) / 100 * LOGICAL_HEIGHT;
        const isHovered = hoveredNodeId === element.id;
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.fillStyle = theme === 'dark' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)';
        ctx.strokeStyle = isHovered ? '#818cf8' : '#6366f1';
        ctx.lineWidth = isHovered ? 2.2 : 1.5;
        ctx.beginPath();
        ctx.roundRect(-width / 2, -height / 2, width, height, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#a5b4fc';
        ctx.font = '800 10px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`🏗️ ${element.label}`, 0, 0);
        ctx.restore();
      });

      // 5. CUSTOM PARKINGS
      customElements.filter(e => e.kind === 'PARKING').forEach(element => {
        const pos = pctToLogical(element.x, element.y);
        const width = (element.width || 10) / 100 * LOGICAL_WIDTH;
        const height = (element.height || 6) / 100 * LOGICAL_HEIGHT;
        const isHovered = hoveredNodeId === element.id;
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.fillStyle = theme === 'dark' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(245, 158, 11, 0.08)';
        ctx.strokeStyle = isHovered ? '#38bdf8' : '#f59e0b';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.roundRect(-width / 2, -height / 2, width, height, 4);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#fbbf24';
        ctx.font = '800 9.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(element.label, 0, 0);
        ctx.restore();
      });

      // 6. CUSTOM DUTY STATIONS
      customElements.filter(e => e.kind === 'DUTY_STATION').forEach(element => {
        const pos = pctToLogical(element.x, element.y);
        const size = 30;
        const isHovered = hoveredNodeId === element.id;
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.fillStyle = palette.bg;
        ctx.strokeStyle = isHovered ? '#238636' : '#d97706';
        ctx.lineWidth = isHovered ? 2.5 : 1.8;
        ctx.beginPath();
        ctx.roundRect(-size / 2, -size / 2, size, size, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isHovered ? '#238636' : '#fbbf24';
        ctx.font = '800 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('ПТО', 0, 0);

        ctx.fillStyle = palette.textSubtle;
        ctx.font = '600 9px "Inter", sans-serif';
        ctx.fillText(element.label, 0, size / 2 + 10);
        ctx.restore();
      });

      // 7. CUSTOM WAYPOINTS
      customElements.filter(e => e.kind === 'WAYPOINT').forEach(element => {
        const pos = pctToLogical(element.x, element.y);
        ctx.save();
        ctx.fillStyle = '#38bdf860';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });

      // 8. CUSTOM STANDS
      customElements.filter(e => e.kind === 'STAND').forEach(stand => {
        const pos = pctToLogical(stand.x, stand.y);
        const realNow = Date.now();
        const isSelected = selectedStandId === stand.id;
        const activeTask = tasks.find(t => (t.status === 'DISPATCHED' || t.status === 'WORKING') && t.standId === stand.id);
        const recentCompletedTask = tasks.find(t => t.status === 'COMPLETED' && t.standId === stand.id && (t as any).completedAtMs && (realNow - (t as any).completedAtMs) < 5000);
        const isTaskActive = !!activeTask;
        const isHovered = hoveredNodeId === stand.id;

        ctx.save();
        const boxW = 58;
        const boxH = 36;
        const boxX = pos.x - boxW / 2;
        const boxY = pos.y - boxH / 2;

        let borderColor = palette.standBorder;
        let bgColor = palette.standBg;

        if (isHovered) {
          borderColor = '#238636';
          bgColor = '#23863625';
        } else if (isSelected) {
          borderColor = '#38bdf8';
          bgColor = '#38bdf825';
        } else if (recentCompletedTask) {
          borderColor = '#22c55e';
          bgColor = '#22c55e30';
        } else if (isTaskActive) {
          borderColor = activeTask?.status === 'WORKING' ? '#22c55e' : '#f59e0b';
          bgColor = activeTask?.status === 'WORKING' ? '#22c55e25' : '#f59e0b25';
        }

        if (isSelected || isTaskActive || isHovered) {
          const pulse = 3 + Math.sin(now / 180) * 1.8;
          ctx.strokeStyle = isSelected ? '#38bdf8' : (activeTask?.status === 'WORKING' || recentCompletedTask) ? '#22c55e' : isTaskActive ? '#f59e0b' : '#238636';
          ctx.globalAlpha = 0.3;
          ctx.lineWidth = 1.2;
          ctx.setLineDash([2, 4]);
          ctx.lineDashOffset = dashOffset;
          ctx.beginPath();
          ctx.roundRect(boxX - pulse, boxY - pulse, boxW + pulse * 2, boxH + pulse * 2, 7);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }

        ctx.fillStyle = bgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = isSelected || isHovered || isTaskActive ? 2.2 : 1.1;

        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isSelected ? '#38bdf8' : isHovered ? '#238636' : palette.standText;
        ctx.font = '800 11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(stand.label, pos.x, pos.y - 6);

        ctx.fillStyle = '#64748b';
        ctx.font = '600 8px "Inter", sans-serif';
        ctx.fillText(stand.aircraftType || 'Airbus A320', pos.x, pos.y + 6);

        if (isTaskActive) {
          const isWorking = activeTask?.status === 'WORKING';
          ctx.fillStyle = isWorking ? '#22c55e' : '#f59e0b';
          ctx.beginPath();
          ctx.arc(boxX + boxW - 6, boxY + 6, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      });
    } else {
      // SVO BASELINE BUILDINGS & ROADS
      SVO_BUILDINGS.forEach(bld => {
        ctx.save();
        if (bld.type === 'ARC' && bld.center && bld.radius) {
          const centerPos = pctToLogical(bld.center.x, bld.center.y);
          const radLogical = (bld.radius / 100) * LOGICAL_WIDTH;

          ctx.fillStyle = palette.terminalFill;
          ctx.strokeStyle = palette.terminalStroke;
          ctx.lineWidth = 0.8;
          ctx.globalAlpha = 0.35;

          ctx.beginPath();
          ctx.arc(centerPos.x, centerPos.y, radLogical, bld.startAngle, bld.endAngle);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.globalAlpha = 0.25;
          ctx.fillStyle = palette.textSubtle;
          ctx.font = '500 11px "Inter", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(bld.name, centerPos.x, centerPos.y - radLogical * 0.3);
        } else if (bld.points && bld.points.length >= 2) {
          const isRunway = bld.id.startsWith('RWY');

          if (isRunway) {
            const p1 = pctToLogical(bld.points[0].x, bld.points[0].y);
            const p2 = pctToLogical(bld.points[1].x, bld.points[1].y);
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;

            ctx.globalAlpha = 0.2;

            ctx.strokeStyle = palette.runwayFill;
            ctx.lineCap = 'round';
            ctx.lineWidth = 10;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();

            ctx.strokeStyle = palette.runwayLine;
            ctx.lineWidth = 1.0;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            ctx.setLineDash([]);
          } else {
            ctx.fillStyle = palette.terminalFill;
            ctx.strokeStyle = palette.terminalStroke;
            ctx.lineWidth = 0.8;
            ctx.globalAlpha = 0.35;

            ctx.beginPath();
            const logicalPts = bld.points.map(p => pctToLogical(p.x, p.y));
            roundedPolygonPath(ctx, logicalPts, 3.2);
            ctx.fill();
            ctx.stroke();

            const avgX = bld.points.reduce((acc, p) => acc + p.x, 0) / bld.points.length;
            const avgY = bld.points.reduce((acc, p) => acc + p.y, 0) / bld.points.length;
            const labelPos = pctToLogical(avgX, avgY);

            ctx.globalAlpha = 0.25;
            ctx.fillStyle = palette.textSubtle;
            ctx.font = '500 11px "Inter", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(bld.name, labelPos.x, labelPos.y);
          }
        }
        ctx.restore();
      });

      // ROAD TOPOLOGY GRAPH — Clean, bright default road network
      const roadEdges = SVO_EDGES.filter(e => e.type !== 'TUNNEL');
      const cornerRadius = 7;

      if (!roadPathRef.current) {
        roadPathRef.current = buildRoadNetworkPath(roadEdges, getNodePos, cornerRadius);
      }
      const roadPath = roadPathRef.current;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.strokeStyle = palette.roadLine;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 3.2;
      ctx.stroke(roadPath);

      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = palette.grid;
      ctx.lineWidth = 1.0;
      ctx.stroke(roadPath);

      ctx.strokeStyle = palette.textSubtle;
      ctx.globalAlpha = theme === 'dark' ? 0.35 : 0.45;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 18]);
      ctx.lineDashOffset = dashOffset * 0.5;
      ctx.stroke(roadPath);
      ctx.setLineDash([]);
      ctx.restore();

      // Glowing animated tunnel
      SVO_EDGES.filter(e => e.type === 'TUNNEL').forEach(edge => {
        const p1 = getNodePos(edge.from);
        const p2 = getNodePos(edge.to);

        ctx.save();
        ctx.lineCap = 'round';

        ctx.strokeStyle = palette.tunnelLine;
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.strokeStyle = palette.tunnelLine;
        ctx.lineWidth = 2.2;
        ctx.setLineDash([10, 8]);
        ctx.lineDashOffset = dashOffset;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.restore();
      });

      // SVO Facilities
      SVO_FACILITIES.forEach(fac => {
        const pos = pctToLogical(fac.x, fac.y);
        const isHovered = hoveredNodeId === fac.id;

        if (fac.type === 'PARKING') {
          ctx.save();
          const pW = 60;
          const pH = 26;
          const pX = pos.x - pW / 2;
          const pY = pos.y - pH / 2;

          ctx.fillStyle = theme === 'dark' ? '#0b131f' : '#e2e8f0';
          ctx.strokeStyle = isHovered ? '#38bdf8' : '#f59e0b';
          ctx.lineWidth = isHovered ? 1.8 : 1.2;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.roundRect(pX, pY, pW, pH, 5);
          ctx.fill();
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = isHovered ? '#38bdf8' : '#f59e0b';
          ctx.font = '800 8.5px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(fac.code, pos.x, pos.y - pH / 2 - 6);

          for (let i = 0; i < 3; i++) {
            const carX = pX + 10 + i * 20;
            const carY = pos.y;
            ctx.fillStyle = theme === 'dark' ? '#1e293b' : '#ffffff';
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(carX - 7, carY - 5, 14, 10, 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#38bdf860';
            ctx.fillRect(carX + 2, carY - 3, 3, 6);

            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.arc(carX - 2, carY, 1.5, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.restore();
          return;
        }

        ctx.save();
        const size = 28;

        ctx.fillStyle = palette.bg;
        ctx.strokeStyle = isHovered ? '#238636' : palette.facilityBorder;
        ctx.lineWidth = isHovered ? 2.5 : 1.5;

        ctx.beginPath();
        ctx.roundRect(pos.x - size / 2, pos.y - size / 2, size, size, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isHovered ? '#238636' : palette.facilityText;
        ctx.font = '700 10.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(fac.code, pos.x, pos.y);

        ctx.fillStyle = palette.textSubtle;
        ctx.font = '600 10px "Inter", sans-serif';
        ctx.fillText(fac.name, pos.x, pos.y + 22);

        ctx.restore();
      });

      // SVO Stands
      SVO_NODES.filter(n => n.type === 'STAND').forEach(stand => {
        const pos = pctToLogical(stand.x, stand.y);
        const realNow = Date.now();
        const isSelected = selectedStandId === stand.id;
        const activeTask = tasks.find(t => (t.status === 'DISPATCHED' || t.status === 'WORKING') && t.standId === stand.id);
        const recentCompletedTask = tasks.find(t => t.status === 'COMPLETED' && t.standId === stand.id && (t as any).completedAtMs && (realNow - (t as any).completedAtMs) < 5000);
        const isTaskActive = !!activeTask;
        const isHovered = hoveredNodeId === stand.id;

        ctx.save();
        const boxW = 54;
        const boxH = 32;
        const boxX = pos.x - boxW / 2;
        const boxY = pos.y - boxH / 2;

        let borderColor = palette.standBorder;
        let bgColor = palette.standBg;

        if (isHovered) {
          borderColor = '#238636';
          bgColor = '#23863625';
        } else if (isSelected) {
          borderColor = '#38bdf8';
          bgColor = '#38bdf825';
        } else if (recentCompletedTask) {
          borderColor = '#22c55e';
          bgColor = '#22c55e30';
        } else if (isTaskActive) {
          borderColor = activeTask?.status === 'WORKING' ? '#22c55e' : '#f59e0b';
          bgColor = activeTask?.status === 'WORKING' ? '#22c55e25' : '#f59e0b25';
        }

        if (isSelected || isTaskActive || isHovered) {
          const pulse = 3 + Math.sin(now / 180) * 1.8;
          ctx.strokeStyle = isSelected ? '#38bdf8' : (activeTask?.status === 'WORKING' || recentCompletedTask) ? '#22c55e' : isTaskActive ? '#f59e0b' : '#238636';
          ctx.globalAlpha = 0.3;
          ctx.lineWidth = 1.2;
          ctx.setLineDash([2, 4]);
          ctx.lineDashOffset = dashOffset;
          ctx.beginPath();
          ctx.roundRect(boxX - pulse, boxY - pulse, boxW + pulse * 2, boxH + pulse * 2, 7);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }

        ctx.fillStyle = bgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = isSelected || isHovered || isTaskActive ? 2.2 : 1.1;

        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 4);
        ctx.fill();
        ctx.stroke();

        if (isSelected) {
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 10;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        ctx.fillStyle = isSelected ? '#38bdf8' : isHovered ? '#238636' : (activeTask?.status === 'WORKING' || recentCompletedTask) ? '#22c55e' : isTaskActive ? '#fbbf24' : palette.standText;
        ctx.font = '700 14px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(stand.label, pos.x, pos.y - 2);

        ctx.fillStyle = isSelected ? '#38bdf8' : (activeTask?.status === 'WORKING' || recentCompletedTask) ? '#22c55e' : isTaskActive ? '#fbbf24' : '#94a3b8';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y + 8, 2, 0, Math.PI * 2);
        ctx.rect(pos.x - 7, pos.y + 7, 14, 1.8);
        ctx.fill();

        // LIVE ACCURATE PROGRESS BAR (ONLY ON ACTIVE WORKING TASKS)
        if (activeTask && activeTask.status === 'WORKING') {
          const targetSec = activeTask.targetWorkSec || 40;
          const elapsedSec = activeTask.elapsedWorkSec || 0;
          const pctRatio = Math.min(1.0, Math.max(0.0, elapsedSec / targetSec));
          const pctInt = Math.min(100, Math.floor(pctRatio * 100));

          const barW = 54;
          const barH = 5;
          const barX = pos.x - barW / 2;
          const barY = boxY + boxH + 3;

          // Background Bar Track
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.roundRect(barX, barY, barW, barH, 2);
          ctx.fill();

          // Green Progress Fill
          ctx.fillStyle = '#22c55e';
          ctx.beginPath();
          ctx.roundRect(barX, barY, Math.max(2, barW * pctRatio), barH, 2);
          ctx.fill();

          // Label: 🔧 XX%
          ctx.fillStyle = '#22c55e';
          ctx.font = '700 9px "JetBrains Mono", monospace';
          ctx.fillText(`🔧 ${pctInt}%`, pos.x, barY + barH + 9);
        }

        ctx.restore();
      });
    }

    // ELEGANT & INTUITIVE ROUTE OVERLAYS FOR ALL IN-TRANSIT WORKERS
    workers.forEach(w => {
      if (w.status !== 'IN_TRANSIT' || !w.pathWaypoints || w.pathWaypoints.length < 2) return;

      const isAog = w.isEmergency || false;
      const routeColor = isAog ? '#ef4444' : '#38bdf8';
      const routeGlow = isAog ? 'rgba(239, 68, 68, 0.25)' : 'rgba(56, 189, 248, 0.25)';

      const pts = w.pathWaypoints.map(pt => pctToLogical(pt.x, pt.y));
      const currIdx = w.currentSegmentIndex || 0;
      const livePt = pctToLogical(w.x, w.y);
      const remainingPts = [livePt, ...pts.slice(currIdx + 1)];
      if (remainingPts.length < 2) return;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // 1. Soft Translucent Glow Track Corridor
      ctx.strokeStyle = routeGlow;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(remainingPts[0].x, remainingPts[0].y);
      for (let i = 1; i < remainingPts.length; i++) {
        ctx.lineTo(remainingPts[i].x, remainingPts[i].y);
      }
      ctx.stroke();

      // 2. Solid Main Route Line
      ctx.strokeStyle = routeColor;
      ctx.lineWidth = 2.8;
      ctx.shadowColor = routeColor;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(remainingPts[0].x, remainingPts[0].y);
      for (let i = 1; i < remainingPts.length; i++) {
        ctx.lineTo(remainingPts[i].x, remainingPts[i].y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 3. Flowing Direction Dashes / Pulse Dots moving toward destination
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 12]);
      ctx.lineDashOffset = dashOffset * 1.2;
      ctx.beginPath();
      ctx.moveTo(remainingPts[0].x, remainingPts[0].y);
      for (let i = 1; i < remainingPts.length; i++) {
        ctx.lineTo(remainingPts[i].x, remainingPts[i].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // 4. Waypoint Node Dots
      ctx.fillStyle = routeColor;
      for (let i = 1; i < remainingPts.length; i++) {
        ctx.beginPath();
        ctx.arc(remainingPts[i].x, remainingPts[i].y, i === remainingPts.length - 1 ? 4 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5. Destination Target Pulsing Halo
      const targetPt = pts[pts.length - 1];
      const pulseR = 6 + Math.sin(now / 150) * 2;
      ctx.strokeStyle = routeColor;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(targetPt.x, targetPt.y, pulseR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    });

    // STABLE VISUALIZATION FOR ALL WORKERS
    // Positions are exponentially smoothed so workers glide (no jumping when a
    // status change alters their offset) and packed into dense hex clusters.
    const clusterIdx = buildClusterIndexes(workers);
    const smoothK = 1 - Math.exp(-dtSec * 12);
    workers.forEach(worker => {
      const hash = parseInt(worker.id.replace(/\D/g, '')) || 0;
      const renderPos = workerClusterPos(worker, hash, clusterIdx, customElements);
      const pos = pctToLogical(renderPos.x, renderPos.y);

      const isAogEmergency = worker.isEmergency || tasksRef.current.some(t => t.priority === 'AOG' && (t.status === 'DISPATCHED' || t.status === 'WORKING') && t.crew.some(m => m.workerId === worker.id));

      ctx.save(); // CRITICAL: must match ctx.restore() at end of loop body

      let statusColor = '#238636'; // FREE = Green
      if (worker.status === 'IN_TRANSIT') statusColor = '#38bdf8'; // IN_TRANSIT = Blue
      if (worker.status === 'RETURNING_TO_BASE') statusColor = '#f59e0b'; // RETURNING = Amber
      if (worker.status === 'WORKING_ON_SITE') statusColor = '#da3633'; // WORKING = Red
      if (isAogEmergency) statusColor = '#f43f5e'; // AOG = Crimson Rose

      // Soft glow halo behind every worker
      ctx.shadowColor = statusColor;
      ctx.shadowBlur = 8;

      if (worker.status === 'FREE_PATROLLING') {
        ctx.strokeStyle = '#23863688';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 14, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Breathing ring for idle duty workers
      if (worker.status === 'FREE_STATIONARY') {
        const breathe = 12.5 + Math.sin(now / 420 + hash * 0.7) * 1.5;
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = '#238636';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, breathe, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // AOG SINGLE SOLID COLOR PULSE (Single solid rose glow, no blue/red alternating sirens)
      if (isAogEmergency && (worker.status === 'IN_TRANSIT' || worker.status === 'WORKING_ON_SITE')) {
        const sirenColor = '#f43f5e';
        ctx.save();
        ctx.shadowColor = sirenColor;
        ctx.shadowBlur = 20;
        ctx.strokeStyle = sirenColor;
        ctx.lineWidth = 2.5;
        const pulseR = 18 + Math.sin(now / 90) * 4;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pulseR, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = sirenColor;
        ctx.font = '800 9px "Montserrat Alternates", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('AOG', pos.x, pos.y - pulseR - 4);
        ctx.restore();
      }

      // ----------------------------------------------------------------------
      // PHYSICAL VEHICLE & UNIT CANVAS GRAPHICS RENDERER (CARPOOLING & MULTI-PASSENGER)
      // ----------------------------------------------------------------------
      const isVehicleUnit = worker.vehicle === 'APRON_VEHICLE' && (worker.status === 'IN_TRANSIT' || worker.status === 'RETURNING_TO_BASE' || worker.status === 'BOARDING_VEHICLE');

      if (isVehicleUnit) {
        // --- 1. SLEEK COMPACT SPECIAL VEHICLE (СПЕЦАВТОМОБИЛЬ ОТО SVO) ---
        ctx.save();
        const vW = 28;
        const vH = 15;
        const vX = pos.x - vW / 2;
        const vY = pos.y - vH / 2;

        // Calculate multi-passenger crew carpooling count
        const taskWorkers = worker.currentTaskId
          ? workers.filter(w => w.currentTaskId === worker.currentTaskId && w.vehicle === 'APRON_VEHICLE' && (w.status === 'IN_TRANSIT' || w.status === 'BOARDING_VEHICLE'))
          : [worker];
        const crewCount = taskWorkers.length;
        const crewCodes = Array.from(new Set(taskWorkers.map(w => w.categoryCode))).join('+');

        // Soft vehicle glow halo
        ctx.shadowColor = statusColor;
        ctx.shadowBlur = 10;

        // Sleeker Vehicle Body Chassis
        ctx.fillStyle = theme === 'dark' ? '#0b131f' : '#ffffff';
        ctx.strokeStyle = statusColor;
        ctx.lineWidth = isAogEmergency ? 2.2 : 1.5;
        ctx.beginPath();
        ctx.roundRect(vX, vY, vW, vH, 4);
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;

        // Front Windshield Glass
        ctx.fillStyle = '#38bdf850';
        ctx.beginPath();
        ctx.roundRect(vX + vW - 8, vY + 2, 5, vH - 4, 1.5);
        ctx.fill();

        // Flashing Amber/Rose Roof Beacon LED (Проблесковый маячок спецтехники)
        const beaconColor = isAogEmergency ? '#f43f5e' : '#f59e0b';
        const beaconPulse = Math.sin(now / 80) * 0.5 + 0.5;
        ctx.fillStyle = beaconColor;
        ctx.shadowColor = beaconColor;
        ctx.shadowBlur = 8 * beaconPulse;
        ctx.beginPath();
        ctx.arc(pos.x - 3, pos.y, 2.5 + beaconPulse * 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Vehicle Identification Text inside chassis: 🚘 B1 / 🚘 👥3
        ctx.fillStyle = statusColor;
        ctx.font = '800 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(crewCount > 1 ? `👥${crewCount}` : worker.categoryCode, pos.x - 2, pos.y);

        // Top Floating Vehicle Plate Badge with Multi-Passenger Info
        const vehIndex = (hash % 12) + 1;
        const vehLabel = `АВТО-${vehIndex < 10 ? '0' : ''}${vehIndex}`;

        if (worker.status === 'BOARDING_VEHICLE') {
          // Boarding prep badge
          const prepSec = Math.ceil(worker.boardingSecRemaining || 30);
          ctx.fillStyle = '#f59e0b';
          ctx.font = '800 8.5px "Montserrat Alternates", sans-serif';
          ctx.fillText(`📦 ПОГРУЗКА ИНСТРУМЕНТА (${prepSec}с)`, pos.x, vY - 6);
        } else {
          ctx.fillStyle = statusColor;
          ctx.font = '700 8.5px "JetBrains Mono", monospace';
          const passengerBadge = crewCount > 1 ? `🚘 ${vehLabel} (👥${crewCount} ${crewCodes})` : `🚘 ${vehLabel} (${worker.categoryCode})`;
          ctx.fillText(passengerBadge, pos.x, vY - 6);
        }

        ctx.restore();
      } else {
        // --- 2. REGULAR ENGINEER UNIT / PEDESTRIAN ---
        if (worker.vehicle === 'PEDESTRIAN' && (worker.status === 'IN_TRANSIT' || worker.status === 'RETURNING_TO_BASE')) {
          ctx.fillStyle = '#38bdf8';
          ctx.font = '700 9px "Montserrat Alternates", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`🚶 ПЕШКОМ`, pos.x, pos.y - 15);
        }

        ctx.fillStyle = statusColor;
        ctx.strokeStyle = theme === 'dark' ? '#070a0e' : '#ffffff';
        ctx.lineWidth = 1.5;
        
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 11.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;

        ctx.fillStyle = palette.bg;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 9.0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = statusColor;
        ctx.font = '800 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(worker.categoryCode, pos.x, pos.y);
      }

      ctx.restore();
    });

    // UNIT TRACKING CAMERA AUTO-CENTERING & AUTO-ZOOM
    if (trackedWorkerId && containerRef.current && !isDragging) {
      const trackedWorker = workersRef.current.find(w => w.id === trackedWorkerId);
      if (trackedWorker) {
        const clusterIdxTrack = buildClusterIndexes(workersRef.current);
        const hashTrack = parseInt(trackedWorker.id.replace(/\D/g, '')) || 0;
        const renderPos = workerClusterPos(trackedWorker, hashTrack, clusterIdxTrack, customElements);
        const smoothPos = workerSmoothRef.current.get(trackedWorker.id) || renderPos;
        const pos = pctToLogical(smoothPos.x, smoothPos.y);

        const containerW = containerRef.current.clientWidth;
        const containerH = containerRef.current.clientHeight;

        // Auto-zoom in on tracked worker (1.8x magnification)
        const targetZoom = 1.8;
        const targetPanX = containerW / 2 - pos.x * targetZoom;
        const targetPanY = containerH / 2 - pos.y * targetZoom;

        setPanOffset({ x: targetPanX, y: targetPanY });
        setZoomScale(targetZoom);
      }
    }

    // UNCONSTRAINED FULL-VIEWPORT WEATHER EFFECTS OVERLAY
    if (weatherMode && weatherMode !== 'CLEAR') {
      ctx.save();
      const w = canvas.width;
      const h = canvas.height;

      if (weatherMode === 'BLIZZARD') {
        ctx.fillStyle = '#ffffff';
        const particleCount = 180;
        const windOffset = (now * 0.15) % w;
        
        ctx.globalAlpha = 0.75;
        for (let i = 0; i < particleCount; i++) {
          const flakeX = ((Math.sin(now / 800 + i * 17) * 0.5 + 0.5) * w + windOffset + i * 20) % w;
          const flakeY = ((now * 0.12 + i * 23) % h);
          const flakeR = 1.0 + (i % 3) * 0.8;
          ctx.beginPath();
          ctx.arc(flakeX, flakeY, flakeR, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = 'rgba(224, 242, 254, 0.08)';
        ctx.fillRect(0, 0, w, h);
      } else if (weatherMode === 'RAIN') {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.6;
        const dropCount = 80;
        
        for (let i = 0; i < dropCount; i++) {
          const rx = (i * 37 + now * 0.2) % w;
          const ry = (i * 53 + now * 0.6) % h;
          const len = 12 + (i % 5) * 4;
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - 3, ry + len);
          ctx.stroke();
        }
      } else if (weatherMode === 'NIGHT') {
        const gradient = ctx.createRadialGradient(
          w / 2, h / 2, Math.min(w, h) * 0.3,
          w / 2, h / 2, Math.max(w, h) * 0.7
        );
        gradient.addColorStop(0, 'rgba(3, 7, 18, 0.35)');
        gradient.addColorStop(1, 'rgba(2, 6, 23, 0.75)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();
    }

    ctx.restore(); // Restore pan/zoom
    ctx.restore(); // Restore dpr
  }, [panOffset, zoomScale, workersRef, tasksRef, selectedStandId, hoveredNodeId, isDragging, getNodePos, pctToLogical, theme, weatherMode, showMapSublayer, trackedWorkerId, customElements, customConnections, airfieldMode]);

  // NATIVE NON-PASSIVE WHEEL LISTENER (Fixes "Unable to preventDefault inside passive event listener invocation")
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;

      setZoomScale(prevScale => {
        const newScale = Math.max(0.5, Math.min(4.0, prevScale * zoomFactor));
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;

          setPanOffset(prevPan => ({
            x: mouseX - (mouseX - prevPan.x) * (newScale / prevScale),
            y: mouseY - (mouseY - prevPan.y) * (newScale / prevScale)
          }));
        }
        return newScale;
      });
    };

    el.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => el.removeEventListener('wheel', onNativeWheel);
  }, []);

  // CONTINUOUS 60 FPS ANIMATION RENDER LOOP!
  useEffect(() => {
    let animFrameId: number;
    const loop = () => {
      renderCanvas();
      animFrameId = requestAnimationFrame(loop);
    };
    animFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameId);
  }, [renderCanvas]);

  const handlePresetFocus = (preset: 'ALL' | 'NORTH' | 'SOUTH' | 'RESET') => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;

    if (preset === 'ALL' || preset === 'RESET') {
      setZoomScale(1.0);
      setPanOffset({ x: 0, y: 0 });
    } else if (preset === 'NORTH') {
      const scale = 1.75;
      setZoomScale(scale);
      setPanOffset({
        x: clientWidth / 2 - 380 * scale,
        y: clientHeight / 2 - 200 * scale
      });
    } else if (preset === 'SOUTH') {
      const scale = 1.75;
      setZoomScale(scale);
      setPanOffset({
        x: clientWidth / 2 - 580 * scale,
        y: clientHeight / 2 - 480 * scale
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 0) {
      if (trackedWorkerId && onStopTracking) {
        onStopTracking();
      }
      setIsDragging(true);
      setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) {
      setPanOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
      return;
    }

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    const lx = (rawX - panOffset.x) / zoomScale;
    const ly = (rawY - panOffset.y) / zoomScale;

    const isCustomMode = airfieldMode === 'CUSTOM';

    // Hit Testing for Hover
    let foundNodeId: string | null = null;
    let foundHit: HoverTooltipData | null = null;

    // Direct worker hover test (uses the same cluster positions as rendering)
    const clusterIdx = buildClusterIndexes(workersRef.current);
    for (const worker of workersRef.current) {
      const hash = parseInt(worker.id.replace(/\D/g, '')) || 0;
      const renderPos = workerClusterPos(worker, hash, clusterIdx, customElements);
      const pos = pctToLogical(renderPos.x, renderPos.y);

      if (Math.hypot(lx - pos.x, ly - pos.y) <= 12) {
        const getStatusRu = (st: string) => {
          if (st === 'FREE_STATIONARY' || st === 'FREE_PATROLLING') return '🟢 Свободен (Дежурство)';
          if (st === 'BOARDING_VEHICLE') return '🟡 Погрузка инструмента и посадка';
          if (st === 'IN_TRANSIT') return '🚘 В пути на вызов';
          if (st === 'WORKING_ON_SITE') return '🔧 На объекте (Ремонт)';
          return st;
        };

        const getCategoryRu = (cat: string) => {
          if (cat === 'B1') return 'B1 (Планер и Двигатели)';
          if (cat === 'B2') return 'B2 (Авионика и Системы)';
          if (cat === 'A') return 'A (Техник перронного ТО)';
          return cat;
        };

        const getBaseRu = (base?: string) => {
          if (base === 'PTO_NORTH') return 'ПТО-1 (Север B/C)';
          if (base === 'PTO_SOUTH') return 'ПТО-2 (Юг D/E/F)';
          if (base === 'HANGAR_BASE') return 'Ангарный комплекс SVO';
          const customFac = customElements.find(e => e.id === base);
          if (customFac) return customFac.label;
          return base || 'База ПТО';
        };

        let taskLabel = 'Нет активных задач';
        if (worker.currentTaskId) {
          const task = tasksRef.current.find(t => t.id === worker.currentTaskId);
          if (task) taskLabel = `${task.standLabel.replace(/^Стоянка\s*/i, '')} (${task.defectLabel || task.categoryLabel})`;
        }

        foundHit = {
          type: 'WORKER',
          title: `👷 ${worker.name}`,
          subtitle: getCategoryRu(worker.categoryCode),
          details: [
            { label: 'Статус:', value: getStatusRu(worker.status) },
            { label: 'База приписки:', value: getBaseRu(worker.baseId) },
            { label: 'Транспорт:', value: worker.vehicle === 'APRON_VEHICLE' ? '🚘 Спецавто (25 км/ч)' : '🚶 Пешком (4.5 км/ч)' },
            { label: 'Текущий вызов:', value: taskLabel }
          ],
          x: e.clientX,
          y: e.clientY
        };
        break;
      }
    }

    if (!foundHit) {
      if (isCustomMode) {
        for (const stand of customElements.filter(e => e.kind === 'STAND')) {
          const pos = pctToLogical(stand.x, stand.y);
          if (Math.abs(lx - pos.x) <= 30 && Math.abs(ly - pos.y) <= 20) {
            foundNodeId = stand.id;
            foundHit = {
              type: 'STAND',
              title: `Стоянка ${stand.label}`,
              subtitle: stand.aircraftType || 'Airbus A320-200',
              details: [
                { label: 'Сектор:', value: stand.y < 45 ? 'Северный сектор' : 'Южный сектор' },
                { label: 'Координаты:', value: `X:${stand.x}% Y:${stand.y}%` }
              ],
              x: e.clientX,
              y: e.clientY
            };
            break;
          }
        }
      } else {
        for (const stand of SVO_NODES.filter(n => n.type === 'STAND')) {
          const pos = pctToLogical(stand.x, stand.y);
          if (Math.abs(lx - pos.x) <= 28 && Math.abs(ly - pos.y) <= 18) {
            foundNodeId = stand.id;
            foundHit = {
              type: 'STAND',
              title: `Стоянка ВС ${stand.label}`,
              subtitle: stand.aircraftType || 'Airbus A320-200',
              details: [
                { label: 'Зона:', value: stand.y < 45 ? 'Северный комплекс (B/C)' : 'Южный комплекс (D/E/F)' },
                { label: 'Координаты:', value: `X:${stand.x}% Y:${stand.y}%` }
              ],
              x: e.clientX,
              y: e.clientY
            };
            break;
          }
        }
      }
    }

    if (!foundHit) {
      if (isCustomMode) {
        for (const fac of customElements.filter(e => e.kind === 'DUTY_STATION' || e.kind === 'HANGAR' || e.kind === 'PARKING' || e.kind === 'TERMINAL')) {
          const pos = pctToLogical(fac.x, fac.y);
          if (Math.abs(lx - pos.x) <= 25 && Math.abs(ly - pos.y) <= 25) {
            foundNodeId = fac.id;
            foundHit = {
              type: 'FACILITY',
              title: fac.label,
              subtitle: fac.kind === 'HANGAR' ? 'Ангарный комплекс' : fac.kind === 'DUTY_STATION' ? 'Пункт дежурства ПТО' : fac.kind === 'PARKING' ? 'Автопарк спецтехники' : 'Пассажирский терминал',
              details: [
                { label: 'Координаты:', value: `X:${fac.x}% Y:${fac.y}%` }
              ],
              x: e.clientX,
              y: e.clientY
            };
            break;
          }
        }
      } else {
        for (const fac of SVO_FACILITIES) {
          const pos = pctToLogical(fac.x, fac.y);
          if (Math.abs(lx - pos.x) <= 20 && Math.abs(ly - pos.y) <= 20) {
            foundNodeId = fac.id;
            foundHit = {
              type: 'FACILITY',
              title: `${fac.code} — ${fac.name}`,
              subtitle: fac.type === 'HANGAR' ? 'Ангарный комплекс' : 'Пункт дежурства ОТО',
              details: [
                { label: 'Координаты:', value: `X:${fac.x}% Y:${fac.y}%` }
              ],
              x: e.clientX,
              y: e.clientY
            };
            break;
          }
        }
      }
    }

    setHoveredNodeId(foundNodeId);
    setHoverTooltip(foundHit);
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Hide hover tooltip popover card when clicking anywhere on canvas
    setHoverTooltip(null);

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    const lx = (rawX - panOffset.x) / zoomScale;
    const ly = (rawY - panOffset.y) / zoomScale;

    const isCustomMode = airfieldMode === 'CUSTOM';

    const pctX = Math.round((lx / LOGICAL_WIDTH) * 1000) / 10;
    const pctY = Math.round((ly / LOGICAL_HEIGHT) * 1000) / 10;

    if (isDevMode && onDevPointClick) {
      console.log(`📍 Calibration Node: { x: ${pctX}, y: ${pctY} }`);
      onDevPointClick(pctX, pctY);
      return;
    }

    // 1. Worker Click Hit Test
    const clusterIdx = buildClusterIndexes(workersRef.current);
    for (const worker of workersRef.current) {
      const hash = parseInt(worker.id.replace(/\D/g, '')) || 0;
      const renderPos = workerClusterPos(worker, hash, clusterIdx, customElements);
      const pos = pctToLogical(renderPos.x, renderPos.y);

      if (Math.hypot(lx - pos.x, ly - pos.y) <= 15) {
        if (onSelectWorker) {
          onSelectWorker(worker);
        }
        return;
      }
    }

    // 2. Stand Click Hit Test
    if (isCustomMode) {
      for (const stand of customElements.filter(e => e.kind === 'STAND')) {
        const pos = pctToLogical(stand.x, stand.y);
        if (Math.abs(lx - pos.x) <= 30 && Math.abs(ly - pos.y) <= 20) {
          onSelectStand(stand.id);
          onOpenStandContext?.(stand.id);
          break;
        }
      }
    } else {
      for (const stand of SVO_NODES.filter(n => n.type === 'STAND')) {
        const pos = pctToLogical(stand.x, stand.y);
        if (Math.abs(lx - pos.x) <= 28 && Math.abs(ly - pos.y) <= 18) {
          onSelectStand(stand.id);
          onOpenStandContext?.(stand.id);
          break;
        }
      }
    }
  };

  return {
    containerRef,
    canvasRef,
    hoverTooltip,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleClick,
    handlePresetFocus
  };
}
