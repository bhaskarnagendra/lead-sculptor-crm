import React, { useState, useEffect } from 'react';
import { Save, Plus, Trash2, Layout, Check, AlertTriangle, ShieldAlert, Trash, RefreshCw } from 'lucide-react';
import { doc, getDoc, setDoc, onSnapshot, collection, getDocs, deleteDoc, collectionGroup } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { OperationType } from '../types';
import { useAuth, handleFirestoreError } from './AuthContext';

export const SettingsPage: React.FC = () => {
  const [fields, setFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Danger zone state
  const { profile, isAdmin } = useAuth();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [purging, setPurging] = useState(false);
  const [purgeSuccess, setPurgeSuccess] = useState(false);
  const [purgeError, setPurgeError] = useState<string | null>(null);

  useEffect(() => {
    const settingsRef = doc(db, 'config', 'lead_schema');
    const unsubscribe = onSnapshot(settingsRef, (snapshot) => {
      if (snapshot.exists()) {
        setFields(snapshot.data().fields || []);
      } else {
        // Default fields if none exist
        setFields([
          { id: '1', label: 'Preferred Course', type: 'select', options: ['Design', 'Fine Arts', 'Animation'] },
          { id: '2', label: 'Portfolio Link', type: 'text' },
          { id: '3', label: 'Budget Range', type: 'number' },
        ]);
      }
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'config/lead_schema'));

    return () => unsubscribe();
  }, []);

  const addField = () => {
    const newField = { id: Date.now().toString(), label: 'New Field', type: 'text' as const };
    setFields([...fields, newField]);
  };

  const removeField = (id: string) => {
    setFields(fields.filter(f => f.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const settingsRef = doc(db, 'config', 'lead_schema');
      await setDoc(settingsRef, { fields });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'config/lead_schema');
    } finally {
      setSaving(false);
    }
  };

  const handlePurgeAllLeads = async () => {
    if (confirmInput.trim() !== 'DELETE ALL') {
      setPurgeError('Please type "DELETE ALL" exactly to proceed.');
      return;
    }
    setPurging(true);
    setPurgeError(null);
    try {
      // 1. Fetch and delete all followups
      const followupsSnap = await getDocs(collectionGroup(db, 'followups'));
      const deleteFollowupsPromises = followupsSnap.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deleteFollowupsPromises);

      // 2. Fetch and delete all leads
      const leadsSnap = await getDocs(collection(db, 'leads'));
      const deleteLeadsPromises = leadsSnap.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deleteLeadsPromises);

      setPurgeSuccess(true);
      setTimeout(() => {
        setPurgeSuccess(false);
        setShowConfirmModal(false);
        setConfirmInput('');
      }, 2000);
    } catch (err: any) {
      setPurgeError(err?.message || 'Failed to purge leads.');
      handleFirestoreError(err, OperationType.DELETE, 'leads');
    } finally {
      setPurging(false);
    }
  };

  if (loading) {
    return (
      <div className="p-10 flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-[#1D1D1F] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-10 h-full bg-[#FBFBFC] overflow-auto max-w-7xl mx-auto w-full">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-[#1D1D1F]">Settings</h1>
        <p className="text-slate-500 text-[13px] font-medium mt-1">Configure lead data structures and integrations.</p>
      </header>

      <div className="max-w-4xl space-y-10">
        <section className="bg-white border border-slate-200/60 rounded-[32px] shadow-sm p-10">
          <div className="flex justify-between items-center mb-10">
            <h2 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Custom Attributes</h2>
            <button 
              onClick={addField}
              className="bento-button-secondary"
            >
              <Plus size={16} strokeWidth={2.5} />
              Add
            </button>
          </div>

          <div className="space-y-6">
            {fields.map((field) => (
              <div key={field.id} className="flex gap-6 items-end pb-6 border-b border-slate-50 last:border-0 hover:bg-slate-50/20 px-2 -mx-2 rounded-xl transition-colors">
                <div className="flex-1 space-y-1.5">
                  <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1">Label</label>
                  <input 
                    type="text" 
                    value={field.label}
                    onChange={(e) => {
                      const newFields = [...fields];
                      const idx = newFields.findIndex(f => f.id === field.id);
                      newFields[idx].label = e.target.value;
                      setFields(newFields);
                    }}
                    className="minimal-input"
                  />
                </div>
                <div className="w-1/3 space-y-1.5">
                  <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1">Type</label>
                  <select 
                    value={field.type}
                    onChange={(e) => {
                      const newFields = [...fields];
                      const idx = newFields.findIndex(f => f.id === field.id);
                      newFields[idx].type = e.target.value as any;
                      setFields(newFields);
                    }}
                    className="minimal-input cursor-pointer"
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="select">Dropdown</option>
                  </select>
                </div>
                <button 
                  onClick={() => removeField(field.id)}
                  className="p-3 text-slate-200 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
          
          <div className="mt-10 flex justify-end">
            <button 
              onClick={handleSave}
              disabled={saving}
              className={`px-10 py-4 ${saved ? 'bg-emerald-500' : 'bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-600/10'} text-white rounded-full text-[11px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-50`}
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : saved ? (
                <Check size={18} />
              ) : (
                <Save size={18} />
              )}
              {saved ? 'Saved' : 'Save Config'}
            </button>
          </div>
        </section>

        <section className="bg-gradient-to-tr from-indigo-900 via-indigo-950 to-purple-950 border-none rounded-[32px] p-10 text-white shadow-xl shadow-indigo-950/20">
          <h2 className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-4">Integration</h2>
          <p className="text-white/60 text-[13px] leading-relaxed mb-8 font-medium">Use this token to connect external forms to the pipeline.</p>
          <div className="bg-white/5 rounded-2xl p-6 font-mono text-[11px] text-slate-400 break-all select-all flex justify-between items-center group cursor-pointer hover:bg-white/10 transition-colors">
            <span>LS_API_TOKEN_892347298347239847293847239847</span>
          </div>
        </section>

        <section className="bg-red-50/50 border border-red-100 rounded-[32px] p-10 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 text-red-100 pointer-events-none">
            <ShieldAlert size={120} strokeWidth={1} />
          </div>
          <h2 className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-4">Danger Zone</h2>
          <p className="text-slate-600 text-[13px] leading-relaxed mb-6 font-medium max-w-xl">
            Reset, purge, and manage system database contents. These operations are highly destructive, permanent, and cannot be undone once executed.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <button 
              onClick={() => {
                setShowConfirmModal(true);
                setConfirmInput('');
                setPurgeError(null);
                setPurgeSuccess(false);
              }}
              className="px-6 py-3.5 bg-red-600 hover:bg-red-700 active:translate-y-px text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-lg shadow-red-600/10 transition-all flex items-center gap-2"
            >
              <Trash2 size={16} />
              Purge All Leads From System
            </button>
          </div>
        </section>
      </div>

      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] shadow-2xl max-w-md w-full p-8 border border-slate-200/50 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-red-600" />
            <div className="flex gap-4 items-start mb-6 mt-2">
              <div className="p-3 bg-red-50 rounded-2xl shrink-0 text-red-600">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 uppercase leading-none">Confirm Bulk Purge</h3>
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
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
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
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full font-bold uppercase text-[9px] tracking-widest transition-colors"
                disabled={purging || purgeSuccess}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePurgeAllLeads}
                disabled={confirmInput.trim() !== 'DELETE ALL' || purging || purgeSuccess}
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
