// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
/**
 * Multi-feed WebSocket hook for the feeds list page. It holds one socket for
 * every feed: the server sends each feed's frames to the aggregate key as well
 * as to the feed's own, and core caps a user's sockets at 32 across all their
 * apps and devices, which one socket per feed used most of. The aggregate key
 * carries every feed the user holds, sources included, so a frame counts only
 * when its feed is one the page lists.
 */
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useAuthStore,
  entityWebsocketManager,
  type EntityWebsocketEvent,
} from '@mochi/web'
import { useFeedsStore } from '@/stores/feeds-store'
import { applyFrame } from '@/lib/patch'

// The aggregate key every feed's frames also reach (websocket_key in feeds.star).
export const feedsKey = 'feeds'

// On the aggregate key a feed's frame arrives wrapped, naming its feed, so
// that core's other listeners to websocket writes see each event once.
const wrapped = 'feeds/frame'

/** A feed the page lists: its entity id, which frames name, and the fingerprint its queries may be keyed by. */
export interface ListedFeed {
  id: string
  fingerprint?: string
}

interface FeedWebsocketEvent {
  type: string
  feed: string
  post?: string
  comment?: string
  sender?: string
}

export function useFeedsWebsocket(
  feeds: ListedFeed[],
  userId?: string,
  onUpdate?: (feedId: string) => void,
  onNewPost?: (postId: string | undefined, feedId: string) => void
) {
  const queryClient = useQueryClient()
  const authReady = useAuthStore((state) => state.isInitialized)
  const authToken = useAuthStore((state) => state.token)
  const userIdRef = useRef(userId)
  const onUpdateRef = useRef(onUpdate)
  const onNewPostRef = useRef(onNewPost)
  const feedsRef = useRef(feeds)

  // Keep refs updated
  userIdRef.current = userId
  onUpdateRef.current = onUpdate
  onNewPostRef.current = onNewPost
  feedsRef.current = feeds

  useEffect(() => {
    if (!authReady) return

    const handleMessage = (event: EntityWebsocketEvent) => {
      const raw = event as unknown as {
        type?: string
        frame?: FeedWebsocketEvent
      }
      const data =
        raw.type === wrapped && raw.frame
          ? raw.frame
          : (event as unknown as FeedWebsocketEvent)

      // A frame from a feed the page does not list, such as a source a feed
      // of the user's pulls from, is not the page's to count or reload for.
      // One with no feed (the socket reopening) is about every feed.
      if (
        data.feed &&
        !feedsRef.current.some((feed) => feed.id === data.feed)
      ) {
        return
      }

      // Skip if the event originated from the current user
      if (userIdRef.current && data.sender === userIdRef.current) {
        return
      }

      // Increment sidebar unread count for new posts
      if (data.type === 'post/create') {
        useFeedsStore.getState().adjustUnread(data.feed, 1)

        // Queue the new post behind a "new posts available" pill rather than
        // injecting it into the list under the reader.
        if (onNewPostRef.current) {
          onNewPostRef.current(data.post, data.feed)
          onUpdateRef.current?.(data.feed)
          return
        }
      }

      // A frame about one post changes that post where it stands. Only one
      // about a feed as a whole reloads the lists that match it.
      if (!applyFrame(queryClient, data)) {
        void queryClient.invalidateQueries({
          queryKey: ['posts'],
          predicate: (query) => {
            const key = query.queryKey
            if (key[0] !== 'posts') return false
            const queryFeedId = key[1] as string | undefined
            if (!queryFeedId) return false
            // Match by feed ID from message. '__all__' is the aggregate query key
            // (use-infinite-posts.ts): it is never a feed id or a fingerprint, so
            // without it every event but post/create left the aggregate stale.
            return (
              queryFeedId === '__all__' ||
              queryFeedId === data.feed ||
              feedsRef.current.some(
                (feed) =>
                  feed.id === data.feed && feed.fingerprint === queryFeedId
              )
            )
          },
        })
      }

      // Call optional update handler
      onUpdateRef.current?.(data.feed)
    }

    return entityWebsocketManager.subscribe(feedsKey, handleMessage)
  }, [authReady, authToken, queryClient])
}
