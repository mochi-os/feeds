import { createFileRoute } from '@tanstack/react-router'
import { useAuthStore, getCookie, AuthenticatedLayout } from '@mochi/common'

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
  component: () => <AuthenticatedLayout title="Feeds" />,
})

