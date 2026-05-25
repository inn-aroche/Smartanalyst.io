// SPA pageview tracker — pushes a virtual pageview to GTM on every route change.
// In your GTM container, create a "Custom Event" trigger listening for `event = "pageview"`
// to forward these to GA4 / your analytics destination.

import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

type DataLayerEvent = Record<string, unknown>

declare global {
  interface Window {
    dataLayer?: DataLayerEvent[]
  }
}

export function gtmPush(event: DataLayerEvent) {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer ?? []
  window.dataLayer.push(event)
}

export function usePageViewTracker() {
  const location = useLocation()
  useEffect(() => {
    gtmPush({
      event: 'pageview',
      page_path: location.pathname + location.search,
    })
  }, [location.pathname, location.search])
}
