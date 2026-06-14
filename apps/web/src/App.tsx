import { Navigate, Route, Routes } from 'react-router-dom'

import ProtectedRoute from './components/ProtectedRoute'
import { usePageViewTracker } from './lib/gtm'
import Audit from './pages/Audit'
import AuthCallback from './pages/AuthCallback'
import BetaLocked from './pages/BetaLocked'
import BriefHome from './pages/BriefHome'
import Chat from './pages/Chat'
import Connectors from './pages/Connectors'
import Dashboard from './pages/Dashboard'
import Live from './pages/Live'
import Login from './pages/Login'
import ResetPasswordConfirm from './pages/ResetPasswordConfirm'
import ResetPasswordRequest from './pages/ResetPasswordRequest'
import Settings from './pages/Settings'
import Tasks from './pages/Tasks'
import Signup from './pages/Signup'
import TrackingInstall from './pages/TrackingInstall'
import Veille from './pages/Veille'

export default function App() {
  usePageViewTracker()
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/beta-locked" element={<BetaLocked />} />
      <Route path="/reset-password/request" element={<ResetPasswordRequest />} />
      <Route path="/reset-password/confirm" element={<ResetPasswordConfirm />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <BriefHome />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/connectors"
        element={
          <ProtectedRoute>
            <Connectors />
          </ProtectedRoute>
        }
      />
      <Route
        path="/chat"
        element={
          <ProtectedRoute>
            <Chat />
          </ProtectedRoute>
        }
      />
      <Route
        path="/live"
        element={
          <ProtectedRoute>
            <Live />
          </ProtectedRoute>
        }
      />
      <Route
        path="/audit"
        element={
          <ProtectedRoute>
            <Audit />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks"
        element={
          <ProtectedRoute>
            <Tasks />
          </ProtectedRoute>
        }
      />
      <Route
        path="/veille"
        element={
          <ProtectedRoute>
            <Veille />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tracking/install"
        element={
          <ProtectedRoute>
            <TrackingInstall />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
