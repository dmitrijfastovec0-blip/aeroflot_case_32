import { useState, useRef, useEffect, useCallback } from 'react';
import { Worker, OtoTask, WorkerStatus, TaskPriority, TaskCrewMember, CategoryCode } from '../types/index';
import { SVO_STANDS, SVO_FACILITIES, SVO_NODES, DEFECT_TYPES, AIRCRAFT_DOWNTIME_COST_PER_MIN } from '../constants/index';
import {
  getClosestNodeId,
  findDijkstraShortestPath,
  getWaypointsForNodePath,
  calculateWorkerToStandEta,
  findNearestFreeWorkerOfCategory,
  generateShiftWorkersWithCustomCounts,
  getCategoryCandidates,
  findNaiveNearestWorkerOfCategory
} from '../services/dijkstra';

// Dispatch analytics: "intuitive dispatcher" vs system (saved minutes, SLA compliance)
export interface DispatchStat {
  taskId: string;
  standLabel: string;
  categoryCode: CategoryCode;
  defectLabel?: string;
  intuitiveEtaMinutes: number;
  systemEtaMinutes: number;
  savedMinutes: number;
  within15: boolean;
  createdAt: string;
}

export interface ControlTestResult {
  name: string;
  pass: boolean;
  details: string;
  ms: number;
}

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

  // Priority Rank Helper (AOG = 1, URGENT = 2, ROUTINE = 3)
  const getPriorityRank = (p: TaskPriority) => {
    switch (p) {
      case 'AOG': return 1;
      case 'URGENT': return 2;
      case 'ROUTINE': return 3;
    }
  };

  // Helper to sort queued tasks strictly by Priority (AOG > URGENT > ROUTINE), then by wait time
  const sortQueuedTasks = (taskList: OtoTask[]) => {
    return [...taskList].sort((a, b) => {
      const rankA = getPriorityRank(a.priority);
      const rankB = getPriorityRank(b.priority);
      if (rankA !== rankB) return rankA - rankB; // 1 before 2, 2 before 3
      return (b.elapsedQueueSec || 0) - (a.elapsedQueueSec || 0); // Older wait time first
    });
  };

  // -----------------------------------------------------------------
  // DRAIN QUEUE ALGORITHM: SERVICING HIGHEST PRIORITY TASKS FIRST
  // -----------------------------------------------------------------
  const drainQueueWithFreeWorkers = useCallback(() => {
    let currentWorkers = [...workersRef.current];
    let currentTasks = [...tasksRef.current];
    let stateChanged = false;

    // Get all QUEUED tasks sorted strictly by Priority (AOG > URGENT > ROUTINE)
    const queuedList = sortQueuedTasks(currentTasks.filter(t => t.status === 'QUEUED'));

    for (const qTask of queuedList) {
      const targetStand = SVO_STANDS.find(s => s.id === qTask.standId);
      if (!targetStand) continue;

      const usedInLoop = new Set<string>();
      let crewMembers: TaskCrewMember[] = [];

      if (qTask.crew.length > 0) {
        // User-assembled crew: dispatch the exact selected engineers,
        // but only once the WHOLE crew is available (no partial dispatch).
        const allAvailable = qTask.crew.every(member => {
          const w = currentWorkers.find(wrk => wrk.id === member.workerId);
          return w && !usedInLoop.has(w.id) &&
            (w.status === 'FREE_STATIONARY' || w.status === 'FREE_PATROLLING');
        });

        if (!allAvailable) continue;

        crewMembers = qTask.crew;
        crewMembers.forEach(m => usedInLoop.add(m.workerId));
      } else {
        // Auto-assemble crew from task category (stress test / system tasks)
        const nearest = findNearestFreeWorkerOfCategory(qTask.categoryCode, targetStand, currentWorkers, usedInLoop);
        if (!nearest) continue;
        usedInLoop.add(nearest.workerId);
        crewMembers = [nearest];
      }

      // Recompute fresh ETA & waypoints against the workers' current positions
      const freshMembers: TaskCrewMember[] = crewMembers.map(member => {
        const workerObj = currentWorkers.find(w => w.id === member.workerId)!;
        return calculateWorkerToStandEta(workerObj, targetStand);
      });

      // Pacing: traverse the pixel path in EXACTLY the displayed ETA (sim-seconds),
      // so the arrival time always matches the ETA badge regardless of distance model.
      const pathSpeedFor = (member: TaskCrewMember): number => {
        let totalPct = 0;
        for (let i = 0; i < member.waypoints.length - 1; i++) {
          totalPct += Math.hypot(
            member.waypoints[i + 1].x - member.waypoints[i].x,
            member.waypoints[i + 1].y - member.waypoints[i].y
          );
        }
        const etaSimSec = Math.max(1, member.etaMinutes * 60);
        return Math.max(0.01, totalPct / etaSimSec);
      };

      const maxEtaMinutes = Math.max(...freshMembers.map(m => m.etaMinutes));
      stateChanged = true;

      // Record "intuitive dispatcher vs system" analytics for this dispatch
      const { busy, load } = computeLoadMap(currentTasks);
      const naivePick = findNaiveNearestWorkerOfCategory(qTask.categoryCode, targetStand, currentWorkers, busy);
      if (naivePick) {
        const systemBestEta = Math.min(...freshMembers.map(m => m.etaMinutes));
        const saved = Math.max(0, Math.round((naivePick.etaMinutes - systemBestEta) * 10) / 10);
        statsRef.current = [{
          taskId: qTask.id,
          standLabel: qTask.standLabel,
          categoryCode: qTask.categoryCode,
          defectLabel: qTask.defectLabel,
          intuitiveEtaMinutes: naivePick.etaMinutes,
          systemEtaMinutes: systemBestEta,
          savedMinutes: saved,
          within15: systemBestEta <= 15,
          createdAt: new Date().toLocaleTimeString('ru-RU', { hour12: false })
        }, ...statsRef.current].slice(0, 100);
        setDispatchStats([...statsRef.current]);
      }

      // Update task: set full crew and transition to DISPATCHED
      currentTasks = currentTasks.map(t => {
        if (t.id === qTask.id) {
          return {
            ...t,
            status: 'DISPATCHED' as const,
            crew: freshMembers,
            arrivedCount: 0,
            maxEtaMinutes,
            intuitiveEtaMinutes: naivePick?.etaMinutes
          };
        }
        return t;
      });

      // Dispatch every crew member with their own vehicle & waypoints
      currentWorkers = currentWorkers.map(w => {
        const member = freshMembers.find(m => m.workerId === w.id);
        if (!member) return w;
        return {
          ...w,
          status: 'IN_TRANSIT' as WorkerStatus,
          vehicle: w.vehicle,
          currentTaskId: qTask.id,
          pathWaypoints: member.waypoints,
          pathSpeedPctPerSimSec: pathSpeedFor(member),
          currentSegmentIndex: 0
        };
      });
    }

    if (stateChanged) {
      workersRef.current = currentWorkers;
      tasksRef.current = currentTasks;
      // Note: setWorkers and setTasks are throttled in the main loop, 
      // but we force a UI update on dispatch to ensure immediate feedback.
      setWorkers(currentWorkers);
      setTasks(currentTasks);
    }
  }, []);

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
            const fallbackSpeedKmH = worker.vehicle === 'APRON_VEHICLE' ? 20.0 : 4.5;
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

            if (distPct < 1.2) {
              return {
                ...worker,
                x: targetPt.x,
                y: targetPt.y,
                currentSegmentIndex: currIdx + 1
              };
            }

            const speedMetersPerSec = worker.vehicle === 'APRON_VEHICLE' ? 5.0 : 2.0;
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
              const w = workersRef.current.find(wrk => wrk.id === member.workerId);
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
                task.crew.forEach(member => {
                  workersRef.current = workersRef.current.map(w => {
                    if (w.id === member.workerId && w.status === 'IN_TRANSIT') {
                      const standObj = SVO_STANDS.find(s => s.id === task.standId);
                      return {
                        ...w,
                        x: standObj ? standObj.x : w.x,
                        y: standObj ? standObj.y : w.y,
                        status: 'WORKING_ON_SITE',
                        pathWaypoints: undefined
                      };
                    }
                    return w;
                  });
                });
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

          // 3. HANDLE TASK COMPLETIONS & RE-DRAIN QUEUE
          if (completedTaskIds.length > 0) {
            const remainingTasks = nextTasks.filter(t => !completedTaskIds.includes(t.id));

            completedTaskIds.forEach(cId => {
              const doneTask = tasksRef.current.find(t => t.id === cId);
              if (doneTask) {
                showNotification(`✅ 2 мин ТО завершено на стоянке ${doneTask.standLabel}! Инженеры освобождены.`);

                const crewIds = new Set(doneTask.crew.map(c => c.workerId));
                let updatedWorkers = [...workersRef.current];

                // Set finished crew workers to FREE_STATIONARY or RETURNING_TO_BASE
                crewIds.forEach(wId => {
                  const wObj = updatedWorkers.find(w => w.id === wId);
                  if (wObj) {
                    const closestNodeId = getClosestNodeId(wObj.x, wObj.y);
                    const homeBaseId = wObj.baseId;
                    const nodePath = findDijkstraShortestPath(closestNodeId, homeBaseId);
                    const returnWaypoints = getWaypointsForNodePath({ x: wObj.x, y: wObj.y }, nodePath);

                    updatedWorkers = updatedWorkers.map(w => {
                      if (w.id === wId) {
                        return {
                          ...w,
                          status: 'RETURNING_TO_BASE' as WorkerStatus,
                          currentTaskId: undefined,
                          pathWaypoints: returnWaypoints,
                          pathSpeedPctPerSimSec: undefined,
                          currentSegmentIndex: 0
                        };
                      }
                      return w;
                    });
                  }
                });

                workersRef.current = updatedWorkers;
              }
            });

            tasksRef.current = remainingTasks;
            
            // Force UI update on completion
            setWorkers([...workersRef.current]);
            setTasks([...remainingTasks]);
            lastRenderTimeRef.current = now;

            // Instantly drain queue with newly freed workers!
            setTimeout(() => drainQueueWithFreeWorkers(), 50);
          } else {
            // UNCONDITIONAL update to preserve fractional timer progress
            tasksRef.current = nextTasks;
          }
        }
        
        // 4. THROTTLE UI UPDATES to ~10 FPS (100ms) to prevent React blocking the main thread
        if (now - lastRenderTimeRef.current > 100) {
          setWorkers([...workersRef.current]);
          setTasks([...tasksRef.current]);
          lastRenderTimeRef.current = now;
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
      arrivedCount: 0,
      maxEtaMinutes: 12.0,
      slaLimitMinutes: 15.0,
      withinSla: true,
      createdAt: new Date().toLocaleTimeString('ru-RU', { hour12: false }),
      elapsedQueueSec: 0,
      elapsedWorkSec: 0,
      targetWorkSec: 120
    };
    const combined = [task, ...tasksRef.current];
    tasksRef.current = combined;
    setTasks(combined);
    drainQueueWithFreeWorkers();
  }, [drainQueueWithFreeWorkers]);

  const runScenario = useCallback((scenarioId: string) => {
    switch (scenarioId) {
      case 'peak':
        triggerStressTest();
        break;
      case 'deficit': {
        applyShiftConfig(3, 1, 0, 2);
        enqueueAutoTask('STAND_B12', 'B1', 'AOG', 'HYD');
        enqueueAutoTask('STAND_D18', 'B2', 'AOG', 'AVN');
        enqueueAutoTask('STAND_F45', 'B1', 'URGENT', 'ENG');
        enqueueAutoTask('STAND_105', 'B2', 'URGENT', 'ELC');
        enqueueAutoTask('STAND_C25', 'A', 'URGENT', 'CAB');
        enqueueAutoTask('STAND_204', 'B1', 'ROUTINE', 'LDG');
        enqueueAutoTask('STAND_201', 'B2', 'ROUTINE', 'AVN');
        enqueueAutoTask('STAND_105', 'B1', 'ROUTINE', 'HYD');
        showNotification(`⚠️ Сценарий «Кадровый дефицит»: 4 инженера на 8 вызовов.`);
        break;
      }
      case 'series': {
        enqueueAutoTask('STAND_B12', 'B1', 'ROUTINE', 'ENG');
        setTimeout(() => enqueueAutoTask('STAND_B14', 'B1', 'ROUTINE', 'HYD'), 1500);
        setTimeout(() => enqueueAutoTask('STAND_C21', 'B2', 'ROUTINE', 'ELC'), 3000);
        setTimeout(() => enqueueAutoTask('STAND_C25', 'B2', 'ROUTINE', 'AVN'), 4500);
        showNotification(`📋 Сценарий «Серия вызовов»: 4 плановых вызова подряд.`);
        break;
      }
      case 'aog': {
        enqueueAutoTask('STAND_C25', 'B2', 'ROUTINE', 'AVN');
        setTimeout(() => enqueueAutoTask('STAND_D18', 'B1', 'AOG', 'ENG'), 2000);
        setTimeout(() => enqueueAutoTask('STAND_F45', 'A', 'AOG', 'CAB'), 4000);
        showNotification(`⚡ Сценарий «AOG»: рутинный вызов + срочные AOG сверху.`);
        break;
      }
      case 'remote': {
        enqueueAutoTask('STAND_105', 'B1', 'URGENT', 'HYD');
        enqueueAutoTask('STAND_201', 'B2', 'URGENT', 'ELC');
        enqueueAutoTask('STAND_204', 'B1', 'ROUTINE', 'LDG');
        showNotification(`🗺️ Сценарий «Удалённые стоянки»: вызовы в северные/южные зоны.`);
        break;
      }
      case 'aogDefect': {
        enqueueAutoTask('STAND_D18', 'B1', 'AOG', 'HYD');
        showNotification(`🩸 Сценарий «AOG-дефект»: утечка гидравлики → квалификация B1.`);
        break;
      }
      default:
        break;
    }
  }, [triggerStressTest, applyShiftConfig, enqueueAutoTask, showNotification]);

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
    submitTask,
    cancelTask,
    promoteTaskToAog,
    triggerStressTest,
    applyShiftConfig,
    dispatchStats,
    runScenario,
    runControlTests
  };
}
