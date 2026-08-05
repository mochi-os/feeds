// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
/**
 * Hook to subscribe to WebSocket events for multiple feeds
 * Used by the feeds list page to get real-time updates for all subscribed feeds
 *
 * The sockets come from the shared entityWebsocketManager, one per feed key and
 * shared with useFeedWebsocket, so opening a feed while the list is mounted
 * reuses the connection the list already holds.
 */
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  entityWebsocketManager,
  useAuthStore,
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

/**
 * Hook to subscribe to WebSocket events for multiple feeds
 *
 * @param feedFingerprints - Array of feed fingerprints to subscribe to
 * @param userId - Current user ID, used to filter out self-events
 * @param onUpdate - Optional callback when any feed receives an update
 */
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

  // One unsubscribe per subscribed key, so a changed feed list only touches the
  // keys that actually came or went instead of reconnecting every socket.
  const subscriptionsRef = useRef(new Map<string, () => void>())

  // The token is baked into the socket URL at connect time, so a new token has
  // to reconnect rather than diff.
  const subscribedTokenRef = useRef(authToken)

  const handleMessage = (event: EntityWebsocketEvent) => {
    // The manager parses the envelope; the payload shape is the feed's own.
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
        return (
          queryFeedId === data.feed ||
          fingerprintsRef.current.includes(queryFeedId)
        )
      },
    })

    // Call optional update handler
    onUpdateRef.current?.(data.feed)
  }

  // Subscriptions outlive the effect that created them, so the handler is read
  // through a ref: a socket opened on an earlier render still runs the current
  // one.
  const handleMessageRef = useRef(handleMessage)
  handleMessageRef.current = handleMessage

  // Create stable key for dependency
  const fingerprintsKey = feedFingerprints.join(',')

  useEffect(() => {
    const subscriptions = subscriptionsRef.current

    const dropAll = () => {
      subscriptions.forEach((unsubscribe) => unsubscribe())
      subscriptions.clear()
    }

    // Signed out: let go of every socket rather than leaving them open on a
    // session that has ended.
    if (!authReady) {
      dropAll()
      return
    }

    if (subscribedTokenRef.current !== authToken) {
      dropAll()
      subscribedTokenRef.current = authToken
    }

    const next = new Set(fingerprintsRef.current)

    for (const [key, unsubscribe] of subscriptions) {
      if (!next.has(key)) {
        unsubscribe()
        subscriptions.delete(key)
      }
    }

    for (const key of next) {
      if (subscriptions.has(key)) continue
      subscriptions.set(
        key,
        entityWebsocketManager.subscribe(key, (event) =>
          handleMessageRef.current(event)
        )
      )
    }
  }, [authReady, authToken, fingerprintsKey, queryClient])

  // Drop every socket when the page unmounts, not when the feed list changes.
  useEffect(() => {
    const subscriptions = subscriptionsRef.current
    return () => {
      subscriptions.forEach((unsubscribe) => unsubscribe())
      subscriptions.clear()
    }
  }, [])
}
