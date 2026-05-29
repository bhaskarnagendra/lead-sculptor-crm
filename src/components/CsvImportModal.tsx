import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { X, Upload, CheckCircle2, AlertCircle, Clipboard, FileSpreadsheet, ArrowRight, Check, ListFilter, Users, Tag } from 'lucide-react';
import { collection, writeBatch, doc, serverTimestamp, getDocs, getDoc, query, where, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, useAuth } from './AuthContext';
import { OperationType, Course, LeadStatus } from '../types';
import { calculateLeadScore } from '../utils/LeadScoring';

interface CsvImportModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const CsvImportModal: React.FC<CsvImportModalProps> = ({ onClose, onSuccess }) => {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'paste' | 'file'>('paste');
  const [pasteText, setPasteText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<1 | 2>(1); // Step 1: Input & Settings, Step 2: Mapping & Preview
  const [lastAssignmentIndex, setLastAssignmentIndex] = useState<number>(0);
  
  // Settings
  const [defaultSource, setDefaultSource] = useState('Meta');
  const [customSource, setCustomSource] = useState('');
  const [assignmentStrategy, setAssignmentStrategy] = useState<'round_robin' | 'single_owner' | 'sheet_or_none'>('round_robin');
  const [selectedOwnerUid, setSelectedOwnerUid] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parsed metadata
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [team, setTeam] = useState<{ uid: string; displayName: string; email: string; receiveRoundRobin?: boolean }[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);

  // Mapping state
  const [mapping, setMapping] = useState({
    name: '',
    email: '',
    phone: '',
    courseName: '',
    status: '',
    owner: '',
    source: ''
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch Team and Courses on mount to match references
  useEffect(() => {
    const fetchTeamAndCourses = async () => {
      try {
        const usersRef = collection(db, 'users');
        const userSnap = await getDocs(usersRef);
        const fetchedTeam = userSnap.docs.map(d => ({
          uid: d.id,
          displayName: d.data().displayName || d.data().email?.split('@')[0] || 'Agent',
          email: d.data().email || '',
          role: d.data().role || '',
          receiveRoundRobin: d.data().receiveRoundRobin !== false
        })).filter(member => {
          const nameClean = (member.displayName || '').trim().toLowerCase();
          const hasValidRole = member.role === 'sales_rep' || member.role === 'admin' || !member.role;
          return nameClean && nameClean !== 'unnamed' && nameClean !== 'unknown' && hasValidRole;
        }).sort((a, b) => a.uid.localeCompare(b.uid));

        if (fetchedTeam.length === 0 && profile) {
          fetchedTeam.push({
            uid: profile.uid,
            displayName: profile.displayName || profile.email?.split('@')[0] || 'Me',
            email: profile.email || '',
            role: profile.role || 'admin',
            receiveRoundRobin: true
          });
        }

        setTeam(fetchedTeam);
        if (fetchedTeam.length > 0) {
          setSelectedOwnerUid(fetchedTeam[0].uid);
        }

        const configRef = doc(db, 'config', 'assignment');
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
          setLastAssignmentIndex(configSnap.data().lastIndex || 0);
        }

        const coursesRef = collection(db, 'courses');
        const courseSnap = await getDocs(coursesRef);
        setCourses(courseSnap.docs.map(d => ({ id: d.id, ...d.data() } as Course)));
      } catch (err) {
        console.error("Failed to load reference data context:", err);
      }
    };
    fetchTeamAndCourses();
  }, [profile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  // Parses any text (detecting tabs, commas, semicolons)
  const parseRawText = (text: string) => {
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length === 0) return { detectedHeaders: [], parsedData: [] };

    const firstLine = lines[0];
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;

    let delimiter = '\t';
    if (commaCount > tabCount && commaCount > semicolonCount) {
      delimiter = ',';
    } else if (semicolonCount > tabCount && semicolonCount > commaCount) {
      delimiter = ';';
    }

    const parseRow = (line: string) => {
      if (delimiter === ',') {
        // Simple CSV splitter preserving quoted fields
        return line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.replace(/^"|"$/g, '').trim());
      } else {
        return line.split(delimiter).map(v => v.replace(/^"|"$/g, '').trim());
      }
    };

    const detectedHeaders = parseRow(lines[0]);
    const parsedData: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseRow(lines[i]);
      const row: Record<string, string> = {};
      detectedHeaders.forEach((header, index) => {
        row[header || `Column_${index}`] = values[index] || '';
      });
      parsedData.push(row);
    }

    return { detectedHeaders, parsedData };
  };

  // Perform automatic column header mapping matching based on keywords
  const autoMapHeaders = (detectedHeaders: string[]) => {
    const newMapping = { name: '', email: '', phone: '', courseName: '', status: '', owner: '', source: '' };
    
    detectedHeaders.forEach(h => {
      const lower = h.toLowerCase().trim();
      
      // Name Matcher
      if (
        lower === 'name' || 
        lower.includes('full name') || 
        lower.includes('prospect name') || 
        lower === 'prospect' || 
        lower.includes('student name') ||
        lower.includes('first name') ||
        lower.includes('lead name')
      ) {
        if (!newMapping.name) newMapping.name = h;
      }
      
      // Email Matcher
      if (
        lower.includes('email') || 
        lower === 'mail' || 
        lower.includes('email id') || 
        lower.includes('email address') ||
        lower.includes('emailid')
      ) {
        if (!newMapping.email) newMapping.email = h;
      }
      
      // Phone Matcher
      if (
        lower.includes('phone') || 
        lower.includes('mobile') || 
        lower.includes('contact') || 
        lower.includes('tel') || 
        lower.includes('cell') || 
        lower === 'number' || 
        lower === 'no' || 
        lower.includes('whatsapp')
      ) {
        // Avoid matching serial numbers or courses
        if (!lower.includes('serial') && !lower.includes('roll') && !lower.includes('course') && !lower.includes('id') && !lower.includes('fee')) {
          if (!newMapping.phone) newMapping.phone = h;
        }
      }
      
      // Course Matcher
      if (
        lower.includes('course') || 
        lower.includes('program') || 
        lower.includes('class') || 
        lower.includes('specialization') ||
        lower.includes('subject')
      ) {
        if (!newMapping.courseName) newMapping.courseName = h;
      }
      
      // Status Matcher
      if (
        lower === 'status' || 
        lower === 'stage' || 
        lower.includes('lead status') || 
        lower.includes('pipeline') ||
        lower.includes('sub status') ||
        lower.includes('main status')
      ) {
        if (!newMapping.status) newMapping.status = h;
      }
      
      // Owner Matcher
      if (
        lower.includes('owner') || 
        lower.includes('assigned') || 
        lower.includes('sales') || 
        lower.includes('rep') || 
        lower.includes('assignee') ||
        lower.includes('agent')
      ) {
        if (!newMapping.owner) newMapping.owner = h;
      }
      
      // Source Matcher
      if (
        lower.includes('source') || 
        lower.includes('medium') || 
        lower.includes('campaign') || 
        lower.includes('channel') ||
        lower.includes('utm')
      ) {
        if (!newMapping.source) newMapping.source = h;
      }
    });

    // Fallbacks if nothing matched
    if (!newMapping.name && detectedHeaders.length > 0) newMapping.name = detectedHeaders[0];
    if (!newMapping.phone && detectedHeaders.length > 1) {
      const remaining = detectedHeaders.filter(h => h !== newMapping.name);
      const possiblePhone = remaining.find(h => /phone|number|contact|tel|cell|mobile/i.test(h));
      if (possiblePhone) newMapping.phone = possiblePhone;
    }

    setMapping(newMapping);
  };

  const handleNextStep = () => {
    setError(null);

    if (activeTab === 'paste') {
      if (!pasteText.trim()) {
        setError('Please paste spreadsheet rows first.');
        return;
      }
      const { detectedHeaders, parsedData } = parseRawText(pasteText);
      if (detectedHeaders.length === 0 || parsedData.length === 0) {
        setError('No rows could be extracted. Please check the pasted format.');
        return;
      }
      setHeaders(detectedHeaders);
      setRawRows(parsedData);
      autoMapHeaders(detectedHeaders);
      setStep(2);
    } else {
      if (!file) {
        setError('Please upload a CSV file.');
        return;
      }
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.data.length === 0) {
            setError('The selected file is empty.');
            return;
          }
          const detectedHeaders = results.meta.fields || [];
          setHeaders(detectedHeaders);
          setRawRows(results.data as Record<string, string>[]);
          autoMapHeaders(detectedHeaders);
          setStep(2);
        },
        error: (err) => {
          setError('Failed to parse file: ' + err.message);
        }
      });
    }
  };

  const [importSummary, setImportSummary] = useState<{ saved: number; skipped: number } | null>(null);

  // Helper to match pasted/Excel owner string into real Firestore user profile
  const findTeamMember = (pastedName: string) => {
    if (!pastedName) return null;
    const normalized = pastedName.toLowerCase().trim();
    
    // 1. Check exact display name
    let found = team.find(t => t.displayName.toLowerCase().trim() === normalized);
    if (found) return found;

    // 2. Exact match of first word (e.g. "Arpitha R" matches "Arpita")
    const firstWord = normalized.split(/\s+/)[0];
    found = team.find(t => {
      const dbName = t.displayName.toLowerCase().trim();
      const dbFirstWord = dbName.split(/\s+/)[0];
      return dbFirstWord === firstWord || 
             dbName.includes(firstWord) || 
             firstWord.includes(dbName);
    });
    if (found) return found;

    // 3. Spelling-tolerant check for Monish/Arpita/Arpitha etc (prefix/substring or character overlap)
    const stripped = normalized.replace(/[^a-z]/g, '');
    found = team.find(t => {
      const dbStripped = t.displayName.toLowerCase().trim().replace(/[^a-z]/g, '');
      if (dbStripped === stripped) return true;
      if (dbStripped.startsWith(stripped) || stripped.startsWith(dbStripped)) return true;
      
      // Check 75%+ character overlap for edits/typos
      if (Math.abs(dbStripped.length - stripped.length) <= 3) {
        let matches = 0;
        for (const char of dbStripped) {
          if (stripped.includes(char)) matches++;
        }
        if (matches / Math.max(dbStripped.length, stripped.length) >= 0.70) {
          return true;
        }
      }
      return false;
    });
    if (found) return found;

    // 4. Check email
    found = team.find(t => t.email.toLowerCase().includes(normalized) || normalized.includes(t.email.toLowerCase().split('@')[0]));
    return found;
  };

  // Normalize pipeline status from sheet or pasted data
  const normalizeStatus = (pastedStatus: string): LeadStatus => {
    if (!pastedStatus) return 'new';
    const lower = pastedStatus.toLowerCase().trim();
    if (lower.includes('contact')) return 'contacted';
    if (lower.includes('interest')) return 'interested';
    if (lower.includes('enroll')) return 'enrolled';
    if (lower.includes('lost') || lower.includes('cant invest') || lower.includes('cannot invest')) return 'lost';
    // Default to 'new' or default
    return 'new';
  };

  // Maps custom source tag based on user selection or pasted column
  const getOutputSource = (row: Record<string, string>) => {
    if (mapping.source && row[mapping.source]) {
      return row[mapping.source];
    }
    return customSource.trim() || defaultSource;
  };

  // Generates preview objects on-the-fly for mapping step
  const generateMappedLeads = () => {
    if (!mapping.name) return [];

    // Track state to calculate local Assignment Round Robin sequence
    let roundRobinIdx = lastAssignmentIndex;
    const seenEmails = new Set<string>();
    const seenPhones = new Set<string>();

    const mappedList: any[] = [];

    rawRows.forEach((row) => {
      const name = row[mapping.name] || 'Unknown';
      const email = mapping.email ? (row[mapping.email] || '').trim() : '';
      const phone = mapping.phone ? (row[mapping.phone] || '').trim().replace(/\s+/g, '') : '';

      const normalizedEmail = email.toLowerCase();
      const normalizedPhone = phone.replace(/[^0-9]/g, '');

      // Duplicate within the file itself check:
      if (normalizedEmail && seenEmails.has(normalizedEmail)) return;
      if (normalizedPhone && seenPhones.has(normalizedPhone)) return;

      if (normalizedEmail) seenEmails.add(normalizedEmail);
      if (normalizedPhone) seenPhones.add(normalizedPhone);

      const source = getOutputSource(row);
      const rawStatusStr = mapping.status ? row[mapping.status] : '';
      const status = normalizeStatus(rawStatusStr);

      // Determine course
      const pastedCourse = mapping.courseName ? row[mapping.courseName] || '' : '';
      let courseName = pastedCourse;
      let courseId = '';

      if (pastedCourse) {
        // Try finding matching course
        const matchedCourse = courses.find(c => 
          c.name.toLowerCase().trim() === pastedCourse.toLowerCase().trim() ||
          pastedCourse.toLowerCase().trim().includes(c.name.toLowerCase().trim())
        );
        if (matchedCourse) {
          courseId = matchedCourse.id;
          courseName = matchedCourse.name;
        }
      }

      // Determine owner assignment
      let assignedTo = '';
      let assignedName = '';

      if (assignmentStrategy === 'single_owner') {
        const selectedRep = team.find(t => t.uid === selectedOwnerUid);
        if (selectedRep) {
          assignedTo = selectedRep.uid;
          assignedName = selectedRep.displayName;
        }
      } else if (assignmentStrategy === 'round_robin') {
        let activeReps = team.filter(t => t.receiveRoundRobin !== false && t.email?.toLowerCase().trim() !== 'bhaskarnagendra@gmail.com');
        if (activeReps.length === 0) {
          activeReps = team;
        }
        if (activeReps.length === 0 && profile) {
          activeReps = [{
            uid: profile.uid,
            displayName: profile.displayName || profile.email?.split('@')[0] || 'Me',
            email: profile.email || '',
            receiveRoundRobin: true
          }];
        }
        if (activeReps.length > 0) {
          const rep = activeReps[roundRobinIdx % activeReps.length];
          assignedTo = rep.uid;
          assignedName = rep.displayName;
          roundRobinIdx = (roundRobinIdx + 1) % activeReps.length;
        }
      } else {
        // Sheet or None strategy - search owner column
        const rawOwner = mapping.owner ? row[mapping.owner] || '' : '';
        const matchedOwner = findTeamMember(rawOwner);
        if (matchedOwner) {
          assignedTo = matchedOwner.uid;
          assignedName = matchedOwner.displayName;
        } else {
          // Robust Fallback: instead of letting unmapped or empty owner rows stay completely unassigned,
          // assign via sequential round-robin to keep queue fully active and balanced
          let activeReps = team.filter(t => t.receiveRoundRobin !== false && t.email?.toLowerCase().trim() !== 'bhaskarnagendra@gmail.com');
          if (activeReps.length === 0) {
            activeReps = team;
          }
          if (activeReps.length === 0 && profile) {
            activeReps = [{
              uid: profile.uid,
              displayName: profile.displayName || profile.email?.split('@')[0] || 'Me',
              email: profile.email || '',
              receiveRoundRobin: true
            }];
          }
          if (activeReps.length > 0) {
            const rep = activeReps[roundRobinIdx % activeReps.length];
            assignedTo = rep.uid;
            assignedName = rep.displayName;
            roundRobinIdx = (roundRobinIdx + 1) % activeReps.length;
          }
        }
      }

      // If still not assigned to anyone (e.g., empty team list and no authenticated profile loaded yet)
      // assign to current user profile or standard first user of team as absolute fail-safe
      if (!assignedTo) {
        if (profile) {
          assignedTo = profile.uid;
          assignedName = profile.displayName || profile.email?.split('@')[0] || 'Me';
        } else if (team.length > 0) {
          assignedTo = team[0].uid;
          assignedName = team[0].displayName;
        }
      }

      // Combine values to get customFields (anything not mapped as core)
      const customFields: Record<string, any> = {};
      Object.keys(row).forEach(key => {
        if (
          key !== mapping.name &&
          key !== mapping.email &&
          key !== mapping.phone &&
          key !== mapping.courseName &&
          key !== mapping.status &&
          key !== mapping.owner &&
          key !== mapping.source
        ) {
          customFields[key] = row[key];
        }
      });

      const score = calculateLeadScore({ name, email, phone, status, courseName, customFields });

      mappedList.push({
        name,
        email,
        phone,
        courseName,
        courseId,
        source,
        status,
        score,
        assignedTo: assignedTo || null,
        assignedName: assignedName || null,
        customFields,
      });
    });

    return mappedList;
  };

  const handleRunImport = async () => {
    setImporting(true);
    setError(null);

    try {
      let currentBatch = writeBatch(db);
      const leadsRef = collection(db, 'leads');
      const leadsToSave = generateMappedLeads(); // Keeps only sheet-unique leads

      // Fetch all existing leads from DB to check for duplicates
      const dbLeadsSnap = await getDocs(leadsRef);
      const dbEmails = new Set<string>();
      const dbPhones = new Set<string>();

      dbLeadsSnap.docs.forEach(doc => {
        const d = doc.data();
        if (d.email) dbEmails.add(String(d.email).trim().toLowerCase());
        if (d.phone) dbPhones.add(String(d.phone).trim().replace(/\s+/g, ''));
      });

      let saveCount = 0;
      let duplicateSkipCount = 0;

      // Chunk Firestore batches if exceeds 500
      let chunkCount = 0;
      for (const lead of leadsToSave) {
        const normEmail = lead.email ? lead.email.trim().toLowerCase() : '';
        const normPhone = lead.phone ? lead.phone.trim().replace(/\s+/g, '') : '';

        // If exists in DB, skip!
        if ((normEmail && dbEmails.has(normEmail)) || (normPhone && dbPhones.has(normPhone))) {
          duplicateSkipCount++;
          continue;
        }

        const leadDoc = doc(leadsRef);
        currentBatch.set(leadDoc, {
          ...lead,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // Add to our DB sets in memory so that subsequent rows in this same queue matching this are also skipped
        if (normEmail) dbEmails.add(normEmail);
        if (normPhone) dbPhones.add(normPhone);

        saveCount++;
        chunkCount++;
        if (chunkCount >= 450) {
          await currentBatch.commit();
          currentBatch = writeBatch(db);
          chunkCount = 0;
        }
      }

      if (chunkCount > 0) {
        await currentBatch.commit();
      }

      // Sync the latest assignment index back if we did round-robin or mapped with fallback to round-robin
      let activeReps = team.filter(t => t.receiveRoundRobin !== false && t.email?.toLowerCase().trim() !== 'bhaskarnagendra@gmail.com');
      if (activeReps.length === 0) {
        activeReps = team;
      }
      if (activeReps.length > 0) {
        const finalIndex = (lastAssignmentIndex + saveCount) % activeReps.length;
        const configRef = doc(db, 'config', 'assignment');
        await setDoc(configRef, { lastIndex: finalIndex }, { merge: true });
        setLastAssignmentIndex(finalIndex);
      }

      setImportSummary({ saved: saveCount, skipped: duplicateSkipCount });
    } catch (err: any) {
      console.error("Bulk Import Error Details:", err);
      setError(err?.message || "Import failed. Check your network or permissions.");
      handleFirestoreError(err, OperationType.WRITE, 'leads');
    } finally {
      setImporting(false);
    }
  };

  const downloadCsvTemplate = () => {
    const headers = ['NAME', 'NUMBER', 'EMAIL', 'COURSE', 'OWNER', 'STATUS', 'SOURCE'];
    const rows = [
      ['Ateem R', '918123486836', 'rateem03@gmail.com', 'Editing & compositing', 'ARPITHA', 'switch off', 'Meta'],
      ['@ n U s H a', '918220859359', 'anushasrini2008@gmail.com', 'Visual design with UIUX', 'ARPITHA', 'LOST', 'Google'],
      ['Riya Leena', '918848421107', 'riyyleena@gmail.com', 'Visual design with UIUX', 'ARPITHA', 'LOST', 'Insta']
    ];
    
    // Construct standard CSV string
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(val => `"${val.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'lead_sculptor_bulk_import_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const leavesPreview = generateMappedLeads();

  return (
    <div className="fixed inset-0 bg-[#1D1D1F]/25 backdrop-blur-[3px] flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className={`bg-white rounded-[40px] shadow-2xl ${step === 2 ? 'max-w-5xl' : 'max-w-2xl'} w-full p-8 transition-all relative border border-slate-200/50 flex flex-col max-h-[90vh]`}>
        <button id="close_import_modal" onClick={onClose} className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-50 text-slate-400 hover:text-[#1D1D1F] transition-all">
          <X size={20} />
        </button>

        {/* Header Title */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="px-3 py-1 bg-indigo-50 border border-indigo-100/60 rounded-full text-[9px] font-black uppercase tracking-widest text-indigo-600">
              Lead Importer v2.0
            </span>
            <h2 className="text-xl font-extrabold tracking-tight text-[#1D1D1F] mt-2">Bulk Lead Sculpter Importer</h2>
            <p className="text-xs text-slate-500 font-medium">Auto-assign and integrate leads from spreadsheets directly in seconds.</p>
          </div>
          <button
            id="download_template_btn"
            onClick={downloadCsvTemplate}
            type="button"
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-xs font-bold text-emerald-700 rounded-2xl transition-all shadow-sm shrink-0"
          >
            <FileSpreadsheet size={16} className="text-emerald-600" />
            Download Excel Template
          </button>
        </div>

        {/* Step 1: Input spreadsheet or file & assignment rules */}
        {step === 1 && (
          <div className="space-y-6 overflow-y-auto pr-1">
            {/* Tabs Selector */}
            <div className="grid grid-cols-2 p-1.5 bg-slate-50 border border-slate-100 rounded-3xl">
              <button 
                id="tab_paste_excel"
                onClick={() => { setActiveTab('paste'); setError(null); }}
                className={`py-3 rounded-2xl text-[10px] uppercase tracking-wider font-extrabold flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'paste' ? 'bg-white text-[#1D1D1F] shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Clipboard size={14} />
                Paste Excel/Sheets Table
              </button>
              <button 
                id="tab_upload_csv"
                onClick={() => { setActiveTab('file'); setError(null); }}
                className={`py-3 rounded-2xl text-[10px] uppercase tracking-wider font-extrabold flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'file' ? 'bg-white text-[#1D1D1F] shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <FileSpreadsheet size={14} />
                Upload CSV File
              </button>
            </div>

            {/* Main Inputs */}
            {activeTab === 'paste' ? (
              <div className="space-y-2">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Paste excel data (Contains TAB or comma separated rows)</label>
                <textarea
                  id="excel_pasted_data"
                  rows={6}
                  placeholder={`Example (Just select spreadsheet columns, Copy & Paste here):\nNAME\tNUMBER\tEMAIL\tCOURSE\tSTATUS\nAteem R\t918123486836\tr*ateem03@gmail.com\tEditing & compositing\tSWITCH OFF\nRiya Leena\t918848421107\triyyleena@gmail.com\tVisual Design with UIUX\tLOST`}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  className="w-full text-xs font-mono p-4 bg-slate-50/50 border border-slate-100 rounded-[24px] outline-none focus:border-indigo-500/50 focus:bg-white transition-all resize-y"
                />
              </div>
            ) : (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-[32px] p-8 text-center cursor-pointer transition-all ${
                  file ? 'bg-indigo-50/40 border-indigo-400' : 'bg-slate-50 border-slate-100 hover:border-slate-300'
                }`}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept=".csv,.txt,.tsv" 
                  className="hidden" 
                />
                {file ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 bg-white rounded-full shadow-sm border border-emerald-100 flex items-center justify-center text-emerald-500">
                      <CheckCircle2 size={24} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#1D1D1F]">{file.name}</p>
                      <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest mt-1">{(file.size / 1024).toFixed(1)} KB — READY TO PARSE</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-slate-300">
                    <Upload size={28} />
                    <p className="text-xs font-bold text-slate-400">Click to upload marketing spreadsheet</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">CSV, TSV, OR TXT ONLY</p>
                  </div>
                )}
              </div>
            )}

            {/* Campaign Rules & Multi-User Assignment Configuration */}
            <div className="bg-slate-50/70 border border-slate-100 rounded-3xl p-5 space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Tag size={12} className="text-slate-400" /> Default Lead Attribution & Assignment Rules
              </h3>

              <div className="grid grid-cols-2 gap-4">
                {/* Attribution source */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Attribution Source</label>
                  <div className="flex gap-2">
                    <select
                      id="default_source_selector"
                      value={defaultSource}
                      onChange={(e) => {
                        setDefaultSource(e.target.value);
                        if (e.target.value !== 'custom') setCustomSource('');
                      }}
                      className="flex-1 text-[11px] font-bold uppercase tracking-wider py-2 px-3 border border-slate-200 bg-white rounded-xl focus:border-indigo-500 transition-all outline-none"
                    >
                      <option value="Meta">Meta Ads</option>
                      <option value="Google">Google Ads</option>
                      <option value="YouTube">YouTube</option>
                      <option value="Insta">Instagram</option>
                      <option value="WhatsApp">WhatsApp</option>
                      <option value="organic">Organic Traffic</option>
                      <option value="custom">custom source...</option>
                    </select>
                    {defaultSource === 'custom' && (
                      <input 
                        type="text" 
                        placeholder="Type Custom Source..." 
                        value={customSource}
                        onChange={(e) => setCustomSource(e.target.value)}
                        className="flex-1 text-xs py-2 px-3 border border-slate-200 bg-white rounded-xl focus:border-indigo-500 transition-all outline-none"
                      />
                    )}
                  </div>
                </div>

                {/* Team Distribution */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Team Assignment strategy</label>
                  <select
                    id="assignment_strategy"
                    value={assignmentStrategy}
                    onChange={(e) => setAssignmentStrategy(e.target.value as any)}
                    className="w-full text-[11px] font-bold uppercase tracking-wider py-2 px-3 border border-slate-200 bg-white rounded-xl focus:border-indigo-500 transition-all outline-none"
                  >
                    <option value="round_robin">🔄 Round Robin Assignment (Equally Distributed)</option>
                    <option value="single_owner">👤 Assign all to Specific team member</option>
                    <option value="sheet_or_none">📄 Map from Owner column (Or Unassigned)</option>
                  </select>
                </div>
              </div>

              {/* Single Owner selection context */}
              {assignmentStrategy === 'single_owner' && (
                <div className="space-y-1.5 border-t border-slate-200/50 pt-3 animate-fade-in">
                  <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Select Owner for imported leads</label>
                  <select
                    id="single_owner_id_select"
                    value={selectedOwnerUid}
                    onChange={(e) => setSelectedOwnerUid(e.target.value)}
                    className="w-full text-[11px] font-bold uppercase tracking-wider py-2.5 px-3 border border-slate-200 bg-white rounded-xl focus:border-indigo-500 transition-all outline-none"
                  >
                    {team.map(member => (
                      <option key={member.uid} value={member.uid}>{member.displayName} ({member.email})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {error && (
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 flex items-start gap-2.5">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <p className="text-[10px] font-extrabold uppercase tracking-widest leading-normal">{error}</p>
              </div>
            )}

            {/* Bottom Actions */}
            <div className="flex gap-3 pt-2">
              <button
                id="cancel_import_btn"
                onClick={onClose}
                className="flex-1 py-3.5 bg-slate-50 text-slate-400 rounded-full font-bold uppercase text-[9px] tracking-widest hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                id="next_step_action_btn"
                onClick={handleNextStep}
                className="flex-[2] py-3.5 bg-slate-900 text-white rounded-full font-bold uppercase text-[9px] tracking-widest shadow-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
              >
                Parse & Match Columns <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Mapping, Matching, and live grid preview list */}
        {step === 2 && (
          <div className="space-y-6 overflow-hidden flex flex-col flex-1">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 shrink-0 bg-slate-50/70 border border-slate-100 rounded-3xl p-4">
              <div className="md:col-span-3">
                <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Connect Spreadsheet Headers to CRM fields (Automatic Matching Performed)</h3>
              </div>

              {/* Map Name */}
              <div className="space-y-1">
                <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Name / Prospect *</label>
                <select
                  value={mapping.name}
                  onChange={(e) => setMapping({ ...mapping, name: e.target.value })}
                  className="w-full text-xs font-semibold py-2 px-3 border border-slate-200 bg-white rounded-xl focus:border-indigo-500 outline-none"
                >
                  <option value="">— Select Column —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              {/* Map Phone */}
              <div className="space-y-1">
                <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Phone / Mobile</label>
                <select
                  value={mapping.phone}
                  onChange={(e) => setMapping({ ...mapping, phone: e.target.value })}
                  className="w-full text-xs font-semibold py-2 px-3 border border-[#EBEBEB] bg-white rounded-xl focus:border-indigo-500 outline-none"
                >
                  <option value="">— Skip Column —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              {/* Map Email */}
              <div className="space-y-1">
                <label className="text-[9px] font-extrabold text-[#7E7E7E] uppercase tracking-widest">Email Address</label>
                <select
                  value={mapping.email}
                  onChange={(e) => setMapping({ ...mapping, email: e.target.value })}
                  className="w-full text-xs font-semibold py-2 px-3 border border-[#EBEBEB] bg-white rounded-xl focus:border-indigo-500 outline-none"
                >
                  <option value="">— Skip Column —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              {/* Map Course */}
              <div className="space-y-1">
                <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Course / Program Offered</label>
                <select
                  value={mapping.courseName}
                  onChange={(e) => setMapping({ ...mapping, courseName: e.target.value })}
                  className="w-full text-xs font-semibold py-2 px-3 border border-slate-200 bg-white rounded-xl focus:border-indigo-500 outline-none"
                >
                  <option value="">— Skip / Default —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              {/* Map Status */}
              <div className="space-y-1">
                <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Initial pipeline Status</label>
                <select
                  value={mapping.status}
                  onChange={(e) => setMapping({ ...mapping, status: e.target.value })}
                  className="w-full text-xs font-semibold py-2 px-3 border border-slate-200 bg-white rounded-xl focus:border-indigo-500 outline-none"
                >
                  <option value="">— Default to "new" —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              {/* Map Assigned Agent */}
              {assignmentStrategy === 'sheet_or_none' && (
                <div className="space-y-1">
                  <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Lead Owner / Teammate</label>
                  <select
                    value={mapping.owner}
                    onChange={(e) => setMapping({ ...mapping, owner: e.target.value })}
                    className="w-full text-xs font-semibold py-2 px-3 border border-[#EBEBEB] bg-white rounded-xl focus:border-indigo-500 outline-none animate-pulse-subtle"
                  >
                    <option value="">— Skip (unassigned fallback) —</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              )}

              {/* Map Source */}
              <div className="space-y-1 col-span-1">
                <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Source (Overrides Settings selection)</label>
                <select
                  value={mapping.source}
                  onChange={(e) => setMapping({ ...mapping, source: e.target.value })}
                  className="w-full text-xs font-semibold py-2 px-3 border border-[#EBEBEB] bg-white rounded-xl focus:border-indigo-500 outline-none"
                >
                  <option value="">— Use Default Settings —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>

            {/* Live Data Grid Import Preview */}
            <div className="flex-1 overflow-hidden flex flex-col min-h-[150px] border border-slate-200 rounded-[28px]">
              <div className="px-6 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                <span className="text-[9px] font-black tracking-wider uppercase text-slate-400">Live Import Row Preview ({leavesPreview.length} leads detected)</span>
                {leavesPreview.length > 500 && (
                  <span className="text-[8px] font-black tracking-widest uppercase text-amber-500 bg-amber-50 border border-amber-100 px-2 py-1 rounded">500 batch limit applied</span>
                )}
              </div>

              <div className="flex-1 overflow-auto">
                <table className="w-full text-left font-sans text-xs border-collapse">
                  <thead className="bg-[#FAFAFA] border-b border-slate-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-5 py-3 text-[9px] font-black uppercase text-slate-400 tracking-widest">Prospect Name</th>
                      <th className="px-5 py-3 text-[9px] font-black uppercase text-slate-400 tracking-widest">Phone</th>
                      <th className="px-5 py-3 text-[9px] font-black uppercase text-slate-400 tracking-widest">Email</th>
                      <th className="px-5 py-3 text-[9px] font-black uppercase text-slate-400 tracking-widest">Course Context</th>
                      <th className="px-5 py-3 text-[9px] font-black uppercase text-slate-400 tracking-widest">Attestation</th>
                      <th className="px-5 py-3 text-[9px] font-black uppercase text-slate-400 tracking-widest">Assigned Teammate</th>
                      <th className="px-5 py-3 text-[9px] font-black uppercase text-slate-400 tracking-widest">Mapped Status</th>
                      <th className="px-5 py-3 text-[9px] font-black uppercase text-slate-400 tracking-widest">Initial Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {leavesPreview.slice(0, 50).map((lead, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3 font-semibold text-[#1D1D1F]">{lead.name}</td>
                        <td className="px-5 py-3 font-mono text-slate-400">{lead.phone || '—'}</td>
                        <td className="px-5 py-3 text-slate-400">{lead.email || '—'}</td>
                        <td className="px-5 py-3">
                          {lead.courseName ? (
                            <div className="flex flex-col">
                              <span className="text-[11px] font-medium text-slate-600 leading-tight">{lead.courseName}</span>
                              {lead.courseId && <span className="text-[8px] font-bold tracking-widest text-[#10B981] uppercase mt-0.5">Matched Catalog</span>}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-300">None set</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-500 font-bold uppercase text-[9px] border rounded tracking-wider">
                            {lead.source}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          {lead.assignedName ? (
                            <span className="font-bold text-slate-600 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 bg-[#4F46E5] rounded-full"></span>
                              {lead.assignedName}
                            </span>
                          ) : (
                            <span className="text-slate-300 font-medium">Unassigned</span>
                          )}
                        </td>
                        <td className="px-5 py-3 uppercase">
                          <span className={`px-2.5 py-1 text-[9px] font-black tracking-widest border rounded-full ${
                            lead.status === 'new' ? 'bg-indigo-50 border-indigo-100 text-indigo-500' :
                            lead.status === 'contacted' ? 'bg-amber-50 border-amber-100 text-amber-500' :
                            lead.status === 'interested' ? 'bg-rose-50 border-rose-100 text-rose-500' :
                            lead.status === 'enrolled' ? 'bg-emerald-50 border-emerald-100 text-emerald-500' :
                            'bg-slate-50 border-slate-100 text-slate-450'
                          }`}>
                            {lead.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-black text-slate-500">{lead.score}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {leavesPreview.length > 50 && (
                <div className="px-6 py-2.5 bg-[#FAFAFA] border-t border-slate-50 text-[10px] font-bold text-slate-400/90 tracking-wider">
                  ... Showing first 50 rows in preview. All {leavesPreview.length} leads will be imported correctly.
                </div>
              )}
            </div>

            {error && (
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 flex items-start gap-2.5 shrink-0">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <p className="text-[10px] font-extrabold uppercase tracking-widest leading-normal">{error}</p>
              </div>
            )}

            {/* Bottom Step Actions */}
            <div className="flex gap-3 pt-2 shrink-0">
              <button
                onClick={() => setStep(1)}
                className="flex-1 py-3.5 bg-slate-50 text-slate-400 rounded-full font-bold uppercase text-[9px] tracking-widest hover:bg-slate-100 transition-colors"
                disabled={importing}
              >
                Back to Input
              </button>
              <button
                id="run_import_final_btn"
                onClick={handleRunImport}
                disabled={importing || !mapping.name || leavesPreview.length === 0}
                className="flex-[2] py-3.5 bg-emerald-600 text-white rounded-full font-bold uppercase text-[9px] tracking-widest shadow-xl shadow-emerald-600/15 hover:bg-emerald-500 transition-all flex items-center justify-center gap-2 disabled:opacity-30"
              >
                {importing ? 'Saving to Database...' : `🚀 Import ${leavesPreview.length} Leads to CRM`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
