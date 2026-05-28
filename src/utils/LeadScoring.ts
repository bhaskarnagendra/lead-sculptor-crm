import { Lead, LeadStatus } from '../types';

/**
 * Calculates a lead score based on available data and interest levels.
 */
export function calculateLeadScore(lead: Partial<Lead>): number {
  let score = 0;

  // Basic Information completeness (max 20 points)
  if (lead.email) score += 5;
  if (lead.phone) score += 5;
  if (lead.name && lead.name.split(' ').length > 1) score += 5;
  if (lead.courseName) score += 5;

  // Status-based weighting (max 80 points)
  // Reflects proximity to conversion
  const mainStatus = lead.mainStatus || (
    lead.status === 'new' ? 'New Lead' :
    lead.status === 'contacted' ? 'Contacted' :
    lead.status === 'interested' ? 'Callback Required' :
    lead.status === 'enrolled' ? 'Converted' :
    lead.status === 'lost' ? 'Lost Lead' : 'New Lead'
  );

  switch (mainStatus) {
    case 'New Lead': score += 10; break;
    case 'Contacted': score += 30; break;
    case 'Callback Required': score += 50; break;
    case 'Future Prospect': score += 60; break;
    case 'Qualified': score += 80; break;
    case 'Converted': score = 100; break; // Instant 100 for converted
    case 'Lost Lead': return 0; // Instant 0 for lost
    default: score += 10;
  }

  // Priority-based urgency scaling boosts
  if (lead.priorityTag === 'Hot') score += 15;
  else if (lead.priorityTag === 'Warm') score += 5;

  // Custom Field enrichment (bonus points up to cap)
  if (lead.customFields && mainStatus !== 'Converted') {
    Object.values(lead.customFields).forEach(val => {
      if (typeof val === 'string' && val.length > 0) score += 2;
    });
  }

  // Cap at 100
  return Math.min(100, score);
}

export function getScoreColor(score: number, status?: LeadStatus): string {
  if (status === 'lost') return 'text-slate-400 bg-slate-50 border-slate-100';
  if (status === 'enrolled') return 'text-emerald-600 bg-emerald-50 border-emerald-100';
  
  if (score >= 80) return 'text-rose-600 bg-rose-50 border-rose-100 animate-pulse-subtle'; // High Urgency/Conversion
  if (score >= 50) return 'text-amber-600 bg-amber-50 border-amber-100'; // Mid Urgency
  if (score >= 20) return 'text-indigo-600 bg-indigo-50 border-indigo-100'; // Low Urgency
  return 'text-slate-500 bg-slate-50 border-slate-100';
}

export function getStatusStyle(status: string): string {
  switch (status) {
    case 'new':
    case 'New Lead': return 'bg-indigo-50 text-indigo-600 border-indigo-100';
    case 'contacted':
    case 'Contacted': return 'bg-cyan-50 text-cyan-600 border-cyan-100';
    case 'interested':
    case 'Callback Required': return 'bg-amber-50 text-amber-600 border-amber-100';
    case 'Future Prospect': return 'bg-purple-50 text-purple-600 border-purple-100';
    case 'Qualified': return 'bg-teal-50 text-teal-600 border-teal-100';
    case 'enrolled':
    case 'Converted': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
    case 'lost':
    case 'Lost Lead': return 'bg-rose-50 text-rose-600 border-rose-100';
    default: return 'bg-slate-50 text-slate-500 border-slate-100';
  }
}
