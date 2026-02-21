import { Sparkles, X } from 'lucide-react'
import type { Tag } from '@/types'

interface PostTagsProps {
  tags: Tag[]
  canManage?: boolean
  onRemove?: (tagId: string) => void
  onFilter?: (label: string) => void
}

export function PostTags({ tags, canManage, onRemove, onFilter }: PostTagsProps) {
  if (!tags.length) return null

  return (
    <div className='flex flex-wrap gap-1.5'>
      {tags.map((tag) => {
        const isAi = tag.source === 'ai'
        return (
          <span
            key={tag.id}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              isAi
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                : 'bg-muted text-foreground'
            }`}
          >
            {isAi && <Sparkles className='size-3' />}
            <button
              type='button'
              className='hover:underline'
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onFilter?.(tag.label)
              }}
            >
              {tag.label}
              {isAi && tag.relevance != null && (
                <span className='ml-1 opacity-60'>{tag.relevance}</span>
              )}
            </button>
            {canManage && onRemove && (
              <button
                type='button'
                className='text-muted-foreground hover:text-foreground -mr-0.5 rounded-full p-0.5 transition-colors'
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onRemove(tag.id)
                }}
              >
                <X className='size-3' />
              </button>
            )}
          </span>
        )
      })}
    </div>
  )
}
