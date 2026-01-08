import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  useCommentActions,
  useFeedPosts,
  useFeedWebsocket,
  useFeeds,
  useFeedsWebsocket,
  usePostActions,
  useSubscription,
} from '@/hooks'
import type {
  Feed,
  FeedPermissions,
  FeedPost,
  FeedSummary,
  Post,
} from '@/types'
import {
  Main,
  Card,
  CardContent,
  Button,
  useAuthStore,
  usePageTitle,
  requestHelpers,
  getApiBasepath,
  getErrorMessage,
  type PostData,
  GeneralError,
  toast,
  Input,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from '@mochi/common'
import {
  AlertTriangle,
  Loader2,
  Plus,
  Rss,
  SquarePen,
  Search,
} from 'lucide-react'
import { mapFeedsToSummaries, mapPosts } from '@/api/adapters'
import endpoints from '@/api/endpoints'
import feedsApi from '@/api/feeds'
import { FeedPosts } from '@/features/feeds/components/feed-posts'
import { useSidebarContext } from '@/context/sidebar-context'
import { useDebounce } from '@/hooks/use-debounce'

// Response type for info endpoint - matches both class and entity context
interface InfoResponse {
  entity: boolean
  feeds?: Feed[]
  feed?: Feed
  permissions?: FeedPermissions
  fingerprint?: string
  user_id?: string
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
function EntityFeedPage({
  feed,
  permissions,
}: {
  feed: Feed
  permissions?: FeedPermissions
}) {
  const [search, setSearch] = useState('')
  const [searchDialogOpen, setSearchDialogOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const debouncedSearch = useDebounce(search, 500)
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const email = useAuthStore((state) => state.email)
  const isLoggedIn = !!email

  // Map feed to summary format
  const feedSummary: FeedSummary = useMemo(() => {
    const mapped = mapFeedsToSummaries([feed], new Set())
    return (
      mapped[0] || {
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

  // Placeholder to ensure correct sequential execution ordering - will be replaced by actual logic after grep
  // The actual replace happens after I find the call sites.s
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

  const refreshPosts = useCallback(async () => {
    const response = await requestHelpers.get<{ posts?: Post[] }>(
      getApiBasepath() + 'posts'
    )
    if (response?.posts) {
      setPosts(mapPosts(response.posts))
    }
  }, [feed.id])

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

  const handleEditPost = useCallback(
    async (
      postFeedId: string,
      postId: string,
      body: string,
      data?: PostData,
      order?: string[],
      files?: File[]
    ) => {
      await feedsApi.editPost({
        feed: postFeedId,
        post: postId,
        body,
        data,
        order,
        files,
      })
      await refreshPosts()
      toast.success('Post updated')
    },
    [refreshPosts]
  )

  const handleDeletePost = useCallback(
    async (postFeedId: string, postId: string) => {
      await feedsApi.deletePost(postFeedId, postId)
      await refreshPosts()
      toast.success('Post deleted')
    },
    [refreshPosts]
  )

  const handleEditComment = useCallback(
    async (feedId: string, postId: string, commentId: string, body: string) => {
      await feedsApi.editComment(feedId, postId, commentId, body)
      await refreshPosts()
      toast.success('Comment updated')
    },
    [refreshPosts]
  )

  const handleDeleteComment = useCallback(
    async (feedId: string, postId: string, commentId: string) => {
      await feedsApi.deleteComment(feedId, postId, commentId)
      await refreshPosts()
      toast.success('Comment deleted')
    },
    [refreshPosts]
  )

  // Search for feeds in directory
  useEffect(() => {
    if (!debouncedSearch || !searchDialogOpen) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    requestHelpers
      .get<{ data?: any[] }>(endpoints.feeds.search + `?search=${encodeURIComponent(debouncedSearch)}`)
      .then((response) => {
        console.log('[EntityFeedPage] Search response:', response)
        const results = response?.data || []
        console.log('[EntityFeedPage] Search results:', results)
        setSearchResults(results)
      })
      .catch((error) => {
        console.error('[EntityFeedPage] Search failed', error)
        setSearchResults([])
      })
      .finally(() => {
        setIsSearching(false)
      })
  }, [debouncedSearch, searchDialogOpen])

  const handleSubscribe = async (feedId: string) => {
    try {
      await feedsApi.subscribe(feedId)
      toast.success('Subscribed to feed')
      // Refresh search results
      const response = await requestHelpers.get<{ data?: any[] }>(
        endpoints.feeds.search + `?search=${encodeURIComponent(debouncedSearch)}`
      )
      setSearchResults(response?.data || [])
    } catch (error) {
      console.error('[EntityFeedPage] Subscribe failed', error)
      toast.error('Failed to subscribe')
    }
  }

  // Filter posts by search term
  const filteredPosts = useMemo(() => {
    if (!search) return posts
    const searchLower = search.toLowerCase()
    return posts.filter((post) =>
      post.body?.toLowerCase().includes(searchLower)
    )
  }, [posts, search])

  return (
    <>
      <Main>
        <div className='mb-6 flex items-center justify-between'>
          <h1 className='text-2xl font-bold tracking-tight'>{feedSummary.name}</h1>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setSearchDialogOpen(true)}
            >
              <Search className='mr-2 size-4' />
              Search
            </Button>
            {isLoggedIn && permissions?.manage && (
              <Button onClick={() => openNewPostDialog(feed.id)}>
                <SquarePen className='mr-2 size-4' />
                New post
              </Button>
            )}
          </div>
        </div>
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
      <ResponsiveDialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen}>
        <ResponsiveDialogContent className='flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-[700px]'>
          <ResponsiveDialogHeader className='border-b px-6 pt-6 pb-4'>
            <ResponsiveDialogTitle className='text-2xl font-semibold'>
              Search Feeds
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription className='text-muted-foreground mt-1 text-sm'>
              Search for feeds in the directory
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          
          <div className='flex-1 overflow-y-auto p-6'>
            <Input
              type='text'
              placeholder='Type to search feeds...'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='mb-4'
              autoFocus
            />
            
            {isSearching && (
              <div className='flex items-center justify-center py-12'>
                <Loader2 className='text-muted-foreground size-6 animate-spin' />
              </div>
            )}
            
            {!isSearching && search && (
              <div className='space-y-3'>
                {searchResults.length === 0 ? (
                  <div className='py-12 text-center'>
                    <Rss className='text-muted-foreground mx-auto mb-4 size-12' />
                    <h3 className='text-lg font-semibold'>No feeds found</h3>
                    <p className='text-muted-foreground mt-1 text-sm'>
                      Try adjusting your search
                    </p>
                  </div>
                ) : (
                  searchResults.map((feed: any) => (
                    <Card key={feed.id} className='hover:bg-accent/50 transition-colors'>
                      <CardContent className='flex items-center justify-between p-4'>
                        <div className='flex-1 min-w-0'>
                          <h4 className='font-semibold truncate'>{feed.name}</h4>
                          <p className='text-muted-foreground text-sm'>
                            {feed.fingerprint_hyphens}
                          </p>
                        </div>
                        <Button
                          size='sm'
                          onClick={() => handleSubscribe(feed.id)}
                          className='ml-4'
                        >
                          <Plus className='mr-2 size-4' />
                          Subscribe
                        </Button>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}
            
            {!search && !isSearching && (
              <div className='py-12 text-center'>
                <Search className='text-muted-foreground mx-auto mb-4 size-12' />
                <h3 className='text-lg font-semibold'>Start typing to search</h3>
                <p className='text-muted-foreground mt-1 text-sm'>
                  Find and subscribe to feeds in the directory
                </p>
              </div>
            )}
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  )
}

// Class context: Show all feeds list (original functionality)
function FeedsListPage({ feeds: _initialFeeds }: { feeds?: Feed[] }) {
  const [search, setSearch] = useState('')
  const [searchDialogOpen, setSearchDialogOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const debouncedSearch = useDebounce(search, 500)
  const [postsByFeed, setPostsByFeed] = useState<Record<string, FeedPost[]>>({})
  const [permissionsByFeed, setPermissionsByFeed] = useState<
    Record<string, FeedPermissions>
  >({})
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const loadedThisSession = useRef<Set<string>>(new Set())

  const {
    feeds,
    setFeeds,
    isLoadingFeeds,
    refreshFeedsFromApi,
    mountedRef,
    userId,
  } = useFeeds({
    onPostsLoaded: setPostsByFeed,
  })

  const { loadPostsForFeed } = useFeedPosts({
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

  // Get fingerprints for WebSocket subscriptions
  const feedFingerprints = useMemo(
    () =>
      subscribedFeeds
        .map((feed) => feed.fingerprint)
        .filter(Boolean) as string[],
    [subscribedFeeds]
  )

  // Connect to WebSockets for all subscribed feeds for real-time updates
  useFeedsWebsocket(feedFingerprints, userId)

  const ownedFeeds = useMemo(
    () => feeds.filter((feed) => Boolean(feed.isOwner)),
    [feeds]
  )

  const allPosts = useMemo(() => {
    const posts: FeedPost[] = []
    for (const feed of subscribedFeeds) {
      // Filter feeds by search term
      if (search && !feed.name.toLowerCase().includes(search.toLowerCase())) {
        continue
      }
      const feedPosts = postsByFeed[feed.id] ?? []
      const feedPermissions = permissionsByFeed[feed.id]
      posts.push(
        ...feedPosts.map((post) => ({
          ...post,
          isOwner: feed.isOwner,
          permissions: feedPermissions,
        }))
      )
    }
    return posts.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime()
      const dateB = new Date(b.createdAt).getTime()
      if (isNaN(dateA) && isNaN(dateB)) return 0
      if (isNaN(dateA)) return 1
      if (isNaN(dateB)) return -1
      return dateB - dateA
    })
  }, [subscribedFeeds, postsByFeed, permissionsByFeed, search])

  const { handlePostReaction } = usePostActions({
    selectedFeed: null,
    ownedFeeds,
    setFeeds,
    setSelectedFeedId: () => {},
    setPostsByFeed,
    loadPostsForFeed,
    loadedFeedsRef: loadedThisSession,
    refreshFeedsFromApi,
  })

  const { handleAddComment, handleReplyToComment, handleCommentReaction } =
    useCommentActions({
      setFeeds,
      setPostsByFeed,

      loadedFeedsRef: loadedThisSession,
      commentDrafts,
      setCommentDrafts,
    })

  const handleEditPost = useCallback(
    async (
      feedId: string,
      postId: string,
      body: string,
      data?: PostData,
      order?: string[],
      files?: File[]
    ) => {
      try {
        await feedsApi.editPost({
          feed: feedId,
          post: postId,
          body,
          data,
          order,
          files,
        })
        await loadPostsForFeed(feedId)
        toast.success('Post updated')
      } catch (error) {
        console.error('[FeedsListPage] Failed to edit post', error)
        toast.error(getErrorMessage(error, 'Failed to edit post'))
      }
    },
    [loadPostsForFeed]
  )

  const handleDeletePost = useCallback(
    async (feedId: string, postId: string) => {
      try {
        await feedsApi.deletePost(feedId, postId)
        await loadPostsForFeed(feedId)
        toast.success('Post deleted')
      } catch (error) {
        console.error('[FeedsListPage] Failed to delete post', error)
        toast.error(getErrorMessage(error, 'Failed to delete post'))
      }
    },
    [loadPostsForFeed]
  )

  const handleEditComment = useCallback(
    async (feedId: string, postId: string, commentId: string, body: string) => {
      try {
        await feedsApi.editComment(feedId, postId, commentId, body)
        await loadPostsForFeed(feedId)
        toast.success('Comment updated')
      } catch (error) {
        console.error('[FeedsListPage] Failed to edit comment', error)
        toast.error(getErrorMessage(error, 'Failed to edit comment'))
      }
    },
    [loadPostsForFeed]
  )

  const handleDeleteComment = useCallback(
    async (feedId: string, postId: string, commentId: string) => {
      try {
        await feedsApi.deleteComment(feedId, postId, commentId)
        await loadPostsForFeed(feedId)
        toast.success('Comment deleted')
      } catch (error) {
        console.error('[FeedsListPage] Failed to delete comment', error)
        toast.error(getErrorMessage(error, 'Failed to delete comment'))
      }
    },
    [loadPostsForFeed]
  )

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

  // Search for feeds in directory
  useEffect(() => {
    if (!debouncedSearch || !searchDialogOpen) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    requestHelpers
      .get<{ data?: any[] }>(endpoints.feeds.search + `?search=${encodeURIComponent(debouncedSearch)}`)
      .then((response) => {
        console.log('[FeedsListPage] Search response:', response)
        const results = response?.data || []
        console.log('[FeedsListPage] Search results:', results)
        setSearchResults(results)
      })
      .catch((error) => {
        console.error('[FeedsListPage] Search failed', error)
        setSearchResults([])
      })
      .finally(() => {
        setIsSearching(false)
      })
  }, [debouncedSearch, searchDialogOpen])

  const handleSubscribe = async (feedId: string) => {
    try {
      await feedsApi.subscribe(feedId)
      toast.success('Subscribed to feed')
      // Refresh search results
      const response = await requestHelpers.get<{ data?: any[] }>(
        endpoints.feeds.search + `?search=${encodeURIComponent(debouncedSearch)}`
      )
      setSearchResults(response?.data || [])
    } catch (error) {
      console.error('[FeedsListPage] Subscribe failed', error)
      toast.error('Failed to subscribe')
    }
  }

  return (
    <>
      <Main>
        <div className='mb-6 flex items-center justify-between'>
          <h1 className='text-2xl font-bold tracking-tight'>All feeds</h1>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setSearchDialogOpen(true)}
            >
              <Search className='mr-2 size-4' />
              Search
            </Button>
            <Link to='/new'>
              <Button size='sm'>
                <Plus className='mr-2 size-4' />
                New feed
              </Button>
            </Link>
          </div>
        </div>
        {errorMessage && (
          <Card className='border-destructive/30 bg-destructive/5 shadow-none'>
            <CardContent className='text-destructive p-4 text-sm'>
              {errorMessage}
            </CardContent>
          </Card>
        )}

        {isLoadingFeeds ? (
          <div className='flex items-center justify-center py-12'>
            <Loader2 className='text-muted-foreground size-6 animate-spin' />
          </div>
        ) : subscribedFeeds.length === 0 ? (
          <Card>
            <CardContent className='py-12 text-center'>
              <Rss className='text-muted-foreground mx-auto mb-4 size-12' />
              <h2 className='text-lg font-semibold'>No feeds yet</h2>
              <p className='text-muted-foreground mt-1 text-sm'>
                Subscribe to feeds to see posts here, or create your own.
              </p>
              <div className='mt-4 flex justify-center gap-2'>
                <Link to='/new'>
                  <Button>
                    <Plus className='size-4' />
                    New feed
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : allPosts.length === 0 ? (
          <Card>
            <CardContent className='py-12 text-center'>
              <Rss className='text-muted-foreground mx-auto mb-4 size-12' />
              <h2 className='text-lg font-semibold'>No posts yet</h2>
              <p className='text-muted-foreground mt-1 text-sm'>
                Your subscribed feeds don't have any posts yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <FeedPosts
            posts={allPosts}
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
            showFeedName
          />
        )}
      </Main>

      {/* Search Dialog */}
      <ResponsiveDialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen}>
        <ResponsiveDialogContent className='flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-[700px]'>
          <ResponsiveDialogHeader className='border-b px-6 pt-6 pb-4'>
            <ResponsiveDialogTitle className='text-2xl font-semibold'>
              Search Feeds
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription className='text-muted-foreground mt-1 text-sm'>
              Search for feeds in the directory
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          
          <div className='flex-1 overflow-y-auto p-6'>
            <Input
              type='text'
              placeholder='Type to search feeds...'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='mb-4'
              autoFocus
            />
            
            {isSearching && (
              <div className='flex items-center justify-center py-12'>
                <Loader2 className='text-muted-foreground size-6 animate-spin' />
              </div>
            )}
            
            {!isSearching && search && (
              <div className='space-y-3'>
                {searchResults.length === 0 ? (
                  <div className='py-12 text-center'>
                    <Rss className='text-muted-foreground mx-auto mb-4 size-12' />
                    <h3 className='text-lg font-semibold'>No feeds found</h3>
                    <p className='text-muted-foreground mt-1 text-sm'>
                      Try adjusting your search
                    </p>
                  </div>
                ) : (
                  searchResults.map((feed: any) => (
                    <Card key={feed.id} className='hover:bg-accent/50 transition-colors'>
                      <CardContent className='flex items-center justify-between p-4'>
                        <div className='flex-1 min-w-0'>
                          <h4 className='font-semibold truncate'>{feed.name}</h4>
                          <p className='text-muted-foreground text-sm'>
                            {feed.fingerprint_hyphens}
                          </p>
                        </div>
                        <Button
                          size='sm'
                          onClick={() => handleSubscribe(feed.id)}
                          className='ml-4'
                        >
                          <Plus className='mr-2 size-4' />
                          Subscribe
                        </Button>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}
            
            {!search && !isSearching && (
              <div className='py-12 text-center'>
                <Search className='text-muted-foreground mx-auto mb-4 size-12' />
                <h3 className='text-lg font-semibold'>Start typing to search</h3>
                <p className='text-muted-foreground mt-1 text-sm'>
                  Find and subscribe to feeds in the directory
                </p>
              </div>
            )}
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  )
}
