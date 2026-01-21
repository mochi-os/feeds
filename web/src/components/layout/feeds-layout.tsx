import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { APP_ROUTES } from '@/config/routes'
import { AuthenticatedLayout, type PostData } from '@mochi/common'
import type { SidebarData, NavItem } from '@mochi/common'
import { toast } from '@mochi/common'
import { FileText, Plus, Rss } from 'lucide-react'
import feedsApi from '@/api/feeds'
import { mapPosts } from '@/api/adapters'
import { useFeedsStore } from '@/stores/feeds-store'
import { SidebarProvider, useSidebarContext } from '@/context/sidebar-context'
import { CreateFeedDialog } from '@/features/feeds/components/create-feed-dialog'
import { NewPostDialog } from '@/features/feeds/components/new-post-dialog'

function FeedsLayoutInner() {
  const feeds = useFeedsStore((state) => state.feeds)
  const postsByFeed = useFeedsStore((state) => state.postsByFeed)
  const refresh = useFeedsStore((state) => state.refresh)
  const {
    feedId,
    newPostDialogOpen,
    newPostFeedId,
    closeNewPostDialog,
    postRefreshHandler,
  } = useSidebarContext()
  const queryClient = useQueryClient()
  const [createFeedDialogOpen, setCreateFeedDialogOpen] = useState(false)

  console.log(
    '[FeedsLayoutInner] Rendering with feeds count:',
    feeds.length,
    'feeds:',
    feeds
  )

  useEffect(() => {
    // Always refresh feeds list for sidebar display
    console.log('[FeedsLayoutInner] Calling refresh from useEffect')
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
        console.error('[FeedsLayout] Failed to create post', error)
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

      const subItems = posts.map((post) => ({
        title: post.title,
        url: `${APP_ROUTES.FEEDS.VIEW(id)}/${post.id}`,
        icon: FileText,
      }))

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

    // Build bottom actions group
    const bottomItems: NavItem[] = [
      {
        title: 'New feed',
        onClick: () => setCreateFeedDialogOpen(true),
        icon: Plus,
        variant: 'primary',
      },
    ]

    const groups: SidebarData['navGroups'] = [
      {
        title: 'Feeds',
        items: [allFeedsItem, ...feedItems],
      },
      {
        title: '',
        separator: true,
        items: bottomItems,
      },
    ]
    console.log('[FeedsLayoutInner] Final sidebar groups:', groups)

    return { navGroups: groups }
  }, [feeds, postsByFeed, feedId, currentFeedPosts])

  return (
    <>
      <AuthenticatedLayout sidebarData={sidebarData} />
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
        onOpenChange={setCreateFeedDialogOpen}
        hideTrigger
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
