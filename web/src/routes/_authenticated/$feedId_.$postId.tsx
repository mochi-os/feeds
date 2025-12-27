import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  Main,
  requestHelpers,
  usePageTitle,
  type PostData,
} from '@mochi/common'
import feedsApi from '@/api/feeds'
import { mapPosts } from '@/api/adapters'
import type { FeedPermissions, FeedPost, Post, ReactionId } from '@/types'
import { FeedPosts } from '@/features/feeds/components/feed-posts'
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface PostViewResponse {
  posts?: Post[]
  permissions?: FeedPermissions
  feed?: {
    id: string
    name: string
    fingerprint?: string
  }
}

export const Route = createFileRoute('/_authenticated/$feedId_/$postId')({
  component: SinglePostPage,
})

function SinglePostPage() {
  const { feedId, postId } = Route.useParams()

  const [post, setPost] = useState<FeedPost | null>(null)
  const [permissions, setPermissions] = useState<FeedPermissions | undefined>()
  const [feedName, setFeedName] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})

  // Set page title
  usePageTitle(feedName || 'Post')

  // Fetch the single post
  useEffect(() => {
    setIsLoading(true)
    setError(null)

    requestHelpers
      .get<PostViewResponse>(`/feeds/${feedId}/-/posts?post=${postId}`)
      .then((response) => {
        if (response?.posts && response.posts.length > 0) {
          const mapped = mapPosts(response.posts)
          setPost(mapped[0] ?? null)
          setPermissions(response.permissions)
          if (response.feed?.name) {
            setFeedName(response.feed.name)
          }
        } else {
          setError('Post not found')
        }
      })
      .catch((err) => {
        console.error('[SinglePostPage] Failed to load post', err)
        const message = err instanceof Error ? err.message : 'Failed to load post'
        setError(message)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [feedId, postId])

  // Refresh post data
  const refreshPost = useCallback(async () => {
    const response = await requestHelpers.get<PostViewResponse>(
      `/feeds/${feedId}/-/posts?post=${postId}`
    )
    if (response?.posts && response.posts.length > 0) {
      const mapped = mapPosts(response.posts)
      setPost(mapped[0] ?? null)
      setPermissions(response.permissions)
    }
  }, [feedId, postId])

  // Post reaction handler
  const handlePostReaction = useCallback(
    (postFeedId: string, pId: string, reaction: ReactionId | '') => {
      if (!post) return

      // Optimistic update
      const currentReaction = post.userReaction
      const newCounts = { ...post.reactions }
      let newUserReaction: ReactionId | null = currentReaction ?? null

      if (reaction === '' || currentReaction === reaction) {
        if (currentReaction) {
          newCounts[currentReaction] = Math.max(0, (newCounts[currentReaction] ?? 0) - 1)
        }
        newUserReaction = null
      } else {
        if (currentReaction) {
          newCounts[currentReaction] = Math.max(0, (newCounts[currentReaction] ?? 0) - 1)
        }
        newCounts[reaction] = (newCounts[reaction] ?? 0) + 1
        newUserReaction = reaction
      }

      setPost({ ...post, reactions: newCounts, userReaction: newUserReaction })
      void feedsApi.reactToPost(postFeedId, pId, reaction)
    },
    [post]
  )

  // Comment handlers
  const handleAddComment = useCallback(
    async (postFeedId: string, pId: string, body?: string) => {
      if (!body) return
      await feedsApi.createComment({ feed: postFeedId, post: pId, body })
      await refreshPost()
      setCommentDrafts((prev) => ({ ...prev, [pId]: '' }))
    },
    [refreshPost]
  )

  const handleReplyToComment = useCallback(
    async (postFeedId: string, pId: string, parentId: string, body: string) => {
      await feedsApi.createComment({ feed: postFeedId, post: pId, body, parent: parentId })
      await refreshPost()
    },
    [refreshPost]
  )

  const handleCommentReaction = useCallback(
    async (postFeedId: string, pId: string, commentId: string, reaction: string) => {
      await feedsApi.reactToComment(postFeedId, pId, commentId, reaction)
      await refreshPost()
    },
    [refreshPost]
  )

  const handleEditPost = useCallback(
    async (
      postFeedId: string,
      pId: string,
      body: string,
      data?: PostData,
      order?: string[],
      files?: File[]
    ) => {
      await feedsApi.editPost({ feed: postFeedId, post: pId, body, data, order, files })
      await refreshPost()
      toast.success('Post updated')
    },
    [refreshPost]
  )

  const handleDeletePost = useCallback(
    async (postFeedId: string, pId: string) => {
      await feedsApi.deletePost(postFeedId, pId)
      toast.success('Post deleted')
      // Navigate back to feed after deletion
      window.location.href = `/feeds/${feedId}`
    },
    [feedId]
  )

  const handleEditComment = useCallback(
    async (fId: string, pId: string, commentId: string, body: string) => {
      await feedsApi.editComment(fId, pId, commentId, body)
      await refreshPost()
      toast.success('Comment updated')
    },
    [refreshPost]
  )

  const handleDeleteComment = useCallback(
    async (fId: string, pId: string, commentId: string) => {
      await feedsApi.deleteComment(fId, pId, commentId)
      await refreshPost()
      toast.success('Comment deleted')
    },
    [refreshPost]
  )

  if (isLoading) {
    return (
      <Main className="space-y-4">
        <Card className="shadow-md">
          <CardContent className="p-6 text-center">
            <Loader2 className="mx-auto mb-3 size-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading post...</p>
          </CardContent>
        </Card>
      </Main>
    )
  }

  if (error || !post) {
    return (
      <Main className="space-y-4">
        <Card className="border-destructive/50">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="mx-auto mb-4 size-12 text-destructive" />
            <h2 className="text-lg font-semibold">Post not found</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {error || 'This post may have been deleted or you may not have access to it.'}
            </p>
            <div className="mt-4">
              <Link to="/$feedId" params={{ feedId }}>
                <Button variant="outline">
                  <ArrowLeft className="size-4" />
                  Back to feed
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </Main>
    )
  }

  return (
    <Main className="space-y-4">
      {/* Back link */}
      <div className="-mt-1">
        <Link
          to="/$feedId"
          params={{ feedId }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          {feedName || 'Back to feed'}
        </Link>
      </div>

      {/* Single post */}
      <FeedPosts
        posts={[post]}
        commentDrafts={commentDrafts}
        onDraftChange={(pId, value) => setCommentDrafts((prev) => ({ ...prev, [pId]: value }))}
        onAddComment={handleAddComment}
        onReplyToComment={handleReplyToComment}
        onPostReaction={handlePostReaction}
        onCommentReaction={handleCommentReaction}
        onEditPost={handleEditPost}
        onDeletePost={handleDeletePost}
        onEditComment={handleEditComment}
        onDeleteComment={handleDeleteComment}
        permissions={permissions}
      />
    </Main>
  )
}
