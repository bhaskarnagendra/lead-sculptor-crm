import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, updateDoc, collection, addDoc, serverTimestamp, query, orderBy, Timestamp, getDocs, where } from 'firebase/firestore';
import { X, Phone, Mail, Calendar, MessageSquare, Plus, Save, History, Award, User, Clock, Sparkles, TrendingUp, Trash2, Trophy, CheckCircle2, ThumbsUp, Star, Zap, ShieldCheck } from 'lucide-react';
import { db } from '../lib/firebase';
import { Lead, FollowUp, LeadStatus, OperationType, UserProfile, Course } from '../types';
import { useAuth, handleFirestoreError } from './AuthContext';
import { calculateLeadScore, getScoreColor, getStatusStyle } from '../utils/LeadScoring';
import { motion } from 'motion/react';

const STATUS_GROUPS: Record<string, { dbStatus: LeadStatus; label: string; bg: string; border: string; text: string; icon: any; options?: string[]; reasons?: string[]; timeOptions?: string[] }> = {
  "New Lead": {
    dbStatus: 'new',
    label: 'New Lead',
    bg: 'bg-indigo-50/50 hover:bg-indigo-50',
    border: 'border-indigo-150',
    text: 'text-indigo-600',
    icon: Sparkles,
    options: ["Fresh Inquiry", "Not Contacted", "Auto Assigned"]
  },
  "Contacted": {
    dbStatus: 'contacted',
    label: 'Contacted',
    bg: 'bg-cyan-50/50 hover:bg-cyan-50',
    border: 'border-cyan-150',
    text: 'text-cyan-600',
    icon: Phone,
    options: ["Connected", "No Response", "Wrong Number", "Switched Off", "Busy", "WhatsApp Sent", "Email Sent"]
  },
  "Callback Required": {
    dbStatus: 'interested',
    label: 'Callback Required',
    bg: 'bg-amber-50/50 hover:bg-amber-50',
    border: 'border-amber-150',
    text: 'text-amber-600',
    icon: Clock,
    reasons: ["Asked to Call Later", "In Meeting", "Travelling", "Busy at Work", "Family Discussion Pending", "Weekend Callback", "Salary Awaited", "Needs More Information", "Wants Demo/Class", "Follow-up After Exam", "Follow-up After Results"],
    timeOptions: ["Tomorrow", "3 Days Later", "Next Week", "Next Month", "Custom Date & Time"]
  },
  "Future Prospect": {
    dbStatus: 'interested',
    label: 'Future Prospect',
    bg: 'bg-purple-50/50 hover:bg-purple-50',
    border: 'border-purple-150',
    text: 'text-purple-600',
    icon: TrendingUp,
    reasons: ["Interested Later", "Planning Next Intake", "Financial Issue", "Comparing Institutes", "Wants Scholarship", "Waiting for Loan", "Waiting for Parents Approval", "Abroad Plans Pending", "Course Not Finalized", "Wants Online Batch", "Interested in Different Course"]
  },
  "Lost Lead": {
    dbStatus: 'lost',
    label: 'Lost Lead',
    bg: 'bg-rose-50/50 hover:bg-rose-50',
    border: 'border-rose-150',
    text: 'text-rose-600',
    icon: Trash2,
    reasons: ["Joined Competitor", "Fee Too High", "Not Interested", "No Budget", "No Response After Multiple Attempts", "Course Not Relevant", "Location Issue", "Timing Issue", "Fake Inquiry", "Duplicate Lead", "Already Skilled", "Medical/Personal Reason", "Poor Portfolio Eligibility", "Visa Rejected", "Academic Eligibility Issue"]
  },
  "Qualified": {
    dbStatus: 'interested',
    label: 'Qualified',
    bg: 'bg-teal-50/50 hover:bg-teal-50',
    border: 'border-teal-150',
    text: 'text-teal-600',
    icon: ShieldCheck,
    options: ["Eligible", "Documents Received", "Demo Attended", "Counseling Completed", "Parent Discussion Done"]
  },
  "Converted": {
    dbStatus: 'enrolled',
    label: 'Converted',
    bg: 'bg-emerald-50/50 hover:bg-emerald-50',
    border: 'border-emerald-150',
    text: 'text-emerald-600',
    icon: Trophy,
    options: ["Registration Done", "Partial Payment", "Full Payment", "Admission Confirmed"]
  }
};

interface LeadDetailModalProps {
  leadId: string;
  onClose: () => void;
}

export const LeadDetailModal: React.FC<LeadDetailModalProps> = ({ leadId, onClose }) => {
  const [lead, setLead] = useState<Lead | null>(null);
  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [team, setTeam] = useState<UserProfile[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [activeTab, setActiveTab] = useState<'info' | 'tasks'>('info');
  const [newNote, setNewNote] = useState('');
  const [review, setReview] = useState('');
  const [discount, setDiscount] = useState(0);
  const [saving, setSaving] = useState(false);
  const { profile, isAdmin } = useAuth();

  useEffect(() => {
    const leadRef = doc(db, 'leads', leadId);
    const unsubscribeLead = onSnapshot(leadRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data() as Lead;
        setLead({ id: doc.id, ...data });
        setReview(data.leadReview || '');
        setDiscount(data.discount || 0);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `leads/${leadId}`));

    const followupsRef = collection(db, 'leads', leadId, 'followups');
    const q = query(followupsRef, orderBy('createdAt', 'desc'));
    const unsubscribeFollowups = onSnapshot(q, (snapshot) => {
      setFollowups(snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as FollowUp[]);
    }, (err) => handleFirestoreError(err, OperationType.LIST, `leads/${leadId}/followups`));

    // Fetch team and courses
    const fetchData = async () => {
      const usersRef = collection(db, 'users');
      const teamSnap = await getDocs(query(usersRef, where('role', 'in', ['sales_rep', 'admin'])));
      setTeam(teamSnap.docs.map(d => ({ ...d.data() } as UserProfile)));

      const coursesRef = collection(db, 'courses');
      const courseSnap = await getDocs(coursesRef);
      setCourses(courseSnap.docs.map(d => ({ id: d.id, ...d.data() } as Course)));
    };
    fetchData();

    return () => {
      unsubscribeLead();
      unsubscribeFollowups();
    };
  }, [leadId]);

  const handleUpdateBilling = async () => {
    if (!lead) return;
    try {
      const leadRef = doc(db, 'leads', leadId);
      await updateDoc(leadRef, {
        discount: Number(discount),
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `leads/${leadId}`);
    }
  };

  const handleReassign = async (userId: string) => {
    if (!lead || !isAdmin) return;
    const selectedUser = team.find(u => u.uid === userId);
    if (!selectedUser) return;

    try {
      const leadRef = doc(db, 'leads', leadId);
      await updateDoc(leadRef, {
        assignedTo: selectedUser.uid,
        assignedName: selectedUser.displayName,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `leads/${leadId}`);
    }
  };

  const handleSaveReview = async () => {
    if (!lead) return;
    try {
      const leadRef = doc(db, 'leads', leadId);
      await updateDoc(leadRef, {
        leadReview: review,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `leads/${leadId}`);
    }
  };

  const getFallbackMainStatus = (): string => {
    if (lead?.mainStatus) return lead.mainStatus;
    switch (lead?.status) {
      case 'new': return 'New Lead';
      case 'contacted': return 'Contacted';
      case 'interested': return 'Callback Required';
      case 'enrolled': return 'Converted';
      case 'lost': return 'Lost Lead';
      default: return 'New Lead';
    }
  };

  const handleUpdateStatus = async (status: LeadStatus) => {
    if (!lead) return;
    try {
      const leadRef = doc(db, 'leads', leadId);
      const newScore = calculateLeadScore({ ...lead, status });
      await updateDoc(leadRef, { 
        status, 
        score: newScore,
        updatedAt: serverTimestamp() 
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `leads/${leadId}`);
    }
  };

  const changeMainStatus = async (newMainStatus: string) => {
    if (!lead) return;
    let baseStatus: LeadStatus = 'new';
    if (newMainStatus === 'New Lead') baseStatus = 'new';
    else if (newMainStatus === 'Contacted') baseStatus = 'contacted';
    else if (newMainStatus === 'Callback Required') baseStatus = 'interested';
    else if (newMainStatus === 'Future Prospect') baseStatus = 'interested';
    else if (newMainStatus === 'Lost Lead') baseStatus = 'lost';
    else if (newMainStatus === 'Qualified') baseStatus = 'interested';
    else if (newMainStatus === 'Converted') baseStatus = 'enrolled';

    const group = STATUS_GROUPS[newMainStatus];
    const defaultSub = group.options ? group.options[0] : (group.reasons ? group.reasons[0] : '');

    const updateData: any = {
      mainStatus: newMainStatus,
      subStatus: defaultSub,
      status: baseStatus,
      updatedAt: serverTimestamp()
    };

    if (newMainStatus === 'Callback Required') {
      updateData.callbackReason = group.reasons?.[0] || '';
      updateData.callbackTimeOption = group.timeOptions?.[0] || '';
      updateData.subStatus = group.reasons?.[0] || '';
    } else if (newMainStatus === 'Future Prospect') {
      updateData.prospectReason = group.reasons?.[0] || '';
      updateData.subStatus = group.reasons?.[0] || '';
    } else if (newMainStatus === 'Lost Lead') {
      updateData.lostReason = group.reasons?.[0] || '';
      updateData.subStatus = group.reasons?.[0] || '';
    }

    try {
      const leadRef = doc(db, 'leads', leadId);
      const newScore = calculateLeadScore({ ...lead, status: baseStatus, customFields: { ...lead.customFields, mainStatus: newMainStatus, subStatus: defaultSub } });
      updateData.score = newScore;
      await updateDoc(leadRef, updateData);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `leads/${leadId}`);
    }
  };

  const changeSubStatus = async (newSubStatus: string) => {
    if (!lead) return;
    try {
      const leadRef = doc(db, 'leads', leadId);
      const updateData: any = {
        subStatus: newSubStatus,
        updatedAt: serverTimestamp()
      };
      
      const currentMain = getFallbackMainStatus();
      if (currentMain === 'Callback Required') {
        updateData.callbackReason = newSubStatus;
      } else if (currentMain === 'Future Prospect') {
        updateData.prospectReason = newSubStatus;
      } else if (currentMain === 'Lost Lead') {
        updateData.lostReason = newSubStatus;
      }

      await updateDoc(leadRef, updateData);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `leads/${leadId}`);
    }
  };

  const changePriorityTag = async (tag: 'Hot' | 'Warm' | 'Cold') => {
    if (!lead) return;
    try {
      const leadRef = doc(db, 'leads', leadId);
      await updateDoc(leadRef, {
        priorityTag: tag,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `leads/${leadId}`);
    }
  };

  const changeCallbackTime = async (timeOption: string, customDate: string = '') => {
    if (!lead) return;
    let nextDate: Date | null = null;
    const now = new Date();

    if (timeOption === 'Tomorrow') {
      nextDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 10, 0, 0); // Tomorrow at 10 AM
    } else if (timeOption === '3 Days Later') {
      nextDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, now.getHours(), now.getMinutes());
    } else if (timeOption === 'Next Week') {
      nextDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, now.getHours(), now.getMinutes());
    } else if (timeOption === 'Next Month') {
      nextDate = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes());
    } else if (timeOption === 'Custom Date & Time' && customDate) {
      nextDate = new Date(customDate);
    }

    try {
      const leadRef = doc(db, 'leads', leadId);
      const updateData: any = {
        callbackTimeOption: timeOption,
        updatedAt: serverTimestamp()
      };
      if (customDate) {
        updateData.callbackCustomDateTime = customDate;
      }
      if (nextDate) {
        updateData.nextFollowUp = Timestamp.fromDate(nextDate);
      }
      await updateDoc(leadRef, updateData);

      if (nextDate) {
        const followupsRef = collection(db, 'leads', leadId, 'followups');
        await addDoc(followupsRef, {
          leadId,
          leadName: lead.name,
          assignedTo: lead.assignedTo || null,
          note: `Auto-scheduled follow up callback set for ${nextDate.toLocaleString()} (${timeOption})`,
          type: 'call',
          status: 'pending',
          scheduledAt: Timestamp.fromDate(nextDate),
          createdAt: serverTimestamp()
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `leads/${leadId}`);
    }
  };

  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledType, setScheduledType] = useState<'call' | 'meeting' | 'email'>('call');

  // ... (inside handleAddFollowUp)
  const handleAddFollowUp = async (isScheduled: boolean = false) => {
    if (!newNote.trim() || !lead) return;
    try {
      const followupsRef = collection(db, 'leads', leadId, 'followups');
      await addDoc(followupsRef, {
        leadId,
        leadName: lead.name,
        assignedTo: lead.assignedTo || null,
        note: newNote,
        type: isScheduled ? scheduledType : 'call',
        status: isScheduled ? 'pending' : 'completed',
        scheduledAt: isScheduled && scheduledDate ? Timestamp.fromDate(new Date(scheduledDate)) : serverTimestamp(),
        createdAt: serverTimestamp()
      });

      if (isScheduled && scheduledDate) {
        const leadRef = doc(db, 'leads', leadId);
        await updateDoc(leadRef, {
          nextFollowUp: Timestamp.fromDate(new Date(scheduledDate)),
          updatedAt: serverTimestamp()
        });
      }

      setNewNote('');
      setScheduledDate('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `leads/${leadId}/followups`);
    }
  };

  if (!lead) return null;

  const currentCourse = courses.find(c => c.id === lead.courseId || c.name === lead.courseName);
  const totalFees = currentCourse?.fees || 0;
  const finalPrice = Math.max(0, totalFees - (lead.discount || 0));

  return (
    <div className="fixed inset-0 bg-[#1D1D1F]/20 backdrop-blur-[2px] flex items-center justify-end z-50">
      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        className="bg-white h-full w-full max-w-2xl border-l border-slate-200/60 flex flex-col shadow-2xl"
      >
        <header className="p-10 pb-6 flex justify-between items-start">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className={`px-2.5 py-1 rounded-full text-[9px] font-black border transition-all uppercase tracking-widest ${getStatusStyle(lead.status)}`}>
                {lead.mainStatus || lead.status}
              </span>
              {lead.subStatus && (
                <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                  {lead.subStatus}
                </span>
              )}
              {lead.priorityTag && (
                <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${
                  lead.priorityTag === 'Hot' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                  lead.priorityTag === 'Warm' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                  'bg-indigo-50 text-indigo-600 border-indigo-100'
                }`}>
                  {lead.priorityTag}
                </span>
              )}
              <div className="w-1 h-1 rounded-full bg-slate-300"></div>
              <div className={`px-3 py-1 rounded-full text-[10px] font-black border transition-all ${getScoreColor(lead.score, lead.status)}`}>
                Score {lead.score}%
              </div>
            </div>
            <h2 className="text-4xl font-bold tracking-tight text-[#1D1D1F] leading-tight mb-2">{lead.name}</h2>
            <div className="flex gap-6 mt-4">
              <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500">
                <Mail size={16} className="text-slate-300" />
                {lead.email}
              </div>
              <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500">
                <Phone size={16} className="text-slate-300" />
                {lead.phone}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-50 rounded-full transition-colors text-slate-400">
            <X size={24} />
          </button>
        </header>

        <nav className="flex px-10 gap-10 border-b border-slate-50">
          <button 
            onClick={() => setActiveTab('info')}
            className={`py-5 text-[11px] font-bold uppercase tracking-widest transition-all ${activeTab === 'info' ? 'text-[#1D1D1F] border-b-2 border-[#1D1D1F]' : 'text-slate-400 hover:text-slate-600 border-b-2 border-transparent'}`}
          >
            Overview
          </button>
          <button 
            onClick={() => setActiveTab('tasks')}
            className={`py-5 text-[11px] font-bold uppercase tracking-widest transition-all ${activeTab === 'tasks' ? 'text-[#1D1D1F] border-b-2 border-[#1D1D1F]' : 'text-slate-400 hover:text-slate-600 border-b-2 border-transparent'}`}
          >
            Activities ({followups.length})
          </button>
        </nav>

        <div className="flex-1 overflow-auto p-10 bg-white">
          {activeTab === 'info' ? (
            <div className="space-y-12">
              <section className="bg-slate-50/40 p-6 rounded-[32px] border border-slate-100">
                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">Pipeline Status</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
                  {Object.keys(STATUS_GROUPS).map((s) => {
                    const group = STATUS_GROUPS[s];
                    const GroupIcon = group.icon;
                    const isActive = getFallbackMainStatus() === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => changeMainStatus(s)}
                        className={`p-3 rounded-2xl border text-[10px] font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                          isActive 
                            ? 'bg-[#1D1D1F] border-[#1D1D1F] text-white shadow-md' 
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-350'
                        }`}
                      >
                        <GroupIcon size={14} className={isActive ? 'text-white' : group.text} />
                        {s}
                      </button>
                    );
                  })}
                </div>

                {/* Sub-status choices based on the selected group */}
                <div className="mt-4 pt-4 border-t border-slate-100/50 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Dropdown for options / reasons */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                      {getFallbackMainStatus() === 'Callback Required' ? 'Callback Reason' :
                       getFallbackMainStatus() === 'Future Prospect' ? 'Prospect Reason' :
                       getFallbackMainStatus() === 'Lost Lead' ? 'Lost Reason' : 'Sub-Category'}
                    </label>
                    <select
                      value={lead.subStatus || ''}
                      onChange={(e) => changeSubStatus(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 hover:border-[#1D1D1F] rounded-xl text-xs font-bold text-[#1D1D1F] focus:ring-0 outline-none transition-all cursor-pointer"
                    >
                      <option value="">Choose Option</option>
                      {(STATUS_GROUPS[getFallbackMainStatus()]?.options || STATUS_GROUPS[getFallbackMainStatus()]?.reasons || []).map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>

                  {/* If Callback Required, we ALSO show Callback Time selector */}
                  {getFallbackMainStatus() === 'Callback Required' && (
                    <div className="space-y-1.5 animate-pulse-subtle">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Callback Timeframe</label>
                      <select
                        value={lead.callbackTimeOption || 'Tomorrow'}
                        onChange={(e) => changeCallbackTime(e.target.value, lead.callbackCustomDateTime || '')}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 hover:border-[#1D1D1F] rounded-xl text-xs font-bold text-[#1D1D1F] focus:ring-0 outline-none transition-all cursor-pointer"
                      >
                        {STATUS_GROUPS["Callback Required"].timeOptions?.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* If Callback Required and "Custom Date & Time" option is chosen */}
                  {getFallbackMainStatus() === 'Callback Required' && lead.callbackTimeOption === 'Custom Date & Time' && (
                    <div className="col-span-1 md:col-span-2 space-y-1.5 bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100/40">
                      <label className="text-[9px] font-black uppercase tracking-widest text-indigo-700 block mb-1">Set Specific Callback Date & Time</label>
                      <input
                        type="datetime-local"
                        value={lead.callbackCustomDateTime || ''}
                        onChange={(e) => changeCallbackTime('Custom Date & Time', e.target.value)}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-[#1D1D1F] outline-none"
                      />
                    </div>
                  )}

                  {/* Priority tags selector (Hot, Warm, Cold) */}
                  <div className="space-y-1.5 col-span-1 md:col-span-2 mt-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Urgency Priority</label>
                    <div className="flex gap-2">
                      {["Hot", "Warm", "Cold"].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => changePriorityTag(p as any)}
                          className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                            lead.priorityTag === p 
                              ? p === 'Hot' ? 'bg-rose-600 border-rose-600 text-white shadow-sm' :
                                p === 'Warm' ? 'bg-amber-500 border-amber-500 text-white shadow-sm' :
                                'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                              : 'bg-white border-slate-200 text-slate-500 hover:border-slate-350'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <div className="flex justify-between items-center mb-6">
                  <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Details</h4>
                </div>
                <div className="space-y-6">
                  <div className="flex justify-between items-center py-4 border-b border-slate-50">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Course</span>
                    <select 
                      value={lead.courseId || ''}
                      onChange={async (e) => {
                        const courseId = e.target.value;
                        const course = courses.find(c => c.id === courseId);
                        if (!course) return;
                        try {
                          await updateDoc(doc(db, 'leads', leadId), {
                            courseId,
                            courseName: course.name,
                            updatedAt: serverTimestamp()
                          });
                        } catch (err) {
                          handleFirestoreError(err, OperationType.UPDATE, `leads/${leadId}`);
                        }
                      }}
                      className="text-[12px] font-bold bg-white border border-slate-100 rounded-xl px-4 py-1.5 focus:ring-0 focus:border-[#1D1D1F] outline-none cursor-pointer"
                    >
                      <option value="">Select Course</option>
                      {courses.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <section className="bg-slate-50/50 rounded-[32px] p-8 border border-slate-100">
                    <div className="flex justify-between items-center mb-6">
                      <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none">Billing & Fees</h4>
                      <button 
                        onClick={handleUpdateBilling}
                        className="text-[10px] font-black text-indigo-500 uppercase tracking-widest hover:underline"
                      >
                        Update Discount
                      </button>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-[12px] font-bold text-slate-400">Course Fees</span>
                        <span className="text-[14px] font-black text-[#1D1D1F]">₹{totalFees.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[12px] font-bold text-slate-400">Discount</span>
                        <div className="relative w-24">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">₹</span>
                          <input 
                            type="number"
                            value={discount}
                            onChange={(e) => setDiscount(Number(e.target.value))}
                            className="w-full bg-white border border-slate-100 rounded-xl px-6 py-1.5 text-[12px] font-bold text-rose-500 focus:ring-0 outline-none"
                          />
                        </div>
                      </div>
                      <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                        <span className="text-[13px] font-black text-[#1D1D1F] uppercase tracking-wider">Final Price</span>
                        <span className="text-xl font-black text-[#1D1D1F]">₹{finalPrice.toLocaleString()}</span>
                      </div>
                    </div>
                  </section>

                  <div className="flex justify-between items-center py-4 border-b border-slate-50">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Source</span>
                    <select 
                      value={lead.source || ''}
                      onChange={async (e) => {
                        const source = e.target.value;
                        try {
                          await updateDoc(doc(db, 'leads', leadId), {
                            source,
                            updatedAt: serverTimestamp()
                          });
                        } catch (err) {
                          handleFirestoreError(err, OperationType.UPDATE, `leads/${leadId}`);
                        }
                      }}
                      className="text-[12px] font-bold bg-white border border-slate-100 rounded-xl px-4 py-1.5 focus:ring-0 focus:border-[#1D1D1F] outline-none cursor-pointer"
                    >
                      <option value="">Select Source</option>
                      {["Google Ads", "Meta Ads", "Instagram", "YouTube", "Referral", "Website", "Walk-in"].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-between items-center py-4 border-b border-slate-50">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Owner</span>
                    {isAdmin ? (
                      <select 
                        value={lead.assignedTo || ''}
                        onChange={(e) => handleReassign(e.target.value)}
                        className="text-[12px] font-bold bg-white border border-slate-100 rounded-xl px-4 py-1.5 focus:ring-0 focus:border-[#1D1D1F] outline-none cursor-pointer"
                      >
                        <option value="">Unassigned</option>
                        {team.map(u => (
                          <option key={u.uid} value={u.uid}>{u.displayName}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-[14px] font-semibold text-[#1D1D1F]">{lead.assignedName || 'Unassigned'}</span>
                    )}
                  </div>
                  {Object.entries(lead.customFields || {}).map(([key, val]) => (
                    <div key={key} className="flex justify-between items-center py-4 border-b border-slate-50">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{key}</span>
                      <span className="text-[14px] font-semibold text-[#1D1D1F]">{String(val) || '—'}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="flex justify-between items-center mb-6">
                  <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Lead Review</h4>
                  <button 
                    onClick={handleSaveReview}
                    className="text-[10px] font-black text-indigo-500 uppercase tracking-widest hover:underline"
                  >
                    Save Review
                  </button>
                </div>
                <textarea 
                  value={review}
                  onChange={(e) => setReview(e.target.value)}
                  placeholder="Add a detailed review of this lead..."
                  className="w-full h-32 bg-slate-50 border-none rounded-3xl p-6 text-sm font-medium focus:ring-0 placeholder:text-slate-300"
                />
              </section>
            </div>
          ) : (
            <div className="space-y-10 h-full flex flex-col">
              <div className="flex-1">
                {followups.length === 0 ? (
                  <div className="h-64 flex items-center justify-center border-2 border-dashed border-slate-100 rounded-[32px]">
                    <p className="text-slate-300 text-sm font-medium">No activity recorded yet.</p>
                  </div>
                ) : (
                  <div className="space-y-10 relative before:content-[''] before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-50">
                    {followups.map((f) => (
                      <div key={f.id} className="relative pl-12">
                        <div className="absolute left-0 top-1 w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 shadow-sm z-10">
                          <History size={16} />
                        </div>
                        <div>
                          <p className="text-[14px] font-semibold text-[#1D1D1F] mb-1">{f.note}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                            {f.type} • {(f.createdAt?.toDate?.() || new Date()).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-10 border-t border-slate-100">
                <div className="flex gap-2 mb-6">
                   {['call', 'email', 'meeting'].map(t => (
                     <button 
                       key={t} 
                       onClick={() => setScheduledType(t as any)}
                       className={`px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${scheduledType === t ? 'bg-indigo-500 text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                     >
                       {t}
                     </button>
                   ))}
                </div>
                <textarea 
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Record a note..."
                  className="w-full h-24 border-none focus:ring-0 text-lg font-medium text-[#1D1D1F] bg-slate-50/30 rounded-3xl p-6 mb-6 placeholder:text-slate-300"
                />
                
                <div className="flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Schedule</span>
                    <input 
                      type="datetime-local" 
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="text-[12px] font-bold bg-white border border-slate-200 rounded-xl px-4 py-2"
                    />
                  </div>
                  <button 
                    onClick={() => handleAddFollowUp(!!scheduledDate)}
                    disabled={!newNote.trim()}
                    className="px-8 py-4 bg-[#1D1D1F] text-white rounded-full text-[11px] font-bold uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-20"
                  >
                    {scheduledDate ? 'Schedule' : 'Save Note'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
