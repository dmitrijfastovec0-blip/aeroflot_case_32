import React, { useState, useEffect, useCallback } from 'react';
import { OtoTask, ThemeMode, Stand } from './types';
import { REALISTIC_SVO_CONFIG, SVO_STANDS } from './constants';
import { generateShiftWorkersWithCustomCounts, getClosestNodeId, findDijkstraShortestPath, getWaypointsForNodePath } from './utils/dispatchLogic';
import { useTaskQueueEngine } from './hooks/useTaskQueueEngine';
import { useSimulationEngine } from './hooks/useSimulationEngine';
import { HeaderBar } from './components/HeaderBar';
import { AirportCanvas } from './components/AirportCanvas';
import { RightDispatcherPanel } from './components/RightDispatcherPanel';
import { BottomConsolePanel } from './components/BottomConsolePanel';
import { SlaAlertModal } from './components/SlaAlertModal';
import { ShiftConfigModal } from './components/ShiftConfigModal';

export function App() {
  const [selectedStandId, setSelectedStandId] = useState<string | null>(SVO_STANDS[0].id);

  // Simulation Speed Multiplier (1x, 5x, 10x, 25x)
  const [simSpeed, setSimSpeed] = useState<number>(5);

  // Pause / Resume Control
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // Light / Dark Theme Mode Engine
  const [theme, setTheme] = useState<ThemeMode>('dark');

  // Dev Mode Coordinate Calibration Toggle
  const [isDevMode, setIsDevMode] = useState<boolean>(false);
  const [showMapSublayer, setShowMapSublayer] = useState<boolean>(true);

  // Notification Toast Banner
  const [notificationBanner, setNotificationBanner] = useState<string | null>(null);

  // Custom SLA Exceeded Warning Modal State
  const [pendingSlaTask, setPendingSlaTask] = useState<OtoTask | null>(null);

  // Shift Personnel Config Modal State
  const [isShiftModalOpen, setIsShiftModalOpen] = useState<boolean>(false);
  const [shiftCounts, setShiftCounts] = useState({ b1: 22, b2: 12, catA: 6, vehicles: 20 });

  // Initial Shift Generation
  const [initialWorkers, setInitialWorkers] = useState(() =>
    generateShiftWorkersWithCustomCounts(22, 12, 6, 20)
  );

  // Sync theme with HTML root class
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Task Queue Engine Custom Hook
  const {
    tasks,
    setTasks,
    queuedTasks,
    submitTask,
    promoteTaskToAog,
    cancelTask,
    tryAutoAssignQueuedTasks,
    triggerStressTest
  } = useTaskQueueEngine();

  // Task Completion Callback (Triggers Auto-Assignment of Queued Tasks!)
  const handleTaskCompleted = useCallback((completedTask: OtoTask) => {
    setNotificationBanner(`✅ 2 мин ТО завершено на стоянке ${completedTask.standLabel}! Карточка задачи закрыта, инженеры переназначены.`);
    setTimeout(() => setNotificationBanner(null), 5000);

    // Remove completed task
    setTasks(prev => prev.filter(t => t.id !== completedTask.id));
  }, [setTasks]);

  // Simulation Engine Custom Hook (60 FPS physics, LERP, 2-minute work timers)
  const {
    workersRef,
    workersState,
    setWorkersState,
    dispatchWorkerToTask,
    returnWorkersToBase
  } = useSimulationEngine({
    initialWorkers,
    simSpeed,
    isPaused,
    tasks,
    onTaskCompleted: handleTaskCompleted
  });

  // Apply Custom Shift Configuration
  const handleApplyShiftConfig = (b1: number, b2: number, catA: number, vehicles: number) => {
    setShiftCounts({ b1, b2, catA, vehicles });
    const updatedShift = generateShiftWorkersWithCustomCounts(b1, b2, catA, vehicles);
    setInitialWorkers(updatedShift);

    setNotificationBanner(`🔄 Смена пересчитана! ${b1 + b2 + catA} инженеров и ${vehicles} авто распределены по базам ПТО.`);
    setTimeout(() => setNotificationBanner(null), 5000);
  };

  // Dev Mode Coordinate Click Handler
  const handleDevPointClick = (pctX: number, pctY: number) => {
    setNotificationBanner(`📍 Координаты разметки: { x: ${pctX}%, y: ${pctY}% } (Выведено в консоль F12)`);
    setTimeout(() => setNotificationBanner(null), 4000);
  };

  // Execute Launch Task (DISPATCH or QUEUED on staff deficit)
  const executeLaunchTask = (newTask: OtoTask) => {
    const { isQueued, task } = submitTask(newTask, workersRef.current);

    if (isQueued) {
      setNotificationBanner(`⏳ Нехватка персонала! Задача ${task.id} поставлена в Приоритетную Очередь (${task.priority}).`);
      setTimeout(() => setNotificationBanner(null), 6000);
    } else {
      // Dispatch workers
      task.crew.forEach(crewMember => {
        dispatchWorkerToTask(crewMember.workerId, task, crewMember.waypoints);
      });
    }
  };

  // Intercept Task Launch if SLA Exceeded -> Show Custom Warning Modal
  const handleTriggerSlaAlert = (newTask: OtoTask) => {
    setPendingSlaTask(newTask);
  };

  // Confirm Launch from Modal
  const handleConfirmSlaExceededTask = () => {
    if (pendingSlaTask) {
      executeLaunchTask(pendingSlaTask);
      setPendingSlaTask(null);
    }
  };

  // Cancel Task
  const handleCancelTask = (taskId: string) => {
    const targetTask = tasks.find(t => t.id === taskId);
    if (!targetTask) return;

    const crewIds = new Set(targetTask.crew.map(c => c.workerId));
    cancelTask(taskId);
    returnWorkersToBase(crewIds);
  };

  // STRESS TEST: Simulate Peak Load Deficit (10 Simultaneous Aircraft Calls)
  const handleTriggerStressTest = () => {
    const generatedTasks = triggerStressTest(workersRef.current);

    // Dispatch available workers for dispatched tasks
    generatedTasks.forEach(task => {
      if (task.status === 'DISPATCHED') {
        task.crew.forEach(c => dispatchWorkerToTask(c.workerId, task, c.waypoints));
      }
    });

    setNotificationBanner(`💥 СТРЕСС-ТЕСТ: Сгенерировано 10 вызовов! Персонал задействован, остальные задачи встали в очередь.`);
    setTimeout(() => setNotificationBanner(null), 6000);
  };

  const activeTaskForSelectedStand = tasks.find(t => t.standId === selectedStandId);

  return (
    <div className={`h-screen w-screen overflow-hidden flex flex-col font-sans select-none transition-colors ${
      theme === 'dark' ? 'bg-[#090d11] text-gray-100' : 'bg-slate-100 text-slate-900'
    }`}>
      {/* Custom SLA Warning Modal */}
      <SlaAlertModal
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

      {/* Notification Toast Banner */}
      {notificationBanner && (
        <div className="bg-emerald-600 text-white font-mono text-sm font-bold py-2 px-4 text-center border-b border-emerald-500 animate-pulse shadow-lg z-50 flex items-center justify-center space-x-2">
          <span>{notificationBanner}</span>
        </div>
      )}

      {/* A. Top Header Bar */}
      <HeaderBar
        workers={workersState}
        simSpeed={simSpeed}
        onSimSpeedChange={setSimSpeed}
        isPaused={isPaused}
        onTogglePause={() => setIsPaused(prev => !prev)}
        theme={theme}
        onToggleTheme={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
        onOpenShiftConfig={() => setIsShiftModalOpen(true)}
        isDevMode={isDevMode}
        onToggleDevMode={() => setIsDevMode(prev => !prev)}
        showMapSublayer={showMapSublayer}
        onToggleMapSublayer={() => setShowMapSublayer(prev => !prev)}
        onTriggerStressTest={handleTriggerStressTest}
      />

      {/* B & C. Central CAD Canvas & Right Task Panel */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* B. Central CAD/GIS Airport Canvas */}
        <AirportCanvas
          workers={workersRef.current}
          tasks={tasks}
          selectedStandId={selectedStandId}
          onSelectStand={setSelectedStandId}
          theme={theme}
          isDevMode={isDevMode}
          onDevPointClick={handleDevPointClick}
          showMapSublayer={showMapSublayer}
        />

        {/* C. Right Task Constructor Sidebar */}
        <RightDispatcherPanel
          selectedStandId={selectedStandId}
          onSelectStand={setSelectedStandId}
          workers={workersState}
          onLaunchTask={executeLaunchTask}
          onTriggerSlaAlert={handleTriggerSlaAlert}
          activeTaskForStand={activeTaskForSelectedStand}
          theme={theme}
        />
      </div>

      {/* D. Bottom Active Tasks & Queue Console Table */}
      <BottomConsolePanel
        tasks={tasks}
        queuedTasks={queuedTasks}
        workers={workersState}
        onCancelTask={handleCancelTask}
        onPromoteToAog={promoteTaskToAog}
        onSelectTask={(task) => setSelectedStandId(task.standId)}
        theme={theme}
      />
    </div>
  );
}

export default App;
