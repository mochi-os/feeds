import { Link } from '@tanstack/react-router'
import type { FeedPost, ReactionId } from '@/types'
import { Card, MapView } from '@mochi/common'
import { MessageSquare, MapPin, Plane } from 'lucide-react'
import { PostAttachments } from './post-attachments'
import { PostTagsTooltip } from './post-tags'
import { ReactionBar } from './reaction-bar'

interface PostCardCompactProps {
  post: FeedPost
  showFeedName?: boolean
  onReaction?: (reaction: ReactionId | '') => void
  onTagRemoved?: (tagId: string) => void
  onTagFilter?: (label: string) => void
  onTagAdd?: (label: string) => Promise<void> | void
  onInterestUp?: (qid: string) => void
  onInterestDown?: (qid: string) => void
  matches?: { qid: string; label?: string }[]
}

export function PostCardCompact({
  post,
  showFeedName,
  onReaction,
  onTagRemoved,
  onTagFilter,
  onTagAdd,
  onInterestUp,
  onInterestDown,
  matches,
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
          <div className='absolute right-0 top-0 opacity-0 transition-opacity group-hover/card:opacity-100'>
            <span className='text-muted-foreground text-xs'>
              {showFeedName && post.feedName ? (
                <>
                  {post.feedName}
                  <span> · </span>
                </>
              ) : null}
              {post.source && <>{post.source.name} · </>}{post.createdAt}
            </span>
          </div>

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

        {/* Action buttons row - interactive */}
        <div className='text-muted-foreground flex items-center gap-3 text-xs'>
          {/* Tags */}
          <PostTagsTooltip tags={post.tags ?? []} onRemove={onTagRemoved} onFilter={onTagFilter} onAdd={onTagAdd} onInterestUp={onInterestUp} onInterestDown={onInterestDown} />
          {matches && matches.length > 0 && (
            <span className='inline-flex items-center gap-1'>
              {matches.map((m) => (
                <span key={m.qid} className='bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200 rounded-full px-1.5 py-0.5 text-xs font-medium'>
                  {m.label || m.qid}
                </span>
              ))}
            </span>
          )}

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
            className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors'
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
