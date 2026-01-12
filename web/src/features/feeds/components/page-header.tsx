import { ReactNode } from 'react'
import { Rss } from 'lucide-react'

interface PageHeaderProps {
  icon?: ReactNode
  title: string
  actions?: ReactNode
}

export function PageHeader({ icon, title, actions }: PageHeaderProps) {
  return (
    <header className='border-border bg-background sticky top-0 z-10 mb-6 flex items-center justify-between border-b px-6 py-4'>
      <div className='flex items-center gap-3'>
        {icon || <Rss className='size-5' />}
        <h1 className='text-lg font-semibold'>{title}</h1>
      </div>
      {actions && <div className='flex items-center gap-2'>{actions}</div>}
    </header>
  )
}
