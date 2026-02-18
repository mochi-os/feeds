import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Main,
  PageHeader,
  usePageTitle,
  type PostData,
  ListSkeleton,
  EmptyState,
  GeneralError,
  toast,
} from '@mochi/common'
import { feedsApi } from '@/api/feeds'
import { mapPosts } from '@/api/adapters'
import type { FeedPermissions, FeedPost, ReactionId } from '@/types'
import { FeedPosts } from '@/features/feeds/components/feed-posts'
import { FileQuestion, ArrowLeft } from 'lucide-react'
import { useSidebarContext } from '@/context/sidebar-context'


export const Route = createFileRoute('/_authenticated/$feedId_/$postId')({
  component: SinglePostPage,
})

function SinglePostPage() {
  const { feedId: urlFeedId, postId } = Route.useParams()
  const navigate = useNavigate()

  const feedId = urlFeedId

  const [post, setPost] = useState<FeedPost | null>(null)
  const [permissions, setPermissions] = useState<FeedPermissions | undefined>()
  const [feedName, setFeedName] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})

  // Notify sidebar of current feed to keep it expanded
  const { setFeedId } = useSidebarContext()
  
  useEffect(() => {
    // Set feedId in sidebar context to keep the feed expanded
    setFeedId(feedId)
    return () => setFeedId(null)
  }, [feedId, setFeedId])

  // Set page title
  usePageTitle(feedName || 'Feed')
  const goBackToFeed = () => navigate({ to: '/$feedId', params: { feedId } })

  // Fetch the single post
  // Fetch the single post
  useEffect(() => {
    setIsLoading(true)
    setError(null)
    setNotFound(false)

    feedsApi
      .view({ feed: feedId || undefined, post: postId })
      .then((response) => {
        const data = response.data
        if (data?.posts && data.posts.length > 0) {
          const mapped = mapPosts(data.posts)
          const target = mapped.find((p) => p.id === postId) ?? mapped[0]
          setPost(target ?? null)
          setPermissions(data.permissions)
          setIsOwner(!!data.owner || !!data.permissions?.manage)
          if (data.feed?.name) {
            setFeedName(data.feed.name)
          }
        } else {
          setNotFound(true)
          setError('Post not found')
        }
      })
      .catch((err) => {
        console.error('[SinglePostPage] Failed to load post', err)
        const message = err instanceof Error ? err.message : 'Failed to load post'
        setNotFound(false)
        setError(message)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [feedId, postId])

  // Refresh post data
  const refreshPost = useCallback(async () => {
    try {
      const response = await feedsApi.view({ feed: feedId || undefined, post: postId })
      const data = response.data
      if (data?.posts && data.posts.length > 0) {
        const mapped = mapPosts(data.posts)
        const target = mapped.find((p) => p.id === postId) ?? mapped[0]
        setPost(target ?? null)
        setPermissions(data.permissions)
        setIsOwner(!!data.owner || !!data.permissions?.manage)
      }
    } catch (error) {
      console.error('[SinglePostPage] Failed to refresh post', error)
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
    async (postFeedId: string, pId: string, body?: string, files?: File[]) => {
      if (!body) return
      await feedsApi.createComment({ feed: postFeedId, post: pId, body, files })
      await refreshPost()
      setCommentDrafts((prev) => ({ ...prev, [pId]: '' }))
    },
    [refreshPost]
  )

  const handleReplyToComment = useCallback(
    async (postFeedId: string, pId: string, parentId: string, body: string, files?: File[]) => {
      await feedsApi.createComment({ feed: postFeedId, post: pId, body, parent: parentId, files })
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
      void navigate({ to: '/$feedId', params: { feedId } })
    },
    [feedId, navigate]
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
      <>
        <PageHeader
          title={feedName || 'Feed'}
          back={{ label: 'Back to feed', onFallback: goBackToFeed }}
        />
        <Main className="space-y-4">
          <ListSkeleton count={1} />
        </Main>
      </>
    )
  }

  if (error || !post) {
    const showNotFound = notFound || error === 'Post not found'

    return (
      <>
        <PageHeader
          title={feedName || 'Feed'}
          back={{ label: 'Back to feed', onFallback: goBackToFeed }}
        />
        <Main className="space-y-4">
          {showNotFound ? (
            <EmptyState
              icon={FileQuestion}
              title='Post not found'
              description='This post may have been deleted or you may not have access to it.'
            >
              <Link to="/$feedId" params={{ feedId }}>
                <Button variant="outline">
                  <ArrowLeft className="size-4" />
                  Back to feed
                </Button>
              </Link>
            </EmptyState>
          ) : (
            <GeneralError
              error={new Error(error ?? 'Failed to load post')}
              minimal
              mode='inline'
            />
          )}
        </Main>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={feedName || 'Feed'}
        back={{ label: 'Back to feed', onFallback: goBackToFeed }}
      />
      <Main className="space-y-4">
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
          isFeedOwner={isOwner}
          isDetailView
        />
      </Main>
    </>
  )
}
