import { useCallback, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Rss } from 'lucide-react'
import { FindEntityPage } from '@mochi/common'
import { useFeedsStore } from '@/stores/feeds-store'
import { feedsApi } from '@/api/feeds'
import endpoints from '@/api/endpoints'
import { InterestSuggestionsDialog } from '@/features/feeds/components/interest-suggestions-dialog'

export const Route = createFileRoute('/_authenticated/find')({
  component: FindFeedsPage,
})

function FindFeedsPage() {
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

  const handleSubscribe = useCallback(async (feedId: string, entity: { id: string; name: string }) => {
    await feedsApi.subscribe(feedId)
    await refresh()
    try {
      const suggestions = await feedsApi.suggestInterests(feedId)
      if (suggestions && suggestions.length > 0) {
        setInterestSuggestions({ feedId, feedName: entity.name, suggestions })
      }
    } catch {
      // Suggestions are optional
    }
  }, [refresh])

  return (
    <>
      <FindEntityPage
        onSubscribe={handleSubscribe}
        subscribedIds={subscribedFeedIds}
        entityClass="feed"
        searchEndpoint={endpoints.feeds.search}
        icon={Rss}
        iconClassName="bg-orange-500/10 text-orange-600"
        title="Find feeds"
        placeholder="Search by name, ID, fingerprint, or URL..."
        emptyMessage="No feeds found"
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
