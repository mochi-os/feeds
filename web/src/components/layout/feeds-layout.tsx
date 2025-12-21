import { useCallback, useEffect, useMemo } from 'react'
import { useLocation } from '@tanstack/react-router'
import { AuthenticatedLayout } from '@mochi/common'
import type { SidebarData } from '@mochi/common'
import { Plus, Rss, Search, Settings, SquarePen } from 'lucide-react'
import { useFeedsStore } from '@/stores/feeds-store'
import { APP_ROUTES } from '@/config/routes'
import { SidebarProvider, useSidebarContext } from '@/context/sidebar-context'
import { NewPostDialog } from '@/features/feeds/components/new-post-dialog'
import feedsApi from '@/api/feeds'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

function FeedsLayoutInner() {
  const feeds = useFeedsStore((state) => state.feeds)
  const refresh = useFeedsStore((state) => state.refresh)
  const { feedId, newPostDialogOpen, newPostFeedId, openNewPostDialog, closeNewPostDialog } = useSidebarContext()
  const queryClient = useQueryClient()
  const pathname = useLocation({ select: (location) => location.pathname })

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Get owned feeds for "All feeds" new post option
  const ownedFeeds = useMemo(() => feeds.filter((f) => f.isOwner), [feeds])

  // Find target feed(s) for NewPostDialog based on which feed's "New post" was clicked
  // Empty string means "All feeds" - show all owned feeds
  const dialogFeeds = useMemo(() => {
    if (newPostFeedId === '') {
      // "All feeds" new post - show all owned feeds
      return feeds.filter((f) => f.isOwner)
    }
    if (!newPostFeedId) return []
    const feed = feeds.find((f) => f.id === newPostFeedId || f.id.replace(/^feeds\//, '') === newPostFeedId)
    return feed ? [feed] : []
  }, [feeds, newPostFeedId])

  // Handle new post submission
  const handleNewPost = useCallback(async (input: { feedId: string; body: string; files: File[] }) => {
    try {
      await feedsApi.createPost({
        feed: input.feedId,
        body: input.body,
        files: input.files,
      })
      await queryClient.invalidateQueries({ queryKey: ['posts', input.feedId] })
      toast.success('Post created')
    } catch (error) {
      console.error('[FeedsLayout] Failed to create post', error)
      toast.error('Failed to create post')
    }
  }, [queryClient])

  const sidebarData: SidebarData = useMemo(() => {
    // Sort feeds alphabetically by name
    const sortedFeeds = [...feeds].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    )

    // Build feed items - owned feeds get sub-items for New post and Settings
    const feedItems = sortedFeeds.map((feed) => {
      const id = feed.id.replace(/^feeds\//, '')
      const isCurrentFeed = !!(feedId && (feed.id === feedId || id === feedId))

      // Owned feeds: collapsible with New post and Settings sub-items
      if (feed.isOwner) {
        type SubItem = { title: string; icon: typeof Settings; url: string } | { title: string; icon: typeof SquarePen; onClick: () => void }
        const subItems: SubItem[] = [
          {
            title: 'New post',
            icon: SquarePen,
            onClick: () => openNewPostDialog(id),
          },
          {
            title: 'Settings',
            url: APP_ROUTES.FEEDS.SETTINGS(id),
            icon: Settings,
          },
        ]

        return {
          title: feed.name,
          url: APP_ROUTES.FEEDS.VIEW(id),
          icon: Rss,
          items: subItems,
          open: isCurrentFeed, // Only expand current feed (accordion behavior)
        }
      }

      // Non-owned feeds: collapsible with just Settings, only expand if current
      return {
        title: feed.name,
        url: APP_ROUTES.FEEDS.VIEW(id),
        icon: Rss,
        items: [
          {
            title: 'Settings',
            url: APP_ROUTES.FEEDS.SETTINGS(id),
            icon: Settings,
          },
        ],
        open: isCurrentFeed, // Only expand current feed (accordion behavior)
      }
    })

    // Build "All feeds" item with New post submenu if user has owned feeds
    // Only expand when actually on the home page (not on search/new)
    const isOnHome = pathname === '/' || pathname === ''
    const allFeedsItem = ownedFeeds.length > 0 ? {
      title: 'All feeds',
      url: APP_ROUTES.HOME,
      icon: Rss,
      items: [
        {
          title: 'New post',
          icon: SquarePen,
          onClick: () => openNewPostDialog(''),
        },
      ],
      open: !feedId && isOnHome,
    } : {
      title: 'All feeds',
      url: APP_ROUTES.HOME,
      icon: Rss,
    }

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
        items: [
          { title: 'Search', url: APP_ROUTES.SEARCH, icon: Search },
          { title: 'New feed', url: APP_ROUTES.NEW, icon: Plus },
        ],
      },
    ]

    return { navGroups: groups }
  }, [feeds, feedId, ownedFeeds, openNewPostDialog, pathname])

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
