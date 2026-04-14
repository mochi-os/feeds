import { create } from 'zustand'
import { mapFeedsToSummaries, mapPosts } from '@/api/adapters'
import { feedsApi } from '@/api/feeds'
import type { Feed, FeedPost, FeedSummary } from '@/types'

type FeedsState = {
  feeds: FeedSummary[]
  postsByFeed: Record<string, FeedPost[]>
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
  adjustUnread: (feedId: string, delta: number) => void
  setUnread: (feedId: string, count: number) => void
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

export const useFeedsStore = create<FeedsState>()((set, get, api) => ({
  feeds: [],
  postsByFeed: {},
  isLoading: false,
  error: null,
  remoteFeedsCache: {},

  adjustUnread: (feedId: string, delta: number) => {
    set((state) => ({
      feeds: state.feeds.map((f) =>
        f.id === feedId || f.fingerprint === feedId
          ? { ...f, unreadPosts: Math.max(0, f.unreadPosts + delta) }
          : f
      ),
    }))
  },

  setUnread: (feedId: string, count: number) => {
    set((state) => ({
      feeds: state.feeds.map((f) =>
        f.id === feedId || f.fingerprint === feedId
          ? { ...f, unreadPosts: Math.max(0, count) }
          : f
      ),
    }))
  },

  cacheRemoteFeed: (feed: FeedSummary) => {
    set((state) => ({
      remoteFeedsCache: { ...state.remoteFeedsCache, [feed.id]: feed },
    }))
  },

  getCachedFeed: (feedId: string) => {
    return get().remoteFeedsCache[feedId]
  },

  refresh: async () => {
    // If already loading, wait for the in-flight refresh to finish, then re-fetch
    if (get().isLoading) {
      await new Promise<void>((resolve) => {
        const unsub = api.subscribe((state) => {
          if (!state.isLoading) {
            unsub()
            resolve()
          }
        })
        // Resolve immediately if loading already finished before subscribe was set up
        if (!get().isLoading) {
          unsub()
          resolve()
        }
      })
      return get().refresh()
    }

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

      // Map and group posts
      const mappedPosts = mapPosts(data.posts)
      const postsByFeed = groupPostsByFeed(mappedPosts)

      set({ feeds: dedupedFeeds, postsByFeed, isLoading: false })
    } catch {
      set({ error: 'Failed to load feeds', isLoading: false })
    }
  },
}))
