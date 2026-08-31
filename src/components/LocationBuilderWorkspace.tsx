import React, { useRef, useState, useEffect, useCallback } from 'react';
import { AirportConnection, AirportConnectionKind, AirportElement, AirportElementKind, ThemeMode } from '../types/index';
import {
  Box,
  Building2,
  CarFront,
  CircleDot,
  ParkingCircle,
  GitBranch,
  Map as MapIcon,
  MousePointer2,
  Plus,
  Play,
  Trash2,
  X,
  Sparkles,
  Plane,
  RotateCcw,
  Sliders,
  Layers,
  Wrench
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

const TOOLS: { kind: AirportElementKind; label: string; icon: React.ReactNode }[] = [
  { kind: 'STAND', label: 'Стоянка ВС', icon: <Plane className="h-4 w-4 text-sky-400" /> },
  { kind: 'DUTY_STATION', label: 'Пункт ПТО', icon: <Wrench className="h-4 w-4 text-amber-400" /> },
  { kind: 'PARKING', label: 'Автопарк', icon: <ParkingCircle className="h-4 w-4 text-yellow-400" /> },
  { kind: 'TERMINAL', label: 'Терминал', icon: <Building2 className="h-4 w-4 text-blue-400" /> },
  { kind: 'HANGAR', label: 'Ангар', icon: <Box className="h-4 w-4 text-indigo-400" /> },
  { kind: 'RUNWAY', label: 'ВПП', icon: <MapIcon className="h-4 w-4 text-emerald-400" /> },
  { kind: 'WAYPOINT', label: 'Узел графа', icon: <CircleDot className="h-4 w-4 text-cyan-400" /> }
];

const CONNECTIONS: { kind: AirportConnectionKind; label: string; color: string }[] = [
  { kind: 'ROAD', label: 'Автодорога', color: '#38bdf8' },
  { kind: 'TUNNEL', label: 'Тоннель', color: '#f59e0b' }
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
  // Local editing state: keeps the simulation engine from respawning workers
  // on every tiny drag/update. Changes are flushed to the app only when the
  // user explicitly runs the polygon.
  const [elements, setElements] = useState<AirportElement[]>(initialElements);
  const [connections, setConnections] = useState<AirportConnection[]>(initialConnections);

  useEffect(() => {
    setElements(initialElements);
  }, [initialElements]);

  useEffect(() => {
    setConnections(initialConnections);
  }, [initialConnections]);

  const [selectedId, setSelectedId] = useState<string | null>(elements[0]?.id || null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [connectionMode, setConnectionMode] = useState<AirportConnectionKind | null>(null);
  const [tool, setTool] = useState<'SELECT' | 'PLACE' | 'ROUTE'>('SELECT');
  const [placementKind, setPlacementKind] = useState<AirportElementKind | null>(null);
  const [routePoints, setRoutePoints] = useState<{ x: number; y: number }[]>([]);
  const [routeStartId, setRouteStartId] = useState<string | null>(null);
  const [autoConnect, setAutoConnect] = useState(false);
  const [brushActive, setBrushActive] = useState(false);
  const lastBrushPoint = useRef<{ x: number; y: number } | null>(null);

  const selected = elements.find(item => item.id === selectedId);
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
      // MRO_CARGO
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
    setSelectedId(newElements[0]?.id || null);
  };

  // Drop the user straight into a working example on first open.
  useEffect(() => {
    if (initialElements.length === 0) {
      applyPreset('TYPICAL');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canRun = elements.some(e => e.kind === 'STAND') && connections.length > 0;

  // --- 100% GUARANTEED FULLY CONNECTED ROAD NETWORK (Kruskal's MST + 2-NN Loops) ---
  const handleAutoConnectAll = () => {
    // Only connect road-relevant facilities and stands (exclude unattached runways)
    const roadNodes = elements.filter(e => e.kind !== 'RUNWAY');
    if (roadNodes.length < 2) return;

    // Disjoint Set Union (DSU) for Kruskal's MST
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

    // Calculate all pairwise candidate edges
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

    // 1. Kruskal's Minimum Spanning Tree (Guarantees all elements in ONE connected component)
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

    // 2. Add 2nd nearest neighbors for loop connectivity and shortest bypasses
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

  const addElement = (kind: AirportElementKind, x = 50, y = 50) => {
    const tool = TOOLS.find(item => item.kind === kind)!;
    const count = elements.filter(item => item.kind === kind).length + 1;
    const item: AirportElement = {
      id: `CUSTOM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      kind,
      label: kind === 'STAND' ? `Стоянка ${count}` : `${tool.label} ${count}`,
      aircraftType: kind === 'STAND' ? 'Airbus A320-200' : undefined,
      x,
      y,
      width: kind === 'RUNWAY' ? 26 : kind === 'TERMINAL' ? 16 : kind === 'HANGAR' ? 12 : 8,
      height: kind === 'RUNWAY' ? 3 : kind === 'TERMINAL' ? 8 : kind === 'HANGAR' ? 6 : 5
    };
    setElements([...elements, item]);
    if (autoConnect && elements.length > 0) {
      const nearest = elements.reduce(
        (best, current) => (Math.hypot(current.x - x, current.y - y) < Math.hypot(best.x - x, best.y - y) ? current : best),
        elements[0]
      );
      setConnections([
        ...connections,
        {
          id: `LINK-${Date.now()}`,
          from: nearest.id,
          to: item.id,
          kind: 'ROAD',
          points: [{ x: nearest.x, y: nearest.y }, { x, y }]
        }
      ]);
    }
    setSelectedId(item.id);
  };

  const updateSelected = (updates: Partial<AirportElement>) => {
    if (!selectedId) return;
    setElements(elements.map(item => (item.id === selectedId ? { ...item, ...updates } : item)));
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
    setElements(elements.map(item => (item.id === dragId ? { ...item, x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) } : item)));
  };

  const handleMapPointerDown = (event: React.PointerEvent<SVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: Number(Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)).toFixed(1)),
      y: Number(Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)).toFixed(1))
    };
    if (tool === 'PLACE' && placementKind) {
      addElement(placementKind, point.x, point.y);
      setBrushActive(true);
      lastBrushPoint.current = point;
    }
    if (tool === 'ROUTE' && routeStartId) {
      setRoutePoints(points => [...points, point]);
    }
  };

  const brushMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!brushActive || tool !== 'PLACE' || !placementKind || !(event.target instanceof SVGElement)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: Number(Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)).toFixed(1)),
      y: Number(Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)).toFixed(1))
    };
    const previous = lastBrushPoint.current;
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 4) {
      addElement(placementKind, point.x, point.y);
      lastBrushPoint.current = point;
    }
  };

  const finishRoute = () => {
    if (!connectionMode || !routeStartId || !selectedId || routeStartId === selectedId) return;
    const start = elements.find(item => item.id === routeStartId);
    const end = elements.find(item => item.id === selectedId);
    if (!start || !end) return;
    setConnections([
      ...connections,
      {
        id: `LINK-${Date.now()}`,
        from: start.id,
        to: end.id,
        kind: connectionMode,
        points: [{ x: start.x, y: start.y }, ...routePoints, { x: end.x, y: end.y }]
      }
    ]);
    setRoutePoints([]);
    setRouteStartId(null);
    setConnectionMode(null);
    setTool('SELECT');
  };

  const removeSelected = () => {
    if (!selectedId) return;
    setElements(elements.filter(item => item.id !== selectedId));
    setConnections(connections.filter(link => link.from !== selectedId && link.to !== selectedId));
    setSelectedId(null);
  };

  const handleElementPointerDown = (event: React.PointerEvent<SVGGElement>, id: string) => {
    event.stopPropagation();
    if (tool === 'ROUTE') {
      if (!routeStartId) setRouteStartId(id);
      else if (routeStartId !== id) setSelectedId(id);
      return;
    }
    if (tool === 'SELECT') setDragId(id);
    setSelectedId(id);
  };

  return (
    <div
      className="absolute inset-0 z-40 overflow-hidden bg-[#070b10]"
      onPointerMove={event => {
        onPointerMove(event);
        brushMove(event);
      }}
      onPointerUp={() => {
        setDragId(null);
        setBrushActive(false);
        lastBrushPoint.current = null;
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          setTool('SELECT');
          setPlacementKind(null);
          setConnectionMode(null);
          setRoutePoints([]);
          setAutoConnect(false);
        }
      }}
      tabIndex={0}
    >
      {/* Background SVG Canvas */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* Subtle CAD Grid */}
        <defs>
          <pattern id="builder-grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke="rgba(56,189,248,0.06)" strokeWidth="0.1" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#builder-grid)" onPointerDown={handleMapPointerDown} />

        {/* Connections Group */}
        <g opacity=".85" pointerEvents="none">
          {connections.map(link => {
            const style = CONNECTIONS.find(item => item.kind === link.kind) || CONNECTIONS[0];
            const points =
              link.points ||
              [elements.find(item => item.id === link.from), elements.find(item => item.id === link.to)]
                .filter(Boolean)
                .map(item => ({ x: item!.x, y: item!.y }));
            if (points.length < 2) return null;
            return (
              <polyline
                key={link.id}
                points={points.map(point => `${point.x},${point.y}`).join(' ')}
                fill="none"
                stroke={style.color}
                strokeWidth="0.8"
                strokeDasharray={link.kind === 'TUNNEL' ? '2 1' : link.kind === 'SERVICE' ? '1 1' : 'none'}
              />
            );
          })}
          {routePoints.length > 1 && (
            <polyline
              points={routePoints.map(point => `${point.x},${point.y}`).join(' ')}
              fill="none"
              stroke="#fbbf24"
              strokeWidth="1.1"
              strokeDasharray="1.5 1"
            />
          )}
        </g>

        {/* Airport Elements Group */}
        {elements.map(item => {
          const isSel = selectedId === item.id;
          const isStart = routeStartId === item.id;
          const w = item.width || (item.kind === 'RUNWAY' ? 24 : item.kind === 'TERMINAL' ? 16 : 8);
          const h = item.height || (item.kind === 'RUNWAY' ? 3 : item.kind === 'TERMINAL' ? 8 : 5);

          let fillCol = isStart ? '#34d39966' : isSel ? '#38bdf855' : 'rgba(30, 41, 59, 0.6)';
          let strokeCol = isStart ? '#34d399' : isSel ? '#38bdf8' : '#64748b';

          if (item.kind === 'STAND') {
            strokeCol = isSel ? '#38bdf8' : '#0284c7';
            fillCol = isSel ? 'rgba(56, 189, 248, 0.3)' : 'rgba(2, 132, 199, 0.15)';
          } else if (item.kind === 'DUTY_STATION') {
            strokeCol = isSel ? '#fbbf24' : '#d97706';
            fillCol = isSel ? 'rgba(251, 191, 36, 0.3)' : 'rgba(217, 119, 6, 0.15)';
          } else if (item.kind === 'PARKING') {
            strokeCol = isSel ? '#fbbf24' : '#eab308';
            fillCol = isSel ? 'rgba(250, 204, 21, 0.3)' : 'rgba(234, 179, 8, 0.15)';
          } else if (item.kind === 'RUNWAY') {
            strokeCol = isSel ? '#e2e8f0' : '#475569';
            fillCol = 'rgba(30, 41, 59, 0.8)';
          }

          return (
            <g
              key={item.id}
              transform={`translate(${item.x} ${item.y})`}
              onPointerDown={event => handleElementPointerDown(event, item.id)}
              className={tool === 'SELECT' ? 'cursor-move' : 'cursor-crosshair'}
            >
              <rect
                x={-w / 2}
                y={-h / 2}
                width={w}
                height={h}
                rx="0.8"
                fill={fillCol}
                stroke={strokeCol}
                strokeWidth={isSel ? '0.6' : '0.4'}
              />
              <text textAnchor="middle" y={h / 2 + 2.5} fill="#f1f5f9" fontSize="2.0" fontWeight="700">
                {item.label}
              </text>
              {item.aircraftType && (
                <text textAnchor="middle" y={h / 2 + 4.2} fill="#94a3b8" fontSize="1.5" fontWeight="500">
                  {item.aircraftType}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Top Header Bar */}
      <div className={`absolute left-4 right-4 top-4 flex items-center justify-between rounded-xl border px-4 py-2.5 shadow-2xl backdrop-blur-md ${panel}`}>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400">
            <Sliders className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-sky-400">Конструктор испытательного полигона</div>
            <div className="text-xs font-bold text-gray-200">
              {tool === 'ROUTE'
                ? routeStartId
                  ? 'Кликните точки на карте и выберите конечный объект для связи'
                  : 'Выберите начальный объект'
                : tool === 'PLACE'
                ? 'Кликните на карту или проведите мышью для размещения'
                : 'Кликните объект для редактирования или перетаскивайте мышью'}
            </div>
          </div>
        </div>

        {/* Preset Templates Generator */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/60 p-1">
            <span className="px-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">Шаблоны:</span>
            <button
              onClick={() => applyPreset('TYPICAL')}
              className="flex items-center gap-1 rounded-md bg-sky-500/20 px-2 py-1 text-xs font-bold text-sky-300 hover:bg-sky-500/30 transition-all"
              title="Типовой региональный полигон с 6 стоянками"
            >
              <Sparkles className="h-3 w-3" /> Типовой
            </button>
            <button
              onClick={() => applyPreset('HUB')}
              className="flex items-center gap-1 rounded-md bg-indigo-500/20 px-2 py-1 text-xs font-bold text-indigo-300 hover:bg-indigo-500/30 transition-all"
              title="Международный хаб (Север-Юг) с межтерминальным тоннелем"
            >
              <Plane className="h-3 w-3" /> Хаб С-Ю
            </button>
            <button
              onClick={() => applyPreset('LINEAR')}
              className="flex items-center gap-1 rounded-md bg-cyan-500/20 px-2 py-1 text-xs font-bold text-cyan-300 hover:bg-cyan-500/30 transition-all"
              title="Линейный магистральный перрон с 8 стоянками и 2 ПТО"
            >
              <GitBranch className="h-3 w-3" /> Линейный
            </button>
            <button
              onClick={() => applyPreset('CROSS_HUB')}
              className="flex items-center gap-1 rounded-md bg-purple-500/20 px-2 py-1 text-xs font-bold text-purple-300 hover:bg-purple-500/30 transition-all"
              title="Крестообразный X-хаб со скоростным тоннелем"
            >
              <CircleDot className="h-3 w-3" /> Х-Хаб
            </button>
            <button
              onClick={() => applyPreset('MRO_CARGO')}
              className="flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-1 text-xs font-bold text-amber-300 hover:bg-amber-500/30 transition-all"
              title="Грузовой терминал и база ТОиР тяжелых самолетов"
            >
              <Wrench className="h-3 w-3" /> ТОиР / Карго
            </button>
            <button
              onClick={() => applyPreset('COMPACT')}
              className="flex items-center gap-1 rounded-md bg-emerald-500/20 px-2 py-1 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30 transition-all"
              title="Компактный аэродром"
            >
              <Layers className="h-3 w-3" /> Компакт
            </button>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-slate-800 hover:text-white transition-all"
            title="Закрыть конструктор"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Left Sidebar: Toolbox */}
      <aside className={`absolute bottom-4 left-4 top-20 w-56 overflow-y-auto rounded-xl border p-3 shadow-2xl backdrop-blur-md ${panel}`}>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Режимы редактирования</div>
        <button
          onClick={() => {
            setTool('SELECT');
            setPlacementKind(null);
            setConnectionMode(null);
            setRoutePoints([]);
          }}
          className={`mb-2 flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-bold ${
            tool === 'SELECT' ? 'border-sky-400 bg-sky-400/10 text-sky-300' : 'border-slate-300/20 text-gray-300'
          }`}
        >
          <MousePointer2 className="h-4 w-4" /> Выбор / перемещение
        </button>

        <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Добавить объект</div>
        <div className="space-y-1">
          {TOOLS.map(item => {
            const isPlacing = tool === 'PLACE' && placementKind === item.kind;
            return (
              <button
                key={item.kind}
                onClick={() => {
                  setTool(isPlacing ? 'SELECT' : 'PLACE');
                  setPlacementKind(isPlacing ? null : item.kind);
                  setConnectionMode(null);
                  setRoutePoints([]);
                }}
                className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-bold transition-all ${
                  isPlacing ? 'border-amber-400 bg-amber-400/20 text-amber-300' : 'border-slate-300/10 text-gray-300 hover:bg-slate-800/40'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Graph Connections */}
        <div className="mt-3 border-t border-slate-300/20 pt-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Связи и дороги</div>
          <button
            onClick={handleAutoConnectAll}
            className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-500/10 px-2 py-1.5 text-xs font-bold text-sky-300 hover:bg-sky-500/20"
          >
            <GitBranch className="h-3.5 w-3.5" /> 🔗 Автосвязи дорог
          </button>
          <div className="space-y-1">
            {CONNECTIONS.map(link => {
              const active = tool === 'ROUTE' && connectionMode === link.kind;
              return (
                <button
                  key={link.kind}
                  onClick={() => {
                    setTool(active ? 'SELECT' : 'ROUTE');
                    setConnectionMode(active ? null : link.kind);
                    setRoutePoints([]);
                    setRouteStartId(null);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-bold transition-all ${
                    active ? 'border-amber-400 bg-amber-400/20 text-amber-300' : 'border-slate-300/10 text-gray-300 hover:bg-slate-800/40'
                  }`}
                >
                  <GitBranch className="h-3.5 w-3.5" style={{ color: link.color }} />
                  {link.label}
                </button>
              );
            })}
          </div>
          {tool === 'ROUTE' && (
            <button
              disabled={!routeStartId || !selectedId || routeStartId === selectedId}
              onClick={finishRoute}
              className="mt-2 w-full rounded-lg bg-amber-500 px-2.5 py-2 text-[10px] font-extrabold text-slate-950 disabled:opacity-40"
            >
              Завершить связь ({routePoints.length} точек)
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="mt-4 border-t border-slate-300/20 pt-3 space-y-2">
          <button
            disabled={!canRun}
            onClick={() => {
              flushToApp();
              onRunSimulation(elements, connections);
            }}
            title={canRun ? 'Сохранить полигон и запустить симуляцию' : 'Нужна хотя бы одна стоянка и одна связь'}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-2 text-xs font-bold text-white shadow-lg hover:from-emerald-500 hover:to-teal-500 active:scale-98 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className="h-4 w-4" /> Запустить полигон
          </button>
          <button
            onClick={onOpenShift}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20"
          >
            Настроить смену
          </button>
          <button
            onClick={() => {
              setElements([]);
              setConnections([]);
              setSelectedId(null);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> Очистить полигон
          </button>
        </div>
      </aside>

      {/* Right Sidebar: Object Inspector */}
      {selected && (
        <aside className={`absolute bottom-4 right-4 top-20 w-64 rounded-xl border p-4 shadow-2xl backdrop-blur-md ${panel}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-sky-400">Инспектор объекта</div>
            <span className="rounded bg-sky-500/20 px-2 py-0.5 text-[9px] font-bold text-sky-300">{selected.kind}</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-gray-400">Название / Код:</label>
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
                Позиция X (%)
                <input
                  type="number"
                  value={selected.x}
                  onChange={event => updateSelected({ x: Number(event.target.value) })}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white font-mono"
                />
              </label>
              <label>
                Позиция Y (%)
                <input
                  type="number"
                  value={selected.y}
                  onChange={event => updateSelected({ y: Number(event.target.value) })}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white font-mono"
                />
              </label>
            </div>

            <button
              onClick={removeSelected}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" /> Удалить объект
            </button>
          </div>
        </aside>
      )}

      {/* Bottom Status Pill */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-sky-400/30 bg-[#0b131f]/90 px-4 py-1.5 text-[11px] font-bold text-sky-200 shadow-xl backdrop-blur-md">
        {elements.length} объектов · {connections.length} связей · {elements.filter(e => e.kind === 'STAND').length} стоянок ВС
      </div>
    </div>
  );
};
