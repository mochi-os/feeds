import { Home, Plus } from 'lucide-react'
import type { SidebarData } from '@mochi/common'
import { APP_ROUTES } from '@/config/routes'

// Static sidebar data for CommandMenu (Cmd+K)
// The full dynamic sidebar is built in FeedsLayout
export const sidebarData: SidebarData = {
  navGroups: [
    {
      title: 'All feeds',
      items: [
        { title: 'Home', url: APP_ROUTES.HOME, icon: Home },
        { title: 'New feed', url: APP_ROUTES.NEW, icon: Plus },
      ],
    },
  ],
}
