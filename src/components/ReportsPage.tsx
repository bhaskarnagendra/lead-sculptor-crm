import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Lead, OperationType, UserProfile, Course } from '../types';
import { handleFirestoreError } from './AuthContext';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, AreaChart, Area } from 'recharts';
import { TrendingUp, Users, Target, BarChart2, PieChart as PieIcon, Award } from 'lucide-react';

const COLORS = ['#6366f1', '#f59e0b', '#ec4899', '#10b981', '#ef4444', '#8b5cf6'];

export const ReportsPage: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [team, setTeam] = useState<UserProfile[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [targets, setTargets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM

  useEffect(() => {
    const leadsRef = collection(db, 'leads');
    const unsubscribe = onSnapshot(leadsRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead));
      setLeads(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'leads'));

    const targetsRef = collection(db, 'targets');
    const unsubscribeTargets = onSnapshot(targetsRef, (snapshot) => {
      setTargets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'targets'));

    const fetchData = async () => {
       const usersRef = collection(db, 'users');
       const teamSnap = await getDocs(usersRef);
       setTeam(teamSnap.docs.map(d => d.data() as UserProfile));

       const coursesRef = collection(db, 'courses');
       const coursesSnap = await getDocs(coursesRef);
       setCourses(coursesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Course)));
       
       setLoading(false);
    };
    fetchData();

    return () => {
      unsubscribe();
      unsubscribeTargets();
    };
  }, []);

  // Filter leads by month
  const filteredLeads = leads.filter(l => {
    if (!l.createdAt) return false;
    const leadDate = l.createdAt.toDate().toISOString().slice(0, 7);
    return leadDate === selectedMonth;
  });

  // Aggregations
  const sourcePerformance = filteredLeads.reduce((acc: any, lead) => {
    const source = lead.source || 'Other';
    if (!acc[source]) acc[source] = { name: source, count: 0, converted: 0 };
    acc[source].count += 1;
    if (lead.status === 'enrolled') acc[source].converted += 1;
    return acc;
  }, {});

  const sourceData = Object.values(sourcePerformance).map((s: any) => ({
    ...s,
    conversionRate: Number(((s.converted / (s.count || 1)) * 100).toFixed(1))
  })).sort((a, b) => b.conversionRate - a.conversionRate);

  const bestSource = sourceData[0];

  // Revenue calculation
  const totalRevenue = filteredLeads
    .filter(l => l.status === 'enrolled')
    .reduce((sum, l) => {
      const course = courses.find(c => c.id === l.courseId || c.name === l.courseName);
      const fees = course?.fees || 0;
      return sum + Math.max(0, fees - (l.discount || 0));
    }, 0);

  const statusDistribution = filteredLeads.reduce((acc: any, lead) => {
    acc[lead.status] = (acc[lead.status] || 0) + 1;
    return acc;
  }, {});

  const statusData = Object.entries(statusDistribution).map(([name, value]) => ({ name, value }));

  const repPerformance = filteredLeads.reduce((acc: any, lead) => {
    if (!lead.assignedTo) return acc;
    const repName = lead.assignedName || 'Unknown';
    if (!acc[lead.assignedTo]) acc[lead.assignedTo] = { name: repName, leads: 0, converted: 0, revenue: 0 };
    acc[lead.assignedTo].leads += 1;
    if (lead.status === 'enrolled') {
      acc[lead.assignedTo].converted += 1;
      const course = courses.find(c => c.id === lead.courseId || c.name === lead.courseName);
      const fees = course?.fees || 0;
      acc[lead.assignedTo].revenue += Math.max(0, fees - (lead.discount || 0));
    }
    return acc;
  }, {});

  const repData = Object.entries(repPerformance).map(([userId, val]: [string, any]) => {
    const targetDoc = targets.find(t => t.userId === userId && t.month === selectedMonth);
    return {
      ...val,
      userId,
      target: targetDoc ? targetDoc.target : 0
    };
  }).sort((a: any, b: any) => b.leads - a.leads);

  if (loading) {
    return (
      <div className="p-10 flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-[#1D1D1F] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-10 h-full bg-[#FBFBFC] overflow-auto max-w-7xl mx-auto w-full">
      <header className="mb-10 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#1D1D1F]">Performance Reports</h1>
          <p className="text-slate-500 text-[13px] font-medium mt-1">Strategic insights and pipeline health analytics.</p>
        </div>
        <div className="flex flex-col gap-1.5">
           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Reporting Period</label>
           <input 
            type="month" 
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-[13px] font-bold outline-none focus:border-[#1D1D1F]"
           />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-10">
         <div className="bg-white p-8 rounded-[40px] border border-slate-200/60 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-500 mb-6">
                <Target size={24} />
              </div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Total Pipeline</p>
              <h3 className="text-4xl font-bold text-[#1D1D1F]">{filteredLeads.length}</h3>
            </div>
            <div className="mt-6 flex items-center gap-2 text-[#1D1D1F] font-bold text-xs uppercase tracking-widest opacity-40">
              <span>Selected Period</span>
            </div>
         </div>

         <div className="bg-white p-8 rounded-[40px] border border-slate-200/60 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500 mb-6">
                <TrendingUp size={24} />
              </div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Total Billing</p>
              <h3 className="text-4xl font-bold text-[#1D1D1F]">₹{totalRevenue.toLocaleString()}</h3>
            </div>
            <div className="mt-6 flex items-center gap-2 text-emerald-500 font-bold text-xs">
              <span>Gross collection</span>
            </div>
         </div>

         <div className="bg-white p-8 rounded-[40px] border border-slate-200/60 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 mb-6">
                <Award size={24} />
              </div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Conversion Rate</p>
              <h3 className="text-4xl font-bold text-[#1D1D1F]">
                {((filteredLeads.filter(l => l.status === 'enrolled').length / (filteredLeads.length || 1)) * 100).toFixed(1)}%
              </h3>
            </div>
            <div className="mt-6 flex items-center gap-2 text-slate-400 font-bold text-xs">
              <span>{filteredLeads.filter(l => l.status === 'enrolled').length} Enrolled this period</span>
            </div>
         </div>

         <div className="bg-white p-8 rounded-[40px] border border-slate-200/60 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 mb-6">
                <Target size={24} />
              </div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Top Source</p>
              <h3 className="text-3xl font-bold text-[#1D1D1F] truncate">{bestSource?.name || '—'}</h3>
            </div>
            <div className="mt-6 flex items-center gap-2 text-rose-500 font-bold text-xs">
              <span>{bestSource?.conversionRate || 0}% Success rate</span>
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
         <div className="bg-white p-10 rounded-[48px] border border-slate-200/60 shadow-sm">
            <h4 className="text-sm font-black uppercase text-slate-400 tracking-widest mb-10 flex items-center gap-2">
              <BarChart2 size={16} />
              Source Conversion
            </h4>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sourceData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12} tick={{ fill: '#94a3b8' }} />
                  <YAxis axisLine={false} tickLine={false} fontSize={12} tick={{ fill: '#94a3b8' }} />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="count" name="Total Leads" fill="#f1f5f9" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="converted" name="Enrolled" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
         </div>

         <div className="bg-white p-10 rounded-[48px] border border-slate-200/60 shadow-sm">
            <h4 className="text-sm font-black uppercase text-slate-400 tracking-widest mb-10 flex items-center gap-2">
              <PieIcon size={16} />
              Pipeline status
            </h4>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={100}
                    paddingAngle={8}
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
         </div>
      </div>

      <div className="bg-white p-10 rounded-[48px] border border-slate-200/60 shadow-sm">
          <h4 className="text-sm font-black uppercase text-slate-400 tracking-widest mb-10">Sales Staff Performance</h4>
          <div className="overflow-x-auto">
             <table className="w-full text-left">
                <thead>
                   <tr className="border-b border-slate-50">
                      <th className="pb-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Representative</th>
                      <th className="pb-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Leads</th>
                      <th className="pb-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Enrolled</th>
                      <th className="pb-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Monthly Target</th>
                      <th className="pb-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Revenue</th>
                      <th className="pb-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Conversion</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                   {repData.map((rep: any) => (
                     <tr key={rep.userId || rep.name}>
                        <td className="py-6 flex items-center gap-3">
                           <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                             {rep.name[0]}
                           </div>
                           <span className="text-sm font-bold text-[#1D1D1F]">{rep.name}</span>
                        </td>
                        <td className="py-6 text-sm font-medium text-slate-500 text-center">{rep.leads}</td>
                        <td className="py-6 text-sm font-medium text-slate-500 text-center">{rep.converted}</td>
                        <td className="py-6 text-sm font-medium text-[#1D1D1F] text-center">
                           {rep.target > 0 ? (
                              <span className="inline-flex flex-col items-center">
                                <span className="text-slate-700 font-bold">{rep.converted} / {rep.target}</span>
                                <span className={`text-[10px] font-extrabold ${rep.converted >= rep.target ? 'text-emerald-500' : 'text-indigo-600'}`}>
                                   ({Math.round((rep.converted / rep.target) * 100)}%)
                                </span>
                              </span>
                           ) : (
                              <span className="text-slate-400 font-normal italic text-[11px]">Unassigned</span>
                           )}
                        </td>
                        <td className="py-6 text-sm font-black text-[#1D1D1F] text-right">₹{rep.revenue.toLocaleString()}</td>
                        <td className="py-6">
                           <div className="flex items-center justify-end gap-3">
                              <div className="flex-1 max-w-[80px] h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                 <div 
                                    className="h-full bg-emerald-500" 
                                    style={{ width: `${(rep.converted / (rep.leads || 1)) * 100}%` }}
                                 />
                              </div>
                              <span className="text-[11px] font-bold text-emerald-600">
                                 {((rep.converted / (rep.leads || 1)) * 100).toFixed(1)}%
                              </span>
                           </div>
                        </td>
                     </tr>
                   ))}
                </tbody>
             </table>
          </div>
      </div>
    </div>
  );
};
