import { X } from 'lucide-react'
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
    <div className='flex flex-wrap gap-x-2 gap-y-1'>
      {tags.map((tag) => (
        <span key={tag.id} className='inline-flex items-center text-muted-foreground text-xs'>
          <button
            type='button'
            className='hover:underline'
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onFilter?.(tag.label)
            }}
          >
            #{tag.label}
          </button>
          {canManage && onRemove && (
            <button
              type='button'
              className='text-muted-foreground/60 hover:text-foreground ml-0.5 transition-colors'
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
      ))}
    </div>
  )
}
