import React, { useState, useEffect, useCallback } from 'react';
import { OtoTask, ThemeMode, Stand, WeatherMode, AirportElement, AirportConnection, AirfieldMode, Worker } from './types/index';
import { SVO_STANDS, DEFECT_TYPES } from './constants/index';
import { useSimulationEngine } from './hooks/useSimulationEngine';
import { Header } from './components/Header';
import { CanvasMap } from './components/CanvasMap';
import { RightPanel } from './components/RightPanel';
import { BottomConsole } from './components/BottomConsole';
import { SlaConfirmModal } from './components/SlaConfirmModal';
import { ShiftConfigModal } from './components/ShiftConfigModal';
import { AnalyticsModal } from './components/AnalyticsModal';
import { StandRadialMenu } from './components/StandRadialMenu';
import { TimelineModal } from './components/TimelineModal';
import { WorkerEditModal } from './components/WorkerEditModal';
import { LocationBuilderWorkspace } from './components/LocationBuilderWorkspace';

export function App() {
  const [selectedStandId, setSelectedStandId] = useState<string | null>(SVO_STANDS[0].id);

  // Light / Dark Theme Mode Engine
  const [theme, setTheme] = useState<ThemeMode>('dark');

  // Gantt Chart Timeline Modal State
  const [isTimelineOpen, setIsTimelineOpen] = useState<boolean>(false);

  // Comparative Analytics Modal State
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState<boolean>(false);

  // Tracked Worker Unit State
  const [trackedWorkerId, setTrackedWorkerId] = useState<string | null>(null);

  // Worker Edit Modal State
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);

  // Stand Radial Menu State
  const [radialMenu, setRadialMenu] = useState<{ stand: Stand; x: number; y: number } | null>(null);

  // Custom SLA Exceeded Warning Modal State
  const [pendingSlaTask, setPendingSlaTask] = useState<OtoTask | null>(null);

  // Shift Personnel Config Modal State
  const [isShiftModalOpen, setIsShiftModalOpen] = useState<boolean>(false);
  const [isLocationBuilderOpen, setIsLocationBuilderOpen] = useState(false);
  const [airfieldMode, setAirfieldMode] = useState<AirfieldMode>('SVO');
  const [customElements, setCustomElements] = useState<AirportElement[]>([]);
  const [customConnections, setCustomConnections] = useState<AirportConnection[]>([]);
  const [shiftCounts, setShiftCounts] = useState({ b1: 22, b2: 12, catA: 6, vehicles: 20 });

  // Sync theme with HTML root class
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // UNIFIED SIMULATION ENGINE HOOK
  const {
    workers,
    tasks,
    archivedTasks,
    allHistoricalTasks,
    workersRef,
    tasksRef,
    simSpeed,
    setSimSpeed,
    isPaused,
    setIsPaused,
    notificationBanner,
    showNotification,
    submitTask,
    cancelTask,
    applyShiftConfig,
    updateWorker,
    manuallyAssignTask,
    dispatchStats,
    roiMetrics,
    weatherMode,
    setWeatherMode,
    runScenario,
    activeScenarioName,
    activeStands,
    activeFacilities,
    simClockSec
  } = useSimulationEngine(customElements, customConnections, airfieldMode);

  // GLOBAL KEYBOARD SHORTCUTS HANDLER
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore key events when typing inside text inputs, textareas, or selects
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPaused(prev => !prev);
      } else if (e.key === '1') {
        setSimSpeed(1);
      } else if (e.key === '2') {
        setSimSpeed(2);
      } else if (e.key === '3') {
        setSimSpeed(5);
      } else if (e.key === '4') {
        setSimSpeed(10);
      } else if (e.key === '5') {
        setSimSpeed(50);
      } else if (e.key === '6') {
        setSimSpeed(100);
      } else if (e.key === 'Escape' || e.code === 'Escape') {
        // Clear tracking, modals, radial menu
        setTrackedWorkerId(null);
        setRadialMenu(null);
        setIsAnalyticsOpen(false);
        setIsShiftModalOpen(false);
        setPendingSlaTask(null);
      } else if (e.key.toLowerCase() === 'w') {
        const modes: WeatherMode[] = ['CLEAR', 'RAIN', 'BLIZZARD', 'NIGHT'];
        const currentIdx = modes.indexOf(weatherMode);
        const nextMode = modes[(currentIdx + 1) % modes.length];
        setWeatherMode(nextMode);
      } else if (e.key.toLowerCase() === 'a') {
        setIsAnalyticsOpen(prev => !prev);
      } else if (e.key.toLowerCase() === 's') {
        setIsShiftModalOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setIsPaused, setSimSpeed, setWeatherMode]);

  // Apply Custom Shift Configuration
  const handleApplyShiftConfig = (b1: number, b2: number, catA: number, vehicles: number) => {
    setShiftCounts({ b1, b2, catA, vehicles });
    applyShiftConfig(b1, b2, catA, vehicles);
  };

  // Intercept Task Launch if SLA Exceeded -> Show Custom Warning Modal
  const handleLaunchTaskSubmit = (newTask: OtoTask) => {
    submitTask(newTask);
  };

  const handleTriggerSlaAlert = (newTask: OtoTask) => {
    setPendingSlaTask(newTask);
  };

  // Confirm Launch from Modal
  const handleConfirmSlaExceededTask = () => {
    if (pendingSlaTask) {
      submitTask(pendingSlaTask);
      setPendingSlaTask(null);
    }
  };

  // Quick Dispatch from Radial Menu
  const handleRadialQuickLaunch = (defectId: string) => {
    if (!radialMenu) return;
    const defect = DEFECT_TYPES.find(d => d.id === defectId) || DEFECT_TYPES[0];
    const catLabel = defect.categoryCode === 'B1' ? 'B1 (Двигатели / Планер)' : defect.categoryCode === 'B2' ? 'B2 (Авионика / Приборы)' : 'Cat A (Осмотр)';
    const newTask: OtoTask = {
      id: `TASK-${Date.now().toString().slice(-4)}`,
      standId: radialMenu.stand.id,
      standLabel: radialMenu.stand.label,
      aircraftType: radialMenu.stand.aircraftType || 'Airbus A320',
      categoryCode: defect.categoryCode,
      categoryLabel: catLabel,
      defectLabel: defect.name,
      priority: defect.categoryCode === 'B1' ? 'URGENT' : 'ROUTINE',
      status: 'QUEUED',
      requiredCrew: defect.requiredCrew,
      crew: [],
      arrivedCount: 0,
      maxEtaMinutes: 0,
      slaLimitMinutes: 15,
      withinSla: true,
      createdAt: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      elapsedWorkSec: 0,
      targetWorkSec: 120
    };
    submitTask(newTask);
    showNotification(`🚀 Экспресс-вызов ${defect.name} на стоянку ${radialMenu.stand.label}!`);
  };

  const queuedTasks = React.useMemo(() => {
    return tasks
      .filter(t => t.status === 'QUEUED')
      .sort((a, b) => {
        const getRank = (p: string) => p === 'AOG' ? 1 : p === 'URGENT' ? 2 : 3;
        const rankA = getRank(a.priority);
        const rankB = getRank(b.priority);
        if (rankA !== rankB) return rankA - rankB;
        return (b.elapsedQueueSec || 0) - (a.elapsedQueueSec || 0);
      });
  }, [tasks]);

  const activeTaskForSelectedStand = React.useMemo(() => {
    return tasks.find(t => (t.status === 'DISPATCHED' || t.status === 'WORKING') && t.standId === selectedStandId);
  }, [tasks, selectedStandId]);

  return (
    <div className={`h-screen w-screen overflow-hidden flex flex-col font-sans select-none relative ${
      theme === 'dark' ? 'bg-[#05080c] text-gray-100' : 'bg-slate-100 text-slate-900'
    }`}>
      {/* Custom SLA Warning Modal */}
      <SlaConfirmModal
        isOpen={pendingSlaTask !== null}
        taskData={pendingSlaTask}
        onConfirm={handleConfirmSlaExceededTask}
        onCancel={() => setPendingSlaTask(null)}
        theme={theme}
      />

      {/* Shift Personnel Config Modal */}
      <ShiftConfigModal
        isOpen={isShiftModalOpen}
        onClose={() => setIsShiftModalOpen(false)}
        onApplyShift={handleApplyShiftConfig}
        currentB1={shiftCounts.b1}
        currentB2={shiftCounts.b2}
        currentCatA={shiftCounts.catA}
        currentVehicles={shiftCounts.vehicles}
        theme={theme}
      />

      {/* Comparative Analytics Dashboard Modal */}
      <AnalyticsModal
        isOpen={isAnalyticsOpen}
        onClose={() => setIsAnalyticsOpen(false)}
        roiMetrics={roiMetrics}
        dispatchStats={dispatchStats}
        theme={theme}
      />

      {/* Gantt Chart Timeline Modal */}
      <TimelineModal
        isOpen={isTimelineOpen}
        onClose={() => setIsTimelineOpen(false)}
        tasks={tasks}
        archivedTasks={allHistoricalTasks}
        workers={workers}
        theme={theme}
        simClockSec={simClockSec}
        stands={activeStands}
      />

      {/* Stand Context / Radial Menu */}
      {radialMenu && (
        <StandRadialMenu
          stand={radialMenu.stand}
          x={radialMenu.x}
          y={radialMenu.y}
          onClose={() => setRadialMenu(null)}
          onQuickLaunch={handleRadialQuickLaunch}
          onOpenPanel={() => {
            setSelectedStandId(radialMenu.stand.id);
            setRadialMenu(null);
          }}
          onFocusCamera={() => {
            setSelectedStandId(radialMenu.stand.id);
            setRadialMenu(null);
          }}
          theme={theme}
        />
      )}

      {/* FLOATING TOAST NOTIFICATION BANNER */}
      {notificationBanner && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 pointer-events-none bg-emerald-600/95 text-white font-mono text-xs md:text-sm font-bold py-2.5 px-6 rounded-xl border border-emerald-400 shadow-2xl animate-bounce flex items-center justify-center space-x-2 backdrop-blur-md">
          <span>{notificationBanner}</span>
        </div>
      )}

      {/* 1. Unified Sleek Top Header Bar */}
      <Header
        workers={workers}
        simSpeed={simSpeed}
        onSimSpeedChange={setSimSpeed}
        isPaused={isPaused}
        onTogglePause={() => setIsPaused(prev => !prev)}
        theme={theme}
        onToggleTheme={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
        onOpenShiftConfig={() => setIsShiftModalOpen(true)}
        onOpenLocationBuilder={() => setIsLocationBuilderOpen(true)}
        airfieldMode={airfieldMode}
        onToggleAirfieldMode={() => {
          setAirfieldMode((prev: AirfieldMode) => {
            const next = prev === 'SVO' ? 'CUSTOM' : 'SVO';
            if (next === 'CUSTOM' && customElements.length === 0) {
              setIsLocationBuilderOpen(true);
            }
            return next;
          });
        }}
        roiMetrics={roiMetrics}
        onRunScenario={runScenario}
        weatherMode={weatherMode}
        onWeatherChange={setWeatherMode}
        onOpenAnalytics={() => setIsAnalyticsOpen(true)}
        onOpenTimeline={() => setIsTimelineOpen(true)}
      />

      {/* 2. Main Fullscreen CAD Airport Map & Floating Drawer Overlays */}
      <main className="flex-1 w-full h-full relative overflow-hidden">
        {/* Fullscreen Interactive CAD Airport Canvas */}
         <CanvasMap
          workersRef={workersRef}
          tasksRef={tasksRef}
          selectedStandId={selectedStandId}
          onSelectStand={(standId) => {
            setSelectedStandId(standId);
          }}
          onOpenStandContext={(standId) => {
            const standObj = activeStands.find(s => s.id === standId) || SVO_STANDS.find(s => s.id === standId);
            if (standObj) {
              const rect = document.body.getBoundingClientRect();
              setRadialMenu({ stand: standObj, x: rect.width / 2, y: rect.height / 2 });
            }
          }}
          customElements={customElements}
          customConnections={customConnections}
          airfieldMode={airfieldMode}
          theme={theme}
          weatherMode={weatherMode}
          isDevMode={false}
          showMapSublayer={false}
          trackedWorkerId={trackedWorkerId}
          onStopTracking={() => setTrackedWorkerId(null)}
          onSelectWorker={(w) => setEditingWorker(w)}
        />

        {isLocationBuilderOpen && (
          <LocationBuilderWorkspace
            initialElements={customElements}
            initialConnections={customConnections}
            onElementsChange={setCustomElements}
            onConnectionsChange={setCustomConnections}
            onClose={() => setIsLocationBuilderOpen(false)}
            onOpenShift={() => {
              setIsLocationBuilderOpen(false);
              setIsShiftModalOpen(true);
            }}
            onRunSimulation={(els, conns) => {
              setCustomElements(els);
              setCustomConnections(conns);
              setIsLocationBuilderOpen(false);
              setAirfieldMode('CUSTOM');
              runScenario('standard');
            }}
            theme={theme}
          />
        )}

        {/* Floating Collapsible Right Task Drawer */}
        <RightPanel
          selectedStandId={selectedStandId}
          onSelectStand={setSelectedStandId}
          workers={workers}
          tasks={tasks}
          onLaunchTask={handleLaunchTaskSubmit}
          onManualAssign={manuallyAssignTask}
          onTriggerSlaAlert={handleTriggerSlaAlert}
          onNotify={showNotification}
          activeTaskForStand={activeTaskForSelectedStand}
          theme={theme}
          trackedWorkerId={trackedWorkerId}
          activeScenarioName={activeScenarioName}
          archivedTasks={archivedTasks}
          stands={activeStands}
          customElements={customElements}
          customConnections={customConnections}
          onTrackWorker={(workerId) => {
            setTrackedWorkerId(prev => prev === workerId ? null : workerId);
            const workerObj = workers.find(w => w.id === workerId);
            if (workerObj) {
              showNotification(`🎯 Камера зафиксирована на юните ${workerObj.name}`);
            }
          }}
        />

        {/* Floating Collapsible Bottom Console & Status Bar */}
        <BottomConsole
          tasks={tasks}
          queuedTasks={queuedTasks}
          workers={workers}
          onCancelTask={cancelTask}
          onSelectTask={(task) => setSelectedStandId(task.standId)}
          theme={theme}
          trackedWorkerId={trackedWorkerId}
          onTrackWorker={(workerId) => {
            setTrackedWorkerId(prev => prev === workerId ? null : workerId);
            const workerObj = workers.find(w => w.id === workerId);
            if (workerObj) {
              showNotification(`🎯 Активирован режим слежения за юнитом ${workerObj.name}`);
            }
          }}
        />

        {/* Worker Parameter Editor Modal */}
        <WorkerEditModal
          worker={editingWorker}
          isOpen={!!editingWorker}
          onClose={() => setEditingWorker(null)}
          onSaveWorker={updateWorker}
          theme={theme}
          stands={activeStands}
          facilities={activeFacilities}
        />
      </main>
    </div>
  );
}

export default App;
