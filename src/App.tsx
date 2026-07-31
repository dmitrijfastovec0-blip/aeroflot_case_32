import React, { useState, useEffect } from 'react';
import { OtoTask, ThemeMode } from './types/index';
import { SVO_STANDS } from './constants/index';
import { useSimulationEngine } from './hooks/useSimulationEngine';
import { Header } from './components/Header';
import { CanvasMap } from './components/CanvasMap';
import { RightPanel } from './components/RightPanel';
import { BottomConsole } from './components/BottomConsole';
import { SlaConfirmModal } from './components/SlaConfirmModal';
import { ShiftConfigModal } from './components/ShiftConfigModal';

export function App() {
  const [selectedStandId, setSelectedStandId] = useState<string | null>(SVO_STANDS[0].id);

  // Light / Dark Theme Mode Engine
  const [theme, setTheme] = useState<ThemeMode>('dark');

  // Dev Mode Coordinate Calibration Toggle
  const [isDevMode, setIsDevMode] = useState<boolean>(false);
  const [showMapSublayer, setShowMapSublayer] = useState<boolean>(true);

  // Custom SLA Exceeded Warning Modal State
  const [pendingSlaTask, setPendingSlaTask] = useState<OtoTask | null>(null);

  // Shift Personnel Config Modal State
  const [isShiftModalOpen, setIsShiftModalOpen] = useState<boolean>(false);
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
    simSpeed,
    setSimSpeed,
    isPaused,
    setIsPaused,
    notificationBanner,
    submitTask,
    cancelTask,
    promoteTaskToAog,
    triggerStressTest,
    applyShiftConfig
  } = useSimulationEngine();

  // Apply Custom Shift Configuration
  const handleApplyShiftConfig = (b1: number, b2: number, catA: number, vehicles: number) => {
    setShiftCounts({ b1, b2, catA, vehicles });
    applyShiftConfig(b1, b2, catA, vehicles);
  };

  // Dev Mode Coordinate Click Handler
  const handleDevPointClick = (pctX: number, pctY: number) => {
    console.log(`📍 SVO Calibration Node: { x: ${pctX}%, y: ${pctY}% }`);
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

  const queuedTasks = tasks.filter(t => t.status === 'QUEUED');
  const activeTaskForSelectedStand = tasks.find(t => t.standId === selectedStandId);

  return (
    <div className={`h-screen w-screen overflow-hidden flex flex-col font-sans select-none transition-colors ${
      theme === 'dark' ? 'bg-[#090d11] text-gray-100' : 'bg-slate-100 text-slate-900'
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

      {/* Notification Toast Banner */}
      {notificationBanner && (
        <div className="bg-emerald-600 text-white font-mono text-sm font-bold py-2 px-4 text-center border-b border-emerald-500 animate-pulse shadow-lg z-50 flex items-center justify-center space-x-2">
          <span>{notificationBanner}</span>
        </div>
      )}

      {/* A. Top Header Bar */}
      <Header
        workers={workers}
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
        onTriggerStressTest={triggerStressTest}
      />

      {/* B & C. Central CAD Canvas & Right Task Panel */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* B. Central CAD/GIS Airport Canvas */}
        <CanvasMap
          workers={workers}
          tasks={tasks}
          selectedStandId={selectedStandId}
          onSelectStand={setSelectedStandId}
          theme={theme}
          isDevMode={isDevMode}
          onDevPointClick={handleDevPointClick}
          showMapSublayer={showMapSublayer}
        />

        {/* C. Right Task Constructor Sidebar */}
        <RightPanel
          selectedStandId={selectedStandId}
          onSelectStand={setSelectedStandId}
          workers={workers}
          onLaunchTask={handleLaunchTaskSubmit}
          onTriggerSlaAlert={handleTriggerSlaAlert}
          activeTaskForStand={activeTaskForSelectedStand}
          theme={theme}
        />
      </div>

      {/* D. Bottom Active Tasks & Queue Console Table */}
      <BottomConsole
        tasks={tasks}
        queuedTasks={queuedTasks}
        workers={workers}
        onCancelTask={cancelTask}
        onPromoteToAog={promoteTaskToAog}
        onSelectTask={(task) => setSelectedStandId(task.standId)}
        theme={theme}
      />
    </div>
  );
}

export default App;
