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
  const hasReplies = comment.replies && comment.replies.length > 0

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

  // Grid config
  const COL_WIDTH = 'w-5' // 20px
  const AVATAR_SIZE = 'size-5' // 20px
  const LINE_LEFT = 'left-[9px]' // Center of 20px
  const CURVE_WIDTH = 'w-3' // 12px
  const LINE_COLOR = 'bg-foreground/35' // Darker vertical lines
  const BEND_COLOR = 'border-foreground/35' // Matching bend color

  return (
    <div className='flex'>
      {/* 1. Bend Column (Only for Depth > 0) */}
      {depth > 0 && (
        <div className={`relative ${COL_WIDTH} shrink-0`}>
          {/* Vertical line for siblings (extends full height if not last child) */}
          {!isLastChild && (
            <div
              className={`${LINE_COLOR} absolute top-0 bottom-0 ${LINE_LEFT} w-0.3`}
            />
          )}
          {/* Curved bend connector for THIS comment */}
          {/* Curve horizontal part - thinner (1px) */}
          <div
            className={`${BEND_COLOR} absolute top-0 ${LINE_LEFT} h-3 ${CURVE_WIDTH} rounded-bl-md border-b-2 border-l-2`}
          />
        </div>
      )}

      {/* 2. Main Block (Avatar + Content + Replies) */}
      <div className='flex min-w-0 flex-1 flex-col'>
        {/* Row: Avatar + Content */}
        <div className='flex gap-2 pb-2'>
          {/* Avatar Column */}
          <div
            className={`relative ${COL_WIDTH} flex shrink-0 flex-col items-center`}
          >
            {collapsed ? (
              <div
                className={`bg-primary text-primary-foreground flex ${AVATAR_SIZE} z-10 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold`}
              >
                {comment.author.charAt(0).toUpperCase()}
              </div>
            ) : (
              <>
                <div
                  className={`bg-primary text-primary-foreground flex ${AVATAR_SIZE} z-10 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold`}
                >
                  {comment.author.charAt(0).toUpperCase()}
                </div>
                {/* Collapse Button */}
                {hasReplies && (
                  <button
                    type='button'
                    onClick={(e) => {
                      e.stopPropagation()
                      setCollapsed(!collapsed)
                    }}
                    className='bg-background hover:bg-muted text-muted-foreground border-foreground/35 z-10 mt-1 flex size-3 items-center justify-center rounded-sm border transition-colors'
                    aria-label={collapsed ? 'Expand' : 'Collapse'}
                  >
                    {collapsed ? (
                      <Plus className='size-2' />
                    ) : (
                      <Minus className='size-2' />
                    )}
                  </button>
                )}
              </>
            )}

            {/* Trunk Line (Down to children) */}
            {hasReplies && !collapsed && (
              <div
                className={`${LINE_COLOR} absolute top-4 bottom-0 ${LINE_LEFT} w-0.5`}
              />
            )}
          </div>

          {/* Content */}
          <div className='min-w-0 flex-1'>
            {collapsed ? (
              <div className='flex h-5 items-center gap-2 py-0.5 text-xs select-none'>
                <span className='text-muted-foreground font-medium'>
                  {comment.author}
                </span>
                <span className='text-muted-foreground'>·</span>
                <span className='text-muted-foreground'>
                  {comment.createdAt}
                </span>
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
                    <span className='text-muted-foreground italic'>
                      (expanded)
                    </span>
                  )}
                </button>
              </div>
            ) : (
              <div className='space-y-1.5'>
                <div className='flex h-5 items-center gap-2 text-xs'>
                  <span className='text-foreground font-medium'>
                    {comment.author}
                  </span>
                  <span className='text-muted-foreground'>·</span>
                  <span className='text-muted-foreground'>
                    {comment.createdAt}
                  </span>
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
                  {(canEditComment || canDeleteComment) && (
                    <div className='ml-auto flex items-center gap-3 opacity-0 transition-opacity group-hover:opacity-100'>
                      {canEditComment && (
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
                      {canDeleteComment && (
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
                  handleConfirm={() => {
                    onDelete?.(comment.id)
                    setDeleting(false)
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Replies Block - Nested */}
        {hasReplies && !collapsed && (
          <div className='w-full'>
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
          </div>
        )}
      </div>
    </div>
  )
}
