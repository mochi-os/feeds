import { APP_ROUTES } from '@/config/routes'
import type { SidebarData } from '@mochi/common'
import { Home, Library, Plus, Search } from 'lucide-react'

// Static sidebar data used for CommandMenu
export const sidebarData: SidebarData = {
  navGroups: [
    {
      title: 'Browse',
      items: [
        { title: 'Home', url: APP_ROUTES.HOME, icon: Home },
        { title: 'Browse feeds', url: APP_ROUTES.FEEDS.LIST, icon: Library },
        { title: 'Search', url: APP_ROUTES.SEARCH, icon: Search },
      ],
    },
    {
      title: 'Create',
      items: [{ title: 'New feed', url: APP_ROUTES.NEW, icon: Plus }],
    },
  ],
}
