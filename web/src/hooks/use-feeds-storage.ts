// localStorage utilities for feeds app - stores last visited feed per browser
// null means "All Feeds" view, a feed ID means a specific feed

const STORAGE_KEY = 'mochi-feeds-last'
const SESSION_KEY = 'mochi-feeds-session-started'

// Special value to indicate "All Feeds" view
const ALL_FEEDS = 'all'

// Store last visited feed (null for "All Feeds" view)
export function setLastFeed(feedId: string | null): void {
  try {
    localStorage.setItem(STORAGE_KEY, feedId ?? ALL_FEEDS)
  } catch {
    // Silently fail - localStorage may be unavailable
  }
}

// Get last visited feed (null means "All Feeds" view)
export function getLastFeed(): string | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === null || value === ALL_FEEDS) {
      return null
    }
    return value
  } catch {
    return null
  }
}

// Check if we have any stored location (including "All Feeds")
export function hasLastFeed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null
  } catch {
    return false
  }
}

// Clear last feed
export function clearLastFeed(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Silently fail
  }
}

// Check if this is the first navigation to the index this session
// Used to only auto-redirect on initial app entry, not subsequent navigations
export function shouldRedirectToLastFeed(): boolean {
  try {
    // If session already started, don't redirect
    if (sessionStorage.getItem(SESSION_KEY)) {
      return false
    }
    // Mark session as started
    sessionStorage.setItem(SESSION_KEY, '1')
    return true
  } catch {
    return false
  }
}
