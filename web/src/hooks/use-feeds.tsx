import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { GeneralError } from '@mochi/common'
import { mapFeedsToSummaries, mapPosts } from '@/api/adapters'
import { feedsApi } from '@/api/feeds'
import { STRINGS } from '@/features/feeds/constants'
import type { Feed, FeedPost, FeedSummary } from '@/types'

export type UseFeedsOptions = {
  sort?: string
  /** Callback when posts are loaded from initial feed fetch */
  onPostsLoaded?: (postsByFeed: Record<string, FeedPost[]>) => void
}

export type UseFeedsResult = {
  feeds: FeedSummary[]
  setFeeds: React.Dispatch<React.SetStateAction<FeedSummary[]>>
  isLoadingFeeds: boolean
  errorMessage: string | null
  ErrorComponent: React.ReactNode
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>
  refreshFeedsFromApi: () => Promise<void>
  selectedFeedId: string | null
  setSelectedFeedId: React.Dispatch<React.SetStateAction<string | null>>
  /** Exposed for useSubscription integration */
  mountedRef: React.MutableRefObject<boolean>
  userId?: string
}

/** Helper to group posts by feed ID */
const groupPostsByFeed = (posts: FeedPost[]): Record<string, FeedPost[]> => {
  return posts.reduce<Record<string, FeedPost[]>>((acc, post) => {
    acc[post.feedId] = acc[post.feedId] ? [...acc[post.feedId], post] : [post]
    return acc
  }, {})
}

export function useFeeds(options: UseFeedsOptions = {}): UseFeedsResult {
  const { onPostsLoaded, sort } = options
  const [feeds, setFeeds] = useState<FeedSummary[]>([])
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null)
  const [isLoadingFeeds, setIsLoadingFeeds] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [userId, setUserId] = useState<string>()
  const mountedRef = useRef(true)

  const refreshFeedsFromApi = useCallback(async () => {
    setIsLoadingFeeds(true)
    try {
      const response = await feedsApi.view({ sort })
      if (!mountedRef.current) {
        return
      }
      const data = response.data ?? {}
      // Create a set of subscribed feed IDs from the feeds array
      const subscribedFeedIds = new Set(data.feeds?.map((feed) => feed.id) ?? [])
      const mappedFeeds = mapFeedsToSummaries(data.feeds, subscribedFeedIds)
      // Only map feed if it has an id (it might be a minimal object with only name)
      const currentFeedSummary =
        data.feed && 'id' in data.feed && data.feed.id
          ? mapFeedsToSummaries([data.feed as Feed], subscribedFeedIds)[0]
          : undefined
      const dedupedFeeds = [
        ...(currentFeedSummary ? [currentFeedSummary] : []),
        ...mappedFeeds,
      ].reduce<FeedSummary[]>((acc, feed) => {
        if (!acc.some((item) => item.id === feed.id)) {
          acc.push(feed)
        }
        return acc
      }, [])
      setFeeds(dedupedFeeds)
      setSelectedFeedId((current) => {
        if (current && dedupedFeeds.some((feed) => feed.id === current)) {
          return current
        }
        return dedupedFeeds[0]?.id ?? null
      })

      // Set user id from response for WebSocket filtering
      if ('user_id' in data && typeof data.user_id === 'string') {
        setUserId(data.user_id)
      }
      
      // Map and group posts, then notify via callback
      const mappedPosts = mapPosts(data.posts)
      const grouped = groupPostsByFeed(mappedPosts)
      onPostsLoaded?.(grouped)
      
      setErrorMessage(null)
    } catch (error) {
      if (!mountedRef.current) {
        return
      }
      console.error('[Feeds] Failed to load feeds', error)
      setErrorMessage(STRINGS.ERROR_SYNC_FAILED)
    } finally {
      if (mountedRef.current) {
        setIsLoadingFeeds(false)
      }
    }
  }, [onPostsLoaded, sort])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const ErrorComponent = useMemo(() => {
    if (!errorMessage) return null
    return (
      <GeneralError
        error={new Error(errorMessage)}
        reset={refreshFeedsFromApi}
        minimal
      />
    )
  }, [errorMessage, refreshFeedsFromApi])

  return {
    feeds,
    setFeeds,
    isLoadingFeeds,
    errorMessage,
    ErrorComponent,
    setErrorMessage,
    refreshFeedsFromApi,
    selectedFeedId,
    setSelectedFeedId,
    mountedRef,
    userId,
  }
}
