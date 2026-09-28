import { DEFAULT_PREFERENCES, type StoreShape } from './store';
import type { Application, InterviewDate } from './supabase';

export function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: overrides.id || `app-${Math.random().toString(36).slice(2)}`,
    user_id: 'user-1',
    company_name: 'Stripe',
    company_description: '',
    resume_used: '',
    cover_letter_used: '',
    response_status: 'Pending',
    interview_offered: false,
    final_status: 'In Progress',
    date_applied: null,
    salary_info: '',
    interview_questions: '',
    tasks_to_complete: '',
    resume_path: '',
    cover_letter_path: '',
    role_applied_to: 'Backend Intern',
    platform_applied_on: 'LinkedIn',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export function makeInterviewDate(overrides: Partial<InterviewDate> = {}): InterviewDate {
  return {
    id: overrides.id || `iv-${Math.random().toString(36).slice(2)}`,
    application_id: 'app-1',
    user_id: 'user-1',
    interview_date: new Date().toISOString(),
    label: 'Round 1',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

export function makeEmptyStore(overrides: Partial<StoreShape> = {}): StoreShape {
  return {
    tags: [],
    applicationTags: [],
    reminders: [],
    notes: [],
    contacts: [],
    tasks: [],
    goals: [],
    savedViews: [],
    activity: [],
    resumes: [],
    aiThreads: [],
    preferences: DEFAULT_PREFERENCES,
    stageOverrides: {},
    archived: [],
    starred: [],
    automationRules: [],
    automationLog: [],
    automationSeen: {},
    ...overrides,
  };
}
