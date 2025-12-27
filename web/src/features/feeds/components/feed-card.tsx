import { Link } from '@tanstack/react-router'
import { Badge, Button, cn } from '@mochi/common'
import type { FeedSummary } from '@/types'
import { Clock, Rss, Users } from 'lucide-react'
import { STRINGS } from '../constants'
import { useFeedsStore } from '@/stores/feeds-store'

type FeedCardProps = {
  feed: FeedSummary
  onToggleSubscription?: (feedId: string, server?: string) => void
  simplified?: boolean
}

export function FeedCard({ feed, onToggleSubscription, simplified }: FeedCardProps) {
  const cacheRemoteFeed = useFeedsStore((state) => state.cacheRemoteFeed)
  const handleSubscriptionClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!feed.isOwner && onToggleSubscription) {
      onToggleSubscription(feed.id, feed.server)
    }
  }

  const getButtonLabel = () => {
    if (feed.isOwner) return STRINGS.DIRECTORY_BUTTON_OWNED
    if (feed.isSubscribed) return STRINGS.DIRECTORY_BUTTON_UNSUBSCRIBE
    return STRINGS.DIRECTORY_BUTTON_SUBSCRIBE
  }

  // Ensure feed.id doesn't have feeds/ prefix
  const cleanId = feed.id.replace(/^feeds\//, '')
  // Use fingerprint for local URL if available, otherwise fall back to ID
  const feedId = feed.fingerprint ?? cleanId

  const handleClick = () => {
    // Cache feed info for remote feed viewing
    cacheRemoteFeed({ ...feed, id: cleanId })
  }

  if (simplified) {
    const formattedFingerprint = feed.fingerprint?.match(/.{1,3}/g)?.join('-') ?? ''
    return (
      <Link
        to="/$feedId"
        params={{ feedId }}
        onClick={handleClick}
        className={cn(
          'group flex items-center gap-3 rounded-[8px] border p-4 transition-all duration-200',
          'hover:border-primary/50 hover:bg-accent/50 hover:shadow-sm'
        )}
      >
        <div
          className={cn(
            'shrink-0 rounded-[8px] bg-primary/10 p-2 transition-colors',
            'group-hover:bg-primary/20'
          )}
        >
          <Rss className="size-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{feed.name}</div>
          {formattedFingerprint && (
            <div className="truncate text-xs text-muted-foreground pl-2">{formattedFingerprint}</div>
          )}
        </div>
      </Link>
    )
  }

  return (
    <Link
      to="/$feedId"
      params={{ feedId }}
      onClick={handleClick}
      className={cn(
        'group block w-full overflow-hidden rounded-[8px] border p-4 text-start transition-all duration-200',
        'hover:border-primary/50 hover:bg-accent/50 hover:shadow-sm'
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <div
          className={cn(
            'shrink-0 rounded-[8px] bg-primary/10 p-2 transition-colors',
            'group-hover:bg-primary/20'
          )}
        >
          <Rss className="size-4 text-primary" />
        </div>
        <span className="min-w-0 flex-1 truncate text-base font-semibold">
          {feed.name}
        </span>
        {feed.isSubscribed && (
          <Badge variant="secondary" className="shrink-0 text-xs font-medium">
            {STRINGS.DIRECTORY_FOLLOWING_BADGE}
          </Badge>
        )}
      </div>

      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
        {feed.description}
      </p>

      {feed.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {feed.tags.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="text-xs font-normal transition-colors group-hover:border-primary/30"
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-4 flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex shrink-0 items-center gap-1">
            <Users className="size-3" />
            <span className="font-medium">{feed.subscribers}</span>
            <span>{STRINGS.DIRECTORY_SUBS_SUFFIX}</span>
          </span>
          <span className="flex min-w-0 items-center gap-1">
            <Clock className="size-3 shrink-0" />
            <span className="truncate">{feed.lastActive}</span>
          </span>
        </div>

        <Button
          type="button"
          size="sm"
          variant={feed.isSubscribed ? 'outline' : 'secondary'}
          disabled={feed.isOwner}
          onClick={handleSubscriptionClick}
          className="shrink-0 text-xs transition-all duration-200 hover:scale-105"
        >
          {getButtonLabel()}
        </Button>
      </div>
    </Link>
  )
}
