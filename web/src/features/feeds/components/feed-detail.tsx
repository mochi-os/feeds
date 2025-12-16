import { Card, CardContent } from '@mochi/common'
import { FeedOverview } from './feed-overview'
import { FeedComposer } from './feed-composer'
import { FeedPosts } from './feed-posts'
import { type FeedPost, type FeedSummary, type ReactionId } from '../types'

type FeedDetailProps = {
  feed: FeedSummary
  posts: FeedPost[]
  totalComments: number
  totalReactions: number
  isLoadingPosts: boolean
  canCompose: boolean
  composer: {
    body: string
  }
  onBodyChange: (value: string) => void
  onSubmitPost: (event: React.FormEvent<HTMLFormElement>) => void
  commentDrafts: Record<string, string>
  onDraftChange: (postId: string, value: string) => void
  onAddComment: (postId: string) => void
  onReplyToComment: (postId: string, parentCommentId: string, body: string) => void
  onPostReaction: (postId: string, reaction: ReactionId) => void
  onCommentReaction: (postId: string, commentId: string, reaction: ReactionId) => void
  onToggleSubscription: (feedId: string) => void
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
    <>
      <FeedOverview
        feed={feed}
        totalComments={totalComments}
        totalReactions={totalReactions}
        onToggleSubscription={onToggleSubscription}
      />

      {canCompose ? (
        <FeedComposer
          body={composer.body}
          onBodyChange={onBodyChange}
          onSubmit={onSubmitPost}
        />
      ) : null}

      {isLoadingPosts && posts.length === 0 ? (
        <Card className='shadow-md'>
          <CardContent className='p-6 text-sm text-muted-foreground'>
            Loading posts for this feed…
          </CardContent>
        </Card>
      ) : (
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
    </>
  )
}
