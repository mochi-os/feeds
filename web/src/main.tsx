import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { MutationCache, QueryCache, QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import {
  CommandMenu,
  getAppPath,
  SearchProvider,
  ThemeProvider,
  useAuthStore,
  useDomainContextStore,
} from '@mochi/common'
import { sidebarData } from './components/layout/data/sidebar-data'
// Generated Routes
import { routeTree } from './routeTree.gen'
// Styles
import './styles/index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
  mutationCache: new MutationCache({
    onError: (error: any) => {
      // @ts-ignore - Check for axios error status without explicit dependency if possible, or add safely
      if (error?.response?.status >= 500) {
        router.navigate({ to: '/500' })
      }
    },
  }),
  queryCache: new QueryCache({
    onError: (error: any) => {
      // @ts-ignore
      if (error?.response?.status >= 500) {
        router.navigate({ to: '/500' })
      }
    },
  }),
})

const router = createRouter({
  routeTree,
  context: { queryClient },
  basepath: getAppPath() + '/',
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
})

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Initialize auth state from cookie on app start BEFORE router loads
// This ensures cookies are synced before any route guards run
useAuthStore.getState().initialize()

// Initialize domain context and render app
async function init() {
  // Fetch domain routing context (entity info for domain-routed requests)
  await useDomainContextStore.getState().initialize()

  // Render the app
  const rootElement = document.getElementById('root')!
  if (!rootElement.innerHTML) {
    const root = ReactDOM.createRoot(rootElement)
    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <SearchProvider>
              <RouterProvider router={router} />
              <CommandMenu sidebarData={sidebarData} />
            </SearchProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </StrictMode>
    )
  }
}

void init()
