import { useCallback, useEffect, useRef, useState } from 'react'
import feedsApi from '@/api/feeds'
import { mapPosts } from '../api/adapters'
import { STRINGS } from '../constants'
import type { FeedPost } from '../types'

export type UseFeedPostsOptions = {
  setErrorMessage: (message: string | null) => void
  /** External posts state - if provided, uses this instead of internal state */
  postsByFeed?: Record<string, FeedPost[]>
  setPostsByFeed?: React.Dispatch<React.SetStateAction<Record<string, FeedPost[]>>>
}

export type UseFeedPostsResult = {
  postsByFeed: Record<string, FeedPost[]>
  setPostsByFeed: React.Dispatch<React.SetStateAction<Record<string, FeedPost[]>>>
  loadingFeedId: string | null
  loadPostsForFeed: (feedId: string, forceRefresh?: boolean) => Promise<void>
  loadedFeedsRef: React.MutableRefObject<Set<string>>
}

export function useFeedPosts({
  setErrorMessage,
  postsByFeed: externalPostsByFeed,
  setPostsByFeed: externalSetPostsByFeed,
}: UseFeedPostsOptions): UseFeedPostsResult {
  // Internal state (only used if external state not provided)
  const [internalPostsByFeed, setInternalPostsByFeed] = useState<Record<string, FeedPost[]>>({})
  
  // Use external state if provided, otherwise use internal
  const postsByFeed = externalPostsByFeed ?? internalPostsByFeed
  const setPostsByFeed = externalSetPostsByFeed ?? setInternalPostsByFeed
  
  const [loadingFeedId, setLoadingFeedId] = useState<string | null>(null)
  const loadedFeedsRef = useRef<Set<string>>(new Set())
  const mountedRef = useRef(true)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const loadPostsForFeed = useCallback(async (feedId: string, forceRefresh = false) => {
    setLoadingFeedId(feedId)
    try {
      const response = await feedsApi.get(feedId, forceRefresh ? { _t: Date.now() } : undefined)
      if (!mountedRef.current) {
        return
      }
      const data = response.data ?? {}
      const mappedPosts = mapPosts(data.posts)
      
      // Only update posts if the API returned data, to avoid clearing optimistic updates
      // when the backend hasn't synced the new post yet
      setPostsByFeed((current) => {
        const existingPosts = current[feedId] ?? []
        
        // If API returned posts, use them (they should include the new post)
        if (mappedPosts.length > 0) {
          return { ...current, [feedId]: mappedPosts }
        }
        
        // If API returned empty but we have optimistic posts, keep them
        // This handles the case where backend is slow to sync
        if (existingPosts.length > 0) {
          console.log('[Feeds] API returned empty posts, preserving existing optimistic posts')
          return current
        }
        
        // Otherwise, set to empty (truly no posts)
        return { ...current, [feedId]: mappedPosts }
      })
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
  }, [setErrorMessage, setPostsByFeed])

  return {
    postsByFeed,
    setPostsByFeed,
    loadingFeedId,
    loadPostsForFeed,
    loadedFeedsRef,
  }
}
