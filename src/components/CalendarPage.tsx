import React, { useState, useEffect } from 'react';
import { collectionGroup, query, onSnapshot, where, Timestamp } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Phone, Mail, MapPin, Clock, Plus, Filter, MoreVertical } from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from './AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { CalendarTaskModal } from './CalendarTaskModal';

interface FollowUp {
  id: string;
  leadId: string;
  note: string;
  type: 'call' | 'email' | 'meeting' | 'other';
  scheduledAt: Timestamp | null;
  status: 'pending' | 'completed';
  leadName?: string;
}

export const CalendarPage: React.FC = () => {
  const { profile, isAdmin } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<FollowUp[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [loading, setLoading] = useState(true);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(true);

  useEffect(() => {
    // Collection Group query for all followups
    let followupsQuery = query(collectionGroup(db, 'followups'));
    
    if (!isAdmin && profile?.uid) {
      followupsQuery = query(collectionGroup(db, 'followups'), where('assignedTo', '==', profile.uid));
    }
    
    const unsubscribe = onSnapshot(followupsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as FollowUp));
      
      setEvents(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const daysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const firstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const getDayEvents = (day: number) => {
    return events.filter(event => {
      if (!event.scheduledAt) return false;
      const eventDate = event.scheduledAt.toDate();
      return eventDate.getDate() === day &&
             eventDate.getMonth() === currentDate.getMonth() &&
             eventDate.getFullYear() === currentDate.getFullYear();
    });
  };

  const selectedDayEvents = selectedDate ? events.filter(event => {
    if (!event.scheduledAt) return false;
    const eventDate = event.scheduledAt.toDate();
    return eventDate.getDate() === selectedDate.getDate() &&
           eventDate.getMonth() === selectedDate.getMonth() &&
           eventDate.getFullYear() === selectedDate.getFullYear();
  }).sort((a,b) => (a.scheduledAt?.toMillis() || 0) - (b.scheduledAt?.toMillis() || 0)) : [];

  return (
    <div className="h-full flex flex-col bg-[#FBFBFC]">
      <header className={`${isCompact ? 'p-6 pb-2' : 'p-10 pb-4'} flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all duration-300`}>
        <div>
          <h1 className={`${isCompact ? 'text-2xl' : 'text-3xl'} font-bold tracking-tight text-[#1D1D1F] transition-all`}>Calendar</h1>
          <p className="text-slate-500 text-[13px] font-medium mt-1">Manage your daily agenda and follow-ups.</p>
        </div>
        <div className="flex gap-2.5 flex-wrap">
           <button 
             onClick={() => setIsCompact(!isCompact)}
             className="bento-button-secondary py-2 px-4 text-xs font-bold"
           >
             {isCompact ? 'Detailed Grid' : 'Compact Grid'}
           </button>
           <button className="bento-button-secondary py-2 px-4 text-xs font-bold">
             <Filter size={14} />
             Filter
           </button>
           <button 
            onClick={() => setIsTaskModalOpen(true)}
            className="bento-button-primary py-2 px-4 text-xs font-bold"
           >
             <Plus size={14} strokeWidth={2.5} />
             New Task
           </button>
        </div>
      </header>

      {isTaskModalOpen && (
        <CalendarTaskModal 
          onClose={() => setIsTaskModalOpen(false)}
          onSuccess={() => {}}
        />
      )}

      <div className={`flex-1 overflow-hidden grid grid-cols-12 ${isCompact ? 'gap-6 p-6 pt-2' : 'gap-10 p-10 pt-6'} transition-all duration-300`}>
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="col-span-12 lg:col-span-8 flex flex-col space-y-6"
        >
          <div className="flex items-center justify-between">
             <h2 className="text-xl font-bold text-[#1D1D1F]">
               {monthNames[currentDate.getMonth()]} <span className="text-slate-400 font-medium ml-1">{currentDate.getFullYear()}</span>
             </h2>
             <div className="flex items-center gap-1 bg-slate-100/50 p-1 rounded-2xl border border-slate-200/60">
                 <button onClick={prevMonth} className="p-2 hover:bg-white hover:shadow-sm rounded-xl transition-all text-slate-500">
                   <ChevronLeft size={18} />
                 </button>
                 <button 
                   onClick={() => setCurrentDate(new Date())}
                   className="px-4 py-1.5 text-[11px] font-bold text-slate-500 hover:text-[#1D1D1F] transition-colors uppercase tracking-widest"
                 >
                   Today
                 </button>
                 <button onClick={nextMonth} className="p-2 hover:bg-white hover:shadow-sm rounded-xl transition-all text-slate-500">
                   <ChevronRight size={18} />
                 </button>
              </div>
          </div>

          <div className="bento-card overflow-hidden">
            <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50">
               {dayNames.map(day => (
                 <div key={day} className={`${isCompact ? 'py-2.5 text-[9px]' : 'py-4 text-[10px]'} text-center font-bold uppercase tracking-widest text-slate-400 transition-all`}>
                   {day}
                 </div>
               ))}
            </div>

            <div className="grid grid-cols-7 divide-x divide-y divide-slate-50 border-slate-50">
               {Array.from({ length: firstDayOfMonth(currentDate) }).map((_, i) => (
                 <div key={`empty-${i}`} className={`bg-slate-50/20 ${isCompact ? 'h-14 md:h-16' : 'p-2'}`}></div>
               ))}
               {Array.from({ length: daysInMonth(currentDate) }).map((_, i) => {
                 const day = i + 1;
                 const isToday = day === new Date().getDate() && 
                                currentDate.getMonth() === new Date().getMonth() &&
                                currentDate.getFullYear() === new Date().getFullYear();
                 const isSelected = selectedDate && day === selectedDate.getDate() && 
                                  currentDate.getMonth() === selectedDate.getMonth() &&
                                  currentDate.getFullYear() === selectedDate.getFullYear();
                 const dayEvents = getDayEvents(day);

                 return (
                   <button 
                     key={day}
                     onClick={() => setSelectedDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day))}
                     className={`w-full flex flex-col items-start justify-between transition-all relative group ${
                       isCompact ? 'p-2 h-14 md:h-16' : 'p-3 h-28'
                     } ${isSelected ? 'bg-indigo-50/30' : 'hover:bg-slate-50/50'}`}
                   >
                     <div className="w-full flex justify-between items-center">
                       <span className={`font-bold flex items-center justify-center rounded-full transition-all ${
                         isCompact 
                           ? `text-xs ${isToday ? 'w-5 h-5 bg-[#1D1D1F] text-white' : isSelected ? 'text-indigo-600 bg-indigo-50/80 w-5 h-5' : 'text-slate-600 w-5 h-5'}` 
                           : `${isToday ? 'bg-[#1D1D1F] text-white w-7 h-7' : isSelected ? 'text-indigo-600 w-7 h-7' : 'text-slate-450 w-7 h-7'}`
                       }`}>
                         {day}
                       </span>
                       {dayEvents.length > 0 && isCompact && (
                         <span className="text-[8px] font-black text-indigo-500 bg-indigo-50/80 px-1 py-0.5 rounded-md leading-none">
                           {dayEvents.length}
                         </span>
                       )}
                     </div>
                     
                     {/* Tasks View: Details for full view, Micro-dots for compact */}
                     {!isCompact ? (
                       <div className="flex-1 w-full space-y-1 overflow-hidden mt-2 text-left">
                          {dayEvents.slice(0, 2).map(ev => (
                            <div key={ev.id} className="w-full h-1 bg-indigo-400/30 rounded-full mb-1"></div>
                          ))}
                          {dayEvents.length > 0 && <span className="text-[10px] font-bold text-indigo-400/60">{dayEvents.length} Tasks</span>}
                       </div>
                     ) : (
                       dayEvents.length > 0 && (
                         <div className="flex gap-1 items-center justify-start max-w-full overflow-hidden shrink-0 mt-1">
                           {dayEvents.slice(0, 3).map(ev => (
                             <span 
                               key={ev.id} 
                               className={`w-1.5 h-1.5 rounded-full transition-all ${
                                 ev.type === 'call' ? 'bg-indigo-500' :
                                 ev.type === 'meeting' ? 'bg-emerald-500' :
                                 'bg-amber-500'
                               }`}
                             />
                           ))}
                           {dayEvents.length > 3 && (
                             <span className="text-[8px] font-black text-slate-400 leading-none">+</span>
                           )}
                         </div>
                       )
                     )}
                   </button>
                 );
               })}
            </div>
          </div>
        </motion.div>

        <div className="col-span-12 lg:col-span-4 flex flex-col space-y-6">
           <h3 className="text-sm font-bold uppercase tracking-widest text-[#1D1D1F]/40 flex items-center gap-2">
             <Clock size={16} />
             Agenda
           </h3>
           <motion.div 
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex-1 flex flex-col space-y-3"
           >
             {selectedDayEvents.length === 0 ? (
               <div className="bento-card p-10 text-center border-dashed border-2 bg-transparent">
                  <p className="text-slate-400 font-medium text-sm">No tasks for this day.</p>
               </div>
             ) : (
               selectedDayEvents.map((event, i) => {
                 if (isCompact) {
                   return (
                     <div key={event.id} className="flex gap-3 items-center bg-white border border-slate-150 p-3 rounded-2xl hover:border-indigo-200 transition-all shadow-[0_2px_6px_rgba(0,0,0,0.02)]">
                        <div className={`p-2.5 rounded-xl shrink-0 ${
                          event.type === 'call' ? 'bg-indigo-50 text-indigo-600' :
                          event.type === 'meeting' ? 'bg-emerald-50 text-emerald-600' :
                          'bg-amber-50 text-amber-500'
                        }`}>
                           {event.type === 'call' ? <Phone size={14} /> : event.type === 'meeting' ? <MapPin size={14} /> : <Mail size={14} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline gap-1">
                            <h4 className="text-xs font-bold text-[#1D1D1F] truncate">{event.leadName || 'Unnamed Lead'}</h4>
                            <span className="text-[9px] font-bold text-indigo-500 shrink-0">
                              {event.scheduledAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 truncate mt-0.5">{event.note || 'No description'}</p>
                        </div>
                     </div>
                   );
                 }

                 return (
                   <div key={event.id} className="bento-card p-5 group hover:border-[#1D1D1F] transition-all">
                      <div className="flex items-start justify-between mb-2">
                         <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            {event.type}
                         </div>
                         <div className="flex items-center gap-1.5 text-[11px] text-indigo-500 font-bold">
                            <Clock size={14} />
                            {event.scheduledAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                         </div>
                      </div>
                      <h4 className="text-sm font-bold text-[#1D1D1F] mb-1">{event.leadName || 'Unnamed Lead'}</h4>
                      <p className="text-xs text-slate-500 mb-2 line-clamp-2">{event.note || 'No description'}</p>
                   </div>
                 );
               })
             )}
              
             <button 
              onClick={() => setIsTaskModalOpen(true)}
              className="w-full py-4 bg-[#1D1D1F] text-white rounded-[24px] text-[11px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all hover:opacity-90"
             >
               <Plus size={16} strokeWidth={2.5} /> 
               Quick Schedule
             </button>
           </motion.div>
        </div>
      </div>
    </div>
  );
};
