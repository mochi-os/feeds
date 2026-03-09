import { createFileRoute } from '@tanstack/react-router'
import { useAuthStore, isInShell } from '@mochi/common'
import { FeedsLayout } from '@/components/layout/feeds-layout'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    const store = useAuthStore.getState()

    if (!store.isInitialized) {
      if (isInShell()) {
        await store.initializeFromShell()
      } else {
        store.initialize()
      }
    }
  },
  component: FeedsLayout,
})
