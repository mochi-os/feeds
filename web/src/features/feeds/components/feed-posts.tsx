import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { Attachment, FeedPermissions, FeedPost, ReactionId } from '@/types'
import {
  Button,
  Card,
  ConfirmDialog,
  MapView,
  PlacePicker,
  TravellingPicker,
  getAppPath,
  authenticatedUrl,
  normalizeEntityUrl,
  type PlaceData,
  type PostData,
} from '@mochi/web'
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  MessageSquare,
  Paperclip,
  Pencil,
  Plane,
  Send,
  Trash2,
  X,
} from 'lucide-react'

import { feedsApi } from '@/api/feeds'
import { STRINGS } from '../constants'
import { sanitizeHtml, linkifyText, embedVideos, stripImages, stripEllipsis, extractImgAttrs, stripHtml } from '../utils'
import { CommentThread } from './comment-thread'
import { PostAttachments } from './post-attachments'
import { PostTagsTooltip } from './post-tags'
import { ReactionBar } from './reaction-bar'

// Unified attachment type for editing - can be existing or new
type EditingAttachment =
  | { kind: 'existing'; attachment: Attachment }
  | { kind: 'new'; file: File; previewUrl?: string }

type FeedPostsProps = {
  posts: FeedPost[]
  commentDrafts: Record<string, string>
  onDraftChange: (postId: string, value: string) => void
  onAddComment: (feedId: string, postId: string, body?: string, files?: File[]) => void
  onReplyToComment: (
    feedId: string,
    postId: string,
    parentCommentId: string,
    body: string,
    files?: File[]
  ) => void | Promise<void>
  onPostReaction: (
    feedId: string,
    postId: string,
    reaction: ReactionId | ''
  ) => void
  onCommentReaction: (
    feedId: string,
    postId: string,
    commentId: string,
    reaction: ReactionId | ''
  ) => void
  onEditPost?: (
    feedId: string,
    postId: string,
    body: string,
    data?: PostData,
    order?: string[],
    files?: File[]
  ) => void
  onDeletePost?: (feedId: string, postId: string) => void
  onEditComment?: (
    feedId: string,
    postId: string,
    commentId: string,
    body: string
  ) => void
  onDeleteComment?: (feedId: string, postId: string, commentId: string) => void
  onTagAdded?: (feedId: string, postId: string, label: string) => Promise<void>
  onTagFilter?: (label: string) => void
  onInterestUp?: (qidOrLabel: string, isLabel?: boolean) => void
  onInterestDown?: (qidOrLabel: string, isLabel?: boolean) => void
  onInterestRemove?: (qid: string) => void
  showFeedName?: boolean
  currentUserId?: string
  isFeedOwner?: boolean
  permissions?: FeedPermissions
  feedRead?: number
  onPostClick?: (postId: string, feedId?: string) => void
  observePost?: (el: HTMLElement | null) => void
  /** When true, disables click-to-navigate and hover styling (single post page) */
  singlePost?: boolean
}

// Lazily fetch og:image for RSS posts that don't have one yet
function LazyRssImage({ feedId, postId, link, rssHtml, rssTitle }: {
  feedId: string
  postId: string
  link: string
  rssHtml?: string
  rssTitle?: string
}) {
  const [image, setImage] = useState<string | null>(null)
  const attempted = useRef(false)

  useEffect(() => {
    if (attempted.current) return
    attempted.current = true
    feedsApi.getPostImage(feedId, postId).then(url => {
      if (url) setImage(url)
    }).catch(() => { })
  }, [feedId, postId])

  if (!image) return null

  const imgAttrs = extractImgAttrs(rssHtml)
  return (
    <a href={link} target='_blank' rel='noopener noreferrer'>
      <img
        src={image}
        alt={imgAttrs.alt || rssTitle || ''}
        title={imgAttrs.title || undefined}
        className='max-h-[250px] max-w-[600px] rounded-[10px] object-cover'
      />
    </a>
  )
}

export function FeedPosts({
  posts,
  commentDrafts,
  onDraftChange,
  onAddComment,
  onReplyToComment,
  onPostReaction,
  onCommentReaction,
  onEditPost,
  onDeletePost,
  onEditComment,
  onDeleteComment,
  onTagAdded,
  onTagFilter,
  onInterestUp,
  onInterestDown,
  onInterestRemove,
  showFeedName = false,
  currentUserId,
  isFeedOwner = false,
  permissions,
  feedRead,
  onPostClick,
  observePost,
  singlePost = false,
}: FeedPostsProps) {
  // Determine what actions are allowed based on permissions
  // For single feed view, use component-level permissions from API
  // For aggregate view (showFeedName), use per-post permissions
  const canReact = permissions?.react || permissions?.comment || isFeedOwner
  const canComment = permissions?.comment || isFeedOwner
  // When showing multiple feeds, check per-post permissions instead
  const usePerPostPermissions = showFeedName && !permissions
  const [replyingTo, setReplyingTo] = useState<{
    postId: string
    commentId: string
  } | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [commentingOn, setCommentingOn] = useState<string | null>(null)
  const [commentFiles, setCommentFiles] = useState<File[]>([])
  const commentFileRef = useRef<HTMLInputElement>(null)
  const [editingPost, setEditingPost] = useState<{
    id: string
    feedId: string
    feedFingerprint?: string
    body: string
    data: PostData
    items: EditingAttachment[]
  } | null>(null)
  const [deletingPost, setDeletingPost] = useState<{
    id: string
    feedId: string
  } | null>(null)
  const [editPlacePickerOpen, setEditPlacePickerOpen] = useState(false)
  const [editTravellingPickerOpen, setEditTravellingPickerOpen] =
    useState(false)
  const [expandedComments, setExpandedComments] = useState<
    Record<string, boolean>
  >({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  const navigate = useNavigate()

  if (posts.length === 0) {
    return null
  }

  return (
    <div className='space-y-4'>
      {posts.map((post) => {
        const postIsRead = (post.read ?? 0) > 0 || (feedRead ? post.created <= feedRead : false)
        const cardContent = (
          <Card
            data-post-id={post.id}
            className={
              singlePost
                ? 'group/card relative overflow-hidden py-0'
                : `group/card hover:border-primary/30 relative cursor-pointer overflow-hidden py-0 transition-all hover:shadow-md ${!postIsRead ? 'border-r-2 border-r-primary' : ''}`
            }
            onClick={(e) => {
              if (singlePost) return
              // If propagation was stopped or default was prevented (by a button/link), don't navigate
              if (e.defaultPrevented) return

              // Allow default behavior for text selection
              if (window.getSelection()?.toString().length) return

              // Final check: don't navigate if clicking an interactive element
              if ((e.target as HTMLElement).closest('button, a, input, textarea')) {
                return
              }

              onPostClick?.(post.id, post.feedFingerprint ?? post.feedId)
              navigate({
                to: '/$feedId/$postId',
                params: {
                  feedId: post.feedFingerprint ?? post.feedId,
                  postId: post.id,
                },
              })
            }}
          >
            <div className='relative p-4'>
              {/* Unread dot - always visible */}
              {/* Timestamp and source - top right, visible on hover */}
              <span className='text-muted-foreground bg-card absolute right-4 top-4 rounded px-1 text-xs opacity-100 transition-opacity md:opacity-0 md:group-hover/card:opacity-100 md:group-focus-within/card:opacity-100'>
                {showFeedName && post.feedName && <>{post.feedName} · </>}{post.createdAt}
              </span>

              <div className='space-y-3'>
                {/* Post body - show edit form if editing */}
                {editingPost?.id === post.id ? (
                  <div className='space-y-3'>
                    <textarea
                      value={editingPost.body}
                      onChange={(e) =>
                        setEditingPost({
                          ...editingPost,
                          body: e.target.value,
                        })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setEditingPost(null)
                        }
                      }}
                      className='min-h-24 w-full rounded-[8px] border px-3 py-2 text-base'
                      rows={4}
                      autoFocus
                    />

                    {/* Location display */}
                    {(editingPost.data.checkin ||
                      editingPost.data.travelling) && (
                        <div className='space-y-2'>
                          {editingPost.data.checkin && (
                            <div className='space-y-2 rounded-[8px] border p-3'>
                              <div className='flex items-center justify-between'>
                                <div className='flex items-center gap-2 text-sm'>
                                  <MapPin className='size-4 text-blue-500' />
                                  <span>
                                    at {editingPost.data.checkin.name}
                                  </span>
                                </div>
                                <Button
                                  type='button'
                                  variant='ghost'
                                  size='icon'
                                  className='size-6'
                                  onClick={() => {
                                    const { checkin, ...rest } =
                                      editingPost.data
                                    setEditingPost({
                                      ...editingPost,
                                      data: rest,
                                    })
                                  }}
                                  aria-label='Remove check-in'
                                  title='Remove check-in'
                                >
                                  <X className='size-4' />
                                </Button>
                              </div>
                              <MapView
                                lat={editingPost.data.checkin.lat}
                                lon={editingPost.data.checkin.lon}
                                category={editingPost.data.checkin.category}
                              />
                            </div>
                          )}
                          {editingPost.data.travelling && (
                            <div className='space-y-2 rounded-[8px] border p-3'>
                              <div className='flex items-center justify-between'>
                                <div className='flex items-center gap-2 text-sm'>
                                  <Plane className='size-4 text-blue-600' />
                                  <span>
                                    {editingPost.data.travelling.origin.name} –{' '}
                                    {
                                      editingPost.data.travelling.destination
                                        .name
                                    }
                                  </span>
                                </div>
                                <Button
                                  type='button'
                                  variant='ghost'
                                  size='icon'
                                  className='size-6'
                                  onClick={() => {
                                    const { travelling, ...rest } =
                                      editingPost.data
                                    setEditingPost({
                                      ...editingPost,
                                      data: rest,
                                    })
                                  }}
                                  aria-label='Remove travel route'
                                  title='Remove travel route'
                                >
                                  <X className='size-4' />
                                </Button>
                              </div>
                              <MapView
                                lat={
                                  editingPost.data.travelling.destination.lat
                                }
                                lon={
                                  editingPost.data.travelling.destination.lon
                                }
                                name={
                                  editingPost.data.travelling.destination.name
                                }
                                origin={{
                                  lat: editingPost.data.travelling.origin.lat,
                                  lon: editingPost.data.travelling.origin.lon,
                                  name: editingPost.data.travelling.origin.name,
                                }}
                              />
                            </div>
                          )}
                        </div>
                      )}

                    {/* Location buttons - mutually exclusive, so no disabled state */}
                    <div className='flex gap-2'>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => setEditPlacePickerOpen(true)}
                      >
                        <MapPin className='size-4' />
                        Check-in
                      </Button>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => setEditTravellingPickerOpen(true)}
                      >
                        <Plane className='size-4' />
                        Travelling
                      </Button>
                    </div>

                    {/* Attachments grid - unified list of existing and new */}
                    {editingPost.items.length > 0 && (
                      <div className='space-y-2'>
                        <div className='text-muted-foreground text-xs font-medium'>
                          Attachments
                        </div>
                        <div className='flex flex-wrap gap-2'>
                          {editingPost.items.map((item, index, arr) => {
                            const isExisting = item.kind === 'existing'
                            const isImage = isExisting
                              ? item.attachment.type?.startsWith('image/')
                              : item.file.type?.startsWith('image/')
                            const thumbnailUrl =
                              isExisting && isImage
                                ? authenticatedUrl(normalizeEntityUrl(item.attachment.thumbnail_url ?? `${getAppPath()}/${editingPost.feedFingerprint ?? editingPost.feedId}/-/attachments/${item.attachment.id}/thumbnail`))
                                : undefined
                            const previewUrl =
                              !isExisting && isImage
                                ? URL.createObjectURL(item.file)
                                : undefined
                            const itemKey = isExisting
                              ? item.attachment.id
                              : `new-${item.file.name}-${item.file.size}-${item.file.lastModified}`
                            const isFirst = index === 0
                            const isLast = index === arr.length - 1

                            return (
                              <div
                                key={itemKey}
                                className={`group/att relative flex items-center justify-center overflow-hidden rounded-[8px] ${isExisting
                                    ? 'bg-surface-2 border'
                                    : 'bg-surface-1 border-primary/30 border-2 border-dashed'
                                  }`}
                              >
                                {isImage && (thumbnailUrl || previewUrl) ? (
                                  <img
                                    src={thumbnailUrl || previewUrl}
                                    alt={
                                      isExisting
                                        ? item.attachment.name
                                        : item.file.name
                                    }
                                    className='max-h-[150px] max-w-[200px]'
                                  />
                                ) : (
                                  <div className='flex h-[100px] w-[150px] flex-col items-center justify-center gap-1 px-2'>
                                    <Paperclip className='text-muted-foreground size-6' />
                                    <span className='text-muted-foreground line-clamp-2 text-center text-xs break-all'>
                                      {isExisting
                                        ? item.attachment.name
                                        : item.file.name}
                                    </span>
                                  </div>
                                )}
                                {/* Hover overlay with controls */}
                                <div className='absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover/att:opacity-100'>
                                  <button
                                    type='button'
                                    className='flex size-9 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-30'
                                    disabled={isFirst}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setEditingPost((prev) => {
                                        if (!prev || index === 0) return prev
                                        const newItems = [...prev.items]
                                          ;[
                                            newItems[index - 1],
                                            newItems[index],
                                          ] = [
                                              newItems[index],
                                              newItems[index - 1],
                                            ]
                                        return { ...prev, items: newItems }
                                      })
                                    }}
                                  >
                                    <ArrowLeft className='size-5' />
                                  </button>
                                  <button
                                    type='button'
                                    className='flex size-9 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-30'
                                    disabled={isLast}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setEditingPost((prev) => {
                                        if (
                                          !prev ||
                                          index >= prev.items.length - 1
                                        )
                                          return prev
                                        const newItems = [...prev.items]
                                          ;[
                                            newItems[index],
                                            newItems[index + 1],
                                          ] = [
                                              newItems[index + 1],
                                              newItems[index],
                                            ]
                                        return { ...prev, items: newItems }
                                      })
                                    }}
                                  >
                                    <ArrowRight className='size-5' />
                                  </button>
                                  <button
                                    type='button'
                                    className='flex size-9 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30'
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setEditingPost((prev) => {
                                        if (!prev) return prev
                                        return {
                                          ...prev,
                                          items: prev.items.filter(
                                            (_, i) => i !== index
                                          ),
                                        }
                                      })
                                    }}
                                  >
                                    <X className='size-5' />
                                  </button>
                                </div>
                                {/* Position indicator or New badge */}
                                <div
                                  className={`absolute top-2 left-2 ${isExisting
                                      ? 'flex size-6 items-center justify-center rounded-full bg-black/60 text-xs font-medium text-white'
                                      : 'bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs font-medium'
                                    }`}
                                >
                                  {isExisting ? index + 1 : 'New'}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type='file'
                      multiple
                      className='hidden'
                      onChange={(e) => {
                        if (e.target.files) {
                          const newItems: EditingAttachment[] = Array.from(
                            e.target.files
                          ).map((file) => ({
                            kind: 'new' as const,
                            file,
                          }))
                          setEditingPost({
                            ...editingPost,
                            items: [...editingPost.items, ...newItems],
                          })
                        }
                        e.target.value = ''
                      }}
                    />

                      <div className='flex justify-between'>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Paperclip className='mr-1 size-4' />
                          Add files
                        </Button>
                        <div className='flex gap-2'>
                          <Button
                            variant='outline'
                            size='sm'
                            onClick={() => setEditingPost(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            size='sm'
                            disabled={!editingPost.body.trim() && !editingPost.data.checkin && !editingPost.data.travelling && editingPost.items.length === 0}
                            onClick={() => {
                              // Build order list with existing IDs and "new:N" placeholders
                              const order: string[] = []
                              const newFiles: File[] = []
                              let newIndex = 0
                              for (const item of editingPost.items) {
                                if (item.kind === 'existing') {
                                  order.push(item.attachment.id)
                                } else {
                                  order.push(`new:${newIndex}`)
                                  newFiles.push(item.file)
                                  newIndex++
                                }
                              }
                              // Build clean data - only include if there's content
                              const hasData =
                                Object.keys(editingPost.data).length > 0
                              onEditPost?.(
                                editingPost.feedId,
                                editingPost.id,
                                editingPost.body.trim(),
                                hasData ? editingPost.data : undefined,
                                order,
                                newFiles
                              )
                              setEditingPost(null)
                            }}
                          >
                            Save
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : post.body.trim() ? (
                    <>
                      {post.data?.rss?.title && (
                        <div>
                          <a
                            href={post.data.rss.link || post.source?.url}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-lg font-semibold hover:underline'
                          >
                            {stripHtml(post.data.rss.title)}
                          </a>
                          {post.source && (
                            <span className='text-muted-foreground text-xs'> · {post.source.name}</span>
                          )}
                        </div>
                      )}
                      {/* RSS image: show cached image, or lazy-fetch if missing */}
                      {post.data?.rss?.image && (!singlePost || !(post.bodyHtml && post.bodyHtml.includes(post.data.rss.image))) && (() => {
                        const imgAttrs = extractImgAttrs(post.data?.rss?.html)
                        return (
                          <a href={post.data.rss.link || post.source?.url} target='_blank' rel='noopener noreferrer'>
                            <img
                              src={post.data.rss.image}
                              alt={imgAttrs.alt || post.data.rss.title || ''}
                              title={imgAttrs.title || undefined}
                              className='max-h-[250px] max-w-[600px] rounded-[10px] object-cover'
                            />
                          </a>
                        )
                      })()}
                      {!post.data?.rss?.image && post.data?.rss?.link && (
                        <LazyRssImage
                          feedId={post.feedId}
                          postId={post.id}
                          link={post.data.rss.link}
                          rssHtml={post.data.rss.html}
                          rssTitle={post.data.rss.title}
                        />
                      )}
                      {(() => {
                        const rawHtml = !singlePost && post.data?.rss
                          ? stripEllipsis(stripImages(post.bodyHtml ? sanitizeHtml(post.bodyHtml) : sanitizeHtml(linkifyText(post.body))))
                          : (post.bodyHtml ? sanitizeHtml(post.bodyHtml) : sanitizeHtml(linkifyText(post.body)))
                        const hasText = rawHtml.replace(/<[^>]+>/g, '').trim().length > 0
                        const hasImages = /<img/i.test(rawHtml)
                        // Show image alt text when body is empty after stripping images (e.g. xkcd punchlines)
                        const rssImgAttrs = !hasText && post.data?.rss?.html ? extractImgAttrs(post.data.rss.html) : null
                        const imgAltText = rssImgAttrs ? (rssImgAttrs.title || rssImgAttrs.alt) : ''
                        return (
                          <>
                            {(hasText || hasImages) && (
                              <div
                                className={`prose prose-sm dark:prose-invert max-w-none prose-p:my-3 prose-p:leading-relaxed prose-ul:my-3 prose-ul:list-disc prose-ul:pl-6 prose-ul:marker:text-foreground prose-ol:my-3 prose-ol:list-decimal prose-ol:pl-6 prose-ol:marker:text-foreground prose-li:my-1 ${!post.bodyHtml && !post.data?.rss ? 'whitespace-pre-wrap' : ''} ${!singlePost && post.data?.rss ? 'line-clamp-6' : ''}`}
                                dangerouslySetInnerHTML={{ __html: embedVideos(rawHtml) }}
                              />
                            )}
                            {imgAltText && (
                              <p className='text-sm text-muted-foreground italic'>{imgAltText}</p>
                            )}
                          </>
                        )
                      })()}
                    </>
                  ) : null}

                {/* Location labels row */}
                {editingPost?.id !== post.id &&
                  (post.data?.checkin || post.data?.travelling) && (
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

                {/* Maps and attachments row */}
                {editingPost?.id !== post.id &&
                  (post.data?.checkin ||
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

                  {/* Actions row - always visible */}
                  {/* For aggregate view (usePerPostPermissions), check post.permissions; otherwise use component permissions */}
                  {editingPost?.id !== post.id &&
                    (canReact ||
                      canComment ||
                      isFeedOwner ||
                      post.isOwner ||
                      usePerPostPermissions) && (
                      <div
                        className='text-muted-foreground flex items-center gap-3 text-sm'
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Tags */}
                        <PostTagsTooltip
                          tags={post.tags ?? []}
                          onFilter={onTagFilter}
                          onAdd={onTagAdded
                            ? (label) => onTagAdded(post.feedFingerprint ?? post.feedId, post.id, label)
                            : undefined
                          }
                          onInterestUp={onInterestUp}
                          onInterestDown={onInterestDown}
                          onInterestRemove={onInterestRemove}
                        />
                        {/* Relevance match indicators */}
                        {post.matches && post.matches.length > 0 && (
                          <span className='inline-flex items-center gap-1'>
                            {post.matches.map((m) => (
                              <span key={m.qid} className='bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200 rounded-full px-1.5 py-0.5 text-xs font-medium'>
                                {m.label || m.qid}
                              </span>
                            ))}
                          </span>
                        )}
                        {/* Reaction counts - always visible */}
                        <ReactionBar
                          counts={post.reactions}
                          activeReaction={post.userReaction}
                          onSelect={(reaction) =>
                            onPostReaction(post.feedId, post.id, reaction)
                          }
                          showButton={false}
                        />
                        {/* Action buttons - visible on hover */}
                        <span className='inline-flex items-center gap-3 opacity-0 transition-opacity group-hover/card:opacity-100'>
                        {(usePerPostPermissions
                          ? post.isOwner ||
                          post.permissions?.react ||
                          post.permissions?.comment ||
                          !post.permissions
                          : canReact) && (
                            <div
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                              }}
                            >
                              <ReactionBar
                                counts={post.reactions}
                                activeReaction={post.userReaction}
                                onSelect={(reaction) =>
                                  onPostReaction(post.feedId, post.id, reaction)
                                }
                                showCounts={false}
                                variant='secondary'
                              />
                            </div>
                          )}
                        {(usePerPostPermissions
                          ? post.isOwner ||
                          post.permissions?.comment ||
                          !post.permissions
                          : canComment) && (
                          <button
                            type='button'
                            className='text-muted-foreground hover:text-foreground -m-1 inline-flex items-center gap-1 p-1 transition-colors'
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setCommentingOn(
                                commentingOn === post.id ? null : post.id
                              )
                            }}
                          >
                            <MessageSquare className='size-4' />
                          </button>
                        )}
                        {(isFeedOwner || post.isOwner) &&
                          onEditPost &&
                          onDeletePost && (
                            <>
                              <button
                                type='button'
                                className='text-muted-foreground hover:text-foreground -m-1 inline-flex items-center gap-1 p-1 transition-colors'
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setEditingPost({
                                    id: post.id,
                                    feedId: post.feedId,
                                    feedFingerprint: post.feedFingerprint,
                                    body: post.body,
                                    data: post.data ?? {},
                                    items: (post.attachments ?? []).map(
                                      (att) => ({
                                        kind: 'existing' as const,
                                        attachment: att,
                                      })
                                    ),
                                  })
                                }}
                              >
                                <Pencil className='size-4' />
                              </button>
                              <button
                                type='button'
                                className='text-muted-foreground hover:text-foreground -m-1 inline-flex items-center gap-1 p-1 transition-colors'
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setDeletingPost({
                                    id: post.id,
                                    feedId: post.feedId,
                                  })
                                }}
                              >
                                <Trash2 className='size-4' />
                              </button>
                            </>
                          )}
                      </span>
                    </div>
                  )}

                {/* Expanded comment input */}
                {commentingOn === post.id && (
                  <div
                    className='space-y-2'
                    onClick={(e) => e.stopPropagation()}
                  >
                    <textarea
                      placeholder={STRINGS.COMMENT_PLACEHOLDER}
                      value={commentDrafts[post.id] ?? ''}
                      onChange={(e) => onDraftChange(post.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault()
                          const draft = (
                            e.target as HTMLTextAreaElement
                          ).value.trim()
                          if (draft) {
                            onAddComment(post.feedId, post.id, draft, commentFiles.length > 0 ? commentFiles : undefined)
                            setCommentingOn(null)
                            setCommentFiles([])
                          }
                        } else if (e.key === 'Escape') {
                          setCommentingOn(null)
                          setCommentFiles([])
                        }
                      }}
                      className='w-full rounded-[8px] border px-3 py-2 text-sm'
                      rows={2}
                      autoFocus
                    />
                    {commentFiles.length > 0 && (
                      <div className='flex flex-wrap gap-2'>
                        {commentFiles.map((file, i) => (
                          <div key={i} className='bg-surface-2 relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs'>
                            {file.type.startsWith('image/') && (
                              <img src={URL.createObjectURL(file)} alt={file.name} className='h-8 w-8 rounded object-cover' />
                            )}
                            <Paperclip className='text-muted-foreground size-3 shrink-0' />
                            <span className='max-w-40 truncate'>{file.name}</span>
                            <button type='button' onClick={() => setCommentFiles((prev) => prev.filter((_, idx) => idx !== i))} className='text-muted-foreground hover:text-foreground ml-0.5'>
                              <X className='size-3.5' />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className='flex items-center justify-end gap-2'>
                      <input
                        ref={commentFileRef}
                        type='file'
                        multiple
                        onChange={(e) => { if (e.target.files) { const newFiles = Array.from(e.target.files); setCommentFiles((prev) => [...prev, ...newFiles]) } e.target.value = '' }}
                        className='hidden'
                      />
                      <Button type='button' variant='ghost' size='icon' className='size-8' onClick={() => commentFileRef.current?.click()} aria-label='Attach comment files'>
                        <Paperclip className='size-4' />
                      </Button>
                      <Button
                        type='button'
                        size='icon'
                        variant='ghost'
                        className='size-8'
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setCommentingOn(null)
                          setCommentFiles([])
                        }}
                        aria-label='Cancel comment'
                      >
                        <X className='size-4' />
                      </Button>
                      <Button
                        size='icon'
                        className='size-8'
                        disabled={!commentDrafts[post.id]?.trim()}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          const draft = commentDrafts[post.id]?.trim()
                          if (draft) {
                            onAddComment(post.feedId, post.id, draft, commentFiles.length > 0 ? commentFiles : undefined)
                            setCommentingOn(null)
                            setCommentFiles([])
                          }
                        }}
                        aria-label='Submit comment'
                      >
                        <Send className='size-4' />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Comments */}
                {post.comments.length > 0 && (
                  <div
                    className='border-t pt-3'
                    onClick={(e) => e.stopPropagation()}
                  >
                    {(() => {
                      const isExpanded = expandedComments[post.id]
                      const INITIAL_COMMENT_COUNT = 3
                      const visibleComments = isExpanded
                        ? post.comments
                        : post.comments.slice(0, INITIAL_COMMENT_COUNT)
                      const remaining =
                        post.comments.length - INITIAL_COMMENT_COUNT

                      return (
                        <>
                          {visibleComments.map((comment) => (
                            <CommentThread
                              key={comment.id}
                              comment={comment}
                              feedId={post.feedId}
                              postId={post.id}
                              replyingTo={replyingTo}
                              replyDraft={replyDraft}
                              onStartReply={(commentId) => {
                                setReplyingTo({ postId: post.id, commentId })
                                const selected = window.getSelection()?.toString().trim()
                                if (selected) {
                                  const quoted = selected.split('\n').map((line) => `> ${line}`).join('\n') + '\n\n'
                                  setReplyDraft(quoted)
                                } else {
                                  setReplyDraft('')
                                }
                              }}
                              onCancelReply={() => {
                                setReplyingTo(null)
                                setReplyDraft('')
                              }}
                              onReplyDraftChange={setReplyDraft}
                              onSubmitReply={async (commentId, files) => {
                                if (replyDraft.trim()) {
                                  await onReplyToComment(
                                    post.feedId,
                                    post.id,
                                    commentId,
                                    replyDraft.trim(),
                                    files
                                  )
                                  setReplyingTo(null)
                                  setReplyDraft('')
                                }
                              }}
                              onReact={(commentId, reaction) =>
                                onCommentReaction(
                                  post.feedId,
                                  post.id,
                                  commentId,
                                  reaction
                                )
                              }
                              onEdit={
                                onEditComment
                                  ? (commentId, body) =>
                                    onEditComment(
                                      post.feedId,
                                      post.id,
                                      commentId,
                                      body
                                    )
                                  : undefined
                              }
                              onDelete={
                                onDeleteComment
                                  ? (commentId) =>
                                    onDeleteComment(
                                      post.feedId,
                                      post.id,
                                      commentId
                                    )
                                  : undefined
                              }
                              onSearchPeople={(q) =>
                                feedsApi.searchMembers(post.feedId, q)
                              }
                              currentUserId={currentUserId}
                              canReact={
                                usePerPostPermissions
                                  ? post.isOwner ||
                                  post.permissions?.react ||
                                  post.permissions?.comment ||
                                  !post.permissions
                                  : canReact
                              }
                              canComment={
                                usePerPostPermissions
                                  ? post.isOwner ||
                                  post.permissions?.comment ||
                                  !post.permissions
                                  : canComment
                              }
                              canManageComments={
                                usePerPostPermissions
                                  ? post.isOwner ||
                                  post.permissions?.manage ||
                                  false
                                  : isFeedOwner ||
                                  permissions?.manage ||
                                  false
                              }
                            />
                          ))}
                          {!isExpanded && remaining > 0 && (
                            <button
                              type='button'
                              className='text-muted-foreground hover:text-foreground mt-2 text-xs font-medium transition-colors'
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setExpandedComments((prev) => ({
                                  ...prev,
                                  [post.id]: true,
                                }))
                              }}
                            >
                              View {remaining} more comments
                            </button>
                          )}
                        </>
                      )
                    })()}
                  </div>
                )}
              </div>
            </div>
          </Card>
        )

        return <div key={post.id} data-post-id={post.id} data-feed-id={post.feedFingerprint ?? post.feedId} ref={(el) => { if (observePost && el) observePost(el) }}>{cardContent}</div>
      })}

      {/* Delete post confirmation dialog */}
      <ConfirmDialog
        open={!!deletingPost}
        onOpenChange={(open) => !open && setDeletingPost(null)}
        title='Delete post'
        desc='Are you sure you want to delete this post? This will also delete all comments on this post. This action cannot be undone.'
        confirmText='Delete'
        destructive={true}
        handleConfirm={() => {
          if (deletingPost) {
            onDeletePost?.(deletingPost.feedId, deletingPost.id)
            setDeletingPost(null)
          }
        }}
      />

      {/* Place picker for editing */}
      <PlacePicker
        open={editPlacePickerOpen}
        onOpenChange={setEditPlacePickerOpen}
        onSelect={(place: PlaceData) => {
          if (editingPost) {
            // Checkin and travelling are mutually exclusive
            const { travelling, ...rest } = editingPost.data
            setEditingPost({
              ...editingPost,
              data: { ...rest, checkin: place },
            })
          }
          setEditPlacePickerOpen(false)
        }}
        title='Check in'
      />

      {/* Travelling picker for editing */}
      <TravellingPicker
        open={editTravellingPickerOpen}
        onOpenChange={setEditTravellingPickerOpen}
        onSelect={(origin: PlaceData, destination: PlaceData) => {
          if (editingPost) {
            // Checkin and travelling are mutually exclusive
            const { checkin, ...rest } = editingPost.data
            setEditingPost({
              ...editingPost,
              data: { ...rest, travelling: { origin, destination } },
            })
          }
        }}
      />
    </div>
  )
}
