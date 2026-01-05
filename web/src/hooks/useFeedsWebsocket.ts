/**
 * Hook to subscribe to WebSocket events for multiple feeds
 * Used by the feeds list page to get real-time updates for all subscribed feeds
 */

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

interface FeedWebsocketEvent {
  type: string
  feed: string
  post?: string
  comment?: string
  sender?: string
}

const RECONNECT_DELAY = 3000

function getWebSocketUrl(key: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/_/websocket?key=${key}`
}

/**
 * Multi-feed WebSocket Manager
 * Manages connections to multiple feed WebSockets
 */
class MultiFeedWSManager {
  private connections = new Map<string, WebSocket>()
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private messageHandler: ((event: FeedWebsocketEvent) => void) | null = null
  private subscribedKeys = new Set<string>()
  private connectionAttempts = new Map<string, boolean>()

  setMessageHandler(handler: (event: FeedWebsocketEvent) => void) {
    this.messageHandler = handler
  }

  updateSubscriptions(keys: string[]) {
    const newKeys = new Set(keys)
    
    // Close connections for removed keys
    for (const key of this.subscribedKeys) {
      if (!newKeys.has(key)) {
        this.closeConnection(key)
      }
    }
    
    // Connect to new keys
    for (const key of newKeys) {
      if (!this.subscribedKeys.has(key)) {
        this.connect(key)
      }
    }
    
    this.subscribedKeys = newKeys
  }

  private connect(key: string) {
    // Already connected or connecting
    const existing = this.connections.get(key)
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      return
    }

    // Prevent multiple connection attempts
    if (this.connectionAttempts.get(key)) {
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
          this.messageHandler?.(data)
        } catch {
          // Ignore parse errors
        }
      }

      ws.onclose = () => {
        this.connectionAttempts.set(key, false)
        this.connections.delete(key)
        
        // Reconnect if still subscribed
        if (this.subscribedKeys.has(key)) {
          const timer = setTimeout(() => this.connect(key), RECONNECT_DELAY)
          this.reconnectTimers.set(key, timer)
        }
      }

      ws.onerror = () => {
        this.connectionAttempts.set(key, false)
      }
    } catch {
      this.connectionAttempts.set(key, false)
      if (this.subscribedKeys.has(key)) {
        const timer = setTimeout(() => this.connect(key), RECONNECT_DELAY)
        this.reconnectTimers.set(key, timer)
      }
    }
  }

  private closeConnection(key: string) {
    const timer = this.reconnectTimers.get(key)
    if (timer) {
      clearTimeout(timer)
      this.reconnectTimers.delete(key)
    }

    const ws = this.connections.get(key)
    if (ws) {
      ws.close()
      this.connections.delete(key)
    }

    this.connectionAttempts.delete(key)
    this.subscribedKeys.delete(key)
  }

  closeAll() {
    for (const key of Array.from(this.subscribedKeys)) {
      this.closeConnection(key)
    }
  }
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
  onUpdate?: (feedId: string) => void
) {
  const queryClient = useQueryClient()
  const managerRef = useRef<MultiFeedWSManager | null>(null)
  const userIdRef = useRef(userId)
  const onUpdateRef = useRef(onUpdate)
  const fingerprintsRef = useRef(feedFingerprints)
  
  // Keep refs updated
  userIdRef.current = userId
  onUpdateRef.current = onUpdate
  fingerprintsRef.current = feedFingerprints
  
  // Create stable key for dependency
  const fingerprintsKey = feedFingerprints.join(',')

  useEffect(() => {
    // Create manager if needed
    if (!managerRef.current) {
      managerRef.current = new MultiFeedWSManager()
    }
    const manager = managerRef.current

    // Set up message handler
    manager.setMessageHandler((data) => {
      // Skip if the event originated from the current user
      if (userIdRef.current && data.sender === userIdRef.current) {
        return
      }

      // Invalidate posts queries for this feed
      void queryClient.invalidateQueries({
        queryKey: ['posts'],
        predicate: (query) => {
          const key = query.queryKey
          if (key[0] !== 'posts') return false
          const queryFeedId = key[1] as string | undefined
          if (!queryFeedId) return false
          // Only invalidate the specific feed that changed (match by feed ID from message)
          return queryFeedId === data.feed
        },
      })

      // Call optional update handler
      onUpdateRef.current?.(data.feed)
    })

    // Update subscriptions
    manager.updateSubscriptions(fingerprintsRef.current)

    return () => {
      manager.closeAll()
    }
  }, [fingerprintsKey, queryClient])
}

export default useFeedsWebsocket
