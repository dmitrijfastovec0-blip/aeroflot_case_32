import React, { useState, useEffect, useRef } from 'react';
import { Worker, OtoTask, WorkerStatus, ThemeMode } from './types';
import { REALISTIC_SVO_CONFIG, SVO_STANDS, SVO_NODES } from './constants';
import { generateShiftWorkers, getClosestNodeId, findDijkstraShortestPath, getWaypointsForNodePath } from './utils/dispatchLogic';
import { HeaderBar } from './components/HeaderBar';
import { AirportCanvas } from './components/AirportCanvas';
import { RightDispatcherPanel } from './components/RightDispatcherPanel';
import { BottomConsolePanel } from './components/BottomConsolePanel';
import { SlaAlertModal } from './components/SlaAlertModal';

export function App() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [tasks, setTasks] = useState<OtoTask[]>([]);
  const [selectedStandId, setSelectedStandId] = useState<string | null>(SVO_STANDS[0].id);

  // Simulation Speed Multiplier (1x, 5x, 10x, 25x)
  const [simSpeed, setSimSpeed] = useState<number>(5);

  // Pause / Resume Control
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // Light / Dark Theme Mode Engine
  const [theme, setTheme] = useState<ThemeMode>('dark');

  // Work completion notification banner
  const [completionBanner, setCompletionBanner] = useState<string | null>(null);

  // Custom SLA Exceeded Warning Modal State
  const [pendingSlaTask, setPendingSlaTask] = useState<OtoTask | null>(null);

  // Workers Ref to isolate physics loop from React state re-render lags!
  const workersRef = useRef<Worker[]>([]);

  // Sync theme with HTML root class
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Initialize Shift Workers: ALL GREEN AT START!
  useEffect(() => {
    const shift = generateShiftWorkers(REALISTIC_SVO_CONFIG.totalWorkersInShift);
    workersRef.current = shift;
    setWorkers(shift);
  }, []);

  // Task Work Execution Cycle Timers Map (taskId -> elapsed ms)
  const taskWorkTimersRef = useRef<Map<string, number>>(new Map());

  // Continuous Physics Delta-Time Animation Loop (Using workersRef for zero React re-render lag)
  const lastTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    let animFrameId: number;

    const tick = () => {
      const now = Date.now();
      const dtSec = Math.min(0.2, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      // If paused, skip position update physics
      if (!isPaused) {
        let workersUpdated = false;

        workersRef.current = workersRef.current.map((worker): Worker => {
          // A. IN_TRANSIT or RETURNING_TO_BASE
          if ((worker.status === 'IN_TRANSIT' || worker.status === 'RETURNING_TO_BASE') && worker.pathWaypoints && worker.pathWaypoints.length > 1) {
            workersUpdated = true;
            const currIdx = worker.currentSegmentIndex || 0;

            if (currIdx >= worker.pathWaypoints.length - 1) {
              const finalStatus: WorkerStatus = worker.status === 'IN_TRANSIT' ? 'WORKING_ON_SITE' : 'FREE_STATIONARY';
              return { ...worker, status: finalStatus, pathWaypoints: undefined };
            }

            const targetPt = worker.pathWaypoints[currIdx + 1];
            const dx = targetPt.x - worker.x;
            const dy = targetPt.y - worker.y;
            const distPct = Math.hypot(dx, dy);

            if (distPct < 0.3) {
              const nextIdx = currIdx + 1;
              if (nextIdx >= worker.pathWaypoints.length - 1) {
                const finalStatus: WorkerStatus = worker.status === 'IN_TRANSIT' ? 'WORKING_ON_SITE' : 'FREE_STATIONARY';
                return { ...worker, x: targetPt.x, y: targetPt.y, status: finalStatus, pathWaypoints: undefined };
              }
              return { ...worker, x: targetPt.x, y: targetPt.y, currentSegmentIndex: nextIdx };
            }

            // Physical Speed calculation based on simSpeed
            const speedMetersPerSec = worker.vehicle === 'APRON_VEHICLE' ? 5.55 : 1.25;
            const pctPerSec = (speedMetersPerSec / 4000) * 100 * simSpeed * 3;

            const moveDistPct = pctPerSec * dtSec;
            const ratio = Math.min(1, moveDistPct / distPct);

            return {
              ...worker,
              x: worker.x + dx * ratio,
              y: worker.y + dy * ratio
            };
          }

          // B. FREE_PATROLLING (Segment-by-segment along road graph)
          if (worker.status === 'FREE_PATROLLING') {
            workersUpdated = true;
            if (!worker.pathWaypoints || worker.pathWaypoints.length < 2 || (worker.currentSegmentIndex || 0) >= worker.pathWaypoints.length - 1) {
              const currentNodeId = getClosestNodeId(worker.x, worker.y);
              const roadWaypoints = SVO_NODES.filter(n => n.type === 'WAYPOINT').map(n => n.id);
              const randomTargetId = roadWaypoints[Math.floor(Math.random() * roadWaypoints.length)];
              const nodePath = findDijkstraShortestPath(currentNodeId, randomTargetId);
              const waypoints = getWaypointsForNodePath({ x: worker.x, y: worker.y }, nodePath);

              return {
                ...worker,
                pathWaypoints: waypoints,
                currentSegmentIndex: 0
              };
            }

            const currIdx = worker.currentSegmentIndex || 0;
            const targetPt = worker.pathWaypoints[currIdx + 1];
            const dx = targetPt.x - worker.x;
            const dy = targetPt.y - worker.y;
            const distPct = Math.hypot(dx, dy);

            if (distPct < 0.3) {
              return {
                ...worker,
                x: targetPt.x,
                y: targetPt.y,
                currentSegmentIndex: currIdx + 1
              };
            }

            const speedMetersPerSec = worker.vehicle === 'APRON_VEHICLE' ? 3.0 : 1.0;
            const pctPerSec = (speedMetersPerSec / 4000) * 100 * simSpeed * 2.5;
            const moveDistPct = pctPerSec * dtSec;
            const ratio = Math.min(1, moveDistPct / distPct);

            return {
              ...worker,
              x: worker.x + dx * ratio,
              y: worker.y + dy * ratio
            };
          }

          return worker;
        });

        // Synchronize Task Crew Arrival Counters & Work Completion Cycle
        if (workersUpdated) {
          setTasks(prevTasks => {
            const finishedTaskIds: string[] = [];

            const updatedTasks = prevTasks.map(task => {
              const arrivedCount = task.crew.filter(member => {
                const w = workersRef.current.find(wrk => wrk.id === member.workerId);
                return w?.status === 'WORKING_ON_SITE';
              }).length;

              const isCompletedArrived = arrivedCount === task.crew.length;

              if (isCompletedArrived) {
                const currentMs = (taskWorkTimersRef.current.get(task.id) || 0) + (dtSec * 1000 * simSpeed);
                taskWorkTimersRef.current.set(task.id, currentMs);

                if (currentMs >= 20000) {
                  finishedTaskIds.push(task.id);
                }
              }

              const status: OtoTask['status'] = isCompletedArrived ? 'WORKING' : 'DISPATCHED';
              return {
                ...task,
                arrivedCount,
                status
              };
            });

            // Automatically complete finished tasks & send workers back to base!
            if (finishedTaskIds.length > 0) {
              finishedTaskIds.forEach(tId => {
                const finishedTask = prevTasks.find(t => t.id === tId);
                if (finishedTask) {
                  setCompletionBanner(`✅ Обслуживание завершено на стоянке ${finishedTask.standLabel}! Инженеры возвращаются на базу.`);
                  setTimeout(() => setCompletionBanner(null), 5000);

                  const crewIds = new Set(finishedTask.crew.map(c => c.workerId));
                  workersRef.current = workersRef.current.map(w => {
                    if (crewIds.has(w.id)) {
                      const closestNodeId = getClosestNodeId(w.x, w.y);
                      const homeBaseId = w.baseId;
                      const nodePath = findDijkstraShortestPath(closestNodeId, homeBaseId);
                      const returnWaypoints = getWaypointsForNodePath({ x: w.x, y: w.y }, nodePath);

                      return {
                        ...w,
                        status: 'RETURNING_TO_BASE',
                        currentTaskId: undefined,
                        pathWaypoints: returnWaypoints,
                        currentSegmentIndex: 0
                      };
                    }
                    return w;
                  });
                }
              });

              return updatedTasks.filter(t => !finishedTaskIds.includes(t.id));
            }

            return updatedTasks;
          });
        }
      }

      animFrameId = requestAnimationFrame(tick);
    };

    animFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameId);
  }, [simSpeed, isPaused]);

  // Throttled sync of workersRef to React state `workers` for bottom table display (every 250ms)
  useEffect(() => {
    const syncInterval = setInterval(() => {
      setWorkers([...workersRef.current]);
    }, 250);
    return () => clearInterval(syncInterval);
  }, []);

  // Directly Launch Task
  const executeLaunchTask = (newTask: OtoTask) => {
    setTasks(prev => [newTask, ...prev]);

    workersRef.current = workersRef.current.map(w => {
      const crewMember = newTask.crew.find(c => c.workerId === w.id);
      if (crewMember) {
        return {
          ...w,
          status: 'IN_TRANSIT',
          currentTaskId: newTask.id,
          pathWaypoints: crewMember.waypoints,
          currentSegmentIndex: 0
        };
      }
      return w;
    });
    setWorkers([...workersRef.current]);
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

  // ONE-BUTTON TASK CANCELLATION
  const handleCancelTask = (taskId: string) => {
    const targetTask = tasks.find(t => t.id === taskId);
    if (!targetTask) return;

    const crewIds = new Set(targetTask.crew.map(c => c.workerId));
    taskWorkTimersRef.current.delete(taskId);

    setTasks(prev => prev.filter(t => t.id !== taskId));

    workersRef.current = workersRef.current.map(w => {
      if (crewIds.has(w.id)) {
        const closestNodeId = getClosestNodeId(w.x, w.y);
        const homeBaseId = w.baseId;
        const nodePath = findDijkstraShortestPath(closestNodeId, homeBaseId);
        const returnWaypoints = getWaypointsForNodePath({ x: w.x, y: w.y }, nodePath);

        return {
          ...w,
          status: 'RETURNING_TO_BASE',
          currentTaskId: undefined,
          pathWaypoints: returnWaypoints,
          currentSegmentIndex: 0
        };
      }
      return w;
    });
    setWorkers([...workersRef.current]);
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

      {/* Work Completion Notification Banner */}
      {completionBanner && (
        <div className="bg-emerald-600 text-white font-mono text-sm font-bold py-2 px-4 text-center border-b border-emerald-500 animate-pulse shadow-lg z-50 flex items-center justify-center space-x-2">
          <span>{completionBanner}</span>
        </div>
      )}

      {/* A. Top Header Bar with Theme Toggle, Pause, & Speed Selector */}
      <HeaderBar
        workers={workers}
        simSpeed={simSpeed}
        onSimSpeedChange={setSimSpeed}
        isPaused={isPaused}
        onTogglePause={() => setIsPaused(prev => !prev)}
        theme={theme}
        onToggleTheme={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
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
        />

        {/* C. Right Task Constructor Sidebar */}
        <RightDispatcherPanel
          selectedStandId={selectedStandId}
          onSelectStand={setSelectedStandId}
          workers={workers}
          onLaunchTask={executeLaunchTask}
          onTriggerSlaAlert={handleTriggerSlaAlert}
          activeTaskForStand={activeTaskForSelectedStand}
          theme={theme}
        />
      </div>

      {/* D. Bottom Active Tasks & Dispatch Table */}
      <BottomConsolePanel
        tasks={tasks}
        workers={workers}
        onCancelTask={handleCancelTask}
        onSelectTask={(task) => setSelectedStandId(task.standId)}
        theme={theme}
      />
    </div>
  );
}

export default App;
