import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { FeedPost, ReactionId } from '@/types'
import { Card, MapView, getAppPath } from '@mochi/common'
import {
  MessageSquare,
  MapPin,
  Plane,
  Maximize2,
  X,
} from 'lucide-react'
import { ReactionBar } from './reaction-bar'

interface PostCardRowProps {
  post: FeedPost
  showFeedName?: boolean
  onReaction?: (reaction: ReactionId | '') => void
}

export function PostCardRow({
  post,
  showFeedName,
  onReaction,
}: PostCardRowProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Determine the thumbnail content
  const renderThumbnail = () => {
    // 1. Check-in Map
    if (post.data?.checkin) {
      return (
        <MapView
          lat={post.data.checkin.lat}
          lon={post.data.checkin.lon}
          category={post.data.checkin.category}
          height={80}
          aspectRatio='3/2'
          zoom={12}
          interactive={false}
        />
      )
    }

    // 2. Travelling Map
    if (post.data?.travelling) {
      return (
        <MapView
          lat={post.data.travelling.destination.lat}
          lon={post.data.travelling.destination.lon}
          name={post.data.travelling.destination.name}
          origin={{
            lat: post.data.travelling.origin.lat,
            lon: post.data.travelling.origin.lon,
            name: post.data.travelling.origin.name,
          }}
          height={80}
          aspectRatio='3/2'
          interactive={false}
        />
      )
    }

    // 3. Image Attachment
    const imageAttachment = post.attachments?.find((att) =>
      att.type?.startsWith('image/')
    )
    if (imageAttachment) {
      return (
        <img
          src={`${getAppPath()}/${post.feedFingerprint ?? post.feedId}/-/attachments/${imageAttachment.id}/thumbnail`}
          alt={imageAttachment.name}
          className='h-full w-full object-cover'
        />
      )
    }

    // 4. Default: No specific thumbnail
    return null
  }

  const thumbnail = renderThumbnail()

  // Render Full Content (Map/Image) for Expanded View
  const renderExpandedContent = () => {
    // 1. Check-in Map
    if (post.data?.checkin) {
      return (
        <div className='mt-3 overflow-hidden rounded-md border'>
          <MapView
            lat={post.data.checkin.lat}
            lon={post.data.checkin.lon}
            category={post.data.checkin.category}
            height={300}
            aspectRatio='16/9'
            zoom={14}
          />
        </div>
      )
    }

    // 2. Travelling Map
    if (post.data?.travelling) {
      return (
        <div className='mt-3 overflow-hidden rounded-md border'>
          <MapView
            lat={post.data.travelling.destination.lat}
            lon={post.data.travelling.destination.lon}
            name={post.data.travelling.destination.name}
            origin={{
              lat: post.data.travelling.origin.lat,
              lon: post.data.travelling.origin.lon,
              name: post.data.travelling.origin.name,
            }}
            height={300}
            aspectRatio='16/9'
          />
        </div>
      )
    }

    // 3. Image Attachments (Show all if expanded)
    const images = post.attachments?.filter((att) =>
      att.type?.startsWith('image/')
    )
    if (images && images.length > 0) {
      return (
        <div className='mt-3 space-y-2'>
          {images.map((att) => (
            <img
              key={att.id}
              src={`${getAppPath()}/${post.feedFingerprint ?? post.feedId}/-/attachments/${att.id}/original`}
              alt={att.name}
              className='max-h-[500px] w-full rounded-md bg-black/5 object-contain'
            />
          ))}
        </div>
      )
    }

    return null
  }

  return (
    <Card className='group/card hover:border-primary/30 overflow-hidden transition-all hover:shadow-md'>
      <div className='flex min-h-[120px]'>
         {/* Left: Content */}
        <div className='relative flex min-w-0 flex-1 flex-col justify-between p-3'>
          {/* Metadata */}
          <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
            {showFeedName && post.feedName ? (
              <>
                <span>{post.feedName}</span>
                <span>·</span>
              </>
            ) : null}
            <span>{post.createdAt}</span>
          </div>

          <div className='space-y-1.5'>
            {/* Title / Content Preview - Clickable */}
            {post.body.trim() ? (
              <Link
                to='/$feedId/$postId'
                params={{
                  feedId: post.feedFingerprint ?? post.feedId,
                  postId: post.id,
                }}
                className='block'
              >
                <p className='text-foreground line-clamp-2 pr-4 text-sm leading-snug font-medium'>
                  {post.body}
                </p>
              </Link>
            ) : null}

            {/* Location Text (Optional) */}
            {(post.data?.checkin || post.data?.travelling) && (
              <div className='text-muted-foreground flex items-center gap-2 truncate text-xs'>
                {post.data?.checkin && (
                  <>
                    <MapPin className='size-3 text-blue-500' />
                    <span className='truncate'>{post.data.checkin.name}</span>
                  </>
                )}
                {post.data?.travelling && (
                  <>
                    <Plane className='size-3 text-green-500' />
                    <span className='truncate'>
                      {post.data.travelling.origin.name} →{' '}
                      {post.data.travelling.destination.name}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Row 3: Action Buttons */}
          <div className='text-muted-foreground mt-2 flex items-center gap-1 text-xs'>
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
              <span>{post.comments.length} Comments</span>
            </Link>
          </div>

          {/* Expanded Content */}
          {isExpanded && renderExpandedContent()}
        </div>

        {/* Right: Thumbnail (Fixed Width + Padding) */}
        {thumbnail && (
          <div className='flex w-[140px] shrink-0 flex-col p-3 pl-0'>
            <div className='bg-muted h-20 w-full overflow-hidden rounded-[8px] border'>
              {thumbnail}
            </div>
            
            {/* Expand Toggle */}
             <button
              type='button'
              className='text-foreground bg-muted hover:bg-muted/80 mt-2 ml-auto inline-flex size-7 items-center justify-center rounded-full transition-colors'
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setIsExpanded(!isExpanded)
              }}
            >
              {isExpanded ? (
                <X className='size-4' />
              ) : (
                <Maximize2 className='size-3.5' />
              )}
            </button>
          </div>
        )}
      </div>
    </Card>
  )
}
