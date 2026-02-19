import { Link } from '@tanstack/react-router'
import type { FeedPost, ReactionId } from '@/types'
import { Card, MapView } from '@mochi/common'
import { MessageSquare, MapPin, Plane } from 'lucide-react'
import { PostAttachments } from './post-attachments'
import { PostTags } from './post-tags'
import { ReactionBar } from './reaction-bar'

interface PostCardCompactProps {
  post: FeedPost
  showFeedName?: boolean
  onReaction?: (reaction: ReactionId | '') => void
  onTagFilter?: (label: string) => void
}

export function PostCardCompact({
  post,
  showFeedName,
  onReaction,
  onTagFilter,
}: PostCardCompactProps) {
  // Truncate body for preview (first 2 lines or 120 chars)
  const getPreview = (text: string) => {
    const lines = text.split('\n').slice(0, 2).join('\n')
    if (lines.length > 120) {
      return lines.slice(0, 120) + '...'
    }
    return lines
  }

  return (
    <Card className='group/card hover:border-primary/30 overflow-hidden py-0 transition-all hover:shadow-md'>
      <div className='space-y-3 p-4'>
        {/* Post preview - clickable to post page */}
        <div className='relative'>
          {/* Metadata - top right, visible on hover */}
          <span className='text-muted-foreground absolute right-0 top-0 text-xs opacity-0 transition-opacity group-hover/card:opacity-100'>
            {showFeedName && post.feedName ? (
              <>
                {post.feedName}
                <span> · </span>
              </>
            ) : null}
            {post.source && <>{post.source.name} · </>}{post.createdAt}
          </span>

          <Link
            to='/$feedId/$postId'
            params={{
              feedId: post.feedFingerprint ?? post.feedId,
              postId: post.id,
            }}
            className='block space-y-2'
          >
            {post.body.trim() ? (
              <p className='text-foreground line-clamp-2 pr-28 text-base font-medium leading-snug'>
                {getPreview(post.body)}
              </p>
            ) : null}

          {/* Location labels */}
          {(post.data?.checkin || post.data?.travelling) && (
            <div className='text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm'>
              {post.data?.checkin && (
                <div className='flex items-center gap-1.5'>
                  <MapPin className='size-4 text-blue-500' />
                  <span>{post.data.checkin.name}</span>
                </div>
              )}
              {post.data?.travelling && (
                <div className='flex items-center gap-1.5'>
                  <Plane className='size-4 text-green-500' />
                  <span>
                    {post.data.travelling.origin.name} –{' '}
                    {post.data.travelling.destination.name}
                  </span>
                </div>
              )}
            </div>
          )}
          </Link>

          {/* Maps and attachments - outside Link so attachment clicks open lightbox */}
          {(post.data?.checkin ||
            post.data?.travelling ||
            (post.attachments && post.attachments.length > 0)) && (
            <div className='flex flex-wrap items-start gap-2'>
              {/* Checkin map thumbnail */}
              {post.data?.checkin && (
                <div className='overflow-hidden rounded-[8px] border'>
                  <MapView
                    lat={post.data.checkin.lat}
                    lon={post.data.checkin.lon}
                    category={post.data.checkin.category}
                    height={140}
                    aspectRatio='16/9'
                  />
                </div>
              )}
              {/* Travelling map thumbnail */}
              {post.data?.travelling && (
                <div className='overflow-hidden rounded-[8px] border'>
                  <MapView
                    lat={post.data.travelling.destination.lat}
                    lon={post.data.travelling.destination.lon}
                    name={post.data.travelling.destination.name}
                    origin={{
                      lat: post.data.travelling.origin.lat,
                      lon: post.data.travelling.origin.lon,
                      name: post.data.travelling.origin.name,
                    }}
                    height={140}
                    aspectRatio='16/9'
                  />
                </div>
              )}
              {/* Attachments */}
              {post.attachments && post.attachments.length > 0 && (
                <PostAttachments
                  attachments={post.attachments}
                  feedId={post.feedFingerprint ?? post.feedId}
                  inline
                />
              )}
            </div>
          )}
        </div>

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <PostTags tags={post.tags} onFilter={onTagFilter} />
        )}

        {/* Action buttons row - interactive */}
        <div className='text-muted-foreground flex items-center gap-1 text-xs'>
          {/* Reaction Bar (Counts + React Button) */}
          <div
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
          >
            <ReactionBar
              counts={post.reactions}
              activeReaction={post.userReaction}
              onSelect={(reaction) => onReaction?.(reaction)}
              showCounts={true}
              showButton={true}
              variant='secondary'
            />
          </div>

          {/* Comments navigation link */}
          <Link
            to='/$feedId/$postId'
            params={{
              feedId: post.feedFingerprint ?? post.feedId,
              postId: post.id,
            }}
            className='text-foreground bg-muted inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors hover:bg-gray-200 dark:hover:bg-gray-700'
            onClick={(e) => e.stopPropagation()}
          >
            <MessageSquare className='size-3' />
            <span>{post.comments.length}</span>
          </Link>
        </div>
      </div>
    </Card>
  )
}
