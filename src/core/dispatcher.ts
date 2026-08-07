import { Worker, OtoTask, TaskCrewMember, WorkerStatus, CategoryCode, Stand, DispatchStat, TaskPriority } from '../types/index';
import { hungarianMinCost } from '../services/hungarian';

const INF = 1e6;

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

// GLOBAL optimal matching: build a (task × worker) cost matrix where cost = ETA
// + fair-share penalty + zone guard + SLA-penalty − priority bonus, then solve
// the assignment with the Hungarian algorithm (O(n^3)). No free engineer idles
// while a matching queued call exists, the nearest engineer is never drained by
// a series, and AOG/URGENT calls win scarce workers. Lookahead: an engineer
// finishing maintenance counts as an almost-available candidate column; if they
// win, the call is reserved to them instead of dragging a distant worker across.
export function computeDispatchPlan(ctx: DispatcherContext): DispatcherOutput {
  const { tasks, workers, standById, calculateEta, findNaiveNearest } = ctx;

  const queuedAll = tasks.filter(t => t.status === 'QUEUED');

  // Batched mutations applied once after the loops
  const dispatchedTasks: Record<string, OtoTask> = {};
  const dispatchedWorkers: Record<string, Worker> = {};
  const newStats: DispatchStat[] = [];
  const notifications: string[] = [];

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

  // ---- Step 2: auto tasks → GLOBAL MIN-COST ASSIGNMENT (Hungarian) ----
  // Instead of greedy nearest-first (which collapses a shift when 3-5 calls
  // arrive at once), build a cost matrix C[i][j] = arrival time of worker j to
  // task i's stand and solve the assignment with the Hungarian algorithm. The
  // cost bakes in: SLA-penalty (breaching 15 min is very expensive), priority
  // bonus (AOG/URGENT win scarce workers), fair-share (workers used repeatedly
  // get +10% per dispatch) and zone guard (never strip a base below 2 idle).
  // WORKING_ON_SITE engineers are candidate COLUMNS with a "delay" cost; if the
  // optimum pairs a task with such a worker, the task is RESERVED (not
  // dispatched) — the engineer will finish and head out directly.
  const autoTasks = ordered.filter(t => t.crew.length === 0);
  if (autoTasks.length > 0) {
    const freeByBase = new Map<string, number>();
    for (const w of workers) {
      if (busy.has(w.id)) continue;
      if (w.status === 'FREE_STATIONARY' || w.status === 'FREE_PATROLLING') {
        freeByBase.set(w.baseId, (freeByBase.get(w.baseId) || 0) + 1);
      }
    }

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

    interface CandidateCol { w: Worker; delay: number; member: TaskCrewMember | null; }
    const candidates: CandidateCol[] = [];
    for (const w of workerById.values()) {
      if (w.status === 'FREE_STATIONARY' || w.status === 'FREE_PATROLLING') {
        if (busy.has(w.id)) continue;
        candidates.push({ w, delay: 0, member: null });
      } else if (w.status === 'WORKING_ON_SITE') {
        // Lookahead column: engineer finishing maintenance is an almost-free
        // candidate. Cost = remaining work + travel.
        const active = tasks.find(t => t.id === w.currentTaskId && t.status === 'WORKING');
        if (!active) continue;
        const remainingSimMin = Math.max(0, ((active.targetWorkSec || 120) - (active.elapsedWorkSec || 0)) / 60);
        candidates.push({ w, delay: remainingSimMin, member: null });
      }
    }

    const PRIORITY_BONUS: Record<TaskPriority, number> = { AOG: 100, URGENT: 40, ROUTINE: 0 };
    const SLA_PENALTY = 60;
    const zonePenaltyFor = (w: Worker) => (freeByBase.get(w.baseId) || 0) - 1 < 2 ? 3 : 0;

    // Only tasks with at least ONE eligible candidate enter the matrix. A task
    // whose category has zero free workers (e.g. a Cat A call during a 0-CatA
    // shift) must NOT be a row — an all-INF row breaks the Hungarian core loop
    // (j1 = -1 → p[-1] → crash). It simply stays QUEUED until staff appears.
    const matrixTasks: { task: OtoTask; eligible: number[] }[] = [];
    for (const q of autoTasks) {
      const stand = standById.get(q.standId);
      if (!stand) continue;
      const eligible: number[] = [];
      for (let ci = 0; ci < candidates.length; ci++) {
        const { w } = candidates[ci];
        if (w.categoryCode === q.categoryCode || q.categoryCode === 'A') eligible.push(ci);
      }
      if (eligible.length > 0) matrixTasks.push({ task: q, eligible });
    }

    const costMatrix: number[][] = [];
    const etaCache: (TaskCrewMember | null)[][] = matrixTasks.map(() => new Array(candidates.length).fill(null));

    for (let ti = 0; ti < matrixTasks.length; ti++) {
      const q = matrixTasks[ti].task;
      const stand = standById.get(q.standId);
      const row: number[] = [];
      for (let ci = 0; ci < candidates.length; ci++) {
        const { w, delay } = candidates[ci];
        const matches = w.categoryCode === q.categoryCode || q.categoryCode === 'A';
        if (!stand || !matches) { row.push(INF); continue; }
        const member = calculateEta(w, stand);
        etaCache[ti][ci] = member;
        const eta = delay + member.etaMinutes;
        const fairShare = eta * 0.1 * Math.min(w.dispatchedCount || 0, 4);
        const zonePenalty = delay === 0 ? zonePenaltyFor(w) : 0;
        const slaPenalty = eta > q.slaLimitMinutes ? SLA_PENALTY : 0;
        const cost = eta + fairShare + zonePenalty + slaPenalty - PRIORITY_BONUS[q.priority];
        row.push(cost);
      }
      costMatrix.push(row);
    }

    const { assignment } = hungarianMinCost(costMatrix);
    for (let ti = 0; ti < assignment.length; ti++) {
      const ci = assignment[ti];
      if (ci < 0 || ci >= candidates.length) continue;
      const q = matrixTasks[ti].task;
      const cand = candidates[ci];
      const member = cand.member || etaCache[ti][ci];
      if (!member) continue;

      const targetStand = standById.get(q.standId);
      if (!targetStand) continue;

      if (cand.delay > 0) {
        // Lookahead wins → reserve the call for the engineer who is about to finish
        if (dispatchedTasks[q.id]) continue;
        dispatchedTasks[q.id] = { ...q, reservedWorkerId: cand.w.id };
        if (!reservation.has(q.id)) {
          notifications.push(`⏳ Задача ${q.id} (${q.priority}) зарезервирована за ${cand.w.name} — закончит ТО и выедет сразу, не возвращаясь в базу.`);
        }
        continue;
      }

      dispatchedWorkers[cand.w.id] = {
        ...cand.w,
        status: 'IN_TRANSIT' as WorkerStatus,
        currentTaskId: q.id,
        pathWaypoints: member.waypoints,
        pathSpeedPctPerSimSec: pathSpeedFor(member),
        currentSegmentIndex: 0,
        dispatchedCount: (cand.w.dispatchedCount || 0) + 1
      };

      busy.add(cand.w.id);
      load[cand.w.id] = (load[cand.w.id] || 0) + 1;

      dispatchedTasks[q.id] = {
        ...q,
        status: 'DISPATCHED' as const,
        crew: [member],
        arrivedCount: 0,
        maxEtaMinutes: member.etaMinutes,
        reservedWorkerId: undefined
      };
      pushStat(q, member.etaMinutes);
    }
  }

  // ---- Step 3: re-dispatch in-flight tasks whose crew is still far away ----
  // The "one guy walks across the apron while free people stand near the
  // target" case: an already-DISPATCHED task may have a crew member still
  // IN_TRANSIT while a FREE worker of the right category is now closer.
  // Only switch when the gain is meaningful (REASSIGN_GAIN_MIN) to avoid
  // churning workers back and forth on every completion.
  const REASSIGN_GAIN_MIN = 2.0; // minutes
  for (const task of tasks) {
    if (task.status !== 'DISPATCHED') continue;
    if (dispatchedTasks[task.id]) continue; // just assigned this pass
    if (task.crew.length === 0 || (task.arrivedCount || 0) > 0) continue;

    const stand = standById.get(task.standId);
    if (!stand) continue;

    // Slowest still-in-transit member = the one we try to replace
    let slowestMember: TaskCrewMember | null = null;
    for (const m of task.crew) {
      const w = workerById.get(m.workerId);
      if (!w || w.status !== 'IN_TRANSIT') continue;
      if (!slowestMember || m.etaMinutes > slowestMember.etaMinutes) slowestMember = m;
    }
    if (!slowestMember) continue;

    const remainingTransit = Math.max(0, (slowestMember.etaMinutes - (task.elapsedTransitSec || 0) / 60));

    // Find the closest FREE worker (matching category) who beats the slowest
    // member's remaining transit by a meaningful margin
    let bestFree: Worker | null = null;
    let bestMember: TaskCrewMember | null = null;
    for (const w of workerById.values()) {
      if (busy.has(w.id)) continue;
      if (w.status !== 'FREE_STATIONARY' && w.status !== 'FREE_PATROLLING') continue;
      if (!(w.categoryCode === task.categoryCode || task.categoryCode === 'A')) continue;
      const member = calculateEta(w, stand);
      if (member.etaMinutes >= remainingTransit - REASSIGN_GAIN_MIN) continue;
      if (!bestMember || member.etaMinutes < bestMember.etaMinutes) {
        bestFree = w;
        bestMember = member;
      }
    }
    if (!bestFree || !bestMember) continue;

    // Switch: the free worker takes the task, the old far one stops and idles
    busy.add(bestFree.id);
    load[bestFree.id] = (load[bestFree.id] || 0) + 1;
    dispatchedWorkers[bestFree.id] = {
      ...bestFree,
      status: 'IN_TRANSIT' as WorkerStatus,
      currentTaskId: task.id,
      pathWaypoints: bestMember.waypoints,
      pathSpeedPctPerSimSec: pathSpeedFor(bestMember),
      currentSegmentIndex: 0,
      dispatchedCount: (bestFree.dispatchedCount || 0) + 1
    };

    const oldWorker = workerById.get(slowestMember.workerId);
    if (oldWorker) {
      dispatchedWorkers[oldWorker.id] = {
        ...oldWorker,
        status: oldWorker.isPatrolPreference ? 'FREE_PATROLLING' as WorkerStatus : 'FREE_STATIONARY' as WorkerStatus,
        currentTaskId: undefined,
        pathWaypoints: undefined,
        pathSpeedPctPerSimSec: undefined,
        currentSegmentIndex: 0
      };
    }

    const newCrew = task.crew.map(m =>
      m.workerId === slowestMember.workerId ? bestMember : m
    );
    const newMaxEta = Math.max(...newCrew.map(m => m.etaMinutes));
    dispatchedTasks[task.id] = {
      ...task,
      crew: newCrew,
      arrivedCount: 0,
      maxEtaMinutes: newMaxEta,
      elapsedTransitSec: 0,
      reservedWorkerId: undefined
    };
    pushStat(task, newMaxEta);
    notifications.push(`🔁 Задача ${task.id} перекинута на ${bestFree.name} — он ближе к стоянке, чем ${slowestMember.workerName}.`);
  }

  // ---- Step 4: priority preemption / cascade reassignment ----
  // "КАСКАДНАЯ ПЕРЕБРОСКА": if a critical call (AOG / 777 about to depart)
  // cannot be staffed by ANY free worker within SLA, yank an engineer off a
  // low-priority single-engineer maintenance task that still has real work
  // left, and send him to the critical stand instead. The low-priority task
  // reverts to QUEUED and is re-staffed on the next drain. Guards: only
  // preempt single-member tasks, never tasks near completion, never AOG, and
  // only when the reassignment truly saves the high SLA (no pointless churn).
  const aircraftWeight = (task: OtoTask): number => {
    const t = task.aircraftType || '';
    if (t.includes('777') || t.includes('A350') || t.includes('777-300ER')) return 3.0;
    if (t.includes('A320') || t.includes('A321') || t.includes('737') || t.includes('A330')) return 1.5;
    return 1.0; // Superjet 100 / прочие
  };
  const defectSeverity = (task: OtoTask): number => {
    const d = (task.defectLabel || '') + ' ' + (task.categoryLabel || '');
    if (d.includes('двигател') || d.includes('Электрическое') || d.includes('ATA 72') || d.includes('ATA 24')) return 2.0;
    if (d.includes('Шасси') || d.includes('Навигация') || d.includes('ВСУ')) return 1.0;
    return 0.5;
  };
  // P = AircraftWeight × DefectSeverity / max(1, minutesToDeparture)
  const priorityScore = (task: OtoTask): number => {
    const minutesToDeparture = Math.max(1, (task.slaLimitMinutes || 15) - (task.elapsedQueueSec || 0) / 60);
    return (aircraftWeight(task) * defectSeverity(task)) / minutesToDeparture;
  };
  const PREEMPT_HIGH_MIN = 5.0;   // only critical calls may preempt
  const PREEMPT_LOW_MAX = 1.5;    // only non-urgent tasks may be yanked
  const PREEMPT_ALMOST_DONE = 0.6; // never yank a task >60% through its 2-min work

  for (const highTask of tasks) {
    if (highTask.status !== 'QUEUED') continue;
    if (dispatchedTasks[highTask.id]) continue; // already handled (dispatch/reserve)
    if (highTask.priority !== 'AOG') continue;  // only AOG can cascade
    if (priorityScore(highTask) < PREEMPT_HIGH_MIN) continue;

    const highStand = standById.get(highTask.standId);
    if (!highStand) continue;

    // Best achievable ETA with a FREE worker; if someone can still make SLA,
    // no need to preempt — Hungarian already staffed or will staff them.
    let bestFreeEta = Infinity;
    let bestFreeMember: TaskCrewMember | null = null;
    for (const w of workerById.values()) {
      if (busy.has(w.id)) continue;
      if (w.status !== 'FREE_STATIONARY' && w.status !== 'FREE_PATROLLING') continue;
      if (!(w.categoryCode === highTask.categoryCode || highTask.categoryCode === 'A')) continue;
      const member = calculateEta(w, highStand);
      if (member.etaMinutes < bestFreeEta) { bestFreeEta = member.etaMinutes; bestFreeMember = member; }
    }
    // Free workers can still meet the SLA → the normal dispatcher is enough.
    if (bestFreeEta <= highTask.slaLimitMinutes) continue;

    // No free worker meets SLA → look for a low-priority single-engineer
    // WORKING task whose engineer is close to the critical stand.
    let bestVictim: { lowTask: OtoTask; worker: Worker; member: TaskCrewMember } | null = null;
    for (const lowTask of tasks) {
      if (lowTask.status !== 'WORKING') continue;
      if (lowTask.priority === 'AOG') continue;
      if (lowTask.crew.length !== 1) continue; // multi-engineer crews are not yanked
      if (priorityScore(lowTask) > PREEMPT_LOW_MAX) continue;
      // Don't yank someone who is almost done with maintenance (wasteful)
      const progress = (lowTask.elapsedWorkSec || 0) / (lowTask.targetWorkSec || 120);
      if (progress > PREEMPT_ALMOST_DONE) continue;

      const victimWorker = workerById.get(lowTask.crew[0].workerId);
      if (!victimWorker || victimWorker.status !== 'WORKING_ON_SITE') continue;
      if (!(victimWorker.categoryCode === highTask.categoryCode || highTask.categoryCode === 'A')) continue;

      const member = calculateEta(victimWorker, highStand);
      // Must beat the best free worker by a meaningful margin AND still make SLA
      if (member.etaMinutes > highTask.slaLimitMinutes) continue;
      if (member.etaMinutes >= bestFreeEta) continue;

      if (!bestVictim || member.etaMinutes < bestVictim.member.etaMinutes) {
        bestVictim = { lowTask, worker: victimWorker, member };
      }
    }
    if (!bestVictim) continue;

    const { lowTask, worker, member } = bestVictim;

    // CASCADE: reassign the engineer to the critical task
    dispatchedWorkers[worker.id] = {
      ...worker,
      status: 'IN_TRANSIT' as WorkerStatus,
      currentTaskId: highTask.id,
      pathWaypoints: member.waypoints,
      pathSpeedPctPerSimSec: pathSpeedFor(member),
      currentSegmentIndex: 0,
      dispatchedCount: (worker.dispatchedCount || 0) + 1
    };

    // High task becomes DISPATCHED with the preempted engineer
    dispatchedTasks[highTask.id] = {
      ...highTask,
      status: 'DISPATCHED' as const,
      crew: [member],
      arrivedCount: 0,
      maxEtaMinutes: member.etaMinutes,
      reservedWorkerId: undefined
    };

    // Low task reverts to QUEUED and will be re-staffed on the next drain
    dispatchedTasks[lowTask.id] = {
      ...lowTask,
      status: 'QUEUED' as const,
      crew: [],
      arrivedCount: 0,
      maxEtaMinutes: 12.0,
      elapsedWorkSec: 0,
      elapsedTransitSec: 0,
      reservedWorkerId: undefined
    };

    pushStat(highTask, member.etaMinutes);
    notifications.push(`⚠️ КАСКАДНОЕ ПЕРЕНАЗНАЧЕНИЕ: ${worker.name} снят с ${lowTask.id} и направлен на ${highTask.standLabel} (${highTask.aircraftType}) — критический вызов ${highTask.id}.`);
  }

  // ---- Step 5: proactive hot-standby repositioning ----
  // ПРЕДИКТИВНАЯ РАССТАНОВКА: in idle time (no queued calls), redistribute
  // FREE_STATIONARY engineers from over-covered bases toward under-covered
  // apron zones, so a future call at a remote stand is answered from a nearby
  // duty post instead of a 15-minute walk across the apron. Runs only when the
  // queue is empty (so it never competes with real dispatch), moves at most a
  // couple engineers per pass, and only when the coverage gap is meaningful.
  const queuedAfter = tasks.filter(t => t.status === 'QUEUED');
  if (queuedAfter.length === 0) {
    const STATIONARY_MIN_PER_BASE = 1;  // keep at least this many idle per base
    const REPOSITION_GAIN_MIN = 6;      // minutes of ETA to justify a move
    const MAX_REPOSITIONS = 2;

    // Group FREE_STATIONARY workers by base; skip patrol-preferred (they roam).
    const stationaryByBase = new Map<string, Worker[]>();
    for (const w of workerById.values()) {
      if (busy.has(w.id)) continue;
      if (w.status !== 'FREE_STATIONARY') continue;
      if (w.isPatrolPreference) continue;
      const arr = stationaryByBase.get(w.baseId) || [];
      arr.push(w);
      stationaryByBase.set(w.baseId, arr);
    }

    // Candidate stands for coverage: every remote/under-covered corner plus
    // duty posts. For each base, pick the stand with the WORST coverage from
    // the current free workforce.
    const allStands = Array.from(standById.values());
    let repositioned = 0;

    for (const [baseId, pool] of stationaryByBase) {
      if (repositioned >= MAX_REPOSITIONS) break;
      if (pool.length <= STATIONARY_MIN_PER_BASE) continue; // don't strip a base

      // Coverage = distance from the pool to each stand (min over pool).
      let worstStand: Stand | null = null;
      let worstCoverage = -Infinity;
      for (const stand of allStands) {
        let nearestEta = Infinity;
        for (const w of pool) {
          const eta = calculateEta(w, stand).etaMinutes;
          if (eta < nearestEta) nearestEta = eta;
        }
        if (nearestEta > worstCoverage) {
          worstCoverage = nearestEta;
          worstStand = stand;
        }
      }
      if (!worstStand || worstCoverage < REPOSITION_GAIN_MIN) continue;

      // The engineer closest to that under-covered stand moves to its duty post
      // (or to the stand itself) and idles there as hot-standby.
      let mover: Worker | null = null;
      let moverEta = Infinity;
      for (const w of pool) {
        const eta = calculateEta(w, worstStand).etaMinutes;
        if (eta < moverEta) { moverEta = eta; mover = w; }
      }
      if (!mover) continue;

      const moverMember = calculateEta(mover, worstStand);
      if (moverMember.etaMinutes < REPOSITION_GAIN_MIN * 0.5) continue; // already close enough

      dispatchedWorkers[mover.id] = {
        ...mover,
        status: 'RETURNING_TO_BASE' as WorkerStatus,
        currentTaskId: undefined,
        pathWaypoints: moverMember.waypoints,
        pathSpeedPctPerSimSec: pathSpeedFor(moverMember),
        currentSegmentIndex: 0
      };
      repositioned++;
      notifications.push(`🧭 Предиктивная расстановка: ${mover.name} передислоцирован к стоянке ${worstStand.label} — зона без прикрытия.`);
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
