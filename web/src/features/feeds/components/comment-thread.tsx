// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Plural, Trans } from '@lingui/react/macro'
import type { FeedComment, ReactionId } from '@/types'
import {
  Button,
  CommentTreeLayout,
  ConfirmDialog,
  EntityAvatar,
  getAppPath,
  MentionTextarea,
  renderMentions,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  useImageObjectUrls,
  type MentionUser,
  useFormat,
  textUnchanged,
  removePendingFile,
  moveItem,
  ActionPill,
  ActionPillSticky,
  ActionPillActions,
  ComposerAttachments,
  SendShortcutHint,
  dropActiveClass,
  offlineBlocked,
  useComposerDrop,
  useDiscardGuard,
  UploadProgress,
  type Upload,
} from '@mochi/web'
import endpoints from '@/api/endpoints'
import { mergePendingFiles } from '../utils'
import { Check, Loader2, Paperclip, Pencil, Plus, Reply, Send, Trash2, X } from 'lucide-react'
import { CommentAttachments } from './comment-attachments'
import { ReactionBar } from './reaction-bar'
import { t } from '@lingui/core/macro'

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
  /** Byte progress of an in-flight reply upload */
  progress?: Upload | null
  onReact: (commentId: string, reaction: ReactionId | '') => void
  onEdit?: (commentId: string, body: string) => void
  onDelete?: (commentId: string) => void
  currentUserId?: string
  depth?: number
  canReact?: boolean
  canComment?: boolean
  canManageComments?: boolean
  onSearchPeople?: (query: string) => Promise<MentionUser[]>
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
  progress,
  onReact,
  onEdit,
  onDelete,
  currentUserId,
  depth = 0,
  canReact = true,
  canComment = true,
  canManageComments = false,
  onSearchPeople,
}: CommentThreadProps) {
  const { formatTimestamp } = useFormat()
  const [collapsed, setCollapsed] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [replyFiles, setReplyFiles] = useState<File[]>([])
  const [isSubmittingReply, setIsSubmittingReply] = useState(false)
  const [replyFailed, setReplyFailed] = useState(false)
  const replyPreviewUrls = useImageObjectUrls(replyFiles)
  const replyFileRef = useRef<HTMLInputElement>(null)

  const handleSubmitReply = useCallback(async () => {
    if (isSubmittingReply || !replyDraft.trim() || offlineBlocked()) return
    setIsSubmittingReply(true)
    setReplyFailed(false)
    try {
      await onSubmitReply(comment.id, replyFiles.length > 0 ? replyFiles : undefined)
      setReplyFiles([])
    } catch {
      // The caller already reported the failure and took the optimistic reply
      // back; hold on to the files so Retry can send the same ones.
      setReplyFailed(true)
    } finally {
      setIsSubmittingReply(false)
    }
  }, [isSubmittingReply, replyDraft, onSubmitReply, comment.id, replyFiles])

  const addReplyFiles = useCallback((incoming: File[]) => {
    setReplyFailed(false)
    setReplyFiles((prev) => mergePendingFiles(prev, incoming))
  }, [])

  // Editing the draft after a failure means the red attachments and the Retry
  // button no longer describe what is in the box.
  const handleReplyDraftChange = useCallback(
    (value: string) => {
      setReplyFailed(false)
      onReplyDraftChange(value)
    },
    [onReplyDraftChange]
  )

  const { isDragActive, dropzoneProps } = useComposerDrop({
    onFiles: addReplyFiles,
    disabled: isSubmittingReply,
  })

  const { requestClose: requestCloseReply, discardDialog } = useDiscardGuard({
    hasText: replyDraft.trim().length > 0,
    hasFiles: replyFiles.length > 0,
    onDiscard: onCancelReply,
    locked: isSubmittingReply,
  })

  const isReplying =
    replyingTo?.postId === postId && replyingTo?.commentId === comment.id

  useEffect(() => {
    if (!isReplying && replyFiles.length > 0) setReplyFiles([])
  }, [isReplying, replyFiles.length])

  useEffect(() => {
    if (!isReplying && replyFailed) setReplyFailed(false)
  }, [isReplying, replyFailed])

  useEffect(() => {
    if (isReplying) onReplyFilesChange?.(replyFiles.length)
  }, [isReplying, replyFiles.length, onReplyFilesChange])

  const hasReplies = Boolean(comment.replies && comment.replies.length > 0)
  const isCommentOwner = Boolean(
    currentUserId && currentUserId === comment.subscriberId
  )

  const canEditComment = isCommentOwner && onEdit
  const canDeleteComment = (isCommentOwner || canManageComments) && onDelete

  const getTotalReplyCount = (c: FeedComment): number => {
    if (!c.replies) return 0
    return (
      c.replies.length +
      c.replies.reduce((acc, reply) => acc + getTotalReplyCount(reply), 0)
    )
  }
  const totalDescendants = getTotalReplyCount(comment)
  /* eslint-disable lingui/no-unlocalized-strings -- Tailwind class names */
  const iconActionButtonClass = 'inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground active:bg-interactive-active'

  const assetUrl = (slot: string) =>
    `${getAppPath()}/${endpoints.feeds.comment.asset(feedId, postId, comment.id, slot)}`
  const avatar = (
    <EntityAvatar
      src={assetUrl('avatar')}
      styleUrl={assetUrl('style')}
      seed={comment.subscriberId}
      name={comment.author}
      size="xs"
      className='z-10'
    />
  )

  const collapsedContent = (
    <div className='flex h-5 items-center gap-2 py-0.5 text-xs select-none'>
      <span className='text-muted-foreground font-medium'>
        {comment.author}
      </span>
      <span className='text-muted-foreground'>·</span>
      <span className='text-muted-foreground'>{formatTimestamp(comment.created)}</span>
      <button
        type='button'
        onClick={() => setCollapsed(false)}
        className='text-primary ms-2 flex cursor-pointer items-center gap-1 hover:underline'
      >
        {totalDescendants > 0 ? (
          <>
            <span className='flex items-center gap-1'>
              {totalDescendants > 1 && <Plus className='size-4' />}
              <Plural value={totalDescendants} one='1 reply' other='# more replies' />
            </span>
          </>
        ) : (
          <span className='text-muted-foreground italic'><Trans>(expanded)</Trans></span>
        )}
      </button>
    </div>
  )

  const content = (
    <div className='space-y-2 md:space-y-1.5'>
      {/* Per-row hover group - only this comment's row, not children */}
      <div className='group/row'>
        <div className='flex h-5 items-center gap-2 text-xs'>
          <span className='text-foreground font-medium'>{comment.author}</span>
          <span className='text-muted-foreground'>·</span>
          <span className='text-muted-foreground'>{formatTimestamp(comment.created)}</span>
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
        ) : (
          <p className='text-foreground text-sm leading-relaxed whitespace-pre-wrap'>
            {renderMentions(comment.body)}
          </p>
        )}

        <CommentAttachments attachments={comment.attachments} />

        {(() => {
          const hasReactions = !!(
            (comment.reactions && Object.values(comment.reactions).some((v) => (v ?? 0) > 0)) ||
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
                      buttonClassName="size-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-foreground/10"
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
                </ActionPillActions>
              </ActionPill>
            </div>
          )
        })()}
      </div>

      {isReplying && (
        <div
          className={cn(
            'mt-2 space-y-2 border-t pt-2',
            isDragActive && dropActiveClass
          )}
          // Close on Escape from anywhere in the form — after picking a file,
          // focus sits on a button, so the textarea's Escape never fires.
          onKeyDown={(e) => {
            if (e.key === 'Escape') requestCloseReply()
          }}
          {...dropzoneProps}
        >
          <MentionTextarea
            placeholder={t`Reply to ${comment.author}...`}
            value={replyDraft}
            onValueChange={handleReplyDraftChange}
            onSearchPeople={onSearchPeople}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                if (replyDraft.trim()) void handleSubmitReply()
              } else if (e.key === 'Escape') requestCloseReply()
            }}
            className='placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 min-h-0'
            rows={2}
            autoFocus
            disabled={isSubmittingReply}
          />
          <ComposerAttachments
            files={replyFiles}
            previewUrls={replyPreviewUrls}
            state={
              isSubmittingReply ? 'uploading' : replyFailed ? 'error' : 'idle'
            }
            progress={progress?.slices}
            onRemove={(file) =>
              setReplyFiles((prev) => removePendingFile(prev, file))
            }
            onReorder={(from, to) =>
              setReplyFiles((prev) => moveItem(prev, from, to))
            }
            // Retry sends the draft, so it is only offered while there is one.
            onRetry={
              replyDraft.trim() ? () => void handleSubmitReply() : undefined
            }
          />
          {isSubmittingReply && <UploadProgress progress={progress ?? null} />}
          <div className='flex items-center justify-end gap-2'>
            <SendShortcutHint />
            <input
              ref={replyFileRef}
              type='file'
              multiple
              onChange={(e) => { if (e.target.files) { addReplyFiles(Array.from(e.target.files)) } e.target.value = '' }}
              className='hidden'
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type='button' variant='ghost' size='icon' className='size-8' onClick={() => replyFileRef.current?.click()} disabled={isSubmittingReply} aria-label={t`Attach reply files`}>
                  <Paperclip className='size-4' />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t`Attach reply files`}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type='button'
                  size='icon'
                  variant='ghost'
                  className='size-8'
                  onClick={requestCloseReply}
                  disabled={isSubmittingReply}
                  aria-label={t`Cancel reply`}
                >
                  <X className='size-4' />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t`Cancel reply`}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type='button'
                  size='icon'
                  className='size-8'
                  disabled={!replyDraft.trim() || isSubmittingReply}
                  onClick={() => void handleSubmitReply()}
                  aria-label={t`Send reply`}
                >
                  {isSubmittingReply ? <Loader2 className='size-4 animate-spin' /> : <Send className='size-4' />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t`Send reply`}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t`Delete comment`}
        desc={t`Are you sure you want to delete this comment? This will also delete all replies. This action cannot be undone.`}
        confirmText={t`Delete`}
        destructive={true}
        handleConfirm={() => {
          onDelete?.(comment.id)
          setDeleting(false)
        }}
      />
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
          progress={progress}
          onReact={onReact}
          onEdit={onEdit}
          onDelete={onDelete}
          currentUserId={currentUserId}
          depth={depth + 1}
          canReact={canReact}
          canComment={canComment}
          canManageComments={canManageComments}
          onSearchPeople={onSearchPeople}
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
      avatar={avatar}
      content={content}
      collapsedContent={collapsedContent}
    >
      {children}
    </CommentTreeLayout>
  )
}
