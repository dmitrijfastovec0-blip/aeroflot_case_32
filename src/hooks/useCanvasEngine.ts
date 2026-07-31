import { useRef, useEffect, useState, useCallback } from 'react';
import { Worker, OtoTask, HoverTooltipData, ThemeMode, TaskCrewMember } from '../types/index';
import { SVO_BUILDINGS, SVO_FACILITIES, SVO_NODES, SVO_EDGES, CANVAS_THEMES } from '../constants/index';

interface UseCanvasEngineProps {
  workers: Worker[];
  tasks: OtoTask[];
  selectedStandId: string | null;
  onSelectStand: (standId: string) => void;
  theme: ThemeMode;
  isDevMode: boolean;
  onDevPointClick?: (pctX: number, pctY: number) => void;
  showMapSublayer: boolean;
}

export function useCanvasEngine({
  workers,
  tasks,
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

  // Animated dash offset for route lines
  const [dashOffset, setDashOffset] = useState<number>(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setDashOffset(prev => (prev - 1.2) % 20);
    }, 40);
    return () => clearInterval(interval);
  }, []);

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

    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(zoomScale, zoomScale);

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

    // Road Topology Edges
    SVO_EDGES.forEach(edge => {
      const p1 = getNodePos(edge.from);
      const p2 = getNodePos(edge.to);

      ctx.save();
      if (edge.type === 'TUNNEL') {
        ctx.strokeStyle = palette.tunnelLine;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.lineDashOffset = dashOffset;

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      } else {
        ctx.strokeStyle = palette.roadLine;
        ctx.lineWidth = 1.5;

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

    // Aircraft Stands Markers
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

      ctx.fillStyle = bgColor;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = isSelected || isHovered || isTaskActive ? 2.5 : 1.2;

      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 4);
      ctx.fill();
      ctx.stroke();

      if (isSelected) {
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      ctx.fillStyle = isSelected ? '#38bdf8' : isHovered ? '#238636' : isTaskActive ? '#fbbf24' : palette.standText;
      ctx.font = '700 14px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(stand.label, pos.x, pos.y - 2);

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

    // WORKER RENDERING WITH VISUAL CLUSTER JITTER FOR BASE WORKERS
    const groupedTransitWorkers = new Map<string, Worker[]>();
    const individualWorkers: Worker[] = [];

    workers.forEach(worker => {
      if (worker.status === 'IN_TRANSIT' && worker.vehicle === 'APRON_VEHICLE' && worker.currentTaskId) {
        const key = `${worker.currentTaskId}_${worker.baseId}`;
        if (!groupedTransitWorkers.has(key)) {
          groupedTransitWorkers.set(key, []);
        }
        groupedTransitWorkers.get(key)!.push(worker);
      } else {
        individualWorkers.push(worker);
      }
    });

    // Count stationary workers per base to arrange them in a neat visual grid cluster
    const baseWorkerCounts = new Map<string, number>();

    individualWorkers.forEach(worker => {
      let renderX = worker.x;
      let renderY = worker.y;

      if (worker.status === 'FREE_STATIONARY') {
        const baseId = worker.baseId;
        const count = baseWorkerCounts.get(baseId) || 0;
        baseWorkerCounts.set(baseId, count + 1);

        // Visual offset grid around base badge so all 10 workers at base are distinctly visible!
        const col = count % 4;
        const row = Math.floor(count / 4);
        renderX = worker.x + (col - 1.5) * 1.5;
        renderY = worker.y + 2.5 + row * 1.5;
      }

      const pos = pctToLogical(renderX, renderY);

      ctx.save();
      let statusColor = '#238636'; // FREE = Green
      if (worker.status === 'IN_TRANSIT') statusColor = '#38bdf8'; // IN_TRANSIT = Blue
      if (worker.status === 'RETURNING_TO_BASE') statusColor = '#f59e0b'; // RETURNING = Amber
      if (worker.status === 'WORKING_ON_SITE') statusColor = '#da3633'; // WORKING = Red

      if (worker.status === 'FREE_PATROLLING') {
        ctx.strokeStyle = '#23863688';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 14, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = statusColor;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 10.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = palette.bg;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 8.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = statusColor;
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(worker.categoryCode, pos.x, pos.y);

      ctx.restore();
    });

    groupedTransitWorkers.forEach((group) => {
      if (group.length === 0) return;
      const avgX = group.reduce((acc, w) => acc + w.x, 0) / group.length;
      const avgY = group.reduce((acc, w) => acc + w.y, 0) / group.length;
      const pos = pctToLogical(avgX, avgY);

      ctx.save();
      ctx.fillStyle = '#0284c7';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '700 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`🚘${group.length}`, pos.x, pos.y);

      ctx.restore();
    });

    ctx.restore(); // Restore pan/zoom
    ctx.restore(); // Restore dpr
  }, [panOffset, zoomScale, workers, tasks, selectedStandId, dashOffset, hoveredNodeId, getNodePos, pctToLogical, theme, showMapSublayer, isMapImageLoaded]);

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

    const groupedMap = new Map<string, Worker[]>();
    workers.forEach(w => {
      if (w.status === 'IN_TRANSIT' && w.vehicle === 'APRON_VEHICLE' && w.currentTaskId) {
        const k = `${w.currentTaskId}_${w.baseId}`;
        if (!groupedMap.has(k)) groupedMap.set(k, []);
        groupedMap.get(k)!.push(w);
      }
    });

    for (const [k, grp] of groupedMap.entries()) {
      if (grp.length === 0) continue;
      const avgX = grp.reduce((acc, w) => acc + w.x, 0) / grp.length;
      const avgY = grp.reduce((acc, w) => acc + w.y, 0) / grp.length;
      const pos = pctToLogical(avgX, avgY);

      if (Math.hypot(lx - pos.x, ly - pos.y) <= 18) {
        const task = tasks.find(t => t.id === grp[0].currentTaskId);
        const standLabel = task ? task.standLabel : 'Стоянка назначения';

        foundHit = {
          type: 'WORKER',
          title: `📋 Объединенная бригада ОТО (${grp.length} чел.)`,
          subtitle: `🚘 Спецавтомобиль ОТО • В пути к ${standLabel}`,
          details: [
            { label: '• Специалисты:', value: grp.map(w => `${w.name} (${w.categoryCode})`).join(', ') },
            { label: '• База выезда:', value: grp[0].baseId },
            { label: '• Пункт назначения:', value: standLabel }
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
