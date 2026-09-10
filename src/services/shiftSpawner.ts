/**
 * ============================================================================
 * ГЕНЕРАТОР ОПЕРАТИВНОЙ СМЕНЫ ПЕРРОНА (SHIFT SPAWNER)
 * ----------------------------------------------------------------------------
 * Формирует реалистичный состав дежурной смены авиатехников и спецтехники
 * для обслуживания воздушных судов на перроне аэропорта Шереметьево (SVO)
 * или пользовательского полигона (CUSTOM).
 * 
 * Логика распределения персонала:
 * 1. Квалификационный состав:
 *    - B1 (Силовые установки и планер): основная масса инженеров для дефектов AMM/MEL
 *    - B2 (Авионика и приборное оборудование): специалисты по радиоэлектронике и бортсетям
 *    - Cat A (Линейные техники): предполетное обслуживание, осмотры, колеса, жидкости
 * 
 * 2. Организационная привязка к базам:
 *    - Базы ПТО (ПТО-1 Север, ПТО-2 Юг): оперативное дежурство у терминальных стоянок
 *    - Ангарные комплексы (АК-1, АК-4): базирование для углубленного техобслуживания
 *    - Стоянки спецтехники (PARKING): стоянки мобильных мастерских и спецавтомобилей
 * 
 * 3. Режимы дежурства:
 *    - Стационарное дежурство (FREE_STATIONARY): на опорной базе или назначенной стоянке
 *    - Локальное патрулирование (FREE_PATROLLING): круговое движение по дорожному графу сектора,
 *      что сокращает ETA к удаленным бортам в часы пик
 * 
 * 4. Спецавтотранспорт:
 *    - Лимитированный парк автомобилей ПТО (vehiclesCount). Персонал с авто получает
 *      статус APRON_VEHICLE (скорость 20 км/ч), остальные — пеший ход WALK (4.5 км/ч).
 * ============================================================================
 */

import { Worker, Stand, Facility, CategoryCode, Category, WorkerStatus, AirportElement, AirportConnection } from '../types/index';
import { TECHNICIAN_NAMES, SVO_STANDS, REAL_SVO_FACILITIES } from '../constants/index';
import { extractCustomFacilities, extractCustomStands, getCustomPatrolWaypoints } from './airfieldGraph';
import { getSvoPatrolWaypoints } from './dijkstra';

/** Параметры конфигурации генерации смены ИТП */
export interface ShiftSpawnerConfig {
  /** Количество инженеров категории B1 (планер и двигатели) */
  b1Count: number;
  /** Количество инженеров категории B2 (авионика) */
  b2Count: number;
  /** Количество линейных авиатехников категории A */
  catACount: number;
  /** Количество доступных спецавтомобилей ПТО */
  vehiclesCount: number;
  /** Элементы пользовательского полигона (для режима CUSTOM) */
  customElements?: AirportElement[];
  /** Дорожные соединения пользовательского полигона (для режима CUSTOM) */
  customConnections?: AirportConnection[];
  /** Пользовательские базы */
  customFacilities?: Facility[];
  /** Пользовательские стоянки */
  customStands?: Stand[];
  /** Флаг режима пользовательского полигона */
  isCustomMode?: boolean;
}

/**
 * Создает полный массив сотрудников смены с назначенными базами, транспортом и маршрутами патрулирования.
 * 
 * @param config Конфигурация численности и параметров перрона
 * @returns Массив инициализированных сотрудников Worker[]
 */
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

  // Определение актуального перечня баз инфраструктуры
  const bases: Facility[] = (customFacilities && customFacilities.length > 0)
    ? customFacilities
    : (isCustomMode || customElements.length > 0 ? extractCustomFacilities(customElements) : REAL_SVO_FACILITIES);

  // Определение актуального перечня стоянок воздушных судов
  const standsList: Stand[] = (customStands && customStands.length > 0)
    ? customStands
    : (isCustomMode || customElements.length > 0 ? extractCustomStands(customElements) : SVO_STANDS);

  // Резервная база по умолчанию, если список пуст
  const safeBases = bases.length > 0 ? bases : [{
    id: 'BASE_DEFAULT',
    name: 'Главная база полигона',
    code: 'ПТО-1',
    complex: 'NORTH' as const,
    x: 50,
    y: 50,
    type: 'DUTY_STATION' as const
  }];

  let vehicleAllocated = 0;

  // Кластеризация баз по функциональному назначению
  const ptoBases = safeBases.filter(b => b.type === 'DUTY_STATION');
  const parkBases = safeBases.filter(b => b.type === 'PARKING');
  const hangarBases = safeBases.filter(b => b.type === 'HANGAR' || b.type === 'HANGAR_BASE');

  /**
   * Подбирает оптимальную базу в зависимости от специальности сотрудника
   */
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

  /** Посты дежурства на стоянках для ключевых баз Шереметьево */
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

  /**
   * Создает отдельного сотрудника с заданными параметрами
   */
  const createWorker = (
    catCode: CategoryCode,
    category: Category,
    prefix: string,
    num: number
  ): Worker => {
    // Чередование: половина сотрудников патрулирует перрон, половина на базе
    const isPatrol = num % 2 === 1;
    if (isPatrol) patrolIdx++;
    else stationIdx++;

    // Распределение спецавтомобилей
    const hasVehicle = vehicleAllocated < vehiclesCount;
    if (hasVehicle) vehicleAllocated++;

    const roleIdx = isPatrol ? patrolIdx : stationIdx;
    const baseObj = getBaseForRole(catCode, roleIdx);

    // Стационарные техники частично выставляются на дежурные стоянки у терминалов
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

    // Построение маршрута для патрулирующих специалистов
    if (isPatrol) {
      if (isCustomMode && customElements.length > 0) {
        tempWorker.pathWaypoints = getCustomPatrolWaypoints(tempWorker, customElements, customConnections);
        if (tempWorker.pathWaypoints.length >= 2) {
          tempWorker.x = tempWorker.pathWaypoints[0].x;
          tempWorker.y = tempWorker.pathWaypoints[0].y;
        } else {
          tempWorker.status = 'FREE_STATIONARY';
          tempWorker.isPatrolPreference = false;
          tempWorker.pathWaypoints = undefined;
        }
      } else {
        tempWorker.pathWaypoints = getSvoPatrolWaypoints({ x: initX, y: initY }, baseObj.id);
        if (tempWorker.pathWaypoints.length > 0) {
          tempWorker.x = tempWorker.pathWaypoints[0].x;
          tempWorker.y = tempWorker.pathWaypoints[0].y;
        }
      }
      tempWorker.currentSegmentIndex = 0;
    }

    return tempWorker;
  };

  // 1. Создание инженеров B1 (силовые установки и планер)
  for (let i = 1; i <= b1Count; i++) {
    workers.push(createWorker('B1', 'ENGINES_AIRFRAME', 'b1', i));
  }

  // 2. Создание инженеров B2 (авионика и приборы)
  for (let i = 1; i <= b2Count; i++) {
    workers.push(createWorker('B2', 'AVIONICS', 'b2', i));
  }

  // 3. Создание авиатехников Cat A (линейные механики)
  for (let i = 1; i <= catACount; i++) {
    workers.push(createWorker('A', 'GENERAL_MECHANIC', 'a', i));
  }

  return workers;
}
