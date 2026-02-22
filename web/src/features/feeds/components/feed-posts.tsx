import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import type { Attachment, FeedPermissions, FeedPost, ReactionId } from '@/types'
import {
  Button,
  Card,
  ConfirmDialog,
  MapView,
  PlacePicker,
  TravellingPicker,
  getAppPath,
  type PlaceData,
  type PostData,
} from '@mochi/common'
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  MessageSquare,
  Paperclip,
  Pencil,
  Plane,
  Rss,
  Send,
  Trash2,
  X,
} from 'lucide-react'

import { STRINGS } from '../constants'
import { sanitizeHtml, linkifyText } from '../utils'
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
  ) => void
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
  onTagRemoved?: (feedId: string, postId: string, tagId: string) => void
  onTagFilter?: (label: string) => void
  onInterestUp?: (qid: string) => void
  onInterestDown?: (qid: string) => void
  showFeedName?: boolean
  isFeedOwner?: boolean
  permissions?: FeedPermissions
  /** When true, disables click-to-navigate and hover styling (single post page) */
  singlePost?: boolean
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
  onTagRemoved,
  onTagFilter,
  onInterestUp,
  onInterestDown,
  showFeedName = false,
  isFeedOwner = false,
  permissions,
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

  const groupedPosts = useMemo(() => {
    // If we're not showing feed names (e.g. single feed view), treat each post as independent
    // to maintain exact existing behavior including absence of timestamps if they were absent
    if (!showFeedName) {
      return posts.map((post) => ({
        feedId: post.feedId,
        posts: [post],
      }))
    }

    const groups: { feedId: string; posts: FeedPost[] }[] = []
    let currentGroup: { feedId: string; posts: FeedPost[] } | null = null

    for (const post of posts) {
      if (currentGroup && currentGroup.feedId === post.feedId) {
        currentGroup.posts.push(post)
      } else {
        currentGroup = {
          feedId: post.feedId,
          posts: [post],
        }
        groups.push(currentGroup)
      }
    }
    return groups
  }, [posts, showFeedName])

  const navigate = useNavigate()

  if (posts.length === 0) {
    return null
  }

  // Full detailed view
  return (
    <div className='space-y-4'>
      {groupedPosts.map((group, groupIndex) => {
        const firstPost = group.posts[0]
        // Use a composite key for the group card
        const groupKey = `${firstPost.feedId}-${firstPost.id}-${groupIndex}`

        const cardContent = (
          <Card
            className={
              singlePost
                ? 'group/card relative overflow-hidden py-0'
                : 'group/card hover:border-primary/30 relative cursor-pointer overflow-hidden py-0 transition-all hover:shadow-md'
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
              
              navigate({
                to: '/$feedId/$postId',
                params: {
                  feedId: firstPost.feedFingerprint ?? firstPost.feedId,
                  postId: firstPost.id,
                },
              })
            }}
          >
            {/* Feed name header - shown once per group */}
            {showFeedName && firstPost.feedName && (
              <div className='text-muted-foreground flex items-center gap-2 px-4 pt-4 text-sm'>
                <Link
                  to='/$feedId'
                  params={{
                    feedId: firstPost.feedFingerprint ?? firstPost.feedId,
                  }}
                  className='hover:text-foreground inline-flex items-center gap-1.5 transition-colors'
                  onClick={(e) => e.stopPropagation()}
                >
                  <Rss className='size-3.5' />
                  <span className='font-medium'>{firstPost.feedName}</span>
                </Link>
              </div>
            )}

            <div className={showFeedName ? 'divide-y' : ''}>
              {group.posts.map((post) => (
                <div key={post.id} className='relative p-4'>
                  {/* Timestamp and source - top right, visible on hover */}
                  <span className='text-muted-foreground absolute right-4 top-4 text-xs opacity-0 transition-opacity group-hover/card:opacity-100'>
                    {post.source && <>{post.source.name} · </>}{post.createdAt}
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
                        className='min-h-24 w-full resize-none rounded-[8px] border px-3 py-2 text-base'
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
                                  ? (item.attachment.thumbnail_url ?? `${getAppPath()}/${editingPost.feedFingerprint ?? editingPost.feedId}/-/attachments/${item.attachment.id}/thumbnail`)
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
                                  className={`group/att relative flex items-center justify-center overflow-hidden rounded-[8px] ${
                                    isExisting
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
                                    className={`absolute top-2 left-2 ${
                                      isExisting
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
                    <div
                      className={`pr-20 text-lg leading-relaxed font-medium ${post.bodyHtml ? 'prose prose-lg dark:prose-invert max-w-none' : 'whitespace-pre-wrap'}`}
                      dangerouslySetInnerHTML={{
                        __html: post.bodyHtml ? sanitizeHtml(post.bodyHtml) : sanitizeHtml(linkifyText(post.body)),
                      }}
                    />
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
                          onRemove={(tagId) => onTagRemoved?.(post.feedId, post.id, tagId)}
                          onFilter={onTagFilter}
                          onAdd={onTagAdded
                            ? (label) => onTagAdded(post.feedFingerprint ?? post.feedId, post.id, label)
                            : undefined
                          }
                          onInterestUp={onInterestUp}
                          onInterestDown={onInterestDown}
                        />
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
                            className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors'
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
                                className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors'
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
                                className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors'
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
                        className='w-full resize-none rounded-[8px] border px-3 py-2 text-sm'
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
                          onChange={(e) => { if (e.target.files) { setCommentFiles((prev) => [...prev, ...Array.from(e.target.files!)]) } e.target.value = '' }}
                          className='hidden'
                        />
                        <Button type='button' variant='ghost' size='icon' className='size-8' onClick={() => commentFileRef.current?.click()}>
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
                                  setReplyDraft('')
                                }}
                                onCancelReply={() => {
                                  setReplyingTo(null)
                                  setReplyDraft('')
                                }}
                                onReplyDraftChange={setReplyDraft}
                                onSubmitReply={(commentId, files) => {
                                  if (replyDraft.trim()) {
                                    onReplyToComment(
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
                                isFeedOwner={isFeedOwner || post.isOwner}
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
              ))}
            </div>
          </Card>
        )

        return <div key={groupKey}>{cardContent}</div>
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
