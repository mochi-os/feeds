/* eslint-disable lingui/no-unlocalized-strings -- internal API context strings, not user-facing */
import endpoints from '@/api/endpoints'
import { createAppClient } from '@mochi/web'
import type { FeedPost, SavedItem, SavedPostSnapshot } from '@/types'

const client = createAppClient({ appName: 'feeds' })

type Wrapped<T> = T | { data: T }

const unwrap = <T>(payload: Wrapped<T>): T =>
  payload && typeof payload === 'object' && 'data' in payload
    ? (payload as { data: T }).data
    : (payload as T)

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

export const savedApi = {
  list: async (): Promise<{ saved: SavedItem[]; total: number }> => {
    const response = await client.post<
      Wrapped<{ saved: SavedItem[]; total: number }>,
      Record<string, never>
    >(endpoints.saved.list, {})
    const data = unwrap(response)
    return { saved: data?.saved ?? [], total: data?.total ?? 0 }
  },

  add: async (post: FeedPost): Promise<{ saved: boolean }> => {
    const response = await client.post<
      Wrapped<{ saved: boolean }>,
      { post: string; data: string }
    >(endpoints.saved.add, {
      post: post.id,
      data: JSON.stringify(toSnapshot(post)),
    })
    return unwrap(response)
  },

  remove: async (id: string): Promise<{ saved: boolean }> => {
    const response = await client.post<
      Wrapped<{ saved: boolean }>,
      { post: string }
    >(endpoints.saved.remove, { post: id })
    return unwrap(response)
  },

  clear: async (): Promise<{ saved: boolean }> => {
    const response = await client.post<
      Wrapped<{ saved: boolean }>,
      Record<string, never>
    >(endpoints.saved.clear, {})
    return unwrap(response)
  },
}
