import {
  Button,
  Card,
  CardContent,
  Input,
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@mochi/common'
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

/** Single post item within a grouped feed card - no header, just timestamp + content */
function PostItem({
  post,
  isFirst,
  commentDraft,
  onDraftChange,
  onAddComment,
  onPostReaction,
  onCommentReaction,
  replyingTo,
  replyDraft,
  onStartReply,
  onCancelReply,
  onReplyDraftChange,
  onSubmitReply,
}: {
  post: FeedPost
  isFirst: boolean
  commentDraft: string
  onDraftChange: (value: string) => void
  onAddComment: () => void
  onPostReaction: (reaction: ReactionId) => void
  onCommentReaction: (commentId: string, reaction: ReactionId) => void
  replyingTo: { postId: string; commentId: string } | null
  replyDraft: string
  onStartReply: (commentId: string) => void
  onCancelReply: () => void
  onReplyDraftChange: (value: string) => void
  onSubmitReply: (commentId: string) => void
}) {
  return (
    <div className={`space-y-4 ${!isFirst ? 'border-t border-border/50 pt-5' : ''}`}>
      {/* Timestamp for this specific post */}
      <p className='text-xs text-muted-foreground'>{post.createdAt}</p>

      {/* Post body */}
      <div className='space-y-2'>
        <div
          className='text-sm leading-relaxed text-foreground'
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

      {/* Reactions */}
      <ReactionBar
        counts={post.reactions}
        activeReaction={post.userReaction}
        onSelect={onPostReaction}
      />

      {/* Comment input */}
      <div className='flex items-center gap-2'>
        <Input
          id={`comment-${post.id}`}
          placeholder={STRINGS.COMMENT_PLACEHOLDER}
          value={commentDraft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && commentDraft.trim()) {
              event.preventDefault()
              onAddComment()
            }
          }}
          className='flex-1 transition-all duration-300 focus:shadow-sm'
        />
        <Button
          type='button'
          size='icon'
          disabled={!commentDraft.trim()}
          onClick={onAddComment}
          className='shrink-0 transition-all duration-300 hover:scale-105 disabled:hover:scale-100'
          aria-label={STRINGS.POST_COMMENT}
        >
          <Send className='size-4' />
        </Button>
      </div>

      {/* Discussion/Comments section */}
      <div className='space-y-4 rounded-lg bg-muted/30 p-4'>
        <div className='flex items-center justify-between text-sm text-muted-foreground'>
          <span className='font-semibold'>
            {STRINGS.DISCUSSION} ({countComments(post.comments)})
          </span>
          <span>
            {post.comments.length} {STRINGS.THREADS}
          </span>
        </div>
        <div className='space-y-3'>
          {post.comments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              postId={post.id}
              replyingTo={replyingTo}
              replyDraft={replyDraft}
              onStartReply={onStartReply}
              onCancelReply={onCancelReply}
              onReplyDraftChange={onReplyDraftChange}
              onSubmitReply={onSubmitReply}
              onReact={(commentId, reaction) => onCommentReaction(commentId, reaction)}
            />
          ))}
        </div>
      </div>
    </div>
  )
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
          <p className='text-sm text-muted-foreground'>{STRINGS.NO_POSTS_DESCRIPTION}</p>
        </CardContent>
      </Card>
    )
  }

  // All posts are from the same feed, so we can show the author header once
  // and list all posts below it in a single card
  const firstPost = posts[0]

  return (
    <Card className='shadow-md transition-shadow duration-300 hover:shadow-lg overflow-hidden'>
      <CardContent className='p-6'>
        {/* Feed author header - shown once at the top */}
        <div className='flex items-start gap-3 mb-6'>
          <Avatar className='size-10 ring-2 ring-primary/10'>
            <AvatarImage src={firstPost.avatar} alt='' />
            <AvatarFallback>{initials(firstPost.author)}</AvatarFallback>
          </Avatar>
          <div className='space-y-0.5'>
            <p className='text-sm font-semibold'>{firstPost.role}</p>
            <p className='text-xs text-muted-foreground'>
              {posts.length} {posts.length === 1 ? 'update' : 'updates'}
            </p>
          </div>
        </div>

        {/* All posts from this feed - grouped together */}
        <div className='space-y-5'>
          {posts.map((post, index) => (
            <PostItem
              key={post.id}
              post={post}
              isFirst={index === 0}
              commentDraft={commentDrafts[post.id] ?? ''}
              onDraftChange={(value) => onDraftChange(post.id, value)}
              onAddComment={() => onAddComment(post.id)}
              onPostReaction={(reaction) => onPostReaction(post.id, reaction)}
              onCommentReaction={(commentId, reaction) =>
                onCommentReaction(post.id, commentId, reaction)
              }
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
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
