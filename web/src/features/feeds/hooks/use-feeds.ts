import { useCallback, useRef, useState } from 'react'
import feedsApi from '@/api/feeds'
import { mapFeedsToSummaries } from '../api/adapters'
import { STRINGS } from '../constants'
import type { FeedSummary } from '../types'
import type { Feed } from '@/api/types/feeds'

export type UseFeedsResult = {
  feeds: FeedSummary[]
  setFeeds: React.Dispatch<React.SetStateAction<FeedSummary[]>>
  isLoadingFeeds: boolean
  errorMessage: string | null
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>
  refreshFeedsFromApi: () => Promise<void>
  selectedFeedId: string | null
  setSelectedFeedId: React.Dispatch<React.SetStateAction<string | null>>
}

export function useFeeds(): UseFeedsResult {
  const [feeds, setFeeds] = useState<FeedSummary[]>([])
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null)
  const [isLoadingFeeds, setIsLoadingFeeds] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const refreshFeedsFromApi = useCallback(async () => {
    setIsLoadingFeeds(true)
    try {
      const response = await feedsApi.view()
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
  }, [])

  return {
    feeds,
    setFeeds,
    isLoadingFeeds,
    errorMessage,
    setErrorMessage,
    refreshFeedsFromApi,
    selectedFeedId,
    setSelectedFeedId,
  }
}
