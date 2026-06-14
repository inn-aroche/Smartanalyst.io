import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'

import App from './App'
import ConsentBanner from './components/ConsentBanner'
import ErrorBoundary from './components/ErrorBoundary'
import { AuthProvider } from './lib/auth'
import { installGlobalErrorReporting } from './lib/client-errors'
import { LocaleProvider } from './lib/i18n'
import { queryClient } from './lib/queryClient'
import './index.css'

// Capture les erreurs JS globales (window.onerror + unhandledrejection)
// et les envoie au backend, qui les forwarde à Sentry server-side.
installGlobalErrorReporting()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <LocaleProvider>
            <AuthProvider>
              <App />
              <ConsentBanner />
            </AuthProvider>
          </LocaleProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
