import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Phone, Check, ChevronRight, ChevronLeft, Calendar, MessageSquare, AlertCircle } from 'lucide-react';
import { doc, updateDoc, serverTimestamp, addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { OperationType } from '../types';
import { handleFirestoreError } from './AuthContext';

interface QuickActionDrawerProps {
  tasks: any[];
  onClose: () => void;
  isOpen: boolean;
}

export const QuickActionDrawer: React.FC<QuickActionDrawerProps> = ({ tasks, onClose, isOpen }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');

  if (!isOpen || tasks.length === 0) return null;

  const currentTask = tasks[currentIndex];

  const handleComplete = async (outcome: 'completed' | 'no-answer' | 'reschedule') => {
    if (!currentTask) return;
    setLoading(true);
    try {
      // Find the actual followup doc
      // Note: in collectionGroup, we might need the path or ID
      // If we don't have the full path, we might need to structured tasks better in dashboard
      // For now, let's assume currentTask has the leadId and id
      
      const followupRef = doc(db, 'leads', currentTask.leadId, 'followups', currentTask.id);
      
      await updateDoc(followupRef, {
        status: outcome === 'reschedule' ? 'pending' : 'completed',
        outcome,
        completedAt: serverTimestamp(),
        closingNote: note
      });

      // If there's a note, add a new history entry too?
      // For simplicity, we just move to next
      
      setNote('');
      if (currentIndex < tasks.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        onClose();
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'tasks');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-[#1D1D1F]/90 backdrop-blur-md"
        onClick={onClose}
      />
      
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="bg-white w-full max-w-2xl rounded-[48px] shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[80vh]"
      >
        <header className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500 text-white rounded-xl">
              <Phone size={18} strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#1D1D1F]">Power Dialer</h3>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                Task {currentIndex + 1} of {tasks.length}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
            <X size={24} />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-12 flex flex-col items-center text-center">
          <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center text-3xl font-bold text-[#1D1D1F] mb-6">
            {currentTask.leadName?.[0] || 'L'}
          </div>
          <h2 className="text-4xl font-bold tracking-tight text-[#1D1D1F] mb-2">{currentTask.leadName}</h2>
          <p className="text-slate-400 font-medium mb-12">Scheduled for {currentTask.scheduledAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>

          <div className="w-full space-y-8 text-left">
            <div className="bg-slate-50 rounded-3xl p-8 border border-slate-100">
               <div className="flex items-center gap-2 mb-3">
                 <AlertCircle size={14} className="text-indigo-500" />
                 <span className="text-[10px] font-black uppercase text-indigo-500 tracking-widest">Task Note</span>
               </div>
               <p className="text-lg font-semibold text-[#1D1D1F] leading-snug">
                 {currentTask.note || 'No specific instructions provided.'}
               </p>
            </div>

            <textarea 
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a closing note or outcome..."
              className="w-full h-32 bg-slate-50 border-none rounded-3xl p-6 text-lg font-medium focus:ring-2 focus:ring-indigo-100 placeholder:text-slate-300 transition-all"
            />
          </div>
        </div>

        <footer className="p-10 bg-slate-50 border-t border-slate-100">
          <div className="grid grid-cols-3 gap-4">
            <button 
              onClick={() => handleComplete('no-answer')}
              disabled={loading}
              className="py-5 rounded-3xl bg-white border border-slate-200 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:border-amber-400 hover:text-amber-500 transition-all disabled:opacity-50"
            >
              No Answer
            </button>
            <button 
              onClick={() => handleComplete('reschedule')}
              disabled={loading}
              className="py-5 rounded-3xl bg-white border border-slate-200 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:border-indigo-400 hover:text-indigo-500 transition-all disabled:opacity-50"
            >
              Reschedule
            </button>
            <button 
              onClick={() => handleComplete('completed')}
              disabled={loading}
              className="py-5 rounded-3xl bg-[#1D1D1F] text-white text-[11px] font-black uppercase tracking-widest hover:opacity-90 shadow-xl shadow-[#1D1D1F]/10 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Check size={18} strokeWidth={3} />
                  Success
                </>
              )}
            </button>
          </div>
        </footer>
      </motion.div>
    </div>
  );
};
