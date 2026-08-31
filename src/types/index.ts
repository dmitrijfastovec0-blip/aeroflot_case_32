export type Category = 'ENGINES_AIRFRAME' | 'AVIONICS' | 'GENERAL_MECHANIC';
export type CategoryCode = 'B1' | 'B2' | 'A';

export type Complex = 'NORTH' | 'SOUTH' | 'REMOTE';
export type FacilityType = 'DUTY_STATION' | 'HANGAR_BASE' | 'PARKING' | 'HANGAR';

export type ThemeMode = 'dark' | 'light';
export type WeatherMode = 'CLEAR' | 'RAIN' | 'BLIZZARD' | 'NIGHT';
export type TaskPriority = 'AOG' | 'URGENT' | 'ROUTINE';

// Регламентный состав бригады: сколько инженеров какой квалификации нужно
// для данной главы ATA (единый источник — используется и в каталоге дефектов,
// и в диспетчере для сборки полных бригад).
export interface CrewRequirement {
  categoryCode: CategoryCode;
  count: number;
}

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

export type AirfieldMode = 'SVO' | 'CUSTOM';

export type AirportElementKind = 'TERMINAL' | 'HANGAR' | 'PARKING' | 'RUNWAY' | 'STAND' | 'DUTY_STATION' | 'WAYPOINT';

export interface AirportElement {
  id: string;
  kind: AirportElementKind;
  label: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  aircraftType?: string;
  code?: string;
  complex?: Complex;
}

export type AirportConnectionKind = 'ROAD' | 'TAXIWAY' | 'TUNNEL' | 'SERVICE';

export interface AirportConnection {
  id: string;
  from?: string;
  to?: string;
  kind: AirportConnectionKind;
  points?: { x: number; y: number }[];
}

export type WorkerStatus =
  | 'FREE_STATIONARY'    // 🟢 Свободен на базе
  | 'FREE_PATROLLING'     // 🟢 Свободен, патрулирует перрон
  | 'BOARDING_VEHICLE'    // 🟡 Погрузка инструмента и посадка
  | 'IN_TRANSIT'         // 🔵 В пути на вызов
  | 'WORKING_ON_SITE'    // 🔴 Дошел до борта и проводит ТО
  | 'RETURNING_TO_BASE';  // 🟡 Возврат на базу

export type VehicleType = 'PEDESTRIAN' | 'APRON_VEHICLE' | 'SHUTTLE' | 'WALK';

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
  pathSpeedPctPerSimSec?: number;
  currentSegmentIndex?: number;
  boardingSecRemaining?: number; // 🟡 Погрузка инструмента и посадка (в сим-секундах)
  dutyStandId?: string;
  isPatrolPreference?: boolean;
  dispatchedCount?: number;
  isEmergency?: boolean; // AOG emergency beacon flashing lights
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
  defectLabel?: string;
  priority: TaskPriority; // AOG (1), URGENT (2), ROUTINE (3)
  status: 'QUEUED' | 'DISPATCHED' | 'WORKING' | 'COMPLETED';
  requiredCrew?: CrewRequirement[]; // Полный регламентный состав бригады (для сборки в диспетчере)
  crew: TaskCrewMember[];
  arrivedCount: number;
  maxEtaMinutes: number;
  intuitiveEtaMinutes?: number;
  slaLimitMinutes: number;
  withinSla: boolean;
  createdAt: string;
  elapsedQueueSec?: number; // Queued time accumulated in simulation seconds
  elapsedTransitSec?: number; // Time spent in transit
  elapsedWorkSec: number;   // Elapsed work time in seconds (0 to 120s)
  targetWorkSec: number;    // Target 120s (2 real minutes)
  reservedWorkerId?: string; // Lookahead: queued task promised to a worker still on duty
  waitingReason?: string;   // Explainability: почему задача ждёт в очереди (для UI)
  createdAtSimSec?: number;  // Время создания задачи по сим-часам (сек)
  startedAtSimSec?: number;  // Время первого отправления бригады по сим-часам (сек)
  completedAtSimSec?: number; // Время завершения ТО по сим-часам (сек)
  isEmergency?: boolean;     // AOG urgent dispatch siren mode
}

export interface HoverTooltipData {
  type: 'STAND' | 'FACILITY' | 'WORKER';
  title: string;
  subtitle: string;
  details: { label: string; value: string }[];
  x: number;
  y: number;
}

// Dispatch analytics: "intuitive dispatcher" vs system (saved minutes, SLA compliance)
export interface DispatchStat {
  taskId: string;
  standLabel: string;
  categoryCode: CategoryCode;
  defectLabel?: string;
  intuitiveEtaMinutes: number;
  systemEtaMinutes: number;
  savedMinutes: number;
  within15: boolean;
  createdAt: string;
}
