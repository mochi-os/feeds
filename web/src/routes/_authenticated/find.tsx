// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useCallback, useMemo, useState } from 'react'
import { useLingui } from '@lingui/react/macro'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Rss } from 'lucide-react'
import { FindEntityPage, toastAction, getErrorMessage } from '@mochi/web'
import { useFeedsStore } from '@/stores/feeds-store'
import { feedsApi } from '@/api/feeds'
import endpoints from '@/api/endpoints'
import { InterestSuggestionsDialog } from '@/features/feeds/components/interest-suggestions-dialog'

export const Route = createFileRoute('/_authenticated/find')({
  component: FindFeedsPage,
})

function FindFeedsPage() {
  const { t } = useLingui()
  const feeds = useFeedsStore((state) => state.feeds)
  const refresh = useFeedsStore((state) => state.refresh)
  const [interestSuggestions, setInterestSuggestions] = useState<{
    feedId: string
    feedName: string
    suggestions: { qid: string; label: string; count: number }[]
  } | null>(null)

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
    () => new Set(
      feeds.flatMap((f) => [f.id, f.fingerprint].filter((x): x is string => !!x))
    ),
    [feeds]
  )

  const handleSubscribe = useCallback(async (feedId: string, entity: { id: string; name: string; location?: string; peer?: string }) => {
    try {
      await toastAction(feedsApi.subscribe(feedId, entity.location, entity.peer), {
        loading: t`Subscribing...`,
        success: t`Subscribed`,
        error: (e) => getErrorMessage(e, t`Failed to subscribe`),
      })
    } catch {
      return
    }
    await refresh()
    try {
      const suggestions = await feedsApi.suggestInterests(feedId)
      if (suggestions && suggestions.length > 0) {
        setInterestSuggestions({ feedId, feedName: entity.name, suggestions })
      }
    } catch {
      // Suggestions are optional
    }
  }, [refresh, t])

  // Resolve a pasted mochi:// share link to the feed's name via probe, so the
  // card shows the real feed rather than a raw entity id.
  const resolveUri = useCallback(async (url: string) => {
    const { data } = await feedsApi.probe({ url })
    if (!data?.id) return null
    return { ...data, location: data.server ?? '', peer: data.peer }
  }, [])

  return (
    <>
      <FindEntityPage
        resolveUri={resolveUri}
        onSubscribe={handleSubscribe}
        subscribedIds={subscribedFeedIds}
        entityClass="feed"
        searchEndpoint={endpoints.feeds.search}
        icon={Rss}
        iconClassName="bg-orange-500/10 text-orange-600"
        title={t`Find feeds`}
        placeholder={t`Search by name, ID, fingerprint, or URL...`}
        emptyMessage={t`No feeds found`}
        recommendations={recommendations}
        isLoadingRecommendations={isLoadingRecommendations}
        isRecommendationsError={isRecommendationsError}
        recommendationsError={recommendationsError}
        onRetryRecommendations={() => void refetchRecommendations()}
      />
      {interestSuggestions && (
        <InterestSuggestionsDialog
          open={!!interestSuggestions}
          onOpenChange={(open) => { if (!open) setInterestSuggestions(null) }}
          feedId={interestSuggestions.feedId}
          feedName={interestSuggestions.feedName}
          suggestions={interestSuggestions.suggestions}
        />
      )}
    </>
  )
}
