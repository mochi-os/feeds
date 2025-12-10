import { Outlet } from '@tanstack/react-router'

import { LayoutProvider } from '@/context/layout-provider'
import { SearchProvider } from '@/context/search-provider'

import { TopBar } from '@/components/layout/top-bar'

type AuthenticatedLayoutProps = {
  children?: React.ReactNode
}

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  

  return (
    <SearchProvider>
      <LayoutProvider>
        <div className="flex h-svh flex-col">
          <TopBar />
          {/* Sidebar removed for full width layout */}
          <main className="flex-1 overflow-auto">
            {children ?? <Outlet />}
          </main>
        </div>
      </LayoutProvider>
    </SearchProvider>
  )
}
