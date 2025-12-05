import { Search as SearchIcon, Rss, Users } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { type FeedSummary } from '../types'

type FeedDirectoryProps = {
  feeds: FeedSummary[]
  searchTerm: string
  onSearchTermChange: (value: string) => void
  selectedFeedId: string | null
  onSelectFeed: (feedId: string) => void
  onToggleSubscription: (feedId: string) => void
}

export function FeedDirectory({
  feeds,
  searchTerm,
  onSearchTermChange,
  selectedFeedId,
  onSelectFeed,
  onToggleSubscription,
}: FeedDirectoryProps) {
  const filteredFeeds = feeds.filter((feed) => {
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
          <SearchIcon className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
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
            {filteredFeeds.length === 0 ? (
              <div className='flex flex-col items-center justify-center space-y-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
                <p>No feeds match that search.</p>
                <p className='text-xs'>Try another keyword or create a feed.</p>
              </div>
            ) : (
              filteredFeeds.map((feed) => (
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
  return (
    <button
      type='button'
      onClick={() => onSelect(feed.id)}
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
            size='sm'
            variant={feed.isSubscribed ? 'outline' : 'secondary'}
            disabled={feed.isOwner}
            onClick={(event) => {
              event.stopPropagation()
              if (!feed.isOwner) {
                onToggleSubscription(feed.id)
              }
            }}
            className='transition-all duration-300 hover:scale-105'
          >
            {feed.isOwner ? 'Owned' : feed.isSubscribed ? 'Unsubscribe' : 'Subscribe'}
          </Button>
        </div>
    </button>
  )
}
