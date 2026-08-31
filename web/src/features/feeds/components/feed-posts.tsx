// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { Attachment as AttachmentData, FeedComment, FeedPermissions, FeedPost, ReactionId } from '@/types'
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
  cn,
  type PlaceData,
  type PostData,
  AttachmentComposer,
  AttachmentAddTile,
  type ComposerItem,
  useFormat,
  useListAutoAnimate,
  moveItem,
  findCommentTextInTree,
  countCommentTree,
  type MentionUser,
  newPendingFiles,
  isMedia,
  isVideo,
  pendingFileKey,
  ActionPill,
  ActionPillSticky,
  ActionPillActions,
  CommentBox,
  Textarea,
  dropActiveClass,
  useComposerDrop,
  useDiscardGuard,
  UploadProgress,
  type Upload,
} from '@mochi/web'
import {
  Check,
  Loader2,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plane,
  Trash2,
  X,
} from 'lucide-react'

import { Trans } from '@lingui/react/macro'
import { feedsApi } from '@/api/feeds'
import { sanitizeHtml, linkifyText, embedVideos, stripImages, stripEllipsis, extractImgAttrs, stripHtml, safeHref } from '../utils'
import {
  buildFeedPostEditDraft,
  feedPostEditOriginalFromPost,
  isFeedPostEditUnchanged,
  type FeedPostEditOriginal,
} from '../edit-compare'
import { CommentThread } from './comment-thread'
import { SavedButton } from './saved-button'
import { PostAttachments } from './post-attachments'
import { AttachmentComments } from './attachment-comments'
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
  onAddComment: (feedId: string, postId: string, body?: string, files?: File[], attachment?: string) => void | Promise<void>
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
    files?: File[],
    captions?: Record<string, string>
  ) => boolean | Promise<boolean>
  /** Byte progress of an in-flight post-edit upload */
  editProgress?: Upload | null
  /** Byte progress of an in-flight comment or reply upload */
  commentProgress?: Upload | null
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
    <a href={safeHref(link)} target='_blank' rel='noopener noreferrer'>
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

export type PostCommentsListProps = {
  post: FeedPost
  isExpanded: boolean
  onExpand: () => void
  replyingTo: { postId: string; commentId: string } | null
  replyDraft: string
  onStartReply: (commentId: string) => void
  onCancelReply: () => void
  onReplyDraftChange: (value: string) => void
  onReplyFilesChange?: (count: number) => void
  onSubmitReply: (commentId: string, files?: File[]) => void | Promise<void>
  /** Byte progress of an in-flight reply upload */
  progress?: Upload | null
  onReact: (commentId: string, reaction: ReactionId | '') => void
  onEdit?: (commentId: string, body: string) => void
  onDelete?: (commentId: string) => void
  onSearchPeople: (query: string) => Promise<MentionUser[]>
  currentUserId?: string
  canReact: boolean
  canComment: boolean
  canManageComments: boolean
  onOpenAttachment?: (attachmentId: string) => void
  /**
   * Show only the top-level comments this returns true for; replies and actions
   * are unchanged.
   */
  filter?: (comment: FeedComment) => boolean
  /** Rendered in place of the list when the filter leaves nothing. */
  emptyState?: React.ReactNode
}

export function PostCommentsList({
  post,
  isExpanded,
  onExpand,
  replyingTo,
  replyDraft,
  onStartReply,
  onCancelReply,
  onReplyDraftChange,
  onReplyFilesChange,
  onSubmitReply,
  progress,
  onReact,
  onEdit,
  onDelete,
  onSearchPeople,
  currentUserId,
  canReact,
  canComment,
  canManageComments,
  onOpenAttachment,
  filter,
  emptyState,
}: PostCommentsListProps) {
  const [suppressBatchReveal, setSuppressBatchReveal] = useState(false)
  const [commentsListRef] = useListAutoAnimate<HTMLDivElement>({
    disabled: suppressBatchReveal,
  })

  const source = filter ? post.comments.filter(filter) : post.comments
  const visibleComments = isExpanded
    ? source
    : source.slice(0, INITIAL_COMMENT_COUNT)
  const remaining = source.length - INITIAL_COMMENT_COUNT

  useLayoutEffect(() => {
    if (!suppressBatchReveal) return
    const id = requestAnimationFrame(() => setSuppressBatchReveal(false))
    return () => cancelAnimationFrame(id)
  }, [suppressBatchReveal])

  // After every hook: the panel flips between empty and not as comments land.
  if (filter && source.length === 0 && emptyState) {
    return <>{emptyState}</>
  }

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
            onReplyFilesChange={onReplyFilesChange}
            onSubmitReply={onSubmitReply}
            progress={progress}
            onReact={onReact}
            onEdit={onEdit}
            onDelete={onDelete}
            onSearchPeople={onSearchPeople}
            currentUserId={currentUserId}
            canReact={canReact}
            canComment={canComment}
            canManageComments={canManageComments}
            onOpenAttachment={onOpenAttachment}
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
  editProgress,
  commentProgress,
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
  const { formatTimestamp } = useFormat()
  const [listRef] = useListAutoAnimate<HTMLDivElement>({
    disabled: isFetchingNextPage,
  })
  // Determine what actions are allowed based on permissions
  // For single feed view, use component-level permissions from API
  // For aggregate view (showFeedName), use per-post permissions
  const canReact = permissions?.react || permissions?.comment || isFeedOwner
  const canComment = permissions?.comment || isFeedOwner

  // One lightbox opener per post: a comment's image chip reaches into that
  // post's gallery to open the lightbox on its attachment, comments showing.
  const lightboxOpeners = useRef(new Map<string, { current: ((id: string) => void) | null }>())
  const openerFor = useCallback((postId: string) => {
    let ref = lightboxOpeners.current.get(postId)
    if (!ref) {
      ref = { current: null }
      lightboxOpeners.current.set(postId, ref)
    }
    return ref
  }, [])
  // When showing multiple feeds, check per-post permissions instead
  const usePerPostPermissions = showFeedName && !permissions
  const [replyingTo, setReplyingTo] = useState<{
    postId: string
    commentId: string
  } | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [commentingOn, setCommentingOn] = useState<string | null>(null)
  // The open comment box owns its files and reports their count, and it sends
  // through submitComment; both are read here only by the discard guards.
  const [commentFileCount, setCommentFileCount] = useState(0)
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)

  const [replyFileCount, setReplyFileCount] = useState(0)
  const pendingReplyTarget = useRef<{ postId: string; commentId: string } | null>(null)
  const pendingCommentSwitch = useRef<string | null>(null)

  /** Opens a post's comment box; a fresh mount starts it on a clean slate. */
  const openCommentBox = useCallback((postId: string) => {
    setCommentFileCount(0)
    setCommentingOn(postId)
  }, [])

  /** Closes the comment box and drops everything staged in it. */
  const discardComment = useCallback(
    (postId: string) => {
      setCommentingOn(null)
      setCommentFileCount(0)
      onDraftChange(postId, '')
    },
    [onDraftChange]
  )

  // Rejects on failure so the box keeps its draft and files for Retry: the
  // comment was rolled back and the draft restored upstream.
  const submitComment = useCallback(
    async (feedId: string, postId: string, body: string, files?: File[]) => {
      setIsSubmittingComment(true)
      try {
        await onAddComment(feedId, postId, body, files)
        setCommentingOn(null)
      } finally {
        setIsSubmittingComment(false)
      }
    },
    [onAddComment]
  )

  // Only one comment box is open at a time, so the guard can live up here and
  // read whichever post that is.
  const openCommentDraft = commentingOn ? (commentDrafts[commentingOn] ?? '') : ''
  const { requestClose: requestCloseComment, discardDialog: commentDiscardDialog } =
    useDiscardGuard({
      hasText: openCommentDraft.trim().length > 0,
      hasFiles: commentFileCount > 0,
      onDiscard: () => {
        if (commentingOn) discardComment(commentingOn)
        // A switch armed the target before asking; honour it once the
        // draft it would have overwritten is actually gone.
        const next = pendingCommentSwitch.current
        pendingCommentSwitch.current = null
        if (next) openCommentBox(next)
      },
      locked: isSubmittingComment,
    })

  // Plain closes (Escape, Cancel, toggling the same post) must not inherit
  // a switch target that a cancelled dialog left armed, or confirming a later
  // discard would jump to that stale post's box.
  const requestCloseCommentBox = useCallback(() => {
    pendingCommentSwitch.current = null
    requestCloseComment()
  }, [requestCloseComment])

  const startReply = useCallback((postId: string, commentId: string) => {
    setReplyingTo({ postId, commentId })
    setReplyFileCount(0)
    const selected = window.getSelection()?.toString().trim()
    if (selected) {
      const quoted = selected.split('\n').map((line) => `> ${line}`).join('\n') + '\n\n'
      setReplyDraft(quoted)
    } else {
      setReplyDraft('')
    }
  }, [])

  const cancelReply = useCallback(() => {
    setReplyingTo(null)
    setReplyDraft('')
    setReplyFileCount(0)
  }, [])

  // Opening another comment's reply box throws the current draft away, so it
  // asks first, exactly like closing the box does. The guard lives here rather
  // than in the thread because the comment being replied to is not the one
  // whose Reply button was clicked.
  const { requestClose: requestReplySwitch, discardDialog: replySwitchDialog } =
    useDiscardGuard({
      hasText: replyDraft.trim().length > 0,
      hasFiles: replyFileCount > 0,
      onDiscard: () => {
        const next = pendingReplyTarget.current
        pendingReplyTarget.current = null
        if (next) startReply(next.postId, next.commentId)
        else cancelReply()
      },
    })

  const handleStartReply = useCallback(
    (postId: string, commentId: string) => {
      if (
        replyingTo &&
        (replyingTo.commentId !== commentId || replyingTo.postId !== postId)
      ) {
        pendingReplyTarget.current = { postId, commentId }
        requestReplySwitch()
        return
      }
      startReply(postId, commentId)
    },
    [replyingTo, requestReplySwitch, startReply]
  )
  const [editingPost, setEditingPost] = useState<{
    id: string
    feedId: string
    feedFingerprint?: string
    body: string
    data: PostData
    items: EditingAttachment[]
    // Keyed by attachment id (existing) or pendingFileKey (new), so neither
    // removal nor reorder can re-attach a caption to the wrong item.
    captions: Record<string, string>
  } | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  // A rejected save used to leave the edit form looking untouched. The draft
  // and its staged files are still here, so the composer offers a retry.
  const [editFailed, setEditFailed] = useState(false)
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
  // The edit list mixes attachments already on the post with files not yet
  // uploaded, which is why it maps onto ComposerItem by hand rather than going
  // through the File[] wrapper.
  const editingItems = useMemo<ComposerItem[]>(() => {
    if (!editingPost) return []
    const container = editingPost.feedFingerprint ?? editingPost.feedId
    // Only the new files are in the body, so a new item's slice is keyed on its
    // rank among the new items, not on its position in this mixed list.
    let newIndex = 0
    return editingPost.items.map((item, index) => {
      if (item.kind === 'existing') {
        const att = item.attachment
        const isImage = att.type?.startsWith('image/')
        return {
          key: att.id,
          name: att.name,
          size: att.size,
          type: att.type ?? '',
          previewUrl: isImage
            ? authenticatedUrl(
                normalizeEntityUrl(
                  att.thumbnail_url ??
                    `${getAppPath()}/${container}/-/attachments/${att.id}/thumbnail`
                )
              )
            : null,
          caption: editingPost.captions[att.id],
          // Saved attachments are not part of the save's upload, so they keep
          // the still state while the new files pulse.
          state: 'idle' as const,
        }
      }
      const { file } = item
      return {
        key: pendingFileKey(file),
        name: file.name,
        size: file.size,
        type: file.type,
        previewUrl: isMedia(file.type) ? editingItemUrls[index] : null,
        previewKind: isVideo(file.type)
          ? ('video' as const)
          : ('image' as const),
        caption: editingPost.captions[pendingFileKey(file)],
        badge: (
          <span className='bg-primary/85 text-primary-foreground rounded px-1.5 py-0.5 text-[10px] font-bold uppercase'>
            <Trans>New</Trans>
          </span>
        ),
        progress: editProgress?.slices?.[newIndex++],
      }
    })
  }, [editingPost, editingItemUrls, editProgress])

  // One staging path for the picker and for a drop. The list mixes saved
  // attachments with new files, so the pick is filtered against the new ones
  // already in it rather than merged into a File[].
  const addEditFiles = useCallback((picked: File[]) => {
    if (picked.length === 0) return
    setEditingPost((current) => {
      if (!current) return current
      const staged = current.items.flatMap((item) =>
        item.kind === 'new' ? [item.file] : []
      )
      const newItems: EditingAttachment[] = newPendingFiles(staged, picked).map(
        (file) => ({ kind: 'new' as const, file })
      )
      if (newItems.length === 0) return current
      return { ...current, items: [...current.items, ...newItems] }
    })
  }, [])

  // Claims the drop for the post being edited. Without this the browser takes
  // it, navigates to the dropped file, and the edit draft goes with it.
  const { isDragActive: isEditDragActive, dropzoneProps: editDropzoneProps } =
    useComposerDrop({ onFiles: addEditFiles, disabled: editSaving })

  // Lifted out of the button so the composer's retry runs the same save.
  const saveEdit = useCallback(
    async (post: FeedPost) => {
      if (!editingPost || editSaving) return
      const original = feedPostEditOriginalFromPost(post)
      const draft = buildFeedPostEditDraft({
        ...editingPost,
        fileKey: pendingFileKey,
      })
      if (isFeedPostEditUnchanged(original, draft) || !onEditPost) {
        setEditingPost(null)
        return
      }
      // Keep the form open until the server confirms the save; a failed
      // upload leaves the draft (and its staged files) in place for another
      // attempt.
      setEditSaving(true)
      setEditFailed(false)
      try {
        const saved = await onEditPost(
          editingPost.feedId,
          editingPost.id,
          draft.body,
          original,
          draft.data,
          draft.order,
          draft.newFiles,
          draft.captions
        )
        if (saved) setEditingPost(null)
        else setEditFailed(true)
      } catch {
        setEditFailed(true)
      } finally {
        setEditSaving(false)
      }
    },
    [editingPost, editSaving, onEditPost]
  )

  // Everything the comment thread needs to reply, react, edit and delete,
  // built once per post: the inline thread and the lightbox's comments panel
  // both render the SAME PostCommentsList with these, so the panel is the
  // post's thread scoped to an image, not a second thread with fewer powers.
  const threadPropsFor = (post: FeedPost) => ({
    post,
    onOpenAttachment: (attachmentId: string) => openerFor(post.id).current?.(attachmentId),
    isExpanded: !!expandedComments[post.id],
    onExpand: () =>
      setExpandedComments((prev) => ({
        ...prev,
        [post.id]: true,
      })),
    replyingTo,
    replyDraft,
    onStartReply: (commentId: string) => handleStartReply(post.id, commentId),
    onCancelReply: cancelReply,
    onReplyDraftChange: setReplyDraft,
    onReplyFilesChange: setReplyFileCount,
    progress: commentProgress,
    onSubmitReply: async (commentId: string, files?: File[]) => {
      if (replyDraft.trim()) {
        await onReplyToComment(post.feedId, post.id, commentId, replyDraft.trim(), files)
        setReplyingTo(null)
        setReplyDraft('')
      }
    },
    onReact: (commentId: string, reaction: ReactionId | '') =>
      onCommentReaction(post.feedId, post.id, commentId, reaction),
    onEdit: onEditComment
      ? (commentId: string, body: string) =>
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
      : undefined,
    onDelete: onDeleteComment
      ? (commentId: string) => onDeleteComment(post.feedId, post.id, commentId)
      : undefined,
    onSearchPeople: (q: string) => feedsApi.searchMembers(post.feedId, q),
    currentUserId,
    canReact: usePerPostPermissions
      ? post.isOwner || post.permissions?.react || post.permissions?.comment || !post.permissions
      : canReact,
    canComment: usePerPostPermissions
      ? post.isOwner || post.permissions?.comment || !post.permissions
      : canComment,
    canManageComments: usePerPostPermissions
      ? post.isOwner || post.permissions?.manage || false
      : isFeedOwner || permissions?.manage || false,
  })

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
              // The edit form is full of non-interactive targets - attachment
              // tiles, the check-in map, whitespace, a drag's release - and a
              // navigation from any of them would unmount the form and destroy
              // the draft.
              if (editingPost?.id === post.id) return
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
                  <div
                    className={cn(
                      'space-y-3',
                      isEditDragActive && dropActiveClass
                    )}
                    {...editDropzoneProps}
                  >
                    <Textarea
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
                      className='min-h-24 rounded-[8px] md:text-base'
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

                    {/* Attachments grid - existing and new in one list; the add tile is its last cell. */}
                    <div className='space-y-2'>
                        <AttachmentComposer
                          items={editingItems}
                          layout='grid'
                          preview='tile'
                          groupMedia
                          blockLabels={{
                            media: <Trans>Photos and videos</Trans>,
                            files: <Trans>Files</Trans>,
                          }}
                          addSlot={
                            <AttachmentAddTile
                              label={<Trans>Add files</Trans>}
                              onClick={() => fileInputRef.current?.click()}
                              disabled={editSaving}
                            />
                          }
                          state={
                            editSaving
                              ? 'uploading'
                              : editFailed
                                ? 'error'
                                : 'idle'
                          }
                          onRetry={() => void saveEdit(post)}
                          onRemove={(index) =>
                            setEditingPost((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    items: prev.items.filter((_, i) => i !== index),
                                  }
                                : prev
                            )
                          }
                          onReorder={(from, to) =>
                            setEditingPost((prev) =>
                              prev
                                ? { ...prev, items: moveItem(prev.items, from, to) }
                                : prev
                            )
                          }
                          onCaption={(index, caption) =>
                            setEditingPost((prev) => {
                              const item = prev?.items[index]
                              if (!prev || !item) return prev
                              const key =
                                item.kind === 'existing'
                                  ? item.attachment.id
                                  : pendingFileKey(item.file)
                              const captions = { ...prev.captions }
                              if (caption) captions[key] = caption
                              else delete captions[key]
                              return { ...prev, captions }
                            })
                          }
                        />
                    </div>

                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type='file'
                      multiple
                      className='hidden'
                      onChange={(e) => {
                        // Copy the FileList before resetting the input: it is
                        // live, so clearing the value empties it.
                        const picked = Array.from(e.target.files ?? [])
                        e.target.value = ''
                        addEditFiles(picked)
                      }}
                    />

                    <UploadProgress progress={editProgress ?? null} />

                    <div className='flex justify-end'>
                      <div className='flex gap-2'>
                        <Button
                          variant='outline'
                          size='sm'
                          disabled={editSaving}
                          onClick={() => setEditingPost(null)}
                        >
                          <Trans>Cancel</Trans>
                        </Button>
                        <Button
                          size='sm'
                          disabled={
                            editSaving ||
                            (() => {
                              if (!editingPost) return true
                              const original = feedPostEditOriginalFromPost(post)
                              const draft = buildFeedPostEditDraft({
                                ...editingPost,
                                fileKey: pendingFileKey,
                              })
                              const empty =
                                !draft.body &&
                                !draft.data?.checkin &&
                                !draft.data?.travelling &&
                                editingPost.items.length === 0
                              if (empty) return true
                              return isFeedPostEditUnchanged(original, draft)
                            })()
                          }
                          onClick={() => void saveEdit(post)}
                        >
                          {editSaving ? (
                            <Loader2 className='size-4 animate-spin' />
                          ) : (
                            <Check className='size-4' />
                          )}
                          {editSaving ? (
                            <Trans>Saving…</Trans>
                          ) : (
                            <Trans>Save</Trans>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (post.body.trim() || hasRssTitle) ? (
                  <>
                    {hasRssTitle && (
                      <div>
                        <a
                          href={safeHref(post.data?.rss?.link)}
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
                      const href = safeHref(post.data.rss.link)
                      const image = (
                        <img
                          src={post.data.rss.image}
                          alt={imgAttrs.alt || post.data.rss.title || ''}
                          title={imgAttrs.title || undefined}
                          className='max-h-[250px] max-w-[600px] rounded-lg object-cover'
                        />
                      )
                      return href ? (
                        <a href={href} target='_blank' rel='noopener noreferrer'>
                          {image}
                        </a>
                      ) : image
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
                      // Alt text is not rendered as a caption: the feed's AI
                      // transform moves an image-only item's title/alt into the
                      // body (ingest_rss_items), and a caption duplicated it.
                      return (
                        <>
                          {(hasText || hasImages) && (
                            <div
                              className={`prose prose-sm dark:prose-invert max-w-none text-foreground prose-p:my-3 prose-p:leading-relaxed prose-ul:my-3 prose-ul:list-disc prose-ul:ps-6 prose-ul:marker:text-foreground prose-ol:my-3 prose-ol:list-decimal prose-ol:ps-6 prose-ol:marker:text-foreground prose-li:my-1 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_table]:w-full [&_table]:border-collapse [&_table]:my-3 [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-start [&_th]:font-semibold [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 ${!post.bodyHtml && !post.data?.rss ? 'whitespace-pre-wrap' : ''} ${!singlePost && post.data?.rss ? 'line-clamp-6' : ''}`}
                              dangerouslySetInnerHTML={{ __html: embedVideos(rawHtml) }}
                            />
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
                          commentCount={(attachmentId) =>
                            countCommentTree(
                              post.comments.filter((comment) => comment.attachment === attachmentId),
                              (comment) => comment.replies
                            )
                          }
                          renderComments={(attachmentId) => (
                            <AttachmentComments
                              attachmentId={attachmentId}
                              thread={threadPropsFor(post)}
                              canComment={!readOnly && threadPropsFor(post).canComment}
                              onAddComment={
                                readOnly
                                  ? undefined
                                  : (body, files, attachment) =>
                                      onAddComment(post.feedId, post.id, body, files, attachment)
                              }
                            />
                          )}
                          openerRef={openerFor(post.id)}
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

                        {/* Action pill: stored reaction chips stay visible; actions expand on hover */}
                        <div className="flex items-center gap-1">
                          {isLoggedIn && (
                            <SavedButton
                              post={post}
                              className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground active:bg-interactive-active"
                            />
                          )}
                          <ActionPill
                            sticky={hasReactions}
                            hoverGroup="card"
                            expandWidth={300}
                            emptyReveal="max-width"
                          >
                            {hasReactions && (
                              <ActionPillSticky
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
                              </ActionPillSticky>
                            )}

                            <ActionPillActions>
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
                                          // Closing goes through the same guard
                                          // as Escape and Cancel, so a draft is
                                          // never dropped without asking.
                                          if (commentingOn === post.id) {
                                            requestCloseCommentBox()
                                            return
                                          }
                                          // Moving to another post's box drops
                                          // the open one, so it asks too.
                                          if (commentingOn) {
                                            pendingCommentSwitch.current = post.id
                                            requestCloseComment()
                                            return
                                          }
                                          openCommentBox(post.id)
                                        }}
                                      >
                                        <MessageSquare className='size-4' />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{t`Comment`}</TooltipContent>
                                  </Tooltip>
                                )}

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
                                          captions: Object.fromEntries(
                                            (post.attachments ?? []).flatMap(
                                              (att) =>
                                                att.caption
                                                  ? [[att.id, att.caption]]
                                                  : []
                                            )
                                          ),
                                        })
                                      }}
                                    >
                                      <Pencil className='me-2 size-4' />
                                      <Trans>Edit post</Trans>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        setDeletingPost({
                                          id: post.id,
                                          feedId: post.feedId,
                                        })
                                      }}
                                    >
                                      <Trash2 className='me-2 size-4' />
                                      <Trans>Delete post</Trans>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </ActionPillActions>
                          </ActionPill>
                        </div>
                      </div>
                    )
                     
                  })()}

                {/* Expanded comment input */}
                {commentingOn === post.id && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <CommentBox
                      value={commentDrafts[post.id] ?? ''}
                      onValueChange={(value) => onDraftChange(post.id, value)}
                      onSubmit={(body, files) => submitComment(post.feedId, post.id, body, files)}
                      onClose={requestCloseCommentBox}
                      onFilesChange={setCommentFileCount}
                      onSearchPeople={(q) => feedsApi.searchMembers(post.feedId, q)}
                      progress={commentProgress}
                      placeholder={t`Leave a comment...`}
                      textareaClassName='rounded-[8px] text-sm'
                      autoFocus
                    />
                  </div>
                )}

                {/* Comments */}
                {post.comments.length > 0 && (
                  <div
                    className='border-t pt-3'
                    onClick={(e) => e.stopPropagation()}
                  >
                    <PostCommentsList {...threadPropsFor(post)} />
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
          setEditTravellingPickerOpen(false)
        }}
      />

      {commentDiscardDialog}
      {replySwitchDialog}
    </div>
  )
}
