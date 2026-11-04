import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AdminGuard, RequireRole } from './AdminShell'
import LoginPage from '../features/auth/LoginPage'
import { AmcPage, CalendarPage, ClientDetailPage, ClientsPage, DashboardPage, DefectSummaryPage, EngineersPage, ReportDetailPage, ReportsPage, SettingsPage, SurveyDetailPage, SurveysPage, UpcomingOverduePage, UsersPage } from './pages'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/reset-password', element: <Navigate to="/login" replace /> },   // old e-mailed reset links
  {
    path: '/', element: <AdminGuard />, children: [
      // management (MD): Site Surveys only, read-only plus approve and comment
      {
        element: <RequireRole roles={['admin', 'management']} />, children: [
          { path: 'surveys', element: <SurveysPage /> },
          { path: 'surveys/:id', element: <SurveyDetailPage /> },
        ],
      },
      {
        element: <RequireRole roles={['admin']} />, children: [
          { index: true, element: <DashboardPage /> },
          { path: 'reports', element: <ReportsPage /> },
          { path: 'reports/:id', element: <ReportDetailPage /> },
          { path: 'clients', element: <ClientsPage /> },
          { path: 'clients/:id', element: <ClientDetailPage /> },
          { path: 'engineers', element: <EngineersPage /> },
          { path: 'calendar', element: <CalendarPage /> },
          { path: 'schedule', element: <UpcomingOverduePage /> },
          { path: 'amc', element: <AmcPage /> },
          { path: 'defects', element: <DefectSummaryPage /> },
          { path: 'users', element: <UsersPage /> },
          { path: 'settings/:section?', element: <SettingsPage /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
