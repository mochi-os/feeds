// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import type { Feed, FeedPost, FeedSummary, ViewFeedResponse } from '@/types'
import { useLingui } from '@lingui/react/macro'
import { mapFeedsToSummaries, mapPosts } from '@/api/adapters'
import { feedsApi } from '@/api/feeds'

export type UseFeedsOptions = {
  sort?: string
  /** Callback when posts are loaded from initial feed fetch */
  onPostsLoaded?: (postsByFeed: Record<string, FeedPost[]>) => void
  /** The feed list the route loader has just fetched, for the first load. */
  initial?: FeedsAnswer
}

/** An answer to the feed list request a route loader has already had. */
export interface FeedsAnswer {
  data: ViewFeedResponse['data']
}

// Answers already used. One stands in for a single load, the first after the
// navigation that fetched it; anything later, a return included, asks again.
const spent = new WeakSet<FeedsAnswer>()

function take(initial: FeedsAnswer | undefined, sort: string | undefined) {
  if (!initial || sort !== undefined || spent.has(initial)) return undefined
  spent.add(initial)
  return initial
}

export type UseFeedsResult = {
  feeds: FeedSummary[]
  setFeeds: React.Dispatch<React.SetStateAction<FeedSummary[]>>
  isLoadingFeeds: boolean
  error: Error | null
  refreshFeedsFromApi: () => Promise<void>
  /** Exposed for the subscription refresh path */
  mountedRef: React.MutableRefObject<boolean>
  userId?: string
  hasAi: boolean
}

/** Helper to group posts by feed ID */
const groupPostsByFeed = (posts: FeedPost[]): Record<string, FeedPost[]> => {
  return posts.reduce<Record<string, FeedPost[]>>((acc, post) => {
    acc[post.feedId] = acc[post.feedId] ? [...acc[post.feedId], post] : [post]
    return acc
  }, {})
}

export function useFeeds(options: UseFeedsOptions = {}): UseFeedsResult {
  const { t } = useLingui()
  const { onPostsLoaded, sort } = options
  // The answer the page mounted with. A later one, from the loader running
  // again under a mounted page, may be older than what the page has since
  // fetched, so it is not used.
  const [initial] = useState(options.initial)
  const [feeds, setFeeds] = useState<FeedSummary[]>([])
  const [isLoadingFeeds, setIsLoadingFeeds] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [userId, setUserId] = useState<string>()
  const [hasAi, setHasAi] = useState(false)
  const mountedRef = useRef(true)

  const refreshFeedsFromApi = useCallback(async () => {
    setIsLoadingFeeds(true)
    try {
      const response = take(initial, sort) ?? (await feedsApi.view({ sort }))
      if (!mountedRef.current) {
        return
      }
      const data = response.data ?? {}
      // Create a set of subscribed feed IDs from the feeds array
      const subscribedFeedIds = new Set(
        data.feeds?.map((feed) => feed.id) ?? []
      )
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

      // Set user id from response for WebSocket filtering
      if ('user_id' in data && typeof data.user_id === 'string') {
        setUserId(data.user_id)
      }
      if ('hasAi' in data) {
        setHasAi(!!data.hasAi)
      }

      // Map and group posts, then notify via callback
      // Only overwrite if the endpoint actually returned posts — the class-level
      // info endpoint returns no posts, and blindly calling setPostsByFeed({})
      // would wipe posts that were already loaded by per-feed fetches.
      const mappedPosts = mapPosts(data.posts)
      if (mappedPosts.length > 0) {
        const grouped = groupPostsByFeed(mappedPosts)
        onPostsLoaded?.(grouped)
      }

      setErrorMessage(null)
    } catch (_error) {
      if (!mountedRef.current) {
        return
      }
      setErrorMessage(
        t`Unable to sync with the feeds service. Showing cached data.`
      )
    } finally {
      if (mountedRef.current) {
        setIsLoadingFeeds(false)
      }
    }
  }, [onPostsLoaded, sort, initial, t])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const error = useMemo(() => {
    if (!errorMessage) return null
    return new Error(errorMessage)
  }, [errorMessage])

  return {
    feeds,
    setFeeds,
    isLoadingFeeds,
    error,
    refreshFeedsFromApi,
    mountedRef,
    userId,
    hasAi,
  }
}
