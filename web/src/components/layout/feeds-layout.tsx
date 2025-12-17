import { useEffect, useMemo } from 'react'
import { AuthenticatedLayout } from '@mochi/common'
import type { SidebarData } from '@mochi/common'
import { Home, Library, Plus, Search, Rss } from 'lucide-react'
import { useFeedsStore } from '@/stores/feeds-store'
import { APP_ROUTES } from '@/config/routes'

export function FeedsLayout() {
  const feeds = useFeedsStore((state) => state.feeds)
  const refresh = useFeedsStore((state) => state.refresh)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const sidebarData: SidebarData = useMemo(() => {
    const feedItems = feeds.map((feed) => ({
      title: feed.name,
      // Ensure feed.id doesn't have feeds/ prefix
      url: APP_ROUTES.FEEDS.VIEW(feed.id.replace(/^feeds\//, '')),
      icon: Rss,
    }))

    return {
      navGroups: [
        {
          title: 'Browse',
          items: [
            { title: 'Home', url: APP_ROUTES.HOME, icon: Home },
            { title: 'Browse feeds', url: APP_ROUTES.FEEDS.LIST, icon: Library },
            { title: 'Search', url: APP_ROUTES.SEARCH, icon: Search },
          ],
        },
        ...(feedItems.length > 0
          ? [
              {
                title: 'Feeds',
                items: feedItems,
              },
            ]
          : []),
        {
          title: 'Create',
          items: [{ title: 'New feed', url: APP_ROUTES.NEW, icon: Plus }],
        },
      ],
    }
  }, [feeds])

  return <AuthenticatedLayout title="Feeds" sidebarData={sidebarData} />
}
