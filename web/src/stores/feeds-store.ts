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

    set({ isLoading: true, error: null })
    try {
      const response = await feedsApi.view()
      const data = response.data ?? {}
      const subscribedFeedIds = new Set(data.feeds?.map((feed) => feed.id) ?? [])
      const mappedFeeds = mapFeedsToSummaries(data.feeds, subscribedFeedIds)
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
