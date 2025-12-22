import { useState } from 'react'
import { Button, ConfirmDialog } from '@mochi/common'
import type { FeedComment, ReactionId } from '@/types'
import { Pencil, Reply, Send, Trash2, X } from 'lucide-react'
import { ReactionBar, hasReactions } from './reaction-bar'

// Reddit-style rainbow colors for nested comment threads
const THREAD_COLORS = [
  'bg-blue-500',
  'bg-cyan-500',
  'bg-green-500',
  'bg-yellow-500',
  'bg-orange-500',
  'bg-red-500',
  'bg-pink-500',
  'bg-purple-500',
]

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
}: CommentThreadProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [deleting, setDeleting] = useState(false)
  const isReplying = replyingTo?.postId === postId && replyingTo?.commentId === comment.id
  const hasReplies = comment.replies && comment.replies.length > 0
  const lineColor = THREAD_COLORS[depth % THREAD_COLORS.length]
  // Show edit/delete for feed owner (can edit/delete any comment)
  const canEdit = isFeedOwner && onEdit
  const canDelete = isFeedOwner && onDelete

  return (
    <div className='flex'>
      {/* Colored thread line */}
      <button
        type='button'
        onClick={() => setCollapsed(!collapsed)}
        className='group flex-shrink-0 w-5 flex justify-center cursor-pointer'
        aria-label={collapsed ? 'Expand thread' : 'Collapse thread'}
      >
        <div className={`w-0.5 h-full ${lineColor} opacity-40 group-hover:opacity-100 transition-opacity`} />
      </button>

      {/* Content */}
      <div className='flex-1 min-w-0 py-2 pl-2'>
        {/* Collapsed state */}
        {collapsed && (
          <div className='flex items-center gap-2 text-xs text-muted-foreground'>
            <span>{comment.author} · {comment.createdAt}</span>
            <span className='text-primary'>
              {hasReplies ? `(${comment.replies!.length} replies hidden)` : '(collapsed)'}
            </span>
          </div>
        )}

        {!collapsed && (
          <>
            {/* Comment's own content - hover target excludes nested replies */}
            <div className='comment-content space-y-2'>
              {/* Comment body - show edit form if editing */}
              {editing === comment.id ? (
                <div className='space-y-2'>
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    className='w-full border rounded-md px-3 py-2 text-sm resize-none min-h-16'
                    rows={3}
                    autoFocus
                  />
                  <div className='flex justify-end gap-2'>
                    <Button variant='outline' size='sm' className='h-7 text-xs' onClick={() => setEditing(null)}>
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
                <div className='relative'>
                  <p className='text-sm leading-relaxed whitespace-pre-wrap pr-32'>{comment.body}</p>
                  {/* Author and timestamp - hidden until hover */}
                  <span className='comment-meta absolute top-0 right-0 text-xs text-muted-foreground transition-opacity'>
                    {comment.author} · {comment.createdAt}
                  </span>
                </div>
              )}

              {/* Reactions and reply row - hidden until hover unless reactions exist */}
              {(canReact || canComment || canEdit || canDelete) && (
                <div className={`comment-actions-row flex items-center gap-1 text-xs text-muted-foreground pt-1 transition-opacity ${
                  hasReactions(comment.reactions, comment.userReaction) ? 'has-reactions' : ''
                }`}>
                  {/* Reaction counts - always visible if present */}
                  <ReactionBar
                    counts={comment.reactions}
                    activeReaction={comment.userReaction}
                    onSelect={(reaction) => onReact(comment.id, reaction)}
                    showButton={false}
                  />
                  {/* Action buttons - visible on hover */}
                  <div className='comment-actions flex items-center gap-3 transition-opacity'>
                    {canReact && (
                      <ReactionBar
                        counts={comment.reactions}
                        activeReaction={comment.userReaction}
                        onSelect={(reaction) => onReact(comment.id, reaction)}
                        showCounts={false}
                      />
                    )}
                    {canComment && (
                      <button
                        type='button'
                        className='inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors'
                        onClick={() => onStartReply(comment.id)}
                      >
                        <Reply className='size-3' />
                        Reply
                      </button>
                    )}
                    {canEdit && (
                      <button
                        type='button'
                        className='inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors'
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
                        className='inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors'
                        onClick={() => setDeleting(true)}
                      >
                        <Trash2 className='size-3' />
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Delete confirmation dialog */}
              <ConfirmDialog
                open={deleting}
                onOpenChange={setDeleting}
                title="Delete comment"
                desc="Are you sure you want to delete this comment? This will also delete all replies. This action cannot be undone."
                confirmText="Delete"
                handleConfirm={() => {
                  onDelete?.(comment.id)
                  setDeleting(false)
                }}
              />

              {/* Reply input */}
              {isReplying && (
                <div className='flex items-end gap-2 mt-2'>
                  <textarea
                    placeholder={`Reply to ${comment.author}...`}
                    value={replyDraft}
                    onChange={(e) => onReplyDraftChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault()
                        const value = (e.target as HTMLTextAreaElement).value.trim()
                        if (value) {
                          onSubmitReply(comment.id)
                        }
                      } else if (e.key === 'Escape') {
                        onCancelReply()
                      }
                    }}
                    className='flex-1 border rounded-md px-3 py-2 text-sm resize-none'
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
            </div>

            {/* Nested replies - outside hover target */}
            {hasReplies && (
              <div className='mt-1 space-y-1'>
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
                    isFeedOwner={isFeedOwner}
                    depth={depth + 1}
                    canReact={canReact}
                    canComment={canComment}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
