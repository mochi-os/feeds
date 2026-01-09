import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthenticatedLayout, type PostData, getApiBasepath } from '@mochi/common'
import type { SidebarData, NavItem } from '@mochi/common'
import { Plus, Rss } from 'lucide-react'
import { useFeedsStore } from '@/stores/feeds-store'
import { APP_ROUTES } from '@/config/routes'
import { SidebarProvider, useSidebarContext } from '@/context/sidebar-context'
import { NewPostDialog } from '@/features/feeds/components/new-post-dialog'
import { CreateFeedDialog } from '@/features/feeds/components/create-feed-dialog'
import feedsApi from '@/api/feeds'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@mochi/common'

function FeedsLayoutInner() {
  const feeds = useFeedsStore((state) => state.feeds)
  const refresh = useFeedsStore((state) => state.refresh)
  const { newPostDialogOpen, newPostFeedId, closeNewPostDialog, postRefreshHandler } = useSidebarContext()
  const queryClient = useQueryClient()
  const [createFeedDialogOpen, setCreateFeedDialogOpen] = useState(false)

  // Detect if we're in entity context (domain routing to a specific feed)
  // In entity context, the API basepath ends with /-/
  const isEntityContext = useMemo(() => {
    const basepath = getApiBasepath()
    return basepath.endsWith('/-/')
  }, [])

  useEffect(() => {
    // Only refresh feeds list in class context
    // In entity context, we're viewing a single feed via domain routing
    if (!isEntityContext) {
      void refresh()
    }
  }, [refresh, isEntityContext])

  // Find target feed(s) for NewPostDialog based on which feed's "New post" was clicked
  // Empty string means "All feeds" - show all owned feeds
  const dialogFeeds = useMemo(() => {
    if (newPostFeedId === '') {
      // "All feeds" new post - show all owned feeds
      return feeds.filter((f) => f.isOwner)
    }
    if (!newPostFeedId) return []
    // Match on id, fingerprint, or stripped id (URL params might use fingerprint)
    const feed = feeds.find((f) => 
      f.id === newPostFeedId || 
      f.fingerprint === newPostFeedId ||
      f.id.replace(/^feeds\//, '') === newPostFeedId
    )
    return feed ? [feed] : []
  }, [feeds, newPostFeedId])

  // Handle new post submission
  const handleNewPost = useCallback(async (input: { feedId: string; body: string; data?: PostData; files: File[] }) => {
    try {
      await feedsApi.createPost({
        feed: input.feedId,
        body: input.body,
        data: input.data,
        files: input.files,
      })
      // Invalidate TanStack Query cache (for individual feed pages)
      await queryClient.invalidateQueries({ queryKey: ['posts', input.feedId] })
      // Call the home page refresh handler if registered
      postRefreshHandler.current?.(input.feedId)
      toast.success('Post created')
    } catch (error) {
      console.error('[FeedsLayout] Failed to create post', error)
      toast.error('Failed to create post')
    }
  }, [queryClient, postRefreshHandler])

  const sidebarData: SidebarData = useMemo(() => {
    // In entity context, don't show feed navigation
    // Users are locked to the specific feed they're viewing via domain routing
    if (isEntityContext) {
      const bottomItems: NavItem[] = [
        { title: 'New feed', onClick: () => setCreateFeedDialogOpen(true), icon: Plus },
      ]

      return {
        navGroups: [
          {
            title: '',
            items: bottomItems,
          },
        ],
      }
    }

    // Class context - show full feed navigation
    // Sort feeds alphabetically by name
    const sortedFeeds = [...feeds].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    )

    // Build feed items - use fingerprint for shorter URLs when available
    const feedItems = sortedFeeds.map((feed) => {
      const id = feed.fingerprint ?? feed.id.replace(/^feeds\//, '')
      return {
        title: feed.name,
        url: APP_ROUTES.FEEDS.VIEW(id),
        icon: Rss,
      }
    })

    // Build "All feeds" item
    const allFeedsItem = {
      title: 'All feeds',
      url: APP_ROUTES.HOME,
      icon: Rss,
    }

    // Build bottom actions group
    const bottomItems: NavItem[] = [
      { title: 'New feed', onClick: () => setCreateFeedDialogOpen(true), icon: Plus },
    ]

    const groups: SidebarData['navGroups'] = [
      {
        title: '',
        items: [
          allFeedsItem,
          ...feedItems,
        ],
      },
      {
        title: '',
        separator: true,
        items: bottomItems,
      },
    ]

    return { navGroups: groups }
  }, [feeds, isEntityContext])

  return (
    <>
      <AuthenticatedLayout sidebarData={sidebarData} />
      {/* NewPostDialog at layout level so it's always available */}
      {dialogFeeds.length > 0 && (
        <NewPostDialog
          feeds={dialogFeeds}
          onSubmit={handleNewPost}
          open={newPostDialogOpen}
          onOpenChange={(open) => { if (!open) closeNewPostDialog() }}
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
