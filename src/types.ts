export type LeadStatus = 'new' | 'contacted' | 'interested' | 'enrolled' | 'lost';
export type FollowUpType = 'call' | 'email' | 'meeting' | 'other';
export type FollowUpStatus = 'pending' | 'completed';
export type UserRole = 'admin' | 'sales_rep';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: any;
  password?: string;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  courseName?: string;
  courseId?: string;
  discount?: number;
  source?: string;
  status: LeadStatus;
  mainStatus?: string;
  subStatus?: string;
  priorityTag?: 'Hot' | 'Warm' | 'Cold';
  callbackTimeOption?: string;
  callbackCustomDateTime?: string;
  score: number;
  assignedTo?: string;
  assignedName?: string;
  leadReview?: string;
  nextFollowUp?: any;
  customFields: Record<string, any>;
  createdAt: any;
  updatedAt: any;
}

export interface FollowUp {
  id: string;
  leadId: string;
  note: string;
  type: FollowUpType;
  scheduledAt: any;
  status: FollowUpStatus;
  createdAt: any;
}

export interface CustomFieldDefinition {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  options?: string[]; // For select type
}

export interface Course {
  id: string;
  name: string;
  duration: string;
  fees: number;
  description?: string;
  type?: 'Bachelors' | 'Specialization' | 'Diploma' | 'Professional Diploma' | 'Certificate';
  createdAt: any;
}

export interface Target {
  id: string;
  userId: string;
  userName?: string;
  month: string; // YYYY-MM
  target: number;
  createdAt: any;
  updatedAt?: any;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}
