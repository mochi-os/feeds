// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { Feed, FeedPost, FeedSummary, ViewFeedResponse } from '@/types'
import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { toast, getErrorMessage, type MapTiles } from '@mochi/web'
import { create, type StoreApi } from 'zustand'
import { mapFeedsToSummaries, mapPosts } from '@/api/adapters'
import { feedsApi } from '@/api/feeds'

type FeedsState = {
  feeds: FeedSummary[]
  postsByFeed: Record<string, FeedPost[]>
  isLoading: boolean
  error: string | null
  defaultSort: string
  /** The server's map tile source, from the info response. */
  tiles: MapTiles | null
  /** Whether the roster has been fetched, or seeded, since the app started. */
  loaded: boolean
  /**
   * Fetch the roster again because something changed. A request already in
   * flight may have been answered before the change, so this waits for it and
   * then asks again.
   */
  refresh: () => Promise<void>
  /** Load the roster, sharing a request already in flight rather than asking twice. */
  load: () => Promise<void>
  /**
   * Adopt a roster a route loader has already fetched, when nothing has been
   * loaded or asked for yet: anything already held or on its way is as new
   * or newer, and has seen changes the seed has not.
   */
  seed: (data: ViewFeedResponse['data']) => void
  adjustUnread: (feedId: string, delta: number) => void
  setUnread: (feedId: string, count: number) => void
  setDefaultSort: (sort: string) => Promise<void>
  setFeedSort: (feedId: string, sort: string) => Promise<void>
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

type SetState = StoreApi<FeedsState>['setState']

// Hold the roster an answer to the info request carries.
const adopt = (set: SetState, data: ViewFeedResponse['data']) => {
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

  const defaultSort =
    data && typeof data === 'object' && 'settings' in data
      ? ((data as { settings?: { sort?: string } }).settings?.sort ?? '')
      : ''

  set({
    feeds: dedupedFeeds,
    postsByFeed,
    defaultSort,
    tiles: data.tiles ?? null,
    error: null,
    loaded: true,
  })
}

// The roster request in flight, which a plain load shares.
let inflight: Promise<void> | null = null

const fetchRoster = (set: SetState): Promise<void> => {
  set({ isLoading: true, error: null })
  const request = (async () => {
    try {
      const response = await feedsApi.view()
      adopt(set, response.data ?? {})
      set({ isLoading: false })
    } catch {
      set({ error: i18n._(msg`Failed to load feeds`), isLoading: false })
    }
  })().finally(() => {
    if (inflight === request) inflight = null
  })
  inflight = request
  return request
}

export const useFeedsStore = create<FeedsState>()((set, get) => ({
  feeds: [],
  postsByFeed: {},
  isLoading: false,
  error: null,
  defaultSort: '',
  tiles: null,
  loaded: false,
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
    // Something changed: a request already in flight may predate it, so wait
    // for that one, then ask again.
    while (inflight) await inflight
    return fetchRoster(set)
  },

  load: () => inflight ?? fetchRoster(set),

  seed: (data) => {
    if (!get().loaded && !inflight) adopt(set, data)
  },

  setDefaultSort: async (sort: string) => {
    set({ defaultSort: sort })
    try {
      await feedsApi.setDefaultSort(sort)
    } catch (error) {
      // Keep the optimistic value for this session, but tell the user the
      // preference did not persist — otherwise it silently reverts on the
      // next visit.
      toast.error(
        getErrorMessage(error, i18n._(msg`Failed to save sort order`))
      )
    }
  },

  setFeedSort: async (feedId: string, sort: string) => {
    set((state) => ({
      feeds: state.feeds.map((f) =>
        f.id === feedId || f.fingerprint === feedId ? { ...f, sort } : f
      ),
    }))
    try {
      await feedsApi.setFeedSort(feedId, sort)
    } catch (error) {
      // See note in setDefaultSort.
      toast.error(
        getErrorMessage(error, i18n._(msg`Failed to save sort order`))
      )
    }
  },
}))
