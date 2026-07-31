import { useEffect, useRef, useState, useCallback } from 'react';
import { Worker, OtoTask, WorkerStatus } from '../types';
import { SVO_NODES } from '../constants';
import { getClosestNodeId, findDijkstraShortestPath, getWaypointsForNodePath } from '../utils/dispatchLogic';

interface SimulationEngineProps {
  initialWorkers: Worker[];
  simSpeed: number;
  isPaused: boolean;
  tasks: OtoTask[];
  onTaskCompleted: (task: OtoTask) => void;
  onWorkerStatusChanged?: (worker: Worker) => void;
}

export function useSimulationEngine({
  initialWorkers,
  simSpeed,
  isPaused,
  tasks,
  onTaskCompleted
}: SimulationEngineProps) {
  const workersRef = useRef<Worker[]>(initialWorkers);
  const [workersState, setWorkersState] = useState<Worker[]>(initialWorkers);
  const taskWorkTimersRef = useRef<Map<string, number>>(new Map());

  // Sync initial workers if reset or reconfigured
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

            // LERP Position Interpolation based on physical speed and simSpeed
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

        // 2-MINUTE MAINTENANCE WORK TIMER & AUTOMATIC TASK COMPLETION
        if (workersUpdated || tasks.length > 0) {
          tasks.forEach(task => {
            if (task.status === 'WORKING') {
              const currentMs = (taskWorkTimersRef.current.get(task.id) || 0) + (dtSec * 1000 * simSpeed);
              taskWorkTimersRef.current.set(task.id, currentMs);

              if (currentMs >= 120000) { // 120 seconds target
                taskWorkTimersRef.current.delete(task.id);
                onTaskCompleted(task);

                // Send assigned workers back to base!
                const crewIds = new Set(task.crew.map(c => c.workerId));
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
            }
          });
        }
      }

      animFrameId = requestAnimationFrame(tick);
    };

    animFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameId);
  }, [simSpeed, isPaused, tasks, onTaskCompleted]);

  // Throttled sync of workersRef to React state (every 250ms)
  useEffect(() => {
    const syncInterval = setInterval(() => {
      setWorkersState([...workersRef.current]);
    }, 250);
    return () => clearInterval(syncInterval);
  }, []);

  // Update worker state directly for dispatch
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

  // Return worker to base on task cancellation
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
