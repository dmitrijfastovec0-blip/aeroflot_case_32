import { Facility, Stand, CategoryCode, CrewRequirement } from '../types/index';

// Реэкспорт для обратной совместимости (RightPanel и др. импортируют из constants)
export type { CrewRequirement };

export const SVO_MAP_METERS = {
  width: 4000,
  height: 2800
};

// Canvas Theme Palette Definitions
export const CANVAS_THEMES = {
  dark: {
    bg: '#090d11',
    grid: 'rgba(255, 255, 255, 0.08)',
    terminalFill: 'rgba(28, 37, 51, 0.22)',
    terminalStroke: 'rgba(255, 255, 255, 0.10)',
    runwayFill: 'rgba(51, 65, 85, 0.35)',
    runwayLine: 'rgba(255, 255, 255, 0.12)',
    roadLine: '#334155',
    tunnelLine: '#0284c7',
    standBg: '#1e293b',
    standBorder: '#30363d',
    standText: '#ffffff',
    facilityBorder: '#d29922',
    facilityText: '#d29922',
    textSubtle: '#64748b'
  },
  light: {
    bg: '#f8fafc',
    grid: 'rgba(0, 0, 0, 0.06)',
    terminalFill: 'rgba(203, 213, 225, 0.30)',
    terminalStroke: 'rgba(0, 0, 0, 0.12)',
    runwayFill: 'rgba(148, 163, 184, 0.40)',
    runwayLine: 'rgba(0, 0, 0, 0.12)',
    roadLine: '#64748b',
    tunnelLine: '#0284c7',
    standBg: '#ffffff',
    standBorder: '#cbd5e1',
    standText: '#0f172a',
    facilityBorder: '#d97706',
    facilityText: '#d97706',
    textSubtle: '#64748b'
  }
};

export const SVO_BUILDINGS = [
  // Северный комплекс (СТК)
  { id: 'TERM_B', name: 'Терминал B', points: [{x:24, y:19}, {x:31, y:19}, {x:31, y:22}, {x:34, y:22}, {x:34, y:26}, {x:29, y:26}, {x:29, y:23}, {x:24, y:23}] },
  { id: 'TERM_C', name: 'Терминал C', points: [{x:35, y:19}, {x:58, y:19}, {x:58, y:24}, {x:52, y:24}, {x:52, y:28}, {x:47, y:28}, {x:47, y:24}, {x:35, y:24}] },
  { id: 'TERM_C_PIER', name: 'Пирс терминала C', points: [{x:52, y:28}, {x:66, y:28}, {x:66, y:31}, {x:52, y:31}] },

  // Южный комплекс (ЮТК) - Полусфера D и крылья E, F
  { id: 'TERM_D_DOME', name: 'Терминал D (Полусфера)', type: 'ARC', center: {x:50, y:67}, radius: 10, startAngle: 0.9 * Math.PI, endAngle: 2.1 * Math.PI },
  { id: 'TERM_D_PIER', name: 'Пирс Терминала D', points: [{x:47, y:55}, {x:53, y:55}, {x:53, y:59}, {x:47, y:59}] },
  { id: 'TERM_E', name: 'Терминал E', points: [{x:58, y:68}, {x:68, y:72}, {x:67, y:75}, {x:57, y:71}] },
  { id: 'TERM_F', name: 'Терминал F', points: [{x:68, y:72}, {x:80, y:82}, {x:77, y:85}, {x:65, y:75}] },

  // Взлётно-посадочные полосы (ВПП) - фактическая геометрия 06L/24R и 06R/24L
  { id: 'RWY_1', name: '06L/24R', points: [{x:4, y:8}, {x:62, y:4}] },
  { id: 'RWY_2', name: '06R/24L', points: [{x:10, y:13}, {x:66, y:9}] }
];

export const SVO_FACILITIES = [
  { id: 'PTO_1', name: 'ПТО-1 СТК (B/C)', code: 'ПТО-1', x: 32, y: 23, type: 'DUTY_STATION' },
  { id: 'AK_4', name: 'АК-4 «Аэрофлот Техникс»', code: 'АК-4', x: 18, y: 12, type: 'HANGAR' },
  { id: 'PTO_2', name: 'ПТО-2 ЮТК (D/E/F)', code: 'ПТО-2', x: 50, y: 68, type: 'DUTY_STATION' },
  { id: 'AK_1', name: 'АК-1/2 Главный Техцентр', code: 'АК-1', x: 82, y: 88, type: 'HANGAR' }
];

// Sheremetyevo International Airport (SVO) Realistic Topology Nodes
// Clean backbone arterial ring & taxiway service roads connecting North (STK) and South (YUTK)
export const SVO_NODES = [
  // 1. СЕВЕРНЫЙ КОМПЛЕКС (СТК) - ТЕРМИНАЛЫ B & C
  { id: 'STAND_B10', label: 'B10', x: 26, y: 28, type: 'STAND', aircraftType: 'Airbus A320-200' },
  { id: 'STAND_B12', label: 'B12', x: 31, y: 28, type: 'STAND', aircraftType: 'Airbus A320neo' },
  { id: 'STAND_B14', label: 'B14', x: 36, y: 28, type: 'STAND', aircraftType: 'Superjet 100' },
  { id: 'STAND_C21', label: 'C21', x: 44, y: 18, type: 'STAND', aircraftType: 'Airbus A321neo' },
  { id: 'STAND_C25', label: 'C25', x: 50, y: 18, type: 'STAND', aircraftType: 'Boeing 737-800' },
  { id: 'STAND_C27', label: 'C27', x: 56, y: 18, type: 'STAND', aircraftType: 'Boeing 737-800' },

  // 2. ЮЖНЫЙ КОМПЛЕКС (ЮТК) - ТЕРМИНАЛЫ D, E & F
  { id: 'STAND_D12', label: 'D12', x: 38, y: 60, type: 'STAND', aircraftType: 'Airbus A320-200' },
  { id: 'STAND_D14', label: 'D14', x: 44, y: 55, type: 'STAND', aircraftType: 'Airbus A321-200' },
  { id: 'STAND_D18', label: 'D18', x: 50, y: 50, type: 'STAND', aircraftType: 'Boeing 777-300ER' },
  { id: 'STAND_D24', label: 'D24', x: 56, y: 55, type: 'STAND', aircraftType: 'Airbus A350-900' },
  { id: 'STAND_E38', label: 'E38', x: 68, y: 70, type: 'STAND', aircraftType: 'Airbus A330-300' },
  { id: 'STAND_F45', label: 'F45', x: 78, y: 78, type: 'STAND', aircraftType: 'Boeing 737-800' },

  // 3. ДАЛЬНИЕ СТОЯНКИ И АНГАРНЫЙ СЕКТОР (АК-4 & АК-1)
  { id: 'STAND_101', label: 'St-101', x: 14, y: 18, type: 'STAND', aircraftType: 'Boeing 777-300ER' },
  { id: 'STAND_102', label: 'St-102', x: 20, y: 18, type: 'STAND', aircraftType: 'Airbus A330-300' },
  { id: 'STAND_105', label: 'St-105', x: 15, y: 35, type: 'STAND', aircraftType: 'Superjet 100' },
  { id: 'STAND_201', label: 'St-201', x: 88, y: 80, type: 'STAND', aircraftType: 'Boeing 777-300ER' },
  { id: 'STAND_204', label: 'St-204', x: 92, y: 88, type: 'STAND', aircraftType: 'Airbus A350-900' },

  // 4. СЕТЬ ПЕРРОННЫХ АВТОДОРОГ (АРТЕРИАЛЬНЫЕ УЗЛЫ ВДОЛЬ РУЛЁЖЕК)
  { id: 'WAY_AK4', label: 'Выезд АК-4', x: 18, y: 18, type: 'WAYPOINT' },
  { id: 'WAY_N_WEST', label: 'Западная рулёжная магистраль (Север)', x: 24, y: 23, type: 'WAYPOINT' },
  { id: 'WAY_N_MID', label: 'Центральная перронная магистраль B/C', x: 38, y: 23, type: 'WAYPOINT' },
  { id: 'WAY_N_EAST', label: 'Восточный объезд Терминала C', x: 58, y: 23, type: 'WAYPOINT' },
  
  { id: 'WAY_TUNNEL_N', label: 'Северный портал тоннеля МТК', x: 45, y: 35, type: 'WAYPOINT' },
  { id: 'WAY_TUNNEL_S', label: 'Южный портал тоннеля МТК', x: 45, y: 45, type: 'WAYPOINT' },
  
  { id: 'WAY_S_WEST', label: 'Западный объезд Терминала D', x: 38, y: 68, type: 'WAYPOINT' },
  { id: 'WAY_S_MID', label: 'Центральная развязка ЮТК (ПТО-2)', x: 50, y: 68, type: 'WAYPOINT' },
  { id: 'WAY_S_EAST', label: 'Восточный кольцевой проезд E/F', x: 68, y: 78, type: 'WAYPOINT' },
  { id: 'WAY_AK1', label: 'Подъезд к АК-1/2', x: 82, y: 82, type: 'WAYPOINT' }
];

// Clean road graph layout: clear arterial spine with branch connections to each stand
export const SVO_EDGES = [
  // --- СЕВЕРНЫЙ СЕКТОР (СТК) ---
  // Ангар АК-4 -> Западная магистраль -> Стоянки 101, 102, 105
  { from: 'AK_4', to: 'WAY_AK4', type: 'ROAD', distance: 100 },
  { from: 'WAY_AK4', to: 'STAND_101', type: 'ROAD', distance: 120 },
  { from: 'WAY_AK4', to: 'STAND_105', type: 'ROAD', distance: 150 },
  { from: 'STAND_101', to: 'STAND_102', type: 'ROAD', distance: 100 },
  { from: 'STAND_102', to: 'WAY_N_WEST', type: 'ROAD', distance: 150 },
  { from: 'WAY_AK4', to: 'WAY_N_WEST', type: 'ROAD', distance: 180 },

  // Главный Северный хребет (WAY_N_WEST <-> PTO_1 <-> WAY_N_MID <-> WAY_N_EAST)
  { from: 'WAY_N_WEST', to: 'PTO_1', type: 'ROAD', distance: 200 },
  { from: 'PTO_1', to: 'WAY_N_MID', type: 'ROAD', distance: 180 },
  { from: 'WAY_N_MID', to: 'WAY_N_EAST', type: 'ROAD', distance: 300 },

  // Ответвления к стоянкам Терминала B (B10, B12, B14)
  { from: 'WAY_N_WEST', to: 'STAND_B10', type: 'ROAD', distance: 140 },
  { from: 'PTO_1', to: 'STAND_B12', type: 'ROAD', distance: 120 },
  { from: 'WAY_N_MID', to: 'STAND_B14', type: 'ROAD', distance: 130 },

  // Ответвления к стоянкам Терминала C (C21, C25, C27)
  { from: 'WAY_N_MID', to: 'STAND_C21', type: 'ROAD', distance: 150 },
  { from: 'WAY_N_EAST', to: 'STAND_C25', type: 'ROAD', distance: 160 },
  { from: 'WAY_N_EAST', to: 'STAND_C27', type: 'ROAD', distance: 140 },

  // Вход в межтерминальный тоннель (МТК) со стороны Севера
  { from: 'WAY_N_MID', to: 'WAY_TUNNEL_N', type: 'ROAD', distance: 250 },
  { from: 'PTO_1', to: 'WAY_TUNNEL_N', type: 'ROAD', distance: 280 },

  // --- МЕЖТЕРМИНАЛЬНЫЙ СВЯЗНОЙ ТОННЕЛЬ (МТК) ---
  { from: 'WAY_TUNNEL_N', to: 'WAY_TUNNEL_S', type: 'TUNNEL', distance: 1200 },

  // --- ЮЖНЫЙ СЕКТОР (ЮТК) ---
  // Выход из тоннеля -> Главный Южный развязочный узел (WAY_S_MID / ПТО-2)
  { from: 'WAY_TUNNEL_S', to: 'PTO_2', type: 'ROAD', distance: 200 },
  { from: 'PTO_2', to: 'WAY_S_MID', type: 'ROAD', distance: 80 },

  // Главный Южный хребет (WAY_S_WEST <-> WAY_S_MID <-> WAY_S_EAST <-> WAY_AK1)
  { from: 'WAY_S_WEST', to: 'WAY_S_MID', type: 'ROAD', distance: 240 },
  { from: 'WAY_S_MID', to: 'WAY_S_EAST', type: 'ROAD', distance: 300 },
  { from: 'WAY_S_EAST', to: 'WAY_AK1', type: 'ROAD', distance: 250 },
  { from: 'WAY_AK1', to: 'AK_1', type: 'ROAD', distance: 120 },

  // Ответвления к стоянкам Терминала D (D12, D14, D18, D24)
  { from: 'WAY_S_WEST', to: 'STAND_D12', type: 'ROAD', distance: 160 },
  { from: 'WAY_S_WEST', to: 'STAND_D14', type: 'ROAD', distance: 180 },
  { from: 'WAY_S_MID', to: 'STAND_D18', type: 'ROAD', distance: 200 },
  { from: 'WAY_S_MID', to: 'STAND_D24', type: 'ROAD', distance: 170 },

  // Ответвления к стоянкам Терминалов E и F (E38, F45)
  { from: 'WAY_S_EAST', to: 'STAND_E38', type: 'ROAD', distance: 150 },
  { from: 'WAY_S_EAST', to: 'STAND_F45', type: 'ROAD', distance: 180 },

  // Ответвления к южному ангарному сектору (St-201, St-204)
  { from: 'WAY_AK1', to: 'STAND_201', type: 'ROAD', distance: 130 },
  { from: 'WAY_AK1', to: 'STAND_204', type: 'ROAD', distance: 150 }
];

export const REAL_SVO_FACILITIES: Facility[] = SVO_FACILITIES.map(f => ({
  id: f.id,
  name: f.name,
  code: f.code,
  complex: f.y < 45 ? 'NORTH' : 'SOUTH',
  x: f.x,
  y: f.y,
  type: f.type === 'HANGAR' ? 'HANGAR_BASE' : 'DUTY_STATION'
}));

export const SVO_STANDS: Stand[] = SVO_NODES.filter(n => n.type === 'STAND').map(s => ({
  id: s.id,
  label: s.label,
  complex: s.y < 45 ? 'NORTH' : s.x > 80 ? 'REMOTE' : 'SOUTH',
  x: s.x,
  y: s.y,
  aircraftType: s.aircraftType || 'Airbus A320-200',
  airline: 'ПАО «Аэрофлот»'
}));

export const REALISTIC_SVO_CONFIG = {
  totalWorkersInShift: 40,
  qualificationsRatio: {
    ENGINES_AIRFRAME: 0.55,
    AVIONICS: 0.30,
    GENERAL_MECHANIC: 0.15
  },
  availableVehicles: 20,
  reglamentMaxTimeMinutes: 15.0,
  speeds: {
    pedestrianKmH: 4.5,
    apronVehicleKmH: 20.0,
    interTerminalShuttleKmH: 40.0
  },
  penaltiesSec: {
    pedestrian: 0,
    apronVehicle: 60,
    interTerminalShuttle: 120
  }
};

export const TECHNICIAN_NAMES = [
  'Иванов А. В.', 'Петров С. И.', 'Сидоров М. Е.', 'Смирнов Д. А.', 'Кузнецов В. П.',
  'Попов Е. В.', 'Васильев Н. О.', 'Соколов И. К.', 'Михайлов А. Г.', 'Новиков П. Д.',
  'Федоров С. С.', 'Морозов А. И.', 'Волков В. В.', 'Алексеев Д. М.', 'Лебедев К. А.'
];

// Каталог типов неисправностей ВС -> требуемая квалификация
// По стандарту ATA Specification 100 (главы 24/32/34/49/72).
// categoryCode — основная квалификация для диспетчера; requiredCrew — полный
// регламентный состав бригады для данной главы ATA (количество по каждой Cat).
export interface DefectType {
  id: string;
  name: string;
  ataLabel: string;
  categoryCode: CategoryCode;
  requiredCrew: CrewRequirement[];
  description: string;
}

export const DEFECT_TYPES: DefectType[] = [
  {
    id: 'ATA24', name: 'Электрическое питание / генераторы', ataLabel: 'ATA 24',
    categoryCode: 'B2', requiredCrew: [{ categoryCode: 'B2', count: 1 }],
    description: 'Бортовая сеть, ВСУ, генераторы — требуется B2 Авионика'
  },
  {
    id: 'ATA32', name: 'Шасси и тормоза', ataLabel: 'ATA 32',
    categoryCode: 'B1', requiredCrew: [{ categoryCode: 'B1', count: 1 }],
    description: 'Стойки, колеса, тормозная система — требуется B1 Механика'
  },
  {
    id: 'ATA34', name: 'Навигация и авионика', ataLabel: 'ATA 34',
    categoryCode: 'B2', requiredCrew: [{ categoryCode: 'B2', count: 1 }],
    description: 'Электроника, дисплеи, системы навигации — требуется B2 Авионика'
  },
  {
    id: 'ATA49', name: 'Аварийный ВСУ (APU Emergency)', ataLabel: 'ATA 49',
    categoryCode: 'B1', requiredCrew: [{ categoryCode: 'B1', count: 1 }, { categoryCode: 'A', count: 1 }],
    description: 'Вспомогательная силовая установка — требуется B1 + Cat A'
  },
  {
    id: 'ATA72', name: 'Работа двигателя', ataLabel: 'ATA 72',
    categoryCode: 'B1', requiredCrew: [{ categoryCode: 'B1', count: 2 }, { categoryCode: 'A', count: 1 }],
    description: 'Силовая установка, узлы крепления — требуется 2× B1 + Cat A'
  }
];

// Справочная стоимость простоя ВС (₽/мин) для экономического обоснования
// Значение настраиваемое — команда подставляет обоснованную оценку для ПАО «Аэрофлот».
export const AIRCRAFT_DOWNTIME_COST_PER_MIN = 13500;
