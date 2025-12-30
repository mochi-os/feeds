import { useEffect, useRef } from 'react'
import { useQueryClient, QueryClient } from '@tanstack/react-query'

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
 * Handle WebSocket message - invalidate queries to trigger refetch
 */
function handleMessage(event: MessageEvent, queryClient: QueryClient, wsKey: string) {
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
        // Invalidate all posts queries that might match this feed
        // Uses predicate to match any possible ID format (fingerprint, entity ID, or from event)
        void queryClient.invalidateQueries({
          queryKey: ['posts'],
          predicate: (query) => {
            const key = query.queryKey
            // Match if it's a posts query and the feed matches any known ID
            return key[0] === 'posts' && (
              key[1] === wsKey ||
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

/**
 * Hook to connect to feed WebSocket and invalidate queries on events.
 * 
 * IMPORTANT: Always pass the fingerprint (from URL) as feedId.
 * This ensures a single, stable WebSocket connection that doesn't
 * reconnect when the entity ID becomes available.
 *
 * @param feedId - The feed fingerprint to connect to (from URL params)
 */
export function useFeedWebsocket(feedId?: string) {
  const queryClient = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  // Store the initial feedId - never changes during component lifecycle
  const stableKeyRef = useRef<string | undefined>(feedId)

  // Only set stableKey once on first valid feedId
  if (!stableKeyRef.current && feedId) {
    stableKeyRef.current = feedId
  }

  useEffect(() => {
    mountedRef.current = true
    const wsKey = stableKeyRef.current

    if (!wsKey) return

    function connect() {
      if (!mountedRef.current) return
      if (!wsKey) return // TypeScript guard
      if (wsRef.current?.readyState === WebSocket.OPEN) return
      if (wsRef.current?.readyState === WebSocket.CONNECTING) return

      try {
        const ws = new WebSocket(getWebSocketUrl(wsKey))
        wsRef.current = ws

        ws.onmessage = (event) => handleMessage(event, queryClient, wsKey)

        ws.onclose = () => {
          wsRef.current = null
          // Reconnect after delay if still mounted
          if (mountedRef.current) {
            reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY)
          }
        }

        ws.onerror = () => {
          // Error will trigger onclose, which handles reconnection
        }
      } catch {
        // WebSocket creation failed - try again after delay
        if (mountedRef.current) {
          reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY)
        }
      }
    }

    connect()

    return () => {
      mountedRef.current = false
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [queryClient]) // Only depend on queryClient, not feedId

}

export default useFeedWebsocket
