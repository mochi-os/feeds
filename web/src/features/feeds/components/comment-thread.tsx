import { useState } from 'react'
import type { FeedComment, ReactionId } from '@/types'
import { Button, CommentTreeLayout, ConfirmDialog } from '@mochi/common'
import { Pencil, Plus, Reply, Send, Trash2, X } from 'lucide-react'
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
  onSubmitReply: (commentId: string) => void
  onReact: (commentId: string, reaction: ReactionId | '') => void
  onEdit?: (commentId: string, body: string) => void
  onDelete?: (commentId: string) => void
  isFeedOwner?: boolean
  depth?: number
  canReact?: boolean
  canComment?: boolean
  isLastChild?: boolean
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
  isFeedOwner = false,
  depth = 0,
  canReact = true,
  canComment = true,
  isLastChild = true,
}: CommentThreadProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [deleting, setDeleting] = useState(false)

  const isReplying =
    replyingTo?.postId === postId && replyingTo?.commentId === comment.id
  const hasReplies = Boolean(comment.replies && comment.replies.length > 0)

  const canEditComment = isFeedOwner && onEdit
  const canDeleteComment = isFeedOwner && onDelete

  const getTotalReplyCount = (c: FeedComment): number => {
    if (!c.replies) return 0
    return (
      c.replies.length +
      c.replies.reduce((acc, reply) => acc + getTotalReplyCount(reply), 0)
    )
  }
  const totalDescendants = getTotalReplyCount(comment)

  const avatar = (
    <div className='bg-primary text-primary-foreground flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold'>
      {comment.author.charAt(0).toUpperCase()}
    </div>
  )

  const collapsedContent = (
    <div className='flex h-5 items-center gap-2 py-0.5 text-xs select-none'>
      <span className='text-muted-foreground font-medium'>
        {comment.author}
      </span>
      <span className='text-muted-foreground'>·</span>
      <span className='text-muted-foreground'>{comment.createdAt}</span>
      <button
        onClick={() => setCollapsed(false)}
        className='text-primary ml-2 flex cursor-pointer items-center gap-1 hover:underline'
      >
        {totalDescendants > 0 ? (
          <>
            {totalDescendants === 1 ? (
              <span>1 reply</span>
            ) : (
              <span className='flex items-center gap-1'>
                <Plus className='size-3' />
                {totalDescendants} more replies
              </span>
            )}
          </>
        ) : (
          <span className='text-muted-foreground italic'>(expanded)</span>
        )}
      </button>
    </div>
  )

  const content = (
    <div className='space-y-1.5'>
      {/* Per-row hover group - only this comment's row, not children */}
      <div className='group/row'>
        <div className='flex h-5 items-center gap-2 text-xs'>
          <span className='text-foreground font-medium'>{comment.author}</span>
          <span className='text-muted-foreground'>·</span>
          <span className='text-muted-foreground'>{comment.createdAt}</span>
        </div>

        {editing === comment.id ? (
          <div className='space-y-2'>
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              className='min-h-16 w-full resize-none rounded-lg border px-3 py-2 text-sm'
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
                Cancel
              </Button>
              <Button
                size='sm'
                className='h-7 text-xs'
                disabled={!editBody.trim()}
                onClick={() => {
                  onEdit?.(comment.id, editBody.trim())
                  setEditing(null)
                }}
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <p className='text-foreground text-sm leading-relaxed whitespace-pre-wrap'>
            {comment.body}
          </p>
        )}

        <div className='flex min-h-[28px] items-center gap-2 pt-0.5'>
          {/* Reaction counts - always visible if user has reacted */}
          <ReactionBar
            counts={comment.reactions}
            activeReaction={comment.userReaction}
            onSelect={(reaction) => onReact(comment.id, reaction)}
            showButton={false}
            showCounts={true}
          />
          
          {/* Action buttons - visible on hover only */}
          <div className='flex items-center gap-1 opacity-0 transition-opacity pointer-events-none group-hover/row:opacity-100 group-hover/row:pointer-events-auto'>
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
              <button
                type='button'
                className='text-muted-foreground hover:bg-muted hover:text-foreground inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors'
                onClick={() => onStartReply(comment.id)}
              >
                <Reply className='size-3' />
                <span>Reply</span>
              </button>
            )}
            
            {canEditComment && (
              <button
                type='button'
                className='text-muted-foreground hover:bg-muted hover:text-foreground inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors'
                onClick={() => {
                  setEditing(comment.id)
                  setEditBody(comment.body)
                }}
              >
                <Pencil className='size-3' />
                <span>Edit</span>
              </button>
            )}
            {canDeleteComment && (
              <button
                type='button'
                className='text-muted-foreground hover:bg-destructive/10 hover:text-destructive inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors'
                onClick={() => setDeleting(true)}
              >
                <Trash2 className='size-3' />
                <span>Delete</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {isReplying && (
        <div className='mt-2 flex items-end gap-2 border-t pt-2'>
          <textarea
            placeholder={`Reply to ${comment.author}...`}
            value={replyDraft}
            onChange={(e) => onReplyDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                const value = (e.target as HTMLTextAreaElement).value.trim()
                if (value) onSubmitReply(comment.id)
              } else if (e.key === 'Escape') onCancelReply()
            }}
            className='flex-1 resize-none rounded-lg border px-3 py-2 text-sm'
            rows={2}
            autoFocus
          />
          <Button
            type='button'
            size='icon'
            variant='ghost'
            className='size-8'
            onClick={onCancelReply}
          >
            <X className='size-4' />
          </Button>
          <Button
            type='button'
            size='icon'
            className='size-8'
            disabled={!replyDraft.trim()}
            onClick={() => onSubmitReply(comment.id)}
          >
            <Send className='size-4' />
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title='Delete comment'
        desc='Are you sure you want to delete this comment? This will also delete all replies. This action cannot be undone.'
        confirmText='Delete'
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
      {comment.replies!.map((reply, index) => (
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
          isFeedOwner={isFeedOwner}
          depth={depth + 1}
          canReact={canReact}
          canComment={canComment}
          isLastChild={index === comment.replies!.length - 1}
        />
      ))}
    </>
  ) : null

  return (
    <CommentTreeLayout
      depth={depth}
      isLastChild={isLastChild}
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

