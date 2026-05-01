import { useCallback } from 'react'
import { useLingui } from '@lingui/react/macro'
import { feedsApi } from '@/api/feeds'
import type { FeedSummary } from '@/types'
import { toast } from '@mochi/web'

export type UseSubscriptionOptions = {
  feeds: FeedSummary[]
  setFeeds: React.Dispatch<React.SetStateAction<FeedSummary[]>>
  setErrorMessage: (message: string | null) => void
  refreshFeedsFromApi: () => Promise<void>
  mountedRef: React.MutableRefObject<boolean>
  onSubscribeSuccess?: (feedId: string, feedName: string) => void
}

export function useSubscription({
  feeds,
  setFeeds,
  setErrorMessage,
  refreshFeedsFromApi,
  mountedRef,
  onSubscribeSuccess,
}: UseSubscriptionOptions) {
  const { t } = useLingui()
  const toggleSubscription = useCallback(
    async (feedId: string, server?: string) => {
      // Validate feedId is not undefined or empty
      if (!feedId) {
        setErrorMessage("Failed to update subscription. Please try again.")
        return
      }

      const targetFeed = feeds.find((feed) => feed.id === feedId)

      // Allow subscription even if feed is not in feeds array (e.g., from search results)
      // Only block if feed exists and is owned by user
      if (targetFeed && targetFeed.isOwner) {
        return
      }

      const wasSubscribed = targetFeed?.isSubscribed ?? false
      const originalSubscribers = targetFeed?.subscribers ?? 0

      // Optimistic update - add feed to list if it doesn't exist
      setFeeds((current) => {
        const existingFeed = current.find((feed) => feed.id === feedId)
        if (existingFeed) {
          // Update existing feed
          return current.map((feed) => {
            if (feed.id !== feedId) return feed
            const isSubscribed = !feed.isSubscribed
            const subscribers = Math.max(
              0,
              originalSubscribers + (isSubscribed ? 1 : -1)
            )
            return { ...feed, isSubscribed, subscribers }
          })
        } else {
          // Add new feed from search results
          const isSubscribed = !wasSubscribed
          const subscribers = Math.max(0, originalSubscribers + (isSubscribed ? 1 : -1))
          return [
            ...current,
            {
              id: feedId,
              name: "Loading...",
              description: '',
              tags: [],
              owner: "Subscribed feed",
              subscribers,
              unreadPosts: 0,
              lastActive: Math.floor(Date.now() / 1000),
              isSubscribed,
              isOwner: false,
            },
          ]
        }
      })

      try {
        // Get server for remote feeds (from parameter or from feed data)
        const feedServer = server || targetFeed?.server

        if (wasSubscribed) {
          await feedsApi.unsubscribe(feedId)
        } else {
          await feedsApi.subscribe(feedId, feedServer)
        }

        if (!mountedRef.current) {
          return
        }

        // Response is minimal (success/fingerprint), so we trust our optimistic update
        // and trigger a background refresh to ensure consistency (e.g. subscriber counts)
        void refreshFeedsFromApi()

        setErrorMessage(null)

        // Show success toast notification
        const feedName = targetFeed?.name || 'Feed'
        if (wasSubscribed) {
          toast.success(t`Unsubscribed from ${feedName}`)
        } else {
          toast.success(t`Subscribed to ${feedName}`)
          // Notify caller of successful subscription (for interest suggestions)
          onSubscribeSuccess?.(feedId, feedName)
        }
      } catch {
        if (!mountedRef.current) {
          return
        }
        // Revert optimistic update on error
        setFeeds((current) =>
          current.map((feed) =>
            feed.id === feedId
              ? {
                ...feed,
                isSubscribed: wasSubscribed,
                subscribers: originalSubscribers,
              }
              : feed
          )
        )
        setErrorMessage("Failed to update subscription. Please try again.")

        // Show error toast notification
        const feedName = targetFeed?.name || 'Feed'
        if (wasSubscribed) {
          toast.error(t`Failed to unsubscribe from ${feedName}`)
        } else {
          toast.error(t`Failed to subscribe to ${feedName}`)
        }
      }
    },
    [t, feeds, setFeeds, setErrorMessage, refreshFeedsFromApi, mountedRef, onSubscribeSuccess]
  )

  return { toggleSubscription }
}
