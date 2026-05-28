import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs, deleteDoc, getDocFromServer } from 'firebase/firestore';
import { auth, db, signInWithGoogle } from '../lib/firebase';
import { UserProfile, FirestoreErrorInfo, OperationType } from '../types';
import { Mail, Lock, LogIn, Chrome } from 'lucide-react';

interface AuthContextType {
  user: User | null | { email: string; displayName: string; uid: string };
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  setManualUser: (user: any, profile: UserProfile) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  setManualUser: () => {},
  logout: () => {},
});

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function seedUsersIfEmpty() {
  try {
    // 1. Clean up duplicate or previous manual admin documents to keep only 1 OAuth admin
    const adminRef1 = doc(db, 'users', 'manual_admin_1');
    const adminRef2 = doc(db, 'users', 'manual_bhaskar');
    await deleteDoc(adminRef1);
    await deleteDoc(adminRef2);

    // Query all users and delete any whose role is 'admin' but email is not the owner email
    const usersSnap = await getDocs(collection(db, 'users'));
    for (const d of usersSnap.docs) {
      const u = d.data();
      if (u.role === 'admin' && u.email !== 'bhaskarnagendra@gmail.com') {
        console.log("Deleting non-owner admin user:", d.id, u.email);
        await deleteDoc(doc(db, 'users', d.id));
      }
    }

    // 2. Add or update the default sales team members to Monish and Arpita
    const defaultUsers = [
      {
        uid: "manual_sales_1",
        displayName: "Monish",
        email: "monish@leadsculptor.com",
        password: "12345",
        role: "sales_rep",
      },
      {
        uid: "manual_sales_2",
        displayName: "Arpita",
        email: "arpita@leadsculptor.com",
        password: "12345",
        role: "sales_rep",
      }
    ];
    
    for (const u of defaultUsers) {
      await setDoc(doc(db, 'users', u.uid), {
        uid: u.uid,
        displayName: u.displayName,
        email: u.email,
        password: u.password,
        role: u.role,
        createdAt: serverTimestamp()
      }, { merge: true });
    }
  } catch (err) {
    console.error("User profiles seeding and cleanup failed:", err);
  }
}

export async function seedAdminDataIfEmpty() {
  try {
    // 1. Seed courses
    const coursesSnap = await getDocs(collection(db, 'courses'));
    if (coursesSnap.empty) {
      console.log("Seeding default courses...");
      const courses = [
        { id: 'course_web_dev', name: 'Full Stack Web Development', duration: '6 Months', fees: 120000, description: 'Learn React, Node.js, Express, and databases from scratch to professional.' },
        { id: 'course_ui_ux', name: 'UX/UI Design Masterclass', duration: '3 Months', fees: 65000, description: 'Master Figma, prototyping, user research, and interactive experience design.' },
        { id: 'course_ai_ds', name: 'Data Science & Artificial Intelligence', duration: '4 Months', fees: 95000, description: 'Master Python, machine learning, data analysis, and language model integrations.' }
      ];
      for (const c of courses) {
        await setDoc(doc(db, 'courses', c.id), {
          ...c,
          createdAt: serverTimestamp()
        });
      }
    }

    // 2. Cleanup existing dummy leads to ensure starting with clean empty collections
    const dummyLeadIds = ['lead_1', 'lead_2', 'lead_3', 'lead_4', 'lead_5'];
    for (const lid of dummyLeadIds) {
      try {
        await deleteDoc(doc(db, 'leads', lid, 'followups', `followup_${lid}`));
        await deleteDoc(doc(db, 'leads', lid));
      } catch (e) {
        // Ignore permission or not found errors during quiet cleanup
      }
    }

    // 3. Seed targets
    const targetsSnap = await getDocs(collection(db, 'targets'));
    if (targetsSnap.empty) {
      console.log("Seeding representative targets...");
      const activeMonth = new Date().toISOString().slice(0, 7);
      const targets = [
        { id: `manual_sales_1_${activeMonth}`, userId: 'manual_sales_1', userName: 'Monish', target: 5, month: activeMonth },
        { id: `manual_sales_2_${activeMonth}`, userId: 'manual_sales_2', userName: 'Arpita', target: 8, month: activeMonth }
      ];
      for (const t of targets) {
        await setDoc(doc(db, 'targets', t.id), {
          userId: t.userId,
          fullName: t.userName, // backward compatibility
          userName: t.userName,
          month: t.month,
          target: t.target,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    }
  } catch (err) {
    console.error("Admin data seeding error:", err);
  }
}

let isDirectSigningIn = false;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        if (firebaseUser.isAnonymous) {
          if (isDirectSigningIn) {
            // Wait for handleDirectLogin to complete and call setManualUser.
            return;
          }
          // Resume/Recover existing anonymous session on browser load
          try {
            const sessionDoc = await getDocFromServer(doc(db, 'sessions', firebaseUser.uid));
            if (sessionDoc.exists()) {
              const sessionData = sessionDoc.data();
              const realUserDoc = await getDoc(doc(db, 'users', sessionData.realUid));
              if (realUserDoc.exists()) {
                const profileData = realUserDoc.data() as UserProfile;
                setUser(firebaseUser);
                setProfile(profileData);
              } else {
                await auth.signOut();
              }
            } else {
              await auth.signOut();
            }
          } catch (sessionErr) {
            console.error("Session lookup failed on recovery:", sessionErr);
            await auth.signOut();
          } finally {
            setLoading(false);
          }
        } else {
          // Standard Google/OAuth User flow
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          let profileToSet: UserProfile | null = null;
          try {
            const userDoc = await getDoc(userDocRef);
            const isOwnerEmail = firebaseUser.email === 'bhaskarnagendra@gmail.com';
            
            if (userDoc.exists()) {
              const data = userDoc.data() as UserProfile;
              if (isOwnerEmail && data.role !== 'admin') {
                try {
                  await setDoc(userDocRef, { ...data, role: 'admin' }, { merge: true });
                  profileToSet = { ...data, role: 'admin' };
                } catch (upgradeErr) {
                  profileToSet = data;
                }
              } else {
                profileToSet = data;
              }
            } else {
              const newProfile: UserProfile = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                displayName: firebaseUser.displayName || 'Unnamed User',
                role: isOwnerEmail ? 'admin' : 'sales_rep',
                createdAt: serverTimestamp(),
              };
              try {
                await setDoc(userDocRef, newProfile);
                profileToSet = newProfile;
              } catch (createErr) {
                handleFirestoreError(createErr, OperationType.CREATE, `users/${firebaseUser.uid}`);
              }
            }
            if (profileToSet && profileToSet.role === 'admin') {
              seedUsersIfEmpty().catch(err => console.error("Database seeding and cleanup failed:", err));
              seedAdminDataIfEmpty().catch(err => console.error("Admin seeding failed:", err));
            }
          } catch (error) {
            console.error("Error in oauth profile lifecycle:", error);
            if (error instanceof Error && error.message.includes('permission')) {
              handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
            }
          }

          setUser(firebaseUser);
          setProfile(profileToSet);
          setLoading(false);
        }
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const setManualUser = (u: any, p: UserProfile) => {
    setUser(u);
    setProfile(p);
    setLoading(false);
  };

  const logout = async () => {
    try {
      if (auth.currentUser) {
        await deleteDoc(doc(db, 'sessions', auth.currentUser.uid));
      }
    } catch (e) {
      console.warn("Session cleanup failed:", e);
    }
    import('../lib/firebase').then(m => m.logOut());
    setUser(null);
    setProfile(null);
  };

  const isAdmin = profile?.role === 'admin' || 
                  user?.email === 'bhaskarnagendra@gmail.com' || 
                  profile?.email === 'bhaskarnagendra@gmail.com';

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, setManualUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

export const AuthBarrier: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, setManualUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'google' | 'direct'>('google');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleLogin = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    setError('');

    try {
      const { signInWithGoogle: firebaseSignIn } = await import('../lib/firebase');
      await firebaseSignIn();
    } catch (err: any) {
      console.error("Google Login Error:", err);
      if (err.code === 'auth/popup-blocked') {
        setError('Popup was blocked by your browser. Please allow popups for this site and try again.');
      } else if (err.code === 'auth/unauthorized-domain' || (err.message && err.message.toLowerCase().includes('unauthorized-domain'))) {
        setError(`UNAUTHORIZED_DOMAIN:${window.location.hostname}`);
      } else if (err.code === 'auth/network-request-failed' || (err.message && err.message.toLowerCase().includes('network-request-failed'))) {
        setError(`NETWORK_REQUEST_FAILED:${window.location.hostname}`);
      } else if (err.code === 'auth/cancelled-popup-request') {
        setError('Login request was cancelled or timed out. Please try again.');
      } else if (err.message?.includes('Pending promise')) {
        setError('A login attempt is already in progress. Please refresh if this persists.');
      } else if (err.message) {
        setError(err.message);
      } else {
        setError('Failed to sign in with Google. Please try again.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleDirectLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Normalize "Monish" / "Arpita" etc.
    const searchVal = email.trim();
    const searchPass = password.trim();

    try {
      isDirectSigningIn = true;

      // 1. Sign in anonymously first to get a Firebase Identity
      const { user: anonUser } = await signInAnonymously(auth);
      
      let p: UserProfile | null = null;

      // Query for users in database
      const usersRef = collection(db, 'users');
      const qEmail = query(usersRef, where('email', '==', searchVal), where('password', '==', searchPass));
      const qName = query(usersRef, where('displayName', '==', searchVal), where('password', '==', searchPass));
      
      const [snapEmail, snapName] = await Promise.all([getDocs(qEmail), getDocs(qName)]);
      const snapshot = !snapEmail.empty ? snapEmail : snapName;
      
      if (!snapshot.empty) {
        p = snapshot.docs[0].data() as UserProfile;
      }

      if (!p) {
        const isDefaultAdmin = searchVal.toLowerCase() === 'bhaskarnagendra@gmail.com' && searchPass === '12345';
        const isDefaultMonish = searchVal.toLowerCase() === 'monish' && searchPass === '12345';
        const isDefaultArpita = searchVal.toLowerCase() === 'arpita' && searchPass === '12345';

        if (isDefaultAdmin || isDefaultMonish || isDefaultArpita) {
          console.log("Empty database detected on login attempt. Autoseeding users & default data...");
          try {
            const adminProfile: UserProfile = {
              uid: 'manual_admin_bhaskar',
              email: 'bhaskarnagendra@gmail.com',
              displayName: 'Nagendra Bhaskar',
              role: 'admin',
              createdAt: serverTimestamp(),
            };
            await setDoc(doc(db, 'users', adminProfile.uid), {
              ...adminProfile,
              password: '12345'
            });

            await seedUsersIfEmpty();

            const qEmailRetry = query(usersRef, where('email', '==', searchVal), where('password', '==', searchPass));
            const qNameRetry = query(usersRef, where('displayName', '==', searchVal), where('password', '==', searchPass));
            
            const [snapEmailRetry, snapNameRetry] = await Promise.all([getDocs(qEmailRetry), getDocs(qNameRetry)]);
            const snapshotRetry = !snapEmailRetry.empty ? snapEmailRetry : snapNameRetry;
            
            if (!snapshotRetry.empty) {
              p = snapshotRetry.docs[0].data() as UserProfile;
            } else if (isDefaultAdmin) {
              p = adminProfile;
            }
          } catch (seedErr) {
            console.error("Autoseeding on direct login failed", seedErr);
          }
        }
      }
      
      if (p) {
        // 3. Create a Session Link in Firestore
        // This validates the anonymous session
        const sessionRef = doc(db, 'sessions', anonUser.uid);
        await setDoc(sessionRef, {
          realUid: p.uid,
          role: p.role,
          displayName: p.displayName,
          createdAt: serverTimestamp()
        });

        if (p.role === 'admin') {
          await seedAdminDataIfEmpty();
        }

        // Force an immediate profile update instead of waiting for onAuthStateChanged
        setManualUser(anonUser, p);
      } else {
        await auth.signOut();
        setError('Invalid credentials. (Hint: Monish / 12345)');
      }
    } catch (err: any) {
      console.error("Direct Login Error:", err);
      // Clean up failed attempt
      try { await auth.signOut(); } catch {}
      
      if (err.message?.includes('permission')) {
        setError('ACCESS_PERMISSION_ERROR');
      } else if (err.code === 'auth/operation-not-allowed' || err.code === 'auth/admin-restricted-operation') {
        setError('ANONYMOUS_AUTH_DISABLED');
      } else if (err.message) {
        setError(`Login failed: ${err.message}`);
      } else {
        setError('Access denied. Please check credentials.');
      }
    } finally {
      isDirectSigningIn = false;
    }
  };

  if (loading) return (
    <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  if (!user) {
    return (
       <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-md bg-white rounded-[32px] shadow-2xl shadow-indigo-900/10 overflow-hidden border border-slate-200">
           <div className="p-10 pb-6 text-center">
              <div className="w-16 h-16 bg-indigo-600 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-indigo-200">
                <LogIn className="text-white" size={32} />
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-800">LeadSculptor</h1>
              <p className="text-slate-400 text-sm font-medium mt-1">Design College Sales Orchestrator</p>
           </div>

           <div className="flex px-10 gap-4 border-b border-slate-100">
              <button 
                onClick={() => setActiveTab('google')}
                className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${activeTab === 'google' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}
              >
                OAuth Login
              </button>
              <button 
                onClick={() => setActiveTab('direct')}
                className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${activeTab === 'direct' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}
              >
                Direct Access
              </button>
           </div>

           <div className="p-10 pt-8">
              {activeTab === 'google' ? (
                 <div className="space-y-6">
                    <p className="text-xs text-slate-500 leading-relaxed text-center">Use your authorized Google Workspace account to securely access the pipeline.</p>
                    
                    {error && error.startsWith('UNAUTHORIZED_DOMAIN:') ? (() => {
                      const domain = error.split(':')[1] || window.location.hostname;
                      return (
                        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5 space-y-3 text-left">
                          <p className="text-xs font-black text-amber-850 uppercase tracking-wider flex items-center gap-1.5">
                            ⚠️ Domain Authorization Required
                          </p>
                          <p className="text-[11px] text-amber-900 leading-relaxed font-semibold">
                            Google Sign-In failed because the current domain <code className="bg-amber-100 rounded px-1.5 py-0.5 text-rose-700 font-mono font-bold">{domain}</code> is not authorized in your Firebase authentication settings.
                          </p>
                          <p className="text-[11px] text-amber-800 leading-relaxed font-bold">To authorize this domain on Vercel:</p>
                          <ol className="text-[10px] text-amber-850 space-y-2 list-decimal ml-4 font-medium leading-normal">
                            <li>Open the <b>Firebase Console</b> for your project</li>
                            <li>Navigate to <b>Authentication</b> &gt; <b>Settings</b> &gt; <b>Authorized domains</b></li>
                            <li>Click <b>Add domain</b> and paste: <code className="bg-amber-100/90 text-indigo-700 px-1.5 py-0.5 rounded font-mono font-bold select-all">{domain}</code></li>
                          </ol>
                          <div className="bg-amber-100/60 p-2.5 rounded-xl border border-amber-200/80 text-[10px] text-amber-850 font-medium leading-relaxed font-semibold">
                            <b>Admin Notice:</b> When running inside the AI Studio sandbox, operations work seamlessly because the platform pre-authorizes the run.app sandbox domains. When deployed to your own external custom domains like Vercel, Firebase security policies require registering those origins explicitly.
                          </div>
                          <button 
                            type="button"
                            onClick={() => setError('')} 
                            className="mt-1 w-full bg-amber-200 text-amber-955 text-[10px] font-extrabold py-2 rounded-lg uppercase hover:bg-amber-300 transition-colors tracking-wider"
                          >
                            Okay, understanding / Try again
                          </button>
                        </div>
                      );
                    })() : error && error.startsWith('NETWORK_REQUEST_FAILED:') ? (() => {
                      const domain = error.split(':')[1] || window.location.hostname;
                      return (
                        <div className="bg-indigo-50/90 border border-indigo-200 rounded-2xl p-5 space-y-3 text-left">
                          <p className="text-xs font-black text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                            🔒 Browser Security Blocked Popup
                          </p>
                          <p className="text-[11px] text-indigo-950 leading-relaxed font-semibold">
                            Google login was blocked or interrupted by browser cookie controls (often Brave Shield, Safari Private Mode, cookie blockers, or strict AdBlockers).
                          </p>
                          <p className="text-[11px] text-indigo-900 font-bold leading-normal">Recommended Solutions:</p>
                          <ul className="text-[10px] text-indigo-900 space-y-1.5 list-disc ml-4 font-semibold leading-normal">
                            <li>Disable **Brave Shields / Ad-blocker** for this domain temporarily.</li>
                            <li>Allow third-party cookies & redirect Popups in your browser settings.</li>
                            <li>Using iOS/Safari? Disable **"Prevent Cross-Site Tracking"** or use Chrome.</li>
                            <li><b>Easiest Bypass Checklist:</b> Click the <b>"Direct Access"</b> tab above and type your admin email to access the system instantly without any popup or network limits!</li>
                          </ul>
                          <div className="bg-indigo-100/50 p-2.5 rounded-xl border border-indigo-200/50 text-[10px] text-indigo-950 font-bold leading-relaxed">
                            <b>Admin Direct Fallback:</b> Since you are the Administrator, click the <b>Direct Access</b> tab, enter <code className="bg-white px-1 text-slate-800 font-mono font-black rounded">bhaskarnagendra@gmail.com</code> with Password: <code className="bg-white px-1 text-slate-800 font-mono font-black rounded">12345</code> to enter securely.
                          </div>
                          <button 
                            type="button"
                            onClick={() => setError('')} 
                            className="w-full bg-indigo-200 hover:bg-indigo-300 text-indigo-950 text-[10px] font-extrabold py-2 rounded-lg uppercase transition-colors tracking-wider"
                          >
                            Okay, understand / Retry
                          </button>
                        </div>
                      );
                    })() : error && (
                      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-left">
                        <p className="text-xs font-bold text-rose-800 uppercase tracking-wider mb-1">Authorization Action Required</p>
                        <p className="text-[10px] font-medium text-rose-700 leading-relaxed">{error}</p>
                        <p className="text-[10px] text-slate-500 mt-2 leading-relaxed font-normal">
                          If the domain is not authorized, please switch to the <b>"Direct Access"</b> tab to log in using Sales Rep or Admin credentials.
                        </p>
                        <button 
                          type="button"
                          onClick={() => setError('')} 
                          className="mt-2 text-[10px] font-extrabold text-rose-900 hover:underline uppercase tracking-wider"
                        >
                          Clear Error
                        </button>
                      </div>
                    )}
                    <button
                      onClick={handleGoogleLogin}
                      disabled={googleLoading}
                      className="w-full flex items-center justify-center gap-3 bg-slate-900 text-white rounded-2xl px-6 py-4 font-bold hover:bg-slate-800 transition-all shadow-lg hover:translate-y-[-2px] active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {googleLoading ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <Chrome size={20} />
                          Continue with Google
                        </>
                      )}
                    </button>
                 </div>
              ) : (
                <form onSubmit={handleDirectLogin} className="space-y-4">
                   <div>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                        <input 
                          type="text"
                          required
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          placeholder="Email or Sales Rep Name"
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-4 text-sm focus:ring-4 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all placeholder:text-slate-300"
                        />
                      </div>
                   </div>
                   <div>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                        <input 
                          type="password"
                          required
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          placeholder="Access Token / Password (12345)"
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-4 text-sm focus:ring-4 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all placeholder:text-slate-300"
                        />
                      </div>
                   </div>
                    <p className="text-[10px] text-slate-500 font-semibold leading-relaxed px-1 my-3 tracking-wide text-center">
                      <b>Bypass Credentials:</b> Email <code className="bg-slate-100 px-1 rounded text-slate-800 font-bold select-all">bhaskarnagendra@gmail.com</code> or Name <code className="bg-slate-100 px-1 rounded text-slate-800 font-bold">Monish / Arpita</code> / Password: <code className="bg-slate-100 px-1 rounded text-slate-800 font-bold">12345</code>
                    </p>
                   {error === 'ANONYMOUS_AUTH_DISABLED' ? (
                     <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 space-y-3">
                        <p className="text-xs font-bold text-amber-800 uppercase tracking-tight">Developer Setup Required</p>
                        <p className="text-xs text-amber-700 leading-relaxed">
                          <b>Anonymous Authentication</b> must be enabled in your Firebase Console for Name/Password login to work:
                        </p>
                        <ol className="text-[11px] text-amber-700 space-y-2 list-decimal ml-4 font-medium">
                          <li>Open <b>Firebase Console</b></li>
                          <li>Go to <b>Authentication</b> &gt; <b>Sign-in method</b></li>
                          <li>Click <b>Add new provider</b></li>
                          <li>Select <b>Anonymous</b> and click <b>Enable</b></li>
                        </ol>
                        <button 
                          type="button"
                          onClick={() => setError('')} 
                          className="mt-2 w-full bg-amber-200 text-amber-900 text-[10px] font-bold py-2 rounded-lg uppercase hover:bg-amber-300 transition-colors"
                        >
                          I've enabled it, try again
                        </button>
                     </div>
                   ) : error === 'ACCESS_PERMISSION_ERROR' ? (
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-6 space-y-3">
                      <p className="text-xs font-bold text-red-800 uppercase tracking-tight">Permission Denied</p>
                      <p className="text-[11px] text-red-700 leading-relaxed font-medium">
                        The system couldn't verify your credentials due to security rule restrictions. 
                        Please ensure you haven't recently changed your account settings or contact the technical administrator.
                      </p>
                      <button 
                        type="button"
                        onClick={() => setError('')} 
                        className="mt-2 w-full bg-red-200 text-red-900 text-[10px] font-bold py-2 rounded-lg uppercase hover:bg-red-300 transition-colors"
                      >
                        Try Again
                      </button>
                    </div>
                   ) : error && (
                     <p className="text-[10px] font-bold text-red-500 uppercase text-center px-4 leading-tight">{error}</p>
                   )}
                   <button
                      type="submit"
                      className="w-full bg-indigo-600 text-white rounded-2xl px-6 py-4 font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 hover:translate-y-[-2px] active:translate-y-0 mt-4"
                    >
                      Enter Pipeline
                    </button>


                </form>
              )}
           </div>

           <div className="bg-slate-50 p-6 text-center border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Confidential System • authorized personnel only</p>
           </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
