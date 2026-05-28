/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AuthProvider, AuthBarrier } from './components/AuthContext';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { LeadsPage } from './components/LeadsPage';
import { TeamPage } from './components/TeamPage';
import { CoursesPage } from './components/CoursesPage';
import { SettingsPage } from './components/SettingsPage';
import { ReportsPage } from './components/ReportsPage';
import { TopHeader } from './components/TopHeader';

import { CalendarPage } from './components/CalendarPage';

function MainLayout() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'leads': return <LeadsPage />;
      case 'courses': return <CoursesPage />;
      case 'team': return <TeamPage />;
      case 'reports': return <ReportsPage />;
      case 'tasks': return <CalendarPage />;
      case 'settings': return <SettingsPage />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#F9FAFB] relative">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
      />
      <div className="flex-1 flex flex-col overflow-hidden w-full">
        <TopHeader onMenuClick={() => setIsSidebarOpen(true)} />
        <main className="flex-1 overflow-auto relative p-4 md:p-0">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthBarrier>
        <MainLayout />
      </AuthBarrier>
    </AuthProvider>
  );
}
