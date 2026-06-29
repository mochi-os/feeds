// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useCallback } from 'react'
import { useLingui } from '@lingui/react/macro'
import { feedsApi } from '@/api/feeds'
import type { FeedSummary } from '@/types'
import { toastAction, getErrorMessage, callWithServerFallback } from '@mochi/web'

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
        setErrorMessage(t`Failed to update subscription. Please try again.`)
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
              name: t`Loading...`,
              description: '',
              tags: [],
              owner: t`Subscribed feed`,
              subscribers,
              unreadPosts: 0,
              lastActive: Math.floor(Date.now() / 1000),
              isSubscribed,
              isOwner: false,
            },
          ]
        }
      })

      const feedName = targetFeed?.name || t`Feed`

      try {
        const feedServer = server || targetFeed?.server

        if (wasSubscribed) {
          await toastAction(feedsApi.unsubscribe(feedId), {
            loading: t`Unsubscribing from ${feedName}...`,
            success: t`Unsubscribed from ${feedName}`,
            error: (e) =>
              getErrorMessage(e, t`Failed to unsubscribe from ${feedName}`),
          })
        } else {
          await toastAction(
            callWithServerFallback(
              (server) => feedsApi.subscribe(feedId, server),
              feedServer,
            ),
            {
            loading: t`Subscribing to ${feedName}...`,
            success: t`Subscribed to ${feedName}`,
            error: (e) =>
              getErrorMessage(e, t`Failed to subscribe to ${feedName}`),
          })
        }

        if (!mountedRef.current) {
          return
        }

        void refreshFeedsFromApi()
        setErrorMessage(null)

        if (!wasSubscribed) {
          onSubscribeSuccess?.(feedId, feedName)
        }
      } catch {
        if (!mountedRef.current) {
          return
        }
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
        setErrorMessage(t`Failed to update subscription. Please try again.`)
      }
    },
    [t, feeds, setFeeds, setErrorMessage, refreshFeedsFromApi, mountedRef, onSubscribeSuccess]
  )

  return { toggleSubscription }
}
