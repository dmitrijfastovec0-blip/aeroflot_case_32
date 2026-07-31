import { useEffect, useRef, useState, useCallback } from 'react';
import { Worker, OtoTask, WorkerStatus } from '../types/index';
import { SVO_NODES, SVO_FACILITIES } from '../constants/index';
import { getClosestNodeId, findDijkstraShortestPath, getWaypointsForNodePath } from '../services/dijkstra';

interface UseWorkerSimulationProps {
  initialWorkers: Worker[];
  simSpeed: number;
  isPaused: boolean;
  tasks: OtoTask[];
  onTasksUpdated: (updater: (prev: OtoTask[]) => OtoTask[]) => void;
  onTaskCompleted: (completedTask: OtoTask) => void;
  onAutoAssignQueue: (releasedWorker: Worker) => { assignedTask?: OtoTask; waypoints?: { x: number; y: number }[] };
}

export function useWorkerSimulation({
  initialWorkers,
  simSpeed,
  isPaused,
  tasks,
  onTasksUpdated,
  onTaskCompleted,
  onAutoAssignQueue
}: UseWorkerSimulationProps) {
  const workersRef = useRef<Worker[]>(initialWorkers);
  const [workersState, setWorkersState] = useState<Worker[]>(initialWorkers);

  // Sync initial workers when shift is reconfigured
  useEffect(() => {
    workersRef.current = initialWorkers;
    setWorkersState([...initialWorkers]);
  }, [initialWorkers]);

  const lastTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    let animFrameId: number;

    const tick = () => {
      const now = Date.now();
      const dtSec = Math.min(0.2, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      if (!isPaused) {
        let workersMoved = false;

        // -------------------------------------------------------------
        // STEP 1: LERP PHYSICS ENGINE FOR ALL WORKERS
        // -------------------------------------------------------------
        workersRef.current = workersRef.current.map((worker): Worker => {
          if ((worker.status === 'IN_TRANSIT' || worker.status === 'RETURNING_TO_BASE') && worker.pathWaypoints && worker.pathWaypoints.length > 1) {
            workersMoved = true;
            const currIdx = worker.currentSegmentIndex || 0;

            // Reached destination waypoint list
            if (currIdx >= worker.pathWaypoints.length - 1) {
              if (worker.status === 'IN_TRANSIT') {
                return {
                  ...worker,
                  status: 'WORKING_ON_SITE',
                  pathWaypoints: undefined,
                  currentSegmentIndex: undefined
                };
              } else {
                // Reached home base
                const baseObj = SVO_FACILITIES.find(f => f.id === worker.baseId);
                const baseX = baseObj ? baseObj.x : worker.x;
                const baseY = baseObj ? baseObj.y : worker.y;

                return {
                  ...worker,
                  x: baseX,
                  y: baseY,
                  status: 'FREE_STATIONARY',
                  pathWaypoints: undefined,
                  currentSegmentIndex: undefined
                };
              }
            }

            const targetPt = worker.pathWaypoints[currIdx + 1];
            const dx = targetPt.x - worker.x;
            const dy = targetPt.y - worker.y;
            const distPct = Math.hypot(dx, dy);

            // Reached individual waypoint
            if (distPct < 0.4) {
              const nextIdx = currIdx + 1;
              if (nextIdx >= worker.pathWaypoints.length - 1) {
                if (worker.status === 'IN_TRANSIT') {
                  return {
                    ...worker,
                    x: targetPt.x,
                    y: targetPt.y,
                    status: 'WORKING_ON_SITE',
                    pathWaypoints: undefined,
                    currentSegmentIndex: undefined
                  };
                } else {
                  const baseObj = SVO_FACILITIES.find(f => f.id === worker.baseId);
                  const baseX = baseObj ? baseObj.x : targetPt.x;
                  const baseY = baseObj ? baseObj.y : targetPt.y;

                  return {
                    ...worker,
                    x: baseX,
                    y: baseY,
                    status: 'FREE_STATIONARY',
                    pathWaypoints: undefined,
                    currentSegmentIndex: undefined
                  };
                }
              }
              return { ...worker, x: targetPt.x, y: targetPt.y, currentSegmentIndex: nextIdx };
            }

            // Calculate movement step
            const speedMetersPerSec = worker.vehicle === 'APRON_VEHICLE' ? 6.5 : 1.5;
            const pctPerSec = (speedMetersPerSec / 4000) * 100 * simSpeed * 3.5;
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
            workersMoved = true;
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

            if (distPct < 0.4) {
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

        // -------------------------------------------------------------
        // STEP 2: TASK ARRIVAL & 2-MINUTE MAINTENANCE WORK ENGINE
        // -------------------------------------------------------------
        if (tasks.length > 0) {
          onTasksUpdated(prevTasks => {
            const finishedTaskIds: string[] = [];

            const updatedTasks = prevTasks.map(task => {
              if (task.status === 'QUEUED') return task;

              // Count how many workers assigned to this task are at WORKING_ON_SITE
              const arrivedCount = task.crew.filter(member => {
                const w = workersRef.current.find(wrk => wrk.id === member.workerId);
                return w?.status === 'WORKING_ON_SITE';
              }).length;

              const isAllCrewArrived = task.crew.length > 0 && arrivedCount === task.crew.length;
              let elapsedWorkSec = task.elapsedWorkSec || 0;
              let status: OtoTask['status'] = task.status;

              if (isAllCrewArrived) {
                status = 'WORKING';
                elapsedWorkSec += dtSec * simSpeed;

                if (elapsedWorkSec >= 120.0) { // 120 seconds target (2 real minutes)
                  finishedTaskIds.push(task.id);
                }
              } else {
                status = 'DISPATCHED';
              }

              return {
                ...task,
                arrivedCount,
                elapsedWorkSec,
                status
              };
            });

            // -------------------------------------------------------------
            // STEP 3: WORKER RELEASE & AUTO-ASSIGNMENT / RETURN TO BASE
            // -------------------------------------------------------------
            if (finishedTaskIds.length > 0) {
              finishedTaskIds.forEach(tId => {
                const finishedTask = prevTasks.find(t => t.id === tId);
                if (finishedTask) {
                  onTaskCompleted(finishedTask);

                  // Process each worker in completed task crew
                  const crewIds = new Set(finishedTask.crew.map(c => c.workerId));

                  workersRef.current = workersRef.current.map(w => {
                    if (crewIds.has(w.id)) {
                      // Check if worker can immediately pick up a QUEUED task!
                      const { assignedTask, waypoints } = onAutoAssignQueue(w);

                      if (assignedTask && waypoints && waypoints.length > 0) {
                        // Immediately dispatch to queued task!
                        return {
                          ...w,
                          status: 'IN_TRANSIT' as WorkerStatus,
                          currentTaskId: assignedTask.id,
                          pathWaypoints: waypoints,
                          currentSegmentIndex: 0
                        };
                      } else {
                        // No queued task: Return to home base!
                        const closestNodeId = getClosestNodeId(w.x, w.y);
                        const homeBaseId = w.baseId;
                        const nodePath = findDijkstraShortestPath(closestNodeId, homeBaseId);
                        const returnWaypoints = getWaypointsForNodePath({ x: w.x, y: w.y }, nodePath);

                        return {
                          ...w,
                          status: 'RETURNING_TO_BASE' as WorkerStatus,
                          currentTaskId: undefined,
                          pathWaypoints: returnWaypoints,
                          currentSegmentIndex: 0
                        };
                      }
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
  }, [simSpeed, isPaused, tasks.length, onTasksUpdated, onTaskCompleted, onAutoAssignQueue]);

  // Throttled sync of workersRef to React state (every 250ms for performance)
  useEffect(() => {
    const syncInterval = setInterval(() => {
      setWorkersState([...workersRef.current]);
    }, 250);
    return () => clearInterval(syncInterval);
  }, []);

  // Dispatch worker directly to a task
  const dispatchWorkerToTask = useCallback((workerId: string, task: OtoTask, waypoints: { x: number; y: number }[]) => {
    workersRef.current = workersRef.current.map(w => {
      if (w.id === workerId) {
        return {
          ...w,
          status: 'IN_TRANSIT',
          currentTaskId: task.id,
          pathWaypoints: waypoints,
          currentSegmentIndex: 0
        };
      }
      return w;
    });
    setWorkersState([...workersRef.current]);
  }, []);

  // Send workers back to base upon manual task cancellation
  const returnWorkersToBase = useCallback((workerIds: Set<string>) => {
    workersRef.current = workersRef.current.map(w => {
      if (workerIds.has(w.id)) {
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
    setWorkersState([...workersRef.current]);
  }, []);

  return {
    workersRef,
    workersState,
    setWorkersState,
    dispatchWorkerToTask,
    returnWorkersToBase
  };
}
