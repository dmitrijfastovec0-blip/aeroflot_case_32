export type Category = 'ENGINES_AIRFRAME' | 'AVIONICS' | 'GENERAL_MECHANIC';
export type CategoryCode = 'B1' | 'B2' | 'A';

export type Complex = 'NORTH' | 'SOUTH' | 'REMOTE';
export type FacilityType = 'DUTY_STATION' | 'HANGAR_BASE';

export type ThemeMode = 'dark' | 'light';
export type TaskPriority = 'AOG' | 'URGENT' | 'ROUTINE';

export interface Facility {
  id: string;
  name: string;
  code: string;
  complex: Complex;
  x: number;
  y: number;
  type: FacilityType;
}

export interface Stand {
  id: string;
  label: string;
  complex: Complex;
  x: number;
  y: number;
  aircraftType: string;
  airline?: string;
  status?: 'IDLE' | 'HAS_TASK';
}

export type WorkerStatus =
  | 'FREE_STATIONARY'    // 🟢 Свободен на базе
  | 'FREE_PATROLLING'     // 🟢 Свободен, патрулирует перрон
  | 'IN_TRANSIT'         // 🔵 В пути на вызов
  | 'WORKING_ON_SITE'    // 🔴 Дошел до борта и проводит ТО
  | 'RETURNING_TO_BASE';  // 🟡 Возврат на базу

export type VehicleType = 'PEDESTRIAN' | 'APRON_VEHICLE' | 'SHUTTLE';

export interface Worker {
  id: string;
  name: string;
  category: Category;
  categoryCode: CategoryCode;
  status: WorkerStatus;
  baseId: string;
  x: number;
  y: number;
  vehicle: VehicleType;
  currentTaskId?: string;
  pathWaypoints?: { x: number; y: number }[];
  currentSegmentIndex?: number;
}

export interface TaskCrewMember {
  workerId: string;
  workerName: string;
  categoryCode: CategoryCode;
  startLocationText: string;
  distanceMeters: number;
  vehicle: VehicleType;
  vehicleLabel: string;
  etaMinutes: number;
  waypoints: { x: number; y: number }[];
  hasArrived?: boolean;
}

export interface OtoTask {
  id: string;
  standId: string;
  standLabel: string;
  aircraftType: string;
  categoryCode: CategoryCode;
  categoryLabel: string;
  priority: TaskPriority; // AOG (1), URGENT (2), ROUTINE (3)
  status: 'QUEUED' | 'DISPATCHED' | 'WORKING' | 'COMPLETED';
  crew: TaskCrewMember[];
  arrivedCount: number;
  maxEtaMinutes: number;
  slaLimitMinutes: number;
  withinSla: boolean;
  createdAt: string;
  queueStartTimeMs?: number; // Timestamp when added to queue
  elapsedWorkSec: number;    // Elapsed work time in seconds (0 to 120s)
  targetWorkSec: number;     // Target 120s (2 real minutes)
}

export interface HoverTooltipData {
  type: 'STAND' | 'FACILITY' | 'WORKER';
  title: string;
  subtitle: string;
  details: { label: string; value: string }[];
  x: number;
  y: number;
}
