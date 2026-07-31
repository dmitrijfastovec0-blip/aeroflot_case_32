import { useEffect, useRef, useState, useCallback } from 'react';
import { Worker, OtoTask, WorkerStatus } from '../types/index';
import { SVO_NODES } from '../constants/index';
import { getClosestNodeId, findDijkstraShortestPath, getWaypointsForNodePath } from '../services/dijkstra';

interface UseWorkerSimulationProps {
  initialWorkers: Worker[];
  simSpeed: number;
  isPaused: boolean;
  tasks: OtoTask[];
  onTasksUpdated: (updater: (prev: OtoTask[]) => OtoTask[]) => void;
  onTaskCompleted: (task: OtoTask) => void;
  onWorkerReleased: (worker: Worker) => void;
}

export function useWorkerSimulation({
  initialWorkers,
  simSpeed,
  isPaused,
  tasks,
  onTasksUpdated,
  onTaskCompleted,
  onWorkerReleased
}: UseWorkerSimulationProps) {
  const workersRef = useRef<Worker[]>(initialWorkers);
  const [workersState, setWorkersState] = useState<Worker[]>(initialWorkers);

  // Sync initial workers when shift changes
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
        let workersUpdated = false;

        // 1. UPDATE WORKER POSITIONS VIA LERP
        workersRef.current = workersRef.current.map((worker): Worker => {
          // A. IN_TRANSIT or RETURNING_TO_BASE
          if ((worker.status === 'IN_TRANSIT' || worker.status === 'RETURNING_TO_BASE') && worker.pathWaypoints && worker.pathWaypoints.length > 1) {
            workersUpdated = true;
            const currIdx = worker.currentSegmentIndex || 0;

            if (currIdx >= worker.pathWaypoints.length - 1) {
              const finalStatus: WorkerStatus = worker.status === 'IN_TRANSIT' ? 'WORKING_ON_SITE' : 'FREE_STATIONARY';
              const updated = { ...worker, status: finalStatus, pathWaypoints: undefined };
              if (finalStatus === 'FREE_STATIONARY') {
                onWorkerReleased(updated);
              }
              return updated;
            }

            const targetPt = worker.pathWaypoints[currIdx + 1];
            const dx = targetPt.x - worker.x;
            const dy = targetPt.y - worker.y;
            const distPct = Math.hypot(dx, dy);

            if (distPct < 0.3) {
              const nextIdx = currIdx + 1;
              if (nextIdx >= worker.pathWaypoints.length - 1) {
                const finalStatus: WorkerStatus = worker.status === 'IN_TRANSIT' ? 'WORKING_ON_SITE' : 'FREE_STATIONARY';
                const updated = { ...worker, x: targetPt.x, y: targetPt.y, status: finalStatus, pathWaypoints: undefined };
                if (finalStatus === 'FREE_STATIONARY') {
                  onWorkerReleased(updated);
                }
                return updated;
              }
              return { ...worker, x: targetPt.x, y: targetPt.y, currentSegmentIndex: nextIdx };
            }

            // LERP Position Interpolation based on speed & simSpeed
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

          // B. FREE_PATROLLING
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

        // 2. UPDATE TASK ARRIVAL & 2-MINUTE MAINTENANCE WORK TIMER
        if (tasks.length > 0) {
          onTasksUpdated(prevTasks => {
            const finishedTaskIds: string[] = [];

            const updatedTasks = prevTasks.map(task => {
              if (task.status === 'QUEUED') return task;

              // Count how many workers of this task's crew have arrived on site (WORKING_ON_SITE)
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

            // Handle Completed Tasks: Release workers to return to base or queued tasks!
            if (finishedTaskIds.length > 0) {
              finishedTaskIds.forEach(tId => {
                const finishedTask = prevTasks.find(t => t.id === tId);
                if (finishedTask) {
                  onTaskCompleted(finishedTask);

                  // Send assigned crew back to base
                  const crewIds = new Set(finishedTask.crew.map(c => c.workerId));
                  workersRef.current = workersRef.current.map(w => {
                    if (crewIds.has(w.id)) {
                      const closestNodeId = getClosestNodeId(w.x, w.y);
                      const homeBaseId = w.baseId;
                      const nodePath = findDijkstraShortestPath(closestNodeId, homeBaseId);
                      const returnWaypoints = getWaypointsForNodePath({ x: w.x, y: w.y }, nodePath);

                      const returningWorker: Worker = {
                        ...w,
                        status: 'RETURNING_TO_BASE',
                        currentTaskId: undefined,
                        pathWaypoints: returnWaypoints,
                        currentSegmentIndex: 0
                      };

                      onWorkerReleased(returningWorker);
                      return returningWorker;
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
  }, [simSpeed, isPaused, tasks.length, onTasksUpdated, onTaskCompleted, onWorkerReleased]);

  // Throttled sync of workersRef to React state (every 250ms)
  useEffect(() => {
    const syncInterval = setInterval(() => {
      setWorkersState([...workersRef.current]);
    }, 250);
    return () => clearInterval(syncInterval);
  }, []);

  // Dispatch worker directly for a task
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

  // Return workers to base
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
