import { useRef, useEffect, useState, useCallback } from 'react';
import { Worker, OtoTask, HoverTooltipData, ThemeMode, TaskCrewMember } from '../types/index';
import { SVO_BUILDINGS, SVO_FACILITIES, SVO_NODES, SVO_EDGES, CANVAS_THEMES } from '../constants/index';

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
// on-site workers (by their task), sorted by id for deterministic packing.
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
    g.sort((a, b) => a.id.localeCompare(b.id));
    g.forEach((w, i) => baseSlotIndex.set(w.id, i));
  }
  for (const g of siteGroups.values()) {
    g.sort((a, b) => a.id.localeCompare(b.id));
    g.forEach((w, i) => siteSlotIndex.set(w.id, i));
  }
  return { baseSlotIndex, siteSlotIndex };
}

// Target render offset for a worker (percent units, added to worker.x/y)
function workerClusterPos(worker: Worker, hash: number, idx: ClusterIndexes) {
  if (worker.status === 'FREE_STATIONARY') {
    const s = ringSlot(idx.baseSlotIndex.get(worker.id) ?? 0, 2.1);
    return { x: worker.x + s.x, y: worker.y + 5 + s.y };
  }
  if (worker.status === 'WORKING_ON_SITE') {
    const s = ringSlot(idx.siteSlotIndex.get(worker.id) ?? 0, 1.9);
    return { x: worker.x + s.x, y: worker.y + 4 + s.y };
  }
  if (worker.status === 'IN_TRANSIT' || worker.status === 'RETURNING_TO_BASE' || worker.status === 'FREE_PATROLLING') {
    // Stable jitter on the road so overlapping workers in convoy remain distinct
    return {
      x: worker.x + ((hash % 3) - 1) * 0.8,
      y: worker.y + ((Math.floor(hash / 3) % 3) - 1) * 0.8
    };
  }
  return { x: worker.x, y: worker.y };
}

interface UseCanvasEngineProps {
  workersRef: React.MutableRefObject<Worker[]>;
  tasksRef: React.MutableRefObject<OtoTask[]>;
  selectedStandId: string | null;
  onSelectStand: (standId: string) => void;
  theme: ThemeMode;
  isDevMode: boolean;
  onDevPointClick?: (pctX: number, pctY: number) => void;
  showMapSublayer: boolean;
}

export function useCanvasEngine({
  workersRef,
  tasksRef,
  selectedStandId,
  onSelectStand,
  theme,
  isDevMode,
  onDevPointClick,
  showMapSublayer
}: UseCanvasEngineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Cached static road-network geometry: built ONCE (positions are fixed logical
  // coords), stroked 3×/frame with different styles + dash offsets. Avoids
  // rebuilding Map/Set/sort topology on every animation frame (GC churn).
  const roadPathRef = useRef<Path2D | null>(null);

  // Raster Image Sublayer Ref (svo.png)
  const mapImageRef = useRef<HTMLImageElement | null>(null);
  const [isMapImageLoaded, setIsMapImageLoaded] = useState<boolean>(false);

  useEffect(() => {
    const img = new Image();
    img.src = '/svo.png';
    img.onload = () => {
      mapImageRef.current = img;
      setIsMapImageLoaded(true);
    };
  }, []);

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

    // Smoothly ease zoom/pan toward the target; snap while dragging for 1:1 control
    if (isDragging) {
      currentZoomRef.current = zoomScale;
      currentPanRef.current = { x: panOffset.x, y: panOffset.y };
    } else {
      const k = 1 - Math.exp(-dtSec * 10);
      currentZoomRef.current += (zoomScale - currentZoomRef.current) * k;
      currentPanRef.current.x += (panOffset.x - currentPanRef.current.x) * k;
      currentPanRef.current.y += (panOffset.y - currentPanRef.current.y) * k;
    }
    const zs = currentZoomRef.current;
    const ps = currentPanRef.current;

    ctx.save();
    ctx.translate(ps.x, ps.y);
    ctx.scale(zs, zs);

    // RASTER BACKGROUND SUBLAYER (svo.png)
    if (showMapSublayer && mapImageRef.current && isMapImageLoaded) {
      ctx.save();
      ctx.globalAlpha = theme === 'dark' ? 0.45 : 0.65;
      ctx.drawImage(mapImageRef.current, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      ctx.restore();
    }

    // CAD Grid
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

    // SVO Buildings & Runways
    SVO_BUILDINGS.forEach(bld => {
      ctx.save();
      if (bld.type === 'ARC' && bld.center && bld.radius) {
        const centerPos = pctToLogical(bld.center.x, bld.center.y);
        const radLogical = (bld.radius / 100) * LOGICAL_WIDTH;

        ctx.fillStyle = palette.terminalFill;
        ctx.strokeStyle = palette.terminalStroke;
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        ctx.arc(centerPos.x, centerPos.y, radLogical, bld.startAngle, bld.endAngle);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = palette.textSubtle;
        ctx.font = '600 12px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(bld.name, centerPos.x, centerPos.y - radLogical * 0.3);
      } else if (bld.points && bld.points.length >= 2) {
        const isRunway = bld.id.startsWith('RWY');

        if (isRunway) {
          const p1 = pctToLogical(bld.points[0].x, bld.points[0].y);
          const p2 = pctToLogical(bld.points[1].x, bld.points[1].y);
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;

          // Runway pavement (rounded ends) + shoulder
          ctx.strokeStyle = palette.runwayFill;
          ctx.lineCap = 'round';
          ctx.lineWidth = 15;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();

          // Centerline dashes
          ctx.strokeStyle = palette.runwayLine;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([8, 8]);
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Threshold bars at both ends (perpendicular stripes)
          ctx.strokeStyle = palette.runwayLine;
          ctx.lineWidth = 1.2;
          for (const end of [p1, p2]) {
            for (let i = 1; i <= 3; i++) {
              const t = i * 3.5;
              const bx = end.x + ux * t;
              const by = end.y + uy * t;
              ctx.beginPath();
              ctx.moveTo(bx - uy * 5.5, by + ux * 5.5);
              ctx.lineTo(bx + uy * 5.5, by - ux * 5.5);
              ctx.stroke();
            }
          }

          // Runway designator label near each threshold
          ctx.fillStyle = palette.textSubtle;
          ctx.font = '600 9px "JetBrains Mono", monospace';
          ctx.save();
          ctx.translate(p1.x - ux * 16 - uy * 8, p1.y - uy * 16 + ux * 8);
          ctx.rotate(Math.atan2(dy, dx));
          ctx.fillText(bld.name, 0, 0);
          ctx.restore();
          ctx.save();
          ctx.translate(p2.x + ux * 16 - uy * 8, p2.y + uy * 16 + ux * 8);
          ctx.rotate(Math.atan2(dy, dx));
          ctx.fillText(bld.name.split('/')[1] || bld.name, 0, 0);
          ctx.restore();
        } else {
          ctx.fillStyle = palette.terminalFill;
          ctx.strokeStyle = palette.terminalStroke;
          ctx.lineWidth = 1.5;

          ctx.beginPath();
          const logicalPts = bld.points.map(p => pctToLogical(p.x, p.y));
          roundedPolygonPath(ctx, logicalPts, 3.2);
          ctx.fill();
          ctx.stroke();

          const avgX = bld.points.reduce((acc, p) => acc + p.x, 0) / bld.points.length;
          const avgY = bld.points.reduce((acc, p) => acc + p.y, 0) / bld.points.length;
          const labelPos = pctToLogical(avgX, avgY);

          ctx.fillStyle = palette.textSubtle;
          ctx.font = '600 12px "Inter", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(bld.name, labelPos.x, labelPos.y);
        }
      }
      ctx.restore();
    });

    // ROAD TOPOLOGY GRAPH — dual-layer lanes + slow flowing traffic dashes.
    // Drawn as a single smoothed network: junctions get filleted corners.
    const roadEdges = SVO_EDGES.filter(e => e.type !== 'TUNNEL');
    const cornerRadius = 7;

    // Build the static path geometry once, reuse it for all three strokes
    if (!roadPathRef.current) {
      roadPathRef.current = buildRoadNetworkPath(roadEdges, getNodePos, cornerRadius);
    }
    const roadPath = roadPathRef.current;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Wide soft underlay (the "street")
    ctx.strokeStyle = palette.roadLine;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 3.6;
    ctx.stroke(roadPath);

    // Bright centerline
    ctx.globalAlpha = 1;
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1.1;
    ctx.stroke(roadPath);

    // Slow moving dashes to convey traffic flow
    ctx.strokeStyle = palette.textSubtle;
    ctx.globalAlpha = theme === 'dark' ? 0.28 : 0.5;
    ctx.lineWidth = 1.3;
    ctx.setLineDash([3, 22]);
    ctx.lineDashOffset = dashOffset * 0.5;
    ctx.stroke(roadPath);
    ctx.setLineDash([]);
    ctx.restore();

    // Glowing animated tunnel (underground conveyor) — separate layer
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

    // Aeroflot Technics Bases (Amber Gold Badges)
    SVO_FACILITIES.forEach(fac => {
      const pos = pctToLogical(fac.x, fac.y);
      const isHovered = hoveredNodeId === fac.id;

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

    // Aircraft Stands Markers (stable, no layout shift; pulsing ring when relevant)
    SVO_NODES.filter(n => n.type === 'STAND').forEach(stand => {
      const pos = pctToLogical(stand.x, stand.y);
      const isSelected = selectedStandId === stand.id;
      const activeTask = tasks.find(t => (t.status === 'DISPATCHED' || t.status === 'WORKING') && t.standId === stand.id);
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
      } else if (isTaskActive) {
        borderColor = activeTask?.status === 'WORKING' ? '#22c55e' : '#f59e0b';
        bgColor = activeTask?.status === 'WORKING' ? '#22c55e25' : '#f59e0b25';
      }

      // Pulsing halo for selected / active / hovered stands
      if (isSelected || isTaskActive || isHovered) {
        const pulse = 3 + Math.sin(now / 180) * 1.8;
        ctx.strokeStyle = isSelected ? '#38bdf8' : activeTask?.status === 'WORKING' ? '#22c55e' : isTaskActive ? '#f59e0b' : '#238636';
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

      ctx.fillStyle = isSelected ? '#38bdf8' : isHovered ? '#238636' : activeTask?.status === 'WORKING' ? '#22c55e' : isTaskActive ? '#fbbf24' : palette.standText;
      ctx.font = '700 14px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(stand.label, pos.x, pos.y - 2);

      // Small aircraft glyph below the label
      ctx.fillStyle = isSelected ? '#38bdf8' : activeTask?.status === 'WORKING' ? '#22c55e' : isTaskActive ? '#fbbf24' : '#94a3b8';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y + 8, 2, 0, Math.PI * 2);
      ctx.rect(pos.x - 7, pos.y + 7, 14, 1.8);
      ctx.fill();

      // LIVE PROGRESS BAR WHEN WORKING ON SITE
      if (activeTask && activeTask.status === 'WORKING') {
        const pct = Math.min(1.0, (activeTask.elapsedWorkSec || 0) / (activeTask.targetWorkSec || 120));
        const barW = 54;
        const barH = 5;
        const barX = pos.x - barW / 2;
        const barY = boxY + boxH + 3;

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barH, 2);
        ctx.fill();

        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.roundRect(barX, barY, Math.max(2, barW * pct), barH, 2);
        ctx.fill();

        ctx.fillStyle = '#22c55e';
        ctx.font = '700 9px "JetBrains Mono", monospace';
        ctx.fillText(`🔧 ${Math.round(pct * 100)}%`, pos.x, barY + barH + 9);
      }

      ctx.restore();
    });

    // NEON ROUTE OVERLAYS FOR ACTIVE TASKS
    tasks.forEach(task => {
      task.crew.forEach((member: TaskCrewMember) => {
        if (member.waypoints && member.waypoints.length > 1) {
          ctx.save();
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([6, 6]);
          ctx.lineDashOffset = dashOffset;

          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 6;

          ctx.beginPath();
          const start = pctToLogical(member.waypoints[0].x, member.waypoints[0].y);
          ctx.moveTo(start.x, start.y);

          for (let i = 1; i < member.waypoints.length; i++) {
            const pt = pctToLogical(member.waypoints[i].x, member.waypoints[i].y);
            ctx.lineTo(pt.x, pt.y);
          }
          ctx.stroke();
          ctx.restore();
        }
      });
    });

    // STABLE VISUALIZATION FOR ALL WORKERS
    // Positions are exponentially smoothed so workers glide (no jumping when a
    // status change alters their offset) and packed into dense hex clusters.
    const clusterIdx = buildClusterIndexes(workers);
    const smoothK = 1 - Math.exp(-dtSec * 12);
    if (workerSmoothRef.current.size > workers.length * 3) {
      const alive = new Set(workers.map(w => w.id));
      for (const id of [...workerSmoothRef.current.keys()]) {
        if (!alive.has(id)) workerSmoothRef.current.delete(id);
      }
    }
    workers.forEach(worker => {
      const hash = parseInt(worker.id.replace(/\D/g, '')) || 0;
      const renderPos = workerClusterPos(worker, hash, clusterIdx);
      const renderX = renderPos.x;
      const renderY = renderPos.y;

      // Exponential smoothing toward the target position → buttery glide
      let smoothPos = workerSmoothRef.current.get(worker.id);
      if (!smoothPos) {
        smoothPos = { x: renderX, y: renderY };
        workerSmoothRef.current.set(worker.id, smoothPos);
      }
      smoothPos.x += (renderX - smoothPos.x) * smoothK;
      smoothPos.y += (renderY - smoothPos.y) * smoothK;

      const pos = pctToLogical(smoothPos.x, smoothPos.y);

      ctx.save();
      let statusColor = '#238636'; // FREE = Green
      if (worker.status === 'IN_TRANSIT') statusColor = '#38bdf8'; // IN_TRANSIT = Blue
      if (worker.status === 'RETURNING_TO_BASE') statusColor = '#f59e0b'; // RETURNING = Amber
      if (worker.status === 'WORKING_ON_SITE') statusColor = '#da3633'; // WORKING = Red

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

      ctx.restore();
    });

    ctx.restore(); // Restore pan/zoom
    ctx.restore(); // Restore dpr
  }, [panOffset, zoomScale, workersRef, tasksRef, selectedStandId, hoveredNodeId, isDragging, getNodePos, pctToLogical, theme, showMapSublayer, isMapImageLoaded]);

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

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newScale = Math.max(0.5, Math.min(4.0, zoomScale * zoomFactor));

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const newPanX = mouseX - (mouseX - panOffset.x) * (newScale / zoomScale);
      const newPanY = mouseY - (mouseY - panOffset.y) * (newScale / zoomScale);

      setZoomScale(newScale);
      setPanOffset({ x: newPanX, y: newPanY });
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 0) {
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

    // Hit Testing for Hover
    let foundNodeId: string | null = null;
    let foundHit: HoverTooltipData | null = null;

    // Direct worker hover test (uses the same cluster positions as rendering)
    const clusterIdx = buildClusterIndexes(workersRef.current);
    for (const worker of workersRef.current) {
      const hash = parseInt(worker.id.replace(/\D/g, '')) || 0;
      const renderPos = workerClusterPos(worker, hash, clusterIdx);
      const pos = pctToLogical(renderPos.x, renderPos.y);

      if (Math.hypot(lx - pos.x, ly - pos.y) <= 12) {
        let taskLabel = 'Ожидание';
        if (worker.currentTaskId) {
          const task = tasksRef.current.find(t => t.id === worker.currentTaskId);
          if (task) taskLabel = `Задача ${task.id} (${task.standLabel})`;
        }

        foundHit = {
          type: 'WORKER',
          title: `👷 ${worker.name} (${worker.categoryCode})`,
          subtitle: `${worker.vehicle === 'APRON_VEHICLE' ? '🚘 Спецтранспорт' : '🚶 Пешком'} • ${worker.status}`,
          details: [
            { label: '• Статус:', value: worker.status },
            { label: '• База приписки:', value: worker.baseId },
            { label: '• Текущая задача:', value: taskLabel }
          ],
          x: e.clientX,
          y: e.clientY
        };
        break;
      }
    }

    if (!foundHit) {
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

    if (!foundHit) {
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

    setHoveredNodeId(foundNodeId);
    setHoverTooltip(foundHit);
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    const lx = (rawX - panOffset.x) / zoomScale;
    const ly = (rawY - panOffset.y) / zoomScale;

    const pctX = Math.round((lx / LOGICAL_WIDTH) * 1000) / 10;
    const pctY = Math.round((ly / LOGICAL_HEIGHT) * 1000) / 10;

    if (isDevMode && onDevPointClick) {
      console.log(`📍 SVO Calibration Node: { x: ${pctX}, y: ${pctY} }`);
      onDevPointClick(pctX, pctY);
      return;
    }

    for (const stand of SVO_NODES.filter(n => n.type === 'STAND')) {
      const pos = pctToLogical(stand.x, stand.y);
      if (Math.abs(lx - pos.x) <= 28 && Math.abs(ly - pos.y) <= 18) {
        onSelectStand(stand.id);
        break;
      }
    }
  };

  return {
    containerRef,
    canvasRef,
    hoverTooltip,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleClick,
    handlePresetFocus
  };
}
