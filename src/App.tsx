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
import { AnalyticsModal } from './components/AnalyticsModal';

export function App() {
  const [selectedStandId, setSelectedStandId] = useState<string | null>(SVO_STANDS[0].id);

  // Light / Dark Theme Mode Engine
  const [theme, setTheme] = useState<ThemeMode>('dark');

  // Comparative Analytics Modal State
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState<boolean>(false);

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
    dispatchStats,
    roiMetrics,
    weatherMode,
    setWeatherMode,
    runScenario
  } = useSimulationEngine();

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

  const queuedTasks = tasks
    .filter(t => t.status === 'QUEUED')
    .sort((a, b) => {
      const getRank = (p: string) => p === 'AOG' ? 1 : p === 'URGENT' ? 2 : 3;
      const rankA = getRank(a.priority);
      const rankB = getRank(b.priority);
      if (rankA !== rankB) return rankA - rankB;
      return (b.elapsedQueueSec || 0) - (a.elapsedQueueSec || 0);
    });
  const activeTaskForSelectedStand = tasks.find(t => (t.status === 'DISPATCHED' || t.status === 'WORKING') && t.standId === selectedStandId);

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
        roiMetrics={roiMetrics}
        onRunScenario={runScenario}
        weatherMode={weatherMode}
        onWeatherChange={setWeatherMode}
        onOpenAnalytics={() => setIsAnalyticsOpen(true)}
      />

      {/* 2. Main Fullscreen CAD Airport Map & Floating Drawer Overlays */}
      <main className="flex-1 w-full h-full relative overflow-hidden">
        {/* Fullscreen Interactive CAD Airport Canvas */}
        <CanvasMap
          workersRef={workersRef}
          tasksRef={tasksRef}
          selectedStandId={selectedStandId}
          onSelectStand={setSelectedStandId}
          theme={theme}
          weatherMode={weatherMode}
          isDevMode={false}
          showMapSublayer={true}
        />

        {/* Floating Collapsible Right Task Drawer */}
        <RightPanel
          selectedStandId={selectedStandId}
          onSelectStand={setSelectedStandId}
          workers={workers}
          onLaunchTask={handleLaunchTaskSubmit}
          onTriggerSlaAlert={handleTriggerSlaAlert}
          onNotify={showNotification}
          activeTaskForStand={activeTaskForSelectedStand}
          theme={theme}
        />

        {/* Floating Collapsible Bottom Console & Status Bar */}
        <BottomConsole
          tasks={tasks}
          queuedTasks={queuedTasks}
          workers={workers}
          onCancelTask={cancelTask}
          onSelectTask={(task) => setSelectedStandId(task.standId)}
          theme={theme}
        />
      </main>
    </div>
  );
}

export default App;
