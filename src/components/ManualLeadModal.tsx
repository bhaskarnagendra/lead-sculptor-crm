import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { X, User, Mail, Phone, BookOpen, Share2, Save, Tag, AlertTriangle } from 'lucide-react';
import { db } from '../lib/firebase';
import { LeadStatus, OperationType, Course } from '../types';
import { handleFirestoreError } from './AuthContext';
import { calculateLeadScore } from '../utils/LeadScoring';
import { getNextAssignedUser } from '../utils/LeadAssignment';

interface ManualLeadModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const ManualLeadModal: React.FC<ManualLeadModalProps> = ({ onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customFieldsConfig, setCustomFieldsConfig] = useState<any[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    courseName: '',
    courseId: '',
    discount: 0,
    source: '',
    status: 'new' as LeadStatus
  });
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, any>>({});

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const docRef = doc(db, 'config', 'lead_schema');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setCustomFieldsConfig(snap.data().fields || []);
        }
      } catch (err) {
        console.error("Error fetching lead schema:", err);
      }
    };

    const fetchCourses = async () => {
      try {
        const coursesRef = collection(db, 'courses');
        const snap = await getDocs(coursesRef);
        setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Course)));
      } catch (err) {
        console.error("Error fetching courses:", err);
      }
    };

    fetchConfig();
    fetchCourses();
  }, []);

  const handleCourseChange = (courseId: string) => {
    const selectedCourse = courses.find(c => c.id === courseId);
    setFormData({
      ...formData, 
      courseId, 
      courseName: selectedCourse ? selectedCourse.name : ''
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setLoading(true);
    setError(null);
    try {
      // Duplication Check against database
      const trimmedEmail = formData.email?.trim();
      const trimmedPhone = formData.phone?.trim();

      if (trimmedEmail || trimmedPhone) {
        const checkRef = collection(db, 'leads');
        const dbChecks = [];
        
        if (trimmedEmail) {
          dbChecks.push(getDocs(query(checkRef, where('email', '==', trimmedEmail))));
        }
        if (trimmedPhone) {
          dbChecks.push(getDocs(query(checkRef, where('phone', '==', trimmedPhone))));
        }

        const querySnaps = await Promise.all(dbChecks);
        const exists = querySnaps.some(snap => !snap.empty);

        if (exists) {
          setError("A lead with this email or phone number already exists.");
          setLoading(false);
          return;
        }
      }

      const score = calculateLeadScore({
         ...formData,
         customFields: customFieldValues
      });

      const assignment = await getNextAssignedUser();
      const assignedUser = assignment?.user;

      await addDoc(collection(db, 'leads'), {
        ...formData,
        score,
        mainStatus: 'New Lead',
        subStatus: 'Fresh Inquiry',
        priorityTag: 'Warm',
        assignedTo: assignedUser?.uid || null,
        assignedName: assignedUser?.displayName || null,
        customFields: customFieldValues,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to register lead.");
      handleFirestoreError(err, OperationType.CREATE, 'leads');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#1D1D1F]/20 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200/60 max-h-[90vh] flex flex-col">
        <header className="px-10 py-8 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[#1D1D1F]">New Lead</h2>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-50 rounded-full transition-all text-slate-400">
            <X size={20} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="px-10 pb-10 space-y-6 overflow-auto">
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-2.5 text-xs font-semibold text-rose-600 animate-slide-up">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <div className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
              <input 
                required
                type="text"
                placeholder="Prospect Name"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="minimal-input"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email</label>
                <input 
                  type="email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  className="minimal-input"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Phone</label>
                <input 
                  type="text"
                  placeholder="Phone"
                  value={formData.phone}
                  onChange={e => setFormData({...formData, phone: e.target.value})}
                  className="minimal-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Course</label>
                <select 
                  value={formData.courseId}
                  onChange={e => handleCourseChange(e.target.value)}
                  className="minimal-input"
                >
                  <option value="">Select Course</option>
                  {courses.map(course => (
                    <option key={course.id} value={course.id}>{course.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Discount Applied</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
                  <input 
                    type="number"
                    placeholder="0.00"
                    value={formData.discount || ''}
                    onChange={e => setFormData({...formData, discount: Number(e.target.value)})}
                    className="minimal-input pl-8"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Source</label>
              <select 
                value={formData.source}
                onChange={e => setFormData({...formData, source: e.target.value})}
                className="minimal-input"
              >
                <option value="">Select Source Option</option>
                {["Google Ads", "Meta Ads", "Instagram", "YouTube", "Referral", "Website", "Walk-in"].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {customFieldsConfig.length > 0 && (
              <div className="pt-4 border-t border-slate-50 space-y-5">
                <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Additional Attributes</h3>
                {customFieldsConfig.map(field => (
                  <div key={field.id} className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{field.label}</label>
                    <input 
                      type={field.type === 'select' ? 'text' : field.type}
                      value={customFieldValues[field.label] || ''}
                      onChange={e => setCustomFieldValues({...customFieldValues, [field.label]: e.target.value})}
                      className="minimal-input"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-6 flex gap-3">
             <button 
              type="button" 
              onClick={onClose}
              className="flex-1 py-4 bg-slate-50 text-slate-400 rounded-full font-bold uppercase text-[10px] tracking-widest hover:bg-slate-100 transition-colors"
             >
               Cancel
             </button>
             <button 
              type="submit" 
              disabled={loading}
              className="flex-[2] py-4 bg-[#1D1D1F] text-white rounded-full font-bold uppercase text-[10px] tracking-widest shadow-xl shadow-[#1D1D1F]/5 hover:opacity-90 transition-all flex items-center justify-center gap-2 group disabled:opacity-20"
             >
               {loading ? 'Creating...' : 'Register'}
             </button>
          </div>
        </form>
      </div>
    </div>
  );
};
