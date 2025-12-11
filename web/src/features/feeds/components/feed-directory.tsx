import { useEffect, useState, useRef } from 'react'
import { Search as SearchIcon, Loader2, Rss, Users } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { type FeedSummary } from '../types'
import feedsApi from '@/api/feeds'
import type { DirectoryEntry } from '@/api/types/feeds'

type FeedDirectoryProps = {
  feeds: FeedSummary[]
  searchTerm: string
  onSearchTermChange: (value: string) => void
  selectedFeedId: string | null
  onSelectFeed: (feedId: string) => void
  onToggleSubscription: (feedId: string) => void
}

const mapDirectoryEntryToFeedSummary = (entry: DirectoryEntry): FeedSummary => {
  return {
    id: entry.id,
    name: entry.name || 'Unnamed Feed',
    description: entry.name ? 'Subscribe to get updates from this feed' : 'Subscribe to get updates',
    tags: [],
    owner: 'Subscribed feed',
    subscribers: 0,
    unreadPosts: 0,
    lastActive: entry.created
      ? new Date(entry.created * 1000).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
      : 'Recently active',
    isSubscribed: false,
    isOwner: false,
    fingerprint: entry.fingerprint,
  }
}

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

  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    const trimmedSearch = searchTerm.trim()

    // If search is empty, clear search results and use local filter
    if (!trimmedSearch) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    // Debounce API call
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
    }, 500) // 500ms debounce

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [searchTerm])

  // Sync search results with main feeds state to reflect subscription changes
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
          // Check if subscription state changed
          if (
            searchFeed.isSubscribed !== updatedFeed.isSubscribed ||
            searchFeed.subscribers !== updatedFeed.subscribers ||
            searchFeed.isOwner !== updatedFeed.isOwner
          ) {
            hasChanges = true
            // Update search result with latest subscription state from main feeds
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
      // Only update state if there were actual changes
      return hasChanges ? updated : current
    })
  }, [feeds, searchResults])

  // Use search results if searching, otherwise use local filter
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
    <Card className='flex h-full flex-col overflow-hidden shadow-md'>
      <CardHeader className='flex-shrink-0 space-y-3 border-b pb-4'>
        <div className='space-y-1'>
          <p className='text-sm font-semibold'>Feeds directory</p>
          <p className='text-xs text-muted-foreground'>
            Search, subscribe, or jump into any space.
          </p>
        </div>
        <div className='relative'>
          {isSearching ? (
            <Loader2 className='absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground' />
          ) : (
            <SearchIcon className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
          )}
          <Input
            placeholder='Search feeds or tags'
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            className='pl-9'
          />
        </div>
      </CardHeader>
      <CardContent className='flex-1 overflow-hidden p-0'>
        <ScrollArea className='h-full px-4 py-4'>
          <div className='space-y-3'>
            {isSearching ? (
              <div className='flex flex-col items-center justify-center space-y-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
                <Loader2 className='size-5 animate-spin' />
                <p>Searching feeds...</p>
              </div>
            ) : displayedFeeds.length === 0 ? (
              <div className='flex flex-col items-center justify-center space-y-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
                <p>No feeds match that search.</p>
                <p className='text-xs'>Try another keyword or create a feed.</p>
              </div>
            ) : (
              displayedFeeds.map((feed: FeedSummary) => (
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

type FeedListItemProps = {
  feed: FeedSummary
  isActive: boolean
  onSelect: (feedId: string) => void
  onToggleSubscription: (feedId: string) => void
}

function FeedListItem({ feed, isActive, onSelect, onToggleSubscription }: FeedListItemProps) {
  const handleActivate = () => onSelect(feed.id)

  return (
    <div
      role='button'
      tabIndex={0}
      onClick={handleActivate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleActivate()
        }
      }}
      className={cn(
        'group w-full rounded-xl border p-4 text-start transition-all duration-300',
        'hover:border-primary/50 hover:shadow-md',
        isActive && 'border-primary bg-primary/5 shadow-sm'
      )}
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='flex-1 space-y-2'>
          <div className='flex items-center gap-2'>
            <div className={cn(
              'rounded-lg bg-primary/10 p-1.5 transition-colors duration-300',
              'group-hover:bg-primary/20'
            )}>
              <Rss className='size-3.5 text-primary' />
            </div>
            <p className='text-sm font-semibold'>{feed.name}</p>
            {feed.isSubscribed && (
              <Badge variant='secondary' className='text-[10px] font-medium'>
                Following
              </Badge>
            )}
          </div>
          <p className='line-clamp-2 text-xs leading-relaxed text-muted-foreground'>
            {feed.description}
          </p>
        </div>
        {feed.unreadPosts > 0 && (
          <Badge
            variant='outline'
            className={cn(
              'shrink-0 transition-colors duration-300',
              'group-hover:border-primary/50 group-hover:bg-primary/10'
            )}
          >
            {feed.unreadPosts} unread
          </Badge>
        )}
      </div>

      {feed.tags.length > 0 && (
        <div className='mt-3 flex flex-wrap gap-1.5'>
          {feed.tags.map((tag) => (
            <Badge
              key={tag}
              variant='outline'
              className='text-[10px] font-normal transition-colors duration-300 group-hover:border-primary/30'
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}

      <div className='mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground'>
        <div className='flex flex-wrap items-center gap-4'>
          <span className='flex items-center gap-1.5'>
            <Users className='size-3.5' />
            <span className='font-medium'>{feed.subscribers}</span> subs
          </span>
          <span className='flex items-center gap-1'>
            Last active <span className='font-medium'>{feed.lastActive}</span>
          </span>
        </div>
        <Button
          type='button'
          size='sm'
          variant={feed.isSubscribed ? 'outline' : 'secondary'}
          disabled={feed.isOwner}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            console.log('[FeedDirectory] Subscribe button clicked', {
              feedId: feed.id,
              feedName: feed.name,
              isOwner: feed.isOwner,
              isSubscribed: feed.isSubscribed,
              onToggleSubscription: typeof onToggleSubscription,
            })
            if (!feed.isOwner && onToggleSubscription) {
              console.log('[FeedDirectory] Calling onToggleSubscription with feedId:', feed.id)
              try {
                onToggleSubscription(feed.id)
              } catch (error) {
                console.error('[FeedDirectory] Error calling onToggleSubscription:', error)
              }
            } else {
              console.log('[FeedDirectory] Subscription blocked:', {
                isOwner: feed.isOwner,
                hasHandler: !!onToggleSubscription,
              })
            }
          }}
          className='transition-all duration-300 hover:scale-105'
        >
          {feed.isOwner ? 'Owned' : feed.isSubscribed ? 'Unsubscribe' : 'Subscribe'}
        </Button>
      </div>
    </div>
  )
}
