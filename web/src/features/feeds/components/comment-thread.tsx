import { Avatar, AvatarFallback, AvatarImage, Button, Input } from '@mochi/common'
import type { FeedComment, ReactionId } from '@/types'
import { Reply, Send, X } from 'lucide-react'
import { initials } from '../utils'
import { ReactionBar } from './reaction-bar'

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
}: CommentThreadProps) {
  const isReplying = replyingTo?.postId === postId && replyingTo?.commentId === comment.id

  return (
    <div className='space-y-3 rounded-lg border bg-card/50 p-4 transition-colors duration-300 hover:bg-card/70'>
      <div className='flex items-start gap-3'>
        <Avatar className='size-9 ring-2 ring-primary/10'>
          <AvatarImage src={comment.avatar} alt='' />
          <AvatarFallback>{initials(comment.author)}</AvatarFallback>
        </Avatar>
        <div>
          <p className='text-sm font-semibold'>{comment.author}</p>
          <p className='text-xs text-muted-foreground'>{comment.createdAt}</p>
        </div>
      </div>
      <p className='text-sm leading-relaxed text-muted-foreground'>{comment.body}</p>
      <div className='flex items-center gap-2'>
        <ReactionBar
          counts={comment.reactions}
          activeReaction={comment.userReaction}
          onSelect={(reaction) => onReact(comment.id, reaction)}
        />
        <Button
          type='button'
          size='sm'
          variant='ghost'
          className='h-8 gap-1 px-2 text-xs'
          onClick={() => onStartReply(comment.id)}
        >
          <Reply className='size-3' />
          Reply
        </Button>
      </div>
      {isReplying && (
        <div className='flex items-center gap-2 rounded-lg border bg-background p-2'>
          <Input
            placeholder={`Reply to ${comment.author}...`}
            value={replyDraft}
            onChange={(e) => onReplyDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && replyDraft.trim()) {
                e.preventDefault()
                onSubmitReply(comment.id)
              }
              if (e.key === 'Escape') {
                onCancelReply()
              }
            }}
            className='flex-1'
            autoFocus
          />
          <Button
            type='button'
            size='icon'
            variant='ghost'
            onClick={onCancelReply}
            aria-label='Cancel reply'
          >
            <X className='size-4' />
          </Button>
          <Button
            type='button'
            size='icon'
            disabled={!replyDraft.trim()}
            onClick={() => onSubmitReply(comment.id)}
            aria-label='Submit reply'
          >
            <Send className='size-4' />
          </Button>
        </div>
      )}
      {comment.replies?.length ? (
        <div className='space-y-3 border-l-2 border-primary/20 pl-4'>
          {comment.replies.map((reply) => (
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
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
