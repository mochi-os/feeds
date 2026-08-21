// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

/**
 * Multi-feed WebSocket hook for the feeds list page. Each key is a subscription
 * on the shared entityWebsocketManager, so sockets are shared with any open
 * single-feed page.
 */

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useAuthStore,
  entityWebsocketManager,
  type EntityWebsocketEvent,
} from '@mochi/web'
import { useFeedsStore } from '@/stores/feeds-store'

interface FeedWebsocketEvent {
  type: string
  feed: string
  post?: string
  comment?: string
  sender?: string
}

export function useFeedsWebsocket(
  feedFingerprints: string[],
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
  const fingerprintsRef = useRef(feedFingerprints)

  // Keep refs updated
  userIdRef.current = userId
  onUpdateRef.current = onUpdate
  onNewPostRef.current = onNewPost
  fingerprintsRef.current = feedFingerprints

  // Create stable key for dependency
  const fingerprintsKey = feedFingerprints.join(',')

  useEffect(() => {
    if (!authReady) return

    const handleMessage = (event: EntityWebsocketEvent) => {
      const data = event as unknown as FeedWebsocketEvent

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

      // Invalidate posts queries for this feed
      void queryClient.invalidateQueries({
        queryKey: ['posts'],
        predicate: (query) => {
          const key = query.queryKey
          if (key[0] !== 'posts') return false
          const queryFeedId = key[1] as string | undefined
          if (!queryFeedId) return false
          // Match by feed ID from message
          return queryFeedId === data.feed || fingerprintsRef.current.includes(queryFeedId)
        },
      })

      // Call optional update handler
      onUpdateRef.current?.(data.feed)
    }

    const unsubscribes = fingerprintsRef.current.map((fingerprint) =>
      entityWebsocketManager.subscribe(fingerprint, handleMessage)
    )

    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe()
    }
  }, [authReady, authToken, fingerprintsKey, queryClient])
}
