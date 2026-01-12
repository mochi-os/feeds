import { ReactNode } from 'react'
import { Rss } from 'lucide-react'
import { useScreenSize } from '@mochi/common'

interface PageHeaderProps {
  icon?: ReactNode
  title: string
  actions?: ReactNode
  /** Optional search bar to show in full-width row above title on mobile */
  searchBar?: ReactNode
}

export function PageHeader({ icon, title, actions, searchBar }: PageHeaderProps) {
  const { isMobile } = useScreenSize()

  return (
    <header className='border-border bg-background sticky top-0 z-10 mb-6 border-b'>
      {/* Search bar on mobile - full width row */}
      {isMobile && searchBar && (
        <div className='border-b px-4 py-2'>
          {searchBar}
        </div>
      )}
      
      {/* Title and actions row */}
      <div className='flex items-center justify-between px-4 py-3 md:px-6 md:py-4'>
        <div className='flex items-center gap-2 md:gap-3'>
          {icon || <Rss className='size-4 md:size-5' />}
          <h1 className={isMobile ? 'text-base font-semibold' : 'text-lg font-semibold'}>
            {title}
          </h1>
        </div>
        {actions && <div className='flex items-center gap-2'>{actions}</div>}
      </div>
    </header>
  )
}
