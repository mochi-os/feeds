import { Card, CardContent } from '@mochi/common'
import { Loader2 } from 'lucide-react'
import type { FeedPost, FeedSummary, ReactionId } from '@/types'
import { FeedOverview } from './feed-overview'
import { FeedPosts } from './feed-posts'

type FeedDetailProps = {
  feed: FeedSummary
  posts: FeedPost[]
  totalComments: number
  totalReactions: number
  isLoadingPosts: boolean
  canCompose: boolean
  composer: { body: string }
  onBodyChange: (value: string) => void
  onSubmitPost: (event: React.FormEvent<HTMLFormElement>) => void
  commentDrafts: Record<string, string>
  onDraftChange: (postId: string, value: string) => void
  onAddComment: (feedId: string, postId: string, body?: string) => void
  onReplyToComment: (feedId: string, postId: string, parentCommentId: string, body: string) => void
  onPostReaction: (postId: string, reaction: ReactionId) => void
  onCommentReaction: (feedId: string, postId: string, commentId: string, reaction: ReactionId) => void
  onToggleSubscription: (feedId: string, server?: string) => void
}

export function FeedDetail({
  feed,
  posts,
  totalComments,
  totalReactions,
  isLoadingPosts,
  canCompose,
  composer,
  onBodyChange,
  onSubmitPost,
  commentDrafts,
  onDraftChange,
  onAddComment,
  onReplyToComment,
  onPostReaction,
  onCommentReaction,
  onToggleSubscription,
}: FeedDetailProps) {
  return (
    <div className='space-y-6'>
      {/* Feed overview card */}
      <FeedOverview feed={feed} onToggleSubscription={onToggleSubscription} />

      {/* Stats */}
      <div className='flex flex-wrap gap-4 text-sm text-muted-foreground'>
        <span>{posts.length} posts</span>
        <span>{totalComments} comments</span>
        <span>{totalReactions} reactions</span>
      </div>

      {/* Composer (if owner) */}
      {canCompose && (
        <form onSubmit={onSubmitPost} className='space-y-2'>
          <div className='flex gap-2'>
            <textarea
              placeholder='Write a post...'
              value={composer.body}
              onChange={(e) => onBodyChange(e.target.value)}
              className='flex-1 resize-none rounded-md border px-3 py-2 text-sm'
              rows={3}
            />
          </div>
          <button
            type='submit'
            disabled={!composer.body.trim()}
            className='rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50'
          >
            Post
          </button>
        </form>
      )}

      {/* Loading indicator */}
      {isLoadingPosts && (
        <Card className='shadow-none'>
          <CardContent className='flex items-center justify-center gap-2 p-8 text-muted-foreground'>
            <Loader2 className='size-5 animate-spin' />
            <span>Loading posts...</span>
          </CardContent>
        </Card>
      )}

      {/* Posts */}
      {!isLoadingPosts && (
        <FeedPosts
          posts={posts}
          commentDrafts={commentDrafts}
          onDraftChange={onDraftChange}
          onAddComment={onAddComment}
          onReplyToComment={onReplyToComment}
          onPostReaction={onPostReaction}
          onCommentReaction={onCommentReaction}
        />
      )}
    </div>
  )
}

