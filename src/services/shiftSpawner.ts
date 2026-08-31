import { Worker, Stand, Facility, CategoryCode, Category, WorkerStatus, AirportElement, AirportConnection } from '../types/index';
import { TECHNICIAN_NAMES, SVO_STANDS, REAL_SVO_FACILITIES } from '../constants/index';
import { extractCustomFacilities, extractCustomStands, getCustomPatrolWaypoints } from './airfieldGraph';
import { getClosestNodeId, getClosestSectorNodeId, pickPatrolTargetId, findDijkstraShortestPath, getWaypointsForNodePath } from './dijkstra';

export interface ShiftSpawnerConfig {
  b1Count: number;
  b2Count: number;
  catACount: number;
  vehiclesCount: number;
  customElements?: AirportElement[];
  customConnections?: AirportConnection[];
  customFacilities?: Facility[];
  customStands?: Stand[];
  isCustomMode?: boolean;
}

export function spawnAirfieldShift(config: ShiftSpawnerConfig): Worker[] {
  const {
    b1Count,
    b2Count,
    catACount,
    vehiclesCount,
    customElements = [],
    customConnections = [],
    customFacilities,
    customStands,
    isCustomMode = false
  } = config;

  const workers: Worker[] = [];
  let nameIdx = 0;

  const bases: Facility[] = (customFacilities && customFacilities.length > 0)
    ? customFacilities
    : (isCustomMode || customElements.length > 0 ? extractCustomFacilities(customElements) : REAL_SVO_FACILITIES);

  const standsList: Stand[] = (customStands && customStands.length > 0)
    ? customStands
    : (isCustomMode || customElements.length > 0 ? extractCustomStands(customElements) : SVO_STANDS);

  const safeBases = bases.length > 0 ? bases : [{
    id: 'BASE_DEFAULT',
    name: 'Главная база полигона',
    code: 'ПТО-1',
    complex: 'NORTH' as const,
    x: 50,
    y: 50,
    type: 'DUTY_STATION' as const
  }];

  const total = b1Count + b2Count + catACount;
  let vehicleAllocated = 0;

  // Separate bases by functional type for realistic organizational clustering
  const ptoBases = safeBases.filter(b => b.type === 'DUTY_STATION');
  const parkBases = safeBases.filter(b => b.type === 'PARKING');
  const hangarBases = safeBases.filter(b => b.type === 'HANGAR' || b.type === 'HANGAR_BASE');

  const getBaseForRole = (catCode: CategoryCode, roleIdx: number): Facility => {
    if (catCode === 'A' && parkBases.length > 0) {
      return parkBases[roleIdx % parkBases.length];
    }
    if ((catCode === 'B1' || catCode === 'B2') && hangarBases.length > 0 && roleIdx % 3 === 2) {
      return hangarBases[roleIdx % hangarBases.length];
    }
    if (ptoBases.length > 0) {
      return ptoBases[roleIdx % ptoBases.length];
    }
    return safeBases[roleIdx % safeBases.length];
  };

  const BASE_POSTS: Record<string, string[]> = {
    'PTO_1': ['STAND_B10', 'STAND_B12', 'STAND_B14', 'STAND_C21', 'STAND_C25', 'STAND_C27'],
    'PARKING_1': ['STAND_B12', 'STAND_B14', 'STAND_C21'],
    'AK_4': ['STAND_101', 'STAND_102', 'STAND_105'],
    'PTO_2': ['STAND_D12', 'STAND_D14', 'STAND_D18', 'STAND_D24', 'STAND_E38', 'STAND_F45'],
    'PARKING_2': ['STAND_D14', 'STAND_D18', 'STAND_D24'],
    'AK_1': ['STAND_201', 'STAND_204', 'STAND_F45']
  };

  let stationIdx = 0;
  let patrolIdx = 0;
  const stationPerBase: Record<string, number> = {};

  const createWorker = (
    catCode: CategoryCode,
    category: Category,
    prefix: string,
    num: number
  ): Worker => {
    const isPatrol = num % 2 === 1;
    if (isPatrol) patrolIdx++;
    else stationIdx++;

    const hasVehicle = vehicleAllocated < vehiclesCount;
    if (hasVehicle) vehicleAllocated++;

    const roleIdx = isPatrol ? patrolIdx : stationIdx;
    const baseObj = getBaseForRole(catCode, roleIdx);

    // Stationary workers post on duty stands or stay at base
    const posts = BASE_POSTS[baseObj.id] || [];
    let dutyStandId: string | undefined = undefined;
    if (!isPatrol) {
      const atBase = (stationPerBase[baseObj.id] = (stationPerBase[baseObj.id] || 0) + 1);
      if (atBase % 3 === 0 && posts.length > 0) {
        dutyStandId = posts[Math.floor(atBase / 3) % posts.length];
      }
    }

    const dutyStand = dutyStandId ? SVO_STANDS.find(s => s.id === dutyStandId) : undefined;
    const initX = dutyStand ? dutyStand.x : baseObj.x;
    const initY = dutyStand ? dutyStand.y : baseObj.y;

    const name = TECHNICIAN_NAMES[nameIdx % TECHNICIAN_NAMES.length];
    nameIdx++;

    const tempWorker: Worker = {
      id: `w-${prefix}-${num.toString().padStart(2, '0')}`,
      name,
      category,
      categoryCode: catCode,
      status: isPatrol ? 'FREE_PATROLLING' : 'FREE_STATIONARY',
      x: initX,
      y: initY,
      baseId: baseObj.id,
      dutyStandId,
      vehicle: hasVehicle ? 'APRON_VEHICLE' : 'WALK',
      isPatrolPreference: isPatrol,
      dispatchedCount: 0
    };

    if (isPatrol) {
      if (isCustomMode && customElements.length > 0) {
        tempWorker.pathWaypoints = getCustomPatrolWaypoints(tempWorker, customElements, customConnections);
      } else {
        const isNorth = baseObj.id === 'PTO_1' || baseObj.id === 'PARKING_1' || baseObj.id === 'AK_4';
        const sectorNodes = isNorth
          ? ['STAND_B10', 'STAND_B12', 'STAND_B14', 'STAND_C21', 'STAND_C25', 'STAND_C27', 'STAND_101', 'STAND_102', 'STAND_105', 'WAY_AK4', 'WAY_N_WEST', 'WAY_N_MID', 'WAY_N_EAST', 'PTO_1', 'PARKING_1', 'AK_4']
          : ['STAND_D12', 'STAND_D14', 'STAND_D18', 'STAND_D24', 'STAND_E38', 'STAND_F45', 'STAND_201', 'STAND_204', 'WAY_S_WEST', 'WAY_S_MID', 'WAY_S_EAST', 'WAY_AK1', 'PTO_2', 'PARKING_2', 'AK_1'];
        const startNodeId = getClosestSectorNodeId(initX, initY, sectorNodes);
        const localTargetId = pickPatrolTargetId(baseObj.id);
        const nodePath = findDijkstraShortestPath(startNodeId, localTargetId);
        tempWorker.pathWaypoints = getWaypointsForNodePath({ x: initX, y: initY }, nodePath);
      }
      tempWorker.currentSegmentIndex = 0;
    }

    return tempWorker;
  };

  // 1. Spawn B1 Engineers (Engines & Airframe)
  for (let i = 1; i <= b1Count; i++) {
    workers.push(createWorker('B1', 'ENGINES_AIRFRAME', 'b1', i));
  }

  // 2. Spawn B2 Engineers (Avionics)
  for (let i = 1; i <= b2Count; i++) {
    workers.push(createWorker('B2', 'AVIONICS', 'b2', i));
  }

  // 3. Spawn Category A Technicians (Line Mechanics)
  for (let i = 1; i <= catACount; i++) {
    workers.push(createWorker('A', 'GENERAL_MECHANIC', 'a', i));
  }

  return workers;
}
