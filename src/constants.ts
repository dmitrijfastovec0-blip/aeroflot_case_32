import { Facility, Stand, ThemeMode } from './types';

export const SVO_MAP_METERS = {
  width: 4000,
  height: 2800
};

// Canvas Theme Palette Definitions
export const CANVAS_THEMES = {
  dark: {
    bg: '#090d11',
    grid: '#121820',
    terminalFill: '#1c2533',
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
    terminalFill: '#cbd5e1',
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
  { id: 'TERM_B', name: 'Терминал B', points: [{x:25, y:20}, {x:38, y:20}, {x:38, y:26}, {x:35, y:26}, {x:35, y:22}, {x:28, y:22}, {x:28, y:26}, {x:25, y:26}] },
  { id: 'TERM_C', name: 'Терминал C', points: [{x:38, y:20}, {x:58, y:20}, {x:58, y:24}, {x:38, y:24}] },

  // Южный комплекс (ЮТК) - Полусфера D и крылья E, F
  { id: 'TERM_D_DOME', name: 'Терминал D (Полусфера)', type: 'ARC', center: {x:50, y:65}, radius: 10, startAngle: 0.8 * Math.PI, endAngle: 2.2 * Math.PI },
  { id: 'TERM_D_PIER', name: 'Пирс Терминала D', points: [{x:48, y:55}, {x:52, y:55}, {x:52, y:65}, {x:48, y:65}] },
  { id: 'TERM_E', name: 'Терминал E', points: [{x:58, y:68}, {x:68, y:72}, {x:67, y:75}, {x:57, y:71}] },
  { id: 'TERM_F', name: 'Терминал F', points: [{x:68, y:72}, {x:80, y:82}, {x:77, y:85}, {x:65, y:75}] },

  // Взлетно-посадочные полосы (ВПП)
  { id: 'RWY_1', name: 'ВПП-1 (06L/24R)', points: [{x:10, y:10}, {x:50, y:5}] },
  { id: 'RWY_2', name: 'ВПП-2 (06R/24L)', points: [{x:15, y:15}, {x:55, y:10}] }
];

export const SVO_FACILITIES = [
  { id: 'PTO_1', name: 'ПТО-1 СТК (B/C)', code: 'ПТО-1', x: 32, y: 23, type: 'DUTY_STATION' },
  { id: 'AK_4', name: 'АК-4 «Аэрофлот Техникс»', code: 'АК-4', x: 18, y: 12, type: 'HANGAR' },
  { id: 'PTO_2', name: 'ПТО-2 ЮТК (D/E/F)', code: 'ПТО-2', x: 50, y: 68, type: 'DUTY_STATION' },
  { id: 'AK_1', name: 'АК-1/2 Главный Техцентр', code: 'АК-1', x: 82, y: 88, type: 'HANGAR' }
];

// 20 Ключевых Стоянок ВС Шереметьево
export const SVO_NODES = [
  // 1. Север B/C (6 стоянок)
  { id: 'STAND_B10', label: 'B10', x: 26, y: 28, type: 'STAND', aircraftType: 'Airbus A320-200' },
  { id: 'STAND_B12', label: 'B12', x: 31, y: 28, type: 'STAND', aircraftType: 'Airbus A320neo' },
  { id: 'STAND_B14', label: 'B14', x: 36, y: 28, type: 'STAND', aircraftType: 'Superjet 100' },
  { id: 'STAND_C21', label: 'C21', x: 44, y: 18, type: 'STAND', aircraftType: 'Airbus A321neo' },
  { id: 'STAND_C23', label: 'C23', x: 50, y: 18, type: 'STAND', aircraftType: 'Boeing 737-800' },
  { id: 'STAND_C27', label: 'C27', x: 56, y: 18, type: 'STAND', aircraftType: 'Boeing 737-800' },

  // 2. Юг D/E/F (6 стоянок)
  { id: 'STAND_D12', label: 'D12', x: 38, y: 60, type: 'STAND', aircraftType: 'Airbus A320-200' },
  { id: 'STAND_D14', label: 'D14', x: 44, y: 55, type: 'STAND', aircraftType: 'Airbus A321-200' },
  { id: 'STAND_D18', label: 'D18', x: 50, y: 50, type: 'STAND', aircraftType: 'Boeing 777-300ER' },
  { id: 'STAND_D22', label: 'D22', x: 56, y: 55, type: 'STAND', aircraftType: 'Airbus A350-900' },
  { id: 'STAND_E38', label: 'E38', x: 68, y: 70, type: 'STAND', aircraftType: 'Airbus A330-300' },
  { id: 'STAND_F45', label: 'F45', x: 78, y: 78, type: 'STAND', aircraftType: 'Boeing 737-800' },

  // 3. Дальний перрон ОТО / Ангарный сектор (5 стоянок)
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
  { from: 'AK_4', to: 'STAND_101', type: 'ROAD', distance: 200 },
  { from: 'STAND_101', to: 'STAND_102', type: 'ROAD', distance: 220 },
  { from: 'STAND_102', to: 'WAY_N1', type: 'ROAD', distance: 250 },
  { from: 'WAY_N1', to: 'STAND_105', type: 'ROAD', distance: 300 },
  { from: 'WAY_N1', to: 'PTO_1', type: 'ROAD', distance: 350 },
  { from: 'PTO_1', to: 'WAY_N2', type: 'ROAD', distance: 300 },
  { from: 'WAY_N1', to: 'STAND_B10', type: 'ROAD', distance: 150 },
  { from: 'PTO_1', to: 'STAND_B12', type: 'ROAD', distance: 100 },
  { from: 'PTO_1', to: 'STAND_B14', type: 'ROAD', distance: 120 },
  { from: 'WAY_N2', to: 'WAY_N3', type: 'ROAD', distance: 300 },
  { from: 'WAY_N2', to: 'STAND_C21', type: 'ROAD', distance: 180 },
  { from: 'WAY_N3', to: 'STAND_C23', type: 'ROAD', distance: 150 },
  { from: 'WAY_N3', to: 'STAND_C27', type: 'ROAD', distance: 200 },

  { from: 'WAY_S1', to: 'PTO_2', type: 'ROAD', distance: 250 },
  { from: 'PTO_2', to: 'WAY_S2', type: 'ROAD', distance: 350 },
  { from: 'WAY_S2', to: 'WAY_S3', type: 'ROAD', distance: 450 },
  { from: 'WAY_S3', to: 'AK_1', type: 'ROAD', distance: 250 },
  { from: 'WAY_S3', to: 'STAND_201', type: 'ROAD', distance: 150 },
  { from: 'AK_1', to: 'STAND_204', type: 'ROAD', distance: 180 },
  { from: 'WAY_S1', to: 'STAND_D12', type: 'ROAD', distance: 100 },
  { from: 'WAY_S1', to: 'STAND_D14', type: 'ROAD', distance: 120 },
  { from: 'PTO_2', to: 'STAND_D18', type: 'ROAD', distance: 150 },
  { from: 'PTO_2', to: 'STAND_D22', type: 'ROAD', distance: 170 },
  { from: 'WAY_S2', to: 'STAND_E38', type: 'ROAD', distance: 140 },
  { from: 'WAY_S2', to: 'STAND_F45', type: 'ROAD', distance: 160 },

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
