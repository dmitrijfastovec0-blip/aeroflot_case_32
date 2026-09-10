/**
 * ============================================================================
 * ИНТЕРАКТИВНЫЙ КОНСТРУКТОР ПОЛЬЗОВАТЕЛЬСКИХ АЭРОДРОМОВ (LOCATION BUILDER)
 * ----------------------------------------------------------------------------
 * Рабочая среда (CAD-workspace) для свободного проектирования перронов:
 * - Создание стоянок (STAND), баз ПТО (DUTY_STATION), ангаров (HANGAR),
 *   паркингов спецтехники (PARKING), терминалов (TERMINAL) и ВПП (RUNWAY).
 * - Соединение объектов дорожной сетью перрона (ROAD, TAXIWAY, SERVICE).
 * - Проверка топологической связности графа и готовности к симуляции.
 * - Экспорт/импорт полигонов для испытаний алгоритмов диспетчеризации.
 * ============================================================================
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { AirportConnection, AirportConnectionKind, AirportElement, AirportElementKind, ThemeMode } from '../types';
import {

  Box,
  Building2,
  CircleDot,
  ParkingCircle,
  GitBranch,
  Map as MapIcon,
  MousePointer2,
  Play,
  Trash2,
  X,
  Sparkles,
  Plane,
  Sliders,
  Layers,
  Wrench,
  Link,
  Split,
  Undo2
} from 'lucide-react';

interface Props {
  initialElements: AirportElement[];
  initialConnections: AirportConnection[];
  onElementsChange: (elements: AirportElement[]) => void;
  onConnectionsChange: (connections: AirportConnection[]) => void;
  onClose: () => void;
  theme: ThemeMode;
  onOpenShift: () => void;
  onRunSimulation: (elements: AirportElement[], connections: AirportConnection[]) => void;
}

const TOOLS: { kind: AirportElementKind; label: string; shortcut: string; icon: React.ReactNode }[] = [
  { kind: 'STAND', label: 'Стоянка ВС', shortcut: '1', icon: <Plane className="h-4 w-4 text-sky-400" /> },
  { kind: 'DUTY_STATION', label: 'Пункт ПТО', shortcut: '2', icon: <Wrench className="h-4 w-4 text-amber-400" /> },
  { kind: 'PARKING', label: 'Автопарк', shortcut: '3', icon: <ParkingCircle className="h-4 w-4 text-yellow-400" /> },
  { kind: 'TERMINAL', label: 'Терминал', shortcut: '4', icon: <Building2 className="h-4 w-4 text-blue-400" /> },
  { kind: 'HANGAR', label: 'Ангар ТОиР', shortcut: '5', icon: <Box className="h-4 w-4 text-indigo-400" /> },
  { kind: 'RUNWAY', label: 'ВПП', shortcut: '6', icon: <MapIcon className="h-4 w-4 text-emerald-400" /> },
  { kind: 'WAYPOINT', label: 'Узел поворота', shortcut: '7', icon: <CircleDot className="h-4 w-4 text-cyan-400" /> }
];

const CONNECTIONS: { kind: AirportConnectionKind; label: string; color: string; shortcut: string }[] = [
  { kind: 'ROAD', label: 'Автодорога', color: '#38bdf8', shortcut: 'R' },
  { kind: 'TUNNEL', label: 'Тоннель', color: '#f59e0b', shortcut: 'T' }
];

const AIRCRAFT_TYPES = [
  'Airbus A320-200',
  'Boeing 737-800',
  'Boeing 777-300ER',
  'МС-21-300',
  'SSJ-100'
];

export const LocationBuilderWorkspace: React.FC<Props> = ({
  initialElements,
  initialConnections,
  onElementsChange,
  onConnectionsChange,
  onClose,
  theme,
  onOpenShift,
  onRunSimulation
}) => {
  const [elements, setElements] = useState<AirportElement[]>(initialElements);
  const [connections, setConnections] = useState<AirportConnection[]>(initialConnections);

  useEffect(() => {
    if (initialElements.length > 0) {
      setElements(initialElements);
    }
  }, [initialElements]);

  useEffect(() => {
    if (initialConnections.length > 0) {
      setConnections(initialConnections);
    }
  }, [initialConnections]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  
  // Tools: 'SELECT' | 'PLACE' | 'ROAD' | 'TUNNEL'
  const [tool, setTool] = useState<'SELECT' | 'PLACE' | 'ROAD' | 'TUNNEL'>('SELECT');
  const [placementKind, setPlacementKind] = useState<AirportElementKind | null>(null);
  
  // Chained connection drawing
  const [routeStartId, setRouteStartId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const [autoConnect, setAutoConnect] = useState(false);

  const selected = elements.find(item => item.id === selectedId);
  const selectedConnection = connections.find(c => c.id === selectedConnectionId);
  const routeStartElement = elements.find(item => item.id === routeStartId);

  const panel = theme === 'dark' ? 'bg-[#0b131f]/95 border-[#263345] text-gray-100' : 'bg-white/95 border-slate-200 text-slate-900';

  const flushToApp = useCallback(() => {
    onElementsChange(elements);
    onConnectionsChange(connections);
  }, [elements, connections, onElementsChange, onConnectionsChange]);

  // --- PRESETS / TEMPLATES GENERATOR ---
  const applyPreset = (presetName: 'TYPICAL' | 'HUB' | 'COMPACT' | 'LINEAR' | 'CROSS_HUB' | 'MRO_CARGO') => {
    let newElements: AirportElement[] = [];
    let newConnections: AirportConnection[] = [];

    if (presetName === 'TYPICAL') {
      newElements = [
        { id: 'CUST-RWY-1', kind: 'RUNWAY', label: 'ВПП 06L/24R', x: 50, y: 12, width: 76, height: 4 },
        { id: 'CUST-TERM-1', kind: 'TERMINAL', label: 'Терминал А', x: 50, y: 26, width: 28, height: 8 },
        { id: 'CUST-PTO-1', kind: 'DUTY_STATION', label: 'ПТО-1', x: 28, y: 64, width: 8, height: 6 },
        { id: 'CUST-PARK-1', kind: 'PARKING', label: 'Автопарк спецтехники', x: 50, y: 68, width: 12, height: 6 },
        { id: 'CUST-HANG-1', kind: 'HANGAR', label: 'Ангар ТОиР', x: 72, y: 64, width: 14, height: 7 },
        { id: 'CUST-ST-1', kind: 'STAND', label: '101', aircraftType: 'Airbus A320-200', x: 18, y: 38, width: 7, height: 5 },
        { id: 'CUST-ST-2', kind: 'STAND', label: '102', aircraftType: 'Boeing 737-800', x: 28, y: 38, width: 7, height: 5 },
        { id: 'CUST-ST-3', kind: 'STAND', label: '103', aircraftType: 'МС-21-300', x: 40, y: 38, width: 7, height: 5 },
        { id: 'CUST-ST-4', kind: 'STAND', label: '104', aircraftType: 'SSJ-100', x: 60, y: 38, width: 7, height: 5 },
        { id: 'CUST-ST-5', kind: 'STAND', label: '105', aircraftType: 'Boeing 777-300ER', x: 72, y: 38, width: 7, height: 5 },
        { id: 'CUST-ST-6', kind: 'STAND', label: '106', aircraftType: 'Airbus A320-200', x: 82, y: 38, width: 7, height: 5 }
      ];

      newConnections = [
        { id: 'L-1', from: 'CUST-ST-1', to: 'CUST-ST-2', kind: 'ROAD' },
        { id: 'L-2', from: 'CUST-ST-2', to: 'CUST-ST-3', kind: 'ROAD' },
        { id: 'L-3', from: 'CUST-ST-3', to: 'CUST-ST-4', kind: 'ROAD' },
        { id: 'L-4', from: 'CUST-ST-4', to: 'CUST-ST-5', kind: 'ROAD' },
        { id: 'L-5', from: 'CUST-ST-5', to: 'CUST-ST-6', kind: 'ROAD' },
        { id: 'L-6', from: 'CUST-ST-2', to: 'CUST-PTO-1', kind: 'ROAD' },
        { id: 'L-7', from: 'CUST-ST-3', to: 'CUST-PARK-1', kind: 'ROAD' },
        { id: 'L-8', from: 'CUST-ST-4', to: 'CUST-PARK-1', kind: 'ROAD' },
        { id: 'L-9', from: 'CUST-ST-5', to: 'CUST-HANG-1', kind: 'ROAD' },
        { id: 'L-10', from: 'CUST-PTO-1', to: 'CUST-PARK-1', kind: 'ROAD' },
        { id: 'L-11', from: 'CUST-PARK-1', to: 'CUST-HANG-1', kind: 'ROAD' }
      ];
    } else if (presetName === 'HUB') {
      newElements = [
        { id: 'HUB-RWY-N', kind: 'RUNWAY', label: 'ВПП 06L/24R', x: 50, y: 10, width: 80, height: 4 },
        { id: 'HUB-RWY-S', kind: 'RUNWAY', label: 'ВПП 06R/24L', x: 50, y: 90, width: 80, height: 4 },
        { id: 'HUB-TERM-N', kind: 'TERMINAL', label: 'Терминал B (Север)', x: 30, y: 22, width: 22, height: 7 },
        { id: 'HUB-TERM-S', kind: 'TERMINAL', label: 'Терминал C (Юг)', x: 70, y: 22, width: 22, height: 7 },
        { id: 'HUB-PTO-1', kind: 'DUTY_STATION', label: 'ПТО-1', x: 25, y: 58, width: 8, height: 6 },
        { id: 'HUB-PTO-2', kind: 'DUTY_STATION', label: 'ПТО-2', x: 75, y: 58, width: 8, height: 6 },
        { id: 'HUB-PARK', kind: 'PARKING', label: 'Автопарк спецтехники', x: 50, y: 72, width: 12, height: 6 },
        { id: 'HUB-HANGAR', kind: 'HANGAR', label: 'Ангарный комплекс', x: 50, y: 50, width: 16, height: 8 },
        { id: 'HUB-ST-1', kind: 'STAND', label: 'N01', aircraftType: 'Airbus A320-200', x: 14, y: 34, width: 7, height: 5 },
        { id: 'HUB-ST-2', kind: 'STAND', label: 'N02', aircraftType: 'Boeing 737-800', x: 24, y: 34, width: 7, height: 5 },
        { id: 'HUB-ST-3', kind: 'STAND', label: 'N03', aircraftType: 'МС-21-300', x: 34, y: 34, width: 7, height: 5 },
        { id: 'HUB-ST-4', kind: 'STAND', label: 'N04', aircraftType: 'SSJ-100', x: 44, y: 34, width: 7, height: 5 },
        { id: 'HUB-ST-5', kind: 'STAND', label: 'S01', aircraftType: 'Boeing 777-300ER', x: 56, y: 34, width: 7, height: 5 },
        { id: 'HUB-ST-6', kind: 'STAND', label: 'S02', aircraftType: 'Airbus A320-200', x: 66, y: 34, width: 7, height: 5 },
        { id: 'HUB-ST-7', kind: 'STAND', label: 'S03', aircraftType: 'Boeing 737-800', x: 76, y: 34, width: 7, height: 5 },
        { id: 'HUB-ST-8', kind: 'STAND', label: 'S04', aircraftType: 'МС-21-300', x: 86, y: 34, width: 7, height: 5 }
      ];

      newConnections = [
        { id: 'HL-1', from: 'HUB-ST-1', to: 'HUB-ST-2', kind: 'ROAD' },
        { id: 'HL-2', from: 'HUB-ST-2', to: 'HUB-ST-3', kind: 'ROAD' },
        { id: 'HL-3', from: 'HUB-ST-3', to: 'HUB-ST-4', kind: 'ROAD' },
        { id: 'HL-4', from: 'HUB-ST-4', to: 'HUB-ST-5', kind: 'TUNNEL' },
        { id: 'HL-5', from: 'HUB-ST-5', to: 'HUB-ST-6', kind: 'ROAD' },
        { id: 'HL-6', from: 'HUB-ST-6', to: 'HUB-ST-7', kind: 'ROAD' },
        { id: 'HL-7', from: 'HUB-ST-7', to: 'HUB-ST-8', kind: 'ROAD' },
        { id: 'HL-8', from: 'HUB-ST-2', to: 'HUB-PTO-1', kind: 'ROAD' },
        { id: 'HL-9', from: 'HUB-ST-7', to: 'HUB-PTO-2', kind: 'ROAD' },
        { id: 'HL-10', from: 'HUB-ST-4', to: 'HUB-HANGAR', kind: 'ROAD' },
        { id: 'HL-11', from: 'HUB-ST-5', to: 'HUB-HANGAR', kind: 'ROAD' },
        { id: 'HL-12', from: 'HUB-PTO-1', to: 'HUB-HANGAR', kind: 'ROAD' },
        { id: 'HL-13', from: 'HUB-PTO-2', to: 'HUB-HANGAR', kind: 'ROAD' },
        { id: 'HL-14', from: 'HUB-PTO-1', to: 'HUB-PARK', kind: 'ROAD' },
        { id: 'HL-15', from: 'HUB-PTO-2', to: 'HUB-PARK', kind: 'ROAD' },
        { id: 'HL-16', from: 'HUB-HANGAR', to: 'HUB-PARK', kind: 'ROAD' }
      ];
    } else if (presetName === 'COMPACT') {
      newElements = [
        { id: 'CMP-TERM', kind: 'TERMINAL', label: 'Терминал', x: 50, y: 22, width: 22, height: 7 },
        { id: 'CMP-PTO', kind: 'DUTY_STATION', label: 'ПТО-1', x: 35, y: 62, width: 8, height: 6 },
        { id: 'CMP-PARK', kind: 'PARKING', label: 'Автопарк', x: 65, y: 62, width: 9, height: 6 },
        { id: 'CMP-HANG', kind: 'HANGAR', label: 'Ангар ТО', x: 50, y: 78, width: 14, height: 7 },
        { id: 'CMP-ST-1', kind: 'STAND', label: 'C1', aircraftType: 'Airbus A320-200', x: 22, y: 36, width: 7, height: 5 },
        { id: 'CMP-ST-2', kind: 'STAND', label: 'C2', aircraftType: 'Boeing 737-800', x: 40, y: 36, width: 7, height: 5 },
        { id: 'CMP-ST-3', kind: 'STAND', label: 'C3', aircraftType: 'МС-21-300', x: 60, y: 36, width: 7, height: 5 },
        { id: 'CMP-ST-4', kind: 'STAND', label: 'C4', aircraftType: 'SSJ-100', x: 78, y: 36, width: 7, height: 5 }
      ];

      newConnections = [
        { id: 'CL-1', from: 'CMP-ST-1', to: 'CMP-ST-2', kind: 'ROAD' },
        { id: 'CL-2', from: 'CMP-ST-2', to: 'CMP-ST-3', kind: 'ROAD' },
        { id: 'CL-3', from: 'CMP-ST-3', to: 'CMP-ST-4', kind: 'ROAD' },
        { id: 'CL-4', from: 'CMP-ST-2', to: 'CMP-PTO', kind: 'ROAD' },
        { id: 'CL-5', from: 'CMP-ST-3', to: 'CMP-PARK', kind: 'ROAD' },
        { id: 'CL-6', from: 'CMP-PTO', to: 'CMP-PARK', kind: 'ROAD' },
        { id: 'CL-7', from: 'CMP-PTO', to: 'CMP-HANG', kind: 'ROAD' },
        { id: 'CL-8', from: 'CMP-PARK', to: 'CMP-HANG', kind: 'ROAD' }
      ];
    } else if (presetName === 'LINEAR') {
      newElements = [
        { id: 'LIN-RWY', kind: 'RUNWAY', label: 'ВПП 07/25', x: 50, y: 10, width: 84, height: 4 },
        { id: 'LIN-PTO-W', kind: 'DUTY_STATION', label: 'ПТО-Запад', x: 24, y: 58, width: 8, height: 6 },
        { id: 'LIN-PARK', kind: 'PARKING', label: 'Автопарк спецтехники', x: 50, y: 65, width: 12, height: 6 },
        { id: 'LIN-PTO-E', kind: 'DUTY_STATION', label: 'ПТО-Восток', x: 76, y: 58, width: 8, height: 6 },
        { id: 'LIN-HANG', kind: 'HANGAR', label: 'Ангар ТОиР', x: 50, y: 82, width: 16, height: 7 },
        { id: 'LIN-ST-1', kind: 'STAND', label: 'L01', aircraftType: 'Airbus A320-200', x: 14, y: 32, width: 7, height: 5 },
        { id: 'LIN-ST-2', kind: 'STAND', label: 'L02', aircraftType: 'Boeing 737-800', x: 24, y: 32, width: 7, height: 5 },
        { id: 'LIN-ST-3', kind: 'STAND', label: 'L03', aircraftType: 'МС-21-300', x: 34, y: 32, width: 7, height: 5 },
        { id: 'LIN-ST-4', kind: 'STAND', label: 'L04', aircraftType: 'SSJ-100', x: 44, y: 32, width: 7, height: 5 },
        { id: 'LIN-ST-5', kind: 'STAND', label: 'L05', aircraftType: 'Airbus A320-200', x: 56, y: 32, width: 7, height: 5 },
        { id: 'LIN-ST-6', kind: 'STAND', label: 'L06', aircraftType: 'Boeing 737-800', x: 66, y: 32, width: 7, height: 5 },
        { id: 'LIN-ST-7', kind: 'STAND', label: 'L07', aircraftType: 'Boeing 777-300ER', x: 76, y: 32, width: 7, height: 5 },
        { id: 'LIN-ST-8', kind: 'STAND', label: 'L08', aircraftType: 'Airbus A320-200', x: 86, y: 32, width: 7, height: 5 }
      ];

      newConnections = [
        { id: 'LL-1', from: 'LIN-ST-1', to: 'LIN-ST-2', kind: 'ROAD' },
        { id: 'LL-2', from: 'LIN-ST-2', to: 'LIN-ST-3', kind: 'ROAD' },
        { id: 'LL-3', from: 'LIN-ST-3', to: 'LIN-ST-4', kind: 'ROAD' },
        { id: 'LL-4', from: 'LIN-ST-4', to: 'LIN-ST-5', kind: 'ROAD' },
        { id: 'LL-5', from: 'LIN-ST-5', to: 'LIN-ST-6', kind: 'ROAD' },
        { id: 'LL-6', from: 'LIN-ST-6', to: 'LIN-ST-7', kind: 'ROAD' },
        { id: 'LL-7', from: 'LIN-ST-7', to: 'LIN-ST-8', kind: 'ROAD' },
        { id: 'LL-8', from: 'LIN-ST-2', to: 'LIN-PTO-W', kind: 'ROAD' },
        { id: 'LL-9', from: 'LIN-ST-4', to: 'LIN-PARK', kind: 'ROAD' },
        { id: 'LL-10', from: 'LIN-ST-5', to: 'LIN-PARK', kind: 'ROAD' },
        { id: 'LL-11', from: 'LIN-ST-7', to: 'LIN-PTO-E', kind: 'ROAD' },
        { id: 'LL-12', from: 'LIN-PTO-W', to: 'LIN-PARK', kind: 'ROAD' },
        { id: 'LL-13', from: 'LIN-PARK', to: 'LIN-PTO-E', kind: 'ROAD' },
        { id: 'LL-14', from: 'LIN-PARK', to: 'LIN-HANG', kind: 'ROAD' },
        { id: 'LL-15', from: 'LIN-PTO-W', to: 'LIN-HANG', kind: 'ROAD' },
        { id: 'LL-16', from: 'LIN-PTO-E', to: 'LIN-HANG', kind: 'ROAD' }
      ];
    } else if (presetName === 'CROSS_HUB') {
      newElements = [
        { id: 'CR-TERM', kind: 'TERMINAL', label: 'Центральный Х-Терминал', x: 50, y: 48, width: 20, height: 12 },
        { id: 'CR-PTO-N', kind: 'DUTY_STATION', label: 'ПТО-Север', x: 50, y: 26, width: 8, height: 6 },
        { id: 'CR-PTO-S', kind: 'DUTY_STATION', label: 'ПТО-Юг', x: 50, y: 70, width: 8, height: 6 },
        { id: 'CR-PARK', kind: 'PARKING', label: 'Автопарк спецтехники', x: 34, y: 48, width: 10, height: 6 },
        { id: 'CR-HANG', kind: 'HANGAR', label: 'Ангар ТОиР', x: 66, y: 48, width: 12, height: 6 },
        { id: 'CR-NW1', kind: 'STAND', label: 'NW-1', aircraftType: 'Airbus A320-200', x: 20, y: 24, width: 7, height: 5 },
        { id: 'CR-NW2', kind: 'STAND', label: 'NW-2', aircraftType: 'Boeing 737-800', x: 30, y: 30, width: 7, height: 5 },
        { id: 'CR-NE1', kind: 'STAND', label: 'NE-1', aircraftType: 'Boeing 777-300ER', x: 80, y: 24, width: 7, height: 5 },
        { id: 'CR-NE2', kind: 'STAND', label: 'NE-2', aircraftType: 'МС-21-300', x: 70, y: 30, width: 7, height: 5 },
        { id: 'CR-SW1', kind: 'STAND', label: 'SW-1', aircraftType: 'SSJ-100', x: 20, y: 72, width: 7, height: 5 },
        { id: 'CR-SW2', kind: 'STAND', label: 'SW-2', aircraftType: 'Airbus A320-200', x: 30, y: 66, width: 7, height: 5 },
        { id: 'CR-SE1', kind: 'STAND', label: 'SE-1', aircraftType: 'Boeing 737-800', x: 80, y: 72, width: 7, height: 5 },
        { id: 'CR-SE2', kind: 'STAND', label: 'SE-2', aircraftType: 'МС-21-300', x: 70, y: 66, width: 7, height: 5 }
      ];

      newConnections = [
        { id: 'CRL-1', from: 'CR-NW1', to: 'CR-NW2', kind: 'ROAD' },
        { id: 'CRL-2', from: 'CR-NW2', to: 'CR-PTO-N', kind: 'ROAD' },
        { id: 'CRL-3', from: 'CR-PTO-N', to: 'CR-NE2', kind: 'ROAD' },
        { id: 'CRL-4', from: 'CR-NE2', to: 'CR-NE1', kind: 'ROAD' },
        { id: 'CRL-5', from: 'CR-SW1', to: 'CR-SW2', kind: 'ROAD' },
        { id: 'CRL-6', from: 'CR-SW2', to: 'CR-PTO-S', kind: 'ROAD' },
        { id: 'CRL-7', from: 'CR-PTO-S', to: 'CR-SE2', kind: 'ROAD' },
        { id: 'CRL-8', from: 'CR-SE2', to: 'CR-SE1', kind: 'ROAD' },
        { id: 'CRL-9', from: 'CR-PTO-N', to: 'CR-PTO-S', kind: 'TUNNEL' },
        { id: 'CRL-10', from: 'CR-NW2', to: 'CR-PARK', kind: 'ROAD' },
        { id: 'CRL-11', from: 'CR-SW2', to: 'CR-PARK', kind: 'ROAD' },
        { id: 'CRL-12', from: 'CR-NE2', to: 'CR-HANG', kind: 'ROAD' },
        { id: 'CRL-13', from: 'CR-SE2', to: 'CR-HANG', kind: 'ROAD' },
        { id: 'CRL-14', from: 'CR-PARK', to: 'CR-PTO-S', kind: 'ROAD' },
        { id: 'CRL-15', from: 'CR-HANG', to: 'CR-PTO-S', kind: 'ROAD' }
      ];
    } else {
      newElements = [
        { id: 'MRO-RWY', kind: 'RUNWAY', label: 'ВПП 06/24 Грузовая', x: 50, y: 10, width: 80, height: 4 },
        { id: 'MRO-HANG-1', kind: 'HANGAR', label: 'Ангар ТОиР №1 (Heavy)', x: 25, y: 44, width: 14, height: 8 },
        { id: 'MRO-HANG-2', kind: 'HANGAR', label: 'Ангар ТОиР №2 (Line)', x: 45, y: 44, width: 14, height: 8 },
        { id: 'MRO-CARGO-T', kind: 'TERMINAL', label: 'Грузовой терминал', x: 75, y: 44, width: 18, height: 8 },
        { id: 'MRO-PTO-1', kind: 'DUTY_STATION', label: 'ПТО-Heavy', x: 30, y: 68, width: 8, height: 6 },
        { id: 'MRO-PARK', kind: 'PARKING', label: 'Автопарк тягачей', x: 50, y: 68, width: 12, height: 6 },
        { id: 'MRO-PTO-2', kind: 'DUTY_STATION', label: 'ПТО-Линейное', x: 70, y: 68, width: 8, height: 6 },
        { id: 'MRO-ST-1', kind: 'STAND', label: 'C-01', aircraftType: 'Boeing 777-300ER', x: 18, y: 24, width: 8, height: 6 },
        { id: 'MRO-ST-2', kind: 'STAND', label: 'C-02', aircraftType: 'Boeing 777-300ER', x: 34, y: 24, width: 8, height: 6 },
        { id: 'MRO-ST-3', kind: 'STAND', label: 'C-03', aircraftType: 'Airbus A320-200', x: 50, y: 24, width: 8, height: 6 },
        { id: 'MRO-ST-4', kind: 'STAND', label: 'C-04', aircraftType: 'Boeing 737-800', x: 66, y: 24, width: 8, height: 6 },
        { id: 'MRO-ST-5', kind: 'STAND', label: 'C-05', aircraftType: 'МС-21-300', x: 82, y: 24, width: 8, height: 6 }
      ];

      newConnections = [
        { id: 'MRL-1', from: 'MRO-ST-1', to: 'MRO-ST-2', kind: 'ROAD' },
        { id: 'MRL-2', from: 'MRO-ST-2', to: 'MRO-ST-3', kind: 'ROAD' },
        { id: 'MRL-3', from: 'MRO-ST-3', to: 'MRO-ST-4', kind: 'ROAD' },
        { id: 'MRL-4', from: 'MRO-ST-4', to: 'MRO-ST-5', kind: 'ROAD' },
        { id: 'MRL-5', from: 'MRO-ST-1', to: 'MRO-HANG-1', kind: 'ROAD' },
        { id: 'MRL-6', from: 'MRO-ST-2', to: 'MRO-HANG-1', kind: 'ROAD' },
        { id: 'MRL-7', from: 'MRO-ST-3', to: 'MRO-HANG-2', kind: 'ROAD' },
        { id: 'MRL-8', from: 'MRO-ST-4', to: 'MRO-CARGO-T', kind: 'ROAD' },
        { id: 'MRL-9', from: 'MRO-ST-5', to: 'MRO-CARGO-T', kind: 'ROAD' },
        { id: 'MRL-10', from: 'MRO-HANG-1', to: 'MRO-PTO-1', kind: 'ROAD' },
        { id: 'MRL-11', from: 'MRO-HANG-2', to: 'MRO-PARK', kind: 'ROAD' },
        { id: 'MRL-12', from: 'MRO-CARGO-T', to: 'MRO-PTO-2', kind: 'ROAD' },
        { id: 'MRL-13', from: 'MRO-PTO-1', to: 'MRO-PARK', kind: 'ROAD' },
        { id: 'MRL-14', from: 'MRO-PARK', to: 'MRO-PTO-2', kind: 'ROAD' }
      ];
    }

    setElements(newElements);
    setConnections(newConnections);
    setSelectedId(null);
    setSelectedConnectionId(null);
    setRouteStartId(null);
  };

  useEffect(() => {
    if (elements.length === 0) {
      applyPreset('TYPICAL');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canRun = elements.some(e => e.kind === 'STAND') && connections.length > 0;

  // --- AUTOMATIC KRUSKAL MST ROAD CONNECTOR ---
  const handleAutoConnectAll = () => {
    const roadNodes = elements.filter(e => e.kind !== 'RUNWAY');
    if (roadNodes.length < 2) return;

    const parent = new Map<string, string>();
    roadNodes.forEach(e => parent.set(e.id, e.id));
    const findRoot = (id: string): string => {
      let root = id;
      while (parent.get(root) !== root) root = parent.get(root)!;
      let curr = id;
      while (curr !== root) {
        const nxt = parent.get(curr)!;
        parent.set(curr, root);
        curr = nxt;
      }
      return root;
    };
    const unionRoots = (idA: string, idB: string): boolean => {
      const rootA = findRoot(idA);
      const rootB = findRoot(idB);
      if (rootA === rootB) return false;
      parent.set(rootA, rootB);
      return true;
    };

    const candidateEdges: { from: AirportElement; to: AirportElement; dist: number }[] = [];
    for (let i = 0; i < roadNodes.length; i++) {
      for (let j = i + 1; j < roadNodes.length; j++) {
        const a = roadNodes[i];
        const b = roadNodes[j];
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        candidateEdges.push({ from: a, to: b, dist });
      }
    }
    candidateEdges.sort((a, b) => a.dist - b.dist);

    const newLinks: AirportConnection[] = [];
    const connectedPairs = new Set<string>();
    const makePairKey = (id1: string, id2: string) => id1 < id2 ? `${id1}_${id2}` : `${id2}_${id1}`;

    // 1. Kruskal's Minimum Spanning Tree
    candidateEdges.forEach(edge => {
      if (unionRoots(edge.from.id, edge.to.id)) {
        const pairKey = makePairKey(edge.from.id, edge.to.id);
        connectedPairs.add(pairKey);
        newLinks.push({
          id: `ROAD-MST-${Date.now()}-${newLinks.length + 1}`,
          from: edge.from.id,
          to: edge.to.id,
          kind: 'ROAD',
          points: [{ x: edge.from.x, y: edge.from.y }, { x: edge.to.x, y: edge.to.y }]
        });
      }
    });

    // 2. Add 2-NN loops for shortcut loops
    roadNodes.forEach(node => {
      const sortedNeighbors = roadNodes
        .filter(other => other.id !== node.id)
        .sort((a, b) => Math.hypot(a.x - node.x, a.y - node.y) - Math.hypot(b.x - node.x, b.y - node.y));

      const nearestTwo = sortedNeighbors.slice(0, 2);
      nearestTwo.forEach(neighbor => {
        const pairKey = makePairKey(node.id, neighbor.id);
        if (!connectedPairs.has(pairKey)) {
          connectedPairs.add(pairKey);
          newLinks.push({
            id: `ROAD-LOOP-${Date.now()}-${newLinks.length + 1}`,
            from: node.id,
            to: neighbor.id,
            kind: 'ROAD',
            points: [{ x: node.x, y: node.y }, { x: neighbor.x, y: neighbor.y }]
          });
        }
      });
    });

    setConnections(newLinks);
  };

  const addElement = (kind: AirportElementKind, x = 50, y = 50): AirportElement => {
    const toolObj = TOOLS.find(item => item.kind === kind);
    const count = elements.filter(item => item.kind === kind).length + 1;
    const item: AirportElement = {
      id: `CUSTOM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      kind,
      label: kind === 'STAND' ? `${100 + count}` : `${toolObj?.label || 'Объект'} ${count}`,
      aircraftType: kind === 'STAND' ? 'Airbus A320-200' : undefined,
      x: Number(x.toFixed(1)),
      y: Number(y.toFixed(1)),
      width: kind === 'RUNWAY' ? 26 : kind === 'TERMINAL' ? 16 : kind === 'HANGAR' ? 12 : kind === 'WAYPOINT' ? 4 : 8,
      height: kind === 'RUNWAY' ? 3 : kind === 'TERMINAL' ? 8 : kind === 'HANGAR' ? 6 : kind === 'WAYPOINT' ? 4 : 5
    };
    
    let nextConnections = [...connections];
    if (autoConnect && elements.length > 0) {
      const nearest = elements.reduce(
        (best, current) => (Math.hypot(current.x - x, current.y - y) < Math.hypot(best.x - x, best.y - y) ? current : best),
        elements[0]
      );
      nextConnections.push({
        id: `LINK-${Date.now()}`,
        from: nearest.id,
        to: item.id,
        kind: 'ROAD',
        points: [{ x: nearest.x, y: nearest.y }, { x: item.x, y: item.y }]
      });
    }

    setElements([...elements, item]);
    setConnections(nextConnections);
    setSelectedId(item.id);
    setSelectedConnectionId(null);
    return item;
  };

  const updateSelected = (updates: Partial<AirportElement>) => {
    if (!selectedId) return;
    setElements(elements.map(item => (item.id === selectedId ? { ...item, ...updates } : item)));
  };

  const removeSelected = () => {
    if (selectedId) {
      setElements(elements.filter(item => item.id !== selectedId));
      setConnections(connections.filter(link => link.from !== selectedId && link.to !== selectedId));
      setSelectedId(null);
      if (routeStartId === selectedId) setRouteStartId(null);
    } else if (selectedConnectionId) {
      setConnections(connections.filter(c => c.id !== selectedConnectionId));
      setSelectedConnectionId(null);
    }
  };

  // --- FAST CHAINED ROAD / TUNNEL CONNECTION CREATOR ---
  const connectElements = (fromId: string, toId: string, kind: AirportConnectionKind) => {
    if (fromId === toId) return;
    const exists = connections.some(c => (c.from === fromId && c.to === toId) || (c.from === toId && c.to === fromId));
    if (exists) return;

    const fromEl = elements.find(e => e.id === fromId);
    const toEl = elements.find(e => e.id === toId);
    if (!fromEl || !toEl) return;

    const newConnection: AirportConnection = {
      id: `LINK-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      from: fromId,
      to: toId,
      kind,
      points: [{ x: fromEl.x, y: fromEl.y }, { x: toEl.x, y: toEl.y }]
    };

    setConnections(prev => [...prev, newConnection]);
  };

  // GLOBAL KEYBOARD SHORTCUTS: ESCAPE, DELETE, BACKSPACE
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault();
        if (routeStartId) {
          setRouteStartId(null);
        } else if (selectedId || selectedConnectionId) {
          setSelectedId(null);
          setSelectedConnectionId(null);
        } else {
          setTool('SELECT');
          setPlacementKind(null);
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId || selectedConnectionId) {
          e.preventDefault();
          removeSelected();
        }
      } else if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
        setTool('ROAD');
        setPlacementKind(null);
      } else if (e.key === 't' || e.key === 'T' || e.key === 'е' || e.key === 'Е') {
        setTool('TUNNEL');
        setPlacementKind(null);
      } else if (e.key === 'v' || e.key === 'V' || e.key === 'м' || e.key === 'М') {
        setTool('SELECT');
        setPlacementKind(null);
        setRouteStartId(null);
      } else if (['1', '2', '3', '4', '5', '6', '7'].includes(e.key)) {
        const idx = parseInt(e.key) - 1;
        if (TOOLS[idx]) {
          setTool('PLACE');
          setPlacementKind(TOOLS[idx].kind);
          setRouteStartId(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, selectedConnectionId, routeStartId, elements, connections]);

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
    setMousePos({ x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) });

    if (dragId && tool === 'SELECT') {
      setElements(elements.map(item => (item.id === dragId ? { ...item, x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) } : item)));
    }
  };

  const handleMapPointerDown = (event: React.PointerEvent<SVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Number(Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)).toFixed(1));
    const y = Number(Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)).toFixed(1));

    if (tool === 'PLACE' && placementKind) {
      addElement(placementKind, x, y);
    } else if ((tool === 'ROAD' || tool === 'TUNNEL') && routeStartId) {
      // Clicking empty space while drawing road creates an instant WAYPOINT and continues chain
      const newWp = addElement('WAYPOINT', x, y);
      connectElements(routeStartId, newWp.id, tool === 'TUNNEL' ? 'TUNNEL' : 'ROAD');
      setRouteStartId(newWp.id);
    } else {
      setSelectedId(null);
      setSelectedConnectionId(null);
      setRouteStartId(null);
    }
  };

  const handleElementClick = (e: React.PointerEvent<SVGGElement>, item: AirportElement) => {
    e.stopPropagation();
    setSelectedConnectionId(null);

    if (tool === 'ROAD' || tool === 'TUNNEL') {
      const connKind = tool === 'TUNNEL' ? 'TUNNEL' : 'ROAD';
      if (!routeStartId) {
        // Step 1: select start of chain
        setRouteStartId(item.id);
      } else if (routeStartId === item.id) {
        // Clicking same element finishes current chain
        setRouteStartId(null);
      } else {
        // Step 2+: instant connection creation & continue chain from target!
        connectElements(routeStartId, item.id, connKind);
        setRouteStartId(item.id); // Chained: next click connects from this item!
      }
      setSelectedId(item.id);
    } else {
      setSelectedId(item.id);
      if (tool === 'SELECT') {
        setDragId(item.id);
      }
    }
  };

  return (
    <div
      className="absolute inset-0 z-40 overflow-hidden bg-[#070b10] select-none"
      onPointerMove={onPointerMove}
      onPointerUp={() => setDragId(null)}
    >
      {/* Background SVG Canvas */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* Subtle CAD Grid */}
        <defs>
          <pattern id="builder-grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke="rgba(56,189,248,0.08)" strokeWidth="0.1" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#builder-grid)" onPointerDown={handleMapPointerDown} />

        {/* Connections Layer */}
        <g>
          {connections.map(link => {
            const style = CONNECTIONS.find(item => item.kind === link.kind) || CONNECTIONS[0];
            const fromEl = elements.find(item => item.id === link.from);
            const toEl = elements.find(item => item.id === link.to);
            if (!fromEl || !toEl) return null;

            const isSelected = selectedConnectionId === link.id;

            return (
              <g key={link.id} onClick={(e) => {
                e.stopPropagation();
                setSelectedConnectionId(link.id);
                setSelectedId(null);
              }} className="cursor-pointer group">
                {/* Thick invisible stroke for easy clicking / hover */}
                <line
                  x1={fromEl.x}
                  y1={fromEl.y}
                  x2={toEl.x}
                  y2={toEl.y}
                  stroke="transparent"
                  strokeWidth="3.5"
                />
                {/* Visible connection line */}
                <line
                  x1={fromEl.x}
                  y1={fromEl.y}
                  x2={toEl.x}
                  y2={toEl.y}
                  stroke={isSelected ? '#fbbf24' : style.color}
                  strokeWidth={isSelected ? '1.4' : '0.9'}
                  strokeDasharray={link.kind === 'TUNNEL' ? '2 1' : 'none'}
                  strokeLinecap="round"
                  className="transition-all group-hover:stroke-white"
                />
              </g>
            );
          })}

          {/* Dynamic Chained Route Guide Line following mouse */}
          {routeStartElement && (tool === 'ROAD' || tool === 'TUNNEL') && (
            <line
              x1={routeStartElement.x}
              y1={routeStartElement.y}
              x2={mousePos.x}
              y2={mousePos.y}
              stroke={tool === 'TUNNEL' ? '#f59e0b' : '#38bdf8'}
              strokeWidth="0.9"
              strokeDasharray="1.5 1.5"
              strokeLinecap="round"
              pointerEvents="none"
            />
          )}
        </g>

        {/* Airport Elements Group */}
        {elements.map(item => {
          const isSel = selectedId === item.id;
          const isRouteStart = routeStartId === item.id;
          const w = item.width || (item.kind === 'RUNWAY' ? 24 : item.kind === 'TERMINAL' ? 16 : item.kind === 'WAYPOINT' ? 4 : 8);
          const h = item.height || (item.kind === 'RUNWAY' ? 3 : item.kind === 'TERMINAL' ? 8 : item.kind === 'WAYPOINT' ? 4 : 5);

          let fillCol = isRouteStart ? '#34d39966' : isSel ? '#38bdf855' : 'rgba(30, 41, 59, 0.7)';
          let strokeCol = isRouteStart ? '#34d399' : isSel ? '#38bdf8' : '#64748b';

          if (item.kind === 'STAND') {
            strokeCol = isRouteStart ? '#34d399' : isSel ? '#38bdf8' : '#0284c7';
            fillCol = isRouteStart ? '#34d39955' : isSel ? 'rgba(56, 189, 248, 0.35)' : 'rgba(2, 132, 199, 0.2)';
          } else if (item.kind === 'DUTY_STATION') {
            strokeCol = isRouteStart ? '#34d399' : isSel ? '#fbbf24' : '#d97706';
            fillCol = isRouteStart ? '#34d39955' : isSel ? 'rgba(251, 191, 36, 0.35)' : 'rgba(217, 119, 6, 0.2)';
          } else if (item.kind === 'PARKING') {
            strokeCol = isRouteStart ? '#34d399' : isSel ? '#fbbf24' : '#eab308';
            fillCol = isRouteStart ? '#34d39955' : isSel ? 'rgba(250, 204, 21, 0.35)' : 'rgba(234, 179, 8, 0.2)';
          } else if (item.kind === 'RUNWAY') {
            strokeCol = isSel ? '#e2e8f0' : '#475569';
            fillCol = 'rgba(30, 41, 59, 0.85)';
          } else if (item.kind === 'WAYPOINT') {
            strokeCol = isRouteStart ? '#34d399' : isSel ? '#38bdf8' : '#38bdf8aa';
            fillCol = isRouteStart ? '#34d399' : isSel ? '#38bdf8' : '#0284c788';
          }

          return (
            <g
              key={item.id}
              transform={`translate(${item.x} ${item.y})`}
              onPointerDown={event => handleElementClick(event, item)}
              className={tool === 'SELECT' ? 'cursor-move' : 'cursor-pointer'}
            >
              {item.kind === 'WAYPOINT' ? (
                <circle
                  r="1.8"
                  fill={fillCol}
                  stroke={strokeCol}
                  strokeWidth={isSel || isRouteStart ? '0.8' : '0.4'}
                />
              ) : (
                <rect
                  x={-w / 2}
                  y={-h / 2}
                  width={w}
                  height={h}
                  rx="0.8"
                  fill={fillCol}
                  stroke={strokeCol}
                  strokeWidth={isSel || isRouteStart ? '0.7' : '0.4'}
                />
              )}
              
              {isRouteStart && (
                <circle
                  r={Math.max(w, h) / 2 + 1.5}
                  fill="none"
                  stroke="#34d399"
                  strokeWidth="0.5"
                  strokeDasharray="1 1"
                  className="animate-pulse"
                />
              )}

              {item.kind !== 'WAYPOINT' && (
                <text textAnchor="middle" y={h / 2 + 2.4} fill="#f1f5f9" fontSize="1.9" fontWeight="700">
                  {item.label}
                </text>
              )}
              {item.aircraftType && (
                <text textAnchor="middle" y={h / 2 + 4.0} fill="#94a3b8" fontSize="1.4" fontWeight="500">
                  {item.aircraftType}
                </text>
              )}
            </g>
          );
        })}

        {/* Ghost placement cursor preview */}
        {tool === 'PLACE' && placementKind && (
          <g transform={`translate(${mousePos.x} ${mousePos.y})`} pointerEvents="none" opacity="0.6">
            <circle r="3" fill="none" stroke="#38bdf8" strokeWidth="0.4" strokeDasharray="1 1" />
            <rect x="-3" y="-2" width="6" height="4" fill="#38bdf840" stroke="#38bdf8" strokeWidth="0.4" rx="0.5" />
          </g>
        )}
      </svg>

      {/* Top Header Bar */}
      <div className={`absolute left-4 right-4 top-3 flex items-center justify-between rounded-xl border px-4 py-2.5 shadow-2xl backdrop-blur-md ${panel}`}>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400 font-bold">
            <Sliders className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-sky-400">Конструктор испытательного полигона</div>
            <div className="text-xs font-bold text-gray-200">
              {tool === 'ROAD' || tool === 'TUNNEL'
                ? routeStartId
                  ? `Соединение от [${routeStartElement?.label || '...'}] → кликните следующий объект для мгновенной связи`
                  : `Инструмент «${tool === 'TUNNEL' ? 'Тоннель' : 'Автодорога'}»: кликните первый объект для начала цепочки`
                : tool === 'PLACE'
                ? `Размещение «${TOOLS.find(t => t.kind === placementKind)?.label}»: кликайте по карте для создания (Esc — отмена)`
                : 'Кликните объект для редактирования или перетаскивайте мышью (Esc — сброс выделения)'}
            </div>
          </div>
        </div>

        {/* Preset Templates */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/60 p-1">
            <span className="px-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">Шаблоны:</span>
            <button
              onClick={() => applyPreset('TYPICAL')}
              className="flex items-center gap-1 rounded-md bg-sky-500/20 px-2 py-1 text-xs font-bold text-sky-300 hover:bg-sky-500/30 transition-all cursor-pointer"
              title="Типовой полигон: 6 стоянок, ВПП, ПТО, Ангар и парковка"
            >
              <Sparkles className="h-3 w-3" /> Типовой
            </button>
            <button
              onClick={() => applyPreset('HUB')}
              className="flex items-center gap-1 rounded-md bg-indigo-500/20 px-2 py-1 text-xs font-bold text-indigo-300 hover:bg-indigo-500/30 transition-all cursor-pointer"
              title="Хаб Север-Юг с тоннелем"
            >
              <Plane className="h-3 w-3" /> Хаб С-Ю
            </button>
            <button
              onClick={() => applyPreset('LINEAR')}
              className="flex items-center gap-1 rounded-md bg-cyan-500/20 px-2 py-1 text-xs font-bold text-cyan-300 hover:bg-cyan-500/30 transition-all cursor-pointer"
              title="Линейный перрон: 8 стоянок"
            >
              <GitBranch className="h-3 w-3" /> Линейный
            </button>
            <button
              onClick={() => applyPreset('CROSS_HUB')}
              className="flex items-center gap-1 rounded-md bg-purple-500/20 px-2 py-1 text-xs font-bold text-purple-300 hover:bg-purple-500/30 transition-all cursor-pointer"
              title="Крестообразный X-хаб"
            >
              <CircleDot className="h-3 w-3" /> Х-Хаб
            </button>
            <button
              onClick={() => applyPreset('MRO_CARGO')}
              className="flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-1 text-xs font-bold text-amber-300 hover:bg-amber-500/30 transition-all cursor-pointer"
              title="ТОиР и грузовой терминал"
            >
              <Wrench className="h-3 w-3" /> ТОиР
            </button>
            <button
              onClick={() => applyPreset('COMPACT')}
              className="flex items-center gap-1 rounded-md bg-emerald-500/20 px-2 py-1 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30 transition-all cursor-pointer"
              title="Компактная схема"
            >
              <Layers className="h-3 w-3" /> Компакт
            </button>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-slate-800 hover:text-white transition-all cursor-pointer"
            title="Закрыть конструктор"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Left Sidebar: Fast Toolbox */}
      <aside className={`absolute bottom-4 left-4 top-18 w-56 overflow-y-auto rounded-xl border p-3 shadow-2xl backdrop-blur-md flex flex-col justify-between ${panel}`}>
        <div className="space-y-3">
          {/* Main Editing Modes */}
          <div>
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">Режимы</div>
            <div className="space-y-1">
              <button
                onClick={() => {
                  setTool('SELECT');
                  setPlacementKind(null);
                  setRouteStartId(null);
                }}
                className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  tool === 'SELECT' ? 'border-sky-400 bg-sky-400/20 text-sky-300 shadow-sm' : 'border-slate-700/40 text-gray-300 hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  <MousePointer2 className="h-3.5 w-3.5" /> Выбор / Двиг
                </div>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-gray-400">V</kbd>
              </button>
            </div>
          </div>

          {/* Instant Road / Connection Drawing Tools */}
          <div>
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center justify-between">
              <span>Связи и дороги</span>
              <span className="text-[9px] text-amber-400">1-клик цепочки</span>
            </div>
            <div className="space-y-1">
              {CONNECTIONS.map(link => {
                const active = tool === link.kind;
                return (
                  <button
                    key={link.kind}
                    onClick={() => {
                      setTool(active ? 'SELECT' : link.kind as any);
                      setPlacementKind(null);
                      setRouteStartId(null);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                      active ? 'border-amber-400 bg-amber-400/20 text-amber-300 shadow-md' : 'border-slate-700/40 text-gray-300 hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-3.5 w-3.5" style={{ color: link.color }} />
                      {link.label}
                    </div>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-gray-400">{link.shortcut}</kbd>
                  </button>
                );
              })}
              
              <button
                onClick={handleAutoConnectAll}
                className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-500/10 px-2 py-1.5 text-xs font-bold text-sky-300 hover:bg-sky-500/20 transition-all cursor-pointer"
                title="Автоматически соединить все стоянки и пункты кратчайшими дорогами (Kruskal MST)"
              >
                <GitBranch className="h-3.5 w-3.5" /> 🔗 Связать всё (MST)
              </button>
            </div>
          </div>

          {/* Placeable Objects */}
          <div>
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">Объекты аэродрома</div>
            <div className="space-y-1">
              {TOOLS.map(item => {
                const isPlacing = tool === 'PLACE' && placementKind === item.kind;
                return (
                  <button
                    key={item.kind}
                    onClick={() => {
                      setTool('PLACE');
                      setPlacementKind(item.kind);
                      setRouteStartId(null);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                      isPlacing ? 'border-amber-400 bg-amber-400/20 text-amber-300 shadow-md' : 'border-slate-700/40 text-gray-300 hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {item.icon}
                      {item.label}
                    </div>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-gray-400">{item.shortcut}</kbd>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="border-t border-slate-700/40 pt-3 space-y-2">
          <button
            disabled={!canRun}
            onClick={() => {
              flushToApp();
              onRunSimulation(elements, connections);
            }}
            title={canRun ? 'Сохранить полигон и запустить симуляцию' : 'Нужна хотя бы одна стоянка и одна связь'}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-2 text-xs font-bold text-white shadow-lg hover:from-emerald-500 hover:to-teal-500 active:scale-98 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Play className="h-4 w-4" /> Запустить полигон
          </button>
          
          <button
            onClick={onOpenShift}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 transition-all cursor-pointer"
          >
            Настроить смену
          </button>

          <button
            onClick={() => {
              setElements([]);
              setConnections([]);
              setSelectedId(null);
              setSelectedConnectionId(null);
              setRouteStartId(null);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 px-3 py-1 text-xs font-bold text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" /> Очистить
          </button>
        </div>
      </aside>

      {/* Right Sidebar: Object & Connection Inspector */}
      {(selected || selectedConnection) && (
        <aside className={`absolute bottom-4 right-4 top-18 w-64 rounded-xl border p-4 shadow-2xl backdrop-blur-md ${panel}`}>
          {selected && (
            <div>
              <div className="flex items-center justify-between mb-3 border-b border-slate-700 pb-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-sky-400">Инспектор объекта</div>
                <span className="rounded bg-sky-500/20 px-2 py-0.5 text-[9px] font-bold text-sky-300">{selected.kind}</span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400">Название / Номер стоянки:</label>
                  <input
                    value={selected.label}
                    onChange={event => updateSelected({ label: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-white focus:border-sky-400 focus:outline-none"
                  />
                </div>

                {selected.kind === 'STAND' && (
                  <div>
                    <label className="text-[10px] font-bold text-gray-400">Тип воздушного судна:</label>
                    <select
                      value={selected.aircraftType || AIRCRAFT_TYPES[0]}
                      onChange={event => updateSelected({ aircraftType: event.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs font-bold text-white focus:border-sky-400 focus:outline-none"
                    >
                      {AIRCRAFT_TYPES.map(type => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-400">
                  <label>
                    Координата X (%)
                    <input
                      type="number"
                      value={selected.x}
                      onChange={event => updateSelected({ x: Number(event.target.value) })}
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white font-mono"
                    />
                  </label>
                  <label>
                    Координата Y (%)
                    <input
                      type="number"
                      value={selected.y}
                      onChange={event => updateSelected({ y: Number(event.target.value) })}
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white font-mono"
                    />
                  </label>
                </div>

                <div className="pt-2 flex flex-col gap-2">
                  <button
                    onClick={() => {
                      setTool('ROAD');
                      setRouteStartId(selected.id);
                    }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-sky-400/40 bg-sky-500/15 px-3 py-1.5 text-xs font-bold text-sky-300 hover:bg-sky-500/25 transition-all cursor-pointer"
                  >
                    <Link className="h-3.5 w-3.5" /> Провести дорогу отсюда
                  </button>

                  <button
                    onClick={removeSelected}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-500/20 transition-all cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Удалить объект (Del)
                  </button>
                </div>
              </div>
            </div>
          )}

          {selectedConnection && (
            <div>
              <div className="flex items-center justify-between mb-3 border-b border-slate-700 pb-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Связь графа</div>
                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[9px] font-bold text-amber-300">{selectedConnection.kind}</span>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-gray-400">Соединяет:</span>
                  <div className="font-bold text-white mt-1">
                    {elements.find(e => e.id === selectedConnection.from)?.label || selectedConnection.from} ➔{' '}
                    {elements.find(e => e.id === selectedConnection.to)?.label || selectedConnection.to}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-gray-400">Тип соединения:</label>
                  <div className="grid grid-cols-2 gap-1.5 mt-1">
                    <button
                      onClick={() => setConnections(connections.map(c => c.id === selectedConnection.id ? { ...c, kind: 'ROAD' } : c))}
                      className={`px-2 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        selectedConnection.kind === 'ROAD' ? 'bg-sky-500/20 border-sky-400 text-sky-300' : 'border-slate-700 text-gray-400'
                      }`}
                    >
                      Автодорога
                    </button>
                    <button
                      onClick={() => setConnections(connections.map(c => c.id === selectedConnection.id ? { ...c, kind: 'TUNNEL' } : c))}
                      className={`px-2 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        selectedConnection.kind === 'TUNNEL' ? 'bg-amber-500/20 border-amber-400 text-amber-300' : 'border-slate-700 text-gray-400'
                      }`}
                    >
                      Тоннель
                    </button>
                  </div>
                </div>

                <button
                  onClick={removeSelected}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-500/20 transition-all cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Удалить связь (Del)
                </button>
              </div>
            </div>
          )}
        </aside>
      )}

      {/* Bottom Status & Hotkeys Pill */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-sky-400/30 bg-[#0b131f]/95 px-5 py-1.5 text-[11px] font-bold text-sky-200 shadow-2xl backdrop-blur-md flex items-center gap-4">
        <span>📍 {elements.length} объектов · {connections.length} связей ({elements.filter(e => e.kind === 'STAND').length} стоянок ВС)</span>
        <span className="text-gray-500">|</span>
        <span className="text-gray-400 text-[10px]">Esc: сброс выделения · Del: удалить · 1-7: объекты · R/T: дороги</span>
      </div>
    </div>
  );
};

export default LocationBuilderWorkspace;
