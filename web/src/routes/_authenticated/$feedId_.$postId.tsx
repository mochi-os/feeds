import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Main,
  PageHeader,
  usePageTitle,
  type PostData,
  ListSkeleton,
  EmptyState,
  GeneralError,
  getErrorMessage,
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

  const fetchPost = useCallback(async () => {
    const response = await feedsApi.view({ feed: feedId || undefined, post: postId })
    const data = response.data
    const feedName = data?.feed?.name ?? ''

    if (data?.posts && data.posts.length > 0) {
      const mapped = mapPosts(data.posts)
      const target = mapped.find((p) => p.id === postId) ?? mapped[0]
      if (target) {
        return {
          post: target,
          permissions: data.permissions,
          feedName,
          isOwner: !!data.owner || !!data.permissions?.manage,
          notFound: false,
        }
      }
    }

    return {
      post: null as FeedPost | null,
      permissions: data?.permissions,
      feedName,
      isOwner: false,
      notFound: true,
    }
  }, [feedId, postId])

  const {
    data: postData,
    isLoading,
    isError,
    error: loadError,
    refetch: refetchPostQuery,
  } = useQuery({
    queryKey: ['feeds', 'single-post', feedId, postId],
    queryFn: fetchPost,
    retry: false,
    refetchOnWindowFocus: false,
  })

  const [post, setPost] = useState<FeedPost | null>(null)
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const permissions: FeedPermissions | undefined = postData?.permissions
  const feedName = postData?.feedName ?? ''
  const isOwner = postData?.isOwner ?? false
  const notFound = postData?.notFound ?? false

  useEffect(() => {
    setPost(postData?.post ?? null)
  }, [postData?.post])

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

  // Refresh post data
  const refreshPost = useCallback(async () => {
    await refetchPostQuery()
  }, [refetchPostQuery])

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

  const handleTagAdded = useCallback(
    async (feedId: string, pId: string, label: string) => {
      try {
        const tag = await feedsApi.addPostTag(feedId, pId, label)
        if (post && post.id === pId) {
          setPost({ ...post, tags: [...(post.tags || []), tag] })
        }
      } catch (error) {
        toast.error(getErrorMessage(error, 'Failed to add tag'))
        throw error
      }
    },
    [post]
  )

  const handleTagRemoved = useCallback(
    async (_fId: string, pId: string, tagId: string) => {
      try {
        await feedsApi.removePostTag(feedId, pId, tagId)
        if (post && post.id === pId) {
          setPost({ ...post, tags: (post.tags || []).filter((t) => t.id !== tagId) })
        }
      } catch (error) {
        toast.error(getErrorMessage(error, 'Failed to remove tag'))
      }
    },
    [feedId, post]
  )

  if (isLoading && !post) {
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

  if (!post) {
    const showNotFound = notFound && !isError

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
              error={
                loadError instanceof Error
                  ? loadError
                  : new Error('Failed to load post')
              }
              minimal
              mode='inline'
              reset={() => {
                void refetchPostQuery()
              }}
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
          onTagAdded={handleTagAdded}
          onTagRemoved={handleTagRemoved}
          permissions={permissions}
          isFeedOwner={isOwner}
          singlePost
        />
      </Main>
    </>
  )
}
