import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { BookOpen, Clock, IndianRupee, Plus, Trash2, X, Edit2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { Course, OperationType } from '../types';
import { useAuth, handleFirestoreError } from './AuthContext';

export const CoursesPage: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState<Course | null>(null);
  const [courseToEdit, setCourseToEdit] = useState<Course | null>(null);
  const [newCourse, setNewCourse] = useState<{
    name: string;
    duration: string;
    fees: number;
    description: string;
    type: Course['type'];
  }>({ name: '', duration: '', fees: 0, description: '', type: 'Bachelors' });
  const [editCourseForm, setEditCourseForm] = useState<{
    name: string;
    duration: string;
    fees: number;
    description: string;
    type: Course['type'];
  }>({ name: '', duration: '', fees: 0, description: '', type: 'Bachelors' });
  const [selectedType, setSelectedType] = useState<string>('All');
  const [error, setError] = useState<string | null>(null);
  const { isAdmin } = useAuth();

  useEffect(() => {
    const coursesRef = collection(db, 'courses');
    const q = query(coursesRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Course));
      setCourses(data);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'courses'));

    return () => unsubscribe();
  }, [isAdmin]);

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !newCourse.name) return;

    try {
      const coursesRef = collection(db, 'courses');
      await addDoc(coursesRef, {
        ...newCourse,
        fees: Number(newCourse.fees),
        createdAt: serverTimestamp()
      });
      setIsAddModalOpen(false);
      setNewCourse({ name: '', duration: '', fees: 0, description: '', type: 'Bachelors' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'courses');
    }
  };

  const handleDeleteCourse = async (id: string) => {
    if (!isAdmin) return;
    try {
      setError(null);
      await deleteDoc(doc(db, 'courses', id));
      setCourseToDelete(null);
    } catch (err: any) {
      console.error("Delete course error:", err);
      let errMsg = err?.message || String(err);
      if (errMsg.includes("permission-denied") || errMsg.includes("Permission Denied")) {
        errMsg = "Permission Denied: Your account does not have sufficient permission to delete courses in Firestore rules.";
      }
      setError(errMsg);
      setCourseToDelete(null);
    }
  };

  const handleEditCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !courseToEdit || !editCourseForm.name) return;

    try {
      setError(null);
      const courseRef = doc(db, 'courses', courseToEdit.id);
      await updateDoc(courseRef, {
        ...editCourseForm,
        fees: Number(editCourseForm.fees)
      });
      setCourseToEdit(null);
    } catch (err: any) {
      console.error("Edit course error:", err);
      let errMsg = err?.message || String(err);
      if (errMsg.includes("permission-denied") || errMsg.includes("Permission Denied")) {
        errMsg = "Permission Denied: Your account does not have sufficient permission to edit courses in Firestore rules.";
      }
      setError(errMsg);
    }
  };

  const typesList = ['All', 'Bachelors', 'Specialization', 'Diploma', 'Professional Diploma', 'Certificate'];
  
  const getCountForType = (type: string) => {
    if (type === 'All') return courses.length;
    return courses.filter(c => (c.type || 'Bachelors') === type).length;
  };

  const filteredCourses = selectedType === 'All' 
    ? courses 
    : courses.filter(course => (course.type || 'Bachelors') === selectedType);

  const getCourseTypeBadgeColor = (type?: string) => {
    switch (type) {
      case 'Bachelors':
        return 'bg-purple-50 text-purple-700 border-purple-100';
      case 'Specialization':
        return 'bg-indigo-50 text-indigo-700 border-indigo-100';
      case 'Diploma':
        return 'bg-cyan-50 text-cyan-700 border-cyan-100';
      case 'Professional Diploma':
        return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'Certificate':
        return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-100';
    }
  };

  return (
    <div className="p-8 space-y-8 bg-slate-50 h-full overflow-auto max-w-7xl mx-auto w-full">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-800">Course <span className="text-indigo-600">Catalog</span></h1>
          <p className="text-slate-500 text-sm font-medium">Manage available programs and tuition details</p>
        </div>
        {isAdmin && (
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="bento-button-primary"
          >
            <Plus size={18} />
            Add Course
          </button>
        )}
      </header>

      {/* Category Filter Pills */}
      <div className="flex flex-wrap gap-2 pb-2 border-b border-slate-100">
        {typesList.map((type) => {
          const count = getCountForType(type);
          const isActive = selectedType === type;
          return (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all duration-300 flex items-center gap-2 border select-none cursor-pointer ${
                isActive
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/15'
                  : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              <span>{type}</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                isActive 
                  ? 'bg-indigo-700/50 text-white font-medium' 
                  : 'bg-slate-100 text-slate-500 font-medium'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="p-5 bg-rose-50 border border-rose-100 rounded-[24px] text-rose-700 flex items-start gap-3 relative animate-fade-in pr-10">
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
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-8 relative overflow-hidden">
            <button onClick={() => setIsAddModalOpen(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
            <h2 className="text-2xl font-bold tracking-tight text-slate-800 mb-2">New Course</h2>
            <p className="text-slate-500 text-sm mb-8">Fill in the details to add a new program to the catalog.</p>
            
            <form onSubmit={handleAddCourse} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Course Name</label>
                <input 
                  type="text"
                  required
                  value={newCourse.name}
                  onChange={e => setNewCourse({...newCourse, name: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all outline-none"
                  placeholder="e.g. Master of Design"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Course Type</label>
                <select
                  value={newCourse.type || 'Bachelors'}
                  onChange={e => setNewCourse({...newCourse, type: e.target.value as Course['type']})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all outline-none"
                >
                  <option value="Bachelors">Bachelors</option>
                  <option value="Specialization">Specialization</option>
                  <option value="Diploma">Diploma</option>
                  <option value="Professional Diploma">Professional Diploma</option>
                  <option value="Certificate">Certificate</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Duration</label>
                  <input 
                    type="text"
                    required
                    value={newCourse.duration}
                    onChange={e => setNewCourse({...newCourse, duration: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all outline-none"
                    placeholder="e.g. 2 Years"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Fees (INR)</label>
                  <input 
                    type="number"
                    required
                    value={newCourse.fees}
                    onChange={e => setNewCourse({...newCourse, fees: Number(e.target.value)})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all outline-none"
                    placeholder="0"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Description</label>
                <textarea 
                  value={newCourse.description}
                  onChange={e => setNewCourse({...newCourse, description: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all outline-none min-h-[100px]"
                  placeholder="Brief overview of the course content..."
                />
              </div>
              <div className="flex gap-3 mt-4">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 bento-button-secondary py-3 justify-center">Cancel</button>
                <button type="submit" className="flex-1 bento-button-primary py-3 justify-center">Save Course</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCourses.map((course) => (
          <div key={course.id} className="bento-card group hover:shadow-xl hover:translate-y-[-4px] transition-all duration-300">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300 shadow-sm shadow-indigo-100">
                    <BookOpen size={24} />
                  </div>
                  <span className={`px-2.5 py-1 rounded-xl text-[10px] font-extrabold uppercase tracking-widest border select-none ${getCourseTypeBadgeColor(course.type)}`}>
                    {course.type || 'Bachelors'}
                  </span>
                </div>
                {isAdmin && (
                  <div className="flex gap-1">
                    <button 
                      onClick={() => {
                        setCourseToEdit(course);
                        setEditCourseForm({
                          name: course.name,
                          duration: course.duration,
                          fees: course.fees,
                          description: course.description || '',
                          type: course.type || 'Bachelors'
                        });
                      }}
                      className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                      title="Edit Course"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button 
                      onClick={() => setCourseToDelete(course)}
                      className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                      title="Delete Course"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                )}
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">{course.name}</h3>
              <p className="text-sm text-slate-500 mb-6 line-clamp-2">{course.description || 'No description provided.'}</p>
              
              <div className="grid grid-cols-2 gap-4 pt-6 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-amber-500 transition-colors">
                    <Clock size={16} />
                  </div>
                  <div>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Duration</p>
                    <p className="text-sm font-bold text-slate-700">{course.duration}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-emerald-500 transition-colors">
                    <IndianRupee size={16} />
                  </div>
                  <div>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Fees</p>
                    <p className="text-sm font-bold text-slate-700">₹{course.fees.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
        {filteredCourses.length === 0 && !loading && (
          <div className="col-span-full py-20 text-center flex flex-col items-center justify-center bg-white rounded-[32px] border border-dashed border-slate-200 shadow-sm animate-fade-in">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-200 mb-4">
              <BookOpen size={40} />
            </div>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No courses found</p>
            <p className="text-slate-400 mt-1 max-w-xs mx-auto text-sm italic">There are no courses matching the selected category.</p>
            {isAdmin && <button onClick={() => setIsAddModalOpen(true)} className="mt-6 bento-button-primary">Add one now</button>}
          </div>
        )}
      </div>

      {courseToDelete && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div id="delete_confirm_modal" className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-sm w-full p-8 relative overflow-hidden animate-fade-in">
            <button onClick={() => setCourseToDelete(null)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
            <div className="w-12 h-12 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-center text-rose-500 mb-6">
              <Trash2 size={24} />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-800 mb-2">Delete Course?</h2>
            <p className="text-slate-500 text-sm mb-6">
              Are you sure you want to delete <span className="font-bold text-slate-800">{courseToDelete.name}</span>? This action is permanent and cannot be undone.
            </p>
            <div className="flex gap-3">
              <button 
                type="button"
                onClick={() => setCourseToDelete(null)} 
                className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-sm font-semibold transition-all text-center"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={() => handleDeleteCourse(courseToDelete.id)} 
                className="flex-1 px-4 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-sm font-semibold shadow-md shadow-rose-600/10 hover:shadow-rose-600/20 active:translate-y-[1px] transition-all text-center"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {courseToEdit && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-8 relative overflow-hidden animate-fade-in">
            <button onClick={() => setCourseToEdit(null)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
            <h2 className="text-2xl font-bold tracking-tight text-slate-800 mb-2">Edit Course</h2>
            <p className="text-slate-500 text-sm mb-8">Update program details, fees, and duration below.</p>
            
            <form onSubmit={handleEditCourse} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Course Name</label>
                <input 
                  type="text"
                  required
                  value={editCourseForm.name}
                  onChange={e => setEditCourseForm({...editCourseForm, name: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all outline-none"
                  placeholder="e.g. Master of Design"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Course Type</label>
                <select
                  value={editCourseForm.type || 'Bachelors'}
                  onChange={e => setEditCourseForm({...editCourseForm, type: e.target.value as Course['type']})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all outline-none"
                >
                  <option value="Bachelors">Bachelors</option>
                  <option value="Specialization">Specialization</option>
                  <option value="Diploma">Diploma</option>
                  <option value="Professional Diploma">Professional Diploma</option>
                  <option value="Certificate">Certificate</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Duration</label>
                  <input 
                    type="text"
                    required
                    value={editCourseForm.duration}
                    onChange={e => setEditCourseForm({...editCourseForm, duration: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all outline-none"
                    placeholder="e.g. 2 Years"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Fees (INR)</label>
                  <input 
                    type="number"
                    required
                    value={editCourseForm.fees}
                    onChange={e => setEditCourseForm({...editCourseForm, fees: Number(e.target.value)})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all outline-none"
                    placeholder="0"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Description</label>
                <textarea 
                  value={editCourseForm.description}
                  onChange={e => setEditCourseForm({...editCourseForm, description: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all outline-none min-h-[100px]"
                  placeholder="Brief overview of the course content..."
                />
              </div>
              <div className="flex gap-3 mt-4">
                <button type="button" onClick={() => setCourseToEdit(null)} className="flex-1 bento-button-secondary py-3 justify-center text-center">Cancel</button>
                <button type="submit" className="flex-1 bento-button-primary py-3 justify-center text-center">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
