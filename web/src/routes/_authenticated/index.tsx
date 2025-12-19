import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Main, Card, CardContent, Button, usePageTitle } from '@mochi/common'
import { toast } from 'sonner'
import {
  useCommentActions,
  useFeedPosts,
  useFeeds,
  usePostActions,
  useSubscription,
} from '@/hooks'
import type { FeedPost } from '@/types'
import { FeedPosts } from '@/features/feeds/components/feed-posts'
import { NewPostDialog } from '@/features/feeds/components/new-post-dialog'
import { Loader2, Plus, Rss } from 'lucide-react'
import feedsApi from '@/api/feeds'

export const Route = createFileRoute('/_authenticated/')({
  component: HomePage,
})

function HomePage() {
  const [postsByFeed, setPostsByFeed] = useState<Record<string, FeedPost[]>>({})
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const {
    feeds,
    setFeeds,
    isLoadingFeeds,
    refreshFeedsFromApi,
    mountedRef,
  } = useFeeds({
    onPostsLoaded: setPostsByFeed,
  })

  const {
    loadPostsForFeed,
    loadedFeedsRef,
  } = useFeedPosts({
    setErrorMessage,
    postsByFeed,
    setPostsByFeed,
  })

  useSubscription({
    feeds,
    setFeeds,
    setErrorMessage,
    refreshFeedsFromApi,
    mountedRef,
  })

  // Set page title
  usePageTitle('Feeds')

  const subscribedFeeds = useMemo(
    () => feeds.filter((feed) => feed.isSubscribed || feed.isOwner),
    [feeds]
  )

  const ownedFeeds = useMemo(
    () => feeds.filter((feed) => Boolean(feed.isOwner)),
    [feeds]
  )

  const allPosts = useMemo(() => {
    const posts: FeedPost[] = []
    for (const feed of subscribedFeeds) {
      const feedPosts = postsByFeed[feed.id] ?? []
      // Add isOwner to each post based on feed ownership
      posts.push(...feedPosts.map(post => ({ ...post, isOwner: feed.isOwner })))
    }
    return posts.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime()
      const dateB = new Date(b.createdAt).getTime()
      if (isNaN(dateA) && isNaN(dateB)) return 0
      if (isNaN(dateA)) return 1
      if (isNaN(dateB)) return -1
      return dateB - dateA
    })
  }, [subscribedFeeds, postsByFeed])

  const {
    handleLegacyDialogPost,
    handlePostReaction,
  } = usePostActions({
    selectedFeed: null,
    ownedFeeds,
    setFeeds,
    setSelectedFeedId: () => {},
    setPostsByFeed,
    loadPostsForFeed,
    loadedFeedsRef,
    refreshFeedsFromApi,
  })

  const {
    handleAddComment,
    handleReplyToComment,
    handleCommentReaction,
  } = useCommentActions({
    setFeeds,
    setPostsByFeed,
    loadPostsForFeed,
    loadedFeedsRef,
    commentDrafts,
    setCommentDrafts,
  })

  // Edit/delete handlers for posts
  const handleEditPost = useCallback(async (feedId: string, postId: string, body: string, order?: string[], files?: File[]) => {
    try {
      await feedsApi.editPost({ feed: feedId, post: postId, body, order, files })
      await loadPostsForFeed(feedId)
      toast.success('Post updated')
    } catch (error) {
      console.error('[HomePage] Failed to edit post', error)
      toast.error('Failed to edit post')
    }
  }, [loadPostsForFeed])

  const handleDeletePost = useCallback(async (feedId: string, postId: string) => {
    try {
      await feedsApi.deletePost(feedId, postId)
      await loadPostsForFeed(feedId)
      toast.success('Post deleted')
    } catch (error) {
      console.error('[HomePage] Failed to delete post', error)
      toast.error('Failed to delete post')
    }
  }, [loadPostsForFeed])

  // Edit/delete handlers for comments
  const handleEditComment = useCallback(async (feedId: string, postId: string, commentId: string, body: string) => {
    try {
      await feedsApi.editComment(feedId, postId, commentId, body)
      await loadPostsForFeed(feedId)
      toast.success('Comment updated')
    } catch (error) {
      console.error('[HomePage] Failed to edit comment', error)
      toast.error('Failed to edit comment')
    }
  }, [loadPostsForFeed])

  const handleDeleteComment = useCallback(async (feedId: string, postId: string, commentId: string) => {
    try {
      await feedsApi.deleteComment(feedId, postId, commentId)
      await loadPostsForFeed(feedId)
      toast.success('Comment deleted')
    } catch (error) {
      console.error('[HomePage] Failed to delete comment', error)
      toast.error('Failed to delete comment')
    }
  }, [loadPostsForFeed])

  useEffect(() => {
    void refreshFeedsFromApi()
  }, [refreshFeedsFromApi])

  // Load posts for each subscribed feed
  useEffect(() => {
    for (const feed of subscribedFeeds) {
      if (!loadedFeedsRef.current.has(feed.id) && !postsByFeed[feed.id]?.length) {
        loadedFeedsRef.current.add(feed.id)
        void loadPostsForFeed(feed.id)
      }
    }
  }, [subscribedFeeds, loadPostsForFeed, postsByFeed, loadedFeedsRef])

  return (
    <Main className="space-y-4">
      {errorMessage && (
        <Card className="border-destructive/30 bg-destructive/5 shadow-none">
          <CardContent className="p-4 text-sm text-destructive">{errorMessage}</CardContent>
        </Card>
      )}

      {ownedFeeds.length > 0 && (
        <div className="flex justify-end">
          <NewPostDialog feeds={ownedFeeds} onSubmit={handleLegacyDialogPost} />
        </div>
      )}

      {isLoadingFeeds ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : subscribedFeeds.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Rss className="mx-auto mb-4 size-12 text-muted-foreground" />
              <h2 className="text-lg font-semibold">No feeds yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Subscribe to feeds to see posts here, or create your own.
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <Link to="/search">
                  <Button variant="outline">
                    Search feeds
                  </Button>
                </Link>
                <Link to="/new">
                  <Button>
                    <Plus className="size-4" />
                    New feed
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : allPosts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Rss className="mx-auto mb-4 size-12 text-muted-foreground" />
              <h2 className="text-lg font-semibold">No posts yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your subscribed feeds don't have any posts yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <FeedPosts
            posts={allPosts}
            commentDrafts={commentDrafts}
            onDraftChange={(postId, value) =>
              setCommentDrafts((prev) => ({ ...prev, [postId]: value }))
            }
            onAddComment={handleAddComment}
            onReplyToComment={handleReplyToComment}
            onPostReaction={handlePostReaction}
            onCommentReaction={handleCommentReaction}
            onEditPost={handleEditPost}
            onDeletePost={handleDeletePost}
            onEditComment={handleEditComment}
            onDeleteComment={handleDeleteComment}
            showFeedName
          />
        )}
    </Main>
  )
}
