import { useEffect, useState, useRef } from 'react'
import { Search as SearchIcon, Loader2, Rss, Users, Clock } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  Input,
  ScrollArea,
  Badge,
  Button,
  cn,
} from '@mochi/common'
import { type FeedSummary } from '../types'
import feedsApi from '@/api/feeds'
import type { DirectoryEntry } from '@/api/types/feeds'

// ============================================================================
// Constants
// ============================================================================

const SEARCH_DEBOUNCE_MS = 500

const STRINGS = {
  TITLE: 'Feeds directory',
  SUBTITLE: 'Search, subscribe, or jump into any space.',
  SEARCH_PLACEHOLDER: 'Search feeds or tags',
  SEARCHING: 'Searching feeds...',
  NO_RESULTS: 'No feeds match that search.',
  NO_RESULTS_HINT: 'Try another keyword or create a feed.',
  SUBSCRIBED_LABEL: 'Subscribe to get updates from this feed',
  RECENTLY_ACTIVE: 'Recently active',
  FOLLOWING_BADGE: 'Following',
  UNREAD_SUFFIX: 'unread',
  SUBS_SUFFIX: 'subs',
  LAST_ACTIVE_PREFIX: 'Last active',
  BUTTON_OWNED: 'Owned',
  BUTTON_UNSUBSCRIBE: 'Unsubscribe',
  BUTTON_SUBSCRIBE: 'Subscribe',
} as const

// ============================================================================
// Types
// ============================================================================

type FeedDirectoryProps = {
  feeds: FeedSummary[]
  searchTerm: string
  onSearchTermChange: (value: string) => void
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
// Helpers
// ============================================================================

const mapDirectoryEntryToFeedSummary = (entry: DirectoryEntry): FeedSummary => ({
  id: entry.id,
  name: entry.name || 'Unnamed Feed',
  description: entry.name ? STRINGS.SUBSCRIBED_LABEL : STRINGS.SUBSCRIBED_LABEL,
  tags: [],
  owner: 'Subscribed feed',
  subscribers: 0,
  unreadPosts: 0,
  lastActive: entry.created
    ? new Date(entry.created * 1000).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : STRINGS.RECENTLY_ACTIVE,
  isSubscribed: false,
  isOwner: false,
  fingerprint: entry.fingerprint,
})

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
    if (feed.isOwner) return STRINGS.BUTTON_OWNED
    if (feed.isSubscribed) return STRINGS.BUTTON_UNSUBSCRIBE
    return STRINGS.BUTTON_SUBSCRIBE
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
            {STRINGS.FOLLOWING_BADGE}
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
            <span>{STRINGS.SUBS_SUFFIX}</span>
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
// SearchInput Component
// ============================================================================

function SearchInput({
  value,
  onChange,
  isSearching,
}: {
  value: string
  onChange: (value: string) => void
  isSearching: boolean
}) {
  return (
    <div className="relative">
      {isSearching ? (
        <Loader2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : (
        <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      )}
      <Input
        placeholder={STRINGS.SEARCH_PLACEHOLDER}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="pl-9"
      />
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
        <p>{STRINGS.SEARCHING}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center space-y-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      <p>{STRINGS.NO_RESULTS}</p>
      <p className="text-xs">{STRINGS.NO_RESULTS_HINT}</p>
    </div>
  )
}

// ============================================================================
// FeedDirectory Component
// ============================================================================

export function FeedDirectory({
  feeds,
  searchTerm,
  onSearchTermChange,
  selectedFeedId,
  onSelectFeed,
  onToggleSubscription,
}: FeedDirectoryProps) {
  const [searchResults, setSearchResults] = useState<FeedSummary[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const mountedRef = useRef(true)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  // Search effect with debounce
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    const trimmedSearch = searchTerm.trim()

    if (!trimmedSearch) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    debounceTimerRef.current = setTimeout(async () => {
      if (!mountedRef.current) return

      try {
        const response = await feedsApi.search({ search: trimmedSearch })
        if (!mountedRef.current) return

        const mappedResults = (response.data ?? []).map(mapDirectoryEntryToFeedSummary)
        setSearchResults(mappedResults)
      } catch (error) {
        console.error('[FeedDirectory] Failed to search feeds', error)
        setSearchResults([])
      } finally {
        if (mountedRef.current) {
          setIsSearching(false)
        }
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [searchTerm])

  // Sync search results with main feeds state
  useEffect(() => {
    if (searchResults.length === 0 || feeds.length === 0) {
      return
    }

    setSearchResults((current) => {
      if (current.length === 0) return current

      let hasChanges = false
      const updated = current.map((searchFeed) => {
        const updatedFeed = feeds.find((feed) => {
          const matchesId = feed.id === searchFeed.id
          const matchesFingerprint =
            feed.fingerprint &&
            searchFeed.fingerprint &&
            feed.fingerprint === searchFeed.fingerprint
          return matchesId || matchesFingerprint
        })

        if (updatedFeed) {
          if (
            searchFeed.isSubscribed !== updatedFeed.isSubscribed ||
            searchFeed.subscribers !== updatedFeed.subscribers ||
            searchFeed.isOwner !== updatedFeed.isOwner
          ) {
            hasChanges = true
            return {
              ...searchFeed,
              isSubscribed: updatedFeed.isSubscribed,
              subscribers: updatedFeed.subscribers,
              isOwner: updatedFeed.isOwner,
            }
          }
        }
        return searchFeed
      })

      return hasChanges ? updated : current
    })
  }, [feeds, searchResults])

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
          <p className="text-sm font-semibold">{STRINGS.TITLE}</p>
          <p className="text-xs text-muted-foreground">{STRINGS.SUBTITLE}</p>
        </div>
        <SearchInput
          value={searchTerm}
          onChange={onSearchTermChange}
          isSearching={isSearching}
        />
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
