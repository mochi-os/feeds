import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { APP_ROUTES } from '@/config/routes'
import { AuthenticatedLayout, type PostData } from '@mochi/common'
import type { SidebarData, NavItem } from '@mochi/common'
import { toast } from '@mochi/common'
import { Plus, Rss } from 'lucide-react'
import feedsApi from '@/api/feeds'
import { useFeedsStore } from '@/stores/feeds-store'
import { SidebarProvider, useSidebarContext } from '@/context/sidebar-context'
import { CreateFeedDialog } from '@/features/feeds/components/create-feed-dialog'
import { NewPostDialog } from '@/features/feeds/components/new-post-dialog'

function FeedsLayoutInner() {
  const feeds = useFeedsStore((state) => state.feeds)
  const refresh = useFeedsStore((state) => state.refresh)
  const {
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

  const sidebarData: SidebarData = useMemo(() => {
    console.log(
      '[FeedsLayoutInner] Building sidebarData with feeds:',
      feeds.length
    )

    // Show full feed navigation regardless of context
    // Sort feeds alphabetically by name
    const sortedFeeds = [...feeds].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    )
    console.log('[FeedsLayoutInner] Sorted feeds:', sortedFeeds)

    // Build feed items - use fingerprint for shorter URLs when available
    const feedItems = sortedFeeds.map((feed) => {
      const id = feed.fingerprint ?? feed.id.replace(/^feeds\//, '')
      return {
        title: feed.name,
        url: APP_ROUTES.FEEDS.VIEW(id),
        icon: Rss,
      }
    })
    console.log('[FeedsLayoutInner] Built feed items:', feedItems)

    // Build "All feeds" item
    const allFeedsItem = {
      title: 'All feeds',
      url: APP_ROUTES.HOME,
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
        title: '',
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
  }, [feeds])

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
