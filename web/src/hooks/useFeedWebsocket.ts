// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

/**
 * Feeds WebSocket Hook
 * 
 * Uses a singleton WebSocket manager to prevent multiple connections to the same feed.
 * Connections persist across component remounts and React StrictMode double-renders.
 */

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@mochi/web'
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

const RECONNECT_DELAY = 3000

function getWebSocketUrl(feedKey: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const raw = useAuthStore.getState().token
  const token = raw?.startsWith('Bearer ') ? raw.slice(7) : raw
  const tokenParam = token ? `&token=${encodeURIComponent(token)}` : ''
  return `${protocol}//${window.location.host}/_/websocket?key=${feedKey}${tokenParam}`
}

/**
 * Singleton WebSocket Manager
 * Manages WebSocket connections by key, preventing duplicate connections
 */
class WebSocketManager {
  private connections = new Map<string, WebSocket>()
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private subscribers = new Map<string, Set<(event: FeedWebsocketEvent) => void>>()
  private connectionAttempts = new Map<string, boolean>()

  subscribe(key: string, callback: (event: FeedWebsocketEvent) => void): () => void {
    // Add subscriber
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set())
    }
    this.subscribers.get(key)!.add(callback)

    // Connect if not already connected
    this.ensureConnection(key)

    // Return unsubscribe function
    return () => {
      const subs = this.subscribers.get(key)
      if (subs) {
        subs.delete(callback)
        // If no more subscribers for this key, close connection
        if (subs.size === 0) {
          this.subscribers.delete(key)
          this.closeConnection(key)
        }
      }
    }
  }

  private ensureConnection(key: string) {
    // Already connected or connecting
    const existing = this.connections.get(key)
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      return
    }

    // Prevent multiple connection attempts
    if (this.connectionAttempts.get(key)) {
      return
    }

    this.connect(key)
  }

  private connect(key: string) {
    // Clear any pending reconnect timer
    const timer = this.reconnectTimers.get(key)
    if (timer) {
      clearTimeout(timer)
      this.reconnectTimers.delete(key)
    }

    // Don't connect if no subscribers
    if (!this.subscribers.has(key) || this.subscribers.get(key)!.size === 0) {
      return
    }

    this.connectionAttempts.set(key, true)

    try {
      const ws = new WebSocket(getWebSocketUrl(key))
      this.connections.set(key, ws)

      ws.onopen = () => {
        this.connectionAttempts.set(key, false)
      }

      ws.onmessage = (event) => {
        try {
          const data: FeedWebsocketEvent = JSON.parse(event.data)
          // Notify all subscribers for this key
          const subs = this.subscribers.get(key)
          if (subs) {
            subs.forEach((callback) => callback(data))
          }
        } catch {
          // Ignore parse errors
        }
      }

      ws.onclose = () => {
        this.connectionAttempts.set(key, false)
        this.connections.delete(key)
        
        // Reconnect if still have subscribers
        if (this.subscribers.has(key) && this.subscribers.get(key)!.size > 0) {
          const reconnectTimer = setTimeout(() => this.connect(key), RECONNECT_DELAY)
          this.reconnectTimers.set(key, reconnectTimer)
        }
      }

      ws.onerror = () => {
        this.connectionAttempts.set(key, false)
        // Error triggers onclose, which handles reconnection
      }
    } catch {
      this.connectionAttempts.set(key, false)
      // Connection failed - try again after delay
      if (this.subscribers.has(key) && this.subscribers.get(key)!.size > 0) {
        const reconnectTimer = setTimeout(() => this.connect(key), RECONNECT_DELAY)
        this.reconnectTimers.set(key, reconnectTimer)
      }
    }
  }

  private closeConnection(key: string) {
    // Clear reconnect timer
    const timer = this.reconnectTimers.get(key)
    if (timer) {
      clearTimeout(timer)
      this.reconnectTimers.delete(key)
    }

    // Close WebSocket
    const ws = this.connections.get(key)
    if (ws) {
      ws.close()
      this.connections.delete(key)
    }

    this.connectionAttempts.delete(key)
  }
}

// Singleton instance
const wsManager = new WebSocketManager()

/**
 * Hook to subscribe to feed WebSocket events
 * Uses a singleton manager to prevent duplicate connections
 * 
 * @param feedKey - The feed fingerprint to subscribe to (use fingerprint, not entity ID)
 * @param userId - Current user ID, used to filter out self-events (optional)
 */
/**
 * @param feedKey - The feed fingerprint to subscribe to (use fingerprint, not entity ID)
 * @param userId - Current user ID, used to filter out self-events (optional)
 * @param onNewPost - When provided, incoming `post/create` events are routed
 *   here (with the new post id) instead of auto-invalidating the posts list.
 *   Lets the caller queue them behind a "new posts available" pill rather than
 *   injecting them into the list while the user is reading.
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
    const handleMessage = (data: FeedWebsocketEvent) => {
      console.debug('[feeds-ws] received', {
        type: data.type,
        feed: data.feed,
        post: data.post,
        comment: data.comment,
        sender: data.sender,
        currentUser: userIdRef.current,
        feedKey,
      })

      // Skip if the event originated from the current user (optimistic UI handling)
      if (userIdRef.current && data.sender === userIdRef.current) {
        console.debug('[feeds-ws] skipping self event', {
          type: data.type,
          post: data.post,
          sender: data.sender,
        })
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
          console.debug('[feeds-ws] invalidating feed queries', {
            type: eventType,
            feed: data.feed,
            post: data.post,
            sender: data.sender,
          })
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
    const unsubscribe = wsManager.subscribe(feedKey, handleMessage)

    return unsubscribe
  }, [authReady, authToken, feedKey, queryClient]) // Note: userId NOT in deps - uses ref instead
}
