import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Monitor, ChevronDown } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export default function ThemeToggle() {
  const { theme, isDark, setTheme, toggleTheme } = useTheme();
  const [openDropdown, setOpenDropdown] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpenDropdown(!openDropdown)}
        className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-all duration-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40"
        title="Chuyển đổi giao diện (Sáng / Tối / Hệ thống)"
        aria-label="Chuyển đổi giao diện"
      >
        <span className="relative flex items-center justify-center w-5 h-5">
          {isDark ? (
            <Moon className="w-4 h-4 text-sky-400 transition-transform duration-300 rotate-0 hover:-rotate-12" />
          ) : (
            <Sun className="w-4 h-4 text-amber-500 transition-transform duration-300 rotate-0 hover:rotate-45" />
          )}
        </span>
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </button>

      {openDropdown && (
        <div className="absolute right-0 mt-2 w-36 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 text-xs font-sans animate-in fade-in zoom-in-95 duration-150">
          <button
            type="button"
            onClick={() => {
              setTheme('light');
              setOpenDropdown(false);
            }}
            className={`w-full flex items-center space-x-2.5 px-3 py-2 text-left transition-colors ${
              theme === 'light'
                ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 font-semibold'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Sun className="w-3.5 h-3.5 text-amber-500" />
            <span>Giao diện Sáng</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTheme('dark');
              setOpenDropdown(false);
            }}
            className={`w-full flex items-center space-x-2.5 px-3 py-2 text-left transition-colors ${
              theme === 'dark'
                ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 font-semibold'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Moon className="w-3.5 h-3.5 text-sky-400" />
            <span>Giao diện Tối</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTheme('system');
              setOpenDropdown(false);
            }}
            className={`w-full flex items-center space-x-2.5 px-3 py-2 text-left transition-colors ${
              theme === 'system'
                ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 font-semibold'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Monitor className="w-3.5 h-3.5 text-slate-400" />
            <span>Theo hệ thống</span>
          </button>
        </div>
      )}
    </div>
  );
}
