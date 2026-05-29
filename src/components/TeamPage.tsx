import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, updateDoc, doc, where, serverTimestamp, setDoc, deleteDoc } from 'firebase/firestore';
import { Users, Shield, User, Mail, Calendar, MoreVertical, Trash2, UserPlus, X, RefreshCw, Edit2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { UserProfile, UserRole, OperationType, Target } from '../types';
import { useAuth, handleFirestoreError, seedUsersIfEmpty } from './AuthContext';

export const TeamPage: React.FC = () => {
  const [team, setTeam] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<UserProfile | null>(null);
  const [newUser, setNewUser] = useState({ email: '', displayName: '', password: '', role: 'sales_rep' as UserRole });
  const [editForm, setEditForm] = useState({ email: '', displayName: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const { profile, isAdmin } = useAuth();

  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [targets, setTargets] = useState<Target[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [editingTargetUserId, setEditingTargetUserId] = useState<string | null>(null);
  const [editTargetValue, setEditTargetValue] = useState<number | string>('');

  const generateRandomPassword = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  useEffect(() => {
    const targetsRef = collection(db, 'targets');
    const unsubscribeTargets = onSnapshot(targetsRef, (snapshot) => {
      setTargets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Target)));
    }, (err) => {
      console.error("Targets listener failed:", err);
      handleFirestoreError(err, OperationType.LIST, 'targets');
    });

    const leadsRef = collection(db, 'leads');
    const unsubscribeLeads = onSnapshot(leadsRef, (snapshot) => {
      setLeads(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.error("Leads listener failed:", err);
      handleFirestoreError(err, OperationType.LIST, 'leads');
    });

    return () => {
      unsubscribeTargets();
      unsubscribeLeads();
    };
  }, []);

  const getEnrollmentCount = (userId: string, monthStr: string) => {
    return leads.filter(l => {
      if (l.assignedTo !== userId || l.status !== 'enrolled' || !l.createdAt) return false;
      try {
        const leadDate = l.createdAt?.toDate ? l.createdAt.toDate().toISOString().slice(0, 7) : new Date(l.createdAt).toISOString().slice(0, 7);
        return leadDate === monthStr;
      } catch (err) {
        return false;
      }
    }).length;
  };

  const handleSaveTarget = async (userId: string, userName: string) => {
    if (editTargetValue === '' || isNaN(Number(editTargetValue))) return;
    const numValue = Number(editTargetValue);
    if (numValue < 0) return;

    try {
      setError(null);
      const docId = `${userId}_${selectedMonth}`;
      const targetRef = doc(db, 'targets', docId);
      const existingTarget = targets.find(t => t.id === docId);

      const payload: any = {
        userId,
        userName,
        month: selectedMonth,
        target: numValue,
        updatedAt: serverTimestamp()
      };

      if (!existingTarget) {
        payload.createdAt = serverTimestamp();
        await setDoc(targetRef, payload);
      } else {
        await updateDoc(targetRef, {
          target: numValue,
          updatedAt: serverTimestamp()
        });
      }
      setEditingTargetUserId(null);
    } catch (err: any) {
      console.error("Save target error:", err);
      setError("Failed to assign target: " + (err.message || String(err)));
      handleFirestoreError(err, OperationType.WRITE, `targets/${userId}_${selectedMonth}`);
    }
  };

  const handleRemoveTarget = async (docId: string) => {
    try {
      setError(null);
      await deleteDoc(doc(db, 'targets', docId));
    } catch (err: any) {
      console.error("Remove target error:", err);
      setError("Failed to remove target: " + (err.message || String(err)));
      handleFirestoreError(err, OperationType.DELETE, `targets/${docId}`);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      seedUsersIfEmpty().catch(err => {
        console.error("Auto-sync from TeamPage failed:", err);
      });
    }
  }, [isAdmin]);

  useEffect(() => {
    const usersRef = collection(db, 'users');
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const allDocs = snapshot.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
      
      const uniqueDocs: UserProfile[] = [];
      const seenNames = new Set<string>();
      const seenEmails = new Set<string>();
      
      for (const u of allDocs) {
        const nameClean = (u.displayName || '').trim().toLowerCase();
        const emailClean = (u.email || '').trim().toLowerCase();
        
        if (!nameClean || nameClean === 'unnamed' || nameClean === 'unknown') {
          continue;
        }
        
        const isMasterMonish = u.uid === 'manual_sales_1';
        const isMasterArpita = u.uid === 'manual_sales_2';
        
        const isMonishName = nameClean === 'monish' || emailClean.startsWith('monish');
        const isArpitaName = nameClean === 'arpita' || nameClean === 'arpitha' || emailClean.startsWith('arpita') || emailClean.startsWith('arpitha');
        
        if (isMonishName && !isMasterMonish && allDocs.some(other => other.uid === 'manual_sales_1')) {
          continue;
        }
        if (isArpitaName && !isMasterArpita && allDocs.some(other => other.uid === 'manual_sales_2')) {
          continue;
        }
        
        if ((seenNames.has(nameClean) || (emailClean && seenEmails.has(emailClean))) && u.uid !== 'manual_sales_1' && u.uid !== 'manual_sales_2') {
          continue;
        }
        
        seenNames.add(nameClean);
        if (emailClean) seenEmails.add(emailClean);
        uniqueDocs.push(u);
      }

      setTeam(uniqueDocs);
      setLoading(false);
    }, (err) => {
      console.error("Failed to load team:", err);
      setError("Failed to load team directory. Permission denied.");
      handleFirestoreError(err, OperationType.LIST, 'users');
    });

    return () => unsubscribe();
  }, [profile]);

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    if (!isAdmin) {
      setError("Permission Denied: Only administrators can modify roles.");
      return;
    }
    try {
      setError(null);
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { role: newRole });
    } catch (err: any) {
      console.error("Role change error:", err);
      setError(err?.message || "Failed to update member role.");
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.displayName) return;
    try {
      setError(null);
      const newProfile: UserProfile = {
        uid: `manual_${Date.now()}`,
        email: newUser.email,
        displayName: newUser.displayName,
        role: newUser.role || 'sales_rep',
        createdAt: serverTimestamp(),
      };
      
      const userDocRef = doc(db, 'users', newProfile.uid);
      await setDoc(userDocRef, { ...newProfile, password: newUser.password });
      
      setIsAddModalOpen(false);
      setNewUser({ email: '', displayName: '', password: '', role: 'sales_rep' });
    } catch (err: any) {
      console.error("Create user error:", err);
      setError(err?.message || "Failed to create new account profile.");
    }
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    if (!editForm.displayName || !editForm.email) {
      setError("Name and email are required.");
      return;
    }
    try {
      setError(null);
      const userRef = doc(db, 'users', editingUser.uid);
      await updateDoc(userRef, {
        displayName: editForm.displayName,
        email: editForm.email,
        password: editForm.password,
      });
      setEditingUser(null);
    } catch (err: any) {
      console.error("Update user error:", err);
      setError(err?.message || "Failed to update member profile details.");
    }
  };

  const handleDeleteMember = async (userId: string) => {
    if (!isAdmin) {
      setError("Permission Denied: Only administrators can delete team members.");
      return;
    }
    try {
      setError(null);
      await deleteDoc(doc(db, 'users', userId));
      setMemberToDelete(null);
    } catch (err: any) {
      console.error("Delete member error:", err);
      let errMsg = err?.message || String(err);
      if (errMsg.includes("permission-denied") || errMsg.includes("Permission Denied")) {
        errMsg = "Permission Denied: Your account does not have sufficient permission to delete profiles in Firestore rules.";
      }
      setError(errMsg);
      setMemberToDelete(null);
    }
  };

  return (
    <div className="p-10 flex flex-col h-full bg-[#FBFBFC] max-w-7xl mx-auto w-full overflow-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#1D1D1F]">Team & Targets</h1>
          <p className="text-slate-500 text-[13px] font-medium mt-1">Manage sales representative permissions and monthly enrollment targets.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-4 py-2 border border-slate-200/65 rounded-2xl shadow-sm">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Active Month</span>
            <input 
              type="month" 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="text-xs font-bold text-[#1D1D1F] outline-none border-none bg-transparent cursor-pointer p-0"
            />
          </div>
          {isAdmin && (
             <button 
              onClick={() => {
                setNewUser({ email: '', displayName: '', password: generateRandomPassword() });
                setIsAddModalOpen(true);
              }}
              className="bento-button-primary"
             >
               <UserPlus size={18} strokeWidth={2.5} />
               Add Member
             </button>
          )}
        </div>
      </header>

      {error && (
        <div className="mb-10 p-5 bg-rose-50 border border-rose-100 rounded-[24px] text-rose-700 flex items-start gap-3 relative animate-fade-in pr-10">
          <Trash2 size={18} className="shrink-0 mt-0.5 text-rose-500" />
          <div className="space-y-1">
            <p className="text-xs font-black uppercase tracking-widest text-rose-800">Operation Error</p>
            <p className="text-xs font-medium text-rose-600/90 leading-relaxed">{error}</p>
          </div>
          <button id="close_error" onClick={() => setError(null)} className="absolute top-5 right-5 text-rose-400 hover:text-rose-600">
            <X size={16} />
          </button>
        </div>
      )}

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-[#1D1D1F]/20 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] shadow-2xl max-w-md w-full p-10 relative overflow-hidden">
             <button onClick={() => setIsAddModalOpen(false)} className="absolute top-8 right-8 text-slate-400 hover:text-slate-600">
               <X size={20} />
             </button>
             <h2 className="text-2xl font-bold tracking-tight text-[#1D1D1F] mb-2">New Account</h2>
             <p className="text-slate-500 text-[13px] mb-8">Direct login without Google. Set credentials below.</p>
             
             <div className="space-y-5">
               <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                  <input 
                    type="text"
                    value={newUser.displayName}
                    onChange={e => setNewUser({...newUser, displayName: e.target.value})}
                    placeholder="John Doe"
                    className="minimal-input"
                  />
               </div>
               <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email</label>
                  <input 
                    type="email"
                    value={newUser.email}
                    onChange={e => setNewUser({...newUser, email: e.target.value})}
                    placeholder="email@example.com"
                    className="minimal-input"
                  />
               </div>
               <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Password</label>
                  <div className="relative">
                    <input 
                      type="text"
                      value={newUser.password}
                      onChange={e => setNewUser({...newUser, password: e.target.value})}
                      placeholder="••••••••"
                      className="minimal-input pr-12"
                    />
                    <button 
                      type="button"
                      onClick={() => setNewUser({ ...newUser, password: generateRandomPassword() })}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-slate-300 hover:text-indigo-600 transition-colors"
                      title="Generate Password"
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>
               </div>
               <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Role</label>
                  <select 
                    value={newUser.role}
                    onChange={e => setNewUser({...newUser, role: e.target.value as UserRole})}
                    className="minimal-input bg-slate-100/50 cursor-pointer"
                  >
                    <option value="sales_rep">Sales Representative</option>
                    <option value="admin">Administrator Privilege</option>
                  </select>
               </div>
             </div>

             <div className="flex gap-3 mt-10">
               <button onClick={() => setIsAddModalOpen(false)} className="flex-1 py-4 bg-slate-50 text-slate-400 rounded-full font-bold uppercase text-[10px] tracking-widest hover:bg-slate-100 transition-colors">Cancel</button>
               <button 
                  onClick={handleCreateUser}
                  className="flex-1 py-4 bg-indigo-600 text-white rounded-full font-bold uppercase text-[10px] tracking-widest shadow-xl shadow-indigo-600/10 hover:bg-indigo-700 transition-all"
               >
                 Create
               </button>
             </div>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 bg-[#1D1D1F]/20 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] shadow-2xl max-w-md w-full p-10 relative overflow-hidden animate-fade-in">
             <button onClick={() => setEditingUser(null)} className="absolute top-8 right-8 text-slate-400 hover:text-slate-600">
               <X size={20} />
             </button>
             <h2 className="text-2xl font-bold tracking-tight text-[#1D1D1F] mb-1">Edit Account</h2>
             <p className="text-slate-500 text-[12px] mb-8">Update member name, email, or credentials to allow direct login access.</p>
             
             <div className="space-y-5">
                <div className="space-y-1.5">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                   <input 
                     type="text"
                     value={editForm.displayName}
                     onChange={e => setEditForm({...editForm, displayName: e.target.value})}
                     placeholder="John Doe"
                     className="minimal-input"
                   />
                </div>
                <div className="space-y-1.5">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email</label>
                   <input 
                     type="email"
                     value={editForm.email}
                     onChange={e => setEditForm({...editForm, email: e.target.value})}
                     placeholder="email@example.com"
                     className="minimal-input"
                   />
                </div>
                <div className="space-y-1.5">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Password / PIN</label>
                   <div className="relative">
                     <input 
                       type="text"
                       value={editForm.password}
                       onChange={e => setEditForm({...editForm, password: e.target.value})}
                       placeholder="••••••••"
                       className="minimal-input pr-12"
                     />
                     <button 
                       type="button"
                       onClick={() => setEditForm({...editForm, password: generateRandomPassword()})}
                       className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-slate-300 hover:text-indigo-600 transition-colors"
                     >
                       <RefreshCw size={14} />
                     </button>
                   </div>
                </div>
             </div>

             <div className="flex gap-3 mt-10">
                <button onClick={() => setEditingUser(null)} className="flex-1 py-4 bg-slate-50 text-slate-400 rounded-full font-bold uppercase text-[10px] tracking-widest hover:bg-slate-100 transition-colors">Cancel</button>
                <button 
                   onClick={handleSaveEdit}
                   className="flex-1 py-4 bg-indigo-650 text-white rounded-full font-bold uppercase text-[10px] tracking-widest shadow-xl shadow-indigo-600/10 hover:opacity-90 transition-all"
                >
                  Save Changes
                </button>
             </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden bg-white border border-slate-200/60 rounded-[32px] shadow-sm flex flex-col mb-10">
        <div className="divide-y divide-slate-50">
          {team.map((member) => (
            <div key={member.uid} className="px-8 py-6 flex items-center justify-between group hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-5">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-400 text-lg">
                  {member.displayName ? member.displayName[0] : '?'}
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-[#1D1D1F]">{member.displayName}</h4>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    <p className="text-[11px] text-slate-400 font-medium">{member.email}</p>
                    {member.password && isAdmin && (
                      <span className="text-[9px] font-mono font-black uppercase px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md border border-indigo-100/40">
                        Pass: {member.password}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6">
                {/* Round Robin custom toggle switch */}
                <div className="flex items-center gap-2 mr-2 bg-slate-50/75 border border-slate-100 px-3.5 py-1.5 rounded-2xl select-none">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Add Leads (RR)</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox"
                      checked={member.email?.toLowerCase().trim() === 'bhaskarnagendra@gmail.com' ? false : (member.receiveRoundRobin !== false)}
                      disabled={!isAdmin || member.email?.toLowerCase().trim() === 'bhaskarnagendra@gmail.com'}
                      onChange={async (e) => {
                        try {
                          setError(null);
                          const memberRef = doc(db, 'users', member.uid);
                          await updateDoc(memberRef, { receiveRoundRobin: e.target.checked });
                        } catch (err: any) {
                          console.error("Failed to update round robin preference:", err);
                          setError("Failed to update round robin preference: " + (err.message || String(err)));
                        }
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                {/* Monthly targets management */}
                {member.role === 'sales_rep' && (
                  <div className="flex items-center gap-2 bg-slate-50/75 border border-slate-100 px-3.5 py-1.5 rounded-2xl select-none">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">Target</span>
                    
                    {editingTargetUserId === member.uid ? (
                      <div className="flex items-center gap-1.5 animate-fade-in">
                        <input
                          type="number"
                          min="0"
                          value={editTargetValue}
                          onChange={(e) => setEditTargetValue(e.target.value)}
                          className="w-14 bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-xs text-center font-bold focus:outline-none focus:border-indigo-400"
                          placeholder="qty"
                        />
                        <button
                          onClick={() => handleSaveTarget(member.uid, member.displayName || '')}
                          className="p-1 bg-indigo-100 hover:bg-indigo-650 text-indigo-600 hover:text-white rounded-lg transition-all cursor-pointer"
                          title="Save Target"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setEditingTargetUserId(null)}
                          className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg transition-all cursor-pointer"
                          title="Cancel"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {(() => {
                          const tDoc = targets.find(t => t.userId === member.uid && t.month === selectedMonth);
                          const currentEnrolments = getEnrollmentCount(member.uid, selectedMonth);
                          const hasTarget = !!tDoc;
                          
                          return (
                            <>
                              <span className="text-xs font-bold text-slate-700">
                                {currentEnrolments}
                                {hasTarget ? (
                                  <>
                                    <span className="text-slate-400 font-medium">/{tDoc.target}</span>
                                    <span className="text-[10px] text-indigo-600 font-extrabold ml-1.5 uppercase tracking-wide">
                                      ({Math.round((currentEnrolments / tDoc.target) * 100) || 0}%)
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-slate-400 text-[10px] italic font-normal ml-1">enrolled</span>
                                )}
                              </span>
                              
                              {isAdmin && (
                                <div className="flex items-center gap-1 ml-1">
                                  <button
                                    onClick={() => {
                                      setEditingTargetUserId(member.uid);
                                      setEditTargetValue(hasTarget ? tDoc.target : '');
                                    }}
                                    className="p-1 text-slate-300 hover:text-indigo-650 hover:bg-white rounded-lg transition-all cursor-pointer"
                                    title="Assign / Edit Target"
                                    id={`assign_target_btn_${member.uid}`}
                                  >
                                    <Edit2 size={12} strokeWidth={2.5} />
                                  </button>
                                  {hasTarget && (
                                    <button
                                      onClick={() => handleRemoveTarget(tDoc.id)}
                                      className="p-1 text-slate-300 hover:text-rose-600 hover:bg-white rounded-lg transition-all cursor-pointer"
                                      title="Clear Target"
                                      id={`clear_target_btn_${member.uid}`}
                                    >
                                      <Trash2 size={12} strokeWidth={2.5} />
                                    </button>
                                  )}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <select
                    disabled={!isAdmin || member.uid === profile?.uid}
                    value={member.role}
                    onChange={(e) => handleRoleChange(member.uid, e.target.value as UserRole)}
                    className="text-[10px] font-black uppercase tracking-widest bg-white border border-slate-100 rounded-xl px-4 py-2 focus:ring-0 focus:border-[#1D1D1F] transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <option value="sales_rep">Sales Rep</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                
                {isAdmin && (
                  <button 
                    onClick={() => {
                      setEditingUser(member);
                      setEditForm({
                        displayName: member.displayName || '',
                        email: member.email || '',
                        password: member.password || '',
                      });
                    }}
                    title="Edit Name and Password"
                    className="p-2 text-slate-300 hover:text-indigo-600 transition-colors"
                  >
                    <Edit2 size={18} />
                  </button>
                )}

                {isAdmin && member.uid !== profile?.uid && (
                  <button 
                    onClick={() => setMemberToDelete(member)}
                    className="p-2 text-slate-200 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <div className="p-10 rounded-[32px] bg-white border border-slate-200/60 shadow-sm relative overflow-hidden">
          <h3 className="text-sm font-bold text-[#1D1D1F] uppercase tracking-widest mb-4">Invite Rep</h3>
          <p className="text-[#1D1D1F]/60 text-[13px] leading-relaxed mb-6 font-medium">Send this link to your team. Once they login, they will appear in the directory for role assignment.</p>
          <div className="flex gap-2">
            <input 
              type="text" 
              readOnly 
              value={window.location.origin}
              className="flex-1 bg-slate-50 border-none rounded-2xl px-6 py-3 text-[11px] font-mono text-slate-400 focus:ring-0"
            />
            <button 
              onClick={() => navigator.clipboard.writeText(window.location.origin)}
              className="px-6 py-3 bg-indigo-600 text-white rounded-2xl text-[11px] font-bold uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-md shadow-indigo-650/10 hover:shadow-indigo-650/20"
            >
              Copy
            </button>
          </div>
        </div>

        <div className="p-10 rounded-[32px] bg-gradient-to-tr from-indigo-900 via-indigo-950 to-purple-950 border-none text-white flex flex-col justify-between shadow-xl shadow-indigo-950/25">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-300/80">Distribution</h3>
          <div className="flex items-end gap-10 mt-6">
            <div>
              <p className="text-4xl font-bold">{team.filter(m => m.role === 'sales_rep').length}</p>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Representatives</p>
            </div>
            <div className="w-px h-10 bg-white/10"></div>
            <div>
              <p className="text-4xl font-bold">{team.filter(m => m.role === 'admin').length}</p>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Administrators</p>
            </div>
          </div>
        </div>
      </div>

      {memberToDelete && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div id="delete_team_confirm_modal" className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-sm w-full p-8 relative overflow-hidden animate-fade-in">
            <button onClick={() => setMemberToDelete(null)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
            <div className="w-12 h-12 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-center text-rose-500 mb-6">
              <Trash2 size={24} />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-800 mb-2">Remove Member?</h2>
            <p className="text-slate-500 text-sm mb-6">
              Are you sure you want to remove <span className="font-bold text-slate-800">{memberToDelete.displayName || 'this member'}</span>? This action is permanent and cannot be undone.
            </p>
            <div className="flex gap-3">
              <button 
                type="button"
                onClick={() => setMemberToDelete(null)} 
                className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-sm font-semibold transition-all text-center"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={() => handleDeleteMember(memberToDelete.uid)} 
                className="flex-1 px-4 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-sm font-semibold shadow-md shadow-rose-600/10 hover:shadow-rose-600/20 active:translate-y-[1px] transition-all text-center"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
