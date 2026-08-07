// ============================================================================
// HUNGARIAN ALGORITHM (Kuhn–Munkres) — GLOBAL MIN-COST ASSIGNMENT
// ----------------------------------------------------------------------------
// Solves the assignment problem for the dispatch engine: given a cost matrix
// C[i][j] = arrival time of worker j to task i's stand, find the 1:1 assignment
// that minimizes the SUM of costs in O(n^3) — the global optimum, unlike greedy
// nearest-neighbor which can collapse a shift when 3–5 calls arrive at once
// (a worker sent slightly "closer" to his own call may strand another call
// with a 20-minute walk across the apron).
//
// Rectangular matrices are handled by padding the smaller dimension: dummy rows
// get cost 0 (they absorb leftover workers without stealing a real task's
// column) and a real task with no eligible worker gets INF (stays unassigned).
// ============================================================================

const INF = 1e6;   // sentinel cost for ineligible pairings (real costs stay < 200)
const BIG = 1e12;  // "infinity" for the algorithm's potentials — must be >> INF

export interface AssignmentResult {
  assignment: number[]; // row -> col index, -1 if row could not be assigned
  totalCost: number;
}

export function hungarianMinCost(cost: number[][]): AssignmentResult {
  const rows = cost.length;
  const cols = rows > 0 ? cost[0].length : 0;
  if (rows === 0 || cols === 0) return { assignment: [], totalCost: 0 };

  const N = Math.max(rows, cols);
  const a: number[][] = [];
  for (let i = 0; i < N; i++) {
    const row: number[] = [];
    for (let j = 0; j < N; j++) {
      if (i < rows && j < cols) {
        row.push(cost[i][j]);
      } else if (i >= rows) {
        // Dummy (task-side) padding: cost 0 so leftover workers are absorbed
        // freely and never steal a real task's column.
        row.push(0);
      } else {
        // Real task with no eligible worker: INF → stays unassigned.
        row.push(INF);
      }
    }
    a.push(row);
  }

  // Potentials + augmenting path arrays (1-indexed for the classic form)
  const u = new Array<number>(N + 1).fill(0);
  const v = new Array<number>(N + 1).fill(0);
  const p = new Array<number>(N + 1).fill(0); // p[j] = row matched to column j
  const way = new Array<number>(N + 1).fill(0);

  for (let i = 1; i <= N; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(N + 1).fill(BIG);
    const used = new Array<boolean>(N + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = BIG;
      let j1 = -1;
      for (let j = 1; j <= N; j++) {
        if (!used[j]) {
          const cur = a[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }
      for (let j = 0; j <= N; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);

    // Augment along the path
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const assignment: number[] = new Array<number>(rows).fill(-1);
  let totalCost = 0;
  for (let j = 1; j <= N; j++) {
    const rowIdx = p[j] - 1;
    if (rowIdx >= 0 && rowIdx < rows && j - 1 < cols && a[rowIdx][j - 1] < INF) {
      assignment[rowIdx] = j - 1;
      totalCost += cost[rowIdx][j - 1];
    }
  }

  return { assignment, totalCost };
}
