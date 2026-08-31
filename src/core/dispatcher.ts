import { Worker, OtoTask, TaskCrewMember, WorkerStatus, CategoryCode, Stand, DispatchStat, TaskPriority, CrewRequirement } from '../types/index';
import { hungarianMinCost } from '../services/hungarian';

const INF = 1e6;

// Assignment-cost tuning (Step 2). ETA is the base cost; the rest steers the
// global optimum toward operational realism:
//  - OVERQUAL_SURCHARGE — B1/B2 covering a Cat-A slot pays a FIXED +10 min to its
//    effective ETA. A real Cat-A engineer wins the slot whenever he is within
//    10 min of the stand (normal apron distances are 1–9 min), so regulation
//    crews (2×B1+1×A, 1×B1+1×A) are kept intact; substitution is a last resort
//    only when the certified engineer is genuinely far away.
//  - FATIGUE_WEIGHT    — rotation fairness: repeatedly picking the same nearby
//    engineer costs +12% ETA per lifetime dispatch (capped at FATIGUE_CAP) —
//    the "real load" the dispatcher can observe on a FREE candidate.
//  - LOAD_WEIGHT       — active-commitment penalty for LOOKAHEAD candidates
//    (an engineer mid-maintenance already carries load).
//  - ZONE_GUARD_COST   — never strip a base below 2 idle engineers.
//  - SLA_PENALTY       — breaching the 15-min regulation is very expensive.
//  - PRIORITY_BONUS    — AOG/URGENT win scarce staff.
const SLA_PENALTY = 60;
const ZONE_GUARD_COST = 3;
const OVERQUAL_SURCHARGE_MIN = 10;
const FATIGUE_WEIGHT = 0.12;
const FATIGUE_CAP = 5;
const LOAD_WEIGHT = 0.25;
const PRIORITY_BONUS: Record<TaskPriority, number> = { AOG: 100, URGENT: 40, ROUTINE: 0 };

// Required crew of an auto task: the ATA chapter's regulation roster wins,
// falling back to a single engineer of the task's display category.
const reqOf = (t: OtoTask): CrewRequirement[] =>
  t.requiredCrew && t.requiredCrew.length > 0
    ? t.requiredCrew
    : [{ categoryCode: t.categoryCode, count: 1 }];

const totalSlots = (reqs: CrewRequirement[]): number =>
  reqs.reduce((s, r) => s + r.count, 0);

// Skill-ladder eligibility: trades are strict (B1≠B2≠A). A Cat-A slot may be
// covered by any certified engineer at a fixed surcharge; higher certs never
// substitute for a lower trade (B1 cannot do avionics).
const overqualAllowed = (reqCat: CategoryCode, workerCat: CategoryCode): boolean =>
  reqCat === workerCat || reqCat === 'A';

// Penalty in minutes added to a candidate's effective ETA for covering a
// Cat-A slot without the Cat-A certificate. Infinity = not eligible at all.
const overqualSurcharge = (reqCat: CategoryCode, workerCat: CategoryCode): number => {
  if (reqCat === workerCat) return 0;
  if (reqCat === 'A') return OVERQUAL_SURCHARGE_MIN;
  return Infinity;
};

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
  waitingReasons: Record<string, string>;
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

  // Naive ("manual") dispatcher ETA per task: the straight-line nearest free
  // engineer, computed at dispatch time. Lets the ROI widget show a LIVE
  // system-vs-manual comparison instead of a hardcoded baseline.
  const naiveEtaByTask: Record<string, number> = {};

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

  // Fast memoized ETA cache for this dispatch cycle (avoids thousands of redundant Dijkstra paths)
  const etaMemo = new Map<string, TaskCrewMember>();
  const fastCalculateEta = (w: Worker, stand: Stand): TaskCrewMember => {
    const key = `${w.id}_${stand.id}_${Math.round(w.x * 10)}_${Math.round(w.y * 10)}`;
    let cached = etaMemo.get(key);
    if (!cached) {
      cached = calculateEta(w, stand);
      etaMemo.set(key, cached);
    }
    return cached;
  };

  // Item 1: SLA-aware ordering (AOG first, then by slack-to-deadline)
  const ordered = sortQueuedBySla(queuedAll, workerById, busy, standById, fastCalculateEta);

  const pushStat = (q: OtoTask, systemEta: number) => {
    const targetStand = standById.get(q.standId);
    if (!targetStand) return;
    const naivePick = findNaiveNearest(q.categoryCode, targetStand, workers, busy);
    if (!naivePick) return;
    naiveEtaByTask[q.id] = naivePick.etaMinutes;
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
      return fastCalculateEta(w, targetStand);
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

  // ---- Step 2: auto tasks → GLOBAL MIN-COST ASSIGNMENT ----
  // Instead of greedy nearest-first (which collapses a shift when 3-5 calls
  // arrive at once), build a cost matrix and solve with the Hungarian algorithm.
  // Two shapes:
  //  * SINGLE-member calls (crew of exactly one) keep the classic (task × worker)
  //    assignment, including LOOKAHEAD reservations for engineers about to finish
  //    maintenance.
  //  * MULTI-member calls (a regulation crew, e.g. 2×B1 + 1×A for ATA 72) are
  //    assembled by a two-phase flow: first each task's CRITICAL slot — the
  //    required qualification whose nearest free engineer is farthest, i.e. the
  //    member that sets the crew's max ETA — is anchored via Hungarian across
  //    all tasks sharing that qualification; then the remaining slots are filled
  //    with the nearest free engineers of the matching skill. A task dispatches
  //    only with its FULL crew, otherwise it stays QUEUED (no half-crew
  //    maintenance).
  // Cost = ETA × over-qualification + fatigue (rotation fairness) + zone guard
  // + active-load (lookahead) + SLA penalty − priority bonus (see costOf).
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
      const travel = fastCalculateEta(rw, stand).etaMinutes;
      reservation.set(q.id, { w: rw, eta: remainingSimMin + travel });
    }

    const costOf = (eta: number, w: Worker, q: OtoTask, delay: number): number => {
      const stand = standById.get(q.standId);
      const isTargetNorth = stand ? stand.y < 45 : false;
      const isWorkerNorth = w.y < 45;
      const crossComplexPenalty = isTargetNorth !== isWorkerNorth ? 500 : 0;
      const fatigue = eta * FATIGUE_WEIGHT * Math.min(w.dispatchedCount || 0, FATIGUE_CAP);
      const zone = delay === 0 && (freeByBase.get(w.baseId) || 0) - 1 < 2 ? ZONE_GUARD_COST : 0;
      const activeLoad = delay > 0 ? (load[w.id] || 0) * eta * LOAD_WEIGHT : 0;
      const slaPenalty = eta > q.slaLimitMinutes ? SLA_PENALTY : 0;
      return eta + fatigue + zone + activeLoad + slaPenalty + crossComplexPenalty - PRIORITY_BONUS[q.priority];
    };

    // ---- Step 2a: single-member calls (crew size 1) ----
    const singleTasks = autoTasks.filter(t => totalSlots(reqOf(t)) === 1);
    if (singleTasks.length > 0) {
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

      // Only tasks with at least ONE eligible candidate enter the matrix. A task
      // whose category has zero eligible workers must NOT be a row — an all-INF
      // row breaks the Hungarian core loop (j1 = -1 → p[-1] → crash). It simply
      // stays QUEUED until staff appears.
      const matrixTasks: { task: OtoTask; eligible: number[] }[] = [];
      for (const q of singleTasks) {
        const stand = standById.get(q.standId);
        if (!stand) continue;
        const eligible: number[] = [];
        for (let ci = 0; ci < candidates.length; ci++) {
          const { w } = candidates[ci];
          if (overqualAllowed(q.categoryCode, w.categoryCode)) eligible.push(ci);
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
          const surcharge = overqualSurcharge(q.categoryCode, w.categoryCode);
          if (!stand || !Number.isFinite(surcharge)) { row.push(INF); continue; }
          const member = fastCalculateEta(w, stand);
          etaCache[ti][ci] = member;
          row.push(costOf(delay + member.etaMinutes + surcharge, w, q, delay));
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

    // ---- Step 2b: multi-member crews via critical-slot Hungarian + fill ----
    const multiTasks = autoTasks.filter(t => totalSlots(reqOf(t)) > 1);
    if (multiTasks.length > 0) {
      // A crew starts only when EVERY member is free, so lookahead reservations
      // never apply here — candidates are strictly the currently free engineers.
      const freePool: Worker[] = [];
      for (const w of workerById.values()) {
        if (w.status === 'FREE_STATIONARY' || w.status === 'FREE_PATROLLING') {
          if (!busy.has(w.id)) freePool.push(w);
        }
      }
      const usedIds = new Set<string>();

      const pickNearestFor = (cat: CategoryCode, q: OtoTask, stand: Stand): { w: Worker; member: TaskCrewMember; eff: number } | null => {
        let best: { w: Worker; member: TaskCrewMember; eff: number } | null = null;
        const isTargetNorth = stand.y < 45;
        for (const w of freePool) {
          if (usedIds.has(w.id)) continue;
          const surcharge = overqualSurcharge(cat, w.categoryCode);
          if (!Number.isFinite(surcharge)) continue;
          const isWorkerNorth = w.y < 45;
          const crossComplex = isTargetNorth !== isWorkerNorth ? 500 : 0;
          const m = fastCalculateEta(w, stand);
          const eff = m.etaMinutes + surcharge + crossComplex;
          if (!best || eff < best.eff) best = { w, member: m, eff };
        }
        return best;
      };

      // Critical slot: the required qualification with the WORST best-achievable
      // ETA is the binding member (it sets the crew's max). Anchor it globally.
      const critByTask = new Map<string, { cat: CategoryCode; stand: Stand }>();
      for (const q of multiTasks) {
        const stand = standById.get(q.standId);
        if (!stand) continue;
        let worstCat: CategoryCode | null = null;
        let worstEta = -Infinity;
        let feasible = true;
        for (const r of reqOf(q)) {
          const p = pickNearestFor(r.categoryCode, q, stand);
          if (!p) { feasible = false; break; }
          if (p.eff > worstEta) { worstEta = p.eff; worstCat = r.categoryCode; }
        }
        if (feasible && worstCat) critByTask.set(q.id, { cat: worstCat, stand });
      }

      const cats = ['B1', 'B2', 'A'] as CategoryCode[];
      const tasksByCrit = new Map<CategoryCode, OtoTask[]>();
      for (const q of multiTasks) {
        const c = critByTask.get(q.id);
        if (!c) continue;
        const arr = tasksByCrit.get(c.cat) || [];
        arr.push(q);
        tasksByCrit.set(c.cat, arr);
      }
      // Process the scarcest critical qualification first, so its engineers are
      // locked in before a Cat-A task can spend them at +30% over-qualification.
      const critOrder = cats.filter(c => tasksByCrit.has(c)).sort((a, b) => {
        const ca = tasksByCrit.get(a)!.length;
        const cb = tasksByCrit.get(b)!.length;
        let na = 0, nb = 0;
        for (const w of freePool) {
          if (usedIds.has(w.id)) continue;
          if (overqualAllowed(a, w.categoryCode)) na++;
          if (overqualAllowed(b, w.categoryCode)) nb++;
        }
        return na / Math.max(1, ca) - nb / Math.max(1, cb);
      });

      const criticalAssignments = new Map<string, { w: Worker; member: TaskCrewMember }>();
      for (const cat of critOrder) {
        const group = tasksByCrit.get(cat)!.filter(q => !dispatchedTasks[q.id]);
        if (group.length === 0) continue;
        const cols: Worker[] = [];
        for (const w of freePool) {
          if (usedIds.has(w.id)) continue;
          if (overqualAllowed(cat, w.categoryCode)) cols.push(w);
        }
        if (cols.length === 0) continue;

        const costMatrix: number[][] = [];
        const etaCache: (TaskCrewMember | null)[][] = group.map(() => new Array(cols.length).fill(null));
        for (let ri = 0; ri < group.length; ri++) {
          const q = group[ri];
          const stand = critByTask.get(q.id)!.stand;
          const row: number[] = [];
          for (let ci = 0; ci < cols.length; ci++) {
            const w = cols[ci];
            const surcharge = overqualSurcharge(cat, w.categoryCode);
            const member = fastCalculateEta(w, stand);
            etaCache[ri][ci] = member;
            row.push(costOf(member.etaMinutes + surcharge, w, q, 0));
          }
          costMatrix.push(row);
        }
        const { assignment } = hungarianMinCost(costMatrix);
        for (let ri = 0; ri < assignment.length; ri++) {
          const ci = assignment[ri];
          if (ci < 0 || ci >= cols.length) continue;
          const q = group[ri];
          const w = cols[ci];
          const member = etaCache[ri][ci];
          if (!member) continue;
          usedIds.add(w.id);
          criticalAssignments.set(q.id, { w, member });
        }
      }

      // Fill the remaining slots (all-or-nothing), best tasks first.
      const orderedMulti = multiTasks.slice().sort((a, b) => {
        const ra = a.priority === 'AOG' ? 0 : a.priority === 'URGENT' ? 1 : 2;
        const rb = b.priority === 'AOG' ? 0 : b.priority === 'URGENT' ? 1 : 2;
        if (ra !== rb) return ra - rb;
        return (b.elapsedQueueSec || 0) - (a.elapsedQueueSec || 0);
      });

      for (const q of orderedMulti) {
        if (dispatchedTasks[q.id]) continue;
        const stand = critByTask.get(q.id)?.stand;
        if (!stand) continue;

        const need: Record<CategoryCode, number> = { B1: 0, B2: 0, A: 0 };
        for (const r of reqOf(q)) need[r.categoryCode] += r.count;
        const picked: { w: Worker; member: TaskCrewMember }[] = [];
        const crit = criticalAssignments.get(q.id);
        const critCat = critByTask.get(q.id)?.cat;
        if (crit && critCat) {
          picked.push(crit);
          // Слот, который закрывает критический член, — это критическая КАТЕГОРИЯ
          // (не категория самого работника: B1 может закрыть слот Cat-A с надбавкой).
          need[critCat] -= 1;
        }

        let ok = true;
        for (const cat of cats) {
          for (let k = 0; k < need[cat]; k++) {
            const p = pickNearestFor(cat, q, stand);
            if (!p) { ok = false; break; }
            usedIds.add(p.w.id);
            picked.push({ w: p.w, member: p.member });
          }
          if (!ok) break;
        }

        if (!ok || picked.length !== totalSlots(reqOf(q))) {
          // Roll back every member grabbed for this task — partial crews don't
          // dispatch. The task stays QUEUED until the full roster is available.
          for (const p of picked) usedIds.delete(p.w.id);
          continue;
        }

        const crew = picked.map(p => p.member);
        const maxEta = Math.max(...crew.map(m => m.etaMinutes));
        for (const p of picked) {
          busy.add(p.w.id);
          load[p.w.id] = (load[p.w.id] || 0) + 1;
          dispatchedWorkers[p.w.id] = {
            ...p.w,
            status: 'IN_TRANSIT' as WorkerStatus,
            currentTaskId: q.id,
            pathWaypoints: p.member.waypoints,
            pathSpeedPctPerSimSec: pathSpeedFor(p.member),
            currentSegmentIndex: 0,
            dispatchedCount: (p.w.dispatchedCount || 0) + 1
          };
        }
        dispatchedTasks[q.id] = {
          ...q,
          status: 'DISPATCHED' as const,
          crew,
          arrivedCount: 0,
          maxEtaMinutes: maxEta,
          reservedWorkerId: undefined
        };
        pushStat(q, maxEta);
        notifications.push(`👷 Бригада собрана: ${crew.map(c => `${c.workerName} (Cat ${c.categoryCode}, ${c.etaMinutes} мин)`).join(' + ')} → ${q.standLabel} (max ETA ${maxEta} мин).`);
      }
    }
  }

  // ---- Step 3: re-dispatch in-flight tasks whose crew is still far away ----
  // The "one guy walks across the apron while free people stand near the
  // target" case: an already-DISPATCHED task may have a crew member still
  // IN_TRANSIT while a FREE worker of the right category is now closer.
  // Any not-yet-arrived member is replaceable (even if a colleague already
  // reached the aircraft); only fully-arrived crews are left alone. Only switch
  // when the gain is meaningful (REASSIGN_GAIN_MIN) to avoid churning workers
  // back and forth on every completion — near/over the SLA deadline the
  // threshold tightens so any real improvement is grabbed.
  const REASSIGN_GAIN_MIN = 2.0; // minutes
  const REASSIGN_GAIN_MIN_TIGHT = 1.0; // minutes, when already breaching SLA
  for (const task of tasks) {
    if (task.status !== 'DISPATCHED') continue;
    if (dispatchedTasks[task.id]) continue; // just assigned this pass
    if (task.crew.length === 0) continue;
    // Everything already arrived → maintenance is running, nothing to swap.
    if ((task.arrivedCount || 0) >= task.crew.length) continue;

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
    const gainRequired = (task.maxEtaMinutes || 0) > task.slaLimitMinutes ? REASSIGN_GAIN_MIN_TIGHT : REASSIGN_GAIN_MIN;
    let bestFree: Worker | null = null;
    let bestMember: TaskCrewMember | null = null;
    const isTargetNorth = stand.y < 45;
    for (const w of workerById.values()) {
      if (busy.has(w.id)) continue;
      if (w.status !== 'FREE_STATIONARY' && w.status !== 'FREE_PATROLLING') continue;
      if (!(w.categoryCode === task.categoryCode || task.categoryCode === 'A')) continue;
      const isWorkerNorth = w.y < 45;
      if (isTargetNorth !== isWorkerNorth) continue; // Never swap across the tunnel between North and South
      const member = fastCalculateEta(w, stand);
      if (member.etaMinutes >= remainingTransit - gainRequired) continue;
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
  // "КАСКАДНАЯ ПЕРЕБРОСКА": if a critical call (AOG / 777 about to depart, or
  // an URGENT call already near its deadline) cannot be staffed by ANY free
  // worker within SLA, yank an engineer off a low-priority single-engineer
  // maintenance task that still has real work left, and send him to the
  // critical stand instead. The low-priority task reverts to QUEUED and is
  // re-staffed on the next drain. Guards: only preempt single-member tasks,
  // never tasks near completion, never AOG, and only when the reassignment
  // truly saves the high SLA (no pointless churn).
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
  const PREEMPT_HIGH_MIN = 5.0;          // AOG calls may preempt
  const PREEMPT_HIGH_MIN_URGENT = 3.0;   // URGENT may preempt only near the deadline
  const PREEMPT_LOW_MAX = 1.5;           // only non-urgent tasks may be yanked
  const PREEMPT_ALMOST_DONE = 0.6;       // never yank a task >60% through its 2-min work

  for (const highTask of tasks) {
    if (highTask.status !== 'QUEUED') continue;
    if (dispatchedTasks[highTask.id]) continue; // already handled (dispatch/reserve)
    const highEnough = highTask.priority === 'AOG'
      ? priorityScore(highTask) >= PREEMPT_HIGH_MIN
      : highTask.priority === 'URGENT' && priorityScore(highTask) >= PREEMPT_HIGH_MIN_URGENT;
    if (!highEnough) continue; // only critical AOG / near-deadline URGENT may cascade

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

  // ---- Step 6: waiting reasons (explainability) + naive ETA attachment ----
  // Every task still QUEUED after all steps gets a human-readable explanation of
  // WHY it cannot be staffed right now ("не хватает 1× Cat A", "нет свободного
  // B1"), so the demo shows the intelligence instead of a silent queue. Also
  // attach the naive (manual) dispatcher ETA to each dispatched task for the
  // live system-vs-manual ROI comparison.
  const waitingReasons: Record<string, string> = {};
  const freeAfter: Worker[] = [];
  for (const w of workerById.values()) {
    if ((w.status === 'FREE_STATIONARY' || w.status === 'FREE_PATROLLING') && !busy.has(w.id)) {
      freeAfter.push(w);
    }
  }

  for (const q of queuedAll) {
    const out = dispatchedTasks[q.id];
    const stillQueued = out ? out.status === 'QUEUED' : true;
    if (!stillQueued) continue;
    const stand = standById.get(q.standId);
    if (!stand) continue;

    // Lookahead reservation: explain that a specific engineer is about to finish
    if (q.reservedWorkerId) {
      const rw = workerById.get(q.reservedWorkerId);
      if (rw && rw.status === 'WORKING_ON_SITE') {
        const active = tasks.find(t => t.id === rw.currentTaskId && t.status === 'WORKING');
        const remaining = active ? Math.max(0, ((active.targetWorkSec || 120) - (active.elapsedWorkSec || 0)) / 60) : 0;
        waitingReasons[q.id] = `⏳ Резерв: ${rw.name} завершает ТО (≈${Math.ceil(remaining)} мин) и выедет сразу, без возврата на базу.`;
        continue;
      }
    }

    // Which required qualification is blocking the crew?
    const missing: string[] = [];
    for (const r of reqOf(q)) {
      const exact = freeAfter.filter(w => w.categoryCode === r.categoryCode);
      let avail = exact.length;
      const bestEta = exact.length > 0
        ? Math.min(...exact.map(w => calculateEta(w, stand).etaMinutes))
        : Infinity;
      if (r.categoryCode === 'A' && avail < r.count) {
        // B1/B2 могут закрыть слот Cat-A с надбавкой за переквалификацию
        avail += freeAfter.filter(w => w.categoryCode !== 'A').length;
      }
      if (avail < r.count) {
        const short = r.count - avail;
        let msg = short >= r.count
          ? `нет свободного Cat ${r.categoryCode}`
          : `не хватает ${short}× Cat ${r.categoryCode}`;
        if (Number.isFinite(bestEta) && bestEta > (q.slaLimitMinutes || 15)) {
          msg += ` (ближайший в ${bestEta} мин > SLA ${q.slaLimitMinutes} мин)`;
        }
        missing.push(msg);
      }
    }
    waitingReasons[q.id] = missing.length > 0
      ? `⏳ Ждём бригаду: ${missing.join('; ')}.`
      : '⏳ Ожидание: все свободные специалисты нужных категорий уже задействованы на других вызовах.';
  }

  for (const id of Object.keys(dispatchedTasks)) {
    const t = dispatchedTasks[id];
    if (t && naiveEtaByTask[id] != null) {
      dispatchedTasks[id] = { ...t, intuitiveEtaMinutes: naiveEtaByTask[id] };
    }
  }

  return {
    dispatchedTasks,
    dispatchedWorkers,
    stats: newStats,
    notifications,
    waitingReasons,
    changed: Object.keys(dispatchedTasks).length > 0
  };
}
