import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Main, Card, CardContent, Button, useAuthStore, usePageTitle, requestHelpers, getApiBasepath, type PostData, GeneralError } from '@mochi/common'
import { toast } from 'sonner'
import {
  useCommentActions,
  useFeedPosts,
  useFeeds,
  usePostActions,
  useSubscription,
} from '@/hooks'
import { useSidebarContext } from '@/context/sidebar-context'
import type { Feed, FeedPermissions, FeedPost, FeedSummary, Post } from '@/types'
import { FeedPosts } from '@/features/feeds/components/feed-posts'
import { Loader2, Plus, Rss } from 'lucide-react'
import feedsApi from '@/api/feeds'
import endpoints from '@/api/endpoints'
import { mapFeedsToSummaries, mapPosts } from '@/api/adapters'

// Response type for info endpoint - matches both class and entity context
interface InfoResponse {
  entity: boolean
  feeds?: Feed[]
  feed?: Feed
  permissions?: FeedPermissions
  fingerprint?: string
}

export const Route = createFileRoute('/_authenticated/')({
  loader: async () => {
    return requestHelpers.get<InfoResponse>(endpoints.feeds.info)
  },
  component: IndexPage,
  errorComponent: ({ error }) => <GeneralError error={error} />,
})

function IndexPage() {
  const data = Route.useLoaderData()

  // If we're in entity context, show the feed page directly
  if (data.entity && data.feed) {
    return <EntityFeedPage feed={data.feed} permissions={data.permissions} />
  }

  // Class context - show feeds list
  return <FeedsListPage feeds={data.feeds} />
}

// Entity context: Show single feed (similar to $feedId.tsx but simpler)
function EntityFeedPage({ feed, permissions }: { feed: Feed; permissions?: FeedPermissions }) {
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const email = useAuthStore((state) => state.email)
  const isLoggedIn = !!email

  // Map feed to summary format
  const feedSummary: FeedSummary = useMemo(() => {
    const mapped = mapFeedsToSummaries([feed], new Set())
    return mapped[0] || {
      id: feed.id,
      name: feed.name || feed.fingerprint || 'Feed',
      description: '',
      tags: [],
      owner: feed.owner === 1 ? 'You' : 'Subscribed feed',
      subscribers: feed.subscribers ?? 0,
      unreadPosts: 0,
      lastActive: '',
      isSubscribed: true,
      isOwner: feed.owner === 1,
      fingerprint: feed.fingerprint,
      privacy: feed.privacy,
      permissions,
    }
  }, [feed, permissions])

  // Set page title to feed name
  usePageTitle(feedSummary.name)

  // Register with sidebar context
  const { setFeedId, openNewPostDialog } = useSidebarContext()
  useEffect(() => {
    setFeedId(feed.id)
    return () => setFeedId(null)
  }, [feed.id, setFeedId])

  // Fetch posts
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [isLoadingPosts, setIsLoadingPosts] = useState(true)

  useEffect(() => {
    setIsLoadingPosts(true)
    // Use getApiBasepath() which correctly handles entity context (returns /-/ for domain routing)
    requestHelpers.get<{ posts?: Post[] }>(getApiBasepath() + 'posts')
      .then((response) => {
        if (response?.posts) {
          setPosts(mapPosts(response.posts))
        }
      })
      .catch((error) => {
        console.error('[EntityFeedPage] Failed to load posts', error)
      })
      .finally(() => {
        setIsLoadingPosts(false)
      })
  }, [feed.id])

  // Post handlers
  const handlePostReaction = useCallback((postFeedId: string, postId: string, reaction: string) => {
    setPosts(prev => prev.map(post => {
      if (post.id !== postId) return post
      const currentReaction = post.userReaction
      const newCounts = { ...post.reactions }
      let newUserReaction = currentReaction

      if (reaction === '' || currentReaction === reaction) {
        if (currentReaction) {
          newCounts[currentReaction] = Math.max(0, (newCounts[currentReaction] ?? 0) - 1)
        }
        newUserReaction = null
      } else {
        if (currentReaction) {
          newCounts[currentReaction] = Math.max(0, (newCounts[currentReaction] ?? 0) - 1)
        }
        newCounts[reaction as keyof typeof newCounts] = (newCounts[reaction as keyof typeof newCounts] ?? 0) + 1
        newUserReaction = reaction as typeof currentReaction
      }

      return { ...post, reactions: newCounts, userReaction: newUserReaction }
    }))
    void feedsApi.reactToPost(postFeedId, postId, reaction)
  }, [])

  const refreshPosts = useCallback(async () => {
    const response = await requestHelpers.get<{ posts?: Post[] }>(getApiBasepath() + 'posts')
    if (response?.posts) {
      setPosts(mapPosts(response.posts))
    }
  }, [feed.id])

  const handleAddComment = useCallback(async (postFeedId: string, postId: string, body?: string) => {
    if (!body) return
    await feedsApi.createComment({ feed: postFeedId, post: postId, body })
    await refreshPosts()
    setCommentDrafts(prev => ({ ...prev, [postId]: '' }))
  }, [refreshPosts])

  const handleReplyToComment = useCallback(async (postFeedId: string, postId: string, parentId: string, body: string) => {
    await feedsApi.createComment({ feed: postFeedId, post: postId, body, parent: parentId })
    await refreshPosts()
  }, [refreshPosts])

  const handleCommentReaction = useCallback(async (postFeedId: string, postId: string, commentId: string, reaction: string) => {
    await feedsApi.reactToComment(postFeedId, postId, commentId, reaction)
    await refreshPosts()
  }, [refreshPosts])

  const handleEditPost = useCallback(async (postFeedId: string, postId: string, body: string, data?: PostData, order?: string[], files?: File[]) => {
    await feedsApi.editPost({ feed: postFeedId, post: postId, body, data, order, files })
    await refreshPosts()
    toast.success('Post updated')
  }, [refreshPosts])

  const handleDeletePost = useCallback(async (postFeedId: string, postId: string) => {
    await feedsApi.deletePost(postFeedId, postId)
    await refreshPosts()
    toast.success('Post deleted')
  }, [refreshPosts])

  const handleEditComment = useCallback(async (feedId: string, postId: string, commentId: string, body: string) => {
    await feedsApi.editComment(feedId, postId, commentId, body)
    await refreshPosts()
    toast.success('Comment updated')
  }, [refreshPosts])

  const handleDeleteComment = useCallback(async (feedId: string, postId: string, commentId: string) => {
    await feedsApi.deleteComment(feedId, postId, commentId)
    await refreshPosts()
    toast.success('Comment deleted')
  }, [refreshPosts])

  return (
    <Main className="space-y-4">
      {/* Action buttons - only show for logged in users */}
      {isLoggedIn && permissions?.manage && (
        <div className="-mt-1 flex justify-end gap-2">
          <Button onClick={() => openNewPostDialog(feed.id)}>
            New post
          </Button>
        </div>
      )}

      {/* Posts */}
      {isLoadingPosts ? (
        <Card className="shadow-md">
          <CardContent className="p-6 text-center">
            <Loader2 className="mx-auto mb-3 size-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading posts...</p>
          </CardContent>
        </Card>
      ) : posts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Rss className="mx-auto mb-4 size-12 text-muted-foreground" />
            <h2 className="text-lg font-semibold">No posts yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This feed doesn't have any posts yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <FeedPosts
          posts={posts}
          commentDrafts={commentDrafts}
          onDraftChange={(postId, value) => setCommentDrafts(prev => ({ ...prev, [postId]: value }))}
          onAddComment={handleAddComment}
          onReplyToComment={handleReplyToComment}
          onPostReaction={handlePostReaction}
          onCommentReaction={handleCommentReaction}
          onEditPost={handleEditPost}
          onDeletePost={handleDeletePost}
          onEditComment={handleEditComment}
          onDeleteComment={handleDeleteComment}
          isFeedOwner={feedSummary.isOwner ?? false}
          permissions={permissions}
        />
      )}
    </Main>
  )
}

// Class context: Show all feeds list (original functionality)
function FeedsListPage({ feeds: _initialFeeds }: { feeds?: Feed[] }) {
  const [postsByFeed, setPostsByFeed] = useState<Record<string, FeedPost[]>>({})
  const [permissionsByFeed, setPermissionsByFeed] = useState<Record<string, FeedPermissions>>({})
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
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

  const handleEditPost = useCallback(async (feedId: string, postId: string, body: string, data?: PostData, order?: string[], files?: File[]) => {
    try {
      await feedsApi.editPost({ feed: feedId, post: postId, body, data, order, files })
      await loadPostsForFeed(feedId)
      toast.success('Post updated')
    } catch (error) {
      console.error('[FeedsListPage] Failed to edit post', error)
      toast.error('Failed to edit post')
    }
  }, [loadPostsForFeed])

  const handleDeletePost = useCallback(async (feedId: string, postId: string) => {
    try {
      await feedsApi.deletePost(feedId, postId)
      await loadPostsForFeed(feedId)
      toast.success('Post deleted')
    } catch (error) {
      console.error('[FeedsListPage] Failed to delete post', error)
      toast.error('Failed to delete post')
    }
  }, [loadPostsForFeed])

  const handleEditComment = useCallback(async (feedId: string, postId: string, commentId: string, body: string) => {
    try {
      await feedsApi.editComment(feedId, postId, commentId, body)
      await loadPostsForFeed(feedId)
      toast.success('Comment updated')
    } catch (error) {
      console.error('[FeedsListPage] Failed to edit comment', error)
      toast.error('Failed to edit comment')
    }
  }, [loadPostsForFeed])

  const handleDeleteComment = useCallback(async (feedId: string, postId: string, commentId: string) => {
    try {
      await feedsApi.deleteComment(feedId, postId, commentId)
      await loadPostsForFeed(feedId)
      toast.success('Comment deleted')
    } catch (error) {
      console.error('[FeedsListPage] Failed to delete comment', error)
      toast.error('Failed to delete comment')
    }
  }, [loadPostsForFeed])

  useEffect(() => {
    void refreshFeedsFromApi()
  }, [refreshFeedsFromApi])

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
