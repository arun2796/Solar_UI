import { lazy } from 'react'

// Each page is its own chunk so the first load stays small.
export const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage'))
export const ReportsPage = lazy(() => import('../features/reports/ReportsPage'))
export const ReportDetailPage = lazy(() => import('../features/reports/ReportDetailPage'))
export const ClientsPage = lazy(() => import('../features/clients/ClientsPage'))
export const ClientDetailPage = lazy(() => import('../features/clients/ClientDetailPage'))
export const EngineersPage = lazy(() => import('../features/engineers/EngineersPage'))
export const CalendarPage = lazy(() => import('../features/calendar/CalendarPage'))
export const UpcomingOverduePage = lazy(() => import('../features/calendar/UpcomingOverduePage'))
export const AmcPage = lazy(() => import('../features/amc/AmcPage'))
export const DefectSummaryPage = lazy(() => import('../features/defects/DefectSummaryPage'))
export const SettingsPage = lazy(() => import('../features/settings/SettingsPage'))
export const SurveysPage = lazy(() => import('../features/surveys/SurveysPage'))
export const SurveyDetailPage = lazy(() => import('../features/surveys/SurveyDetailPage'))
export const UsersPage = lazy(() => import('../features/users/UsersPage'))
