// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

/**
 * Feed WebSocket hook. Sockets come from the shared entityWebsocketManager -
 * one per feed key, shared by every subscriber; never open one directly.
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
  type:
    | 'post/create'
    | 'post/edit'
    | 'post/delete'
    | 'comment/create'
    | 'comment/add'
    | 'comment/edit'
    | 'comment/delete'
    | 'react/post'
    | 'react/comment'
    | 'feed/update'
    | 'tag/add'
    | 'tag/remove'
  feed: string
  post?: string
  comment?: string
  sender?: string
}

/**
 * Subscribe to one feed's WebSocket events. `feedKey` is the fingerprint, not
 * the entity id. With `onNewPost`, `post/create` events go to the caller (for a
 * "new posts" pill) instead of invalidating the posts list.
 */
export function useFeedWebsocket(
  feedKey?: string,
  userId?: string,
  onNewPost?: (postId?: string) => void,
  onSync?: () => void
) {
  const queryClient = useQueryClient()
  const authReady = useAuthStore((state) => state.isInitialized)
  const authToken = useAuthStore((state) => state.token)

  // Use ref for userId so it doesn't cause reconnections
  const userIdRef = useRef(userId)
  userIdRef.current = userId

  // Refs so a changing callback doesn't tear down the WebSocket subscription
  const onNewPostRef = useRef(onNewPost)
  onNewPostRef.current = onNewPost
  const onSyncRef = useRef(onSync)
  onSyncRef.current = onSync

  useEffect(() => {
    if (!authReady) return
    if (!feedKey) return

    // Create message handler that uses current userIdRef value
    const handleMessage = (event: EntityWebsocketEvent) => {
      const data = event as unknown as FeedWebsocketEvent

      // Skip if the event originated from the current user (optimistic UI handling)
      if (userIdRef.current && data.sender === userIdRef.current) {
        return
      }

      const eventType = data.type as string

      // A feed/update after subscribe means the owner finished pushing the
      // initial posts (server flipped `populated`); re-run the route loader so
      // the feed leaves its loading state. It also falls through to the query
      // invalidation below.
      if (eventType === 'feed/update') {
        onSyncRef.current?.()
      }

      // Increment sidebar unread count for new posts
      if (eventType === 'post/create') {
        useFeedsStore.getState().adjustUnread(data.feed, 1)

        // If the page is queueing new posts behind a pill, hand the event off
        // and skip the list invalidation so the visible list doesn't shift
        // under the reader. Edits/deletes/reactions/comments still flow through
        // (they mutate already-visible items, so live updates are expected).
        if (onNewPostRef.current) {
          onNewPostRef.current(data.post)
          return
        }
      }

      // Invalidate relevant queries based on event type
      switch (eventType) {
        case 'post/create':
        case 'post/edit':
        case 'post/delete':
        case 'comment/create':
        case 'comment/add':
        case 'comment/edit':
        case 'comment/delete':
        case 'react/post':
        case 'react/comment':
        case 'feed/update':
        case 'tag/add':
        case 'tag/remove':
          // Invalidate all posts queries that might match this feed
          void queryClient.invalidateQueries({
            queryKey: ['posts'],
            predicate: (query) => {
              const key = query.queryKey
              if (key[0] !== 'posts') return false

              const queryFeedId = key[1] as string | undefined
              if (!queryFeedId) return false

              // Match if query feed ID matches WebSocket key (fingerprint) or message feed (entity ID)
              return queryFeedId === feedKey || queryFeedId === data.feed
            },
          })

        void queryClient.invalidateQueries({
            queryKey: ['feeds', 'single-post'],
            predicate: (query) => {
              const key = query.queryKey
              if (key[0] !== 'feeds' || key[1] !== 'single-post') return false
              const queryFeedId = key[2] as string | undefined
              if (!queryFeedId) return false
              return queryFeedId === feedKey || queryFeedId === data.feed
            },
          })
          break
      }
    }

    // Subscribe to WebSocket events
    const unsubscribe = entityWebsocketManager.subscribe(feedKey, handleMessage)

    return unsubscribe
  }, [authReady, authToken, feedKey, queryClient]) // Note: userId NOT in deps - uses ref instead
}
