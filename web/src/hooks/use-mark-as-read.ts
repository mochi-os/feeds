import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { feedsApi } from '@/api/feeds'
import { useFeedsStore } from '@/stores/feeds-store'

const FLUSH_INTERVAL = 2000

export function useMarkAsRead(feedId: string | null) {
  const pendingRef = useRef<Map<string, Set<string>>>(new Map())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queryClient = useQueryClient()
  const feedIdRef = useRef(feedId)
  feedIdRef.current = feedId
  // Session-lived set of post IDs marked read locally. Survives React Query
  // refetches and postsByFeed reloads, so the stripe stays hidden when the
  // user scrolls back to a post before the server has persisted the read.
  const [readLocally, setReadLocally] = useState<Set<string>>(() => new Set())

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const pending = pendingRef.current
    if (pending.size === 0) return

    const now = Date.now()
    for (const [fid, postIdSet] of pending.entries()) {
      if (postIdSet.size === 0) continue
      const postIds = Array.from(postIdSet)
      const idSet = new Set(postIds)

      // Optimistically update cached post data (hides blue dots without refetching)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryClient.setQueriesData({ queryKey: ['posts'] }, (oldData: any) => {
        if (!oldData?.pages) return oldData
        return {
          ...oldData,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pages: oldData.pages.map((page: any) => ({
            ...page,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            posts: page.posts.map((post: any) =>
              idSet.has(post.id) ? { ...post, read: now } : post
            ),
          })),
        }
      })

      // Persist to server in background
      void feedsApi.postsRead(fid, postIds).catch(() => {})

      // Optimistically decrement sidebar unread count
      useFeedsStore.getState().adjustUnread(fid, -postIds.length)
    }
    pending.clear()
  }, [queryClient])

  const markRead = useCallback(
    (postId: string, postFeedId?: string) => {
      const resolvedFeedId = postFeedId ?? feedIdRef.current
      if (!resolvedFeedId) return
      let set = pendingRef.current.get(resolvedFeedId)
      if (!set) {
        set = new Set()
        pendingRef.current.set(resolvedFeedId, set)
      }
      if (set.has(postId)) return
      set.add(postId)
      setReadLocally((prev) => {
        if (prev.has(postId)) return prev
        const next = new Set(prev)
        next.add(postId)
        return next
      })
      if (!timerRef.current) {
        timerRef.current = setTimeout(flush, FLUSH_INTERVAL)
      }
    },
    [flush]
  )

  // Flush on visibility change (page hide) and unmount
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flush()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      flush()
    }
  }, [flush])

  return { markRead, flush, readLocally }
}
