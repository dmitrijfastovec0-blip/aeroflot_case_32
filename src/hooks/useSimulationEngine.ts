import { useState, useRef, useEffect, useCallback } from 'react';
import { Worker, OtoTask, WorkerStatus, TaskPriority, TaskCrewMember } from '../types/index';
import { SVO_STANDS, SVO_FACILITIES, SVO_NODES } from '../constants/index';
import { getClosestNodeId, findDijkstraShortestPath, getWaypointsForNodePath, calculateWorkerToStandEta, calculateCrewMaxEta, findNearestFreeWorkerOfCategory, generateShiftWorkersWithCustomCounts } from '../services/dijkstra';

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

  // Refs for continuous 60FPS loop without closure stale state!
  const workersRef = useRef<Worker[]>(workers);
  const tasksRef = useRef<OtoTask[]>(tasks);

  // Keep refs in sync
  useEffect(() => {
    workersRef.current = workers;
  }, [workers]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const showNotification = (msg: string, durationMs: number = 4000) => {
    setNotificationBanner(msg);
    setTimeout(() => setNotificationBanner(null), durationMs);
  };

  // Priority Rank Helper
  const getPriorityRank = (p: TaskPriority) => {
    switch (p) {
      case 'AOG': return 1;
      case 'URGENT': return 2;
      case 'ROUTINE': return 3;
    }
  };

  // -----------------------------------------------------------------
  // MAIN 60 FPS SIMULATION TICK LOOP
  // -----------------------------------------------------------------
  const lastTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    let animFrameId: number;

    const tick = () => {
      const now = Date.now();
      const dtSec = Math.min(0.2, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      if (!isPaused) {
        let workersChanged = false;
        let tasksChanged = false;

        // 1. UPDATE WORKER POSITIONS
        const nextWorkers = workersRef.current.map((worker): Worker => {
          // A. IN_TRANSIT or RETURNING_TO_BASE
          if ((worker.status === 'IN_TRANSIT' || worker.status === 'RETURNING_TO_BASE') && worker.pathWaypoints && worker.pathWaypoints.length > 1) {
            workersChanged = true;
            const currIdx = worker.currentSegmentIndex || 0;

            if (currIdx >= worker.pathWaypoints.length - 1) {
              const finalStatus: WorkerStatus = worker.status === 'IN_TRANSIT' ? 'WORKING_ON_SITE' : 'FREE_STATIONARY';
              return {
                ...worker,
                status: finalStatus,
                pathWaypoints: undefined,
                currentSegmentIndex: undefined
              };
            }

            const targetPt = worker.pathWaypoints[currIdx + 1];
            const dx = targetPt.x - worker.x;
            const dy = targetPt.y - worker.y;
            const distPct = Math.hypot(dx, dy);

            if (distPct < 0.5) {
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

            // Movement step
            const speedMetersPerSec = worker.vehicle === 'APRON_VEHICLE' ? 6.5 : 1.5;
            const pctPerSec = (speedMetersPerSec / 4000) * 100 * simSpeed * 4.0;
            const moveDistPct = pctPerSec * dtSec;
            const ratio = Math.min(1, moveDistPct / distPct);

            return {
              ...worker,
              x: worker.x + dx * ratio,
              y: worker.y + dy * ratio
            };
          }

          // B. FREE_PATROLLING
          if (worker.status === 'FREE_PATROLLING') {
            workersChanged = true;
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

            if (distPct < 0.5) {
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

        if (workersChanged) {
          workersRef.current = nextWorkers;
          setWorkers(nextWorkers);
        }

        // 2. UPDATE TASKS ARRIVAL AND MAINTENANCE TIMERS
        if (tasksRef.current.length > 0) {
          const completedTaskIds: string[] = [];

          const nextTasks = tasksRef.current.map(task => {
            if (task.status === 'QUEUED') return task;

            // Count how many workers of this task's crew are WORKING_ON_SITE
            const arrivedCount = task.crew.filter(member => {
              const w = workersRef.current.find(wrk => wrk.id === member.workerId);
              return w?.status === 'WORKING_ON_SITE';
            }).length;

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
            }

            if (task.arrivedCount !== arrivedCount || task.status !== status || Math.floor(task.elapsedWorkSec) !== Math.floor(elapsedWorkSec)) {
              tasksChanged = true;
            }

            return {
              ...task,
              arrivedCount,
              elapsedWorkSec,
              status
            };
          });

          // 3. PROCESS COMPLETED TASKS & AUTO-ASSIGN QUEUE
          if (completedTaskIds.length > 0) {
            tasksChanged = true;
            const remainingTasks = nextTasks.filter(t => !completedTaskIds.includes(t.id));

            completedTaskIds.forEach(cId => {
              const doneTask = tasksRef.current.find(t => t.id === cId);
              if (doneTask) {
                showNotification(`✅ 2 мин ТО завершено на стоянке ${doneTask.standLabel}! Карточка закрыта.`);

                const crewIds = new Set(doneTask.crew.map(c => c.workerId));
                let updatedWorkers = [...workersRef.current];

                // For each worker in completed task crew
                crewIds.forEach(wId => {
                  const workerObj = updatedWorkers.find(w => w.id === wId);
                  if (!workerObj) return;

                  // Find queued task for this worker
                  const queuedTasks = remainingTasks.filter(t => t.status === 'QUEUED');
                  const sortedQueued = [...queuedTasks].sort((a, b) => {
                    const rankA = getPriorityRank(a.priority);
                    const rankB = getPriorityRank(b.priority);
                    if (rankA !== rankB) return rankA - rankB;
                    return (a.queueStartTimeMs || 0) - (b.queueStartTimeMs || 0);
                  });

                  const matchingTaskIndex = sortedQueued.findIndex(q =>
                    q.categoryCode === 'A' || workerObj.categoryCode === q.categoryCode
                  );

                  if (matchingTaskIndex !== -1) {
                    const matchedTask = sortedQueued[matchingTaskIndex];
                    const targetStand = SVO_STANDS.find(s => s.id === matchedTask.standId);

                    if (targetStand) {
                      const etaMember = calculateWorkerToStandEta(workerObj, targetStand);
                      matchedTask.crew.push(etaMember);
                      matchedTask.status = 'DISPATCHED';

                      updatedWorkers = updatedWorkers.map(w => {
                        if (w.id === wId) {
                          return {
                            ...w,
                            status: 'IN_TRANSIT' as WorkerStatus,
                            currentTaskId: matchedTask.id,
                            pathWaypoints: etaMember.waypoints,
                            currentSegmentIndex: 0
                          };
                        }
                        return w;
                      });

                      showNotification(`⚡ Инженер ${workerObj.name} авто-перенаправлен на очередную задачу ${matchedTask.id} (${matchedTask.standLabel})!`);
                    }
                  } else {
                    // No queued task -> Return to Base
                    const closestNodeId = getClosestNodeId(workerObj.x, workerObj.y);
                    const homeBaseId = workerObj.baseId;
                    const nodePath = findDijkstraShortestPath(closestNodeId, homeBaseId);
                    const returnWaypoints = getWaypointsForNodePath({ x: workerObj.x, y: workerObj.y }, nodePath);

                    updatedWorkers = updatedWorkers.map(w => {
                      if (w.id === wId) {
                        return {
                          ...w,
                          status: 'RETURNING_TO_BASE' as WorkerStatus,
                          currentTaskId: undefined,
                          pathWaypoints: returnWaypoints,
                          currentSegmentIndex: 0
                        };
                      }
                      return w;
                    });
                  }
                });

                workersRef.current = updatedWorkers;
                setWorkers(updatedWorkers);
              }
            });

            tasksRef.current = remainingTasks;
            setTasks(remainingTasks);
          } else if (tasksChanged) {
            tasksRef.current = nextTasks;
            setTasks(nextTasks);
          }
        }
      }

      animFrameId = requestAnimationFrame(tick);
    };

    animFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameId);
  }, [isPaused, simSpeed]);

  // -----------------------------------------------------------------
  // USER ACTIONS: LAUNCH TASK, CANCEL TASK, STRESS TEST, RECONFIG SHIFT
  // -----------------------------------------------------------------

  const submitTask = useCallback((newTask: OtoTask) => {
    let updatedWorkers = [...workersRef.current];

    // Check if required crew members are free
    const allCrewFree = newTask.crew.length > 0 && newTask.crew.every(c => {
      const w = updatedWorkers.find(wrk => wrk.id === c.workerId);
      return w && (w.status === 'FREE_STATIONARY' || w.status === 'FREE_PATROLLING');
    });

    if (allCrewFree) {
      // DISPATCH TASK IMMEDIATELY!
      const dispatchedTask: OtoTask = { ...newTask, status: 'DISPATCHED' };

      newTask.crew.forEach(cMember => {
        updatedWorkers = updatedWorkers.map(w => {
          if (w.id === cMember.workerId) {
            return {
              ...w,
              status: 'IN_TRANSIT',
              currentTaskId: dispatchedTask.id,
              pathWaypoints: cMember.waypoints,
              currentSegmentIndex: 0
            };
          }
          return w;
        });
      });

      workersRef.current = updatedWorkers;
      setWorkers(updatedWorkers);

      setTasks(prev => [dispatchedTask, ...prev]);
      showNotification(`🚀 Задача ${dispatchedTask.id} запущена! Инженеры выехали на стоянку ${dispatchedTask.standLabel}.`);
    } else {
      // QUEUED STATUS ON STAFF DEFICIT
      const queuedTask: OtoTask = {
        ...newTask,
        status: 'QUEUED',
        queueStartTimeMs: Date.now()
      };

      setTasks(prev => [queuedTask, ...prev]);
      showNotification(`⏳ Дефицит персонала! Задача ${queuedTask.id} поставлена в Приоритетную Очередь (${queuedTask.priority}).`);
    }
  }, []);

  const cancelTask = useCallback((taskId: string) => {
    const targetTask = tasksRef.current.find(t => t.id === taskId);
    if (!targetTask) return;

    const crewIds = new Set(targetTask.crew.map(c => c.workerId));
    let updatedWorkers = [...workersRef.current];

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

    workersRef.current = updatedWorkers;
    setWorkers(updatedWorkers);
    setTasks(prev => prev.filter(t => t.id !== taskId));
    showNotification(`🗑️ Задача ${taskId} отменена. Инженеры возвращаются на базы.`);
  }, []);

  const promoteTaskToAog = useCallback((taskId: string) => {
    setTasks(prev =>
      prev.map(t => (t.id === taskId ? { ...t, priority: 'AOG' as TaskPriority } : t))
    );
    showNotification(`⚡ Задача ${taskId} повышена до Высшего Приоритета AOG!`);
  }, []);

  const triggerStressTest = useCallback(() => {
    const standsSample = [...SVO_STANDS].sort(() => 0.5 - Math.random()).slice(0, 10);
    const priorities: TaskPriority[] = ['AOG', 'AOG', 'URGENT', 'URGENT', 'URGENT', 'ROUTINE', 'ROUTINE', 'ROUTINE', 'ROUTINE', 'ROUTINE'];

    let updatedWorkers = [...workersRef.current];
    const newTasks: OtoTask[] = [];
    const usedWorkerIds = new Set<string>();

    standsSample.forEach((stand, idx) => {
      const priority = priorities[idx % priorities.length];
      const catCode = idx % 2 === 0 ? 'B1' : 'B2';

      // Find nearest free worker
      const freeMember = findNearestFreeWorkerOfCategory(catCode, stand, updatedWorkers, usedWorkerIds);
      const crew: TaskCrewMember[] = [];

      if (freeMember) {
        crew.push(freeMember);
        usedWorkerIds.add(freeMember.workerId);
      }

      const { maxEtaMinutes, withinSla } = calculateCrewMaxEta(crew, 15.0);
      const isDispatched = crew.length > 0;
      const taskId = `STRESS-${Date.now().toString().slice(-4)}-${idx + 1}`;

      if (isDispatched) {
        // Dispatch worker
        crew.forEach(c => {
          updatedWorkers = updatedWorkers.map(w => {
            if (w.id === c.workerId) {
              return {
                ...w,
                status: 'IN_TRANSIT',
                currentTaskId: taskId,
                pathWaypoints: c.waypoints,
                currentSegmentIndex: 0
              };
            }
            return w;
          });
        });
      }

      const task: OtoTask = {
        id: taskId,
        standId: stand.id,
        standLabel: `Стоянка ${stand.label}`,
        aircraftType: `${stand.aircraftType} (Рейс SU-${1000 + idx})`,
        categoryCode: catCode,
        categoryLabel: `ОТО (${priority})`,
        priority,
        status: isDispatched ? 'DISPATCHED' : 'QUEUED',
        crew,
        arrivedCount: 0,
        maxEtaMinutes: maxEtaMinutes || 12.0,
        slaLimitMinutes: 15.0,
        withinSla: true,
        createdAt: new Date().toLocaleTimeString('ru-RU', { hour12: false }),
        queueStartTimeMs: isDispatched ? undefined : Date.now(),
        elapsedWorkSec: 0,
        targetWorkSec: 120
      };

      newTasks.push(task);
    });

    workersRef.current = updatedWorkers;
    setWorkers(updatedWorkers);

    setTasks(prev => [...newTasks, ...prev]);
    showNotification(`💥 СТРЕСС-ТЕСТ: Сгенерировано 10 вызовов! Персонал выехал на стоянки, остальные задачи встали в очередь.`);
  }, []);

  const applyShiftConfig = useCallback((b1: number, b2: number, catA: number, vehicles: number) => {
    const updatedWorkers = generateShiftWorkersWithCustomCounts(b1, b2, catA, vehicles);
    workersRef.current = updatedWorkers;
    setWorkers(updatedWorkers);
    showNotification(`🔄 Смена пересчитана! ${b1 + b2 + catA} инженеров и ${vehicles} авто распределены по базам ПТО.`);
  }, []);

  return {
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
  };
}
