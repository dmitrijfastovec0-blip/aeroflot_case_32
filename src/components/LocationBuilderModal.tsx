import React, { useState } from 'react';
import { AirportElement, AirportElementKind, ThemeMode } from '../types/index';
import { Box, Building2, CarFront, ParkingCircle, Map, Plus, Trash2, X } from 'lucide-react';

interface LocationBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (elements: AirportElement[]) => void;
  elements: AirportElement[];
  theme: ThemeMode;
  onOpenShift: () => void;
}

const TOOLS: { kind: AirportElementKind; label: string; icon: React.ReactNode }[] = [
  { kind: 'TERMINAL', label: 'Терминал', icon: <Building2 className="w-4 h-4" /> },
  { kind: 'HANGAR', label: 'Ангар', icon: <Box className="w-4 h-4" /> },
  { kind: 'PARKING', label: 'Автопарк', icon: <ParkingCircle className="w-4 h-4" /> },
  { kind: 'RUNWAY', label: 'ВПП', icon: <Map className="w-4 h-4" /> },
  { kind: 'STAND', label: 'Стоянка', icon: <CarFront className="w-4 h-4" /> },
  { kind: 'DUTY_STATION', label: 'Пост ПТО', icon: <Plus className="w-4 h-4" /> }
];

export const LocationBuilderModal: React.FC<LocationBuilderModalProps> = ({ isOpen, onClose, onSave, elements, theme, onOpenShift }) => {
  const [draft, setDraft] = useState<AirportElement[]>(elements);
  const [selectedId, setSelectedId] = useState<string | null>(elements[0]?.id || null);

  React.useEffect(() => {
    if (isOpen) {
      setDraft(elements);
      setSelectedId(elements[0]?.id || null);
    }
  }, [isOpen, elements]);

  if (!isOpen) return null;

  const selected = draft.find(item => item.id === selectedId);
  const updateSelected = (updates: Partial<AirportElement>) => {
    if (!selectedId) return;
    setDraft(items => items.map(item => item.id === selectedId ? { ...item, ...updates } : item));
  };
  const addElement = (kind: AirportElementKind) => {
    const tool = TOOLS.find(item => item.kind === kind)!;
    const item: AirportElement = { id: `CUSTOM-${Date.now()}`, kind, label: tool.label, x: 50, y: 50, width: kind === 'RUNWAY' ? 24 : 8, height: kind === 'RUNWAY' ? 2 : 5 };
    setDraft(items => [...items, item]);
    setSelectedId(item.id);
  };

  const panel = theme === 'dark' ? 'bg-[#090d11] border-[#263345] text-gray-100' : 'bg-white border-slate-200 text-slate-900';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className={`w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-2xl border shadow-2xl ${panel}`}>
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#263345] p-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-sky-400">Конструктор локации</div>
            <h2 className="mt-1 text-lg font-extrabold">Соберите собственный аэропорт</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid min-h-[500px] grid-cols-1 md:grid-cols-[220px_1fr_240px]">
          <aside className="border-b border-slate-200 dark:border-[#263345] p-4 md:border-b-0 md:border-r">
            <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">Структурные элементы</div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
              {TOOLS.map(tool => <button key={tool.kind} onClick={() => addElement(tool.kind)} className="flex items-center gap-2 rounded-lg border border-slate-300 dark:border-[#263345] bg-slate-50 dark:bg-[#121820] px-3 py-2 text-left text-xs font-bold hover:border-sky-500 hover:text-sky-400">{tool.icon}{tool.label}</button>)}
            </div>
            <div className="mt-6 border-t border-slate-200 dark:border-[#263345] pt-4">
              <button onClick={() => setDraft([])} className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-500/10"><Trash2 className="w-3.5 h-3.5" /> Очистить мои объекты</button>
              <button onClick={onOpenShift} className="mt-2 w-full rounded-lg border border-emerald-500/30 px-3 py-2 text-xs font-bold text-emerald-400 hover:bg-emerald-500/10">Настроить состав смены</button>
            </div>
          </aside>
          <section className="relative m-4 min-h-[360px] overflow-hidden rounded-xl border border-sky-500/30 bg-[#0b1118] bg-[linear-gradient(rgba(56,189,248,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,.08)_1px,transparent_1px)] bg-[size:32px_32px]">
            <div className="absolute left-3 top-3 text-[10px] font-bold uppercase tracking-wider text-sky-400">Сетка локации · координаты 0–100%</div>
            {draft.map(item => <button key={item.id} onClick={() => setSelectedId(item.id)} className={`absolute -translate-x-1/2 -translate-y-1/2 rounded border px-2 py-1 text-[10px] font-bold ${selectedId === item.id ? 'border-amber-300 bg-amber-400/25 text-amber-200 ring-2 ring-amber-400/30' : 'border-sky-400/60 bg-sky-500/20 text-sky-200'}`} style={{ left: `${item.x}%`, top: `${item.y}%` }}>{item.label}</button>)}
            {draft.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-center text-xs text-gray-500">Выберите элемент слева<br />и разместите его через координаты</div>}
          </section>
          <aside className="border-t border-slate-200 dark:border-[#263345] p-4 md:border-l md:border-t-0">
            <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">Свойства объекта</div>
            {selected ? <div className="space-y-3 text-xs">
              <input value={selected.label} onChange={e => updateSelected({ label: e.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 font-bold text-slate-900 dark:border-[#263345] dark:bg-[#121820] dark:text-white" placeholder="Название" />
              <div className="grid grid-cols-2 gap-2"><label className="text-gray-500">X<input type="number" min="0" max="100" value={selected.x} onChange={e => updateSelected({ x: Number(e.target.value) })} className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-[#263345] dark:bg-[#121820]" /></label><label className="text-gray-500">Y<input type="number" min="0" max="100" value={selected.y} onChange={e => updateSelected({ y: Number(e.target.value) })} className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-[#263345] dark:bg-[#121820]" /></label></div>
              <button onClick={() => { setDraft(items => items.filter(item => item.id !== selected.id)); setSelectedId(null); }} className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 font-bold text-red-400"><Trash2 className="w-3.5 h-3.5" /> Удалить объект</button>
            </div> : <p className="text-xs text-gray-500">Выберите объект на схеме.</p>}
          </aside>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 dark:border-[#263345] p-4"><button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold dark:border-[#263345]">Отмена</button><button onClick={() => { onSave(draft); onClose(); }} className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-500">Применить локацию</button></div>
      </div>
    </div>
  );
};
