// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { FeedComment, ReactionId } from '@/types'
import { t } from '@lingui/core/macro'
import { Plural, Trans } from '@lingui/react/macro'
import {
  Button,
  CommentBox,
  CommentShareButton,
  CommentTreeLayout,
  ConfirmDialog,
  EntityAvatar,
  authenticatedUrl,
  getAppPath,
  normalizeEntityUrl,
  MentionTextarea,
  renderMentions,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type MentionUser,
  useFormat,
  textUnchanged,
  ActionPill,
  ActionPillSticky,
  ActionPillActions,
  useDiscardGuard,
  type Upload,
} from '@mochi/web'
import {
  Ban,
  Check,
  Flag,
  Pencil,
  Plus,
  Reply,
  Trash2,
  VolumeX,
} from 'lucide-react'
import endpoints from '@/api/endpoints'
import { sanitizeHtml } from '../utils'
import { CommentAttachments } from './comment-attachments'
import { ReactionBar } from './reaction-bar'

type CommentThreadProps = {
  comment: FeedComment
  feedId: string
  postId: string
  replyingTo: { postId: string; commentId: string } | null
  replyDraft: string
  onStartReply: (commentId: string) => void
  onCancelReply: () => void
  onReplyDraftChange: (value: string) => void
  /** Reports how many files this comment has staged while it is the one being
   * replied to, so the list can warn before a switch throws them away. */
  onReplyFilesChange?: (count: number) => void
  onSubmitReply: (commentId: string, files?: File[]) => void | Promise<void>
  /** The account a reply also goes out from, shown above the reply box. */
  replyChoice?: (commentId: string) => ReactNode
  /** Byte progress of an in-flight reply upload */
  progress?: Upload | null
  onReact: (commentId: string, reaction: ReactionId | '') => void
  onEdit?: (commentId: string, body: string) => void
  onDelete?: (commentId: string) => void
  /**
   * The owner's moderation of a comment by a person on another network:
   * block or mute them, or report them to their own server with a reason.
   */
  onModerate?: (
    commentId: string,
    action: 'block' | 'mute' | 'report',
    reason?: string
  ) => void | Promise<void>
  currentUserId?: string
  depth?: number
  canReact?: boolean
  canComment?: boolean
  canManageComments?: boolean
  onSearchPeople?: (query: string) => Promise<MentionUser[]>
  /**
   * Opens the post's lightbox on the attachment a comment is anchored to,
   * comments showing.
   */
  onOpenAttachment?: (attachmentId: string) => void
  /** The full address of a comment, for its Share button. */
  shareUrl?: (commentId: string) => string
}

export function CommentThread({
  comment,
  feedId,
  postId,
  replyingTo,
  replyDraft,
  onStartReply,
  onCancelReply,
  onReplyDraftChange,
  onReplyFilesChange,
  onSubmitReply,
  replyChoice,
  progress,
  onReact,
  onEdit,
  onDelete,
  onModerate,
  currentUserId,
  depth = 0,
  canReact = true,
  canComment = true,
  canManageComments = false,
  onSearchPeople,
  onOpenAttachment,
  shareUrl,
}: CommentThreadProps) {
  const { formatTimestamp } = useFormat()
  const [collapsed, setCollapsed] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [deleting, setDeleting] = useState(false)
  // The owner's moderation of a comment from another network: which action
  // is being confirmed, and the reason given with a report.
  const [moderating, setModerating] = useState<
    'block' | 'mute' | 'report' | null
  >(null)
  const [reportReason, setReportReason] = useState('')
  // The reply box owns its files and reports their count; the guard here and
  // the one above (which arbitrates switching between reply boxes) read it.
  const [replyFileCount, setReplyFileCount] = useState(0)
  const [isSubmittingReply, setIsSubmittingReply] = useState(false)

  const isReplying =
    replyingTo?.postId === postId && replyingTo?.commentId === comment.id

  // Rejects on failure so the box keeps its files for Retry: the caller
  // already reported it and took the optimistic reply back.
  const handleSubmitReply = useCallback(
    async (_body: string, files?: File[]) => {
      setIsSubmittingReply(true)
      try {
        await onSubmitReply(comment.id, files)
      } finally {
        setIsSubmittingReply(false)
      }
    },
    [onSubmitReply, comment.id]
  )

  const handleReplyFilesChange = useCallback(
    (count: number) => {
      setReplyFileCount(count)
      onReplyFilesChange?.(count)
    },
    [onReplyFilesChange]
  )

  useEffect(() => {
    if (!isReplying) setReplyFileCount(0)
  }, [isReplying])

  const { requestClose: requestCloseReply, discardDialog } = useDiscardGuard({
    hasText: replyDraft.trim().length > 0,
    hasFiles: replyFileCount > 0,
    onDiscard: onCancelReply,
    locked: isSubmittingReply,
  })

  const hasReplies = Boolean(comment.replies && comment.replies.length > 0)
  const isCommentOwner = Boolean(
    currentUserId && currentUserId === comment.subscriberId
  )

  const canEditComment = isCommentOwner && onEdit
  const canDeleteComment = (isCommentOwner || canManageComments) && onDelete
  // A person on another network is known by their own id there, which a
  // Mochi identity never contains a colon; the owner may block, mute or
  // report them from their comment.
  const author = comment.author
  const outsider = comment.subscriberId.includes(':')
  const canModerate = outsider && canManageComments && !!onModerate
  const authorName = comment.page ? (
    <a
      href={comment.page}
      target='_blank'
      rel='noopener noreferrer'
      className='text-foreground font-medium hover:underline'
    >
      {comment.author}
    </a>
  ) : (
    <span className='text-foreground font-medium'>{comment.author}</span>
  )

  const getTotalReplyCount = (c: FeedComment): number => {
    if (!c.replies) return 0
    return (
      c.replies.length +
      c.replies.reduce((acc, reply) => acc + getTotalReplyCount(reply), 0)
    )
  }
  const totalDescendants = getTotalReplyCount(comment)

  const iconActionButtonClass =
    'inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground active:bg-interactive-active'

  const assetUrl = (slot: string) =>
    `${getAppPath()}/${endpoints.feeds.comment.asset(feedId, postId, comment.id, slot)}`
  const avatar = (
    <EntityAvatar
      src={assetUrl('avatar')}
      styleUrl={assetUrl('style')}
      seed={comment.subscriberId}
      name={comment.author}
      size='xs'
      className='z-10'
    />
  )

  const collapsedContent = (
    <div className='flex h-5 items-center gap-2 py-0.5 text-xs select-none'>
      <span className='text-muted-foreground font-medium'>
        {comment.author}
      </span>
      <span className='text-muted-foreground'>·</span>
      <span className='text-muted-foreground'>
        {formatTimestamp(comment.created)}
      </span>
      <button
        type='button'
        onClick={() => setCollapsed(false)}
        className='text-primary ms-2 flex cursor-pointer items-center gap-1 hover:underline'
      >
        {totalDescendants > 0 ? (
          <>
            <span className='flex items-center gap-1'>
              {totalDescendants > 1 && <Plus className='size-4' />}
              <Plural
                value={totalDescendants}
                one='# reply'
                other='# more replies'
              />
            </span>
          </>
        ) : (
          <span className='text-muted-foreground italic'>
            <Trans>(expanded)</Trans>
          </span>
        )}
      </button>
    </div>
  )

  const content = (
    <div className='space-y-2 md:space-y-1.5'>
      {/* Per-row hover group - only this comment's row, not children */}
      <div className='group/row'>
        <div
          data-comment-header=''
          className='flex h-5 items-center gap-2 text-xs'
        >
          {authorName}
          <span className='text-muted-foreground'>·</span>
          <span className='text-muted-foreground'>
            {formatTimestamp(comment.created)}
          </span>
          {comment.attachment && (
            <button
              type='button'
              className='text-muted-foreground hover:text-foreground ms-1 inline-flex min-w-0 items-center gap-1 rounded transition-colors'
              onClick={(event) => {
                event.stopPropagation()
                onOpenAttachment?.(comment.attachment!)
              }}
              title={comment.attachmentName || t`On this image`}
              aria-label={t`View the image this comment is about`}
            >
              <img
                src={authenticatedUrl(
                  normalizeEntityUrl(
                    `${getAppPath()}/${feedId}/-/attachments/${comment.attachment}/thumbnail`
                  )
                )}
                alt=''
                className='size-5 rounded object-cover text-transparent'
              />
              {comment.attachmentCaption && (
                <span className='max-w-32 truncate'>
                  {comment.attachmentCaption}
                </span>
              )}
            </button>
          )}
        </div>

        {editing === comment.id ? (
          <div className='space-y-2'>
            <MentionTextarea
              className='placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50'
              value={editBody}
              onValueChange={setEditBody}
              onSearchPeople={onSearchPeople}
              rows={3}
              autoFocus
            />
            <div className='flex justify-end gap-2'>
              <Button
                variant='outline'
                size='sm'
                className='h-7 text-xs'
                onClick={() => setEditing(null)}
              >
                <Trans>Cancel</Trans>
              </Button>
              <Button
                size='sm'
                className='h-7 text-xs'
                disabled={
                  !editBody.trim() ||
                  textUnchanged(editBody.trim(), comment.body)
                }
                onClick={() => {
                  const trimmed = editBody.trim()
                  if (!canEditComment) return
                  if (textUnchanged(trimmed, comment.body)) {
                    setEditing(null)
                    return
                  }
                  onEdit?.(comment.id, trimmed)
                  setEditing(null)
                }}
              >
                <Check className='size-4' />
                <Trans>Save</Trans>
              </Button>
            </div>
          </div>
        ) : comment.format === 'html' ? (
          // A comment from another network arrived as HTML, cleaned on the
          // way in; cleaned again here as every HTML body is.
          <div
            className='text-foreground prose prose-sm max-w-none text-sm leading-relaxed'
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(comment.body) }}
          />
        ) : (
          <p className='text-foreground text-sm leading-relaxed whitespace-pre-wrap'>
            {renderMentions(comment.body)}
          </p>
        )}

        <CommentAttachments attachments={comment.attachments} />

        {(() => {
          const hasReactions = !!(
            (comment.reactions &&
              Object.values(comment.reactions).some((v) => (v ?? 0) > 0)) ||
            comment.userReaction
          )
          return (
            <div className='flex min-h-8 items-center gap-2.5 pt-1.5 md:min-h-7 md:gap-2 md:pt-0.5'>
              <ActionPill
                sticky={hasReactions}
                hoverGroup='row'
                expandWidth={300}
                emptyReveal='opacity'
              >
                {hasReactions && (
                  <ActionPillSticky>
                    <ReactionBar
                      counts={comment.reactions}
                      activeReaction={comment.userReaction}
                      onSelect={(reaction) => onReact(comment.id, reaction)}
                      showButton={false}
                      showCounts={true}
                    />
                  </ActionPillSticky>
                )}

                <ActionPillActions>
                  {canReact && (
                    <ReactionBar
                      counts={comment.reactions}
                      activeReaction={comment.userReaction}
                      onSelect={(reaction) => onReact(comment.id, reaction)}
                      showButton={true}
                      showCounts={false}
                      variant='ghost'
                      buttonClassName='size-7 justify-center rounded-full p-0 text-muted-foreground hover:text-foreground hover:bg-foreground/10'
                    />
                  )}

                  {canComment && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type='button'
                          aria-label={t`Reply`}
                          className={iconActionButtonClass}
                          onClick={() => onStartReply(comment.id)}
                        >
                          <Reply className='size-4' />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{t`Reply`}</TooltipContent>
                    </Tooltip>
                  )}

                  {shareUrl && (
                    <CommentShareButton
                      getUrl={() => shareUrl(comment.id)}
                      className={`${iconActionButtonClass} [&>svg]:size-4`}
                    />
                  )}

                  {canEditComment && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type='button'
                          aria-label={t`Edit comment`}
                          className={iconActionButtonClass}
                          onClick={() => {
                            setEditing(comment.id)
                            setEditBody(comment.body)
                          }}
                        >
                          <Pencil className='size-4' />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{t`Edit comment`}</TooltipContent>
                    </Tooltip>
                  )}
                  {canDeleteComment && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type='button'
                          aria-label={t`Delete comment`}
                          className={iconActionButtonClass}
                          onClick={() => setDeleting(true)}
                        >
                          <Trash2 className='size-4' />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{t`Delete comment`}</TooltipContent>
                    </Tooltip>
                  )}
                  {canModerate && (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type='button'
                            aria-label={t`Mute ${author}`}
                            className={iconActionButtonClass}
                            onClick={() => setModerating('mute')}
                          >
                            <VolumeX className='size-4' />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t`Mute ${author}`}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type='button'
                            aria-label={t`Block ${author}`}
                            className={iconActionButtonClass}
                            onClick={() => setModerating('block')}
                          >
                            <Ban className='size-4' />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t`Block ${author}`}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type='button'
                            aria-label={t`Report ${author}`}
                            className={iconActionButtonClass}
                            onClick={() => {
                              setReportReason('')
                              setModerating('report')
                            }}
                          >
                            <Flag className='size-4' />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t`Report ${author}`}</TooltipContent>
                      </Tooltip>
                    </>
                  )}
                </ActionPillActions>
              </ActionPill>
            </div>
          )
        })()}
      </div>

      {isReplying && (
        <div className='mt-2 border-t pt-2'>
          {replyChoice?.(comment.id)}
          <CommentBox
            kind='reply'
            value={replyDraft}
            onValueChange={onReplyDraftChange}
            onSubmit={handleSubmitReply}
            onClose={requestCloseReply}
            onFilesChange={handleReplyFilesChange}
            onSearchPeople={onSearchPeople}
            progress={progress}
            placeholder={t`Reply to ${comment.author}...`}
            autoFocus
          />
        </div>
      )}

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t`Delete comment`}
        desc={t`Are you sure you want to delete this comment? This will also delete all replies. This action cannot be undone.`}
        confirmText={t`Delete`}
        icon={<Trash2 className='size-4' />}
        destructive={true}
        handleConfirm={() => {
          onDelete?.(comment.id)
          setDeleting(false)
        }}
      />
      <ConfirmDialog
        open={moderating === 'mute'}
        onOpenChange={(open) => !open && setModerating(null)}
        title={t`Mute ${author}?`}
        desc={t`They can still follow you, but nothing more they send reaches you.`}
        confirmText={t`Mute`}
        icon={<VolumeX className='size-4' />}
        handleConfirm={() => {
          void onModerate?.(comment.id, 'mute')
          setModerating(null)
        }}
      />
      <ConfirmDialog
        open={moderating === 'block'}
        onOpenChange={(open) => !open && setModerating(null)}
        title={t`Block ${author}?`}
        desc={t`They no longer follow you, and nothing more they send reaches you.`}
        confirmText={t`Block`}
        icon={<Ban className='size-4' />}
        destructive={true}
        handleConfirm={() => {
          void onModerate?.(comment.id, 'block')
          setModerating(null)
        }}
      />
      <ConfirmDialog
        open={moderating === 'report'}
        onOpenChange={(open) => !open && setModerating(null)}
        title={t`Report ${author}?`}
        desc={t`The report goes to the moderators of their own server, with this comment.`}
        confirmText={t`Report`}
        icon={<Flag className='size-4' />}
        handleConfirm={() => {
          void onModerate?.(comment.id, 'report', reportReason.trim())
          setModerating(null)
        }}
      >
        <MentionTextarea
          className='placeholder:text-muted-foreground'
          value={reportReason}
          onValueChange={setReportReason}
          rows={3}
          placeholder={t`Reason`}
          aria-label={t`Reason`}
        />
      </ConfirmDialog>
      {discardDialog}
    </div>
  )

  const children = hasReplies ? (
    <>
      {comment.replies!.map((reply) => (
        <CommentThread
          key={reply.id}
          comment={reply}
          feedId={feedId}
          postId={postId}
          replyingTo={replyingTo}
          replyDraft={replyDraft}
          onStartReply={onStartReply}
          onCancelReply={onCancelReply}
          onReplyDraftChange={onReplyDraftChange}
          onReplyFilesChange={onReplyFilesChange}
          onSubmitReply={onSubmitReply}
          replyChoice={replyChoice}
          progress={progress}
          onReact={onReact}
          onEdit={onEdit}
          onDelete={onDelete}
          onModerate={onModerate}
          currentUserId={currentUserId}
          depth={depth + 1}
          canReact={canReact}
          canComment={canComment}
          canManageComments={canManageComments}
          onSearchPeople={onSearchPeople}
          onOpenAttachment={onOpenAttachment}
          shareUrl={shareUrl}
        />
      ))}
    </>
  ) : null

  return (
    <CommentTreeLayout
      depth={depth}
      density='comfortable'
      isCollapsed={collapsed}
      onToggleCollapse={() => setCollapsed(!collapsed)}
      hasChildren={hasReplies}
      commentId={comment.id}
      avatar={avatar}
      content={content}
      collapsedContent={collapsedContent}
    >
      {children}
    </CommentTreeLayout>
  )
}
