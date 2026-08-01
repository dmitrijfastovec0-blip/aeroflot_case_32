import { Worker, OtoTask, TaskCrewMember, WorkerStatus, CategoryCode, Stand, DispatchStat } from '../types/index';

// ============================================================================
// PURE DISPATCH ENGINE (no React state)
// ----------------------------------------------------------------------------
// Every decision the dispatcher makes lives here as a pure function of
// (tasks, workers, ETA calculator), so it can be unit-tested in isolation.
// The React hook only calls this and applies the returned mutations.
// ============================================================================

export interface DispatcherContext {
  tasks: OtoTask[]; // all tasks (QUEUED + DISPATCHED + WORKING) — busy-set derived from these
  workers: Worker[];
  standById: Map<string, Stand>;
  calculateEta: (w: Worker, stand: Stand) => TaskCrewMember;
  findNaiveNearest: (catCode: CategoryCode, stand: Stand, workers: Worker[], busyIds?: Set<string>) => TaskCrewMember | null;
}

export interface DispatcherOutput {
  dispatchedTasks: Record<string, OtoTask>;
  dispatchedWorkers: Record<string, Worker>;
  stats: DispatchStat[];
  notifications: string[];
  changed: boolean;
}

// SLA-aware queue ordering (item 1): AOG first, then by "slack" = remaining
// time-to-deadline minus the best achievable ETA, so a ROUTINE call about to
// breach its 15-min limit outranks a comfortable URGENT one. Tasks that
// cannot be staffed right now sink to the back instead of jamming the front.
export function sortQueuedBySla(
  taskList: OtoTask[],
  workerIdx: Map<string, Worker>,
  busy: Set<string>,
  standById: Map<string, Stand>,
  calculateEta: (w: Worker, stand: Stand) => TaskCrewMember
): OtoTask[] {
  const scored = taskList.map(q => {
    const stand = standById.get(q.standId);
    let minEta = Infinity;
    if (stand) {
      if (q.crew.length > 0) {
        const members = q.crew.map(m => workerIdx.get(m.workerId)).filter((w): w is Worker => !!w);
        const allFree = members.length === q.crew.length &&
          members.every(w => !busy.has(w.id) && (w.status === 'FREE_STATIONARY' || w.status === 'FREE_PATROLLING'));
        if (allFree) {
          minEta = Math.max(...members.map(w => calculateEta(w, stand).etaMinutes));
        }
      } else {
        for (const w of workerIdx.values()) {
          if (busy.has(w.id)) continue;
          if (!(w.categoryCode === q.categoryCode || q.categoryCode === 'A')) continue;
          if (w.status === 'FREE_STATIONARY' || w.status === 'FREE_PATROLLING') {
            const eta = calculateEta(w, stand).etaMinutes;
            if (eta < minEta) minEta = eta;
          }
        }
      }
    }
    const slack = minEta === Infinity
      ? 1e9
      : q.slaLimitMinutes - (q.elapsedQueueSec || 0) / 60 - minEta;
    const base = q.priority === 'AOG' ? -1e9 : 0;
    return { q, score: base + slack };
  });
  return scored.sort((a, b) => a.score - b.score).map(s => s.q);
}

// Pace: traverse the pixel path in EXACTLY the displayed ETA (sim-seconds)
export function pathSpeedFor(member: TaskCrewMember): number {
  let totalPct = 0;
  for (let i = 0; i < member.waypoints.length - 1; i++) {
    totalPct += Math.hypot(
      member.waypoints[i + 1].x - member.waypoints[i].x,
      member.waypoints[i + 1].y - member.waypoints[i].y
    );
  }
  const etaSimSec = Math.max(1, member.etaMinutes * 60);
  return Math.max(0.01, totalPct / etaSimSec);
}

interface DispatchPair {
  q: OtoTask;
  w: Worker;
  eta: number;
  cost: number;
  delay: number;
  member?: TaskCrewMember;
}

// Build every (task × worker) candidate pair with a weighted cost (ETA +
// fair-share penalty + zone guard), sort globally by cost and assign greedily,
// so no free engineer idles while a matching queued call exists and the
// nearest engineer is never "raped" by a series. Lookahead: an engineer
// finishing maintenance counts as an almost-available candidate; if they win,
// the call is reserved to them instead of dragging a distant worker across.
export function computeDispatchPlan(ctx: DispatcherContext): DispatcherOutput {
  const { tasks, workers, standById, calculateEta, findNaiveNearest } = ctx;

  const queuedAll = tasks.filter(t => t.status === 'QUEUED');

  // Batched mutations applied once after the loops
  const dispatchedTasks: Record<string, OtoTask> = {};
  const dispatchedWorkers: Record<string, Worker> = {};
  const newStats: DispatchStat[] = [];
  const notifications: string[] = [];

  if (queuedAll.length === 0) {
    return { dispatchedTasks, dispatchedWorkers, stats: [], notifications, changed: false };
  }

  // O(1) index over workers
  const workerById = new Map<string, Worker>();
  for (const w of workers) workerById.set(w.id, w);

  // Incremental busy-set + per-worker active load built once
  const busy = new Set<string>();
  const load: Record<string, number> = {};
  for (const t of tasks) {
    if (t.status === 'DISPATCHED' || t.status === 'WORKING') {
      for (const m of t.crew) {
        busy.add(m.workerId);
        load[m.workerId] = (load[m.workerId] || 0) + 1;
      }
    }
  }

  // Item 1: SLA-aware ordering (AOG first, then by slack-to-deadline)
  const ordered = sortQueuedBySla(queuedAll, workerById, busy, standById, calculateEta);

  const pushStat = (q: OtoTask, systemEta: number) => {
    const targetStand = standById.get(q.standId);
    if (!targetStand) return;
    const naivePick = findNaiveNearest(q.categoryCode, targetStand, workers, busy);
    if (!naivePick) return;
    const saved = Math.max(0, Math.round((naivePick.etaMinutes - systemEta) * 10) / 10);
    newStats.push({
      taskId: q.id,
      standLabel: q.standLabel,
      categoryCode: q.categoryCode,
      defectLabel: q.defectLabel,
      intuitiveEtaMinutes: naivePick.etaMinutes,
      systemEtaMinutes: systemEta,
      savedMinutes: saved,
      within15: systemEta <= 15,
      createdAt: new Date().toLocaleTimeString('ru-RU', { hour12: false })
    });
  };

  // ---- Step 1: manual (user-assembled) crews, in SLA order ----
  for (const qTask of ordered) {
    if (qTask.crew.length === 0) continue;
    const targetStand = standById.get(qTask.standId);
    if (!targetStand) continue;

    let allAvailable = true;
    for (const member of qTask.crew) {
      const w = workerById.get(member.workerId);
      if (!w || busy.has(w.id) ||
          (w.status !== 'FREE_STATIONARY' && w.status !== 'FREE_PATROLLING')) {
        allAvailable = false;
        break;
      }
    }
    if (!allAvailable) continue;

    const freshMembers: TaskCrewMember[] = qTask.crew.map(member => {
      const w = workerById.get(member.workerId)!;
      busy.add(w.id);
      load[w.id] = (load[w.id] || 0) + 1;
      dispatchedWorkers[w.id] = {
        ...w,
        status: 'IN_TRANSIT' as WorkerStatus,
        currentTaskId: qTask.id,
        pathWaypoints: member.waypoints,
        pathSpeedPctPerSimSec: pathSpeedFor(member),
        currentSegmentIndex: 0,
        dispatchedCount: (w.dispatchedCount || 0) + 1
      };
      return calculateEta(w, targetStand);
    });

    const maxEtaMinutes = Math.max(...freshMembers.map(m => m.etaMinutes));
    dispatchedTasks[qTask.id] = {
      ...qTask,
      status: 'DISPATCHED' as const,
      crew: freshMembers,
      arrivedCount: 0,
      maxEtaMinutes,
      reservedWorkerId: undefined
    };
    pushStat(qTask, Math.min(...freshMembers.map(m => m.etaMinutes)));
  }

  // ---- Step 2: auto tasks → global greedy with weighted cost + lookahead ----
  const autoTasks = ordered.filter(t => t.crew.length === 0);
  if (autoTasks.length > 0) {
    // Item 2: zone guard — don't strip a base below 2 idle technicians
    const freeByBase = new Map<string, number>();
    for (const w of workers) {
      if (busy.has(w.id)) continue;
      if (w.status === 'FREE_STATIONARY' || w.status === 'FREE_PATROLLING') {
        freeByBase.set(w.baseId, (freeByBase.get(w.baseId) || 0) + 1);
      }
    }
    const consumeBase = (baseId: string) => {
      freeByBase.set(baseId, Math.max(0, (freeByBase.get(baseId) || 0) - 1));
    };

    // Valid reservations: a reserved engineer is still mid-maintenance and
    // will finish + travel in `eta`. A reservation only HARD-BLOCKS its task
    // against engineers that are genuinely farther away — a closer free
    // engineer takes over immediately instead of waiting for the south guy.
    const reservation = new Map<string, { w: Worker; eta: number }>();
    for (const q of autoTasks) {
      if (!q.reservedWorkerId) continue;
      const rw = workerById.get(q.reservedWorkerId);
      if (!rw || rw.status !== 'WORKING_ON_SITE') continue;
      const active = tasks.find(t => t.id === rw.currentTaskId && t.status === 'WORKING');
      if (!active) continue;
      const stand = standById.get(q.standId);
      if (!stand) continue;
      const remainingSimMin = Math.max(0, ((active.targetWorkSec || 120) - (active.elapsedWorkSec || 0)) / 60);
      const travel = calculateEta(rw, stand).etaMinutes;
      reservation.set(q.id, { w: rw, eta: remainingSimMin + travel });
    }

    const pairs: DispatchPair[] = [];

    for (const q of autoTasks) {
      const stand = standById.get(q.standId);
      if (!stand) continue;
      const res = reservation.get(q.id);
      for (const w of workerById.values()) {
        if (!(w.categoryCode === q.categoryCode || q.categoryCode === 'A')) continue;

        if (w.status === 'FREE_STATIONARY' || w.status === 'FREE_PATROLLING') {
          if (busy.has(w.id)) continue;
          const member = calculateEta(w, stand);
          const eta = member.etaMinutes;
          // Reservation yields only to a free engineer who is STRICTLY closer
          // than the reserved one (who is already on his way after finishing).
          if (res && eta >= res.eta) continue;
          const zoneFree = freeByBase.get(w.baseId) || 0;
          const zonePenalty = zoneFree - 1 < 2 ? 3 : 0;
          const cost = eta + eta * 0.1 * Math.min(w.dispatchedCount || 0, 4) + zonePenalty;
          pairs.push({ q, w, eta, cost, delay: 0, member });
        } else if (w.status === 'WORKING_ON_SITE') {
          // Item 4: lookahead — engineer mid-maintenance, frees up shortly.
          // Only the reserved engineer is a lookahead candidate for this task,
          // so reservations don't churn between multiple busy engineers.
          if (res && res.w.id !== w.id) continue;
          const active = tasks.find(t => t.id === w.currentTaskId && t.status === 'WORKING');
          if (!active) continue;
          const remainingSimMin = Math.max(0, ((active.targetWorkSec || 120) - (active.elapsedWorkSec || 0)) / 60);
          const travel = calculateEta(w, stand).etaMinutes;
          const eta = remainingSimMin + travel;
          const cost = eta + eta * 0.1 * Math.min(w.dispatchedCount || 0, 4);
          pairs.push({ q, w, eta, cost, delay: remainingSimMin });
        }
      }
    }

    // Global greedy: cheapest pairs first, no double-assignment
    pairs.sort((a, b) => a.cost - b.cost);

    const assignedWorker = new Set<string>();
    const assignedTask = new Set<string>();

    for (const p of pairs) {
      if (assignedTask.has(p.q.id)) continue;

      if (p.delay > 0) {
        // Lookahead wins → reserve the call for the engineer who is about to finish
        if (assignedWorker.has(p.w.id)) continue;
        assignedWorker.add(p.w.id);
        assignedTask.add(p.q.id);
        dispatchedTasks[p.q.id] = { ...p.q, reservedWorkerId: p.w.id };
        if (!reservation.has(p.q.id)) {
          notifications.push(`⏳ Задача ${p.q.id} (${p.q.priority}) зарезервирована за ${p.w.name} — закончит ТО и выедет сразу, не возвращаясь в базу.`);
        }
        continue;
      }

      if (assignedWorker.has(p.w.id) || busy.has(p.w.id)) continue;

      const targetStand = standById.get(p.q.standId);
      if (!targetStand || !p.member) continue;

      assignedWorker.add(p.w.id);
      assignedTask.add(p.q.id);
      busy.add(p.w.id);
      consumeBase(p.w.baseId);
      load[p.w.id] = (load[p.w.id] || 0) + 1;

      dispatchedWorkers[p.w.id] = {
        ...p.w,
        status: 'IN_TRANSIT' as WorkerStatus,
        currentTaskId: p.q.id,
        pathWaypoints: p.member.waypoints,
        pathSpeedPctPerSimSec: pathSpeedFor(p.member),
        currentSegmentIndex: 0,
        dispatchedCount: (p.w.dispatchedCount || 0) + 1
      };

      dispatchedTasks[p.q.id] = {
        ...p.q,
        status: 'DISPATCHED' as const,
        crew: [p.member],
        arrivedCount: 0,
        maxEtaMinutes: p.eta,
        reservedWorkerId: undefined
      };
      pushStat(p.q, p.eta);
    }
  }

  return {
    dispatchedTasks,
    dispatchedWorkers,
    stats: newStats,
    notifications,
    changed: Object.keys(dispatchedTasks).length > 0
  };
}
