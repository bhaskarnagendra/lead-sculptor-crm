import React from 'react';
import { LayoutGrid, Users, Calendar, Settings, LogOut, Search, PlusCircle, Upload, UserPlus, BookOpen, BarChart2 } from 'lucide-react';
import { useAuth } from './AuthContext';
import { logOut } from '../lib/firebase';
import { motion } from 'motion/react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const { profile, logout } = useAuth();

  const menuItems = profile?.role === 'sales_rep' 
    ? [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
        { id: 'leads', label: 'Leads', icon: Users },
        { id: 'tasks', label: 'Calendar', icon: Calendar },
        { id: 'settings', label: 'Settings', icon: Settings },
      ]
    : [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
        { id: 'leads', label: 'Leads', icon: Users },
        { id: 'courses', label: 'Courses', icon: BookOpen },
        { id: 'team', label: 'Team', icon: UserPlus },
        { id: 'reports', label: 'Performance', icon: BarChart2 },
        { id: 'tasks', label: 'Tasks', icon: Calendar },
        { id: 'settings', label: 'Settings', icon: Settings },
      ];

  return (
    <div className="w-64 bg-[#FBFBFC] border-r border-[#EBEBEB] flex flex-col h-full">
      <div className="p-8">
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <div className="w-6 h-6 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-lg shadow-md shadow-indigo-500/10"></div>
          LeadFlow
        </h1>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-medium transition-all ${
              activeTab === item.id 
                ? 'bg-indigo-50/70 text-indigo-600' 
                : 'text-slate-500 hover:bg-slate-100/50 hover:text-indigo-600'
            }`}
          >
            <item.icon size={18} strokeWidth={activeTab === item.id ? 2.5 : 2} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-xs font-bold border border-slate-200">
            {profile?.displayName?.charAt(0) || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[#1D1D1F] truncate">{profile?.displayName}</p>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{profile?.role}</p>
          </div>
        </div>
        
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-400 font-medium hover:text-red-500 hover:bg-red-50/50 rounded-2xl transition-all text-sm"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </div>
  );
};
