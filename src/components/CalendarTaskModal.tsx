import React, { useState, useEffect } from 'react';
import { doc, collection, query, getDocs, addDoc, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import { X, Search, Calendar, Clock, User } from 'lucide-react';
import { db } from '../lib/firebase';
import { Lead, OperationType } from '../types';
import { handleFirestoreError } from './AuthContext';

interface CalendarTaskModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const CalendarTaskModal: React.FC<CalendarTaskModalProps> = ({ onClose, onSuccess }) => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 16));
  const [type, setType] = useState<'call' | 'email' | 'meeting'>('call');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchLeads = async () => {
      const q = query(collection(db, 'leads'));
      const snap = await getDocs(q);
      setLeads(snap.docs.map(d => ({ id: d.id, ...d.data() } as Lead)));
    };
    fetchLeads();
  }, []);

  const filteredLeads = leads.filter(l => 
    l.name.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 5);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || !note.trim()) return;

    setLoading(true);
    try {
      const followupRef = collection(db, 'leads', selectedLead.id, 'followups');
      await addDoc(followupRef, {
        leadId: selectedLead.id,
        leadName: selectedLead.name,
        assignedTo: selectedLead.assignedTo || null,
        note,
        type,
        status: 'pending',
        scheduledAt: Timestamp.fromDate(new Date(date)),
        createdAt: serverTimestamp()
      });

      // Sync to lead doc
      const leadRef = doc(db, 'leads', selectedLead.id);
      await updateDoc(leadRef, {
        nextFollowUp: Timestamp.fromDate(new Date(date)),
        updatedAt: serverTimestamp()
      });

      onSuccess();
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'followups');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#1D1D1F]/20 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200/60 max-h-[90vh] flex flex-col">
        <header className="px-10 py-8 flex justify-between items-center">
          <h2 className="text-2xl font-bold tracking-tight text-[#1D1D1F]">Schedule Task</h2>
          <button onClick={onClose} className="p-3 hover:bg-slate-50 rounded-full text-slate-400">
            <X size={20} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="px-10 pb-10 space-y-6 overflow-auto">
          {!selectedLead ? (
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Select Lead</label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="text"
                  placeholder="Search leads..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="minimal-input pl-12"
                />
              </div>
              <div className="space-y-2">
                {filteredLeads.map(lead => (
                  <button 
                    key={lead.id}
                    type="button"
                    onClick={() => setSelectedLead(lead)}
                    className="w-full p-4 hover:bg-slate-50 rounded-2xl border border-slate-50 transition-all text-left flex items-center gap-4"
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400">
                      {lead.name[0]}
                    </div>
                    <span className="text-sm font-semibold text-[#1D1D1F]">{lead.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <User size={16} className="text-indigo-400" />
                  <span className="text-sm font-bold text-indigo-900">{selectedLead.name}</span>
                </div>
                <button 
                  type="button" 
                  onClick={() => setSelectedLead(null)}
                  className="text-[10px] font-black text-indigo-500 uppercase tracking-widest hover:underline"
                >
                  Change
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Task Type</label>
                <div className="grid grid-cols-3 gap-2">
                   {['call', 'email', 'meeting'].map(t => (
                     <button 
                        key={t}
                        type="button"
                        onClick={() => setType(t as any)}
                        className={`py-3 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${type === t ? 'bg-[#1D1D1F] text-white border-[#1D1D1F]' : 'bg-white text-slate-500 border-slate-100 hover:border-slate-300'}`}
                     >
                       {t}
                     </button>
                   ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Schedule</label>
                <input 
                  type="datetime-local" 
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="minimal-input"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Task Note</label>
                <textarea 
                  placeholder="What needs to be done?"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  className="minimal-input h-24 pt-4 resize-none"
                />
              </div>

              <button 
                type="submit"
                disabled={loading || !note.trim()}
                className="w-full py-4 bg-[#1D1D1F] text-white rounded-full font-bold uppercase text-[10px] tracking-widest shadow-xl shadow-[#1D1D1F]/5 hover:opacity-90 transition-all flex items-center justify-center gap-2 group disabled:opacity-20"
              >
                {loading ? 'Scheduling...' : 'Confirm Task'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
