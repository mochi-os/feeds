import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Main,
  Card,
  CardContent,
  Button,
  useAuthStore,
  usePageTitle,
  requestHelpers,
  getApiBasepath,
  useScreenSize,
} from '@mochi/common'
import { AlertTriangle, Loader2, Rss, SquarePen, Search } from 'lucide-react'
import type { Feed, FeedPermissions, FeedPost, FeedSummary, Post } from '@/types'
import { mapFeedsToSummaries, mapPosts } from '@/api/adapters'
import feedsApi from '@/api/feeds'
import { useFeedWebsocket } from '@/hooks'
import { useSidebarContext } from '@/context/sidebar-context'
import { PageHeader } from '@mochi/common'
import { FeedPosts } from '../components/feed-posts'
import { FeedSearchDialog } from '../components/feed-search-dialog'
import { useFeedSearch, usePostHandlers } from '../hooks'

interface EntityFeedPageProps {
  feed: Feed
  permissions?: FeedPermissions
}

export function EntityFeedPage({ feed, permissions }: EntityFeedPageProps) {
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const email = useAuthStore((state) => state.email)
  const isLoggedIn = !!email
  const { isMobile } = useScreenSize()

  // Feed search hook
  const {
    search,
    setSearch,
    searchDialogOpen,
    setSearchDialogOpen,
    searchResults,
    isSearching,
    handleSubscribe,
  } = useFeedSearch()

  // Map feed to summary format
  const feedSummary: FeedSummary = useMemo(() => {
    const mapped = mapFeedsToSummaries([feed], new Set())
    return (
      mapped[0] || {
        id: feed.id,
        name: feed.name || feed.fingerprint || 'Feed',
        description: '',
        tags: [],
        owner: feed.owner ? 'You' : 'Subscribed feed',
        subscribers: feed.subscribers ?? 0,
        unreadPosts: 0,
        lastActive: '',
        isSubscribed: true,
        isOwner: !!feed.owner,
        fingerprint: feed.fingerprint,
        privacy: feed.privacy,
        permissions,
      }
    )
  }, [feed, permissions])

  // Set page title to feed name
  usePageTitle(feedSummary.name)

  // Register with sidebar context
  const { setFeedId, openNewPostDialog } = useSidebarContext()
  useEffect(() => {
    setFeedId(feed.id)
    return () => setFeedId(null)
  }, [feed.id, setFeedId])

  // Connect to WebSocket for real-time updates
  useFeedWebsocket(feed.fingerprint)

  // Fetch posts
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [isLoadingPosts, setIsLoadingPosts] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const refreshPosts = useCallback(async () => {
    const response = await requestHelpers.get<{ posts?: Post[] }>(
      getApiBasepath() + 'posts'
    )
    if (response?.posts) {
      setPosts(mapPosts(response.posts))
    }
  }, [])

  useEffect(() => {
    setIsLoadingPosts(true)
    setLoadError(null)
    // Use getApiBasepath() which correctly handles entity context (returns /-/ for domain routing)
    requestHelpers
      .get<{ posts?: Post[] }>(getApiBasepath() + 'posts')
      .then((response) => {
        if (response?.posts) {
          setPosts(mapPosts(response.posts))
        }
      })
      .catch((error) => {
        console.error('[EntityFeedPage] Failed to load posts', error)
        const message =
          error instanceof Error ? error.message : 'Failed to load posts'
        setLoadError(message)
      })
      .finally(() => {
        setIsLoadingPosts(false)
      })
  }, [feed.id])

  // Post handlers
  const handlePostReaction = useCallback(
    (postFeedId: string, postId: string, reaction: string) => {
      setPosts((prev) =>
        prev.map((post) => {
          if (post.id !== postId) return post
          const currentReaction = post.userReaction
          const newCounts = { ...post.reactions }
          let newUserReaction = currentReaction

          if (reaction === '' || currentReaction === reaction) {
            if (currentReaction) {
              newCounts[currentReaction] = Math.max(
                0,
                (newCounts[currentReaction] ?? 0) - 1
              )
            }
            newUserReaction = null
          } else {
            if (currentReaction) {
              newCounts[currentReaction] = Math.max(
                0,
                (newCounts[currentReaction] ?? 0) - 1
              )
            }
            newCounts[reaction as keyof typeof newCounts] =
              (newCounts[reaction as keyof typeof newCounts] ?? 0) + 1
            newUserReaction = reaction as typeof currentReaction
          }

          return {
            ...post,
            reactions: newCounts,
            userReaction: newUserReaction,
          }
        })
      )
      void feedsApi.reactToPost(postFeedId, postId, reaction)
    },
    []
  )

  const handleAddComment = useCallback(
    async (postFeedId: string, postId: string, body?: string) => {
      if (!body) return
      await feedsApi.createComment({ feed: postFeedId, post: postId, body })
      await refreshPosts()
      setCommentDrafts((prev) => ({ ...prev, [postId]: '' }))
    },
    [refreshPosts]
  )

  const handleReplyToComment = useCallback(
    async (
      postFeedId: string,
      postId: string,
      parentId: string,
      body: string
    ) => {
      await feedsApi.createComment({
        feed: postFeedId,
        post: postId,
        body,
        parent: parentId,
      })
      await refreshPosts()
    },
    [refreshPosts]
  )

  const handleCommentReaction = useCallback(
    async (
      postFeedId: string,
      postId: string,
      commentId: string,
      reaction: string
    ) => {
      await feedsApi.reactToComment(postFeedId, postId, commentId, reaction)
      await refreshPosts()
    },
    [refreshPosts]
  )

  // Use the shared post handlers hook
  const { handleEditPost, handleDeletePost, handleEditComment, handleDeleteComment } =
    usePostHandlers({
      onRefresh: refreshPosts,
    })

  // Filter posts by search term
  const filteredPosts = useMemo(() => {
    if (!search) return posts
    const searchLower = search.toLowerCase()
    return posts.filter((post) => post.body?.toLowerCase().includes(searchLower))
  }, [posts, search])

  return (
    <>
      <PageHeader
        title={feedSummary.name}
        searchBar={
          <Button 
            variant='outline' 
            className='w-full justify-start'
            onClick={() => setSearchDialogOpen(true)}
          >
            <Search className='mr-2 size-4' />
            Search posts
          </Button>
        }
        actions={
          <>
            {!isMobile && (
              <Button
                variant='outline'
                size='sm'
                onClick={() => setSearchDialogOpen(true)}
              >
                <Search className='mr-2 size-4' />
                Search
              </Button>
            )}
            {isLoggedIn && permissions?.manage && (
              <Button onClick={() => openNewPostDialog(feed.id)}>
                <SquarePen className='mr-2 size-4' />
                New post
              </Button>
            )}
          </>
        }
      />
      <Main>
        {/* Posts */}
        {isLoadingPosts ? (
          <Card className='shadow-md'>
            <CardContent className='p-6 text-center'>
              <Loader2 className='text-muted-foreground mx-auto mb-3 size-6 animate-spin' />
              <p className='text-muted-foreground text-sm'>Loading posts...</p>
            </CardContent>
          </Card>
        ) : loadError ? (
          <Card className='border-destructive/50'>
            <CardContent className='py-12 text-center'>
              <AlertTriangle className='text-destructive mx-auto mb-4 size-12' />
              <h2 className='text-lg font-semibold'>Error loading posts</h2>
              <p className='text-muted-foreground mt-1 text-sm'>{loadError}</p>
            </CardContent>
          </Card>
        ) : posts.length === 0 ? (
          <Card>
            <CardContent className='py-12 text-center'>
              <Rss className='text-muted-foreground mx-auto mb-4 size-12' />
              <h2 className='text-lg font-semibold'>
                {search ? 'No matching posts' : 'No posts yet'}
              </h2>
              <p className='text-muted-foreground mt-1 text-sm'>
                {search
                  ? 'Try adjusting your search'
                  : "This feed doesn't have any posts yet."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <FeedPosts
            posts={filteredPosts}
            commentDrafts={commentDrafts}
            onDraftChange={(postId: string, value: string) =>
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
            isFeedOwner={feedSummary.isOwner ?? false}
            permissions={permissions}
          />
        )}
      </Main>

      {/* Search Dialog */}
      <FeedSearchDialog
        open={searchDialogOpen}
        onOpenChange={setSearchDialogOpen}
        search={search}
        onSearchChange={setSearch}
        searchResults={searchResults}
        isSearching={isSearching}
        onSubscribe={handleSubscribe}
      />
    </>
  )
}
