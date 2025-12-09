import { MessageSquare, Rss, Sparkles, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { type FeedSummary } from '../types'

type FeedOverviewProps = {
  feed: FeedSummary
  totalComments: number
  totalReactions: number
  onToggleSubscription: (feedId: string) => void
}

export function FeedOverview({
  feed,
  totalComments,
  totalReactions,
  onToggleSubscription,
}: FeedOverviewProps) {
  const stats = [
    { label: 'Unread posts', value: feed.unreadPosts, icon: Rss },
    { label: 'Active subscribers', value: feed.subscribers, icon: Users },
    { label: 'Comments logged', value: totalComments, icon: MessageSquare },
    { label: 'Reactions', value: totalReactions, icon: Sparkles },
  ]

  return (
    <Card className='shadow-md transition-shadow duration-300 hover:shadow-lg'>
      <CardContent className='space-y-4 p-6'>
        <div className='flex flex-wrap items-start justify-between gap-4'>
          <div className='space-y-3'>
            <div className='flex items-center gap-2'>
              <div className='rounded-lg bg-primary/10 p-2'>
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
                console.log('[FeedOverview] Subscribe button clicked', {
                  feedId: feed.id,
                  feedName: feed.name,
                  isOwner: feed.isOwner,
                  isSubscribed: feed.isSubscribed,
                  onToggleSubscription: typeof onToggleSubscription,
                })
                if (!feed.isOwner && onToggleSubscription) {
                  console.log('[FeedOverview] Calling onToggleSubscription with feedId:', feed.id)
                  try {
                    onToggleSubscription(feed.id)
                  } catch (error) {
                    console.error('[FeedOverview] Error calling onToggleSubscription:', error)
                  }
                } else {
                  console.log('[FeedOverview] Subscription blocked:', {
                    isOwner: feed.isOwner,
                    hasHandler: !!onToggleSubscription,
                  })
                }
              }}
              className='transition-all duration-300 hover:scale-105'
            >
              {feed.isOwner ? 'Owned' : feed.isSubscribed ? 'Following' : 'Subscribe'}
            </Button>
          </div>
        </div>
        <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
          {stats.map((stat) => (
            <div
              key={stat.label}
              className='group rounded-lg border bg-background p-3 transition-all duration-300 hover:border-primary/50 hover:shadow-md'
            >
              <div className='mb-2 inline-flex rounded-lg bg-primary/10 p-1.5 transition-colors duration-300 group-hover:bg-primary/20'>
                <stat.icon className='size-4 text-primary' />
              </div>
              <p className='text-xs text-muted-foreground'>{stat.label}</p>
              <p className='text-lg font-semibold'>{stat.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
