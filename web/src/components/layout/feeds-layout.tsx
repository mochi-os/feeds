import { useEffect, useMemo } from 'react'
import { AuthenticatedLayout } from '@mochi/common'
import type { SidebarData } from '@mochi/common'
import { Plus, Search, Rss } from 'lucide-react'
import { useFeedsStore } from '@/stores/feeds-store'
import { APP_ROUTES } from '@/config/routes'

export function FeedsLayout() {
  const feeds = useFeedsStore((state) => state.feeds)
  const refresh = useFeedsStore((state) => state.refresh)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const sidebarData: SidebarData = useMemo(() => {
    // Sort feeds alphabetically by name
    const sortedFeeds = [...feeds].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    )

    const feedItems = sortedFeeds.map((feed) => ({
      title: feed.name,
      // Ensure feed.id doesn't have feeds/ prefix
      url: APP_ROUTES.FEEDS.VIEW(feed.id.replace(/^feeds\//, '')),
      icon: Rss,
    }))

    return {
      navGroups: [
        {
          title: '',
          items: [
            { title: 'Feeds', url: APP_ROUTES.HOME, icon: Rss },
            { title: 'Search', url: APP_ROUTES.SEARCH, icon: Search },
            { title: 'New feed', url: APP_ROUTES.NEW, icon: Plus },
          ],
        },
        ...(feedItems.length > 0
          ? [
              {
                title: '',
                items: feedItems,
              },
            ]
          : []),
      ],
    }
  }, [feeds])

  return <AuthenticatedLayout title="Feeds" sidebarData={sidebarData} />
}
