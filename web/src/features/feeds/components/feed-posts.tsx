import { useState } from 'react'
import { Button, Card } from '@mochi/common'
import type { FeedPost, ReactionId } from '@/types'
import { MessageSquare, Send, X } from 'lucide-react'
import { STRINGS } from '../constants'
import { sanitizeHtml } from '../utils'
import { CommentThread } from './comment-thread'
import { PostAttachments } from './post-attachments'
import { ReactionBar } from './reaction-bar'

type FeedPostsProps = {
  posts: FeedPost[]
  commentDrafts: Record<string, string>
  onDraftChange: (postId: string, value: string) => void
  onAddComment: (feedId: string, postId: string, body?: string) => void
  onReplyToComment: (feedId: string, postId: string, parentCommentId: string, body: string) => void
  onPostReaction: (postId: string, reaction: ReactionId) => void
  onCommentReaction: (feedId: string, postId: string, commentId: string, reaction: ReactionId) => void
  isRemote?: boolean
  showFeedName?: boolean
}

export function FeedPosts({
  posts,
  commentDrafts,
  onDraftChange,
  onAddComment,
  onReplyToComment,
  onPostReaction,
  onCommentReaction,
  isRemote = false,
  showFeedName = false,
}: FeedPostsProps) {
  const [replyingTo, setReplyingTo] = useState<{ postId: string; commentId: string } | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [commentingOn, setCommentingOn] = useState<string | null>(null)

  if (posts.length === 0) {
    return (
      <p className='py-8 text-center text-muted-foreground'>
        {STRINGS.NO_POSTS_YET}
      </p>
    )
  }

  return (
    <div className='space-y-4'>
      {posts.map((post) => (
        <Card key={post.id} className='relative overflow-hidden py-0'>
          <div className='p-4 space-y-3'>
            {/* Feed name and timestamp */}
            <span className='absolute top-3 right-4 text-xs text-muted-foreground'>
              {showFeedName && post.feedName && <>{post.feedName} · </>}
              {post.createdAt}
            </span>

            {/* Post body */}
            <div
              className='text-xl font-medium leading-relaxed whitespace-pre-wrap'
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.body) }}
            />

            {/* Attachments */}
            {post.attachments && post.attachments.length > 0 && (
              <PostAttachments attachments={post.attachments} feedId={post.feedId} isRemote={isRemote} />
            )}

            {/* Actions row */}
            <div className='flex items-center gap-2'>
              <ReactionBar
                counts={post.reactions}
                activeReaction={post.userReaction}
                onSelect={(reaction) => onPostReaction(post.id, reaction)}
              />
              <Button
                type='button'
                size='sm'
                variant='ghost'
                className='h-auto gap-1 px-2 py-1 text-xs text-muted-foreground'
                onClick={() => setCommentingOn(commentingOn === post.id ? null : post.id)}
              >
                <MessageSquare className='size-4' />
                {post.comments.length > 0 ? `${post.comments.length} comment${post.comments.length === 1 ? '' : 's'}` : 'Comment'}
              </Button>
            </div>

            {/* Expanded comment input */}
            {commentingOn === post.id && (
              <div className='flex items-end gap-2'>
                <textarea
                  placeholder={STRINGS.COMMENT_PLACEHOLDER}
                  value={commentDrafts[post.id] ?? ''}
                  onChange={(e) => onDraftChange(post.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      const draft = (e.target as HTMLTextAreaElement).value.trim()
                      if (draft) {
                        onAddComment(post.feedId, post.id, draft)
                        setCommentingOn(null)
                      }
                    } else if (e.key === 'Escape') {
                      setCommentingOn(null)
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
                  onClick={() => setCommentingOn(null)}
                  aria-label='Cancel comment'
                >
                  <X className='size-4' />
                </Button>
                <Button
                  size='icon'
                  className='size-8'
                  disabled={!commentDrafts[post.id]?.trim()}
                  onClick={() => {
                    const draft = commentDrafts[post.id]?.trim()
                    if (draft) {
                      onAddComment(post.feedId, post.id, draft)
                      setCommentingOn(null)
                    }
                  }}
                  aria-label='Submit comment'
                >
                  <Send className='size-4' />
                </Button>
              </div>
            )}

            {/* Comments */}
            {post.comments.length > 0 && (
              <div className='pt-3 border-t'>
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
                        onReplyToComment(post.feedId, post.id, commentId, replyDraft.trim())
                        setReplyingTo(null)
                        setReplyDraft('')
                      }
                    }}
                    onReact={(commentId, reaction) => onCommentReaction(post.feedId, post.id, commentId, reaction)}
                  />
                ))}
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  )
}
