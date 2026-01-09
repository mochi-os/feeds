import { create } from 'zustand'
import { mapFeedsToSummaries, mapPosts } from '@/api/adapters'
import feedsApi from '@/api/feeds'
import type { Feed, FeedPost, FeedSummary } from '@/types'

type FeedsState = {
  feeds: FeedSummary[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
  // Cache for remote feeds (from search results)
  remoteFeedsCache: Record<string, FeedSummary>
  cacheRemoteFeed: (feed: FeedSummary) => void
  getCachedFeed: (feedId: string) => FeedSummary | undefined
}

const groupPostsByFeed = (posts: FeedPost[]): Record<string, FeedPost[]> => {
  return posts.reduce<Record<string, FeedPost[]>>((acc, post) => {
    acc[post.feedId] = acc[post.feedId] ? [...acc[post.feedId], post] : [post]
    return acc
  }, {})
}

export const useFeedsStore = create<FeedsState>()((set, get) => ({
  feeds: [],
  isLoading: false,
  error: null,
  remoteFeedsCache: {},

  cacheRemoteFeed: (feed: FeedSummary) => {
    set((state) => ({
      remoteFeedsCache: { ...state.remoteFeedsCache, [feed.id]: feed },
    }))
  },

  getCachedFeed: (feedId: string) => {
    return get().remoteFeedsCache[feedId]
  },

  refresh: async () => {
    // Prevent concurrent refreshes
    if (get().isLoading) return

    console.log('[FeedsStore] Starting refresh...')
    set({ isLoading: true, error: null })
    try {
      const response = await feedsApi.view()
      console.log('[FeedsStore] API response:', response)
      const data = response.data ?? {}
      console.log('[FeedsStore] Response data:', data)
      console.log('[FeedsStore] data.feeds:', data.feeds)
      console.log('[FeedsStore] data.feed:', data.feed)
      
      const subscribedFeedIds = new Set(data.feeds?.map((feed) => feed.id) ?? [])
      console.log('[FeedsStore] subscribedFeedIds:', subscribedFeedIds)
      
      const mappedFeeds = mapFeedsToSummaries(data.feeds, subscribedFeedIds)
      console.log('[FeedsStore] mappedFeeds:', mappedFeeds)
      
      const currentFeedSummary =
        data.feed && 'id' in data.feed && data.feed.id
          ? mapFeedsToSummaries([data.feed as Feed], subscribedFeedIds)[0]
          : undefined
      console.log('[FeedsStore] currentFeedSummary:', currentFeedSummary)
      
      const dedupedFeeds = [
        ...(currentFeedSummary ? [currentFeedSummary] : []),
        ...mappedFeeds,
      ].reduce<FeedSummary[]>((acc, feed) => {
        if (!acc.some((item) => item.id === feed.id)) {
          acc.push(feed)
        }
        return acc
      }, [])
      console.log('[FeedsStore] dedupedFeeds:', dedupedFeeds)
      console.log('[FeedsStore] Setting feeds to store with count:', dedupedFeeds.length)
      
      set({ feeds: dedupedFeeds, isLoading: false })
    } catch (error) {
      console.error('[FeedsStore] Failed to load feeds', error)
      set({ error: 'Failed to load feeds', isLoading: false })
    }
  },
}))

// Helper to get posts grouped by feed (for components that need it)
export async function fetchPostsByFeed(): Promise<Record<string, FeedPost[]>> {
  try {
    const response = await feedsApi.view()
    const data = response.data ?? {}
    const mappedPosts = mapPosts(data.posts)
    return groupPostsByFeed(mappedPosts)
  } catch {
    return {}
  }
}
