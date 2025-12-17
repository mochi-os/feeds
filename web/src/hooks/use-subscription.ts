import { useCallback } from 'react'
import feedsApi from '@/api/feeds'
import { STRINGS } from '@/features/feeds/constants'
import type { FeedSummary } from '@/types'
import { toast } from 'sonner'

export type UseSubscriptionOptions = {
  feeds: FeedSummary[]
  setFeeds: React.Dispatch<React.SetStateAction<FeedSummary[]>>
  setErrorMessage: (message: string | null) => void
  refreshFeedsFromApi: () => Promise<void>
  mountedRef: React.MutableRefObject<boolean>
}

export function useSubscription({
  feeds,
  setFeeds,
  setErrorMessage,
  refreshFeedsFromApi,
  mountedRef,
}: UseSubscriptionOptions) {
  const toggleSubscription = useCallback(
    async (feedId: string, server?: string) => {
      console.log('[Feeds] toggleSubscription called', { feedId, server, feedsCount: feeds.length })

      // Validate feedId is not undefined or empty
      if (!feedId) {
        console.error('[Feeds] Cannot toggle subscription: feedId is undefined or empty')
        return
      }

      const targetFeed = feeds.find((feed) => feed.id === feedId)
      console.log('[Feeds] Target feed found:', {
        found: !!targetFeed,
        feedId,
        targetFeed: targetFeed ? {
          id: targetFeed.id,
          name: targetFeed.name,
          isOwner: targetFeed.isOwner,
          isSubscribed: targetFeed.isSubscribed,
        } : null,
      })

      // Allow subscription even if feed is not in feeds array (e.g., from search results)
      // Only block if feed exists and is owned by user
      if (targetFeed && targetFeed.isOwner) {
        console.log('[Feeds] Subscription blocked: feed is owned by user', { feedId })
        return
      }

      const wasSubscribed = targetFeed?.isSubscribed ?? false
      const originalSubscribers = targetFeed?.subscribers ?? 0

      console.log('[Feeds] Subscription state:', {
        feedId,
        wasSubscribed,
        originalSubscribers,
        willSubscribe: !wasSubscribed,
      })

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
          console.log('[Feeds] Adding new feed to list (from search results)', {
            feedId,
            isSubscribed,
            subscribers,
          })
          return [
            ...current,
            {
              id: feedId,
              name: STRINGS.LOADING_PLACEHOLDER,
              description: '',
              tags: [],
              owner: STRINGS.AUTHOR_SUBSCRIBED_FEED,
              subscribers,
              unreadPosts: 0,
              lastActive: STRINGS.RECENTLY_ACTIVE,
              isSubscribed,
              isOwner: false,
            },
          ]
        }
      })

      try {
        // Get server for remote feeds (from parameter or from feed data)
        const feedServer = server || targetFeed?.server

        console.log('[Feeds] Calling API:', {
          action: wasSubscribed ? 'unsubscribe' : 'subscribe',
          feedId,
          server: feedServer,
        })

        const response = wasSubscribed
          ? await feedsApi.unsubscribe(feedId)
          : await feedsApi.subscribe(feedId, feedServer)

        console.log('[Feeds] API response received:', {
          action: wasSubscribed ? 'unsubscribe' : 'subscribe',
          response,
        })

        if (!mountedRef.current) {
          return
        }

        // Response is minimal (success/fingerprint), so we trust our optimistic update
        // and trigger a background refresh to ensure consistency (e.g. subscriber counts)
        void refreshFeedsFromApi()

        setErrorMessage(null)
        console.log('[Feeds] Subscription toggle completed successfully', {
          feedId,
          wasSubscribed,
          nowSubscribed: !wasSubscribed,
        })

        // Show success toast notification
        const feedName = targetFeed?.name || 'Feed'
        if (wasSubscribed) {
          toast.success(STRINGS.TOAST_UNSUBSCRIBED(feedName))
        } else {
          toast.success(STRINGS.TOAST_SUBSCRIBED(feedName))
        }
      } catch (error) {
        if (!mountedRef.current) {
          return
        }
        console.error('[Feeds] Failed to toggle subscription', {
          feedId,
          error,
          wasSubscribed,
          originalSubscribers,
        })
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
        setErrorMessage(STRINGS.ERROR_SUBSCRIPTION_FAILED)

        // Show error toast notification
        const feedName = targetFeed?.name || 'Feed'
        if (wasSubscribed) {
          toast.error(STRINGS.TOAST_UNSUBSCRIBE_FAILED(feedName))
        } else {
          toast.error(STRINGS.TOAST_SUBSCRIBE_FAILED(feedName))
        }
      }
    },
    [feeds, setFeeds, setErrorMessage, refreshFeedsFromApi, mountedRef]
  )

  return { toggleSubscription }
}
