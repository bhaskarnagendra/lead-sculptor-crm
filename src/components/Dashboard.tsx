import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, collectionGroup, doc, updateDoc } from 'firebase/firestore';
import { 
  Users, 
  UserCheck, 
  TrendingUp, 
  AlertCircle, 
  PieChart as PieIcon, 
  BarChart3, 
  ArrowUpRight, 
  ArrowDownRight, 
  Award, 
  Calendar, 
  Bell, 
  Clock, 
  PhoneCall,
  DollarSign,
  Target as TargetIcon,
  ChevronRight,
  Filter,
  RefreshCw,
  Sparkles,
  Check,
  Video,
  Mail,
  AlertTriangle,
  Play,
  Zap,
  Trophy,
  Flame,
  Gamepad2,
  Compass,
  Star,
  Crown
} from 'lucide-react';
import { db } from '../lib/firebase';
import { Lead, OperationType, Course, Target } from '../types';
import { useAuth, handleFirestoreError } from './AuthContext';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend,
  AreaChart,
  Area,
  Line,
  CartesianGrid,
  ComposedChart
} from 'recharts';
import { QuickActionDrawer } from './QuickActionDrawer';
import { getStatusStyle } from '../utils/LeadScoring';

type TimeframeType = 'day' | 'month' | 'year' | 'all';

export const Dashboard: React.FC = () => {
  const { profile, isAdmin } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);

  const [calls, setCalls] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [isDialerOpen, setIsDialerOpen] = useState(false);

  // Filter States
  const [timeframe, setTimeframe] = useState<TimeframeType>('month');
  const [selectedDay, setSelectedDay] = useState<string>(new Date().toISOString().slice(0, 10)); // YYYY-MM-DD
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString()); // YYYY
  const [selectedRep, setSelectedRep] = useState<string>('all');

  useEffect(() => {
    if (!profile?.uid && !isAdmin) return;

    // Listen to Leads - Admins see all, Reps see assigned to them
    const leadsRef = collection(db, 'leads');
    const leadsQuery = isAdmin ? leadsRef : query(leadsRef, where('assignedTo', '==', profile?.uid));

    const unsubscribeLeads = onSnapshot(leadsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead));
      setLeads(data);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'leads'));

    // Listen to Team members
    let unsubscribeTeam = () => {};
    if (isAdmin) {
      unsubscribeTeam = onSnapshot(collection(db, 'users'), (snapshot) => {
        setTeam(snapshot.docs.map(d => ({ uid: d.id, ...d.data() })));
      }, (err) => {
        console.error("Dashboard team listener failed:", err);
      });
    } else {
      // For sales reps, team is just themselves
      setTeam([{ uid: profile?.uid, displayName: profile?.displayName, role: 'sales_rep' }]);
    }

    // Listen to Follow-ups & Tasks (with secure assignment checks for reps)
    const followupsRef = collectionGroup(db, 'followups');
    let tasksQuery = query(followupsRef, where('status', '==', 'pending'));
    if (!isAdmin && profile?.uid) {
      tasksQuery = query(followupsRef, where('status', '==', 'pending'), where('assignedTo', '==', profile.uid));
    }

    const unsubscribeTasks = onSnapshot(tasksQuery, (snapshot) => {
      const allPending = snapshot.docs.map(doc => {
        const data = doc.data();
        const parentLeadId = doc.ref.parent.parent?.id || data.leadId || '';
        return {
          id: doc.id,
          parentLeadId,
          refPath: doc.ref.path,
          ...data
        };
      });
      setTasks(allPending);
      
      const callTasks = allPending.filter((t: any) => t.type === 'call');
      setCalls(callTasks);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'followups_group');
    });

    // Listen to Courses
    const coursesRef = collection(db, 'courses');
    const unsubscribeCourses = onSnapshot(coursesRef, (snapshot) => {
      setCourses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course)));
    }, (err) => {
      console.error("Dashboard courses listener failed:", err);
    });

    // Listen to Targets
    const targetsRef = collection(db, 'targets');
    const unsubscribeTargetsGlobal = onSnapshot(targetsRef, (snapshot) => {
      setTargets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Target)));
    }, (err) => {
      console.error("Dashboard targets global listener failed:", err);
    });

    return () => {
      unsubscribeLeads();
      unsubscribeTeam();
      unsubscribeTasks();
      unsubscribeCourses();
      unsubscribeTargetsGlobal();
    };
  }, [isAdmin, profile?.uid]);

  // Helpers to get date string safely
  const getLeadDateString = (lead: Lead) => {
    if (!lead.createdAt) return '';
    try {
      const d = lead.createdAt.toDate ? lead.createdAt.toDate() : new Date(lead.createdAt);
      if (isNaN(d.getTime())) return '';
      return d.toISOString().slice(0, 10); // YYYY-MM-DD
    } catch {
      return '';
    }
  };

  // Helper to convert Firestore Timestamp to Month YYYY text
  const formatMonthTitle = (monthStr: string) => {
    try {
      const [yr, mn] = monthStr.split('-');
      const d = new Date(Number(yr), Number(mn) - 1, 1);
      return d.toLocaleDateString([], { month: 'long', year: 'numeric' });
    } catch {
      return monthStr;
    }
  };

  // 1. Apply representative filter (If rep is lock-in or chosen)
  const repFilterVal = isAdmin ? selectedRep : (profile?.uid || '');
  const salespersonLeads = leads.filter(l => {
    if (repFilterVal === 'all') return true;
    return l.assignedTo === repFilterVal;
  });

  // 2. Apply timeframe filter to leads
  const activeLeads = salespersonLeads.filter(l => {
    const dateStr = getLeadDateString(l);
    if (!dateStr) return false;

    if (timeframe === 'day') {
      return dateStr === selectedDay;
    }
    if (timeframe === 'month') {
      return dateStr.slice(0, 7) === selectedMonth;
    }
    if (timeframe === 'year') {
      return dateStr.slice(0, 4) === selectedYear;
    }
    return true; // all
  });

  // Calculate dynamic metrics based on filtered active leads
  const activeStats = {
    total: activeLeads.length,
    enrolled: activeLeads.filter(l => l.status === 'enrolled').length,
    interested: activeLeads.filter(l => l.status === 'interested').length,
    revenue: activeLeads
      .filter(l => l.status === 'enrolled')
      .reduce((sum, l) => {
        const course = courses.find(c => c.id === l.courseId || c.name === l.courseName);
        return sum + Math.max(0, (course?.fees || 0) - (l.discount || 0));
      }, 0),
    avgScore: activeLeads.length > 0 
      ? Math.round(activeLeads.reduce((acc, curr) => acc + (curr.score || 0), 0) / activeLeads.length) 
      : 0,
  };

  // Calculate targets comparison for the active filter context
  const getActiveTargetsSum = () => {
    // If a specific salesperson is chosen (or profile if sales rep)
    const singleRepId = repFilterVal !== 'all' ? repFilterVal : null;
    
    const matchedTargets = targets.filter(t => {
      // Check rep match
      if (singleRepId && t.userId !== singleRepId) return false;
      
      // Check timeframe match
      if (timeframe === 'month') {
        return t.month === selectedMonth;
      }
      if (timeframe === 'day') {
        const dayMonth = selectedDay.slice(0, 7);
        return t.month === dayMonth;
      }
      if (timeframe === 'year') {
        return t.month.startsWith(selectedYear);
      }
      return true; // all time
    });

    return matchedTargets.reduce((sum, t) => sum + t.target, 0);
  };

  const activeTargetGoal = getActiveTargetsSum();

  // Status breakdown data for the segment
  const statusCounts: Record<string, number> = {};
  activeLeads.forEach(l => {
    statusCounts[l.status] = (statusCounts[l.status] || 0) + 1;
  });
  const statusData = Object.entries(statusCounts).map(([name, value]) => ({ 
    name: name.toUpperCase(), 
    value 
  }));

  const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#1e293b', '#ef4444', '#a855f7'];

  // LINE/AREA CHART TIMELINE DATA GENERATOR
  const getTimelineTrendData = () => {
    if (timeframe === 'day') {
      // Return 7 rolling days ending on selectedDay for visual flow
      return Array.from({ length: 7 }).map((_, index) => {
        const d = new Date(selectedDay);
        d.setDate(d.getDate() - (6 - index));
        const dayStr = d.toISOString().slice(0, 10);
        
        const dayLeads = salespersonLeads.filter(l => getLeadDateString(l) === dayStr);
        const dayEnrolled = dayLeads.filter(l => l.status === 'enrolled');
        const rev = dayEnrolled.reduce((sum, l) => {
          const course = courses.find(c => c.id === l.courseId || c.name === l.courseName);
          return sum + Math.max(0, (course?.fees || 0) - (l.discount || 0));
        }, 0);
        
        return {
          label: d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
          Leads: dayLeads.length,
          Enrolled: dayEnrolled.length,
          Revenue: rev
        };
      });
    }
    
    if (timeframe === 'month') {
      try {
        const [year, month] = selectedMonth.split('-').map(Number);
        const daysInMonth = new Date(year, month, 0).getDate();
        
        return Array.from({ length: daysInMonth }).map((_, index) => {
          const dayNum = index + 1;
          const dayStr = `${selectedMonth}-${String(dayNum).padStart(2, '0')}`;
          
          const dayLeads = salespersonLeads.filter(l => getLeadDateString(l) === dayStr);
          const dayEnrolled = dayLeads.filter(l => l.status === 'enrolled');
          const rev = dayEnrolled.reduce((sum, l) => {
            const course = courses.find(c => c.id === l.courseId || c.name === l.courseName);
            return sum + Math.max(0, (course?.fees || 0) - (l.discount || 0));
          }, 0);
          
          return {
            label: `${dayNum}`,
            Leads: dayLeads.length,
            Enrolled: dayEnrolled.length,
            Revenue: rev
          };
        });
      } catch {
        return [];
      }
    }
    
    if (timeframe === 'year') {
      const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return SHORT_MONTHS.map((mName, index) => {
        const monthPart = String(index + 1).padStart(2, '0');
        const monthQueryStr = `${selectedYear}-${monthPart}`;
        
        const mLeads = salespersonLeads.filter(l => getLeadDateString(l).slice(0, 7) === monthQueryStr);
        const mEnrolled = mLeads.filter(l => l.status === 'enrolled');
        const rev = mEnrolled.reduce((sum, l) => {
          const course = courses.find(c => c.id === l.courseId || c.name === l.courseName);
          return sum + Math.max(0, (course?.fees || 0) - (l.discount || 0));
        }, 0);
        
        return {
          label: mName,
          Leads: mLeads.length,
          Enrolled: mEnrolled.length,
          Revenue: rev
        };
      });
    }
    
    // For All-time: last 5 years
    const currYear = new Date().getFullYear();
    return Array.from({ length: 5 }).map((_, index) => {
      const yr = String(currYear - 4 + index);
      const yrLeads = salespersonLeads.filter(l => getLeadDateString(l).slice(0, 4) === yr);
      const yrEnrolled = yrLeads.filter(l => l.status === 'enrolled');
      const rev = yrEnrolled.reduce((sum, l) => {
        const course = courses.find(c => c.id === l.courseId || c.name === l.courseName);
        return sum + Math.max(0, (course?.fees || 0) - (l.discount || 0));
      }, 0);
      
      return {
        label: yr,
        Leads: yrLeads.length,
        Enrolled: yrEnrolled.length,
        Revenue: rev
      };
    });
  };

  const trendData = getTimelineTrendData();

  // COURSE-WISE PERFORMANCE DATA
  const coursePerformanceData = courses.map(course => {
    const courseLeads = activeLeads.filter(l => l.courseId === course.id || l.courseName === course.name);
    const enrolled = courseLeads.filter(l => l.status === 'enrolled');
    const rev = enrolled.reduce((sum, l) => sum + Math.max(0, course.fees - (l.discount || 0)), 0);
    const convRate = courseLeads.length > 0 ? Math.round((enrolled.length / courseLeads.length) * 100) : 0;
    return {
      name: course.name,
      Inquiries: courseLeads.length,
      Enrolled: enrolled.length,
      Revenue: rev,
      'Conv %': convRate
    };
  }).filter(c => c.Inquiries > 0 || c.Revenue > 0)
    .sort((a, b) => b.Revenue - a.Revenue);

  // REPRESENTATIVE PERFORMANCE & TARGET PROGRESS
  const repPerformanceData = team
    .filter(m => m.role === 'sales_rep')
    .map(m => {
      // Filter leads belonging ONLY to this rep matching timeframe
      const repSpecificLeads = leads.filter(l => {
        if (l.assignedTo !== m.uid) return false;
        const dateStr = getLeadDateString(l);
        if (!dateStr) return false;

        if (timeframe === 'day') {
          return dateStr === selectedDay;
        }
        if (timeframe === 'month') {
          return dateStr.slice(0, 7) === selectedMonth;
        }
        if (timeframe === 'year') {
          return dateStr.slice(0, 4) === selectedYear;
        }
        return true;
      });

      const enrolled = repSpecificLeads.filter(l => l.status === 'enrolled');
      const rev = enrolled.reduce((sum, l) => {
        const course = courses.find(c => c.id === l.courseId || c.name === l.courseName);
        return sum + Math.max(0, (course?.fees || 0) - (l.discount || 0));
      }, 0);

      // Target lookup
      let targetGoal = 0;
      if (timeframe === 'month') {
        const tDoc = targets.find(t => t.userId === m.uid && t.month === selectedMonth);
        targetGoal = tDoc ? tDoc.target : 0;
      } else if (timeframe === 'day') {
        const dMonth = selectedDay.slice(0, 7);
        const tDoc = targets.find(t => t.userId === m.uid && t.month === dMonth);
        targetGoal = tDoc ? tDoc.target : 0;
      } else if (timeframe === 'year') {
        const yearTargets = targets.filter(t => t.userId === m.uid && t.month.startsWith(selectedYear));
        targetGoal = yearTargets.reduce((sum, t) => sum + t.target, 0);
      } else {
        const repTargets = targets.filter(t => t.userId === m.uid);
        targetGoal = repTargets.reduce((sum, t) => sum + t.target, 0);
      }

      return {
        uid: m.uid,
        name: m.displayName || 'Unknown Rep',
        Leads: repSpecificLeads.length,
        Enrolled: enrolled.length,
        Revenue: rev,
        Target: targetGoal,
        'Target %': targetGoal > 0 ? Math.round((enrolled.length / targetGoal) * 100) : 0
      };
    }).sort((a, b) => b.Enrolled - a.Enrolled);

  const handleCompleteTask = async (task: any) => {
    try {
      const leadId = task.parentLeadId || task.leadId;
      if (!leadId) {
        console.error("No lead parent identifier found for task:", task);
        return;
      }
      const taskRef = doc(db, 'leads', leadId, 'followups', task.id);
      await updateDoc(taskRef, {
        status: 'completed'
      });
    } catch (err) {
      console.error("Error completing task:", err);
    }
  };

  const sortTasksByPriority = (taskArray: any[]) => {
    const getPriorityScore = (type: string) => {
      switch (type?.toLowerCase()) {
        case 'meeting': return 1; // Priority 1 (High)
        case 'call': return 2;    // Priority 2 (Medium-High)
        case 'email': return 3;   // Priority 3 (Medium)
        default: return 4;        // Priority 4 (Normal)
      }
    };

    // First sort the tasks by priority and time
    const sorted = [...taskArray].sort((a, b) => {
      const scoreA = getPriorityScore(a.type);
      const scoreB = getPriorityScore(b.type);
      
      if (scoreA !== scoreB) {
        return scoreA - scoreB;
      }
      const timeA = a.scheduledAt?.toDate ? a.scheduledAt.toDate().getTime() : 0;
      const timeB = b.scheduledAt?.toDate ? b.scheduledAt.toDate().getTime() : 0;
      return timeA - timeB;
    });

    // Deduplicate so there is only 1 task per lead (preserving highest priority order)
    const seenLeads = new Set<string>();
    return sorted.filter(task => {
      const leadId = task.parentLeadId || task.leadId;
      if (!leadId) return true;
      if (seenLeads.has(leadId)) {
        return false;
      }
      seenLeads.add(leadId);
      return true;
    });
  };

  const getDailyTasks = () => {
    const tomorrow = new Date();
    tomorrow.setHours(23, 59, 59, 999);
    
    return tasks.filter(t => {
      if (!t.scheduledAt) return false;
      const schedDate = t.scheduledAt.toDate ? t.scheduledAt.toDate() : new Date(t.scheduledAt);
      return schedDate <= tomorrow;
    });
  };

  // Gamified Engine Calculations
  const calculateGamifiedStats = () => {
    const totalEnrolled = salespersonLeads.filter(l => l.status === 'enrolled').length;
    
    // XP Calculation Formulas
    const enrollXP = totalEnrolled * 150;
    const pipelineXP = activeStats.total * 15;
    const scoreBonusXP = activeStats.avgScore * 4;
    const revenueXP = Math.floor(activeStats.revenue / 1000);
    
    const totalXP = enrollXP + pipelineXP + scoreBonusXP + revenueXP || 0;
    
    const levelXPBracket = 400; // 400 XP per level
    const currentLevel = Math.max(1, Math.floor(totalXP / levelXPBracket) + 1);
    const xpIntoLevel = totalXP % levelXPBracket;
    const xpProgressPercent = Math.min(Math.round((xpIntoLevel / levelXPBracket) * 100), 100);

    const titles = [
      "Bronze Prospector",       // Level 1
      "Silver Dial Master",      // Level 2
      "Gold Lead Closer",        // Level 3
      "Platinum Dealmaker",      // Level 4
      "Diamond Sales Elite",     // Level 5
      "Supreme Closer Legend"    // Level 6+
    ];
    const currentTitle = titles[Math.min(currentLevel - 1, titles.length - 1)];

    // Badges / Achievements
    const achievements = [
      {
        id: 'first_deal',
        name: 'First Blood',
        desc: 'Mark at least 1 lead as Enrolled',
        unlocked: totalEnrolled >= 1,
        xpBonus: '+150 XP',
        icon: Trophy,
        color: 'text-amber-500 bg-amber-50 border-amber-200'
      },
      {
        id: 'revenue_giant',
        name: 'Revenue Titan',
        desc: 'Generate over ₹1,00,000 in student course fees',
        unlocked: activeStats.revenue >= 100000,
        xpBonus: '+300 XP',
        icon: Crown,
        color: 'text-purple-500 bg-purple-50 border-purple-200'
      },
      {
        id: 'efficiency_master',
        name: 'Closer Pro',
        desc: 'Conversion rate above 20% (min 5 leads)',
        unlocked: activeStats.total >= 5 && (totalEnrolled / activeStats.total) >= 0.2,
        xpBonus: '+200 XP',
        icon: Flame,
        color: 'text-rose-500 bg-rose-50 border-rose-200'
      },
      {
        id: 'pipeline_builder',
        name: 'Funnel Mastermind',
        desc: 'Register 10+ inquiry records in your pipeline',
        unlocked: activeStats.total >= 10,
        xpBonus: '+100 XP',
        icon: Star,
        color: 'text-sky-500 bg-sky-50 border-sky-200'
      }
    ];

    // Missions / Quests
    const dailyTasksList = sortTasksByPriority(getDailyTasks());
    const quests = [
      {
        id: 'quest_clean_tasks',
        name: 'Clear Today\'s Priority Board',
        desc: 'Process and complete all scheduled callbacks for today',
        status: dailyTasksList.length === 0 ? 'COMPLETED' : `${dailyTasksList.length} Left`,
        done: dailyTasksList.length === 0,
        xp: 100
      },
      {
        id: 'quest_high_score',
        name: 'High Scoring Target Focus',
        desc: 'Close a deal with a high-score prospect (Score >= 80)',
        status: salespersonLeads.some(l => l.status === 'enrolled' && l.score >= 80) ? 'COMPLETED' : 'Pending',
        done: salespersonLeads.some(l => l.status === 'enrolled' && l.score >= 80),
        xp: 150
      },
      {
        id: 'quest_daily_yield',
        name: 'Daily Elite Yield Target',
        desc: 'Achieve at least 1 closed enrollment with value above ₹30,000',
        status: salespersonLeads.some(l => {
          if (l.status !== 'enrolled') return false;
          const course = courses.find(c => c.id === l.courseId || c.name === l.courseName);
          const fee = Math.max(0, (course?.fees || 0) - (l.discount || 0));
          return fee >= 30000;
        }) ? 'COMPLETED' : 'Pending',
        done: salespersonLeads.some(l => {
          if (l.status !== 'enrolled') return false;
          const course = courses.find(c => c.id === l.courseId || c.name === l.courseName);
          const fee = Math.max(0, (course?.fees || 0) - (l.discount || 0));
          return fee >= 30000;
        }),
        xp: 120
      }
    ];

    // Dynamic streak score - mock tracker based on active performance
    const activeStreakCount = Math.max(1, Math.min(10, Math.floor(activeStats.revenue / 25000) + totalEnrolled));

    return {
      totalXP,
      currentLevel,
      xpIntoLevel,
      levelXPBracket,
      xpProgressPercent,
      currentTitle,
      achievements,
      quests,
      activeStreakCount
    };
  };

  const gamified = calculateGamifiedStats();

  const StatCard = ({ label, value, subText, icon: Icon, colorClass = "text-[#1D1D1F] bg-[#F5F5F7]" }: any) => (
    <div className="bento-card p-6 flex flex-col justify-between h-full group hover:translate-y-[-2px] transition-all duration-300">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-2.5 rounded-xl transition-colors ${colorClass}`}>
          <Icon size={18} strokeWidth={2.5} />
        </div>
      </div>
      <div>
        <h3 className="text-3xl font-bold tracking-tight text-[#1D1D1F] mb-1">{value}</h3>
        <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">{label}</p>
        {subText && <p className="text-[11px] text-slate-500 font-medium mt-1">{subText}</p>}
      </div>
    </div>
  );

  return (
    <div className="p-8 space-y-8 bg-[#FBFBFC] h-full overflow-auto max-w-7xl mx-auto w-full">
      
      {/* HEADER SECTION */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-[#1D1D1F]">
              Performance Dashboard
            </h1>
            <div className="bg-indigo-50 border border-indigo-150 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-indigo-500 animate-pulse" />
              <span className="text-[9px] font-extrabold text-indigo-500 uppercase tracking-widest">Real-time</span>
            </div>
          </div>
          <p className="text-slate-500 text-[13px] font-medium mt-0.5">
            {isAdmin 
              ? 'Institutional drill-down analysis, financial yields, and targets.' 
              : `Logged in: ${profile?.displayName} | Direct sales funnel & conversions.`}
          </p>
        </div>
        <div className="flex gap-2">
          {!isAdmin && (
            <button 
              onClick={() => setIsDialerOpen(true)}
              className="bento-button-primary disabled:opacity-50"
              disabled={calls.length === 0}
            >
              <PhoneCall size={16} strokeWidth={2.5} />
              Power Dialer ({calls.length})
            </button>
          )}
          <button className="bento-button-secondary relative">
            <Bell size={18} />
            {leads.filter(l => l.status === 'new').length > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-indigo-500 rounded-full"></span>
            )}
          </button>
        </div>
      </header>

      {/* SALES GAMIFIED ARENA & PROGRESS (RIGHT ON TOP FOR SALES LOGIN) */}
      {!isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* XP & LEVEL MODULE */}
          <div className="bento-card p-6 bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 text-white rounded-[32px] border-none shadow-xl flex flex-col justify-between relative overflow-hidden group">
            {/* Ambient Background Glows */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-indigo-500/20 transition-all duration-700" />
            <div className="absolute -bottom-8 -left-8 w-40 h-40 bg-pink-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-pink-500/20 transition-all duration-700" />

            <div>
              {/* Header */}
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                  <div className="bg-white/10 p-2 rounded-xl border border-white/10 shrink-0">
                    <Crown className="w-5 h-5 text-amber-400 animate-bounce" />
                  </div>
                  <div>
                    <h2 className="text-[10px] font-black uppercase text-indigo-300 tracking-widest leading-none">Sales Representative Arena</h2>
                    <p className="text-sm font-bold text-white mt-1">Gladiator Standings</p>
                  </div>
                </div>
                {/* Level Badge */}
                <div className="bg-amber-400 text-slate-950 text-xs font-black px-3 py-1 rounded-full shadow-md flex items-center gap-1">
                  <span>LVL {gamified.currentLevel}</span>
                </div>
              </div>

              {/* Title & Rank Descriptor */}
              <div className="mb-6">
                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-300">Current Rank Title</span>
                <h3 className="text-2xl font-black text-white tracking-tight mt-0.5 drop-shadow-sm">{gamified.currentTitle}</h3>
                <p className="text-[11px] text-indigo-100/70 font-medium mt-1">Earn experience points (XP) to unlock higher tiers and supreme status.</p>
              </div>
            </div>

            {/* Progress indicator */}
            <div>
              <div className="flex justify-between items-end mb-2 text-xs font-bold">
                <span className="text-indigo-200">Level Progress</span>
                <span className="font-mono text-white">{gamified.xpIntoLevel} / {gamified.levelXPBracket} XP</span>
              </div>
              
              <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-amber-400 via-pink-500 to-indigo-400 rounded-full transition-all duration-1000 shadow-[0_0_12px_rgba(251,191,36,0.3)]"
                  style={{ width: `${gamified.xpProgressPercent}%` }}
                />
              </div>

              <div className="flex justify-between items-center mt-3 text-[9px] font-bold text-indigo-200 uppercase tracking-widest">
                <span>{gamified.xpProgressPercent}% Accomplished</span>
                <span className="bg-white/5 border border-white/10 px-2 py-0.5 rounded-md flex items-center gap-1 font-mono text-white font-black">
                  <Zap size={9} className="text-amber-400 fill-amber-400 text-[10px]" />
                  Total {gamified.totalXP} XP
                </span>
              </div>
            </div>
          </div>

          {/* DAILY MISSIONS / QUESTS */}
          <div className="bento-card p-6 bg-white border border-slate-200/60 rounded-[32px] shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-[#FFF9E6] p-1.5 rounded-lg border border-amber-100 text-amber-500">
                  <Compass size={16} />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-800">Active Daily Campaigns</h3>
                  <p className="text-[10px] text-slate-400 font-bold">Clear missions to secure immediate XP rewards</p>
                </div>
              </div>

              <div className="space-y-3">
                {gamified.quests.map((quest) => (
                  <div 
                    key={quest.id} 
                    className={`p-3 rounded-2xl border transition-all flex items-start gap-3 relative ${
                      quest.done 
                        ? 'bg-emerald-50/50 border-emerald-100 text-slate-500' 
                        : 'bg-slate-50/50 border-slate-100 hover:border-slate-250'
                    }`}
                  >
                    {/* Status checkbox */}
                    <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                      quest.done 
                        ? 'bg-emerald-500 border-emerald-500 text-white' 
                        : 'bg-white border-slate-300'
                    }`}>
                      {quest.done && <Check size={10} strokeWidth={3} />}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline gap-2">
                        <h4 className={`text-[11px] font-black truncate leading-none ${quest.done ? 'line-through text-slate-400' : 'text-slate-850'}`}>
                          {quest.name}
                        </h4>
                        <span className="text-[9px] font-mono font-black text-indigo-500 shrink-0 bg-indigo-50/80 px-1.5 py-0.5 rounded">
                          +{quest.xp} XP
                        </span>
                      </div>
                      <p className="text-[9px] text-slate-400 font-medium mt-1 leading-relaxed">
                        {quest.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* REWARDS & BADGES COMPLETED */}
          <div className="bento-card p-6 bg-white border border-slate-200/60 rounded-[32px] shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <div className="bg-rose-50 p-1.5 rounded-lg border border-rose-100 text-rose-500">
                    <Trophy size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-800">Honorary achievements</h3>
                    <p className="text-[10px] text-slate-400 font-bold">Your unlocked corporate milestones</p>
                  </div>
                </div>

                {/* Streak Multiplier */}
                <div className="bg-orange-50 border border-orange-100 px-3 py-1 rounded-full flex items-center gap-1 shadow-xs shrink-0">
                  <Flame className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
                  <span className="text-[10px] font-black text-orange-600">{gamified.activeStreakCount}x STREAK</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {gamified.achievements.map((ach) => {
                  const AchIcon = ach.icon;
                  return (
                    <div 
                      key={ach.id} 
                      className={`p-3 rounded-2xl border transition-all flex flex-col justify-between gap-2.5 group/ach relative overflow-hidden ${
                        ach.unlocked 
                          ? 'bg-slate-50 border-slate-200 shadow-xs' 
                          : 'bg-slate-50/20 border-slate-100 opacity-45 grayscale'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className={`p-1.5 rounded-xl shrink-0 ${ach.unlocked ? ach.color : 'bg-slate-200 text-slate-400'}`}>
                          <AchIcon size={14} />
                        </div>
                        {ach.unlocked && (
                          <span className="text-[8px] font-black text-emerald-600 border border-emerald-100 bg-emerald-50 px-1 py-0.5 rounded">
                            UNLOCKED
                          </span>
                        )}
                      </div>
                      
                      <div>
                        <h4 className="text-[10px] font-black text-slate-800 truncate leading-none">
                          {ach.name}
                        </h4>
                        <p className="text-[8px] text-slate-400 font-medium mt-1 leading-normal line-clamp-2">
                          {ach.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SALES DAILY TASKS PRIORITY BOARD (RIGHT ON TOP FOR SALES LOGIN) */}
      {!isAdmin && (
        <div className="bento-card p-6 border border-slate-200/60 bg-slate-50/50 shadow-[0_2px_12px_rgba(0,0,0,0.015)] rounded-[32px]">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5 pb-4 border-b border-slate-150/50">
            <div>
              <div className="flex items-center gap-2">
                <div className="bg-rose-50 border border-rose-150 p-2.5 rounded-full flex items-center justify-center w-10 h-10 shrink-0">
                  <Clock className="w-5 h-5 text-rose-500 animate-pulse-subtle" />
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-widest text-slate-800">
                    Today's Task Priorities & Action Plan
                  </h2>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    Prioritized automatically by critical action type to maximize closed enrollments.
                  </p>
                </div>
              </div>
            </div>
            
            {/* Priority Legend */}
            <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span> Red: Meetings
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span> Orange: Calls
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-indigo-500"></span> Blue: Emails
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-slate-400"></span> Gray: Other
              </span>
            </div>
          </div>

          {/* Task Grid rendering - 2 columns side-by-side as shown in screenshot */}
          {(() => {
            const dailyTasksList = sortTasksByPriority(getDailyTasks());

            if (dailyTasksList.length === 0) {
               return (
                <div className="py-10 text-center flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                  <Check className="w-8 h-8 text-emerald-500 mb-2 bg-emerald-50 p-1.5 rounded-full" />
                  <span className="text-xs font-black uppercase tracking-wider text-slate-700">All caught up!</span>
                  <p className="text-[11px] text-slate-400 mt-0.5">You have completed all follow-ups scheduled for today. Great job!</p>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {dailyTasksList.map((task) => {
                  const isMeeting = task.type?.toLowerCase() === 'meeting';
                  const isCall = task.type?.toLowerCase() === 'call';
                  const isEmail = task.type?.toLowerCase() === 'email';
                  
                  // Priority Styling Mapping
                  let themeClass = "border-l-[4px] border-l-slate-400 border-t border-r border-b border-slate-200/50 bg-slate-50/50 hover:bg-slate-50/80 text-slate-700";
                  let iconBg = "bg-slate-100 text-slate-500";
                  let priorityLabel = "Priority 4 (Normal)";
                  let TaskIcon = Clock;
                  let priorityColor = "text-slate-500";

                  if (isMeeting) {
                    themeClass = "border-l-[4px] border-l-[#F43F5E] border-t border-r border-b border-rose-200/50 bg-[#FCF5F5] hover:bg-[#FDF7F7] shadow-[0_2px_8px_rgba(244,63,94,0.01)]";
                    iconBg = "bg-rose-100 text-[#F43F5E]";
                    priorityLabel = "Priority 1 (High)";
                    priorityColor = "text-rose-500";
                    TaskIcon = Video;
                  } else if (isCall) {
                    themeClass = "border-l-[4px] border-l-amber-500 border-t border-r border-b border-amber-200/40 bg-[#FCF9F2] hover:bg-[#FDFBF7] shadow-[0_2px_8px_rgba(245,158,11,0.01)]";
                    iconBg = "bg-[#FEF6E5] text-amber-600";
                    priorityLabel = "Priority 2 (Medium-High)";
                    priorityColor = "text-amber-700";
                    TaskIcon = PhoneCall;
                  } else if (isEmail) {
                    themeClass = "border-l-[4px] border-l-indigo-500 border-t border-r border-b border-indigo-200/40 bg-[#F5F7FC] hover:bg-[#F8FAFC] shadow-[0_2px_8px_rgba(99,102,241,0.01)]";
                    iconBg = "bg-indigo-100 text-indigo-600";
                    priorityLabel = "Priority 3 (Medium)";
                    priorityColor = "text-indigo-600";
                    TaskIcon = Mail;
                  }

                  // Determine if overdue
                  const schedTime = task.scheduledAt?.toDate ? task.scheduledAt.toDate() : new Date(task.scheduledAt);
                  const isOverdue = schedTime < new Date() && (new Date().getTime() - schedTime.getTime() > 15 * 60 * 1000);

                  return (
                    <div 
                      key={task.id} 
                      className={`p-5 rounded-[24px] flex flex-col justify-between gap-4 transition-all duration-300 relative overflow-hidden group/item ${themeClass}`}
                    >
                      <div>
                        {/* Task Header: Priority description & Schedule badge */}
                        <div className="flex justify-between items-center mb-2">
                          <span className={`text-[9px] font-black uppercase tracking-widest ${priorityColor}`}>
                            {priorityLabel}
                          </span>
                          
                          <div className="flex items-center gap-1.5">
                            {isOverdue && (
                              <span className="bg-rose-500 text-white rounded-md text-[8px] font-black tracking-widest px-1.5 py-0.5 leading-none shadow-xs">
                                OVERDUE
                              </span>
                            )}
                            <span className="text-[10px] font-black bg-white px-2.5 py-1 rounded-md shadow-3xs flex items-center gap-1 text-slate-700 border border-slate-100">
                              <Clock size={10} className="text-slate-500" />
                              {schedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                            </span>
                          </div>
                        </div>

                        {/* Customer title */}
                        <div className="flex items-center gap-3 mt-1.5">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
                            <TaskIcon size={16} strokeWidth={2.5} />
                          </div>
                          <div className="truncate">
                            <h4 className="text-sm font-black text-[#1D1D1F] leading-tight truncate">
                              {task.leadName || 'Unnamed Prospect'}
                            </h4>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                              Action: {task.type}
                            </p>
                          </div>
                        </div>

                        {/* Action details */}
                        <p className="text-[11px] font-medium text-slate-600 mt-3 pl-1 leading-relaxed bg-white/70 px-3 py-2.5 rounded-2xl border border-slate-100/55 min-h-[50px] flex items-center">
                          {task.note || 'No administrative instructions recorded.'}
                        </p>
                      </div>

                      {/* Immediate Check-Off and Contact Button */}
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-200/30 mt-1">
                        <button
                          onClick={() => handleCompleteTask(task)}
                          className="flex-1 py-3 bg-emerald-600 text-white hover:bg-emerald-500 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-700/5 hover:-translate-y-px transition-all cursor-pointer"
                        >
                          <Check size={12} strokeWidth={3} />
                          Complete
                        </button>
                        
                        {isCall && (
                          <button
                            onClick={() => {
                              setIsDialerOpen(true);
                            }}
                            className="w-10 h-10 bg-white border border-amber-200 hover:border-amber-400 hover:bg-amber-50 text-amber-600 rounded-full flex items-center justify-center hover:-translate-y-px transition-all shadow-sm shrink-0 cursor-pointer"
                            title="Start Callback"
                          >
                            <PhoneCall size={14} strokeWidth={2.5} />
                          </button>
                        )}
                        
                        {isMeeting && (
                          <div className="w-10 h-10 bg-rose-50 border border-rose-200 text-[#F43F5E] rounded-full flex items-center justify-center shrink-0 shadow-2xs">
                            <Video size={14} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* INTERACTIVE ANALYTICS DRILL-DOWN PANEL */}
      <div className="bento-card p-6 border border-slate-200/60 bg-white shadow-sm rounded-2xl">
        <div className="flex items-center gap-2 mb-4 text-xs font-semibold text-[#1D1D1F] tracking-wide">
          <Filter className="w-4 h-4 text-indigo-500" />
          <span>Interactive Scope Filters</span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Timeframe Interval Selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Time Resolution</label>
            <div className="flex rounded-xl bg-slate-100 p-1 w-full">
              {(['day', 'month', 'year', 'all'] as TimeframeType[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`flex-1 text-[11px] font-extrabold uppercase py-1.5 rounded-lg transition-all cursor-pointer text-center ${
                    timeframe === tf
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Specific Timepicker based on resolution */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Selected Period</label>
            <div>
              {timeframe === 'day' && (
                <input
                  type="date"
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-[#1D1D1F] outline-none focus:border-indigo-500 transition-colors"
                />
              )}
              {timeframe === 'month' && (
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-[#1D1D1F] outline-none focus:border-indigo-500 transition-colors"
                />
              )}
              {timeframe === 'year' && (
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-[#1D1D1F] outline-none focus:border-indigo-500 transition-colors cursor-pointer"
                >
                  {Array.from({ length: 5 }).map((_, i) => {
                    const yr = String(new Date().getFullYear() - i);
                    return <option key={yr} value={yr}>{yr} Calendar Year</option>;
                  })}
                </select>
              )}
              {timeframe === 'all' && (
                <div className="w-full bg-slate-100/70 text-slate-500 text-xs font-bold rounded-xl px-4 py-2 select-none">
                  All Records Aggregate
                </div>
              )}
            </div>
          </div>

          {/* Salesperson Selector */}
          <div className="space-y-1.5 md:col-span-2 lg:col-span-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Representative Analysis</label>
            <div>
              {isAdmin ? (
                <select
                  value={selectedRep}
                  onChange={(e) => setSelectedRep(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-[#1D1D1F] outline-none focus:border-indigo-500 transition-colors cursor-pointer"
                >
                  <option value="all">🌐 All Representatives (Consolidated)</option>
                  {team.filter(t => t.role === 'sales_rep').map(rep => (
                    <option key={rep.uid} value={rep.uid}>
                      👤 {rep.displayName || rep.email}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="w-full bg-indigo-50/50 border border-indigo-100 text-indigo-700 text-xs font-bold rounded-xl px-4 py-2 flex items-center justify-between select-none">
                  <span>🔒 Personal File: {profile?.displayName}</span>
                  <span className="text-[9px] uppercase tracking-wider font-extrabold opacity-70">Sales Rep</span>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* FILTER-SENSITIVE CONTEXT BANNER */}
      <div className="flex flex-wrap items-center gap-3 bg-white/70 backdrop-blur pl-5 pr-4 py-3 border border-slate-100 rounded-2xl text-xs font-bold text-slate-600 justify-between animate-fade-in shadow-xs">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-indigo-500" />
          <span>Active Scope:</span>
          <span className="bg-slate-150/85 text-slate-800 px-3 py-1 rounded-full font-black uppercase text-[10px]">
            {timeframe === 'day' && `Single Day: ${selectedDay}`}
            {timeframe === 'month' && `Reporting Month: ${formatMonthTitle(selectedMonth)}`}
            {timeframe === 'year' && `Calendar Year: ${selectedYear}`}
            {timeframe === 'all' && 'Entire Database All-Time'}
          </span>
          <span className="text-slate-300">|</span>
          <span>Rep:</span>
          <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-black uppercase text-[10px]">
            {repFilterVal === 'all' ? 'All Team Members' : team.find(r => r.uid === repFilterVal)?.displayName || 'Single Rep'}
          </span>
        </div>
        <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
          Showing {activeLeads.length} leads matching filters
        </div>
      </div>

      {/* DYNAMIC KPI SUMMARY CARD GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          label="Active Pipeline Inquiries" 
          value={activeStats.total} 
          subText={`${activeLeads.filter(l => l.status === 'new').length} newly added leads`}
          icon={Users} 
          colorClass="text-indigo-600 bg-indigo-50"
        />
        <StatCard 
          label="Closed Enrollments" 
          value={`${activeStats.enrolled}`} 
          subText={activeStats.total > 0 ? `Conversion Rate: ${Math.round((activeStats.enrolled / activeStats.total) * 100)}%` : 'No lead records'}
          icon={UserCheck} 
          colorClass="text-emerald-600 bg-emerald-50" 
        />
        <StatCard 
          label="Yield Revenue" 
          value={`₹${activeStats.revenue.toLocaleString()}`} 
          subText="Enrollment fees less discounts in scope"
          icon={DollarSign} 
          colorClass="text-purple-600 bg-purple-50" 
        />

        {/* Dynamic target tracking progress */}
        <div className="bento-card p-6 h-full bg-gradient-to-tr from-slate-900 via-indigo-950 to-slate-950 text-white flex flex-col justify-between border-none shadow-lg shadow-indigo-950/20 relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-[20%] translate-y-[-20%] w-32 h-32 bg-white/5 rounded-full blur-2xl"></div>
          <div>
            <div className="flex justify-between items-center mb-2">
              <p className="text-[10px] font-black uppercase text-indigo-300 tracking-wider">Dynamic Target Completion</p>
              <TargetIcon className="w-4 h-4 text-indigo-300 animate-pulse" />
            </div>
            
            <h3 className="text-3xl font-black">
              {activeStats.enrolled}
              <span className="text-indigo-300/60 text-lg font-medium">/{activeTargetGoal || '—'}</span>
            </h3>
          </div>
          
          <div className="w-full h-1.5 bg-white/15 rounded-full mt-4 overflow-hidden">
             <div 
               className="h-full bg-gradient-to-r from-teal-400 via-indigo-400 to-pink-400 transition-all duration-1000" 
               style={{ width: `${activeTargetGoal > 0 ? Math.min((activeStats.enrolled / activeTargetGoal) * 100, 100) : 0}%` }}
             ></div>
          </div>
          
          <div className="flex justify-between items-center mt-3 text-[10px] font-bold text-indigo-200">
             <span className="uppercase tracking-wider">
               {activeTargetGoal > 0 ? `${Math.round((activeStats.enrolled / activeTargetGoal) * 100)}% Target met` : 'No targets configured'}
             </span>
             <span className="font-mono opacity-65">
               Goal: {activeTargetGoal || 'Unassigned'}
             </span>
          </div>
        </div>
      </div>

      {/* QUICK POWER DIALER MODAL FOR SALES REPS */}
      <QuickActionDrawer 
        isOpen={isDialerOpen}
        onClose={() => setIsDialerOpen(false)}
        tasks={calls}
      />

      {/* DETAILED CHARTS MATRIX BENTO */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* CHART A: TIMELINE & REVENUE TRENDS (AREA & LINE SPLIT) */}
        <div className="lg:col-span-2 bento-card p-6 bg-white border border-slate-200/60 shadow-xs flex flex-col justify-between">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-[#1D1D1F] flex items-center gap-2">
                <TrendingUp size={16} className="text-indigo-500" />
                Revenue & Enrollment Timeline
              </h3>
              <p className="text-[11px] text-slate-400 font-medium mt-1">
                Yield tracking and closed student counts across chosen interval.
              </p>
            </div>
          </div>
          
          <div className="w-full h-[320px]">
            {trendData.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                <span className="text-xs font-semibold">No transactions found in this time window</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trendData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#818cf8" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#818cf8" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="label" 
                    stroke="#94a3b8" 
                    fontSize={10} 
                    fontWeight="bold" 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis 
                    yAxisId="left"
                    stroke="#94a3b8" 
                    fontSize={10} 
                    fontWeight="bold" 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(v) => `₹${v}`}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    stroke="#94a3b8" 
                    fontSize={10} 
                    fontWeight="bold" 
                    tickLine={false} 
                    axisLine={false}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: '#ffffff', 
                      border: '1px solid #e2e8f0', 
                      borderRadius: '16px', 
                      fontSize: '11px',
                      fontWeight: 'bold',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.04)'
                    }} 
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', marginTop: '10px' }} />
                  <Area 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="Revenue" 
                    stroke="#6366f1" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorRevenue)" 
                    name="Revenue Generated (₹)"
                  />
                  <Bar 
                    yAxisId="right"
                    dataKey="Enrolled" 
                    fill="#10b981" 
                    barSize={12} 
                    radius={[4, 4, 0, 0]} 
                    name="Closed Students"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* CHART B: PIPELINE STATUS DONUT FUNNEL */}
        <div className="bento-card p-6 bg-white border border-slate-200/60 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-[#1D1D1F] flex items-center gap-2">
              <PieIcon size={16} className="text-indigo-500" />
              Sales Stage Funnel
            </h3>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Active lead proportions in current segment.
            </p>
          </div>
          
          <div className="relative w-full h-[220px] flex items-center justify-center">
            {statusData.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 py-10">
                <span className="text-xs font-semibold">Funnel is empty</span>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie 
                      data={statusData} 
                      cx="50%" 
                      cy="50%" 
                      innerRadius={65} 
                      outerRadius={85} 
                      paddingAngle={3} 
                      dataKey="value" 
                      stroke="none"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: '#fff', 
                        border: '1px solid #e2e8f0', 
                        borderRadius: '12px', 
                        fontSize: '11px',
                        fontWeight: 'bold'
                      }} 
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Visual indicator in middle */}
                <div className="absolute text-center">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Active</span>
                  <div className="text-2xl font-black text-[#1D1D1F]">{activeStats.total}</div>
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-100">
            {statusData.map((entry, i) => (
              <div key={entry.name} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{backgroundColor: COLORS[i % COLORS.length]}}></div>
                <div className="flex justify-between w-full text-[10px] font-bold text-[#1D1D1F] truncate">
                  <span className="text-slate-400 truncate mr-2">{entry.name}</span>
                  <span className="font-bold font-mono">{entry.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* DETAIL BENTO SECTION (COURSE PERFORMANCE & REPRESENTATIVES COMPARED) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* CHART C: COURSE-WISE PERFORMANCE & REVENUES */}
        <div className="bento-card p-6 bg-white border border-slate-200/60 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-[#1D1D1F] flex items-center gap-2">
              <Award size={16} className="text-indigo-500" />
              Course Enrolments & Yield Values
            </h3>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Popular courses, admissions volume, and financial revenue yields.
            </p>
          </div>

          <div className="w-full h-[280px] mt-6">
            {coursePerformanceData.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <span className="text-xs font-semibold">No active student bookings for this interval</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={coursePerformanceData} layout="vertical" margin={{ top: 0, right: 10, left: 15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                  <XAxis type="number" stroke="#94a3b8" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    stroke="#475569" 
                    fontSize={10} 
                    fontWeight="black" 
                    tickLine={false} 
                    axisLine={false} 
                    width={90}
                    tickFormatter={(v) => v.length > 12 ? `${v.slice(0, 11)}...` : v}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: '#fff', 
                      border: '1px solid #e2e8f0', 
                      borderRadius: '12px', 
                      fontSize: '11.5px',
                      fontWeight: 'bold'
                    }} 
                  />
                  <Bar dataKey="Revenue" fill="#6366f1" radius={[0, 4, 4, 0]} name="Revenue (₹)" />
                  <Bar dataKey="Enrolled" fill="#14b8a6" radius={[0, 4, 4, 0]} name="Admissions" barSize={8} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
            <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Top Stream Conversion</h4>
            <div className="space-y-1.5 max-h-[120px] overflow-auto">
              {coursePerformanceData.slice(0, 3).map((cp) => (
                <div key={cp.name} className="flex justify-between items-center text-xs font-bold text-slate-700">
                  <span className="truncate max-w-[200px] text-slate-800">{cp.name}</span>
                  <div className="flex gap-4 items-center">
                    <span className="text-[10px] font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                      Conv: {cp['Conv %']}%
                    </span>
                    <span className="text-[#1D1D1F] font-black">₹{cp.Revenue.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CHART D: REPRESENTATIVE TARGET STANDINGS (ONLY SHOWN FULLY IN CONSOLIDATED MODES) */}
        <div className="bento-card p-6 bg-white border border-slate-200/60 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-[#1D1D1F] flex items-center gap-2">
              <TrendingUp size={16} className="text-indigo-500" />
              Representative Standings & Targets
            </h3>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Sales staff closed conversions compared to assigned goals.
            </p>
          </div>

          <div className="w-full h-[280px] mt-6">
            {repPerformanceData.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <span className="text-xs font-semibold">No representatives matching filters</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={repPerformanceData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: '#fff', 
                      border: '1px solid #e2e8f0', 
                      borderRadius: '12px', 
                      fontSize: '11px',
                      fontWeight: 'bold'
                    }} 
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 'bold' }} />
                  <Bar dataKey="Enrolled" fill="#10b981" radius={[4, 4, 0, 0]} name="Conversions Achieved" />
                  <Bar dataKey="Target" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Assigned Goal" barSize={10} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
            <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Representative Leaderboard</h4>
            <div className="space-y-1.5 max-h-[120px] overflow-auto">
              {repPerformanceData.map((rep) => (
                <div key={rep.uid || rep.name} className="flex justify-between items-center text-xs font-bold text-slate-700">
                  <span className="text-slate-800">{rep.name}</span>
                  <div className="flex gap-3 items-center">
                    <span className="text-[10px] font-bold text-slate-400 font-mono">
                      {rep.Enrolled} / {rep.Target || '—'} Enrolled
                    </span>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                      rep['Target %'] >= 100 
                        ? 'bg-emerald-50 text-emerald-600' 
                        : rep['Target %'] > 50 
                        ? 'bg-amber-50 text-amber-600' 
                        : 'bg-indigo-50 text-indigo-600'
                    }`}>
                      {rep['Target %']}% Goal
                    </span>
                    <span className="text-slate-900 font-extrabold text-[12.5px]">₹{rep.Revenue.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* PERSISTENT AGENDA/FOLLOW-UP NOTIFICATION COLUMN */}
      <div className="bento-card p-6 bg-slate-50/70 border border-slate-150 rounded-2xl">
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
          <Clock size={14} className="text-slate-500" />
          Urgent Lead Queue
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(() => {
            const priorityCalls = calls.slice(0, 3).map(c => ({
              id: c.id,
              name: c.leadName || 'Unnamed Prospect',
              status: 'Urgent Callback',
              score: 90,
              badge: 'Follow-up Needed',
              color: 'text-amber-600 bg-amber-50 border-amber-200'
            }));

            const hotNewLeads = leads
              .filter(l => l.status === 'new' || (l.score > 80 && l.status !== 'enrolled'))
              .slice(0, 3)
              .map(l => ({
                id: l.id,
                name: l.name,
                status: `Hot Intake (Score: ${l.score})`,
                score: l.score,
                badge: 'New Lead',
                color: 'text-indigo-600 bg-indigo-50 border-indigo-200'
              }));
            
            const listToDisplay = [...priorityCalls, ...hotNewLeads].slice(0, 3);
            
            if (listToDisplay.length === 0) {
              return (
                <div className="col-span-full py-8 text-center text-slate-400 font-medium text-xs">
                  ✨ Excellent! All queues are fully cleared.
                </div>
              );
            }

            return listToDisplay.map((item, idx) => (
              <div key={item.id || idx} className="bg-white p-4 rounded-xl border border-slate-200/50 hover:border-slate-350 transition-all shadow-sm flex flex-col justify-between group">
                <div>
                  <div className="flex justify-between items-start gap-1">
                    <span className="text-xs font-black text-slate-800 truncate">{item.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border shrink-0 ${item.color}`}>
                      {item.badge}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-semibold mt-1">{item.status}</p>
                </div>
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-100 text-xs">
                  <span className="text-[10px] font-mono text-slate-400">Score Index: <span className="font-extrabold text-indigo-500">{item.score}%</span></span>
                  <span className="text-indigo-600 font-extrabold flex items-center gap-0.5 text-[10px] uppercase tracking-wider group-hover:translate-x-1 transition-transform">
                    View
                    <ChevronRight size={12} strokeWidth={2.5} />
                  </span>
                </div>
              </div>
            ));
          })()}
        </div>
      </div>

    </div>
  );
};
