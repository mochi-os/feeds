/**
 * Feeds WebSocket Hook
 * 
 * Uses a singleton WebSocket manager to prevent multiple connections to the same feed.
 * Connections persist across component remounts and React StrictMode double-renders.
 */

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

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
  feed: string
  post?: string
  comment?: string
  sender?: string
}

const RECONNECT_DELAY = 3000

function getWebSocketUrl(feedKey: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/_/websocket?key=${feedKey}`
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
export function useFeedWebsocket(feedKey?: string, userId?: string) {
  const queryClient = useQueryClient()
  
  // Use ref for userId so it doesn't cause reconnections
  const userIdRef = useRef(userId)
  userIdRef.current = userId

  useEffect(() => {
    if (!feedKey) return

    // Create message handler that uses current userIdRef value
    const handleMessage = (data: FeedWebsocketEvent) => {
      // Skip if the event originated from the current user (optimistic UI handling)
      if (userIdRef.current && data.sender === userIdRef.current) {
        return
      }

      const eventType = data.type as string

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
          break
      }
    }

    // Subscribe to WebSocket events
    const unsubscribe = wsManager.subscribe(feedKey, handleMessage)

    return unsubscribe
  }, [feedKey, queryClient]) // Note: userId NOT in deps - uses ref instead
}

export default useFeedWebsocket
