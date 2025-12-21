import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

type SidebarContextValue = {
  feedId: string | null
  setFeedId: (id: string | null) => void
  newPostDialogOpen: boolean
  newPostFeedId: string | null
  openNewPostDialog: (feedId: string) => void
  closeNewPostDialog: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [feedId, setFeedId] = useState<string | null>(null)
  const [newPostDialogOpen, setNewPostDialogOpen] = useState(false)
  const [newPostFeedId, setNewPostFeedId] = useState<string | null>(null)

  const openNewPostDialog = useCallback((targetFeedId: string) => {
    setNewPostFeedId(targetFeedId)
    setNewPostDialogOpen(true)
  }, [])

  const closeNewPostDialog = useCallback(() => {
    setNewPostDialogOpen(false)
    setNewPostFeedId(null)
  }, [])

  return (
    <SidebarContext.Provider value={{
      feedId,
      setFeedId,
      newPostDialogOpen,
      newPostFeedId,
      openNewPostDialog,
      closeNewPostDialog,
    }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebarContext() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebarContext must be used within a SidebarProvider')
  }
  return context
}
