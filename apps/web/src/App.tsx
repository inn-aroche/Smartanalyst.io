import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import ProtectedRoute from './components/ProtectedRoute'
import { usePageViewTracker } from './lib/gtm'

// ─── Eager imports (next-steps B) ────────────────────────────────────────
// On garde en eager :
//   - Les pages d'authentification : c'est typiquement le 1er hit, le user
//     n'a rien d'autre a faire en attendant le chunk -> autant tout charger.
//   - BriefHome : landing par defaut authentifie, critique pour le FCP.
// Tout le reste passe en React.lazy pour reduire le bundle initial.
import AuthCallback from './pages/AuthCallback'
import BetaLocked from './pages/BetaLocked'
import BriefHome from './pages/BriefHome'
import InviteAccept from './pages/InviteAccept'
import Login from './pages/Login'
import ResetPasswordConfirm from './pages/ResetPasswordConfirm'
import ResetPasswordRequest from './pages/ResetPasswordRequest'
import Signup from './pages/Signup'

// ─── Lazy chunks (loaded on demand) ──────────────────────────────────────
// Chaque page = 1 chunk JS. Au-dela du gain bundle, l'avantage c'est qu'on
// peut deployer un fix sur /chat sans invalider le cache navigateur de
// /rapports — les chunks ont leur propre hash.
const Audit = lazy(() => import('./pages/Audit'))
const Chat = lazy(() => import('./pages/Chat'))
const Connectors = lazy(() => import('./pages/Connectors'))
const Live = lazy(() => import('./pages/Live'))
const Reports = lazy(() => import('./pages/Reports'))
const Settings = lazy(() => import('./pages/Settings'))
const Sources = lazy(() => import('./pages/Sources'))
const Tasks = lazy(() => import('./pages/Tasks'))
const TrackingInstall = lazy(() => import('./pages/TrackingInstall'))
const Veille = lazy(() => import('./pages/Veille'))

/**
 * Fallback affiche pendant le chargement d'un chunk page. Pas de spinner :
 * sur reseau correct (cable / 4G+) les chunks arrivent en <500ms — un
 * spinner clignote pour rien. Sur 3G/offline, le navigateur affichera
 * son propre indicator de loading + l'user peut bouger.
 */
function RouteSuspense({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <span className="font-mono text-xs uppercase tracking-widest text-text-3">Loading…</span>
        </div>
      }
    >
      {children}
    </Suspense>
  )
}

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
      <Route path="/invite/accept" element={<InviteAccept />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <BriefHome />
          </ProtectedRoute>
        }
      />
      <Route path="/dashboard" element={<Navigate to="/" replace />} />
      <Route
        path="/connectors"
        element={
          <ProtectedRoute>
            <RouteSuspense>
              <Connectors />
            </RouteSuspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/sources"
        element={
          <ProtectedRoute>
            <RouteSuspense>
              <Sources />
            </RouteSuspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/rapports"
        element={
          <ProtectedRoute>
            <RouteSuspense>
              <Reports />
            </RouteSuspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/chat"
        element={
          <ProtectedRoute>
            <RouteSuspense>
              <Chat />
            </RouteSuspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/live"
        element={
          <ProtectedRoute>
            <RouteSuspense>
              <Live />
            </RouteSuspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/audit"
        element={
          <ProtectedRoute>
            <RouteSuspense>
              <Audit />
            </RouteSuspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks"
        element={
          <ProtectedRoute>
            <RouteSuspense>
              <Tasks />
            </RouteSuspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/veille"
        element={
          <ProtectedRoute>
            <RouteSuspense>
              <Veille />
            </RouteSuspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <RouteSuspense>
              <Settings />
            </RouteSuspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tracking/install"
        element={
          <ProtectedRoute>
            <RouteSuspense>
              <TrackingInstall />
            </RouteSuspense>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
