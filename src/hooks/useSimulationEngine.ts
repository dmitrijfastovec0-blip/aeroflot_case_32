import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Worker, OtoTask, WorkerStatus, TaskPriority, TaskCrewMember, CategoryCode, DispatchStat, WeatherMode, AirportElement, AirportConnection, AirfieldMode, Stand, Facility } from '../types/index';
import { SVO_STANDS, REAL_SVO_FACILITIES, SVO_FACILITIES, SVO_NODES, DEFECT_TYPES, AIRCRAFT_DOWNTIME_COST_PER_MIN } from '../constants/index';
import {
  getClosestNodeId,
  getClosestSectorNodeId,
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
  getWeatherSpeeds,
  configureCustomAirport,
  getCustomAirportStands,
  getCustomAirportFacilities
} from '../services/dijkstra';
import {
  extractCustomStands,
  extractCustomFacilities,
  calculateModularWorkerEta,
  findNearestFreeCustomWorker,
  getCustomPatrolWaypoints,
  getCustomReturnToBaseWaypoints
} from '../services/airfieldGraph';
import { spawnAirfieldShift } from '../services/shiftSpawner';
import { computeDispatchPlan, pathSpeedFor } from '../core/dispatcher';
import { formatSimClock } from '../utils/time';

// Dispatch analytics: "intuitive dispatcher" vs system (saved minutes, SLA compliance)
export type { DispatchStat };
export interface ControlTestResult {
  name: string;
  pass: boolean;
  details: string;
  ms: number;
}

export function useSimulationEngine(
  customElements: AirportElement[] = [],
  customConnections: AirportConnection[] = [],
  airfieldMode: AirfieldMode = 'SVO'
) {
  const isCustomMode = airfieldMode === 'CUSTOM' || (customElements.length > 0 && airfieldMode !== 'SVO');

  const activeStands = useMemo(() => {
    if (isCustomMode && customElements.length > 0) {
      const cStands = extractCustomStands(customElements);
      return cStands.length > 0 ? cStands : SVO_STANDS;
    }
    return SVO_STANDS;
  }, [isCustomMode, customElements]);

  const activeFacilities = useMemo(() => {
    if (isCustomMode && customElements.length > 0) {
      return extractCustomFacilities(customElements);
    }
    return REAL_SVO_FACILITIES;
  }, [isCustomMode, customElements]);

  const standById = useMemo(() => new Map(activeStands.map(s => [s.id, s])), [activeStands]);

  // ALL REFS DECLARED AT THE VERY TOP OF THE HOOK TO PREVENT TDZ CRASHES
  const shiftCountsRef = useRef({ b1: 22, b2: 12, catA: 6, vehicles: 20 });
  const simClockRef = useRef(0);
  const isStressTestActiveRef = useRef<boolean>(false);
  const lastStressSpawnSimSecRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(Date.now());
  const lastRenderTimeRef = useRef<number>(Date.now());
  const scenarioCompletedFlagRef = useRef<boolean>(false);
  const autoPauseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const statsRef = useRef<DispatchStat[]>([]);
  const roiMetricsRef = useRef({ completedCount: 0, systemEtaSumMinutes: 0, intuitiveEtaSumMinutes: 0 });
  const lastRoiCountRef = useRef(0);
  const allHistoricalTasksRef = useRef<OtoTask[]>([]);

  // State for Workers and Tasks
  const [workers, setWorkers] = useState<Worker[]>(() =>
    spawnAirfieldShift({
      b1Count: 22,
      b2Count: 12,
      catACount: 6,
      vehiclesCount: 20,
      customElements,
      customConnections,
      customFacilities: activeFacilities,
      customStands: activeStands,
      isCustomMode
    })
  );

  const [tasks, setTasks] = useState<OtoTask[]>([]);
  const [archivedTasks, setArchivedTasks] = useState<OtoTask[]>([]);
  const [allHistoricalTasks, setAllHistoricalTasks] = useState<OtoTask[]>([]);
  const [notificationBanner, setNotificationBanner] = useState<string | null>(null);
  const [activeScenarioName, setActiveScenarioName] = useState<string>('Оперативный план');
  const [dispatchStats, setDispatchStats] = useState<DispatchStat[]>([]);
  const [roiMetrics, setRoiMetrics] = useState({ completedCount: 0, systemEtaSumMinutes: 0, intuitiveEtaSumMinutes: 0 });
  const [simClockSec, setSimClockSec] = useState(0);
  const [isStressTestActive, setIsStressTestActive] = useState<boolean>(false);

  // Sync state refs
  const workersRef = useRef<Worker[]>(workers);
  const tasksRef = useRef<OtoTask[]>(tasks);

  // Sync airfield changes with custom airport configuration and respawn workers
  useEffect(() => {
    configureCustomAirport(customElements, customConnections);
    const { b1, b2, catA, vehicles } = shiftCountsRef.current;
    const updated = spawnAirfieldShift({
      b1Count: b1,
      b2Count: b2,
      catACount: catA,
      vehiclesCount: vehicles,
      customElements,
      customConnections,
      customFacilities: activeFacilities,
      customStands: activeStands,
      isCustomMode
    });
    workersRef.current = updated;
    setWorkers(updated);
    tasksRef.current = [];
    setTasks([]);
    allHistoricalTasksRef.current = [];
    setAllHistoricalTasks([]);
    statsRef.current = [];
    setDispatchStats([]);
    roiMetricsRef.current = { completedCount: 0, systemEtaSumMinutes: 0, intuitiveEtaSumMinutes: 0 };
    setRoiMetrics({ completedCount: 0, systemEtaSumMinutes: 0, intuitiveEtaSumMinutes: 0 });
    simClockRef.current = 0;
    setSimClockSec(0);
  }, [airfieldMode, isCustomMode, customElements, customConnections, activeFacilities, activeStands]);

  const showNotification = useCallback((msg: string, durationMs: number = 4000) => {
    setNotificationBanner(msg);
    setTimeout(() => setNotificationBanner(null), durationMs);
  }, []);

  // Weather Mode State
  const [weatherMode, setWeatherModeState] = useState<WeatherMode>('CLEAR');

  const setWeatherMode = useCallback((mode: WeatherMode) => {
    setWeatherModeState(mode);
    if (mode === 'RAIN') {
      applyWeatherOverrides(4.2, 18.0);
      showNotification('Осадки / Ливень: мокрый перрон, скорость спецавто 18 км/ч.');
    } else if (mode === 'BLIZZARD') {
      applyWeatherOverrides(3.2, 12.0);
      showNotification('Метель SVO: активная снегоочистка перрона, скорость спецавто 12 км/ч.');
    } else if (mode === 'NIGHT') {
      applyWeatherOverrides(4.5, 22.0);
      showNotification('Ночная смена: включено габаритное освещение и фары спецтехники.');
    } else {
      resetWeatherOverrides();
      showNotification('Штатный режим (Ясно): идеальные сухие условия, спецавто 25 км/ч.');
    }
  }, [showNotification]);

  // Simulation Controls
  const [simSpeed, setSimSpeed] = useState<number>(5);
  const [isPaused, setIsPaused] = useState<boolean>(false);

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

  // -----------------------------------------------------------------
  // DRAIN QUEUE ALGORITHM: MODULAR GLOBAL GREEDY ASSIGNMENT
  // -----------------------------------------------------------------
  // In SVO mode, use precomputed all-pairs SVO graph (O(1) lookups).
  // In CUSTOM mode, use Dijkstra over the custom airfield graph.
  const drainQueueWithFreeWorkers = useCallback(() => {
    const calculateEta = isCustomMode
      ? (w: Worker, s: Stand) => calculateModularWorkerEta(w, s, customElements, customConnections)
      : (w: Worker, s: Stand) => calculateWorkerToStandEta(w, s);

    const findNaiveNearest = isCustomMode
      ? (cat: CategoryCode, s: Stand, wrks: Worker[], busy?: Set<string>) =>
          findNearestFreeCustomWorker(cat, s, wrks, busy || new Set(), customElements, customConnections)
      : (cat: CategoryCode, s: Stand, wrks: Worker[], busy?: Set<string>) =>
          findNaiveNearestWorkerOfCategory(cat, s, wrks, busy);

    const plan = computeDispatchPlan({
      tasks: tasksRef.current,
      workers: workersRef.current,
      standById: standById,
      calculateEta,
      findNaiveNearest
    });

    if (!plan.changed && Object.keys(plan.waitingReasons).length === 0) return;

    plan.notifications.forEach(msg => showNotification(msg, 5000));

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
    setWorkers(nextWorkers);
    setTasks(nextTasks);

    if (plan.stats.length > 0) {
      statsRef.current = [...plan.stats, ...statsRef.current].slice(0, 100);
      setDispatchStats([...statsRef.current]);
    }
  }, [isCustomMode, standById, customElements, customConnections, showNotification]);

  const standCooldownsRef = useRef<Map<string, number>>(new Map());

  // -----------------------------------------------------------------
  // MAIN 60 FPS SIMULATION TICK LOOP
  // -----------------------------------------------------------------
  useEffect(() => {
    let animFrameId: number;

    const tick = () => {
      const now = Date.now();
      const dtSec = Math.min(0.1, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      if (!isPaused) {
        // 0. ADVANCE SIMULATION CLOCK (single source of task timestamps)
        simClockRef.current += dtSec * simSpeed;

        // 0b. DYNAMIC CONTINUOUS STRESS-TEST GENERATOR (Maintains 2-4 active tasks with realistic intervals)
        if (isStressTestActiveRef.current && simClockRef.current - lastStressSpawnSimSecRef.current >= 8.0) {
          const queuedTasks = tasksRef.current.filter(t => t.status === 'QUEUED');
          if (queuedTasks.length < 3) {
            lastStressSpawnSimSecRef.current = simClockRef.current;
            const activeStandIds = new Set(tasksRef.current.filter(t => t.status !== 'COMPLETED').map(t => t.standId));
            const availableStands = activeStands.filter(s => {
              if (activeStandIds.has(s.id)) return false;
              const lastDone = standCooldownsRef.current.get(s.id) || 0;
              // Realistic airport gap: at least 45 sim seconds after previous task on the same stand
              return (simClockRef.current - lastDone) >= 45;
            });
            const candidates = availableStands.length > 0 ? availableStands : activeStands.filter(s => !activeStandIds.has(s.id));
            if (candidates.length > 0) {
              const stand = candidates[Math.floor(Math.random() * candidates.length)];
              const defect = DEFECT_TYPES[Math.floor(Math.random() * DEFECT_TYPES.length)];
              const pList: TaskPriority[] = ['AOG', 'URGENT', 'ROUTINE', 'ROUTINE'];
              const priority = pList[Math.floor(Math.random() * pList.length)];
              const cList: CategoryCode[] = ['B1', 'B2', 'A'];
              const cat = cList[Math.floor(Math.random() * cList.length)];
              enqueueAutoTask(stand.id, cat, priority, defect.id);
            }
          }
        }

        // 1. UPDATE WORKER POSITIONS & STATUS (LERP + VEHICLE KINEMATICS)
        const nextWorkers = workersRef.current.map((worker): Worker => {
          // 1a. Vehicle Boarding & Equipment Preparation Phase (30s sim time for APRON_VEHICLE)
          if (worker.status === 'BOARDING_VEHICLE') {
            const remaining = (worker.boardingSecRemaining ?? 30) - dtSec * simSpeed;
            if (remaining <= 0) {
              return {
                ...worker,
                status: 'IN_TRANSIT',
                boardingSecRemaining: undefined
              };
            }
            return {
              ...worker,
              boardingSecRemaining: remaining
            };
          }

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

            // Realistic Vehicle Acceleration & Braking Distance Kinematics
            const etaSpeedPct = worker.pathSpeedPctPerSimSec;
            const ws = getWeatherSpeeds();
            const fallbackSpeedKmH = worker.vehicle === 'APRON_VEHICLE' ? ws.vehicleKmH : ws.pedestrianKmH;
            
            let accelFactor = 1.0;
            if (worker.vehicle === 'APRON_VEHICLE') {
              const isFirstSeg = currIdx === 0;
              const isFinalSeg = currIdx >= worker.pathWaypoints.length - 2;
              if (isFirstSeg && distPct > 2.0) {
                accelFactor = 0.65; // Acceleration from stop
              } else if (isFinalSeg && distPct < 3.5) {
                accelFactor = 0.55; // Deceleration braking distance near stand
              }
            }

            const pctPerSec = (etaSpeedPct != null
              ? etaSpeedPct
              : ((fallbackSpeedKmH * 1000 / 3600) / 4000) * 100
            ) * accelFactor * simSpeed;
            const moveDistPct = pctPerSec * dtSec;

            // Distance snap threshold (or completion of segment during high speed 10x-100x)
            if (distPct < 1.2 || moveDistPct >= distPct) {
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

            const ratio = Math.min(1, moveDistPct / distPct);

            return {
              ...worker,
              x: worker.x + dx * ratio,
              y: worker.y + dy * ratio
            };
          }

          // Continuous local patrolling workers logic (walk/drive strictly along road graph in their own sector)
          if (worker.status === 'FREE_PATROLLING') {
            if (!worker.pathWaypoints || worker.pathWaypoints.length < 2 || (worker.currentSegmentIndex || 0) >= worker.pathWaypoints.length - 1) {
              let waypoints: { x: number; y: number }[];
              if (isCustomMode && customElements.length > 0) {
                waypoints = getCustomPatrolWaypoints(worker, customElements, customConnections);
              } else {
                const isNorth = worker.baseId === 'PTO_1' || worker.baseId === 'PARKING_1' || worker.baseId === 'AK_4';
                const sectorNodes = isNorth
                  ? ['STAND_B10', 'STAND_B12', 'STAND_B14', 'STAND_C21', 'STAND_C25', 'STAND_C27', 'STAND_101', 'STAND_102', 'STAND_105', 'WAY_AK4', 'WAY_N_WEST', 'WAY_N_MID', 'WAY_N_EAST', 'PTO_1', 'PARKING_1', 'AK_4']
                  : ['STAND_D12', 'STAND_D14', 'STAND_D18', 'STAND_D24', 'STAND_E38', 'STAND_F45', 'STAND_201', 'STAND_204', 'WAY_S_WEST', 'WAY_S_MID', 'WAY_S_EAST', 'WAY_AK1', 'PTO_2', 'PARKING_2', 'AK_1'];
                
                const currentNodeId = getClosestSectorNodeId(worker.x, worker.y, sectorNodes);
                const localTargetId = pickPatrolTargetId(worker.baseId);
                const nodePath = findDijkstraShortestPath(currentNodeId, localTargetId);
                waypoints = getWaypointsForNodePath({ x: worker.x, y: worker.y }, nodePath);
              }

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

            const wsPatrol = getWeatherSpeeds();
            const speedMetersPerSec = worker.vehicle === 'APRON_VEHICLE' ? wsPatrol.vehicleKmH / 3.6 : wsPatrol.pedestrianKmH / 3.6;
            const pctPerSec = (speedMetersPerSec / 4000) * 100 * simSpeed;
            const moveDistPct = pctPerSec * dtSec;

            if (distPct < 1.2 || moveDistPct >= distPct) {
              return {
                ...worker,
                x: targetPt.x,
                y: targetPt.y,
                currentSegmentIndex: currIdx + 1
              };
            }

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
            if (task.status === 'COMPLETED') {
              return task;
            }

            const currentTransitSec = task.elapsedTransitSec || 0;
            const currentWorkSec = task.elapsedWorkSec || 0;

            const isAllArrived = task.crew.length > 0 && task.crew.every(m => {
              const w = workerIdx.get(m.workerId);
              return w && w.status === 'WORKING_ON_SITE';
            });

            const arrivedCount = task.crew.filter(m => {
              const w = workerIdx.get(m.workerId);
              return w && w.status === 'WORKING_ON_SITE';
            }).length;

            let status = task.status;
            let elapsedWorkSec = currentWorkSec;

            if (task.status === 'DISPATCHED' && isAllArrived) {
              status = 'WORKING';
              task.startedAtSimSec = simClockRef.current;
            }

            if (status === 'WORKING') {
              elapsedWorkSec += dtSec * simSpeed;
              const durationSec = task.targetWorkSec || 40.0;
              if (elapsedWorkSec >= durationSec) {
                completedTaskIds.push(task.id);
              }
            } else if (status === 'DISPATCHED') {
              const failsafeTransitSec = Math.max(60, (task.maxEtaMinutes || 10) * 60 * 1.5);
              if (currentTransitSec > failsafeTransitSec) {
                const standObj = activeStands.find(s => s.id === task.standId);
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
              task.elapsedTransitSec = currentTransitSec + dtSec * simSpeed;
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
                ? { ...t, status: 'COMPLETED' as const, completedAtSimSec: completedAtSim, completedAtMs: Date.now() }
                : t
            );

            // Collect every worker freed by the completed tasks (deduped)
            const freedWorkers: Worker[] = [];
            completedTaskIds.forEach(cId => {
              const doneTask = tasksRef.current.find(t => t.id === cId);
              if (!doneTask) return;
              standCooldownsRef.current.set(doneTask.standId, completedAtSim);
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

            // Freed workers transition to RETURNING_TO_BASE or local FREE_PATROLLING
            const freedFree: Map<string, Worker> = new Map();
            freedWorkers.forEach(w => {
              if (w.isPatrolPreference) {
                let patrolWaypoints: { x: number; y: number }[];
                if (isCustomMode && customElements.length > 0) {
                  patrolWaypoints = getCustomPatrolWaypoints(w, customElements, customConnections);
                } else {
                  const isNorth = w.baseId === 'PTO_1' || w.baseId === 'PARKING_1' || w.baseId === 'AK_4';
                  const sectorNodes = isNorth
                    ? ['STAND_B10', 'STAND_B12', 'STAND_B14', 'STAND_C21', 'STAND_C25', 'STAND_C27', 'STAND_101', 'STAND_102', 'STAND_105', 'WAY_AK4', 'WAY_N_WEST', 'WAY_N_MID', 'WAY_N_EAST', 'PTO_1', 'PARKING_1', 'AK_4']
                    : ['STAND_D12', 'STAND_D14', 'STAND_D18', 'STAND_D24', 'STAND_E38', 'STAND_F45', 'STAND_201', 'STAND_204', 'WAY_S_WEST', 'WAY_S_MID', 'WAY_S_EAST', 'WAY_AK1', 'PTO_2', 'PARKING_2', 'AK_1'];
                  const startNodeId = getClosestSectorNodeId(w.x, w.y, sectorNodes);
                  const localTargetId = pickPatrolTargetId(w.baseId);
                  const nodePath = findDijkstraShortestPath(startNodeId, localTargetId);
                  patrolWaypoints = getWaypointsForNodePath({ x: w.x, y: w.y }, nodePath);
                }
                freedFree.set(w.id, {
                  ...w,
                  status: 'FREE_PATROLLING',
                  currentTaskId: undefined,
                  pathWaypoints: patrolWaypoints,
                  pathSpeedPctPerSimSec: undefined,
                  currentSegmentIndex: 0
                });
              } else {
                let returnWaypoints: { x: number; y: number }[];
                if (isCustomMode && customElements.length > 0) {
                  returnWaypoints = getCustomReturnToBaseWaypoints(w, customElements, customConnections);
                } else {
                  const closestNodeId = getClosestNodeId(w.x, w.y);
                  const targetHomeId = w.dutyStandId || w.baseId;
                  const nodePath = findDijkstraShortestPath(closestNodeId, targetHomeId);
                  returnWaypoints = getWaypointsForNodePath({ x: w.x, y: w.y }, nodePath);
                }

                freedFree.set(w.id, {
                  ...w,
                  status: 'RETURNING_TO_BASE',
                  currentTaskId: undefined,
                  pathWaypoints: returnWaypoints,
                  pathSpeedPctPerSimSec: undefined,
                  currentSegmentIndex: 0
                });
              }
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
          } else {
            // UNCONDITIONAL update to preserve fractional timer progress
            tasksRef.current = nextTasks;
          }
        }
        
        // 4. AUTO-PAUSE AFTER 7 SECONDS UPON ALL SCENARIO TASKS COMPLETION
        if (tasksRef.current.length > 0 && tasksRef.current.every(t => t.status === 'COMPLETED')) {
          if (!scenarioCompletedFlagRef.current) {
            scenarioCompletedFlagRef.current = true;
            showNotification('🏁 Все вызовы сценария завершены! Включится Автопауза через 7 секунд...');
            if (autoPauseTimeoutRef.current) clearTimeout(autoPauseTimeoutRef.current);
            autoPauseTimeoutRef.current = setTimeout(() => {
              setIsPaused(true);
              showNotification('⏸️ Сценарий завершён (Автопауза через 7 сек).');
            }, 7000);
          }
        } else if (tasksRef.current.some(t => t.status !== 'COMPLETED')) {
          scenarioCompletedFlagRef.current = false;
          if (autoPauseTimeoutRef.current) {
            clearTimeout(autoPauseTimeoutRef.current);
            autoPauseTimeoutRef.current = null;
          }
        }

        // 5. THROTTLE UI UPDATES to ~10 FPS (100ms) to prevent React blocking the main thread
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

  // Auto-launch initial active simulation on startup so engineers move and perform work immediately!
  useEffect(() => {
    const timer = setTimeout(() => {
      runScenario('standard');
    }, 400);
    return () => clearTimeout(timer);
  }, []);

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
    syncHistoricalTasks(nextTasks);

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
        let returnWaypoints: { x: number; y: number }[];
        if (isCustomMode && customElements.length > 0) {
          returnWaypoints = getCustomReturnToBaseWaypoints(wObj, customElements, customConnections);
        } else {
          const closestNodeId = getClosestNodeId(wObj.x, wObj.y);
          const homeBaseId = wObj.baseId;
          const nodePath = findDijkstraShortestPath(closestNodeId, homeBaseId);
          returnWaypoints = getWaypointsForNodePath({ x: wObj.x, y: wObj.y }, nodePath);
        }

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
    const standsSample = [...activeStands].sort(() => 0.5 - Math.random()).slice(0, Math.min(10, activeStands.length));
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
      targetWorkSec: 40
      };

      newTasks.push(task);
    });

    const combinedTasks = [...newTasks, ...tasksRef.current];
    tasksRef.current = combinedTasks;
    setTasks(combinedTasks);
    syncHistoricalTasks(combinedTasks);

    drainQueueWithFreeWorkers();
    showNotification(`💥 СТРЕСС-ТЕСТ: Сгенерировано 10 вызовов! Персонал выехал по приоритету AOG > URGENT > ROUTINE.`);
  }, [drainQueueWithFreeWorkers, showNotification]);

  const applyShiftConfig = useCallback((b1: number, b2: number, catA: number, vehicles: number) => {
    shiftCountsRef.current = { b1, b2, catA, vehicles };
    const updatedWorkers = isCustomMode
      ? spawnAirfieldShift({
          b1Count: b1, b2Count: b2, catACount: catA, vehiclesCount: vehicles,
          customElements, customConnections, customFacilities: activeFacilities, customStands: activeStands, isCustomMode: true
        })
      : generateShiftWorkersWithCustomCounts(b1, b2, catA, vehicles, activeFacilities, activeStands);
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
  }, [isCustomMode, customElements, activeFacilities, activeStands, drainQueueWithFreeWorkers, showNotification]);

  const enqueueAutoTask = useCallback((
    standId: string,
    categoryCode: CategoryCode,
    priority: TaskPriority,
    defectId?: string
  ) => {
    const stand = activeStands.find(s => s.id === standId) || activeStands[0];
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
      targetWorkSec: 40
    };
    const combined = [task, ...tasksRef.current];
    tasksRef.current = combined;
    setTasks(combined);
    syncHistoricalTasks(combined);
    drainQueueWithFreeWorkers();
  }, [drainQueueWithFreeWorkers, customElements]);

  // Reset the shift to its optimal base deployment (FREE at home bases),
  // clear all active/queued calls, analytics and ROI history.
  const resetShiftToOptimal = useCallback((showToast: boolean) => {
    const { b1, b2, catA, vehicles } = shiftCountsRef.current;
    const updatedWorkers = isCustomMode
      ? spawnAirfieldShift({
          b1Count: b1, b2Count: b2, catACount: catA, vehiclesCount: vehicles,
          customElements, customConnections, customFacilities: activeFacilities, customStands: activeStands, isCustomMode: true
        })
      : generateShiftWorkersWithCustomCounts(b1, b2, catA, vehicles, activeFacilities, activeStands);
    workersRef.current = updatedWorkers;
    setWorkers(updatedWorkers);

    archiveCurrentTasks();
    statsRef.current = [];
    setDispatchStats([]);
    roiMetricsRef.current = { completedCount: 0, systemEtaSumMinutes: 0, intuitiveEtaSumMinutes: 0 };
    lastRoiCountRef.current = 0;
    setRoiMetrics({ completedCount: 0, systemEtaSumMinutes: 0, intuitiveEtaSumMinutes: 0 });
    simClockRef.current = 0;
    setSimClockSec(0);
    isStressTestActiveRef.current = false;
    setIsStressTestActive(false);
    resetWeatherOverrides();
    if (showToast) showNotification(`🧹 Сброс: ${b1 + b2 + catA} инженеров на базах ПТО, все вызовы очищены.`);
  }, [showNotification]);

  const syncHistoricalTasks = useCallback((tasksToSync: OtoTask[]) => {
    if (tasksToSync.length === 0) return;
    const map = new Map<string, OtoTask>();
    allHistoricalTasksRef.current.forEach(t => map.set(t.id, t));
    tasksToSync.forEach(t => map.set(t.id, t));
    allHistoricalTasksRef.current = Array.from(map.values());
    setAllHistoricalTasks([...allHistoricalTasksRef.current]);
  }, []);

  const archiveCurrentTasks = useCallback(() => {
    if (tasksRef.current.length > 0) {
      const map = new Map<string, OtoTask>();
      allHistoricalTasksRef.current.forEach(t => map.set(t.id, t));
      tasksRef.current.forEach(t => map.set(t.id, t));
      allHistoricalTasksRef.current = Array.from(map.values());
      setAllHistoricalTasks([...allHistoricalTasksRef.current]);

      setArchivedTasks(prev => {
        const aMap = new Map<string, OtoTask>();
        prev.forEach(t => aMap.set(t.id, t));
        tasksRef.current.forEach(t => aMap.set(t.id, t));
        return Array.from(aMap.values());
      });

      // Instantly free all workers so they can immediately accept new scenario calls
      workersRef.current = workersRef.current.map(w => ({
        ...w,
        status: w.isPatrolPreference ? ('FREE_PATROLLING' as const) : ('FREE_STATIONARY' as const),
        currentTaskId: undefined,
        pathWaypoints: undefined,
        pathSpeedPctPerSimSec: undefined,
        currentSegmentIndex: undefined
      }));
      setWorkers([...workersRef.current]);

      tasksRef.current = [];
      setTasks([]);
    }
  }, []);

  const SCENARIO_NAMES: Record<string, string> = {
    standard: 'Стандартный день',
    series: 'Серия вызовов',
    peak: 'Час пик (10 бортов)',
    hellish: '🔥 Стресс-тест (3–5)',
    aog: 'Срочный AOG-перехват',
    deficit: 'Кадровый дефицит',
    snow: 'Снегопад',
    reset: 'Базовый режим'
  };

  const runScenario = useCallback((scenarioId: string) => {
    archiveCurrentTasks();
    const getStandId = (idx: number, fallbackId: string) =>
      activeStands.length > 0 ? activeStands[idx % activeStands.length].id : fallbackId;

    setActiveScenarioName(SCENARIO_NAMES[scenarioId] || 'Оперативный план');
    switch (scenarioId) {
      case 'standard': {
        resetShiftToOptimal(false);
        const targetStand = activeStands[0];
        setTimeout(() => enqueueAutoTask(targetStand ? targetStand.id : 'STAND_D18', 'B1', 'ROUTINE', 'ATA72'), 400);
        showNotification(targetStand ? `Симуляция запущена на ${targetStand.label}.` : 'Стандартная симуляция запущена: вызов направлен на D18.');
        break;
      }
      case 'hellish': {
        isStressTestActiveRef.current = true;
        setIsStressTestActive(true);

        enqueueAutoTask(getStandId(0, 'STAND_B12'), 'B1', 'AOG', 'ATA32');
        setTimeout(() => enqueueAutoTask(getStandId(1, 'STAND_C25'), 'B2', 'URGENT', 'ATA24'), 2500);
        setTimeout(() => enqueueAutoTask(getStandId(2, 'STAND_D18'), 'B1', 'ROUTINE', 'ATA72'), 5500);
        showNotification(`🔥 ПОСТЕПЕННЫЙ СТРЕСС-ТЕСТ: Симулятор автоматически поддерживает задачи в очереди с реалистичными интервалами!`);
        break;
      }
      case 'peak':
        triggerStressTest();
        break;
      case 'deficit': {
        applyShiftConfig(3, 1, 0, 2);
        enqueueAutoTask(getStandId(0, 'STAND_B12'), 'B1', 'AOG', 'ATA32');
        setTimeout(() => enqueueAutoTask(getStandId(1, 'STAND_D18'), 'B2', 'AOG', 'ATA34'), 2000);
        setTimeout(() => enqueueAutoTask(getStandId(2, 'STAND_F45'), 'B1', 'URGENT', 'ATA72'), 4500);
        setTimeout(() => enqueueAutoTask(getStandId(3, 'STAND_105'), 'B2', 'URGENT', 'ATA24'), 7000);
        showNotification(`⚠️ Сценарий «Кадровый дефицит»: 4 инженера на волну вызовов.`);
        break;
      }
      case 'series': {
        enqueueAutoTask(getStandId(0, 'STAND_B12'), 'B1', 'ROUTINE', 'ATA72');
        setTimeout(() => enqueueAutoTask(getStandId(1, 'STAND_B14'), 'B1', 'ROUTINE', 'ATA32'), 3000);
        setTimeout(() => enqueueAutoTask(getStandId(2, 'STAND_C21'), 'B2', 'ROUTINE', 'ATA24'), 6000);
        setTimeout(() => enqueueAutoTask(getStandId(3, 'STAND_C25'), 'B2', 'ROUTINE', 'ATA34'), 9000);
        showNotification(`📋 Сценарий «Серия вызовов»: 4 плановых вызова с реалистичным интервалом.`);
        break;
      }
      case 'aog': {
        enqueueAutoTask(getStandId(0, 'STAND_C25'), 'B2', 'ROUTINE', 'ATA34');
        setTimeout(() => enqueueAutoTask(getStandId(1, 'STAND_D18'), 'B1', 'AOG', 'ATA72'), 3500);
        setTimeout(() => enqueueAutoTask(getStandId(2, 'STAND_F45'), 'A', 'AOG', 'ATA49'), 7000);
        showNotification(`⚡ Сценарий «AOG»: рутинный вызов + срочные AOG сверху.`);
        break;
      }
      case 'remote': {
        enqueueAutoTask(getStandId(activeStands.length - 1, 'STAND_105'), 'B1', 'URGENT', 'ATA32');
        setTimeout(() => enqueueAutoTask(getStandId(activeStands.length - 2, 'STAND_201'), 'B2', 'URGENT', 'ATA24'), 3000);
        setTimeout(() => enqueueAutoTask(getStandId(activeStands.length - 3, 'STAND_204'), 'B1', 'ROUTINE', 'ATA32'), 6000);
        showNotification(`🗺️ Сценарий «Удалённые стоянки»: вызовы в дальние зоны.`);
        break;
      }
      case 'aogDefect': {
        enqueueAutoTask(getStandId(0, 'STAND_D18'), 'B1', 'AOG', 'ATA32');
        showNotification(`🩸 Сценарий «AOG-дефект»: утечка гидравлики → квалификация B1.`);
        break;
      }
      case 'snow': {
        applyWeatherOverrides(3.5, 12.0);
        enqueueAutoTask(getStandId(0, 'STAND_C21'), 'B2', 'URGENT', 'ATA24');
        setTimeout(() => enqueueAutoTask(getStandId(1, 'STAND_E38'), 'B1', 'URGENT', 'ATA32'), 3000);
        showNotification(`❄️ Сценарий «Снегопад»: скорость пешком 3.5 км/ч, авто 12 км/ч. ETA вызовов выросли.`);
        break;
      }
      case 'slaBreach': {
        enqueueAutoTask(getStandId(activeStands.length - 1, 'STAND_D24'), 'B2', 'AOG', 'ATA24');
        showNotification(`🚨 CRITICAL_SLA_ALERT: вызов на удаленную стоянку, превышение SLA!`);
        break;
      }
      case 'reset': {
        resetShiftToOptimal(true);
        break;
      }
      default:
        break;
    }
  }, [activeStands, triggerStressTest, applyShiftConfig, enqueueAutoTask, resetShiftToOptimal, applyWeatherOverrides, showNotification]);

  // Hackathon PRESET SCENARIOS (quick-action bar, one click each)
  const runPreset = useCallback((presetId: string) => {
    archiveCurrentTasks();
    const getStandId = (idx: number, fallbackId: string) =>
      activeStands.length > 0 ? activeStands[idx % activeStands.length].id : fallbackId;

    switch (presetId) {
      case 'standard': {
        resetShiftToOptimal(true);
        setTimeout(() => enqueueAutoTask(getStandId(0, 'STAND_D18'), 'B1', 'ROUTINE', 'ATA72'), 400);
        showNotification(`🟢 Пресет «Стандартный»: смена на базах, вызов ATA 72 на стоянку.`);
        break;
      }
      case 'rushhour': {
        enqueueAutoTask(getStandId(0, 'STAND_B12'), 'B1', 'URGENT', 'ATA32');
        setTimeout(() => enqueueAutoTask(getStandId(1, 'STAND_C25'), 'B2', 'URGENT', 'ATA24'), 2500);
        setTimeout(() => enqueueAutoTask(getStandId(2, 'STAND_D18'), 'B2', 'URGENT', 'ATA34'), 5000);
        setTimeout(() => enqueueAutoTask(getStandId(3, 'STAND_D24'), 'B1', 'AOG', 'ATA72'), 7500);
        setTimeout(() => enqueueAutoTask(getStandId(4, 'STAND_F45'), 'B1', 'URGENT', 'ATA49'), 10000);
        showNotification(`🚦 Пресет «Час-Пик»: 5 ATA-вызовов с реалистичной очередью.`);
        break;
      }
      case 'snow': {
        // Weather factor: WALK 3.5 km/h, CAR 12 km/h
        applyWeatherOverrides(3.5, 12.0);
        enqueueAutoTask(getStandId(0, 'STAND_C21'), 'B2', 'URGENT', 'ATA24');
        setTimeout(() => enqueueAutoTask(getStandId(1, 'STAND_E38'), 'B1', 'URGENT', 'ATA32'), 3000);
        showNotification(`❄️ Пресет «Снегопад»: скорость пешком 3.5 км/ч, авто 12 км/ч. ETA вызовов выросли.`);
        break;
      }
      case 'slaBreach': {
        enqueueAutoTask(getStandId(activeStands.length - 1, 'STAND_D24'), 'B2', 'AOG', 'ATA24');
        showNotification(`🚨 CRITICAL_SLA_ALERT: B2-вызов на удаленную стоянку, превышение SLA!`);
        break;
      }
      case 'hellish': {
        archiveCurrentTasks();
        isStressTestActiveRef.current = true;
        setIsStressTestActive(true);

        enqueueAutoTask(getStandId(0, 'STAND_B12'), 'B1', 'AOG', 'ATA32');
        setTimeout(() => enqueueAutoTask(getStandId(1, 'STAND_C25'), 'B2', 'URGENT', 'ATA24'), 3000);
        showNotification(`🔥 ПОСТЕПЕННЫЙ СТРЕСС-ТЕСТ: Симулятор автоматически поддерживает задачи в очереди!`);
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
      const stand = activeStands.find(s => s.id === sc.stand) || activeStands[0];
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
    const standIds = activeStands.map(s => s.id);
    const cats: CategoryCode[] = ['B1', 'B2', 'A'];
    for (let i = 0; i < massCount; i++) {
      const stand = standById.get(standIds[i % standIds.length]);
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
      const stand = standById.get(standIds[i % standIds.length]);
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

  const updateWorker = useCallback((workerId: string, updates: Partial<Worker>) => {
    setWorkers(prev => {
      const next = prev.map(w => w.id === workerId ? { ...w, ...updates } : w);
      workersRef.current = next;
      return next;
    });
    showNotification(`Параметры специалиста ${workerId} сохранены.`);
  }, [showNotification]);

  const manuallyAssignTask = useCallback((taskId: string, workerId: string) => {
    const task = tasksRef.current.find(t => t.id === taskId);
    const worker = workersRef.current.find(w => w.id === workerId);
    const stand = task ? standById.get(task.standId) : undefined;
    if (!task || !worker || !stand || task.status !== 'QUEUED') return;
    if (worker.status !== 'FREE_STATIONARY' && worker.status !== 'FREE_PATROLLING') return;

    const member = isCustomMode
      ? calculateModularWorkerEta(worker, stand, customElements, customConnections)
      : calculateWorkerToStandEta(worker, stand);
    const nextWorker = {
      ...worker,
      status: 'IN_TRANSIT' as const,
      currentTaskId: task.id,
      pathWaypoints: member.waypoints,
      pathSpeedPctPerSimSec: pathSpeedFor(member),
      currentSegmentIndex: 0,
      dispatchedCount: (worker.dispatchedCount || 0) + 1
    };
    const nextTask = {
      ...task,
      status: 'DISPATCHED' as const,
      crew: [member],
      arrivedCount: 0,
      maxEtaMinutes: member.etaMinutes,
      waitingReason: undefined,
      startedAtSimSec: task.startedAtSimSec ?? simClockRef.current
    };

    workersRef.current = workersRef.current.map(w => w.id === workerId ? nextWorker : w);
    tasksRef.current = tasksRef.current.map(t => t.id === taskId ? nextTask : t);
    setWorkers([...workersRef.current]);
    setTasks([...tasksRef.current]);
    showNotification(`Ручное назначение: ${worker.name} направлен на ${task.standLabel}.`);
  }, [showNotification]);

  return {
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
    promoteTaskToAog,
    triggerStressTest,
    applyShiftConfig,
    updateWorker,
    manuallyAssignTask,
    dispatchStats,
    roiMetrics,
    simClockSec,
    weatherMode,
    setWeatherMode,
    runScenario,
    activeScenarioName,
    runPreset,
    runControlTests,
    activeStands,
    activeFacilities
  };
}
