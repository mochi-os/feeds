import { msg } from '@lingui/core/macro'
import { i18n } from '@lingui/core'
import { toast } from '@mochi/web'
import type { FeedPost, SavedItem } from '@/types'
import { savedApi, toSnapshot } from '@/api/saved'

// Saved posts are persisted server-side (the feeds app's own per-user DB) so
// they survive reloads and sync across the user's devices. Because the backend
// does not annotate posts with a `saved` flag, this module keeps a synchronous
// in-memory mirror of that server state so the rest of the app can read
// `isSaved()` / `getSaved()` without awaiting, while mutations apply
// optimistically and reconcile with the server in the background. Call
// `loadSaved()` once after login (done in the layout) to hydrate the mirror.

const EVENT = 'feeds:saved:changed'

let cache: SavedItem[] = []
let inflight: Promise<void> | null = null

function emit(): void {
  window.dispatchEvent(new Event(EVENT))
}

export function getSaved(): SavedItem[] {
  return [...cache]
}

export function isSaved(id: string): boolean {
  return cache.some((item) => item.post.id === id)
}

// Fetch the saved list and populate the mirror. Safe to call repeatedly;
// concurrent calls share one request. Errors (transient network, or a 401
// before login completes) are swallowed so the bookmark UI degrades gracefully.
export function loadSaved(): Promise<void> {
  if (inflight) return inflight
  inflight = savedApi
    .list()
    .then((res) => {
      cache = res.saved ?? []
      emit()
    })
    .catch(() => {
      // Leave the existing cache untouched on failure.
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

function addSaved(post: FeedPost): void {
  if (isSaved(post.id)) return
  const optimistic: SavedItem = {
    post: toSnapshot(post),
    created: Math.floor(Date.now() / 1000),
  }
  cache = [optimistic, ...cache]
  emit()
  savedApi.add(post).catch(() => {
    cache = cache.filter((item) => item.post.id !== post.id)
    emit()
    toast.error(i18n._(msg`Failed to save post`))
  })
}

export function removeSaved(id: string): void {
  const previous = cache.find((item) => item.post.id === id)
  if (!previous) return
  cache = cache.filter((item) => item.post.id !== id)
  emit()
  savedApi.remove(id).catch(() => {
    cache = [previous, ...cache]
    emit()
    toast.error(i18n._(msg`Failed to remove saved post`))
  })
}

// Returns the new saved state (true = now saved).
export function toggleSaved(post: FeedPost): boolean {
  if (isSaved(post.id)) {
    removeSaved(post.id)
    return false
  }
  addSaved(post)
  return true
}

export function clearSaved(): void {
  const previous = cache
  cache = []
  emit()
  savedApi.clear().catch(() => {
    cache = previous
    emit()
    toast.error(i18n._(msg`Failed to clear saved posts`))
  })
}

export function onSavedChange(cb: () => void): () => void {
  const handler = () => cb()
  window.addEventListener(EVENT, handler)
  return () => {
    window.removeEventListener(EVENT, handler)
  }
}
