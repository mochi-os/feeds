import { Loader2, Rss, Users, Clock } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  ScrollArea,
  Badge,
  Button,
  cn,
} from '@mochi/common'
import { type FeedSummary } from '../types'
import { STRINGS } from '../constants'

// ============================================================================
// Types
// ============================================================================

type FeedDirectoryProps = {
  feeds: FeedSummary[]
  searchResults: FeedSummary[]
  isSearching: boolean
  searchTerm: string
  selectedFeedId: string | null
  onSelectFeed: (feedId: string) => void
  onToggleSubscription: (feedId: string) => void
}

type FeedListItemProps = {
  feed: FeedSummary
  isActive: boolean
  onSelect: (feedId: string) => void
  onToggleSubscription: (feedId: string) => void
}

// ============================================================================
// FeedListItem Component
// ============================================================================

function FeedListItem({
  feed,
  isActive,
  onSelect,
  onToggleSubscription,
}: FeedListItemProps) {
  const handleActivate = () => onSelect(feed.id)

  const handleSubscriptionClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()

    if (!feed.isOwner && onToggleSubscription) {
      onToggleSubscription(feed.id)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleActivate()
    }
  }

  const getButtonLabel = () => {
    if (feed.isOwner) return STRINGS.DIRECTORY_BUTTON_OWNED
    if (feed.isSubscribed) return STRINGS.DIRECTORY_BUTTON_UNSUBSCRIBE
    return STRINGS.DIRECTORY_BUTTON_SUBSCRIBE
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      className={cn(
        'group w-full overflow-hidden rounded-xl border p-3 text-start transition-all duration-200',
        'hover:border-primary/50 hover:bg-accent/50 hover:shadow-sm',
        isActive && 'border-primary bg-primary/5 shadow-sm'
      )}
    >
      {/* Header Row: Icon + Name + Following Badge */}
      <div className="flex min-w-0 items-center gap-2">
        <div
          className={cn(
            'shrink-0 rounded-lg bg-primary/10 p-1.5 transition-colors',
            'group-hover:bg-primary/20'
          )}
        >
          <Rss className="size-3.5 text-primary" />
        </div>

        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {feed.name}
        </span>

        {feed.isSubscribed && (
          <Badge
            variant="secondary"
            className="shrink-0 text-[10px] font-medium"
          >
            {STRINGS.DIRECTORY_FOLLOWING_BADGE}
          </Badge>
        )}
      </div>

      {/* Description */}
      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        {feed.description}
      </p>

      {/* Tags */}
      {feed.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {feed.tags.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="text-[10px] font-normal transition-colors group-hover:border-primary/30"
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Footer Row: Stats + Subscribe Button */}
      <div className="mt-3 flex min-w-0 items-center justify-between gap-2">
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
    </div>
  )
}

// ============================================================================
// EmptyState Component
// ============================================================================

function EmptyState({ isSearching }: { isSearching: boolean }) {
  if (isSearching) {
    return (
      <div className="flex flex-col items-center justify-center space-y-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <p>{STRINGS.DIRECTORY_SEARCHING}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center space-y-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      <p>{STRINGS.DIRECTORY_NO_RESULTS}</p>
      <p className="text-xs">{STRINGS.DIRECTORY_NO_RESULTS_HINT}</p>
    </div>
  )
}

// ============================================================================
// FeedDirectory Component
// ============================================================================

export function FeedDirectory({
  feeds,
  searchResults,
  isSearching,
  searchTerm,
  selectedFeedId,
  onSelectFeed,
  onToggleSubscription,
}: FeedDirectoryProps) {
  // Determine displayed feeds
  const isUsingSearchResults = searchTerm.trim().length > 0
  const displayedFeeds = isUsingSearchResults
    ? searchResults
    : feeds.filter((feed) => {
        if (!searchTerm.trim()) return true
        const term = searchTerm.toLowerCase()
        return (
          feed.name.toLowerCase().includes(term) ||
          feed.description.toLowerCase().includes(term) ||
          feed.tags.some((tag) => tag.toLowerCase().includes(term))
        )
      })

  return (
    <Card className="flex h-full min-w-0 flex-col overflow-hidden shadow-md">
      <CardHeader className="shrink-0 space-y-3 border-b pb-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold">{STRINGS.DIRECTORY_TITLE}</p>
          <p className="text-xs text-muted-foreground">{STRINGS.DIRECTORY_SUBTITLE}</p>
        </div>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full">
          <div className="space-y-2 p-3">
            {isSearching || displayedFeeds.length === 0 ? (
              <EmptyState isSearching={isSearching} />
            ) : (
              displayedFeeds.map((feed) => (
                <FeedListItem
                  key={feed.id}
                  feed={feed}
                  isActive={feed.id === selectedFeedId}
                  onSelect={onSelectFeed}
                  onToggleSubscription={onToggleSubscription}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
