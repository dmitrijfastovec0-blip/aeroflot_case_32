import { useState, useCallback } from 'react';
import { OtoTask, Worker, Stand, TaskPriority, TaskCrewMember } from '../types';
import { SVO_STANDS } from '../constants';
import { findNearestFreeWorkerOfCategory, calculateWorkerToStandEta, calculateCrewMaxEta } from '../utils/dispatchLogic';

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

  // Add Task to Engine (either DISPATCHED immediately or QUEUED on staff deficit)
  const submitTask = useCallback((newTask: OtoTask, currentWorkers: Worker[]): { isQueued: boolean; task: OtoTask } => {
    const selectedWorkerIds = new Set(newTask.crew.map(c => c.workerId));
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
  const tryAutoAssignQueuedTasks = useCallback((releasedWorker: Worker, allWorkers: Worker[]): { assignedTaskId?: string; updatedWorker?: Worker } => {
    let resultAssignedTaskId: string | undefined = undefined;

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

        // Check if released worker fits task requirements
        const needsCategory = qTask.categoryCode;
        const matchesCategory =
          needsCategory === 'A' ||
          releasedWorker.categoryCode === needsCategory;

        if (matchesCategory) {
          resultAssignedTaskId = qTask.id;
          const newEtaMember = calculateWorkerToStandEta(releasedWorker, targetStand);

          // Update task crew and transition to DISPATCHED
          return prevTasks.map(t => {
            if (t.id === qTask.id) {
              const updatedCrew = [...t.crew, newEtaMember];
              const { maxEtaMinutes, withinSla } = calculateCrewMaxEta(updatedCrew, t.slaLimitMinutes);
              return {
                ...t,
                status: 'DISPATCHED',
                crew: updatedCrew,
                maxEtaMinutes,
                withinSla
              };
            }
            return t;
          });
        }
      }

      return prevTasks;
    });

    return { assignedTaskId: resultAssignedTaskId };
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

      // Try finding nearest free worker
      const b1Member = findNearestFreeWorkerOfCategory('B1', stand, currentWorkers, usedWorkerIds);
      const crew: TaskCrewMember[] = [];

      if (b1Member) {
        crew.push(b1Member);
        usedWorkerIds.add(b1Member.workerId);
      }

      const { maxEtaMinutes, withinSla } = calculateCrewMaxEta(crew, 15.0);

      const task: OtoTask = {
        id: `STRESS-${Date.now().toString().slice(-4)}-${idx + 1}`,
        standId: stand.id,
        standLabel: `Стоянка ${stand.label}`,
        aircraftType: `${stand.aircraftType} (Рейс SU-${1000 + idx})`,
        categoryCode: catCode,
        categoryLabel: `ОТО (${priority})`,
        priority,
        status: crew.length > 0 && idx < 4 ? 'DISPATCHED' : 'QUEUED',
        crew,
        arrivedCount: 0,
        maxEtaMinutes: maxEtaMinutes || 12.0,
        slaLimitMinutes: 15.0,
        withinSla: true,
        createdAt: new Date().toLocaleTimeString('ru-RU', { hour12: false }),
        queueStartTimeMs: crew.length > 0 && idx < 4 ? undefined : Date.now(),
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
