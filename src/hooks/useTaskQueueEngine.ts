import { useState, useCallback } from 'react';
import { OtoTask, Worker, Stand, TaskPriority, TaskCrewMember } from '../types/index';
import { SVO_STANDS } from '../constants/index';
import { findNearestFreeWorkerOfCategory, calculateWorkerToStandEta, calculateCrewMaxEta } from '../services/dijkstra';

export function useTaskQueueEngine() {
  const [tasks, setTasks] = useState<OtoTask[]>([]);

  // Derived Queued Tasks (status === 'QUEUED')
  const queuedTasks = tasks.filter(t => t.status === 'QUEUED');
  // Derived Active Dispatched/Working Tasks (status === 'DISPATCHED' || status === 'WORKING')
  const activeTasks = tasks.filter(t => t.status === 'DISPATCHED' || t.status === 'WORKING');

  // Priority numerical rank helper (AOG = 1, URGENT = 2, ROUTINE = 3)
  const getPriorityRank = (p: TaskPriority) => {
    switch (p) {
      case 'AOG': return 1;
      case 'URGENT': return 2;
      case 'ROUTINE': return 3;
    }
  };

  // Submit Task to Engine (either DISPATCHED immediately or QUEUED on staff deficit)
  const submitTask = useCallback((newTask: OtoTask, currentWorkers: Worker[]): { isQueued: boolean; task: OtoTask } => {
    const allCrewAvailable = newTask.crew.length > 0 && newTask.crew.every(c => {
      const w = currentWorkers.find(wrk => wrk.id === c.workerId);
      return w && (w.status === 'FREE_STATIONARY' || w.status === 'FREE_PATROLLING');
    });

    if (allCrewAvailable) {
      const dispatchedTask: OtoTask = {
        ...newTask,
        status: 'DISPATCHED'
      };
      setTasks(prev => [dispatchedTask, ...prev]);
      return { isQueued: false, task: dispatchedTask };
    } else {
      // Staff deficit: Push to QUEUED status
      const queuedTask: OtoTask = {
        ...newTask,
        status: 'QUEUED',
        queueStartTimeMs: Date.now()
      };
      setTasks(prev => [queuedTask, ...prev]);
      return { isQueued: true, task: queuedTask };
    }
  }, []);

  // Promote task in queue to AOG priority
  const promoteTaskToAog = useCallback((taskId: string) => {
    setTasks(prev =>
      prev.map(t => (t.id === taskId ? { ...t, priority: 'AOG' as TaskPriority } : t))
    );
  }, []);

  // Cancel Task
  const cancelTask = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }, []);

  // Auto-Assign Queued Tasks upon Worker Release
  const tryAutoAssignQueuedTasks = useCallback((releasedWorker: Worker, _allWorkers: Worker[]): { assignedTask?: OtoTask; waypoints?: { x: number; y: number }[] } => {
    let resultAssignedTask: OtoTask | undefined = undefined;
    let resultWaypoints: { x: number; y: number }[] | undefined = undefined;

    setTasks(prevTasks => {
      const queuedList = prevTasks.filter(t => t.status === 'QUEUED');
      if (queuedList.length === 0) return prevTasks;

      // Sort queued tasks by Priority (AOG > URGENT > ROUTINE), then by wait time (queueStartTimeMs ascending)
      const sortedQueue = [...queuedList].sort((a, b) => {
        const rankA = getPriorityRank(a.priority);
        const rankB = getPriorityRank(b.priority);
        if (rankA !== rankB) return rankA - rankB;
        return (a.queueStartTimeMs || 0) - (b.queueStartTimeMs || 0);
      });

      // Find highest priority queued task matching released worker's qualification
      for (const qTask of sortedQueue) {
        const targetStand = SVO_STANDS.find(s => s.id === qTask.standId);
        if (!targetStand) continue;

        const needsCategory = qTask.categoryCode;
        const matchesCategory =
          needsCategory === 'A' ||
          releasedWorker.categoryCode === needsCategory;

        if (matchesCategory) {
          const newEtaMember = calculateWorkerToStandEta(releasedWorker, targetStand);
          const updatedCrew = [...qTask.crew, newEtaMember];
          const { maxEtaMinutes, withinSla } = calculateCrewMaxEta(updatedCrew, qTask.slaLimitMinutes);

          resultWaypoints = newEtaMember.waypoints;
          resultAssignedTask = {
            ...qTask,
            status: 'DISPATCHED',
            crew: updatedCrew,
            maxEtaMinutes,
            withinSla
          };

          return prevTasks.map(t => (t.id === qTask.id ? resultAssignedTask! : t));
        }
      }

      return prevTasks;
    });

    return { assignedTask: resultAssignedTask, waypoints: resultWaypoints };
  }, []);

  // STRESS TEST: Generate Peak Load Deficit (10 Simultaneous Aircraft Calls)
  const triggerStressTest = useCallback((currentWorkers: Worker[]) => {
    const standsSample = [...SVO_STANDS].sort(() => 0.5 - Math.random()).slice(0, 10);
    const priorities: TaskPriority[] = ['AOG', 'AOG', 'URGENT', 'URGENT', 'URGENT', 'ROUTINE', 'ROUTINE', 'ROUTINE', 'ROUTINE', 'ROUTINE'];

    const newGeneratedTasks: OtoTask[] = [];
    const usedWorkerIds = new Set<string>();

    standsSample.forEach((stand, idx) => {
      const priority = priorities[idx % priorities.length];
      const catCode = idx % 2 === 0 ? 'B1' : 'B2';

      // Find nearest available free worker
      const b1Member = findNearestFreeWorkerOfCategory(catCode, stand, currentWorkers, usedWorkerIds);
      const crew: TaskCrewMember[] = [];

      if (b1Member) {
        crew.push(b1Member);
        usedWorkerIds.add(b1Member.workerId);
      }

      const { maxEtaMinutes, withinSla } = calculateCrewMaxEta(crew, 15.0);
      const isDispatched = crew.length > 0;

      const task: OtoTask = {
        id: `STRESS-${Date.now().toString().slice(-4)}-${idx + 1}`,
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

      newGeneratedTasks.push(task);
    });

    setTasks(prev => [...newGeneratedTasks, ...prev]);
    return newGeneratedTasks;
  }, []);

  return {
    tasks,
    setTasks,
    queuedTasks,
    activeTasks,
    submitTask,
    promoteTaskToAog,
    cancelTask,
    tryAutoAssignQueuedTasks,
    triggerStressTest
  };
}
