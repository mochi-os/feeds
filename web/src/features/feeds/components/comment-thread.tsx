// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useCallback, useRef, useState } from 'react'
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
  Attachment,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentContent,
  AttachmentTitle,
  AttachmentDescription,
  AttachmentActions,
  AttachmentAction,
  useImageObjectUrls,
  type MentionUser,
  useFormat,
  textUnchanged,
} from '@mochi/web'
import endpoints from '@/api/endpoints'
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
  onSubmitReply: (commentId: string, files?: File[]) => void | Promise<void>
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
  onSubmitReply,
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
  const { formatTimestamp, formatFileSize } = useFormat()
  const [collapsed, setCollapsed] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [replyFiles, setReplyFiles] = useState<File[]>([])
  const [isSubmittingReply, setIsSubmittingReply] = useState(false)
  const replyPreviewUrls = useImageObjectUrls(replyFiles)
  const replyFileRef = useRef<HTMLInputElement>(null)

  const handleSubmitReply = useCallback(async () => {
    if (isSubmittingReply) return
    setIsSubmittingReply(true)
    try {
      await onSubmitReply(comment.id, replyFiles.length > 0 ? replyFiles : undefined)
      setReplyFiles([])
    } finally {
      setIsSubmittingReply(false)
    }
  }, [isSubmittingReply, onSubmitReply, comment.id, replyFiles])

  const isReplying =
    replyingTo?.postId === postId && replyingTo?.commentId === comment.id
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
  // eslint-disable-next-line lingui/no-unlocalized-strings -- Tailwind utility classes
  const iconActionButtonClass = 'text-muted-foreground hover:text-foreground inline-flex size-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:size-auto md:rounded-none md:p-0'

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

        <div className='flex min-h-8 items-center gap-2.5 pt-1.5 md:min-h-7 md:gap-2 md:pt-0.5'>
          {/* Reaction counts - always visible if user has reacted */}
          <ReactionBar
            counts={comment.reactions}
            activeReaction={comment.userReaction}
            onSelect={(reaction) => onReact(comment.id, reaction)}
            showButton={false}
            showCounts={true}
          />

          {/* Action buttons - always visible on mobile, hover-reveal on desktop */}
          <div className='flex items-center gap-1.5 transition-opacity pointer-events-auto opacity-100 md:gap-1 md:pointer-events-none md:opacity-0 md:group-hover/row:pointer-events-auto md:group-hover/row:opacity-100'>
            {canReact && (
              <ReactionBar
                counts={comment.reactions}
                activeReaction={comment.userReaction}
                onSelect={(reaction) => onReact(comment.id, reaction)}
                showButton={true}
                showCounts={false}
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
          </div>
        </div>
      </div>

      {isReplying && (
        <div className='mt-2 space-y-2 border-t pt-2'>
          <MentionTextarea
            placeholder={t`Reply to ${comment.author}...`}
            value={replyDraft}
            onValueChange={onReplyDraftChange}
            onSearchPeople={onSearchPeople}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                if (replyDraft.trim()) void handleSubmitReply()
              } else if (e.key === 'Escape') onCancelReply()
            }}
            className='min-h-0'
            rows={2}
            autoFocus
          />
          {replyFiles.length > 0 && (
            <AttachmentGroup>
              {replyFiles.map((file, i) => {
                const isImage = file.type.startsWith('image/')
                return (
                  <Attachment key={i} state="uploading" size="sm">
                    <AttachmentMedia variant={isImage ? "image" : "icon"}>
                      {isImage && replyPreviewUrls[i] ? (
                        <img src={replyPreviewUrls[i] ?? undefined} alt={file.name} draggable={false} />
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
                      <AttachmentAction onClick={() => setReplyFiles((prev) => prev.filter((_, idx) => idx !== i))} aria-label={t`Remove file`}>
                        <X className='size-4' />
                      </AttachmentAction>
                    </AttachmentActions>
                  </Attachment>
                )
              })}
            </AttachmentGroup>
          )}
          <div className='flex items-center justify-end gap-2'>
            <input
              ref={replyFileRef}
              type='file'
              multiple
              onChange={(e) => { if (e.target.files) { const f = Array.from(e.target.files); setReplyFiles((prev) => [...prev, ...f]) } e.target.value = '' }}
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
                  onClick={onCancelReply}
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
          onSubmitReply={onSubmitReply}
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
