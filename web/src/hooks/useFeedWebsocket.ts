import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * WebSocket event types for feeds
 */
interface FeedWebsocketEvent {
  type:
    | 'post/create'
    | 'post/edit'
    | 'post/delete'
    | 'comment/create'
    | 'comment/edit'
    | 'comment/delete'
    | 'react/post'
    | 'react/comment'
  feed: string
  post?: string
  comment?: string
}

const RECONNECT_DELAY = 3000

/**
 * Build WebSocket URL for a specific feed
 */
function getWebSocketUrl(feedId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/_/websocket?key=${feedId}`
}

/**
 * Hook to connect to feed WebSocket and invalidate queries on events.
 * Uses the same pattern as notifications WebSocket - on receiving event,
 * invalidates React Query cache to trigger refetch.
 *
 * @param feedId - The feed ID to connect to (optional)
 * @param server - Server URL for remote feeds (optional, not used for WS but kept for API consistency)
 */
export function useFeedWebsocket(feedId?: string, server?: string) {
  const queryClient = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  // Track the initial feedId to avoid reconnecting when it changes from fingerprint to entity ID
  const stableKeyRef = useRef<string | null>(null)
  const currentFeedIdRef = useRef<string | undefined>(feedId)

  // Silence unused variable warning - server is kept for API consistency
  void server

  // Update currentFeedIdRef when feedId changes (for query invalidation)
  currentFeedIdRef.current = feedId

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    
    // Use stable key if we have one, otherwise use the current feedId
    const wsKey = stableKeyRef.current || feedId
    if (!wsKey) return
    
    // Store the key we're connecting with
    if (!stableKeyRef.current) {
      stableKeyRef.current = wsKey
    }
    
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    try {
      const ws = new WebSocket(getWebSocketUrl(wsKey))
      wsRef.current = ws

      ws.onmessage = (event) => {
        try {
          const data: FeedWebsocketEvent = JSON.parse(event.data)

          // Invalidate relevant queries based on event type
          switch (data.type) {
            case 'post/create':
            case 'post/edit':
            case 'post/delete':
            case 'comment/create':
            case 'comment/edit':
            case 'comment/delete':
            case 'react/post':
            case 'react/comment':
              // Invalidate posts query using all possible feedId formats
              // This ensures cache is invalidated regardless of which ID format is used
              void queryClient.invalidateQueries({
                queryKey: ['posts'],
                predicate: (query) => {
                  const key = query.queryKey
                  return key[0] === 'posts' && (
                    key[1] === currentFeedIdRef.current ||
                    key[1] === stableKeyRef.current ||
                    key[1] === data.feed
                  )
                }
              })
              break
          }
        } catch {
          // Ignore parse errors
        }
      }

      ws.onclose = () => {
        wsRef.current = null
        // Reconnect after delay if still mounted and we have a key
        if (mountedRef.current && stableKeyRef.current) {
          reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY)
        }
      }

      ws.onerror = () => {
        // Error will trigger onclose, which handles reconnection
      }
    } catch {
      // WebSocket creation failed - try again after delay
      if (mountedRef.current && stableKeyRef.current) {
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY)
      }
    }
  }, [feedId, queryClient])

  useEffect(() => {
    mountedRef.current = true
    connect()

    return () => {
      mountedRef.current = false
      stableKeyRef.current = null
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect])
}

export default useFeedWebsocket

