import { Navigate, Route, Routes } from 'react-router-dom'

import ProtectedRoute from './components/ProtectedRoute'
import { usePageViewTracker } from './lib/gtm'
import Audit from './pages/Audit'
import AuthCallback from './pages/AuthCallback'
import Chat from './pages/Chat'
import Connectors from './pages/Connectors'
import Dashboard from './pages/Dashboard'
import Live from './pages/Live'
import Login from './pages/Login'
import Settings from './pages/Settings'
import Signup from './pages/Signup'
import TrackingInstall from './pages/TrackingInstall'

export default function App() {
  usePageViewTracker()
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="/"
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
