import { useState } from 'react'
import type { FeedComment, ReactionId } from '@/types'
import { Button, ConfirmDialog } from '@mochi/common'
import { Minus, Pencil, Plus, Reply, Send, Trash2, X } from 'lucide-react'
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
  ancestorLines?: boolean[] // For each ancestor depth, should we draw a vertical line?
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
  ancestorLines = [],
}: CommentThreadProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [deleting, setDeleting] = useState(false)

  const isReplying =
    replyingTo?.postId === postId && replyingTo?.commentId === comment.id
  const hasReplies = comment.replies && comment.replies.length > 0

  const canEdit = isFeedOwner && onEdit
  const canDelete = isFeedOwner && onDelete

  // Count total descendants for the collapsed text
  const getTotalReplyCount = (c: FeedComment): number => {
    if (!c.replies) return 0
    return (
      c.replies.length +
      c.replies.reduce((acc, reply) => acc + getTotalReplyCount(reply), 0)
    )
  }
  const totalDescendants = getTotalReplyCount(comment)

  return (
    <div className='relative flex gap-2 pb-2'>
      {/* Depth-based line columns - one column per ancestor depth level */}
      {depth > 0 && (
        <div className='flex shrink-0'>
          {/* Render a column for each depth level from 0 to depth-1 */}
          {Array.from({ length: depth }).map((_, i) => {
            const isAncestorColumn = i < depth
            const shouldDrawLine = i < ancestorLines.length && ancestorLines[i]
            const isCurrentDepth = i === depth - 1

            return (
              <div key={i} className='relative w-6'>
                {/* For ancestor columns: draw vertical line if ancestor has more siblings */}
                {isAncestorColumn && !isCurrentDepth && shouldDrawLine && (
                  <div className='bg-foreground/20 absolute top-0 bottom-0 left-3 w-px' />
                )}

                {/* For current depth column: draw the horizontal connector */}
                {isCurrentDepth && (
                  <>
                    {/* Vertical line extending down if this comment is NOT the last child */}
                    {!isLastChild && (
                      <div className='bg-foreground/20 absolute top-0 bottom-0 left-3 w-px' />
                    )}

                    {/* Horizontal branch connector */}
                    <div
                      className='border-foreground/20 absolute top-0 left-3 h-3 w-3 rounded-bl-lg border-b border-l'
                      style={{ borderBottomLeftRadius: '4px' }}
                    />
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Avatar Column */}
      <div className='relative flex shrink-0 flex-col items-center'>
        {/* Collapsed State */}
        {collapsed ? (
          <div className='bg-primary text-primary-foreground flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold'>
            {comment.author.charAt(0).toUpperCase()}
          </div>
        ) : (
          <>
            {/* Avatar */}
            <div className='bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold'>
              {comment.author.charAt(0).toUpperCase()}
            </div>

            {/* Collapse Toggle Button - positioned below avatar */}
            {hasReplies && (
              <button
                type='button'
                onClick={(e) => {
                  e.stopPropagation()
                  setCollapsed(!collapsed)
                }}
                className='bg-background hover:bg-muted text-muted-foreground border-foreground/20 mt-1 flex size-3 items-center justify-center rounded-sm border transition-colors'
                aria-label={collapsed ? 'Expand' : 'Collapse'}
              >
                {collapsed ? (
                  <Plus className='size-2.5' />
                ) : (
                  <Minus className='size-2.5' />
                )}
              </button>
            )}
          </>
        )}
      </div>

      {/* Content Column */}
      <div className='min-w-0 flex-1'>
        {/* Collapsed State */}
        {collapsed ? (
          <div className='flex items-center gap-2 py-1 text-xs select-none'>
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
        ) : (
          /* Expanded State */
          <>
            {/* Comment Header & Body */}
            <div className='space-y-1.5'>
              {/* Header */}
              <div className='flex items-center gap-2 text-xs'>
                <span className='text-foreground font-medium'>
                  {comment.author}
                </span>
                <span className='text-muted-foreground'>·</span>
                <span className='text-muted-foreground'>
                  {comment.createdAt}
                </span>
              </div>

              {/* Edit Mode */}
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
                /* Display Mode */
                <p className='text-foreground text-sm leading-relaxed whitespace-pre-wrap'>
                  {comment.body}
                </p>
              )}

              {/* Actions Bar */}
              <div className='flex min-h-[24px] items-center gap-4 pt-0.5'>
                <ReactionBar
                  counts={comment.reactions}
                  activeReaction={comment.userReaction}
                  onSelect={(reaction) => onReact(comment.id, reaction)}
                  showButton={canReact}
                  showCounts={true}
                />

                {canComment && (
                  <button
                    type='button'
                    className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs transition-colors'
                    onClick={() => onStartReply(comment.id)}
                  >
                    <Reply className='size-3' />
                    <span>Reply</span>
                  </button>
                )}

                {(canEdit || canDelete) && (
                  <div className='ml-auto flex items-center gap-3 opacity-0 transition-opacity group-hover:opacity-100'>
                    {canEdit && (
                      <button
                        type='button'
                        className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors'
                        onClick={() => {
                          setEditing(comment.id)
                          setEditBody(comment.body)
                        }}
                      >
                        <Pencil className='size-3' />
                        Edit
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type='button'
                        className='text-muted-foreground hover:text-destructive inline-flex items-center gap-1 text-xs transition-colors'
                        onClick={() => setDeleting(true)}
                      >
                        <Trash2 className='size-3' />
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Reply Input */}
            {isReplying && (
              <div className='mt-2 flex items-end gap-2 border-t pt-2'>
                <textarea
                  placeholder={`Reply to ${comment.author}...`}
                  value={replyDraft}
                  onChange={(e) => onReplyDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      const value = (
                        e.target as HTMLTextAreaElement
                      ).value.trim()
                      if (value) {
                        onSubmitReply(comment.id)
                      }
                    } else if (e.key === 'Escape') {
                      onCancelReply()
                    }
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
                  aria-label='Cancel reply'
                >
                  <X className='size-4' />
                </Button>
                <Button
                  type='button'
                  size='icon'
                  className='size-8'
                  disabled={!replyDraft.trim()}
                  onClick={() => onSubmitReply(comment.id)}
                  aria-label='Submit reply'
                >
                  <Send className='size-4' />
                </Button>
              </div>
            )}

            {/* Delete Dialog */}
            <ConfirmDialog
              open={deleting}
              onOpenChange={setDeleting}
              title='Delete comment'
              desc='Are you sure you want to delete this comment? This will also delete all replies. This action cannot be undone.'
              confirmText='Delete'
              handleConfirm={() => {
                onDelete?.(comment.id)
                setDeleting(false)
              }}
            />

            {/* Nested Replies */}
            {hasReplies && (
              <div className='mt-3'>
                {comment.replies!.map((reply, index) => {
                  // Calculate ancestorLines for the child
                  // The child needs to know: for each depth level, should we draw a vertical line?
                  // At our current depth: draw line if we (parent) are NOT the last child
                  const childAncestorLines = [...ancestorLines, !isLastChild]

                  return (
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
                      ancestorLines={childAncestorLines}
                    />
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
