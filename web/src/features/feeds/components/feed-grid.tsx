import type { FeedSummary } from '@/types'
import { FeedCard } from './feed-card'

type FeedGridProps = {
  feeds: FeedSummary[]
  onToggleSubscription?: (feedId: string, server?: string) => void
}

export function FeedGrid({ feeds, onToggleSubscription }: FeedGridProps) {
  if (feeds.length === 0) {
    return null
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {feeds.map((feed) => (
        <FeedCard
          key={feed.id}
          feed={feed}
          onToggleSubscription={onToggleSubscription}
        />
      ))}
    </div>
  )
}
