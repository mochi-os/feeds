import {
  Button,
  Card,
  CardContent,
  Input,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
} from '@mochi/common'
import { Rss, Send } from 'lucide-react'
import {
  type FeedPost,
  type ReactionCounts,
  type ReactionId,
  type FeedComment,
} from '../types'
import { reactionOptions } from '../constants'
import { countComments, initials } from '../utils'

type FeedPostsProps = {
  posts: FeedPost[]
  commentDrafts: Record<string, string>
  onDraftChange: (postId: string, value: string) => void
  onAddComment: (postId: string) => void
  onPostReaction: (postId: string, reaction: ReactionId) => void
  onCommentReaction: (postId: string, commentId: string, reaction: ReactionId) => void
}

export function FeedPosts({
  posts,
  commentDrafts,
  onDraftChange,
  onAddComment,
  onPostReaction,
  onCommentReaction,
}: FeedPostsProps) {
  if (posts.length === 0) {
    return (
      <Card className='shadow-md'>
        <CardContent className='flex flex-col items-center justify-center space-y-3 p-12 text-center'>
          <div className='rounded-full bg-primary/10 p-4'>
            <Rss className='size-10 text-primary' />
          </div>
          <p className='text-sm font-semibold'>No posts yet</p>
          <p className='text-sm text-muted-foreground'>
            Share an update above to start the conversation.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {posts.map((post) => (
        <Card key={post.id} className='shadow-md transition-shadow duration-300 hover:shadow-lg'>
          <CardContent className='space-y-5 p-6'>
            <div className='flex items-start justify-between gap-4'>
              <div className='flex items-start gap-3'>
                <Avatar className='size-10 ring-2 ring-primary/10'>
                  <AvatarImage src={post.avatar} alt='' />
                  <AvatarFallback>{initials(post.author)}</AvatarFallback>
                </Avatar>
                <div className='space-y-0.5'>
                  <p className='text-sm font-semibold'>{post.role}</p>
                  <p className='text-xs text-muted-foreground'>{post.createdAt}</p>
                </div>
              </div>
              <div className='flex flex-wrap gap-2'>
                {post.tags?.map((tag) => (
                  <Badge key={tag} variant='outline' className='font-medium'>
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
            <div className='space-y-2'>
              <div
                className='text-sm leading-relaxed text-muted-foreground'
                dangerouslySetInnerHTML={{ __html: post.body }}
              />
              {post.attachments && post.attachments.length > 0 && (
                <div className='space-y-2'>
                  {post.attachments.map((attachment, index) => (
                    <div key={index} className='rounded-lg border p-3 text-xs text-muted-foreground'>
                      {JSON.stringify(attachment)}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <ReactionBar
              counts={post.reactions}
              activeReaction={post.userReaction}
              onSelect={(reaction) => onPostReaction(post.id, reaction)}
            />
            <div className='flex items-center gap-2'>
              <Input
                id={`comment-${post.id}`}
                placeholder='Leave a comment...'
                value={commentDrafts[post.id] ?? ''}
                onChange={(event) => onDraftChange(post.id, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && commentDrafts[post.id]?.trim()) {
                    event.preventDefault()
                    onAddComment(post.id)
                  }
                }}
                className='flex-1 transition-all duration-300 focus:shadow-sm'
              />
              <Button
                type='button'
                size='icon'
                disabled={!commentDrafts[post.id]?.trim()}
                onClick={() => onAddComment(post.id)}
                className='shrink-0 transition-all duration-300 hover:scale-105 disabled:hover:scale-100'
                aria-label='Post comment'
              >
                <Send className='size-4' />
              </Button>
            </div>
            <div className='space-y-4 rounded-lg bg-muted/30 p-4'>
              <div className='flex items-center justify-between text-sm text-muted-foreground'>
                <span className='font-semibold'>
                  Discussion ({countComments(post.comments)})
                </span>
                <span>{post.comments.length} threads</span>
              </div>
              <div className='space-y-3'>
                {post.comments.map((comment) => (
                  <CommentThread
                    key={comment.id}
                    comment={comment}
                    onReact={(commentId, reaction) =>
                      onCommentReaction(post.id, commentId, reaction)
                    }
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  )
}

type ReactionBarProps = {
  counts: ReactionCounts
  activeReaction?: ReactionId | null
  onSelect: (reaction: ReactionId) => void
}

function ReactionBar({ counts, activeReaction, onSelect }: ReactionBarProps) {
  return (
    <div className='flex flex-wrap gap-2'>
      {reactionOptions.map((reaction) => {
        const count = counts[reaction.id] ?? 0
        const isActive = activeReaction === reaction.id
        return (
          <Button
            key={reaction.id}
            type='button'
            size='sm'
            variant={isActive ? 'default' : 'outline'}
            className='h-8 gap-1 px-2 text-xs transition-all duration-300 hover:scale-110'
            aria-label={`${reaction.label} (${count})`}
            onClick={() => onSelect(reaction.id)}
          >
            <span aria-hidden='true' role='img' className='text-base'>
              {reaction.emoji}
            </span>
            <span className='font-medium'>{count}</span>
          </Button>
        )
      })}
    </div>
  )
}

type CommentThreadProps = {
  comment: FeedComment
  onReact: (commentId: string, reaction: ReactionId) => void
}

function CommentThread({ comment, onReact }: CommentThreadProps) {
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
      <ReactionBar
        counts={comment.reactions}
        activeReaction={comment.userReaction}
        onSelect={(reaction) => onReact(comment.id, reaction)}
      />
      {comment.replies?.length ? (
        <div className='space-y-3 border-l-2 border-primary/20 pl-4'>
          {comment.replies.map((reply) => (
            <CommentThread key={reply.id} comment={reply} onReact={onReact} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
