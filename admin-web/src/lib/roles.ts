import type { Engineer, FieldRole, Role } from './types'

// Permission keys (same as the API's Domain.Permissions). Labels and descriptions come from GET /permissions.
export const PERM = {
  clientsView: 'clients.view',
  reportsWork: 'reports.work',
  visitsView: 'visits.view',
  surveysWork: 'surveys.work',
  surveysCreate: 'surveys.create',
} as const

export const FIELD_ROLES: FieldRole[] = ['engineer', 'site_engineer']
export const isFieldRole = (r?: Role | null): r is FieldRole => r === 'engineer' || r === 'site_engineer'

export const ROLE_LABEL: Record<Role, string> = { admin: 'Operations / admin', engineer: 'Engineer', site_engineer: 'Site engineer' }
export const ROLE_TONE: Record<Role, 'blue' | 'slate' | 'green'> = { admin: 'blue', engineer: 'slate', site_engineer: 'green' }

/**
 * Who may be picked when the office assigns work: engineers allowed to do it. Someone without a sign-in account is still
 * listed (the API does not block them; they cannot use the app until a password is set), and so is the current assignee.
 */
export const canAssign = (e: Engineer, permission: string, currentId?: string | null) =>
  e.id === currentId || !e.userId || (e.permissions ?? []).includes(permission)
