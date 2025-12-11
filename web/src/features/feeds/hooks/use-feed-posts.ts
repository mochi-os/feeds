import { useCallback, useRef, useState } from 'react'
import feedsApi from '@/api/feeds'
import { mapPosts } from '../api/adapters'
import { STRINGS } from '../constants'
import type { FeedPost } from '../types'

export type UseFeedPostsResult = {
  postsByFeed: Record<string, FeedPost[]>
  setPostsByFeed: React.Dispatch<React.SetStateAction<Record<string, FeedPost[]>>>
  loadingFeedId: string | null
  loadPostsForFeed: (feedId: string, forceRefresh?: boolean) => Promise<void>
  loadedFeedsRef: React.MutableRefObject<Set<string>>
  setErrorMessage: (message: string | null) => void
}

export function useFeedPosts(
  setErrorMessage: (message: string | null) => void,
  setPostsByFeedExternal?: (updater: (current: Record<string, FeedPost[]>) => Record<string, FeedPost[]>) => void
): UseFeedPostsResult {
  const [postsByFeed, setPostsByFeed] = useState<Record<string, FeedPost[]>>({})
  const [loadingFeedId, setLoadingFeedId] = useState<string | null>(null)
  const loadedFeedsRef = useRef<Set<string>>(new Set())
  const mountedRef = useRef(true)

  const internalSetPostsByFeed = setPostsByFeedExternal ?? setPostsByFeed

  const loadPostsForFeed = useCallback(async (feedId: string, forceRefresh = false) => {
    setLoadingFeedId(feedId)
    try {
      const response = await feedsApi.get(feedId, forceRefresh ? { _t: Date.now() } : undefined)
      if (!mountedRef.current) {
        return
      }
      const data = response.data ?? {}
      const mappedPosts = mapPosts(data.posts)
      internalSetPostsByFeed((current) => ({ ...current, [feedId]: mappedPosts }))
      setErrorMessage(null)
    } catch (error) {
      if (!mountedRef.current) {
        return
      }
      console.error('[Feeds] Failed to load posts', error)
      setErrorMessage(STRINGS.ERROR_LOAD_POSTS_FAILED)
    } finally {
      if (mountedRef.current) {
        setLoadingFeedId((current) => (current === feedId ? null : current))
      }
    }
  }, [internalSetPostsByFeed, setErrorMessage])

  return {
    postsByFeed,
    setPostsByFeed,
    loadingFeedId,
    loadPostsForFeed,
    loadedFeedsRef,
    setErrorMessage,
  }
}
