// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the Mochi
// Application Interface Exception - see license.txt and license-exception.md.
// Feeds-specific shape over the shared createSavedStore: a post snapshot with
// its saved time, and the toast wording. Call `loadSaved()` once after login
// (the layout does) to hydrate the mirror.
import type { FeedPost, SavedItem } from '@/types'
import { msg } from '@lingui/core/macro'
import { createSavedStore } from '@mochi/web'
import { savedApi, toSnapshot } from '@/api/saved'

const store = createSavedStore<SavedItem, FeedPost>({
  eventName: 'feeds:saved:changed',
  api: {
    list: async () => (await savedApi.list()).saved,
    add: (post) => savedApi.add(post),
    remove: (id) => savedApi.remove(id),
    clear: () => savedApi.clear(),
  },
  itemId: (item) => item.post.id,
  inputId: (post) => post.id,
  toItem: (post) => ({
    post: toSnapshot(post),
    created: Math.floor(Date.now() / 1000),
  }),
  messages: {
    saving: msg`Saving...`,
    saved: msg`Saved`,
    addFailed: msg`Failed to save post`,
    removing: msg`Removing...`,
    removed: msg`Removed from saved`,
    removeFailed: msg`Failed to remove saved post`,
    clearing: msg`Clearing saved posts...`,
    cleared: msg`Saved posts cleared`,
    clearFailed: msg`Failed to clear saved posts`,
  },
})

export const {
  getSaved,
  isSaved,
  loadSaved,
  removeSaved,
  toggleSaved,
  clearSaved,
  onSavedChange,
} = store
