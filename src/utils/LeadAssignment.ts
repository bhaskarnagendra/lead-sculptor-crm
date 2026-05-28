import { collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';

export async function getNextAssignedUser() {
  try {
    // 1. Fetch all active sales representatives
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('role', 'in', ['sales_rep', 'admin']));
    const querySnapshot = await getDocs(q);
    
    const salesReps = querySnapshot.docs.map(d => ({
      uid: d.id,
      displayName: d.data().displayName || 'Unknown',
      email: d.data().email || '',
      receiveRoundRobin: d.data().receiveRoundRobin
    })).filter(rep => {
      const emailLower = rep.email.toLowerCase().trim();
      return rep.receiveRoundRobin !== false && 
             emailLower !== 'bhaskarnagendra@gmail.com' &&
             rep.displayName !== 'Unnamed User' &&
             rep.displayName !== '';
    }).sort((a, b) => a.uid.localeCompare(b.uid)); // Sort to ensure consistent order

    if (salesReps.length === 0) return null;

    // 2. Get the last rotation index from a config document
    const configRef = doc(db, 'config', 'assignment');
    const configSnap = await getDoc(configRef);
    
    let lastIndex = 0;
    if (configSnap.exists()) {
      lastIndex = configSnap.data().lastIndex || 0;
    }

    // 3. Calculate next index
    const nextIndex = (lastIndex + 1) % salesReps.length;
    
    // 4. Update the tracker in Firestore
    await setDoc(configRef, { lastIndex: nextIndex }, { merge: true });

    // 5. Return the assigned user and next index for local batching
    return { 
      user: salesReps[nextIndex], 
      nextIndex, 
      team: salesReps 
    };
  } catch (error) {
    console.error("Error in lead assignment:", error);
    return null;
  }
}

export async function updateAssignmentIndex(index: number) {
  try {
    const configRef = doc(db, 'config', 'assignment');
    await setDoc(configRef, { lastIndex: index }, { merge: true });
  } catch (e) {
    console.error("Error updating assignment index:", e);
  }
}
