import { useCallback, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { APP_ROUTES } from '@/config/routes'
import { AuthenticatedLayout, type PostData, toast, type SidebarData, type NavItem, type NavSubItem, SearchEntityDialog } from '@mochi/common'
import { FileText, Plus, Rss, Search } from 'lucide-react'
import feedsApi from '@/api/feeds'
import { mapPosts } from '@/api/adapters'
import { useFeedsStore } from '@/stores/feeds-store'
import { SidebarProvider, useSidebarContext } from '@/context/sidebar-context'
import { CreateFeedDialog } from '@/features/feeds/components/create-feed-dialog'
import { NewPostDialog } from '@/features/feeds/components/new-post-dialog'
import endpoints from '@/api/endpoints'

function FeedsLayoutInner() {
  const feeds = useFeedsStore((state) => state.feeds)
  const postsByFeed = useFeedsStore((state) => state.postsByFeed)
  const isLoading = useFeedsStore((state) => state.isLoading)
  const refresh = useFeedsStore((state) => state.refresh)
  const {
    feedId,
    newPostDialogOpen,
    newPostFeedId,
    closeNewPostDialog,
    postRefreshHandler,
    searchDialogOpen,
    openSearchDialog,
    closeSearchDialog,
    createFeedDialogOpen,
    openCreateFeedDialog,
    closeCreateFeedDialog,
  } = useSidebarContext()
  const queryClient = useQueryClient()



  useEffect(() => {
    // Always refresh feeds list for sidebar display
    void refresh()
  }, [refresh])

  // Find target feed(s) for NewPostDialog based on which feed's "New post" was clicked
  // Empty string means "All feeds" - show all owned feeds
  const dialogFeeds = useMemo(() => {
    if (newPostFeedId === '') {
      // "All feeds" new post - show all owned feeds
      return feeds.filter((f) => f.isOwner)
    }
    if (!newPostFeedId) return []
    // Match on id, fingerprint, or stripped id (URL params might use fingerprint)
    const feed = feeds.find(
      (f) =>
        f.id === newPostFeedId ||
        f.fingerprint === newPostFeedId ||
        f.id.replace(/^feeds\//, '') === newPostFeedId
    )
    return feed ? [feed] : []
  }, [feeds, newPostFeedId])

  // Handle new post submission
  const handleNewPost = useCallback(
    async (input: {
      feedId: string
      body: string
      data?: PostData
      files: File[]
    }) => {
      try {
        await feedsApi.createPost({
          feed: input.feedId,
          body: input.body,
          data: input.data,
          files: input.files,
        })
        // Invalidate TanStack Query cache (for individual feed pages)
        await queryClient.invalidateQueries({
          queryKey: ['posts', input.feedId],
        })
        // Call the home page refresh handler if registered
        postRefreshHandler.current?.(input.feedId)
        toast.success('Post created')
      } catch (error) {
        // console.error('[FeedsLayout] Failed to create post', error)
        toast.error('Failed to create post')
      }
    },
    [queryClient, postRefreshHandler]
  )

  // Fetch posts for current feed to ensure sidebar is populated
  // This complements the store which only has timeline posts
  const { data: currentFeedData } = useQuery({
    queryKey: ['feed-sidebar', feedId],
    queryFn: async () => {
      if (!feedId) return null
      const response = await feedsApi.view({ feed: feedId })
      return response.data
    },
    enabled: !!feedId,
  })

  const currentFeedPosts = useMemo(() => {
    if (!currentFeedData?.posts) return []
    return mapPosts(currentFeedData.posts)
  }, [currentFeedData])

  // Set of subscribed feed IDs for search dialog
  const subscribedFeedIds = useMemo(
    () => new Set(feeds.flatMap((f) => [f.id, f.fingerprint].filter((x): x is string => !!x))),
    [feeds]
  )

  // Handle subscribe from search dialog
  const handleSubscribe = useCallback(async (feedId: string) => {
    await feedsApi.subscribe(feedId)
    queryClient.invalidateQueries({ queryKey: ['feeds'] })
  }, [queryClient])

  const sidebarData: SidebarData = useMemo(() => {
    // Show full feed navigation regardless of context
    // Sort feeds alphabetically by name
    const sortedFeeds = [...feeds].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    )

    // Build feed items - use fingerprint for shorter URLs when available
    const feedItems = sortedFeeds.map((feed) => {
      const id = feed.fingerprint ?? feed.id.replace(/^feeds\//, '')
      
      // Use locally fetched posts if this is the current feed, otherwise store posts
      const isCurrentFeed = feedId === feed.id || feedId === feed.fingerprint || feedId === id
      const storedPosts = postsByFeed[feed.id] || []
      
      // Merge posts, preferring current fetch if available
      let posts = storedPosts
      if (isCurrentFeed && currentFeedPosts.length > 0) {
        // Create a map to deduplicate by ID
        const postMap = new Map()
        storedPosts.forEach(p => postMap.set(p.id, p))
        currentFeedPosts.forEach(p => postMap.set(p.id, p))
        posts = Array.from(postMap.values())
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      }

      const postItems = posts.map((post) => ({
        title: post.title,
        url: `${APP_ROUTES.FEEDS.VIEW(id)}/${post.id}`,
        icon: FileText,
      }))

      const subItems: NavSubItem[] = []
      
      if (postItems.length > 0) {
        subItems.push({
          title: 'Posts',
          items: postItems,
        } as NavSubItem)
      }

      if (subItems.length > 0) {
        return {
          title: feed.name,
          url: APP_ROUTES.FEEDS.VIEW(id),
          icon: Rss,
          items: subItems,
        }
      }

      return {
        title: feed.name,
        url: APP_ROUTES.FEEDS.VIEW(id),
        icon: Rss,
      }
    })

    const allFeedsItem: NavItem = {
      title: 'All feeds',
      url: '/',
      icon: Rss,
    }

    // Build top action items
    const topItems: NavItem[] = [
      { title: 'Find feeds', icon: Search, onClick: openSearchDialog },
      { title: 'New feed', icon: Plus, onClick: openCreateFeedDialog, variant: 'primary' },
    ]

    const groups: SidebarData['navGroups'] = [
      {
        title: '',
        items: topItems,
      },
      {
        title: 'Feeds',
        items: [allFeedsItem, ...feedItems],
      },
    ]


    return { navGroups: groups }
  }, [feeds, postsByFeed, feedId, currentFeedPosts, openSearchDialog, openCreateFeedDialog])

  return (
    <>
      <AuthenticatedLayout sidebarData={sidebarData} isLoadingSidebar={isLoading && feeds.length === 0} />
      {/* NewPostDialog at layout level so it's always available */}
      {dialogFeeds.length > 0 && (
        <NewPostDialog
          feeds={dialogFeeds}
          onSubmit={handleNewPost}
          open={newPostDialogOpen}
          onOpenChange={(open) => {
            if (!open) closeNewPostDialog()
          }}
          hideTrigger
        />
      )}
      {/* CreateFeedDialog at layout level so it's always available */}
      <CreateFeedDialog
        open={createFeedDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeCreateFeedDialog()
        }}
        hideTrigger
      />
      {/* Search Dialog */}
      <SearchEntityDialog
        open={searchDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeSearchDialog()
        }}
        onSubscribe={handleSubscribe}
        subscribedIds={subscribedFeedIds}
        entityClass="feed"
        searchEndpoint={endpoints.feeds.search}
        icon={Rss}
        iconClassName="bg-orange-500/10 text-orange-600"
        title="Search feeds"
        description="Search for public feeds to subscribe to"
        placeholder="Search by name, ID, fingerprint, or URL..."
        emptyMessage="No feeds found"
      />
    </>
  )
}

export function FeedsLayout() {
  return (
    <SidebarProvider>
      <FeedsLayoutInner />
    </SidebarProvider>
  )
}
