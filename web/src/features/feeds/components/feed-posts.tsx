import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Rss, Send } from 'lucide-react'
import { ReactionBar } from './reaction-bar'
import { CommentThread } from './comment-thread'
import { countComments, initials } from '../utils'
import { STRINGS } from '../constants'
import type { FeedPost, ReactionId } from '../types'

type FeedPostsProps = {
  posts: FeedPost[]
  commentDrafts: Record<string, string>
  onDraftChange: (postId: string, value: string) => void
  onAddComment: (postId: string) => void
  onReplyToComment: (postId: string, parentCommentId: string, body: string) => void
  onPostReaction: (postId: string, reaction: ReactionId) => void
  onCommentReaction: (postId: string, commentId: string, reaction: ReactionId) => void
}

export function FeedPosts({
  posts,
  commentDrafts,
  onDraftChange,
  onAddComment,
  onReplyToComment,
  onPostReaction,
  onCommentReaction,
}: FeedPostsProps) {
  // Track which comment is being replied to: { postId, commentId }
  const [replyingTo, setReplyingTo] = useState<{ postId: string; commentId: string } | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  if (posts.length === 0) {
    return (
      <Card className='shadow-md'>
        <CardContent className='flex flex-col items-center justify-center space-y-3 p-12 text-center'>
          <div className='rounded-full bg-primary/10 p-4'>
            <Rss className='size-10 text-primary' />
          </div>
          <p className='text-sm font-semibold'>{STRINGS.NO_POSTS_YET}</p>
          <p className='text-sm text-muted-foreground'>
            {STRINGS.NO_POSTS_DESCRIPTION}
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
                placeholder={STRINGS.COMMENT_PLACEHOLDER}
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
                aria-label={STRINGS.POST_COMMENT}
              >
                <Send className='size-4' />
              </Button>
            </div>
            <div className='space-y-4 rounded-lg bg-muted/30 p-4'>
              <div className='flex items-center justify-between text-sm text-muted-foreground'>
                <span className='font-semibold'>
                  {STRINGS.DISCUSSION} ({countComments(post.comments)})
                </span>
                <span>{post.comments.length} {STRINGS.THREADS}</span>
              </div>
              <div className='space-y-3'>
                {post.comments.map((comment) => (
                  <CommentThread
                    key={comment.id}
                    comment={comment}
                    postId={post.id}
                    replyingTo={replyingTo}
                    replyDraft={replyDraft}
                    onStartReply={(commentId) => {
                      setReplyingTo({ postId: post.id, commentId })
                      setReplyDraft('')
                    }}
                    onCancelReply={() => {
                      setReplyingTo(null)
                      setReplyDraft('')
                    }}
                    onReplyDraftChange={setReplyDraft}
                    onSubmitReply={(commentId) => {
                      if (replyDraft.trim()) {
                        onReplyToComment(post.id, commentId, replyDraft.trim())
                        setReplyingTo(null)
                        setReplyDraft('')
                      }
                    }}
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
