import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Main, Card, CardContent, Button, usePageTitle, isDomainEntityRouting, type PostData } from '@mochi/common'
import { toast } from 'sonner'
import {
  useCommentActions,
  useFeedPosts,
  useFeeds,
  usePostActions,
  useSubscription,
} from '@/hooks'
import { useSidebarContext } from '@/context/sidebar-context'
import type { FeedPermissions, FeedPost } from '@/types'
import { FeedPosts } from '@/features/feeds/components/feed-posts'
import { Loader2, Plus, Rss } from 'lucide-react'
import feedsApi from '@/api/feeds'

export const Route = createFileRoute('/_authenticated/')({
  component: HomePage,
})

// Check once at module load if we're on domain entity routing
const isEntityDomain = isDomainEntityRouting()

function HomePage() {
  const [postsByFeed, setPostsByFeed] = useState<Record<string, FeedPost[]>>({})
  const [permissionsByFeed, setPermissionsByFeed] = useState<Record<string, FeedPermissions>>({})
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [entityFeedName, setEntityFeedName] = useState<string | null>(null)
  // Track which feeds have been loaded this session to avoid duplicate fetches
  const loadedThisSession = useRef<Set<string>>(new Set())

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
  } = useFeedPosts({
    setErrorMessage,
    postsByFeed,
    setPostsByFeed,
    permissionsByFeed,
    setPermissionsByFeed,
  })

  useSubscription({
    feeds,
    setFeeds,
    setErrorMessage,
    refreshFeedsFromApi,
    mountedRef,
  })

  // Register handler for post refresh when posts are created from the sidebar
  const { postRefreshHandler } = useSidebarContext()
  useEffect(() => {
    postRefreshHandler.current = (feedId: string) => {
      loadedThisSession.current.delete(feedId)
      void loadPostsForFeed(feedId, true)
    }
    return () => {
      postRefreshHandler.current = null
    }
  }, [postRefreshHandler, loadPostsForFeed])

  // Fetch entity feed name when on domain entity routing
  useEffect(() => {
    if (!isEntityDomain) return
    feedsApi.view().then((response) => {
      const feed = response.data?.feed
      if (feed && 'name' in feed) {
        setEntityFeedName(feed.name as string)
      }
    }).catch(() => {
      // Ignore errors, will just show default title
    })
  }, [])

  // Set page title - use entity feed name if on domain entity routing
  usePageTitle(entityFeedName ?? 'Feeds')

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
      // Add isOwner and permissions to each post based on feed data
      // Use permissionsByFeed which is populated when posts are fetched
      const feedPermissions = permissionsByFeed[feed.id]
      posts.push(...feedPosts.map(post => ({
        ...post,
        isOwner: feed.isOwner,
        permissions: feedPermissions,
      })))
    }
    return posts.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime()
      const dateB = new Date(b.createdAt).getTime()
      if (isNaN(dateA) && isNaN(dateB)) return 0
      if (isNaN(dateA)) return 1
      if (isNaN(dateB)) return -1
      return dateB - dateA
    })
  }, [subscribedFeeds, postsByFeed, permissionsByFeed])

  const {
    handlePostReaction,
  } = usePostActions({
    selectedFeed: null,
    ownedFeeds,
    setFeeds,
    setSelectedFeedId: () => {},
    setPostsByFeed,
    loadPostsForFeed,
    loadedFeedsRef: loadedThisSession,
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
    loadedFeedsRef: loadedThisSession,
    commentDrafts,
    setCommentDrafts,
  })

  // Edit/delete handlers for posts
  const handleEditPost = useCallback(async (feedId: string, postId: string, body: string, data?: PostData, order?: string[], files?: File[]) => {
    try {
      await feedsApi.editPost({ feed: feedId, post: postId, body, data, order, files })
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

  // Load posts for each subscribed feed (also fetches permissions)
  // Uses local ref so posts are reloaded on each page visit (syncs with individual feed page)
  useEffect(() => {
    for (const feed of subscribedFeeds) {
      if (!loadedThisSession.current.has(feed.id)) {
        loadedThisSession.current.add(feed.id)
        void loadPostsForFeed(feed.id)
      }
    }
  }, [subscribedFeeds, loadPostsForFeed])

  return (
    <Main className="space-y-4">
      {errorMessage && (
        <Card className="border-destructive/30 bg-destructive/5 shadow-none">
          <CardContent className="p-4 text-sm text-destructive">{errorMessage}</CardContent>
        </Card>
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
