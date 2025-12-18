import { useState } from 'react'
import { Button } from '@mochi/common'
import type { FeedComment, ReactionId } from '@/types'
import { Reply, Send, X } from 'lucide-react'
import { ReactionBar } from './reaction-bar'

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
  postId: string
  replyingTo: { postId: string; commentId: string } | null
  replyDraft: string
  onStartReply: (commentId: string) => void
  onCancelReply: () => void
  onReplyDraftChange: (value: string) => void
  onSubmitReply: (commentId: string) => void
  onReact: (commentId: string, reaction: ReactionId) => void
  depth?: number
}

export function CommentThread({
  comment,
  postId,
  replyingTo,
  replyDraft,
  onStartReply,
  onCancelReply,
  onReplyDraftChange,
  onSubmitReply,
  onReact,
  depth = 0,
}: CommentThreadProps) {
  const [collapsed, setCollapsed] = useState(false)
  const isReplying = replyingTo?.postId === postId && replyingTo?.commentId === comment.id
  const hasReplies = comment.replies && comment.replies.length > 0
  const lineColor = THREAD_COLORS[depth % THREAD_COLORS.length]

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
          <div className='space-y-2'>
            {/* Author and timestamp */}
            <div className='text-xs font-medium text-muted-foreground'>
              {comment.author} <span className='font-normal'>· {comment.createdAt}</span>
            </div>

            {/* Comment body */}
            <p className='text-sm leading-relaxed whitespace-pre-wrap'>{comment.body}</p>

            {/* Reactions and reply row */}
            <div className='flex items-center gap-3 text-xs text-muted-foreground pt-1'>
              <ReactionBar
                counts={comment.reactions}
                activeReaction={comment.userReaction}
                onSelect={(reaction) => onReact(comment.id, reaction)}
              />
              <button
                type='button'
                className='inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors'
                onClick={() => onStartReply(comment.id)}
              >
                <Reply className='size-3' />
                Reply
              </button>
            </div>

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

            {/* Nested replies */}
            {hasReplies && (
              <div className='mt-1 space-y-1'>
                {comment.replies!.map((reply) => (
                  <CommentThread
                    key={reply.id}
                    comment={reply}
                    postId={postId}
                    replyingTo={replyingTo}
                    replyDraft={replyDraft}
                    onStartReply={onStartReply}
                    onCancelReply={onCancelReply}
                    onReplyDraftChange={onReplyDraftChange}
                    onSubmitReply={onSubmitReply}
                    onReact={onReact}
                    depth={depth + 1}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
