import { createFileRoute } from '@tanstack/react-router'
import { AuthenticatedLayout } from '@mochi/common'
import { useAuthStore, getCookie } from '@mochi/common'
import { sidebarData } from '@/components/layout/data/sidebar-data'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ location }) => {
    const store = useAuthStore.getState()

    if (!store.isInitialized) {
      store.syncFromCookie()
    }

    const token = getCookie('token') || store.token

    if (!token) {
      const returnUrl = encodeURIComponent(location.href)
      const redirectUrl = `${import.meta.env.VITE_AUTH_LOGIN_URL}?redirect=${returnUrl}`

      window.location.href = redirectUrl

      return
    }

    return
  },
  component: () => <AuthenticatedLayout title="Feeds" sidebarData={sidebarData} />,
})
