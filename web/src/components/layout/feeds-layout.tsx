// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useEffect, useMemo } from 'react'
import { APP_ROUTES } from '@/config/routes'
import { useLingui } from '@lingui/react/macro'
import {
  AuthenticatedLayout,
  MapTilesProvider,
  type SidebarData,
  type NavItem,
  onShellMessage,
  naturalCompare,
} from '@mochi/web'
import { Bookmark, Plus, Rss, Search } from 'lucide-react'
import { useFeedsStore } from '@/stores/feeds-store'
import { loadSaved } from '@/lib/saved'
import { SidebarProvider, useSidebarContext } from '@/context/sidebar-context'
import { useCreatePost } from '@/hooks/use-create-post'
import { CreateFeedDialog } from '@/features/feeds/components/create-feed-dialog'
import { NewPostDialog } from '@/features/feeds/components/new-post-dialog'
import { FeedsCommandMenu } from './feeds-command-menu'

function FeedsLayoutInner() {
  const { t } = useLingui()
  const feeds = useFeedsStore((state) => state.feeds)
  const tiles = useFeedsStore((state) => state.tiles)
  const isLoading = useFeedsStore((state) => state.isLoading)
  const refresh = useFeedsStore((state) => state.refresh)
  const load = useFeedsStore((state) => state.load)
  const {
    newPostDialogOpen,
    newPostFeedId,
    closeNewPostDialog,
    createFeedDialogOpen,
    openCreateFeedDialog,
    closeCreateFeedDialog,
  } = useSidebarContext()

  useEffect(() => {
    // Load the feeds list for the sidebar, unless the route loader already
    // has; a load already under way is shared rather than repeated.
    if (!useFeedsStore.getState().loaded) void load()

    // Hydrate the saved-posts mirror so bookmarks reflect server state
    void loadSaved()

    // Refresh sidebar unread counts when tab regains focus
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)

    // Refresh sidebar when a notification arrives (broadcast from menu app).
    // A new one can come with a new post, which a list already on its way may
    // have missed, so that asks again after it. Notifications read or cleared
    // change nothing the list holds, so those only load a list not yet held,
    // sharing a load under way. Opening a feed clears its notifications, and
    // the service announces a clear whether or not it cleared anything.
    const unsubscribe = onShellMessage((msg) => {
      if (msg.type !== 'notification-update') return
      if (msg.event === 'new') void refresh()
      else if (!useFeedsStore.getState().loaded) void load()
    })

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      unsubscribe()
    }
  }, [refresh, load])

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
  const { submit: handleNewPost, progress: createProgress } = useCreatePost()

  const sidebarData: SidebarData = useMemo(() => {
    // Show full feed navigation regardless of context
    // Sort feeds alphabetically by name
    const sortedFeeds = [...feeds].sort((a, b) =>
      naturalCompare(a.name, b.name)
    )

    // Build feed items - use fingerprint for shorter URLs when available
    const feedItems = sortedFeeds.map((feed) => {
      const id = feed.fingerprint ?? feed.id.replace(/^feeds\//, '')

      return {
        id: feed.id,
        title: feed.name,
        url: APP_ROUTES.FEEDS.VIEW(id),
        icon: Rss,
        badge: feed.unreadPosts > 0 ? String(feed.unreadPosts) : undefined,
      }
    })

    const totalUnread = feeds.reduce((sum, f) => sum + f.unreadPosts, 0)
    const allFeedsLabel = t`All feeds`
    const allFeedsItem: NavItem = {
      id: 'all-feeds',
      title: allFeedsLabel,
      url: '/',
      icon: Rss,
      aggregate: true,
      badge: totalUnread > 0 ? String(totalUnread) : undefined,
    }

    // Build action items (moved to bottom)
    const actionItems: NavItem[] = [
      { title: t`Saved`, icon: Bookmark, url: '/saved' },
      { title: t`Find feeds`, icon: Search, url: '/find' },
      { title: t`Create feed`, icon: Plus, onClick: openCreateFeedDialog },
    ]

    const groups: SidebarData['navGroups'] = [
      {
        title: t`Feeds`,
        animateList: true,
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
    <MapTilesProvider tiles={tiles}>
      <AuthenticatedLayout
        sidebarData={sidebarData}
        isLoadingSidebar={isLoading && feeds.length === 0}
      />
      {/* Under the router, which the menu navigates with */}
      <FeedsCommandMenu />
      {/* NewPostDialog at layout level so it's always available */}
      {dialogFeeds.length > 0 && (
        <NewPostDialog
          feeds={dialogFeeds}
          onSubmit={handleNewPost}
          progress={createProgress}
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
    </MapTilesProvider>
  )
}

export function FeedsLayout() {
  return (
    <SidebarProvider>
      <FeedsLayoutInner />
    </SidebarProvider>
  )
}
