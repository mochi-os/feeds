import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'

type SubscriptionState = {
  isRemote: boolean
  isSubscribed: boolean
  canUnsubscribe: boolean
}

type SidebarContextValue = {
  feedId: string | null
  setFeedId: (id: string | null) => void
  newPostDialogOpen: boolean
  newPostFeedId: string | null
  openNewPostDialog: (feedId: string) => void
  closeNewPostDialog: () => void
  // Search dialog state
  searchDialogOpen: boolean
  openSearchDialog: () => void
  closeSearchDialog: () => void
  // Create feed dialog state
  createFeedDialogOpen: boolean
  openCreateFeedDialog: () => void
  closeCreateFeedDialog: () => void
  // Subscription state and handlers for current feed
  subscription: SubscriptionState | null
  setSubscription: (state: SubscriptionState | null) => void
  subscribeHandler: React.MutableRefObject<(() => void) | null>
  unsubscribeHandler: React.MutableRefObject<(() => void) | null>
  // Post refresh handler - called when a new post is created from the sidebar
  postRefreshHandler: React.MutableRefObject<((feedId: string) => void) | null>
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [feedId, setFeedId] = useState<string | null>(null)
  const [newPostDialogOpen, setNewPostDialogOpen] = useState(false)
  const [newPostFeedId, setNewPostFeedId] = useState<string | null>(null)
  const [searchDialogOpen, setSearchDialogOpen] = useState(false)
  const [createFeedDialogOpen, setCreateFeedDialogOpen] = useState(false)
  const [subscription, setSubscription] = useState<SubscriptionState | null>(
    null
  )
  const subscribeHandler = useRef<(() => void) | null>(null)
  const unsubscribeHandler = useRef<(() => void) | null>(null)
  const postRefreshHandler = useRef<((feedId: string) => void) | null>(null)

  const openNewPostDialog = useCallback((targetFeedId: string) => {
    setNewPostFeedId(targetFeedId)
    setNewPostDialogOpen(true)
  }, [])

  const closeNewPostDialog = useCallback(() => {
    setNewPostDialogOpen(false)
    setNewPostFeedId(null)
  }, [])

  const openSearchDialog = useCallback(() => {
    setSearchDialogOpen(true)
  }, [])

  const closeSearchDialog = useCallback(() => {
    setSearchDialogOpen(false)
  }, [])

  const openCreateFeedDialog = useCallback(() => {
    setCreateFeedDialogOpen(true)
  }, [])

  const closeCreateFeedDialog = useCallback(() => {
    setCreateFeedDialogOpen(false)
  }, [])

  return (
    <SidebarContext.Provider
      value={{
        feedId,
        setFeedId,
        newPostDialogOpen,
        newPostFeedId,
        openNewPostDialog,
        closeNewPostDialog,
        searchDialogOpen,
        openSearchDialog,
        closeSearchDialog,
        createFeedDialogOpen,
        openCreateFeedDialog,
        closeCreateFeedDialog,
        subscription,
        setSubscription,
        subscribeHandler,
        unsubscribeHandler,
        postRefreshHandler,
      }}
    >
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
