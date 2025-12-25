import { Badge, Button, Card, CardContent } from '@mochi/common'
import type { FeedSummary } from '@/types'
import { Rss } from 'lucide-react'

type FeedOverviewProps = {
  feed: FeedSummary
  onToggleSubscription: (feedId: string, server?: string) => void
}

export function FeedOverview({
  feed,
  onToggleSubscription,
}: FeedOverviewProps) {
  return (
    <Card className='shadow-md transition-shadow duration-300 hover:shadow-lg'>
      <CardContent className='space-y-4 p-6'>
        <div className='flex flex-wrap items-start justify-between gap-4'>
          <div className='space-y-3'>
            <div className='flex items-center gap-2'>
              <div className='rounded-[8px] bg-primary/10 p-2'>
                <Rss className='size-4 text-primary' />
              </div>
              <p className='text-lg font-semibold'>{feed.name}</p>
            </div>
            <p className='text-sm leading-relaxed text-muted-foreground'>{feed.description}</p>
            <div className='flex flex-wrap gap-2'>
              {feed.tags.map((tag) => (
                <Badge key={tag} variant='secondary' className='font-medium'>
                  {tag}
                </Badge>
              ))}
            </div>
            <p className='text-xs text-muted-foreground'>
              Owned by <span className='font-medium text-foreground'>{feed.owner}</span> · Last active{' '}
              <span className='font-medium text-foreground'>{feed.lastActive}</span>
            </p>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='outline' className='font-medium'>{feed.subscribers} subscribers</Badge>
            <Button
              type='button'
              size='sm'
              variant={feed.isSubscribed ? 'secondary' : 'default'}
              disabled={feed.isOwner}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (!feed.isOwner && onToggleSubscription) {
                  try {
                    onToggleSubscription(feed.id, feed.server)
                  } catch (error) {
                    console.error('[FeedOverview] Error calling onToggleSubscription:', error)
                  }
                }
              }}
              className='transition-all duration-300 hover:scale-105'
            >
              {feed.isOwner ? 'Owned' : feed.isSubscribed ? 'Following' : 'Subscribe'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
