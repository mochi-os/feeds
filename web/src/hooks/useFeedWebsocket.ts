import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

const RECONNECT_DELAY = 3000

interface Wrapper {
  ws: WebSocket
  subscriberCount: number
  reconnectTimer: ReturnType<typeof setTimeout> | null
}

// Global map to ensure one connection per feed fingerprint
const connections = new Map<string, Wrapper>()

export function useFeedWebsocket(feedFingerprint?: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!feedFingerprint) return

    function connect() {
      if (!feedFingerprint) return
      
      // Close existing if checking (shouldn't happen logic-wise but safe)
      if (connections.has(feedFingerprint)) {
         const existing = connections.get(feedFingerprint)
         if (existing?.ws.readyState === WebSocket.OPEN) return
      }

      const ws = new WebSocket(`/_/websocket?key=${feedFingerprint}`)
      
      const wrapper: Wrapper = {
        ws,
        subscriberCount: 1, // Start with 1 (us)
        reconnectTimer: null
      }

      // If existing wrapper existed (e.g. reconnecting), preserve count
      const existing = connections.get(feedFingerprint)
      if (existing) {
        wrapper.subscriberCount = existing.subscriberCount
        if (existing.reconnectTimer) clearTimeout(existing.reconnectTimer)
      }

      connections.set(feedFingerprint, wrapper)

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          // Event types: post.create, post.update, reaction.add, etc.
          // We simply invalidate the posts list for this feed.
          // We verify the msg.feed matches our fingerprint to be safe.
          if (msg.feed === feedFingerprint) {
             queryClient.invalidateQueries({ queryKey: ['posts', feedFingerprint] })
          }
        } catch (err) {
          console.error("WS parse error", err)
        }
      }

      ws.onclose = () => {
        const currentWrapper = connections.get(feedFingerprint)
        if (currentWrapper && currentWrapper.subscriberCount > 0) {
          // Reconnect if we still have subscribers
          currentWrapper.reconnectTimer = setTimeout(connect, RECONNECT_DELAY)
        } else {
          connections.delete(feedFingerprint)
        }
      }
      
      ws.onerror = (err) => {
         console.error("WebSocket error", err)
         // onError generally triggers onClose
      }
    }

    const state = connections.get(feedFingerprint)

    if (state) {
      // Connection exists, just increment
      state.subscriberCount++
    } else {
      // First subscriber, connect
      connect()
    }

    return () => {
      const state = connections.get(feedFingerprint)
      if (state) {
        state.subscriberCount--
        if (state.subscriberCount <= 0) {
          // Last subscriber left
          if (state.reconnectTimer) clearTimeout(state.reconnectTimer)
          state.ws.close()
          connections.delete(feedFingerprint)
        }
      }
    }
  }, [feedFingerprint, queryClient])
}
