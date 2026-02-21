import { Minus, Plus, X } from 'lucide-react'
import type { Tag } from '@/types'

interface PostTagsProps {
  tags: Tag[]
  onRemove?: (tagId: string) => void
  onFilter?: (label: string) => void
}

export function PostTags({ tags, onRemove, onFilter }: PostTagsProps) {
  if (!tags.length) return null

  return (
    <div className='flex flex-wrap gap-x-2 gap-y-1'>
      {tags.map((tag) => (
        <span
          key={tag.id}
          className='group/tag inline-flex items-center text-muted-foreground text-xs'
        >
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
          <button
            type='button'
            className='text-muted-foreground/60 hover:text-foreground ml-0.5 hidden group-hover/tag:inline-flex transition-colors'
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
          >
            <Plus className='size-4' />
          </button>
          <button
            type='button'
            className='text-muted-foreground/60 hover:text-foreground hidden group-hover/tag:inline-flex transition-colors'
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
          >
            <Minus className='size-4' />
          </button>
          <button
            type='button'
            className='text-muted-foreground/60 hover:text-foreground hidden group-hover/tag:inline-flex transition-colors'
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onRemove?.(tag.id)
            }}
          >
            <X className='size-4' />
          </button>
        </span>
      ))}
    </div>
  )
}
