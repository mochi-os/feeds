// Shell storage utilities for feeds app - stores last visited feed
// null means "All Feeds" view, a feed ID means a specific feed

import { shellStorage } from '@mochi/web'

const STORAGE_KEY = 'mochi-feeds-last'

// Special value to indicate "All Feeds" view
const ALL_FEEDS = 'all'

// Store last visited feed (null for "All Feeds" view)
export function setLastFeed(feedId: string | null): void {
  shellStorage.setItem(STORAGE_KEY, feedId ?? ALL_FEEDS)
}

// Get last visited feed (null means "All Feeds" view)
export async function getLastFeed(): Promise<string | null> {
  const value = await shellStorage.getItem(STORAGE_KEY)
  if (value === null || value === ALL_FEEDS) {
    return null
  }
  return value
}

// Clear last feed
export function clearLastFeed(): void {
  shellStorage.removeItem(STORAGE_KEY)
}
