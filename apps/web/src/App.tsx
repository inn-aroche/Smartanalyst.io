import { Navigate, Route, Routes } from 'react-router-dom'

import ProtectedRoute from './components/ProtectedRoute'
import { usePageViewTracker } from './lib/gtm'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Signup from './pages/Signup'

export default function App() {
  usePageViewTracker()
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
