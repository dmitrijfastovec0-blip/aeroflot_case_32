import { OtoTask, Worker } from '../types/index';

/**
 * Calculates physical transit completion percentage (0 to 100%)
 * strictly in 1:1 sync with workers' actual positions along their path.
 */
export function calculateTaskTransitProgressPct(task: OtoTask, workers: Worker[]): number {
  if (task.status === 'WORKING' || task.status === 'COMPLETED') return 100;
  if (task.status === 'QUEUED' || !task.crew || task.crew.length === 0) return 0;

  let sumProgress = 0;
  let count = 0;

  for (const member of task.crew) {
    const w = workers.find(x => x.id === member.workerId);
    if (!w) continue;
    count++;

    if (w.status === 'WORKING_ON_SITE') {
      sumProgress += 1.0;
    } else if (w.pathWaypoints && w.pathWaypoints.length >= 2) {
      const pts = w.pathWaypoints;
      let totalDist = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        totalDist += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      }
      if (totalDist <= 0.001) {
        sumProgress += 1.0;
        continue;
      }

      const currIdx = Math.min(pts.length - 1, w.currentSegmentIndex || 0);
      let traveledDist = 0;
      for (let i = 0; i < currIdx; i++) {
        traveledDist += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      }
      if (currIdx < pts.length - 1) {
        const segStart = pts[currIdx];
        traveledDist += Math.hypot(w.x - segStart.x, w.y - segStart.y);
      }

      const ratio = Math.min(1.0, Math.max(0.0, traveledDist / totalDist));
      sumProgress += ratio;
    } else {
      sumProgress += member.hasArrived ? 1.0 : 0.1;
    }
  }

  if (count === 0) return 0;
  const avg = sumProgress / count;
  return Math.min(99, Math.floor(avg * 100));
}

/**
 * Formats total elapsed time from dispatch/creation to completion.
 */
export function formatCompletedTaskDuration(task: OtoTask): string {
  const startSec = task.startedAtSimSec ?? task.createdAtSimSec;
  const endSec = task.completedAtSimSec;

  if (startSec != null && endSec != null && endSec > startSec) {
    const totalSec = Math.round(endSec - startSec);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    if (min > 0) {
      return `${min} мин ${sec > 0 ? `${sec} сек` : ''}`;
    }
    return `${sec} сек`;
  }

  // Fallback estimation if simulation clock delta is missing
  const eta = task.maxEtaMinutes || 12;
  const workMin = (task.targetWorkSec || 40) / 20;
  const totalMin = Math.round((eta + workMin) * 10) / 10;
  return `${totalMin} мин`;
}
