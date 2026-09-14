// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useLingui } from '@lingui/react/macro'
import { FindEntityPage, toastAction, getErrorMessage } from '@mochi/web'
import { Rss } from 'lucide-react'
import endpoints from '@/api/endpoints'
import { feedsApi } from '@/api/feeds'
import { useFeedsStore } from '@/stores/feeds-store'

export const Route = createFileRoute('/_authenticated/find')({
  component: FindFeedsPage,
})

function FindFeedsPage() {
  const { t } = useLingui()
  const feeds = useFeedsStore((state) => state.feeds)
  const refresh = useFeedsStore((state) => state.refresh)

  // Recommendations query
  const {
    data: recommendationsData,
    isLoading: isLoadingRecommendations,
    isError: isRecommendationsError,
    error: recommendationsError,
    refetch: refetchRecommendations,
  } = useQuery({
    queryKey: ['feeds', 'recommendations'],
    queryFn: () => feedsApi.recommendations(),
    retry: false,
    refetchOnWindowFocus: false,
  })
  const recommendations = recommendationsData?.data?.feeds ?? []

  const subscribedFeedIds = useMemo(
    () =>
      new Set(
        feeds.flatMap((f) =>
          [f.id, f.fingerprint].filter((x): x is string => !!x)
        )
      ),
    [feeds]
  )

  const handleSubscribe = useCallback(
    async (
      feedId: string,
      entity: { id: string; name: string; location?: string; peer?: string }
    ) => {
      try {
        await toastAction(
          feedsApi.subscribe(feedId, entity.location, entity.peer),
          {
            loading: t`Subscribing...`,
            success: t`Subscribed`,
            error: (e) => getErrorMessage(e, t`Failed to subscribe`),
          }
        )
      } catch {
        return
      }
      await refresh()
    },
    [refresh, t]
  )

  // Resolve a pasted mochi:// share link to the feed's name via probe, so the
  // card shows the real feed rather than a raw entity id.
  const resolveUri = useCallback(async (url: string) => {
    const { data } = await feedsApi.probe({ url })
    if (!data?.id) return null
    return { ...data, location: data.server ?? '', peer: data.peer }
  }, [])

  return (
    <FindEntityPage
      resolveUri={resolveUri}
      onSubscribe={handleSubscribe}
      subscribedIds={subscribedFeedIds}
      entityClass='feed'
      searchEndpoint={endpoints.feeds.search}
      icon={Rss}
      iconClassName='bg-orange-500/10 text-orange-600'
      title={t`Find feeds`}
      placeholder={t`Search by name, ID, fingerprint, or URL...`}
      emptyMessage={t`No feeds found`}
      recommendations={recommendations}
      isLoadingRecommendations={isLoadingRecommendations}
      isRecommendationsError={isRecommendationsError}
      recommendationsError={recommendationsError}
      onRetryRecommendations={() => void refetchRecommendations()}
    />
  )
}
