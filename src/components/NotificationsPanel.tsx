import React, { useState, useEffect } from 'react';
import { collectionGroup, query, where, onSnapshot, Timestamp, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthContext';
import { Bell, Clock, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface NotificationTask {
  id: string;
  leadName: string;
  note: string;
  scheduledAt: Timestamp;
  type: string;
  status: string;
}

export const NotificationsPanel: React.FC = () => {
  const { profile, isAdmin } = useAuth();
  const [notifications, setNotifications] = useState<NotificationTask[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!profile?.uid) return;

    // Start of today
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    let q = query(
      collectionGroup(db, 'followups'),
      where('status', '==', 'pending'),
      where('scheduledAt', '>=', Timestamp.fromDate(startOfToday)),
      where('scheduledAt', '<=', Timestamp.fromDate(endOfToday))
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as NotificationTask))
        .filter(task => isAdmin || (task as any).assignedTo === profile.uid);
      
      setNotifications(data.sort((a, b) => a.scheduledAt.toMillis() - b.scheduledAt.toMillis()));
    }, (err) => {
      console.error("Notifications listener failed:", err);
    });

    return () => unsubscribe();
  }, [profile?.uid, isAdmin]);

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 rounded-2xl bg-white border border-slate-200 text-slate-400 hover:text-[#1D1D1F] hover:border-[#1D1D1F] transition-all"
      >
        <Bell size={20} />
        {notifications.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-white">
            {notifications.length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-4 w-80 bg-white rounded-[32px] border border-slate-200 shadow-2xl z-50 overflow-hidden"
            >
              <header className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                 <h4 className="text-[11px] font-black uppercase text-slate-400 tracking-widest">Today's Schedule</h4>
                 <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-100 text-rose-600 rounded-full">{notifications.length} Due</span>
              </header>
              <div className="max-h-[400px] overflow-auto">
                {notifications.length === 0 ? (
                  <div className="p-10 text-center">
                    <CheckCircle2 size={32} className="mx-auto text-slate-100 mb-3" />
                    <p className="text-[12px] font-bold text-slate-400">All caught up for today!</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {notifications.map(n => (
                      <div key={n.id} className="p-5 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                           <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{n.type}</span>
                           <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                              <Clock size={12} />
                              {n.scheduledAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                           </div>
                        </div>
                        <p className="text-[13px] font-bold text-[#1D1D1F] mb-1">{n.leadName}</p>
                        <p className="text-[11px] text-slate-500 line-clamp-2">{n.note}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <footer className="p-4 border-t border-slate-50 text-center">
                 <button className="text-[10px] font-black text-indigo-500 uppercase tracking-widest hover:underline">View Calendar</button>
              </footer>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
