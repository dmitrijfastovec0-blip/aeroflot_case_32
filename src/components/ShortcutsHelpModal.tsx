import React from 'react';
import { ThemeMode } from '../types/index';
import { Keyboard, X, Play, FastForward, Navigation, Search, Eye, HelpCircle } from 'lucide-react';

interface ShortcutsHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeMode;
}

export const ShortcutsHelpModal: React.FC<ShortcutsHelpModalProps> = ({
  isOpen,
  onClose,
  theme
}) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'Space', desc: 'Пауза / Возобновление симуляции', icon: <Play className="w-3.5 h-3.5 text-amber-400" /> },
    { key: '1 / 2 / 3 / 4', desc: 'Скорость симуляции (1x, 2x, 5x, 10x)', icon: <FastForward className="w-3.5 h-3.5 text-sky-400" /> },
    { key: 'W', desc: 'Сменить погодный режим (Ясно / Снег / Гололед / Ночь)', icon: <Navigation className="w-3.5 h-3.5 text-cyan-400" /> },
    { key: 'A', desc: 'Открыть сводную аналитику эффективности', icon: <Eye className="w-3.5 h-3.5 text-emerald-400" /> },
    { key: 'S', desc: 'Открыть конфигуратор состава смены', icon: <Search className="w-3.5 h-3.5 text-indigo-400" /> },
    { key: 'Esc', desc: 'Сбросить режим слежения / Закрыть меню и окна', icon: <X className="w-3.5 h-3.5 text-rose-400" /> },
    { key: '?', desc: 'Показать эту справку по горячим клавишам', icon: <HelpCircle className="w-3.5 h-3.5 text-purple-400" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden ${
        theme === 'dark' ? 'bg-[#0b1017] border-[#1e2a3a] text-gray-100' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-[#1e2a3a]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Горячие клавиши диспетчера</h3>
              <p className="text-[11px] text-gray-400">Быстрое управление терминалом ЦУП</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shortcuts List */}
        <div className="p-4 space-y-2 max-h-[70vh] overflow-y-auto font-mono text-xs">
          {shortcuts.map((item, idx) => (
            <div
              key={idx}
              className={`flex items-center justify-between p-2.5 rounded-xl border transition-colors ${
                theme === 'dark' ? 'bg-[#121820]/60 border-[#1e2a3a]' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                {item.icon}
                <span className="font-sans text-xs text-slate-700 dark:text-gray-300">{item.desc}</span>
              </div>
              <kbd className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-[#1a2332] border border-slate-300 dark:border-[#2d3f56] text-slate-900 dark:text-sky-300 font-bold text-[11px] shadow-sm">
                {item.key}
              </kbd>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-[#1e2a3a] flex justify-end bg-slate-50/50 dark:bg-[#070a0e]/50">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition-colors cursor-pointer"
          >
            Понятно (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShortcutsHelpModal;
