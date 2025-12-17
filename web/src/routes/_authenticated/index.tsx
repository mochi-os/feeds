import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { Header, Main, Card, CardContent, Button } from '@mochi/common'
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
import { Home, Loader2, Plus, Rss } from 'lucide-react'

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
      posts.push(...feedPosts)
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
    selectedFeed: null,
    setFeeds,
    setPostsByFeed,
    loadPostsForFeed,
    loadedFeedsRef,
    commentDrafts,
    setCommentDrafts,
  })

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
    <>
      <Header>
        <div className="flex items-center gap-2">
          <Home className="size-5" />
          <h1 className="text-lg font-semibold">Home</h1>
        </div>
      </Header>
      <Main className="space-y-6">
        {errorMessage && (
          <Card className="border-destructive/30 bg-destructive/5 shadow-none">
            <CardContent className="p-4 text-sm text-destructive">{errorMessage}</CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Recent posts from feeds you follow
            </p>
          </div>
          {ownedFeeds.length > 0 && (
            <NewPostDialog feeds={ownedFeeds} onSubmit={handleLegacyDialogPost} />
          )}
        </div>

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
          />
        )}
      </Main>
    </>
  )
}
