import { useState, useRef, useEffect, useCallback } from 'react';
import { Worker, OtoTask, WorkerStatus, TaskPriority, TaskCrewMember, CategoryCode, DispatchStat } from '../types/index';
import { SVO_STANDS, SVO_FACILITIES, SVO_NODES, DEFECT_TYPES, AIRCRAFT_DOWNTIME_COST_PER_MIN } from '../constants/index';
import {
  getClosestNodeId,
  findDijkstraShortestPath,
  getWaypointsForNodePath,
  calculateWorkerToStandEta,
  findNearestFreeWorkerOfCategory,
  generateShiftWorkersWithCustomCounts,
  getCategoryCandidates,
  findNaiveNearestWorkerOfCategory,
  pickPatrolTargetId,
  applyWeatherOverrides,
  resetWeatherOverrides,
  getWeatherSpeeds
} from '../services/dijkstra';
import { computeDispatchPlan } from '../core/dispatcher';
import { formatSimClock } from '../utils/time';

// Dispatch analytics: "intuitive dispatcher" vs system (saved minutes, SLA compliance)
export type { DispatchStat };
export interface ControlTestResult {
  name: string;
  pass: boolean;
  details: string;
  ms: number;
}

// Static O(1) stand index for the drain loop
const STAND_BY_ID = new Map(SVO_STANDS.map(s => [s.id, s]));

export function useSimulationEngine() {
  // State for Workers and Tasks
  const [workers, setWorkers] = useState<Worker[]>(() =>
    generateShiftWorkersWithCustomCounts(22, 12, 6, 20)
  );
  const [tasks, setTasks] = useState<OtoTask[]>([]);

  // Simulation Controls
  const [simSpeed, setSimSpeed] = useState<number>(5);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [notificationBanner, setNotificationBanner] = useState<string | null>(null);

  // Refs for continuous 60FPS loop without stale closures
  const workersRef = useRef<Worker[]>(workers);
  const tasksRef = useRef<OtoTask[]>(tasks);

  // Dispatch analytics: "intuitive dispatcher" vs system (saved minutes, SLA compliance)
  const statsRef = useRef<DispatchStat[]>([]);
  const [dispatchStats, setDispatchStats] = useState<DispatchStat[]>([]);

  // Economic ROI metrics: completed call count + accumulated system AND naive
  // (manual) arrival ETAs, so the top-bar widget can compute saved minutes &
  // prevented loss LIVE against the simulated manual dispatcher.
  const [roiMetrics, setRoiMetrics] = useState({ completedCount: 0, systemEtaSumMinutes: 0, intuitiveEtaSumMinutes: 0 });
  const roiMetricsRef = useRef({ completedCount: 0, systemEtaSumMinutes: 0, intuitiveEtaSumMinutes: 0 });
  const lastRoiCountRef = useRef(0);

  // Simulation clock (HH:MM:SS) — the single source of task timestamps so the
  // demo can show "когда задача началась / когда завершилась" in SIM time.
  const [simClockSec, setSimClockSec] = useState(0);
  const simClockRef = useRef(0);

  // Current shift composition (tracked for "reset to optimal bases" presets)
  const shiftCountsRef = useRef({ b1: 22, b2: 12, catA: 6, vehicles: 20 });

  // Build busy-id set + per-worker active task load from current tasks
  const computeLoadMap = (tasksList: OtoTask[]) => {
    const busy = new Set<string>();
    const load: Record<string, number> = {};
    tasksList.forEach(t => {
      if (t.status === 'DISPATCHED' || t.status === 'WORKING') {
        t.crew.forEach(m => {
          busy.add(m.workerId);
          load[m.workerId] = (load[m.workerId] || 0) + 1;
        });
      }
    });
    return { busy, load };
  };

  // We no longer sync refs from state, because refs ARE the source of truth
  // and state is just a throttled snapshot for the UI.

  const showNotification = useCallback((msg: string, durationMs: number = 4000) => {
    setNotificationBanner(msg);
    setTimeout(() => setNotificationBanner(null), durationMs);
  }, []);

  // -----------------------------------------------------------------
  // DRAIN QUEUE ALGORITHM: GLOBAL GREEDY ASSIGNMENT (items 2+3)
  // -----------------------------------------------------------------
  // Pure dispatch logic lives in src/core/dispatcher.ts (unit-testable);
  // the hook only applies the returned mutations to React state.
  const drainQueueWithFreeWorkers = useCallback(() => {
    const plan = computeDispatchPlan({
      tasks: tasksRef.current,
      workers: workersRef.current,
      standById: STAND_BY_ID,
      calculateEta: calculateWorkerToStandEta,
      findNaiveNearest: findNaiveNearestWorkerOfCategory
    });

    if (!plan.changed && Object.keys(plan.waitingReasons).length === 0) return;

    plan.notifications.forEach(msg => showNotification(msg, 5000));

    // Apply all dispatches in a single O(T + W) pass: mark the task as started
    // the moment it turns DISPATCHED, clear a stale waiting reason, and attach
    // the explainable "why is this still queued" reason for tasks that wait.
    const nextTasks = tasksRef.current.map(t => {
      const dt = plan.dispatchedTasks[t.id];
      if (dt) {
        const startedAtSimSec = dt.status === 'DISPATCHED' && !dt.startedAtSimSec
          ? simClockRef.current
          : dt.startedAtSimSec;
        return {
          ...dt,
          startedAtSimSec,
          waitingReason: dt.status === 'DISPATCHED' ? undefined : dt.waitingReason
        };
      }
      const wr = plan.waitingReasons[t.id];
      return wr ? { ...t, waitingReason: wr } : t;
    });
    const nextWorkers = workersRef.current.map(w => plan.dispatchedWorkers[w.id] || w);

    workersRef.current = nextWorkers;
    tasksRef.current = nextTasks;
    // Note: setWorkers and setTasks are throttled in the main loop,
    // but we force a UI update on dispatch to ensure immediate feedback.
    setWorkers(nextWorkers);
    setTasks(nextTasks);

    if (plan.stats.length > 0) {
      statsRef.current = [...plan.stats, ...statsRef.current].slice(0, 100);
      setDispatchStats([...statsRef.current]);
    }
  }, [showNotification]);

  // -----------------------------------------------------------------
  // MAIN 60 FPS SIMULATION TICK LOOP
  // -----------------------------------------------------------------
  const lastTimeRef = useRef<number>(Date.now());
  const lastRenderTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    let animFrameId: number;

    const tick = () => {
      const now = Date.now();
      const dtSec = Math.min(0.1, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      if (!isPaused) {
        // 0. ADVANCE SIMULATION CLOCK (single source of task timestamps)
        simClockRef.current += dtSec * simSpeed;

        // 1. UPDATE WORKER POSITIONS (LERP)
        const nextWorkers = workersRef.current.map((worker): Worker => {
          if (worker.status === 'IN_TRANSIT' || worker.status === 'RETURNING_TO_BASE') {
            // AUTO-ARRIVAL SAFETY GUARANTEE: If waypoints missing or <= 1, instantly arrived!
            if (!worker.pathWaypoints || worker.pathWaypoints.length <= 1) {
              const finalStatus: WorkerStatus = worker.status === 'IN_TRANSIT' ? 'WORKING_ON_SITE' : 'FREE_STATIONARY';
              const lastPt = worker.pathWaypoints && worker.pathWaypoints.length > 0 ? worker.pathWaypoints[0] : { x: worker.x, y: worker.y };

              return {
                ...worker,
                x: lastPt.x,
                y: lastPt.y,
                status: finalStatus,
                pathWaypoints: undefined,
                currentSegmentIndex: undefined
              };
            }

            const currIdx = worker.currentSegmentIndex || 0;

            // Reached destination waypoint index
            if (currIdx >= worker.pathWaypoints.length - 1) {
              const finalStatus: WorkerStatus = worker.status === 'IN_TRANSIT' ? 'WORKING_ON_SITE' : 'FREE_STATIONARY';
              const lastPt = worker.pathWaypoints[worker.pathWaypoints.length - 1];

              return {
                ...worker,
                x: lastPt ? lastPt.x : worker.x,
                y: lastPt ? lastPt.y : worker.y,
                status: finalStatus,
                pathWaypoints: undefined,
                currentSegmentIndex: undefined
              };
            }

            const targetPt = worker.pathWaypoints[currIdx + 1];
            const dx = targetPt.x - worker.x;
            const dy = targetPt.y - worker.y;
            const distPct = Math.hypot(dx, dy);

            // Distance snap threshold (1.2% distance threshold for robust arrival)
            if (distPct < 1.2) {
              const nextIdx = currIdx + 1;
              if (nextIdx >= worker.pathWaypoints.length - 1) {
                const finalStatus: WorkerStatus = worker.status === 'IN_TRANSIT' ? 'WORKING_ON_SITE' : 'FREE_STATIONARY';
                return {
                  ...worker,
                  x: targetPt.x,
                  y: targetPt.y,
                  status: finalStatus,
                  pathWaypoints: undefined,
                  currentSegmentIndex: undefined
                };
              }
              return { ...worker, x: targetPt.x, y: targetPt.y, currentSegmentIndex: nextIdx };
            }

            // Movement step: dispatched workers pace to arrive exactly at the displayed ETA.
            // Return-to-base workers (no ETA) fall back to real-world speeds.
            const etaSpeedPct = worker.pathSpeedPctPerSimSec;
            const ws = getWeatherSpeeds();
            const fallbackSpeedKmH = worker.vehicle === 'APRON_VEHICLE' ? ws.vehicleKmH : ws.pedestrianKmH;
            const pctPerSec = (etaSpeedPct != null
              ? etaSpeedPct
              : ((fallbackSpeedKmH * 1000 / 3600) / 4000) * 100
            ) * simSpeed;
            const moveDistPct = pctPerSec * dtSec;
            const ratio = Math.min(1, moveDistPct / distPct);

            return {
              ...worker,
              x: worker.x + dx * ratio,
              y: worker.y + dy * ratio
            };
          }

          // Patrolling workers logic
          if (worker.status === 'FREE_PATROLLING') {
            if (!worker.pathWaypoints || worker.pathWaypoints.length < 2 || (worker.currentSegmentIndex || 0) >= worker.pathWaypoints.length - 1) {
              const currentNodeId = getClosestNodeId(worker.x, worker.y);
              const randomTargetId = pickPatrolTargetId(worker.baseId);
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

            if (distPct < 1.2) {
              return {
                ...worker,
                x: targetPt.x,
                y: targetPt.y,
                currentSegmentIndex: currIdx + 1
              };
            }

            const wsPatrol = getWeatherSpeeds();
            const speedMetersPerSec = worker.vehicle === 'APRON_VEHICLE' ? wsPatrol.vehicleKmH / 3.6 : wsPatrol.pedestrianKmH / 3.6;
            const pctPerSec = (speedMetersPerSec / 4000) * 100 * simSpeed;
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

        // UNCONDITIONAL update to preserve fractional LERP progress
        workersRef.current = nextWorkers;

        // O(1) worker index for this frame's task processing
        const workerIdx = new Map(workersRef.current.map(w => [w.id, w]));

        // 2. UPDATE TASKS ARRIVAL, QUEUE WAIT TIME & MAINTENANCE TIMERS
        if (tasksRef.current.length > 0) {
          const completedTaskIds: string[] = [];

          const nextTasks = tasksRef.current.map(task => {
            if (task.status === 'QUEUED') {
              return {
                ...task,
                elapsedQueueSec: (task.elapsedQueueSec || 0) + dtSec * simSpeed
              };
            }

            // Count arrived workers for this task
            const arrivedCount = task.crew.filter(member => {
              const w = workerIdx.get(member.workerId);
              return w?.status === 'WORKING_ON_SITE';
            }).length;

            // Robust arrival check: if task has crew and arrivedCount === crew.length
            const isAllArrived = task.crew.length > 0 && arrivedCount === task.crew.length;
            let elapsedWorkSec = task.elapsedWorkSec || 0;
            let status: OtoTask['status'] = task.status;

            if (isAllArrived) {
              status = 'WORKING';
              elapsedWorkSec += dtSec * simSpeed;
              if (elapsedWorkSec >= 120.0) { // 120 seconds target (2 real minutes)
                completedTaskIds.push(task.id);
              }
            } else {
              status = 'DISPATCHED';

              // Track transit time for failsafe
              const currentTransitSec = (task.elapsedTransitSec || 0) + dtSec * simSpeed;

              // FAILSAFE DISPATCH TIMEOUT: generous ETA-based window so normal transit
              // never teleports, but genuinely stuck workers are still force-arrived.
              const failsafeTransitSec = Math.max(60, (task.maxEtaMinutes || 10) * 60 * 1.5);
              if (currentTransitSec > failsafeTransitSec) {
                const standObj = SVO_STANDS.find(s => s.id === task.standId);
                const forcedArrivals = new Map<string, Worker>();
                task.crew.forEach(member => {
                  const w = workerIdx.get(member.workerId);
                  if (w && w.status === 'IN_TRANSIT') {
                    forcedArrivals.set(w.id, {
                      ...w,
                      x: standObj ? standObj.x : w.x,
                      y: standObj ? standObj.y : w.y,
                      status: 'WORKING_ON_SITE',
                      pathWaypoints: undefined
                    });
                  }
                });
                if (forcedArrivals.size > 0) {
                  workersRef.current = workersRef.current.map(w => forcedArrivals.get(w.id) || w);
                  forcedArrivals.forEach((w, id) => workerIdx.set(id, w));
                }
                status = 'WORKING';
              }
              
              // We mutate elapsedTransitSec directly here to save allocating another property in mapping,
              // or we just return it. We'll return it below.
              task.elapsedTransitSec = currentTransitSec;
            }

            return {
              ...task,
              arrivedCount: isAllArrived ? task.crew.length : arrivedCount,
              elapsedWorkSec,
              elapsedTransitSec: task.elapsedTransitSec,
              status
            };
          });

          // 3. HANDLE TASK COMPLETIONS, CHAIN FREED WORKERS TO NEXT QUEUED TASKS & RE-DRAIN QUEUE
          if (completedTaskIds.length > 0) {
            const completedAtSim = simClockRef.current;

            // Mark completed (NOT removed) so the console can show start → finish
            const completedTasks = nextTasks.map(t =>
              completedTaskIds.includes(t.id)
                ? { ...t, status: 'COMPLETED' as const, completedAtSimSec: completedAtSim }
                : t
            );

            // Collect every worker freed by the completed tasks (deduped)
            const freedWorkers: Worker[] = [];
            completedTaskIds.forEach(cId => {
              const doneTask = tasksRef.current.find(t => t.id === cId);
              if (!doneTask) return;
              const durMin = doneTask.startedAtSimSec != null
                ? ((completedAtSim - doneTask.startedAtSimSec) / 60).toFixed(1)
                : null;
              showNotification(`✅ ТО завершено на стоянке ${doneTask.standLabel} (${formatSimClock(completedAtSim)}). ${durMin ? `Цикл задачи: ${durMin} мин. ` : ''}Инженеры освобождены.`);
              // ROI: accumulate completed call metrics (system + naive/manual ETA)
              roiMetricsRef.current.completedCount += 1;
              roiMetricsRef.current.systemEtaSumMinutes += doneTask.maxEtaMinutes || 0;
              roiMetricsRef.current.intuitiveEtaSumMinutes += doneTask.intuitiveEtaMinutes || doneTask.maxEtaMinutes || 0;
              doneTask.crew.forEach(m => {
                const w = workerIdx.get(m.workerId);
                if (w && !freedWorkers.some(f => f.id === w.id)) freedWorkers.push(w);
              });
            });

            // Freed workers stay FREE at their CURRENT position (the moment they
            // finish maintenance), so the global greedy drain below picks the
            // NEAREST engineer for each queued call — not an arbitrary SLA pick.
            // No forced chaining here: distance decides, queue order keeps SLA.
            const freedFree: Map<string, Worker> = new Map();
            freedWorkers.forEach(w => {
              freedFree.set(w.id, {
                ...w,
                status: w.isPatrolPreference ? 'FREE_PATROLLING' as WorkerStatus : 'FREE_STATIONARY' as WorkerStatus,
                currentTaskId: undefined,
                pathWaypoints: undefined,
                pathSpeedPctPerSimSec: undefined,
                currentSegmentIndex: 0
              });
            });

            workersRef.current = workersRef.current.map(w => freedFree.get(w.id) || w);

            // Keep a rolling log of completed tasks (status COMPLETED) so the
            // console can show start → finish timestamps; drop the oldest beyond cap.
            const MAX_COMPLETED_LOG = 25;
            const completedOnes = completedTasks.filter(t => t.status === 'COMPLETED');
            if (completedOnes.length > MAX_COMPLETED_LOG) {
              const dropIds = new Set(
                completedOnes.slice(0, completedOnes.length - MAX_COMPLETED_LOG).map(t => t.id)
              );
              tasksRef.current = completedTasks.filter(t => !dropIds.has(t.id));
            } else {
              tasksRef.current = completedTasks;
            }

            // Force UI update on completion
            setWorkers([...workersRef.current]);
            setTasks([...tasksRef.current]);
            lastRenderTimeRef.current = now;

            // Global greedy re-drain: nearest freed engineer wins each queued call.
            // Reservations are respected, but only while nobody closer is free.
            drainQueueWithFreeWorkers();

            // Freed workers the dispatcher did NOT use: patrollers resume their
            // local patrol loop, stationary crews head back to their duty post
            // (or base) so remote stands stay manned.
            const idleFinal = new Map<string, Worker>();
            freedWorkers.forEach(w => {
              const cur = workersRef.current.find(x => x.id === w.id);
              if (!cur) return;
              if (cur.status === 'IN_TRANSIT' || cur.status === 'WORKING_ON_SITE') return; // re-dispatched
              if (cur.isPatrolPreference) {
                const currentNodeId = getClosestNodeId(cur.x, cur.y);
                const randomTargetId = pickPatrolTargetId(cur.baseId);
                const nodePath = findDijkstraShortestPath(currentNodeId, randomTargetId);
                idleFinal.set(cur.id, {
                  ...cur,
                  status: 'FREE_PATROLLING' as WorkerStatus,
                  currentTaskId: undefined,
                  pathWaypoints: getWaypointsForNodePath({ x: cur.x, y: cur.y }, nodePath),
                  pathSpeedPctPerSimSec: undefined,
                  currentSegmentIndex: 0
                });
                return;
              }
              const dutyStand = cur.dutyStandId ? SVO_STANDS.find(s => s.id === cur.dutyStandId) : undefined;
              const targetNode = dutyStand || SVO_FACILITIES.find(f => f.id === cur.baseId);
              if (targetNode) {
                const nodePath = findDijkstraShortestPath(getClosestNodeId(cur.x, cur.y), targetNode.id);
                idleFinal.set(cur.id, {
                  ...cur,
                  status: 'RETURNING_TO_BASE' as WorkerStatus,
                  currentTaskId: undefined,
                  pathWaypoints: getWaypointsForNodePath({ x: cur.x, y: cur.y }, nodePath),
                  pathSpeedPctPerSimSec: undefined,
                  currentSegmentIndex: 0
                });
                return;
              }
              idleFinal.set(cur.id, { ...cur, status: 'FREE_STATIONARY' as WorkerStatus, currentTaskId: undefined });
            });
            if (idleFinal.size > 0) {
              workersRef.current = workersRef.current.map(w => idleFinal.get(w.id) || w);
              setWorkers([...workersRef.current]);
              lastRenderTimeRef.current = now;
            }
          } else {
            // UNCONDITIONAL update to preserve fractional timer progress
            tasksRef.current = nextTasks;
          }
        }
        
        // 4. THROTTLE UI UPDATES to ~10 FPS (100ms) to prevent React blocking the main thread
        if (now - lastRenderTimeRef.current > 100) {
          setSimClockSec(simClockRef.current);
          setWorkers([...workersRef.current]);
          setTasks([...tasksRef.current]);
          lastRenderTimeRef.current = now;
          if (roiMetricsRef.current.completedCount !== lastRoiCountRef.current) {
            lastRoiCountRef.current = roiMetricsRef.current.completedCount;
            setRoiMetrics({ ...roiMetricsRef.current });
          }
        }
      }

      animFrameId = requestAnimationFrame(tick);
    };

    animFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameId);
  }, [isPaused, simSpeed, drainQueueWithFreeWorkers, showNotification]);

  // -----------------------------------------------------------------
  // USER ACTIONS: SUBMIT TASK, CANCEL TASK, STRESS TEST, RECONFIG
  // -----------------------------------------------------------------

  const submitTask = useCallback((newTask: OtoTask) => {
    const queuedTask: OtoTask = {
      ...newTask,
      status: 'QUEUED',
      createdAtSimSec: newTask.createdAtSimSec ?? simClockRef.current,
      elapsedQueueSec: 0,
      arrivedCount: 0
    };

    const nextTasks = [queuedTask, ...tasksRef.current];
    tasksRef.current = nextTasks;
    setTasks(nextTasks);

    drainQueueWithFreeWorkers();

    const checkTask = tasksRef.current.find(t => t.id === newTask.id);
    if (checkTask && checkTask.status === 'DISPATCHED') {
      showNotification(`🚀 Задача ${checkTask.id} (${checkTask.priority}) запущена! Инженеры выехали на стоянку ${checkTask.standLabel}.`);
    } else {
      showNotification(`⏳ Задача ${newTask.id} (${newTask.priority}) поставлена в Приоритетную Очередь (Ожидание кадров).`);
    }
  }, [drainQueueWithFreeWorkers, showNotification]);

  const cancelTask = useCallback((taskId: string) => {
    const targetTask = tasksRef.current.find(t => t.id === taskId);
    if (!targetTask) return;

    const crewIds = new Set(targetTask.crew.map(c => c.workerId));
    let updatedWorkers = [...workersRef.current];

    crewIds.forEach(wId => {
      const wObj = updatedWorkers.find(w => w.id === wId);
      // Only send back to base workers that are actually engaged on this task.
      // Queued-task crew members are still free (stationary/patrolling) — leave them as-is.
      if (wObj && (wObj.status === 'IN_TRANSIT' || wObj.status === 'WORKING_ON_SITE')) {
        const closestNodeId = getClosestNodeId(wObj.x, wObj.y);
        const homeBaseId = wObj.baseId;
        const nodePath = findDijkstraShortestPath(closestNodeId, homeBaseId);
        const returnWaypoints = getWaypointsForNodePath({ x: wObj.x, y: wObj.y }, nodePath);

        updatedWorkers = updatedWorkers.map(w => {
          if (w.id === wId) {
            return {
              ...w,
              status: 'RETURNING_TO_BASE',
              currentTaskId: undefined,
              pathWaypoints: returnWaypoints,
              pathSpeedPctPerSimSec: undefined,
              currentSegmentIndex: 0
            };
          }
          return w;
        });
      } else if (wObj) {
        // Free worker reserved for a queued task: just release the task reference
        updatedWorkers = updatedWorkers.map(w =>
          w.id === wId ? { ...w, currentTaskId: undefined } : w
        );
      }
    });

    workersRef.current = updatedWorkers;
    setWorkers(updatedWorkers);

    const remaining = tasksRef.current.filter(t => t.id !== taskId);
    tasksRef.current = remaining;
    setTasks(remaining);

    showNotification(`🗑️ Задача ${taskId} отменена.`);
    setTimeout(() => drainQueueWithFreeWorkers(), 50);
  }, [drainQueueWithFreeWorkers, showNotification]);

  const promoteTaskToAog = useCallback((taskId: string) => {
    const nextTasks = tasksRef.current.map(t =>
      t.id === taskId ? { ...t, priority: 'AOG' as TaskPriority } : t
    );
    tasksRef.current = nextTasks;
    setTasks(nextTasks);

    showNotification(`⚡ Задача ${taskId} повышена до Высшего Приоритета AOG!`);
    drainQueueWithFreeWorkers();
  }, [drainQueueWithFreeWorkers, showNotification]);

  const triggerStressTest = useCallback(() => {
    const standsSample = [...SVO_STANDS].sort(() => 0.5 - Math.random()).slice(0, 10);
    const priorities: TaskPriority[] = ['AOG', 'AOG', 'URGENT', 'URGENT', 'URGENT', 'ROUTINE', 'ROUTINE', 'ROUTINE', 'ROUTINE', 'ROUTINE'];

    const newTasks: OtoTask[] = [];

    standsSample.forEach((stand, idx) => {
      const priority = priorities[idx % priorities.length];
      const catCode = idx % 2 === 0 ? 'B1' : 'B2';
      const taskId = `STRESS-${Date.now().toString().slice(-4)}-${idx + 1}`;

      const task: OtoTask = {
        id: taskId,
        standId: stand.id,
        standLabel: `Стоянка ${stand.label}`,
        aircraftType: `${stand.aircraftType} (Рейс SU-${1000 + idx})`,
        categoryCode: catCode,
        categoryLabel: `ОТО (${priority})`,
        priority,
        status: 'QUEUED',
        crew: [],
        arrivedCount: 0,
        maxEtaMinutes: 12.0,
        slaLimitMinutes: 15.0,
        withinSla: true,
        createdAt: new Date().toLocaleTimeString('ru-RU', { hour12: false }),
        createdAtSimSec: simClockRef.current,
        elapsedQueueSec: 0,
        elapsedWorkSec: 0,
        targetWorkSec: 120
      };

      newTasks.push(task);
    });

    const combinedTasks = [...newTasks, ...tasksRef.current];
    tasksRef.current = combinedTasks;
    setTasks(combinedTasks);

    drainQueueWithFreeWorkers();
    showNotification(`💥 СТРЕСС-ТЕСТ: Сгенерировано 10 вызовов! Персонал выехал по приоритету AOG > URGENT > ROUTINE.`);
  }, [drainQueueWithFreeWorkers, showNotification]);

  const applyShiftConfig = useCallback((b1: number, b2: number, catA: number, vehicles: number) => {
    shiftCountsRef.current = { b1, b2, catA, vehicles };
    const updatedWorkers = generateShiftWorkersWithCustomCounts(b1, b2, catA, vehicles);
    workersRef.current = updatedWorkers;
    setWorkers(updatedWorkers);

    // Old workers no longer exist, so every active/queued task would hang forever.
    // Re-queue all tasks with an empty crew so the queue re-assembles the new shift.
    const nextTasks = tasksRef.current.map(t => ({
      ...t,
      status: 'QUEUED' as const,
      crew: [],
      arrivedCount: 0,
      elapsedTransitSec: 0,
      elapsedWorkSec: 0
    }));
    tasksRef.current = nextTasks;
    setTasks(nextTasks);

    drainQueueWithFreeWorkers();
    roiMetricsRef.current = { completedCount: 0, systemEtaSumMinutes: 0, intuitiveEtaSumMinutes: 0 };
    lastRoiCountRef.current = 0;
    setRoiMetrics({ completedCount: 0, systemEtaSumMinutes: 0, intuitiveEtaSumMinutes: 0 });
    simClockRef.current = 0;
    setSimClockSec(0);
    showNotification(`🔄 Смена пересчитана! ${b1 + b2 + catA} инженеров и ${vehicles} авто распределены по базам ПТО.`);
  }, [drainQueueWithFreeWorkers, showNotification]);

  const enqueueAutoTask = useCallback((
    standId: string,
    categoryCode: CategoryCode,
    priority: TaskPriority,
    defectId?: string
  ) => {
    const stand = SVO_STANDS.find(s => s.id === standId);
    if (!stand) return;
    const defect = DEFECT_TYPES.find(d => d.id === defectId);
    const taskId = `T-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 90 + 10)}`;
    const task: OtoTask = {
      id: taskId,
      standId: stand.id,
      standLabel: `Стоянка ${stand.label}`,
      aircraftType: `${stand.aircraftType} (Рейс SU-${1000 + Math.floor(Math.random() * 900)})`,
      categoryCode,
      categoryLabel: defect ? `ОТО · ${defect.name}` : `ОТО (${priority})`,
      defectLabel: defect?.name,
      priority,
      status: 'QUEUED',
      crew: [],
      requiredCrew: defect ? defect.requiredCrew : [{ categoryCode, count: 1 }],
      arrivedCount: 0,
      maxEtaMinutes: 12.0,
      slaLimitMinutes: 15.0,
      withinSla: true,
      createdAt: new Date().toLocaleTimeString('ru-RU', { hour12: false }),
      createdAtSimSec: simClockRef.current,
      elapsedQueueSec: 0,
      elapsedWorkSec: 0,
      targetWorkSec: 120
    };
    const combined = [task, ...tasksRef.current];
    tasksRef.current = combined;
    setTasks(combined);
    drainQueueWithFreeWorkers();
  }, [drainQueueWithFreeWorkers]);

  // Reset the shift to its optimal base deployment (FREE at home bases),
  // clear all active/queued calls, analytics and ROI history.
  const resetShiftToOptimal = useCallback((showToast: boolean) => {
    const { b1, b2, catA, vehicles } = shiftCountsRef.current;
    const updatedWorkers = generateShiftWorkersWithCustomCounts(b1, b2, catA, vehicles);
    workersRef.current = updatedWorkers;
    setWorkers(updatedWorkers);

    tasksRef.current = [];
    setTasks([]);
    statsRef.current = [];
    setDispatchStats([]);
    roiMetricsRef.current = { completedCount: 0, systemEtaSumMinutes: 0, intuitiveEtaSumMinutes: 0 };
    lastRoiCountRef.current = 0;
    setRoiMetrics({ completedCount: 0, systemEtaSumMinutes: 0, intuitiveEtaSumMinutes: 0 });
    simClockRef.current = 0;
    setSimClockSec(0);
    resetWeatherOverrides();
    if (showToast) showNotification(`🧹 Сброс: ${b1 + b2 + catA} инженеров на базах ПТО, все вызовы очищены.`);
  }, [showNotification]);

  const runScenario = useCallback((scenarioId: string) => {
    switch (scenarioId) {
      case 'peak':
        triggerStressTest();
        break;
      case 'deficit': {
        applyShiftConfig(3, 1, 0, 2);
        enqueueAutoTask('STAND_B12', 'B1', 'AOG', 'ATA32');
        enqueueAutoTask('STAND_D18', 'B2', 'AOG', 'ATA34');
        enqueueAutoTask('STAND_F45', 'B1', 'URGENT', 'ATA72');
        enqueueAutoTask('STAND_105', 'B2', 'URGENT', 'ATA24');
        enqueueAutoTask('STAND_C25', 'A', 'URGENT', 'ATA49');
        enqueueAutoTask('STAND_204', 'B1', 'ROUTINE', 'ATA32');
        enqueueAutoTask('STAND_201', 'B2', 'ROUTINE', 'ATA34');
        enqueueAutoTask('STAND_105', 'B1', 'ROUTINE', 'ATA32');
        showNotification(`⚠️ Сценарий «Кадровый дефицит»: 4 инженера на 8 вызовов.`);
        break;
      }
      case 'series': {
        enqueueAutoTask('STAND_B12', 'B1', 'ROUTINE', 'ATA72');
        setTimeout(() => enqueueAutoTask('STAND_B14', 'B1', 'ROUTINE', 'ATA32'), 1500);
        setTimeout(() => enqueueAutoTask('STAND_C21', 'B2', 'ROUTINE', 'ATA24'), 3000);
        setTimeout(() => enqueueAutoTask('STAND_C25', 'B2', 'ROUTINE', 'ATA34'), 4500);
        showNotification(`📋 Сценарий «Серия вызовов»: 4 плановых вызова подряд.`);
        break;
      }
      case 'aog': {
        enqueueAutoTask('STAND_C25', 'B2', 'ROUTINE', 'ATA34');
        setTimeout(() => enqueueAutoTask('STAND_D18', 'B1', 'AOG', 'ATA72'), 2000);
        setTimeout(() => enqueueAutoTask('STAND_F45', 'A', 'AOG', 'ATA49'), 4000);
        showNotification(`⚡ Сценарий «AOG»: рутинный вызов + срочные AOG сверху.`);
        break;
      }
      case 'remote': {
        enqueueAutoTask('STAND_105', 'B1', 'URGENT', 'ATA32');
        enqueueAutoTask('STAND_201', 'B2', 'URGENT', 'ATA24');
        enqueueAutoTask('STAND_204', 'B1', 'ROUTINE', 'ATA32');
        showNotification(`🗺️ Сценарий «Удалённые стоянки»: вызовы в северные/южные зоны.`);
        break;
      }
      case 'aogDefect': {
        enqueueAutoTask('STAND_D18', 'B1', 'AOG', 'ATA32');
        showNotification(`🩸 Сценарий «AOG-дефект»: утечка гидравлики → квалификация B1.`);
        break;
      }
      case 'snow': {
        applyWeatherOverrides(3.5, 12.0);
        enqueueAutoTask('STAND_C21', 'B2', 'URGENT', 'ATA24');
        enqueueAutoTask('STAND_E38', 'B1', 'URGENT', 'ATA32');
        showNotification(`❄️ Сценарий «Снегопад»: скорость пешком 3.5 км/ч, авто 12 км/ч. ETA вызовов выросли.`);
        break;
      }
      case 'slaBreach': {
        enqueueAutoTask('STAND_D24', 'B2', 'AOG', 'ATA24');
        showNotification(`🚨 CRITICAL_SLA_ALERT: B2-вызов на стоянку D24, ближайший B2 — на Севере (АК-4), превышение SLA +8.5 мин!`);
        break;
      }
      case 'reset': {
        resetShiftToOptimal(true);
        break;
      }
      default:
        break;
    }
  }, [triggerStressTest, applyShiftConfig, enqueueAutoTask, resetShiftToOptimal, applyWeatherOverrides, showNotification]);

  // Hackathon PRESET SCENARIOS (quick-action bar, one click each)
  const runPreset = useCallback((presetId: string) => {
    switch (presetId) {
      case 'standard': {
        // Reset workers to optimal bases, then spawn a single ATA call on D18
        resetShiftToOptimal(true);
        setTimeout(() => enqueueAutoTask('STAND_D18', 'B1', 'ROUTINE', 'ATA72'), 400);
        showNotification(`🟢 Пресет «Стандартный»: смена на базах, вызов ATA 72 на стоянку D18.`);
        break;
      }
      case 'rushhour': {
        // 5 simultaneous ATA calls across North (B/C) and South (D/F)
        enqueueAutoTask('STAND_B12', 'B1', 'URGENT', 'ATA32');
        enqueueAutoTask('STAND_C25', 'B2', 'URGENT', 'ATA24');
        enqueueAutoTask('STAND_D18', 'B2', 'URGENT', 'ATA34');
        enqueueAutoTask('STAND_D24', 'B1', 'AOG', 'ATA72');
        enqueueAutoTask('STAND_F45', 'B1', 'URGENT', 'ATA49');
        showNotification(`🚦 Пресет «Час-Пик SVO»: 5 одновременных ATA-вызовов по Северу (B/C) и Югу (D/F).`);
        break;
      }
      case 'snow': {
        // Weather factor: WALK 3.5 km/h, CAR 12 km/h
        applyWeatherOverrides(3.5, 12.0);
        enqueueAutoTask('STAND_C21', 'B2', 'URGENT', 'ATA24');
        enqueueAutoTask('STAND_E38', 'B1', 'URGENT', 'ATA32');
        showNotification(`❄️ Пресет «Снегопад»: скорость пешком 3.5 км/ч, авто 12 км/ч. ETA вызовов выросли.`);
        break;
      }
      case 'slaBreach': {
        // Forced SLA breach: B2 call on the far south stand D24 (D22 не в схеме —
        // ближайший южный перрон), где ближайший B2 живёт на Севере (АК-4).
        enqueueAutoTask('STAND_D24', 'B2', 'AOG', 'ATA24');
        showNotification(`🚨 CRITICAL_SLA_ALERT: B2-вызов на стоянку D24, ближайший B2 — на Севере (АК-4), превышение SLA +8.5 мин!`);
        break;
      }
      case 'reset': {
        // Reset all workers to FREE_STATIONARY at home bases, clear everything
        resetShiftToOptimal(true);
        break;
      }
      default:
        break;
    }
  }, [resetShiftToOptimal, enqueueAutoTask, applyWeatherOverrides, showNotification]);

  const runControlTests = useCallback((): ControlTestResult[] => {
    const results: ControlTestResult[] = [];
    const { busy, load } = computeLoadMap(tasksRef.current);
    const testScenarios: { stand: string; cat: CategoryCode }[] = [
      { stand: 'STAND_B12', cat: 'B1' },
      { stand: 'STAND_D18', cat: 'B2' },
      { stand: 'STAND_F45', cat: 'A' },
      { stand: 'STAND_105', cat: 'B1' },
      { stand: 'STAND_201', cat: 'B2' },
      { stand: 'STAND_C25', cat: 'A' }
    ];
    for (const sc of testScenarios) {
      const t0 = performance.now();
      const stand = SVO_STANDS.find(s => s.id === sc.stand);
      if (!stand) continue;
      const picked = findNearestFreeWorkerOfCategory(sc.cat, stand, workersRef.current, new Set<string>());
      const available = getCategoryCandidates(sc.cat, stand, workersRef.current, busy, load).filter(c => c.isAvailable);
      const ms = Math.round((performance.now() - t0) * 100) / 100;

      if (!picked) {
        results.push({ name: `Сценарий ${sc.stand} (Cat ${sc.cat})`, pass: false, details: 'Нет свободного сотрудника нужной квалификации', ms });
        continue;
      }
      const minEta = available.length ? Math.min(...available.map(a => a.etaMinutes)) : Infinity;
      const isMin = picked.etaMinutes <= minEta + 0.05;
      const within15 = picked.etaMinutes <= 15;
      const naive = findNaiveNearestWorkerOfCategory(sc.cat, stand, workersRef.current, new Set<string>());
      const detail = [
        `Выбран ${picked.workerName} (${picked.categoryCode}), ETA ${picked.etaMinutes} мин`,
        `min по кандидатам: ${minEta === Infinity ? '—' : minEta + ' мин'}`,
        `по прямой: ${naive ? naive.etaMinutes + ' мин' : '—'}`,
        `регламент 15 мин: ${within15 ? 'OK' : 'нет свободного ≤ 15 (дефицит)'}`
      ].join(' · ');
      results.push({ name: `Сценарий ${sc.stand} (Cat ${sc.cat})`, pass: isMin, details: isMin ? detail : detail + ' — НАРУШЕНИЕ: назначен не ближайший!', ms });
    }
    const totalMs = results.reduce((s, r) => s + r.ms, 0);
    results.push({
      name: 'Общее время расчёта (6 сценариев)',
      pass: totalMs < 10000,
      details: `${Math.round(totalMs * 100) / 100} мс за 6 расчётов (лимит < 10 с)`,
      ms: Math.round(totalMs * 100) / 100
    });

    // Stress test: dispatch a massive queue to prove O(T + W) scaling
    const tMass0 = performance.now();
    const massCount = 5000;
    let massDispatched = 0;
    const massBusy = new Set<string>();
    const standIds = SVO_STANDS.map(s => s.id);
    const cats: CategoryCode[] = ['B1', 'B2', 'A'];
    for (let i = 0; i < massCount; i++) {
      const stand = STAND_BY_ID.get(standIds[i % standIds.length]);
      if (!stand) continue;
      const picked = findNearestFreeWorkerOfCategory(cats[i % 3], stand, workersRef.current, massBusy);
      if (picked) {
        massBusy.add(picked.workerId);
        massDispatched++;
      }
    }
    const massMs = Math.round((performance.now() - tMass0) * 100) / 100;
    results.push({
      name: `Массовая очередь (${massCount} задач)`,
      pass: massMs < 10000,
      details: `${massDispatched} задач укомплектовано за ${massMs} мс (лимит < 10 с)`,
      ms: massMs
    });

    // Massive ETA sweep: 50 000 worker→stand route computations
    const tSweep0 = performance.now();
    const sweepCount = 50000;
    for (let i = 0; i < sweepCount; i++) {
      const w = workersRef.current[i % workersRef.current.length];
      const stand = STAND_BY_ID.get(standIds[i % standIds.length]);
      if (w && stand) calculateWorkerToStandEta(w, stand);
    }
    const sweepMs = Math.round((performance.now() - tSweep0) * 100) / 100;
    results.push({
      name: `ETA-расчёт (${sweepCount} маршрутов)`,
      pass: sweepMs < 10000,
      details: `${sweepCount} маршрутов за ${sweepMs} мс (${sweepCount / Math.max(1, sweepMs)} маршрутов/мс)`,
      ms: sweepMs
    });

    return results;
  }, []);

  return {
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
    promoteTaskToAog,
    triggerStressTest,
    applyShiftConfig,
    dispatchStats,
    roiMetrics,
    simClockSec,
    runScenario,
    runPreset,
    runControlTests
  };
}
