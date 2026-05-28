import React from 'react';
import { LayoutGrid, Users, Calendar, Settings, LogOut, Search, PlusCircle, Upload, UserPlus, BookOpen, BarChart2, X } from 'lucide-react';
import { useAuth } from './AuthContext';
import { logOut } from '../lib/firebase';
import { motion } from 'motion/react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, isOpen, onClose }) => {
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
    <>
      {/* Mobile Sidebar Backdrop Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <div className={`w-64 bg-[#FBFBFC] border-r border-[#EBEBEB] flex flex-col h-full fixed md:static inset-y-0 left-0 z-50 md:z-auto transform transition-transform duration-300 ease-in-out md:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="p-8 flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <div className="w-6 h-6 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-lg shadow-md shadow-indigo-500/10"></div>
            LeadFlow
          </h1>
          {onClose && (
            <button 
              onClick={onClose}
              className="md:hidden p-2 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors"
              title="Close Menu"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                if (window.innerWidth < 768) {
                  onClose();
                }
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all ${
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
              <p className="text-[14px] font-semibold text-[#1D1D1F] truncate">{profile?.displayName}</p>
              <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">{profile?.role}</p>
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
    </>
  );
};
