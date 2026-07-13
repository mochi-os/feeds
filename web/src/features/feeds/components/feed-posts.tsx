// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { Attachment as AttachmentData, FeedPermissions, FeedPost, ReactionId } from '@/types'
import {
  Button,
  Card,
  ConfirmDialog,
  MapView,
  PlacePicker,
  TravellingPicker,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  getAppPath,
  authenticatedUrl,
  useImageObjectUrls,
  normalizeEntityUrl,
  type PlaceData,
  type PostData,
  Attachment,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentContent,
  AttachmentTitle,
  AttachmentDescription,
  AttachmentActions,
  AttachmentAction,
  useFormat,
  useListAutoAnimate,
  findCommentTextInTree,
  type MentionUser,
  pendingFileKey,
  removePendingFile,
} from '@mochi/web'
import {
  Check,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plane,
  Send,
  Trash2,
  X,
} from 'lucide-react'

import { Trans } from '@lingui/react/macro'
import { feedsApi } from '@/api/feeds'
import { sanitizeHtml, linkifyText, embedVideos, stripImages, stripEllipsis, extractImgAttrs, stripHtml } from '../utils'
import {
  buildFeedPostEditDraft,
  feedPostEditOriginalFromPost,
  isFeedPostEditUnchanged,
  type FeedPostEditOriginal,
} from '../edit-compare'
import { CommentThread } from './comment-thread'
import { SavedButton } from './saved-button'
import { PostAttachments } from './post-attachments'
import { PostTagsTooltip } from './post-tags'
import { ReactionBar } from './reaction-bar'
import { t } from '@lingui/core/macro'

// Unified attachment type for editing - can be existing or new
type EditingAttachment =
  | { kind: 'existing'; attachment: AttachmentData }
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
    original: FeedPostEditOriginal,
    data?: PostData,
    order?: string[],
    files?: File[]
  ) => void
  onDeletePost?: (feedId: string, postId: string) => void
  onEditComment?: (
    feedId: string,
    postId: string,
    commentId: string,
    body: string,
    originalBody: string
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
  isLoggedIn?: boolean
  permissions?: FeedPermissions
  onPostClick?: (postId: string, feedId?: string) => void
  observePost?: (el: HTMLElement | null) => void
  /** When true, disables click-to-navigate and hover styling (single post page) */
  singlePost?: boolean
  /** Read-only render (e.g. Saved page): shows tags/reaction counts + bookmark
   * but hides interactive reactions/comment/edit/delete controls. */
  readOnly?: boolean
  isFetchingNextPage?: boolean
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
        className='max-h-[250px] max-w-[600px] rounded-lg object-cover'
      />
    </a>
  )
}

function getRssTitle(post: FeedPost): string {
  return stripHtml(post.data?.rss?.title ?? '').trim()
}

const INITIAL_COMMENT_COUNT = 3

type PostCommentsListProps = {
  post: FeedPost
  isExpanded: boolean
  onExpand: () => void
  replyingTo: { postId: string; commentId: string } | null
  replyDraft: string
  onStartReply: (commentId: string) => void
  onCancelReply: () => void
  onReplyDraftChange: (value: string) => void
  onSubmitReply: (commentId: string, files?: File[]) => void | Promise<void>
  onReact: (commentId: string, reaction: ReactionId | '') => void
  onEdit?: (commentId: string, body: string) => void
  onDelete?: (commentId: string) => void
  onSearchPeople: (query: string) => Promise<MentionUser[]>
  currentUserId?: string
  canReact: boolean
  canComment: boolean
  canManageComments: boolean
}

function PostCommentsList({
  post,
  isExpanded,
  onExpand,
  replyingTo,
  replyDraft,
  onStartReply,
  onCancelReply,
  onReplyDraftChange,
  onSubmitReply,
  onReact,
  onEdit,
  onDelete,
  onSearchPeople,
  currentUserId,
  canReact,
  canComment,
  canManageComments,
}: PostCommentsListProps) {
  const [suppressBatchReveal, setSuppressBatchReveal] = useState(false)
  const [commentsListRef] = useListAutoAnimate<HTMLDivElement>({
    disabled: suppressBatchReveal,
  })

  const visibleComments = isExpanded
    ? post.comments
    : post.comments.slice(0, INITIAL_COMMENT_COUNT)
  const remaining = post.comments.length - INITIAL_COMMENT_COUNT

  useLayoutEffect(() => {
    if (!suppressBatchReveal) return
    const id = requestAnimationFrame(() => setSuppressBatchReveal(false))
    return () => cancelAnimationFrame(id)
  }, [suppressBatchReveal])

  return (
    <>
      <div ref={commentsListRef}>
        {visibleComments.map((comment) => (
          <CommentThread
            key={comment.id}
            comment={comment}
            feedId={post.feedId}
            postId={post.id}
            replyingTo={replyingTo}
            replyDraft={replyDraft}
            onStartReply={onStartReply}
            onCancelReply={onCancelReply}
            onReplyDraftChange={onReplyDraftChange}
            onSubmitReply={onSubmitReply}
            onReact={onReact}
            onEdit={onEdit}
            onDelete={onDelete}
            onSearchPeople={onSearchPeople}
            currentUserId={currentUserId}
            canReact={canReact}
            canComment={canComment}
            canManageComments={canManageComments}
          />
        ))}
      </div>
      {!isExpanded && remaining > 0 && (
        <button
          type='button'
          className='text-muted-foreground hover:text-foreground mt-2 text-xs font-medium transition-colors'
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setSuppressBatchReveal(true)
            onExpand()
          }}
        >
          <Trans>View {remaining} more comments</Trans>
        </button>
      )}
    </>
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
  isLoggedIn = true,
  permissions,
  onPostClick,
  observePost,
  singlePost = false,
  readOnly = false,
  isFetchingNextPage = false,
}: FeedPostsProps) {
  const { formatTimestamp, formatFileSize } = useFormat()
  const [listRef] = useListAutoAnimate<HTMLDivElement>({
    disabled: isFetchingNextPage,
  })
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
  const commentFilePreviewUrls = useImageObjectUrls(commentFiles)
  const [editingPost, setEditingPost] = useState<{
    id: string
    feedId: string
    feedFingerprint?: string
    body: string
    data: PostData
    items: EditingAttachment[]
  } | null>(null)
  const editingNewFiles = useMemo(
    () => (editingPost?.items ?? []).flatMap((item): File[] => item.kind === 'new' ? [item.file] : []),
    [editingPost?.items]
  )
  const editingNewPreviewUrls = useImageObjectUrls(editingNewFiles)
  const editingItemUrls = useMemo(() => {
    let ni = 0
    return (editingPost?.items ?? []).map((item) =>
      item.kind === 'new' ? editingNewPreviewUrls[ni++] ?? undefined : undefined
    )
  }, [editingPost?.items, editingNewPreviewUrls])
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
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
  const canReorder = (editingPost?.items.length ?? 0) > 1

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    if (!canReorder) return
    e.dataTransfer.setData('text/plain', index.toString())
    e.dataTransfer.effectAllowed = 'move'
    setDraggingIndex(index)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    if (!canReorder || draggingIndex === null || draggingIndex === index) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTargetIndex(index)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetIndex: number) => {
    if (!canReorder) return
    e.preventDefault()
    const sourceIndex = parseInt(e.dataTransfer.getData('text/plain') || draggingIndex?.toString() || '-1')
    if (sourceIndex === -1 || sourceIndex === targetIndex) {
      setDraggingIndex(null)
      setDropTargetIndex(null)
      return
    }
    setEditingPost((prev) => {
      if (!prev) return prev
      const result = [...prev.items]
      const [removed] = result.splice(sourceIndex, 1)
      result.splice(targetIndex, 0, removed)
      return { ...prev, items: result }
    })
    setDraggingIndex(null)
    setDropTargetIndex(null)
  }

  const handleDragEnd = () => {
    setDraggingIndex(null)
    setDropTargetIndex(null)
  }

  const navigate = useNavigate()

  if (posts.length === 0) {
    return null
  }

  return (
    <div className='space-y-4' ref={listRef}>
      {posts.map((post) => {
        const hasRssTitle = Boolean(post.data?.rss?.title)
        const rssTitle = hasRssTitle ? getRssTitle(post) : ''
        const cardContent = (
          <Card
            data-post-id={post.id}
            className={
              singlePost
                ? 'group/card relative overflow-hidden gap-0 py-0 md:py-0'
                : 'group/card hover:border-primary/30 relative cursor-pointer overflow-hidden gap-0 py-0 md:py-0 transition-all hover:shadow-md'
            }
            onClick={(e) => {
              if (singlePost) return
              // If propagation was stopped or default was prevented (by a button/link), don't navigate
              if (e.defaultPrevented) return

              // Allow default behavior for text selection
              if (window.getSelection()?.toString().length) return

              // Final check: don't navigate if clicking an interactive element
              // eslint-disable-next-line lingui/no-unlocalized-strings -- CSS selector
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
              {/* Timestamp and source - inline end, visible on hover */}
              <span className='text-muted-foreground bg-card absolute top-4 end-4 z-10 inline-flex items-center gap-1.5 rounded px-1 text-xs opacity-100 transition-opacity md:opacity-0 md:group-hover/card:opacity-100 md:group-focus-within/card:opacity-100'>
                {showFeedName && post.feedName && <>{post.feedName} · </>}
                {formatTimestamp(post.created)}
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
                                  <MapPin className='size-4 text-primary' />
                                  <span>
                                    <Trans>at {editingPost.data.checkin.name}</Trans>
                                  </span>
                                </div>
                                <Tooltip>
                                  <TooltipTrigger asChild>
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
                                      aria-label={t`Remove check-in`}
                                    >
                                      <X className='size-4' />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{t`Remove check-in`}</TooltipContent>
                                </Tooltip>
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
                                  <Plane className='size-4 text-primary' />
                                  <span>
                                    {editingPost.data.travelling.origin.name} –{' '}
                                    {
                                      editingPost.data.travelling.destination
                                        .name
                                    }
                                  </span>
                                </div>
                                <Tooltip>
                                  <TooltipTrigger asChild>
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
                                      aria-label={t`Remove travel route`}
                                    >
                                      <X className='size-4' />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{t`Remove travel route`}</TooltipContent>
                                </Tooltip>
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
                        <Trans>Check-in</Trans>
                      </Button>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => setEditTravellingPickerOpen(true)}
                      >
                        <Plane className='size-4' />
                        <Trans>Travelling</Trans>
                      </Button>
                    </div>

                    {/* Attachments grid - unified list of existing and new */}
                    {editingPost.items.length > 0 && (
                      <div className='space-y-2'>
                        <div className='text-muted-foreground text-xs font-medium'>
                          <Trans>Attachments</Trans>
                        </div>
                        <AttachmentGroup
                          onDragOver={(e) => {
                            if (canReorder) e.preventDefault()
                          }}
                        >
                          {editingPost.items.map((item, index) => {
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
                                ? editingItemUrls[index] ?? undefined
                                : undefined
                            const itemKey = isExisting
                              ? item.attachment.id
                              : `new-${item.file.name}-${item.file.size}-${item.file.lastModified}`
                            const isDragging = draggingIndex === index
                            const isDropTarget = dropTargetIndex === index

                            return (
                              <Attachment
                                key={itemKey}
                                draggable={canReorder}
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDrop={(e) => handleDrop(e, index)}
                                onDragEnd={handleDragEnd}
                                state={isExisting ? "done" : "uploading"}
                                className={`
                                  ${canReorder ? 'cursor-grab active:cursor-grabbing' : ''}
                                  ${isDragging ? 'opacity-40' : ''}
                                  ${isDropTarget ? 'ring-primary rounded-lg ring-2 ring-inset' : ''}
                                `}
                              >
                                <AttachmentMedia variant={isImage ? "image" : "icon"}>
                                  {isImage && (thumbnailUrl || previewUrl) ? (
                                    <img src={thumbnailUrl || previewUrl} alt={isExisting ? item.attachment.name : item.file.name} draggable={false} />
                                  ) : (
                                    <Paperclip />
                                  )}
                                </AttachmentMedia>
                                <AttachmentContent>
                                  <AttachmentTitle>
                                    {isExisting ? item.attachment.name : item.file.name}
                                  </AttachmentTitle>
                                  <AttachmentDescription>
                                    {isExisting ? formatFileSize(item.attachment.size) : formatFileSize(item.file.size)}
                                    {!isExisting && <span className="ml-2 px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px] uppercase font-bold"><Trans>New</Trans></span>}
                                  </AttachmentDescription>
                                </AttachmentContent>
                                <AttachmentActions>
                                  <AttachmentAction onClick={(e) => {
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
                                  }} aria-label={t`Remove`}>
                                    <X className='size-4' />
                                  </AttachmentAction>
                                </AttachmentActions>
                              </Attachment>
                            )
                          })}
                        </AttachmentGroup>
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
                        <Paperclip className='me-1 size-4' />
                        <Trans>Add files</Trans>
                      </Button>
                      <div className='flex gap-2'>
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => setEditingPost(null)}
                        >
                          <Trans>Cancel</Trans>
                        </Button>
                        <Button
                          size='sm'
                          disabled={
                            (() => {
                              if (!editingPost) return true
                              const original = feedPostEditOriginalFromPost(post)
                              const draft = buildFeedPostEditDraft(editingPost)
                              const empty =
                                !draft.body &&
                                !draft.data?.checkin &&
                                !draft.data?.travelling &&
                                editingPost.items.length === 0
                              if (empty) return true
                              return isFeedPostEditUnchanged(original, draft)
                            })()
                          }
                          onClick={() => {
                            if (!editingPost) return
                            const original = feedPostEditOriginalFromPost(post)
                            const draft = buildFeedPostEditDraft(editingPost)
                            if (isFeedPostEditUnchanged(original, draft)) {
                              setEditingPost(null)
                              return
                            }
                            onEditPost?.(
                              editingPost.feedId,
                              editingPost.id,
                              draft.body,
                              original,
                              draft.data,
                              draft.order,
                              draft.newFiles
                            )
                            setEditingPost(null)
                          }}
                        >
                          <Check className='size-4' />
                          <Trans>Save</Trans>
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (post.body.trim() || hasRssTitle) ? (
                  <>
                    {hasRssTitle && (
                      <div>
                        <a
                          href={post.data?.rss?.link || post.source?.url}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='text-lg font-semibold hover:underline'
                        >
                          {rssTitle}
                        </a>
                        {post.source && (
                          <span className='text-muted-foreground text-xs'>
                            {' '}· {post.source.name}
                          </span>
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
                            className='max-h-[250px] max-w-[600px] rounded-lg object-cover'
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
                              className={`prose prose-sm dark:prose-invert max-w-none text-foreground prose-p:my-3 prose-p:leading-relaxed prose-ul:my-3 prose-ul:list-disc prose-ul:ps-6 prose-ul:marker:text-foreground prose-ol:my-3 prose-ol:list-decimal prose-ol:ps-6 prose-ol:marker:text-foreground prose-li:my-1 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_table]:w-full [&_table]:border-collapse [&_table]:my-3 [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-start [&_th]:font-semibold [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 ${!post.bodyHtml && !post.data?.rss ? 'whitespace-pre-wrap' : ''} ${!singlePost && post.data?.rss ? 'line-clamp-6' : ''}`}
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
                          <MapPin className='size-4 text-primary' />
                          <span>{post.data.checkin.name}</span>
                        </div>
                      )}
                      {post.data?.travelling && (
                        <div className='flex items-center gap-1.5'>
                          <Plane className='size-4 text-success' />
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
                      {/* Attachments — maps count toward the cap so we show at most 8 tiles total. */}
                      {post.attachments && post.attachments.length > 0 && (
                        <PostAttachments
                          attachments={post.attachments}
                          feedId={post.feedFingerprint ?? post.feedId}
                          inline
                          mediaCap={8 - (post.data?.checkin ? 1 : 0) - (post.data?.travelling ? 1 : 0)}
                        />
                      )}
                    </div>
                  )}

                {/* Actions row - always visible */}
                {/* For aggregate view (usePerPostPermissions), check post.permissions; otherwise use component permissions */}
                {editingPost?.id !== post.id &&
                  (readOnly ||
                    canReact ||
                    canComment ||
                    isFeedOwner ||
                    post.isOwner ||
                    usePerPostPermissions) && (() => {
                    /* eslint-disable lingui/no-unlocalized-strings -- Tailwind class names */
                    const hasReactions = !!(
                      (post.reactions && Object.values(post.reactions).some((v) => (v ?? 0) > 0)) ||
                      post.userReaction
                    )
                    return (
                      <div
                        className='mt-4 flex items-center justify-start gap-2 text-sm'
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          {/* Tags */}
                          {isLoggedIn && (
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
                          )}
                        </div>

                        {/* Action pill: stored reaction chips stay visible; actions expand on hover (chat-style) */}
                        <div className="flex items-center gap-1 rtl:flex-row-reverse">
                          <div
                            className={
                              hasReactions
                                ? 'inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border/50 bg-muted/40 p-0.5 shadow-sm'
                                : 'inline-flex shrink-0 items-center gap-0.5 overflow-hidden rounded-full border border-border/50 bg-muted/40 p-0.5 shadow-sm transition-all duration-200 max-w-full opacity-100 pointer-events-auto md:max-w-0 md:opacity-0 md:pointer-events-none md:group-hover/card:max-w-[300px] md:group-hover/card:opacity-100 md:group-hover/card:pointer-events-auto md:group-focus-within/card:max-w-[300px] md:group-focus-within/card:opacity-100 md:group-focus-within/card:pointer-events-auto md:has-[[data-state=open]]:max-w-[300px] md:has-[[data-state=open]]:opacity-100 md:has-[[data-state=open]]:pointer-events-auto'
                            }
                          >
                            {/* Stored reaction chips — inside pill, always visible when present */}
                            {hasReactions && (
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
                                  showButton={false}
                                  showCounts={true}
                                />
                              </div>
                            )}

                            {/* Actions — expand on hover when reactions already keep the pill open */}
                            <div
                              className={
                                hasReactions
                                  ? 'flex items-center gap-0.5 overflow-hidden transition-all duration-200 max-w-full opacity-100 pointer-events-auto md:max-w-0 md:opacity-0 md:pointer-events-none md:group-hover/card:max-w-[300px] md:group-hover/card:opacity-100 md:group-hover/card:pointer-events-auto md:group-focus-within/card:max-w-[300px] md:group-focus-within/card:opacity-100 md:group-focus-within/card:pointer-events-auto md:has-[[data-state=open]]:max-w-[300px] md:has-[[data-state=open]]:opacity-100 md:has-[[data-state=open]]:pointer-events-auto'
                                  : 'flex items-center gap-0.5'
                              }
                            >
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
                                  showButton={!readOnly && (usePerPostPermissions ? post.isOwner || post.permissions?.react || post.permissions?.comment || !post.permissions : canReact)}
                                  showCounts={false}
                                  variant='ghost'
                                  buttonClassName="size-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-foreground/10"
                                />
                              </div>

                              {/* Comment/Reply Button */}
                              {!readOnly && (usePerPostPermissions
                                ? post.isOwner ||
                                post.permissions?.comment ||
                                !post.permissions
                                : canComment) && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type='button'
                                        variant='ghost'
                                        size='icon'
                                        className='size-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-foreground/10'
                                        aria-label={t`Comment`}
                                        onClick={(e) => {
                                          e.preventDefault()
                                          e.stopPropagation()
                                          setCommentingOn(
                                            commentingOn === post.id ? null : post.id
                                          )
                                        }}
                                      >
                                        <MessageSquare className='size-4' />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{t`Comment`}</TooltipContent>
                                  </Tooltip>
                                )}

                              {/* Save for later */}
                              {isLoggedIn && <SavedButton post={post} className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground active:bg-interactive-active" />}

                              {/* More Options (Edit / Delete) */}
                              {!readOnly && (isFeedOwner || post.isOwner) && onEditPost && onDeletePost && (
                                <DropdownMenu>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          type='button'
                                          variant='ghost'
                                          size='icon'
                                          className='size-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-foreground/10'
                                          aria-label={t`More options`}
                                          onClick={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                          }}
                                        >
                                          <MoreHorizontal className='size-4' />
                                        </Button>
                                      </DropdownMenuTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent>{t`More options`}</TooltipContent>
                                  </Tooltip>
                                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                    <DropdownMenuItem
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
                                      <Pencil className='mr-2 size-4' />
                                      <Trans>Edit post</Trans>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className='text-destructive focus:text-destructive'
                                      onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        setDeletingPost({
                                          id: post.id,
                                          feedId: post.feedId,
                                        })
                                      }}
                                    >
                                      <Trash2 className='mr-2 size-4' />
                                      <Trans>Delete post</Trans>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                    /* eslint-enable lingui/no-unlocalized-strings */
                  })()}

                {/* Expanded comment input */}
                {commentingOn === post.id && (
                  <div
                    className='space-y-2'
                    onClick={(e) => e.stopPropagation()}
                  >
                    <textarea
                      placeholder={t`Leave a comment...`}
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
                    <AttachmentGroup>
                      {commentFiles.map((file, i) => {
                        const isImage = file.type.startsWith('image/')
                        return (
                          <Attachment key={pendingFileKey(file)} state="uploading" size="sm">
                            <AttachmentMedia variant={isImage ? "image" : "icon"}>
                              {isImage && commentFilePreviewUrls[i] ? (
                                <img src={commentFilePreviewUrls[i] ?? undefined} alt={file.name} draggable={false} />
                              ) : (
                                <Paperclip />
                              )}
                            </AttachmentMedia>
                            <AttachmentContent>
                              <AttachmentTitle>{file.name}</AttachmentTitle>
                              <AttachmentDescription>
                                {formatFileSize(file.size)}
                              </AttachmentDescription>
                            </AttachmentContent>
                            <AttachmentActions>
                              <AttachmentAction onClick={() => setCommentFiles((prev) => removePendingFile(prev, file))} aria-label={t`Remove file`}>
                                <X className='size-4' />
                              </AttachmentAction>
                            </AttachmentActions>
                          </Attachment>
                        )
                      })}
                    </AttachmentGroup>
                    <div className='flex items-center justify-end gap-2'>
                      <input
                        ref={commentFileRef}
                        type='file'
                        multiple
                        onChange={(e) => { if (e.target.files) { const newFiles = Array.from(e.target.files); setCommentFiles((prev) => [...prev, ...newFiles]) } e.target.value = '' }}
                        className='hidden'
                      />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button type='button' variant='ghost' size='icon' className='size-8' onClick={() => commentFileRef.current?.click()} aria-label={t`Attach comment files`}>
                            <Paperclip className='size-4' />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t`Attach comment files`}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
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
                            aria-label={t`Cancel comment`}
                          >
                            <X className='size-4' />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t`Cancel comment`}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
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
                            aria-label={t`Submit comment`}
                          >
                            <Send className='size-4' />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t`Submit comment`}</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                )}

                {/* Comments */}
                {post.comments.length > 0 && (
                  <div
                    className='border-t pt-3'
                    onClick={(e) => e.stopPropagation()}
                  >
                    <PostCommentsList
                      post={post}
                      isExpanded={!!expandedComments[post.id]}
                      onExpand={() =>
                        setExpandedComments((prev) => ({
                          ...prev,
                          [post.id]: true,
                        }))
                      }
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
                              body,
                              findCommentTextInTree(post.comments ?? [], commentId, {
                                getId: (c) => c.id,
                                getText: (c) => c.body,
                                getChildren: (c) => c.replies,
                              }) ?? ''
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
                  </div>
                )}
              </div>
            </div>
          </Card>
        )

        return (
          <div
            key={post.id}
            data-post-id={post.id}
            data-feed-id={post.feedFingerprint ?? post.feedId}
            ref={(el) => {
              if (observePost && el) observePost(el)
            }}
          >
            {cardContent}
          </div>
        )
      })}

      {/* Delete post confirmation dialog */}
      <ConfirmDialog
        open={!!deletingPost}
        onOpenChange={(open) => !open && setDeletingPost(null)}
        title={t`Delete post`}
        desc={t`Are you sure you want to delete this post? This will also delete all comments on this post. This action cannot be undone.`}
        confirmText={t`Delete`}
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
        title={t`Check in`}
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
