import { Home } from 'lucide-react'
import type { SidebarData } from '@mochi/web'
import { useLingui } from '@lingui/react/macro'
import { APP_ROUTES } from '@/config/routes'

// Static sidebar data for CommandMenu (Cmd+K)
// The full dynamic sidebar is built in FeedsLayout
export function useSidebarData(): SidebarData {
  const { t } = useLingui()
  return {
    navGroups: [
      {
        title: t`All feeds`,
        items: [
          { title: t`Home`, url: APP_ROUTES.HOME, icon: Home },
        ],
      },
    ],
  }
}
