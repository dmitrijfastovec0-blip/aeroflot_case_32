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
    grid: '#121820',
    terminalFill: '#1c2533cc',
    terminalStroke: '#30363d',
    runwayFill: '#1f2937',
    runwayLine: '#374151',
    roadLine: '#1c2533',
    tunnelLine: '#388bfd',
    standBg: '#1e293b',
    standBorder: '#30363d',
    standText: '#ffffff',
    facilityBorder: '#d29922',
    facilityText: '#d29922',
    textSubtle: '#8b949e'
  },
  light: {
    bg: '#f1f5f9',
    grid: '#cbd5e1',
    terminalFill: '#cbd5e1cc',
    terminalStroke: '#64748b',
    runwayFill: '#94a3b8',
    runwayLine: '#64748b',
    roadLine: '#94a3b8',
    tunnelLine: '#0284c7',
    standBg: '#ffffff',
    standBorder: '#94a3b8',
    standText: '#0f172a',
    facilityBorder: '#d97706',
    facilityText: '#d97706',
    textSubtle: '#475569'
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

// Probable SVO Nodes Calibration List
export const SVO_NODES = [
  // 1. Север B/C (Стоянки B10, B14, C21, C25 и др.)
  { id: 'STAND_B10', label: 'B10', x: 26, y: 28, type: 'STAND', aircraftType: 'Airbus A320-200' },
  { id: 'STAND_B12', label: 'B12', x: 31, y: 28, type: 'STAND', aircraftType: 'Airbus A320neo' },
  { id: 'STAND_B14', label: 'B14', x: 36, y: 28, type: 'STAND', aircraftType: 'Superjet 100' },
  { id: 'STAND_C21', label: 'C21', x: 44, y: 18, type: 'STAND', aircraftType: 'Airbus A321neo' },
  { id: 'STAND_C25', label: 'C25', x: 50, y: 18, type: 'STAND', aircraftType: 'Boeing 737-800' },
  { id: 'STAND_C27', label: 'C27', x: 56, y: 18, type: 'STAND', aircraftType: 'Boeing 737-800' },

  // 2. Юг D/E/F (Стоянки D12, D18, D24, E38, F45)
  { id: 'STAND_D12', label: 'D12', x: 38, y: 60, type: 'STAND', aircraftType: 'Airbus A320-200' },
  { id: 'STAND_D14', label: 'D14', x: 44, y: 55, type: 'STAND', aircraftType: 'Airbus A321-200' },
  { id: 'STAND_D18', label: 'D18', x: 50, y: 50, type: 'STAND', aircraftType: 'Boeing 777-300ER' },
  { id: 'STAND_D24', label: 'D24', x: 56, y: 55, type: 'STAND', aircraftType: 'Airbus A350-900' },
  { id: 'STAND_E38', label: 'E38', x: 68, y: 70, type: 'STAND', aircraftType: 'Airbus A330-300' },
  { id: 'STAND_F45', label: 'F45', x: 78, y: 78, type: 'STAND', aircraftType: 'Boeing 737-800' },

  // 3. Дальний перрон ОТО / Ангарный сектор
  { id: 'STAND_101', label: 'St-101', x: 14, y: 18, type: 'STAND', aircraftType: 'Boeing 777-300ER' },
  { id: 'STAND_102', label: 'St-102', x: 20, y: 18, type: 'STAND', aircraftType: 'Airbus A330-300' },
  { id: 'STAND_105', label: 'St-105', x: 15, y: 35, type: 'STAND', aircraftType: 'Superjet 100' },
  { id: 'STAND_201', label: 'St-201', x: 88, y: 80, type: 'STAND', aircraftType: 'Boeing 777-300ER' },
  { id: 'STAND_204', label: 'St-204', x: 92, y: 88, type: 'STAND', aircraftType: 'Airbus A350-900' },

  // 4. Узлы перронных дорог (Waypoints)
  { id: 'WAY_N1', label: 'Северный проезд 1', x: 20, y: 25, type: 'WAYPOINT' },
  { id: 'WAY_N2', label: 'Северный проезд 2', x: 40, y: 25, type: 'WAYPOINT' },
  { id: 'WAY_N3', label: 'Северный проезд 3', x: 52, y: 25, type: 'WAYPOINT' },
  { id: 'WAY_S1', label: 'Южный проезд 1', x: 35, y: 65, type: 'WAYPOINT' },
  { id: 'WAY_S2', label: 'Южный проезд 2', x: 65, y: 75, type: 'WAYPOINT' },
  { id: 'WAY_S3', label: 'Южный проезд 3', x: 85, y: 85, type: 'WAYPOINT' },
  { id: 'WAY_TUNNEL_N', label: 'Вход в тоннель (Север)', x: 45, y: 35, type: 'WAYPOINT' },
  { id: 'WAY_TUNNEL_S', label: 'Выход из тоннеля (Юг)', x: 45, y: 45, type: 'WAYPOINT' }
];

export const SVO_EDGES = [
  // Северный комплекс (Терминалы B / C)
  { from: 'AK_4', to: 'STAND_101', type: 'ROAD', distance: 200 },
  { from: 'STAND_101', to: 'STAND_102', type: 'ROAD', distance: 220 },
  { from: 'STAND_101', to: 'STAND_105', type: 'ROAD', distance: 250 },
  { from: 'STAND_102', to: 'WAY_N1', type: 'ROAD', distance: 250 },
  { from: 'WAY_N1', to: 'STAND_105', type: 'ROAD', distance: 300 },
  { from: 'WAY_N1', to: 'PTO_1', type: 'ROAD', distance: 200 },
  { from: 'PTO_1', to: 'WAY_N2', type: 'ROAD', distance: 300 },
  { from: 'WAY_N1', to: 'STAND_B10', type: 'ROAD', distance: 150 },
  { from: 'STAND_B10', to: 'STAND_B12', type: 'ROAD', distance: 100 },
  { from: 'STAND_B12', to: 'STAND_B14', type: 'ROAD', distance: 100 },
  { from: 'PTO_1', to: 'STAND_B12', type: 'ROAD', distance: 100 },
  { from: 'PTO_1', to: 'STAND_B14', type: 'ROAD', distance: 120 },
  { from: 'STAND_B14', to: 'WAY_N2', type: 'ROAD', distance: 120 },
  { from: 'WAY_N2', to: 'WAY_N3', type: 'ROAD', distance: 300 },
  { from: 'WAY_N2', to: 'STAND_C21', type: 'ROAD', distance: 180 },
  { from: 'STAND_C21', to: 'STAND_C25', type: 'ROAD', distance: 120 },
  { from: 'STAND_C25', to: 'STAND_C27', type: 'ROAD', distance: 100 },
  { from: 'WAY_N3', to: 'STAND_C25', type: 'ROAD', distance: 150 },
  { from: 'WAY_N3', to: 'STAND_C27', type: 'ROAD', distance: 200 },

  // Южный комплекс (Терминалы D / E / F)
  { from: 'WAY_S1', to: 'PTO_2', type: 'ROAD', distance: 200 },
  { from: 'PTO_2', to: 'WAY_S2', type: 'ROAD', distance: 350 },
  { from: 'WAY_S2', to: 'WAY_S3', type: 'ROAD', distance: 450 },
  { from: 'WAY_S3', to: 'AK_1', type: 'ROAD', distance: 250 },
  { from: 'WAY_S3', to: 'STAND_201', type: 'ROAD', distance: 150 },
  { from: 'STAND_201', to: 'STAND_204', type: 'ROAD', distance: 180 },
  { from: 'AK_1', to: 'STAND_204', type: 'ROAD', distance: 180 },
  { from: 'WAY_S1', to: 'STAND_D12', type: 'ROAD', distance: 100 },
  { from: 'STAND_D12', to: 'STAND_D14', type: 'ROAD', distance: 100 },
  { from: 'STAND_D14', to: 'STAND_D18', type: 'ROAD', distance: 120 },
  { from: 'STAND_D18', to: 'STAND_D24', type: 'ROAD', distance: 120 },
  { from: 'WAY_S1', to: 'STAND_D14', type: 'ROAD', distance: 120 },
  { from: 'PTO_2', to: 'STAND_D18', type: 'ROAD', distance: 150 },
  { from: 'PTO_2', to: 'STAND_D24', type: 'ROAD', distance: 170 },
  { from: 'STAND_D24', to: 'WAY_S2', type: 'ROAD', distance: 150 },
  { from: 'WAY_S2', to: 'STAND_E38', type: 'ROAD', distance: 140 },
  { from: 'STAND_E38', to: 'STAND_F45', type: 'ROAD', distance: 180 },
  { from: 'WAY_S2', to: 'STAND_F45', type: 'ROAD', distance: 160 },

  // Межтерминальный тоннель (Север <-> Юг)
  { from: 'WAY_N2', to: 'WAY_TUNNEL_N', type: 'TUNNEL', distance: 300 },
  { from: 'WAY_TUNNEL_N', to: 'WAY_TUNNEL_S', type: 'TUNNEL', distance: 1200 },
  { from: 'WAY_TUNNEL_S', to: 'PTO_2', type: 'TUNNEL', distance: 250 }
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
