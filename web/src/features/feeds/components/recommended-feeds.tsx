import { useEffect, useState } from 'react'
import { Button, Skeleton, toast, getErrorMessage } from '@mochi/common'
import { Rss, Loader2 } from 'lucide-react'
import { feedsApi, type RecommendedFeed } from '@/api/feeds'

interface RecommendedFeedsProps {
  subscribedIds: Set<string>
  onSubscribe: () => void
}

export function RecommendedFeeds({ subscribedIds, onSubscribe }: RecommendedFeedsProps) {
  const [recommendations, setRecommendations] = useState<RecommendedFeed[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [pendingId, setPendingId] = useState<string | null>(null)

  useEffect(() => {
    const fetchRecommendations = async () => {
      try {
        const response = await feedsApi.recommendations()
        setRecommendations(response.data?.feeds ?? [])
      } catch {
        // Silently fail for recommendations
      } finally {
        setIsLoading(false)
      }
    }

    void fetchRecommendations()
  }, [])

  const handleSubscribe = async (feed: RecommendedFeed) => {
    setPendingId(feed.id)
    try {
      await feedsApi.subscribe(feed.id)
      onSubscribe()
      toast.success(`Subscribed to ${feed.name}`)
      setRecommendations((prev) => prev.filter((f) => f.id !== feed.id))
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to subscribe'))
    } finally {
      setPendingId(null)
    }
  }

  // Filter out already subscribed
  const filteredRecommendations = recommendations.filter(
    (rec) => !subscribedIds.has(rec.id) && !subscribedIds.has(rec.fingerprint)
  )

  if (isLoading) {
    return (
      <>
        <hr className="my-6 w-full max-w-md border-t" />
        <div className="w-full max-w-md">
          <Skeleton className="h-4 w-32 mb-3" />
          <div className="divide-border divide-y rounded-lg border">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-8 w-8 rounded-md" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-8 w-20" />
              </div>
            ))}
          </div>
        </div>
      </>
    )
  }

  if (filteredRecommendations.length === 0) {
    return null
  }

  return (
    <>
      <hr className="my-6 w-full max-w-md border-t" />
      <div className="w-full max-w-md">
        <p className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wide">
          Recommended feeds
        </p>
        <div className="divide-border divide-y rounded-lg border text-left">
          {filteredRecommendations.map((feed) => {
            const isPending = pendingId === feed.id

            return (
              <div
                key={feed.id}
                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-orange-500/10">
                    <Rss className="h-4 w-4 text-orange-600" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{feed.name}</span>
                    {feed.blurb && (
                      <span className="text-muted-foreground truncate text-xs">
                        {feed.blurb}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleSubscribe(feed)}
                  disabled={isPending}
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Subscribe'
                  )}
                </Button>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
