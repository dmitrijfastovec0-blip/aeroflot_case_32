import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Worker, HoverTooltipData, OtoTask, TaskCrewMember, ThemeMode } from '../types';
import { SVO_BUILDINGS, SVO_FACILITIES, SVO_NODES, SVO_EDGES, CANVAS_THEMES } from '../constants';

interface AirportCanvasProps {
  workers: Worker[];
  tasks: OtoTask[];
  selectedStandId: string | null;
  onSelectStand: (standId: string) => void;
  theme: ThemeMode;
}

export const AirportCanvas: React.FC<AirportCanvasProps> = ({
  workers,
  tasks,
  selectedStandId,
  onSelectStand,
  theme
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  // Quick Preset Focus
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

  const getNodePos = useCallback((id: string) => {
    const fac = SVO_FACILITIES.find(f => f.id === id);
    if (fac) return pctToLogical(fac.x, fac.y);

    const node = SVO_NODES.find(n => n.id === id);
    if (node) return pctToLogical(node.x, node.y);

    return { x: 0, y: 0 };
  }, [pctToLogical]);

  // Main Render Loop with Light/Dark Theme palette
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
        // Terminal D Arc Dome
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
          // Runway (RWY)
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
          // Terminal building polygon
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

    // LAYER 2: INTERACTIVE OVERLAY

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

    // Aircraft Stands Markers (14px BOLD)
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

      // Stand Label Text (14px BOLD)
      ctx.fillStyle = isSelected ? '#38bdf8' : isHovered ? '#238636' : isTaskActive ? '#fbbf24' : palette.standText;
      ctx.font = '700 14px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(stand.label, pos.x, pos.y - 2);

      // Airplane vector silhouette
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

    // WORKER RENDERING (NO PERMANENT TEXT ON MAP!)
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

    // Render Individual Worker Markers
    individualWorkers.forEach(worker => {
      const pos = pctToLogical(worker.x, worker.y);

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

    // Render Grouped Crew Vehicle Markers (CLEAN CIRCULAR MARKER - NO PERMANENT TEXT ON MAP!)
    groupedTransitWorkers.forEach((group) => {
      if (group.length === 0) return;
      const avgX = group.reduce((acc, w) => acc + w.x, 0) / group.length;
      const avgY = group.reduce((acc, w) => acc + w.y, 0) / group.length;
      const pos = pctToLogical(avgX, avgY);

      ctx.save();
      // Clean vehicle dot marker without permanent text overlay
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
  }, [panOffset, zoomScale, workers, tasks, selectedStandId, dashOffset, hoveredNodeId, getNodePos, pctToLogical, theme]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  useEffect(() => {
    const handleResize = () => renderCanvas();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderCanvas]);

  // Smooth Zoom (0.5x to 4.0x) around cursor
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

    // Hit Testing for Hover (Stands, Facilities, AND Grouped Crew Vehicles)
    let foundNodeId: string | null = null;
    let foundHit: HoverTooltipData | null = null;

    // Check Grouped Crew Vehicles Hover Tooltip!
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

    for (const stand of SVO_NODES.filter(n => n.type === 'STAND')) {
      const pos = pctToLogical(stand.x, stand.y);
      if (Math.abs(lx - pos.x) <= 28 && Math.abs(ly - pos.y) <= 18) {
        onSelectStand(stand.id);
        break;
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative flex-1 h-full w-full overflow-hidden cursor-crosshair select-none transition-colors ${
        theme === 'dark' ? 'bg-[#090d11]' : 'bg-[#f1f5f9]'
      }`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Floating View Controls */}
      <div className={`absolute top-3 left-3 flex items-center border rounded-lg p-1.5 space-x-1.5 shadow-lg z-10 font-mono text-xs ${
        theme === 'dark' ? 'bg-[#070a0e]/90 border-[#263345]' : 'bg-white/90 border-slate-300'
      }`}>
        <button
          onClick={() => handlePresetFocus('ALL')}
          className={`px-3 py-1 rounded border transition-colors ${
            theme === 'dark' ? 'bg-[#121820] hover:bg-[#1e293b] text-gray-200 border-[#263345]' : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
          }`}
        >
          🗺️ Весь SVO
        </button>
        <button
          onClick={() => handlePresetFocus('NORTH')}
          className={`px-3 py-1 rounded border transition-colors ${
            theme === 'dark' ? 'bg-[#121820] hover:bg-[#1e293b] text-sky-400 border-[#263345]' : 'bg-slate-100 hover:bg-slate-200 text-sky-600 border-slate-300'
          }`}
        >
          🏢 Север B/C
        </button>
        <button
          onClick={() => handlePresetFocus('SOUTH')}
          className={`px-3 py-1 rounded border transition-colors ${
            theme === 'dark' ? 'bg-[#121820] hover:bg-[#1e293b] text-emerald-400 border-[#263345]' : 'bg-slate-100 hover:bg-slate-200 text-emerald-600 border-slate-300'
          }`}
        >
          🏬 Юг D/E/F
        </button>
        <div className="h-4 w-px bg-slate-400 dark:bg-[#263345] mx-1" />
        <button
          onClick={() => handlePresetFocus('RESET')}
          className={`px-2.5 py-1 rounded border transition-colors ${
            theme === 'dark' ? 'bg-[#121820] hover:bg-[#1e293b] text-gray-400 border-[#263345]' : 'bg-slate-100 hover:bg-slate-200 text-slate-500 border-slate-300'
          }`}
        >
          🔍 Сброс
        </button>
      </div>

      {/* Map Legend */}
      <div className={`absolute bottom-3 left-3 border rounded-lg px-3 py-2 font-mono text-xs space-y-1.5 z-10 ${
        theme === 'dark' ? 'bg-[#070a0e]/90 border-[#263345] text-gray-300' : 'bg-white/90 border-slate-300 text-slate-800 shadow-md'
      }`}>
        <div className="font-bold border-b border-slate-300 dark:border-[#263345] pb-1 text-xs">ДИСЛОКАЦИЯ И СТАТУСЫ</div>
        <div className="flex items-center space-x-2">
          <span className="w-3 h-3 rounded-full bg-[#238636]" />
          <span>🟢 Свободен (на базе / патруль)</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-3 h-3 rounded-full bg-[#38bdf8]" />
          <span>🔵 В пути на задание</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-3 h-3 rounded-full bg-[#f59e0b]" />
          <span>🟡 Возврат на базу</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-3 h-3 rounded-full bg-[#da3633]" />
          <span>🔴 На объекте (ТО на ВС)</span>
        </div>
      </div>

      {/* Hover Tooltip Popover (Including Grouped Crew Tooltip!) */}
      {hoverTooltip && (
        <div
          className={`fixed z-50 pointer-events-none border rounded-lg p-3 shadow-2xl min-w-[240px] max-w-[320px] font-mono text-xs ${
            theme === 'dark' ? 'bg-[#070a0e] border-[#238636] text-gray-200' : 'bg-white border-emerald-600 text-slate-900'
          }`}
          style={{
            left: `${Math.min(window.innerWidth - 340, hoverTooltip.x + 15)}px`,
            top: `${Math.min(window.innerHeight - 200, hoverTooltip.y + 15)}px`
          }}
        >
          <div className="font-bold text-sm text-emerald-500 border-b border-slate-300 dark:border-[#263345] pb-1 mb-1">
            {hoverTooltip.title}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">{hoverTooltip.subtitle}</div>
          <div className="space-y-1 text-xs">
            {hoverTooltip.details.map((d, idx) => (
              <div key={idx} className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">{d.label}</span>
                <span className="font-semibold ml-2 text-right">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
