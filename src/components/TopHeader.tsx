import React from 'react';
import { NotificationsPanel } from './NotificationsPanel';
import { Search, Menu } from 'lucide-react';

interface TopHeaderProps {
  onMenuClick?: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ onMenuClick }) => {
  return (
    <header className="h-20 px-4 md:px-10 border-b border-[#EBEBEB] bg-white text-slate-900 sticky top-0 z-40 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 flex-1 max-w-xl">
        {onMenuClick && (
          <button 
            type="button"
            onClick={onMenuClick}
            className="md:hidden p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 focus:outline-none transition-all mr-1 shrink-0 cursor-pointer"
            title="Open Menu"
            id="mobile-menu-btn"
          >
            <Menu size={20} />
          </button>
        )}
        <div className="relative group flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-600 transition-colors" size={18} />
          <input 
            id="search-header-input"
            type="text" 
             placeholder="Search commands, leads, or tasks..."
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 pl-12 pr-4 text-[14px] font-medium focus:bg-white focus:ring-2 focus:ring-slate-200 transition-all outline-none"
          />
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <NotificationsPanel />
      </div>
    </header>
  );
};
