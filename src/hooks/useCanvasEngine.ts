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
    this.arcTo(x, y + h, x, y + h - bl, bl);
    this.lineTo(x, y + tl);
    this.arcTo(x, y, x + tl, y, tl);
    this.closePath();
  };
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

    canvas.width = width * dpr;
    canvas.height = height * dpr;
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

          ctx.strokeStyle = palette.runwayFill;
          ctx.lineWidth = 14;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();

          ctx.strokeStyle = palette.runwayLine;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([8, 8]);
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(p1.x, p1.y, 3, 0, Math.PI * 2);
          ctx.arc(p2.x, p2.y, 3, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = palette.textSubtle;
          ctx.font = '600 10px "JetBrains Mono", monospace';
          ctx.fillText(bld.name, p1.x + 15, p1.y + 4);
        } else {
          ctx.fillStyle = palette.terminalFill;
          ctx.strokeStyle = palette.terminalStroke;
          ctx.lineWidth = 1.5;

          ctx.beginPath();
          const firstPt = pctToLogical(bld.points[0].x, bld.points[0].y);
          ctx.moveTo(firstPt.x, firstPt.y);

          for (let i = 1; i < bld.points.length; i++) {
            const pt = pctToLogical(bld.points[i].x, bld.points[i].y);
            ctx.lineTo(pt.x, pt.y);
          }
          ctx.closePath();
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

    // ROAD TOPOLOGY GRAPH — dual-layer lanes + slow flowing traffic dashes
    SVO_EDGES.forEach(edge => {
      const p1 = getNodePos(edge.from);
      const p2 = getNodePos(edge.to);

      ctx.save();
      ctx.lineCap = 'round';

      if (edge.type === 'TUNNEL') {
        // Glowing animated tunnel (underground conveyor)
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
      } else {
        // Wide soft underlay (the "street")
        ctx.strokeStyle = palette.roadLine;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 3.6;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // Bright centerline
        ctx.globalAlpha = 1;
        ctx.strokeStyle = palette.grid;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // Slow moving dashes to convey traffic flow
        ctx.strokeStyle = palette.textSubtle;
        ctx.globalAlpha = theme === 'dark' ? 0.28 : 0.5;
        ctx.lineWidth = 1.3;
        ctx.setLineDash([3, 22]);
        ctx.lineDashOffset = dashOffset * 0.5;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
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
      const isTaskActive = tasks.some(t => t.standId === stand.id);
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
        borderColor = '#f59e0b';
        bgColor = '#f59e0b25';
      }

      // Pulsing halo for selected / active / hovered stands
      if (isSelected || isTaskActive || isHovered) {
        const pulse = 3 + Math.sin(now / 180) * 1.8;
        ctx.strokeStyle = isSelected ? '#38bdf8' : isTaskActive ? '#f59e0b' : '#238636';
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

      ctx.fillStyle = isSelected ? '#38bdf8' : isHovered ? '#238636' : isTaskActive ? '#fbbf24' : palette.standText;
      ctx.font = '700 14px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(stand.label, pos.x, pos.y - 2);

      // Small aircraft glyph below the label
      ctx.fillStyle = isSelected ? '#38bdf8' : isTaskActive ? '#fbbf24' : '#94a3b8';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y + 8, 2, 0, Math.PI * 2);
      ctx.rect(pos.x - 7, pos.y + 7, 14, 1.8);
      ctx.fill();

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
    // status change alters their offset) and overlap-free via a stable hash offset.
    const smoothK = 1 - Math.exp(-dtSec * 12);
    if (workerSmoothRef.current.size > workers.length * 3) {
      const alive = new Set(workers.map(w => w.id));
      for (const id of [...workerSmoothRef.current.keys()]) {
        if (!alive.has(id)) workerSmoothRef.current.delete(id);
      }
    }
    workers.forEach(worker => {
      const hash = parseInt(worker.id.replace(/\D/g, '')) || 0;
      let renderX = worker.x;
      let renderY = worker.y;

      if (worker.status === 'FREE_STATIONARY') {
        const col = hash % 6;
        const row = Math.floor((hash % 30) / 6);
        renderX = worker.x + (col - 2.5) * 2.8;
        renderY = worker.y + 3.0 + row * 2.8;
      } else if (worker.status === 'WORKING_ON_SITE') {
        const col = hash % 4;
        const row = Math.floor((hash % 16) / 4);
        renderX = worker.x + (col - 1.5) * 2.5;
        renderY = worker.y + 2.0 + row * 2.5;
      } else if (worker.status === 'IN_TRANSIT' || worker.status === 'RETURNING_TO_BASE' || worker.status === 'FREE_PATROLLING') {
        // Stable jitter on the road so overlapping workers in convoy remain distinct
        const jitterX = ((hash % 3) - 1) * 0.8;
        const jitterY = ((Math.floor(hash / 3) % 3) - 1) * 0.8;
        renderX = worker.x + jitterX;
        renderY = worker.y + jitterY;
      }

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

    // Direct worker hover test
    for (const worker of workersRef.current) {
      const hash = parseInt(worker.id.replace(/\D/g, '')) || 0;
      let renderX = worker.x;
      let renderY = worker.y;

      if (worker.status === 'FREE_STATIONARY') {
        const col = hash % 6;
        const row = Math.floor((hash % 30) / 6);
        renderX = worker.x + (col - 2.5) * 2.8;
        renderY = worker.y + 3.0 + row * 2.8;
      } else if (worker.status === 'WORKING_ON_SITE') {
        const col = hash % 4;
        const row = Math.floor((hash % 16) / 4);
        renderX = worker.x + (col - 1.5) * 2.5;
        renderY = worker.y + 2.0 + row * 2.5;
      } else if (worker.status === 'IN_TRANSIT' || worker.status === 'RETURNING_TO_BASE' || worker.status === 'FREE_PATROLLING') {
        const jitterX = ((hash % 3) - 1) * 0.8;
        const jitterY = ((Math.floor(hash / 3) % 3) - 1) * 0.8;
        renderX = worker.x + jitterX;
        renderY = worker.y + jitterY;
      }

      const pos = pctToLogical(renderX, renderY);

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
