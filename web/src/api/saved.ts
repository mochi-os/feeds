// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { FeedPost, SavedItem, SavedPostSnapshot } from '@/types'
import { createSavedApi } from '@mochi/web'
import endpoints from '@/api/endpoints'
import { toDataResponse } from '@/api/feeds'

// Build the slim snapshot we persist for a post. Deliberately omits comments
// and other heavy/thread data — the saved card is read-only and links back to
// the live post for everything else.
export function toSnapshot(post: FeedPost): SavedPostSnapshot {
  return {
    id: post.id,
    feedId: post.feedId,
    feedFingerprint: post.feedFingerprint,
    feedName: post.feedName,
    author: post.author,
    created: post.created,
    body: post.body,
    bodyHtml: post.bodyHtml,
    data: post.data,
    tags: post.tags,
    attachments: post.attachments,
    reactions: post.reactions,
  }
}

export const savedApi = createSavedApi<FeedPost, SavedItem>({
  appName: 'feeds',
  endpoints: endpoints.saved,
  toSnapshot,
  // Feeds checks the envelope rather than trusting it: toDataResponse logs an
  // unexpected shape against the call it came from before falling back.
  unwrap: (payload, context) => toDataResponse(payload, context).data,
})
