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

// ============================================================================
// Module-level singleton state for WebSocket connections per feed key
// This ensures only one WebSocket connection per feed, regardless of how many
// components use the hook or how many times they re-render (including StrictMode)
// ============================================================================

interface FeedWebSocketState {
  instance: WebSocket | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
  subscriberCount: number
  queryClientRef: QueryClient | null
}

// Map of feedKey -> WebSocket state
const wsStateMap = new Map<string, FeedWebSocketState>()

function getOrCreateState(key: string): FeedWebSocketState {
  let state = wsStateMap.get(key)
  if (!state) {
    state = {
      instance: null,
      reconnectTimer: null,
      subscriberCount: 0,
      queryClientRef: null,
    }
    wsStateMap.set(key, state)
  }
  return state
}

function connectWebSocket(key: string) {
  const state = wsStateMap.get(key)
  if (!state) return
  if (state.instance?.readyState === WebSocket.OPEN) return
  if (state.instance?.readyState === WebSocket.CONNECTING) return

  try {
    const ws = new WebSocket(getWebSocketUrl(key))
    state.instance = ws

    ws.onmessage = (event) => {
      if (state.queryClientRef) {
        handleMessage(event, state.queryClientRef, key)
      }
    }

    ws.onclose = () => {
      state.instance = null
      // Only reconnect if there are still subscribers
      if (state.subscriberCount > 0) {
        state.reconnectTimer = setTimeout(() => connectWebSocket(key), RECONNECT_DELAY)
      }
    }

    ws.onerror = () => {
      // Error will trigger onclose
    }
  } catch {
    // Connection failed, retry if subscribers exist
    if (state.subscriberCount > 0) {
      state.reconnectTimer = setTimeout(() => connectWebSocket(key), RECONNECT_DELAY)
    }
  }
}

function disconnectWebSocket(key: string) {
  const state = wsStateMap.get(key)
  if (!state) return

  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer)
    state.reconnectTimer = null
  }
  if (state.instance) {
    state.instance.close()
    state.instance = null
  }
}

/**
 * Hook to connect to feed WebSocket and invalidate queries on events.
 * Uses a singleton pattern to ensure only one connection per feed key.
 * 
 * IMPORTANT: Always pass the fingerprint (from URL) as feedId.
 * This ensures a single, stable WebSocket connection that doesn't
 * reconnect when the entity ID becomes available.
 *
 * @param feedId - The feed fingerprint to connect to (from URL params)
 */
export function useFeedWebsocket(feedId?: string) {
  const queryClient = useQueryClient()
  // Store the initial feedId - never changes during component lifecycle
  const stableKeyRef = useRef<string | undefined>(feedId)

  // Only set stableKey once on first valid feedId
  if (!stableKeyRef.current && feedId) {
    stableKeyRef.current = feedId
  }

  useEffect(() => {
    const wsKey = stableKeyRef.current
    if (!wsKey) return

    const state = getOrCreateState(wsKey)
    
    // Store queryClient reference for message handling
    state.queryClientRef = queryClient
    state.subscriberCount++

    // Connect if this is the first subscriber for this feed
    if (state.subscriberCount === 1) {
      connectWebSocket(wsKey)
    }

    return () => {
      state.subscriberCount--

      // Disconnect if no more subscribers for this feed
      if (state.subscriberCount === 0) {
        disconnectWebSocket(wsKey)
        state.queryClientRef = null
        wsStateMap.delete(wsKey)
      }
    }
  }, [queryClient])
}

export default useFeedWebsocket
