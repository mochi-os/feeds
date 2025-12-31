
import { useEffect, useRef } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'

interface FeedWebsocketEvent {
  type:
    | 'post/create'
    | 'post/edit'
    | 'post/delete'
    | 'comment/create' // Legacy?
    | 'comment/add'    // Actual backend event
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

function getWebSocketUrl(feedId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/_/websocket?key=${feedId}`
}

function handleMessage(event: MessageEvent, queryClient: QueryClient, wsKey: string, userId?: string) {
  try {
    const data: FeedWebsocketEvent = JSON.parse(event.data)

    // Skip if the event originated from the current user (optimistic UI handling)
    if (userId && data.sender === userId) {
      return
    }

    const eventType = data.type as string // Type assertion for safer switch matching 
    
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
        // wsKey is the fingerprint used for WebSocket connection (from URL)
        // data.feed is the entity ID from the WebSocket message (from backend)
        // Query keys may use either fingerprint or entity ID depending on how feed was loaded
        void queryClient.invalidateQueries({
          queryKey: ['posts'],
          predicate: (query) => {
            const key = query.queryKey
            if (key[0] !== 'posts') return false
            
            const queryFeedId = key[1] as string | undefined
            if (!queryFeedId) return false
            
            // Match if query feed ID matches WebSocket key (fingerprint) or message feed (entity ID)
            // This handles both cases: query using fingerprint vs entity ID
            return queryFeedId === wsKey || queryFeedId === data.feed
          }
        })
        break
    }
  } catch {
    // Ignore parse errors
  }
}

export function useFeedWebsocket(feedId?: string, userId?: string) {
  const queryClient = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  // const { user } = useAuthStore() -- 'user' does not exist on AuthState
  // const userId = user?.id

  useEffect(() => {
    mountedRef.current = true
    // Use feedId directly. Ideally this should be the fingerprint.
    const wsKey = feedId

    if (!wsKey) return

    function connect() {
      if (!mountedRef.current) return
      if (!wsKey) return // TypeScript guard
      if (wsRef.current?.readyState === WebSocket.OPEN) return
      if (wsRef.current?.readyState === WebSocket.CONNECTING) return

      try {
        const ws = new WebSocket(getWebSocketUrl(wsKey))
        wsRef.current = ws

        ws.onmessage = (event) => handleMessage(event, queryClient, wsKey, userId)

        ws.onclose = () => {
          wsRef.current = null
          // Reconnect after delay if still mounted
          // Only reconnect if the key hasn't changed in the meantime (effect cleanup handles that)
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
  }, [feedId, queryClient, userId]) 
}

export default useFeedWebsocket
