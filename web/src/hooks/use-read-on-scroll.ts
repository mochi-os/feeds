import { useCallback, useEffect, useRef } from 'react'

const MIN_VISIBLE_MS = 1000
const SWEEP_INTERVAL_MS = 2000

export function useReadOnScroll(markRead: (postId: string, feedId?: string) => void) {
  const visibleSince = useRef<Map<string, { time: number; feedId?: string }>>(new Map())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const pendingElements = useRef<Set<HTMLElement>>(new Set())
  const markReadRef = useRef(markRead)
  markReadRef.current = markRead

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const now = Date.now()
        for (const entry of entries) {
          const el = entry.target as HTMLElement
          const postId = el.dataset.postId
          if (!postId) continue

          if (entry.isIntersecting) {
            if (!visibleSince.current.has(postId)) {
              visibleSince.current.set(postId, {
                time: now,
                feedId: el.dataset.feedId,
              })
            }
          } else {
            const info = visibleSince.current.get(postId)
            if (info && now - info.time >= MIN_VISIBLE_MS) {
              markReadRef.current(postId, info.feedId)
            }
            visibleSince.current.delete(postId)
          }
        }
      },
      { threshold: 0.3 }
    )

    // Observe any elements that were queued before the observer was ready
    for (const el of pendingElements.current) {
      observerRef.current.observe(el)
    }
    pendingElements.current.clear()

    // Periodic sweep: mark posts read that have been visible long enough
    // but haven't left the viewport (e.g. user stopped scrolling)
    const sweepTimer = setInterval(() => {
      const now = Date.now()
      for (const [postId, info] of visibleSince.current.entries()) {
        if (now - info.time >= MIN_VISIBLE_MS) {
          markReadRef.current(postId, info.feedId)
          visibleSince.current.delete(postId)
        }
      }
    }, SWEEP_INTERVAL_MS)

    return () => {
      observerRef.current?.disconnect()
      observerRef.current = null
      clearInterval(sweepTimer)
    }
  }, [])

  const observePost = useCallback((el: HTMLElement | null) => {
    if (!el) return
    if (observerRef.current) {
      observerRef.current.observe(el)
    } else {
      pendingElements.current.add(el)
    }
  }, [])

  return { observePost }
}
