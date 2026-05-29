import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, updateDoc, doc, serverTimestamp, where, getDocs, deleteDoc, collectionGroup } from 'firebase/firestore';
import { Search, Plus, Filter, MoreHorizontal, UserPlus, Phone, Mail, Award, Trash2, AlertTriangle, RefreshCw, Check } from 'lucide-react';
import { db } from '../lib/firebase';
import { Lead, OperationType } from '../types';
import { useAuth, handleFirestoreError } from './AuthContext';
import { calculateLeadScore, getScoreColor, getStatusStyle } from '../utils/LeadScoring';
import { CsvImportModal } from './CsvImportModal';
import { LeadDetailModal } from './LeadDetailModal';
import { ManualLeadModal } from './ManualLeadModal';

export const LeadsPage: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const { profile, isAdmin } = useAuth();

  // Purge/Delete All Leads State Actions
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [confirmValue, setConfirmValue] = useState('');
  const [purging, setPurging] = useState(false);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [purgeSuccess, setPurgeSuccess] = useState(false);

  const handlePurgeAll = async () => {
    if (confirmValue.trim() !== 'DELETE ALL') {
      setPurgeError('Please type "DELETE ALL" exactly to proceed.');
      return;
    }
    setPurging(true);
    setPurgeError(null);
    try {
      // 1. Delete all followups
      const followupsSnap = await getDocs(collectionGroup(db, 'followups'));
      const deleteFollowupsPromises = followupsSnap.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deleteFollowupsPromises);

      // 2. Delete all leads
      const leadsSnap = await getDocs(collection(db, 'leads'));
      const deleteLeadsPromises = leadsSnap.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deleteLeadsPromises);

      setPurgeSuccess(true);
      setTimeout(() => {
        setPurgeSuccess(false);
        setShowPurgeConfirm(false);
        setConfirmValue('');
      }, 1500);
    } catch (err: any) {
      setPurgeError(err?.message || 'Failed to delete leads.');
      handleFirestoreError(err, OperationType.DELETE, 'leads');
    } finally {
      setPurging(false);
    }
  };

  useEffect(() => {
    if (!profile?.uid && !isAdmin) return;

    const leadsRef = collection(db, 'leads');
    let q = query(leadsRef, orderBy('createdAt', 'desc'));
    
    if (!isAdmin) {
      q = query(leadsRef, where('assignedTo', '==', profile?.uid), orderBy('createdAt', 'desc'));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const leadsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Lead[];
      setLeads(leadsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'leads');
    });

    return () => unsubscribe();
  }, [isAdmin, profile?.uid]);

  const handleAssignToSelf = async (leadId: string) => {
    try {
      const leadRef = doc(db, 'leads', leadId);
      await updateDoc(leadRef, {
        assignedTo: profile?.uid,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leads/${leadId}`);
    }
  };

  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredLeads = leads.filter(l => {
    const nameStr = l.name || '';
    const emailStr = l.email || '';
    const phoneStr = l.phone || '';
    const matchesSearch = nameStr.toLowerCase().includes(search.toLowerCase()) ||
      emailStr.toLowerCase().includes(search.toLowerCase()) ||
      phoneStr.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || l.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const displayLeads = !isAdmin
    ? [...filteredLeads].sort((a, b) => {
        // 1. Sort by Priority Tag value descending: Hot (3) > Warm (2) > Cold (1) > unassigned (0)
        const weightA = a.priorityTag === 'Hot' ? 3 : a.priorityTag === 'Warm' ? 2 : a.priorityTag === 'Cold' ? 1 : 0;
        const weightB = b.priorityTag === 'Hot' ? 3 : b.priorityTag === 'Warm' ? 2 : b.priorityTag === 'Cold' ? 1 : 0;
        
        if (weightB !== weightA) {
          return weightB - weightA;
        }

        // 2. Sort by nextFollowUp date ascending (nearest follow-up first, and leads without follow-up at the end)
        const timeA = a.nextFollowUp?.toDate ? a.nextFollowUp.toDate().getTime() : (a.nextFollowUp ? new Date(a.nextFollowUp).getTime() : Infinity);
        const timeB = b.nextFollowUp?.toDate ? b.nextFollowUp.toDate().getTime() : (b.nextFollowUp ? new Date(b.nextFollowUp).getTime() : Infinity);

        return timeA - timeB;
      })
    : filteredLeads;

  return (
    <div className="p-10 flex flex-col h-full bg-[#FBFBFC] max-w-7xl mx-auto w-full">
      <header className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#1D1D1F]">Leads</h1>
          <p className="text-slate-500 text-[13px] font-medium mt-1">Manage and track your prospect pipeline.</p>
        </div>
        <div className="flex gap-3">
          {!isAdmin && (
            <div className="flex items-center gap-2 bg-indigo-50/70 border border-indigo-100 px-4 py-2.5 rounded-2xl shrink-0 animate-pulse-subtle">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700">Prioritized Queue Active</span>
            </div>
          )}
          {isAdmin && (
            <>
              <button 
                onClick={() => {
                  setShowPurgeConfirm(true);
                  setConfirmValue('');
                  setPurgeError(null);
                  setPurgeSuccess(false);
                }}
                className="px-5 py-3 hover:bg-rose-50 border border-slate-200 hover:border-rose-100 text-rose-600 rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all duration-200 shadow-sm"
              >
                <Trash2 size={15} />
                Delete All Leads
              </button>
              <button 
                onClick={() => setIsManualModalOpen(true)}
                className="bento-button-secondary"
              >
                <Plus size={18} strokeWidth={2.5} />
                Add Lead
              </button>
            </>
          )}
          <button 
            onClick={() => setIsImportModalOpen(true)}
            className="bento-button-primary"
          >
            Import
          </button>
        </div>
      </header>

      <div className="mb-8 flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text"
            placeholder="Search leads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="minimal-input pl-12"
          />
        </div>
        <select 
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-2xl text-[11px] font-bold uppercase tracking-widest hover:border-[#1D1D1F] transition-all outline-none cursor-pointer"
        >
          <option value="all">All Pipeline</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="interested">Interested</option>
          <option value="enrolled">Enrolled</option>
          <option value="lost">Lost</option>
        </select>
      </div>

      <div className="flex-1 overflow-hidden bg-white border border-slate-200/60 rounded-[32px] shadow-sm flex flex-col mb-10">
        <div className="overflow-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-8 py-4 data-grid-header">Prospect</th>
                <th className="px-8 py-4 data-grid-header">Email</th>
                <th className="px-8 py-4 data-grid-header">Phone</th>
                <th className="px-8 py-4 data-grid-header">Course</th>
                <th className="px-8 py-4 data-grid-header">Owner</th>
                <th className="px-8 py-4 data-grid-header">Follow Up</th>
                <th className="px-8 py-4 data-grid-header">Status</th>
                <th className="px-8 py-4 data-grid-header">Score</th>
                <th className="px-8 py-4 data-grid-header text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {displayLeads.map((lead) => (
                <tr 
                  key={lead.id} 
                  onClick={() => setSelectedLeadId(lead.id)}
                  className="hover:bg-slate-50 transition-colors cursor-pointer group"
                >
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-500 text-sm">
                        {lead.name[0]}
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-[#1D1D1F] group-hover:text-indigo-600 transition-colors">{lead.name}</h3>
                        <p className="text-[11px] text-slate-400 font-medium">{(lead.createdAt?.toDate?.() || new Date()).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </td>

                  <td className="px-8 py-5">
                    <div className="text-[13px] text-slate-600 font-semibold">{lead.email || '—'}</div>
                  </td>

                  <td className="px-8 py-5">
                    {lead.phone ? (
                      <div className="text-[13px] text-slate-600 font-semibold flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{lead.phone}</span>
                      </div>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>

                  <td className="px-8 py-5">
                    <div className="text-[13px] text-slate-600 font-semibold">{lead.courseName || '—'}</div>
                  </td>

                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                       <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[8px] font-bold text-slate-400 uppercase">
                         {lead.assignedName?.[0] || '?'}
                       </div>
                       <span className="text-[12px] font-semibold text-slate-600">{lead.assignedName || 'Unassigned'}</span>
                    </div>
                  </td>

                  <td className="px-8 py-5">
                    {lead.nextFollowUp ? (
                      <div className="flex flex-col">
                        <span className="text-[12px] font-bold text-[#1D1D1F]">
                          {lead.nextFollowUp.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                          {lead.nextFollowUp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">Not set</span>
                    )}
                  </td>

                  <td className="px-8 py-5">
                    <div className="flex flex-col gap-1.5 items-start">
                      <span className={`px-2.5 py-1 rounded-full text-[9px] font-black border transition-all uppercase tracking-widest ${getStatusStyle(lead.status)}`}>
                        {lead.mainStatus || lead.status}
                      </span>
                      {lead.subStatus && (
                        <span className="text-[10px] text-slate-500 font-bold whitespace-nowrap bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">
                          {lead.subStatus}
                        </span>
                      )}
                      {lead.priorityTag && (
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-widest ${
                          lead.priorityTag === 'Hot' ? 'bg-rose-50 text-rose-500 border border-rose-100' :
                          lead.priorityTag === 'Warm' ? 'bg-amber-50 text-amber-500 border border-amber-100' :
                          'bg-indigo-50 text-indigo-500 border border-indigo-100'
                        }`}>
                          {lead.priorityTag}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                       <span className={`px-2.5 py-1 rounded-full text-[11px] font-black border transition-all ${getScoreColor(lead.score, lead.status)}`}>
                         {lead.score}%
                       </span>
                    </div>
                  </td>

                  <td className="px-8 py-5 text-right">
                    <button className="p-2 text-slate-300 hover:text-slate-600">
                      <MoreHorizontal size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-6 border-t border-slate-50 flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          <span>{displayLeads.length} Records</span>
        </div>
      </div>

      {isManualModalOpen && (
        <ManualLeadModal 
          onClose={() => setIsManualModalOpen(false)} 
          onSuccess={() => {}} 
        />
      )}

      {isImportModalOpen && (
        <CsvImportModal 
          onClose={() => setIsImportModalOpen(false)} 
          onSuccess={() => {}} 
        />
      )}

      {selectedLeadId && (
        <LeadDetailModal 
          leadId={selectedLeadId} 
          onClose={() => setSelectedLeadId(null)} 
        />
      )}

      {showPurgeConfirm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] shadow-2xl max-w-md w-full p-8 border border-slate-200/50 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-red-650" />
            <div className="flex gap-4 items-start mb-6 mt-2">
              <div className="p-3 bg-red-50 rounded-2xl shrink-0 text-red-650">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 uppercase leading-none">Delete All Leads?</h3>
                <p className="text-slate-500 text-xs font-medium mt-1 leading-relaxed">
                  You are about to irreversibly delete all prospect records and their follow-up history from the CRM system.
                </p>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
                  This action will permanently wipe all lead documents and associated agenda tasks.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">
                  Type <span className="text-red-500 font-black">DELETE ALL</span> to confirm:
                </label>
                <input 
                  type="text" 
                  value={confirmValue}
                  onChange={(e) => setConfirmValue(e.target.value)}
                  placeholder="DELETE ALL"
                  className="w-full px-4 py-3 bg-slate-100 border border-transparent rounded-2xl focus:bg-white focus:border-red-300 focus:ring-1 focus:ring-red-100 transition-all text-sm outline-none font-bold"
                  disabled={purging || purgeSuccess}
                />
              </div>

              {purgeError && (
                <p className="text-[10px] font-bold text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 uppercase tracking-wide leading-relaxed">
                  {purgeError}
                </p>
              )}

              {purgeSuccess && (
                <p className="text-[10px] font-bold text-emerald-600 bg-emerald-50 p-3 rounded-xl border border-emerald-100 uppercase tracking-wide flex items-center justify-center gap-1.5 animate-pulse leading-none">
                  <Check size={14} strokeWidth={2.5} /> CRM leads purged successfully!
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowPurgeConfirm(false)}
                className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full font-bold uppercase text-[9px] tracking-widest transition-colors"
                disabled={purging || purgeSuccess}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePurgeAll}
                disabled={confirmValue.trim() !== 'DELETE ALL' || purging || purgeSuccess}
                className="flex-[2] py-3.5 bg-red-600 hover:bg-red-500 disabled:opacity-30 text-white rounded-full font-bold uppercase text-[9px] tracking-widest hover:shadow-lg hover:shadow-red-500/10 transition-all flex items-center justify-center gap-2"
              >
                {purging ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" />
                    Purging CRM...
                  </>
                ) : (
                  'Purge Permanently'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
