import React from 'react';
import { NotificationsPanel } from './NotificationsPanel';
import { Search } from 'lucide-react';

export const TopHeader: React.FC = () => {
  return (
    <header className="h-20 px-10 border-b border-[#EBEBEB] bg-white/80 backdrop-blur-md sticky top-0 z-40 flex items-center justify-between">
      <div className="flex-1 max-w-xl">
        <div className="relative group">
           <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#1D1D1F] transition-colors" size={18} />
           <input 
            type="text" 
            placeholder="Search commands, leads, or tasks..."
            className="w-full bg-slate-50/50 border-none rounded-2xl py-2.5 pl-12 pr-4 text-sm font-medium focus:ring-2 focus:ring-slate-100 transition-all"
           />
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <NotificationsPanel />
      </div>
    </header>
  );
};
