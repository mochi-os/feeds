import { useCallback, useEffect, useMemo } from 'react'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { APP_ROUTES } from '@/config/routes'
import { AuthenticatedLayout, type PostData, toast, getErrorMessage, type SidebarData, type NavItem, onShellMessage, naturalCompare} from '@mochi/web'
import { Plus, Rss, Search } from 'lucide-react'
import { feedsApi } from '@/api/feeds'
import { useFeedsStore } from '@/stores/feeds-store'
import { SidebarProvider, useSidebarContext } from '@/context/sidebar-context'
import { CreateFeedDialog } from '@/features/feeds/components/create-feed-dialog'
import { NewPostDialog } from '@/features/feeds/components/new-post-dialog'

function FeedsLayoutInner() {
  const { t } = useLingui()
  const feeds = useFeedsStore((state) => state.feeds)
  const isLoading = useFeedsStore((state) => state.isLoading)
  const refresh = useFeedsStore((state) => state.refresh)
  const {
    newPostDialogOpen,
    newPostFeedId,
    closeNewPostDialog,
    postRefreshHandler,
    createFeedDialogOpen,
    openCreateFeedDialog,
    closeCreateFeedDialog,
  } = useSidebarContext()
  const queryClient = useQueryClient()



  useEffect(() => {
    // Always refresh feeds list for sidebar display
    void refresh()

    // Refresh sidebar unread counts when tab regains focus
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)

    // Refresh sidebar when a notification arrives (broadcast from menu app)
    const unsubscribe = onShellMessage((msg) => {
      if (msg.type === 'notification-update') void refresh()
    })

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      unsubscribe()
    }
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
        toast.success(t`Post created`)
      } catch (error) {
        toast.error(getErrorMessage(error, t`Failed to create post`))
        throw error
      }
    },
    [queryClient, postRefreshHandler]
  )


  const sidebarData: SidebarData = useMemo(() => {
    // Show full feed navigation regardless of context
    // Sort feeds alphabetically by name
    const sortedFeeds = [...feeds].sort((a, b) =>
      naturalCompare(a.name, b.name)
    )

    // Build feed items - use fingerprint for shorter URLs when available
    const feedItems = sortedFeeds.map((feed) => {
      const id = feed.fingerprint ?? feed.id.replace(/^feeds\//, '')
      const title = feed.unreadPosts > 0 ? `${feed.name} (${feed.unreadPosts})` : feed.name

      return {
        title,
        url: APP_ROUTES.FEEDS.VIEW(id),
        icon: Rss,
      }
    })

    const totalUnread = feeds.reduce((sum, f) => sum + f.unreadPosts, 0)
    const allFeedsLabel = t`All feeds`
    const allFeedsItem: NavItem = {
      title: totalUnread > 0 ? `${allFeedsLabel} (${totalUnread})` : allFeedsLabel,
      url: '/',
      icon: Rss,
    }

    // Build action items (moved to bottom)
    const actionItems: NavItem[] = [
      { title: t`Find feeds`, icon: Search, url: '/find' },
      { title: t`Create feed`, icon: Plus, onClick: openCreateFeedDialog },
    ]

    const groups: SidebarData['navGroups'] = [
      {
        title: t`Feeds`,
        items: [allFeedsItem, ...feedItems],
      },
      {
        title: '',
        items: actionItems,
        separator: true,
      },
    ]


    return { navGroups: groups }
  }, [feeds, openCreateFeedDialog, t])

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
          showFeedSelector={newPostFeedId === ''}
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
