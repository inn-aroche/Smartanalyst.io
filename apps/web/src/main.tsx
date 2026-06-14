import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'

import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { AuthProvider } from './lib/auth'
import { LocaleProvider } from './lib/i18n'
import { queryClient } from './lib/queryClient'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <LocaleProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </LocaleProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
