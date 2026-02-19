import { useState, useRef, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { toast, getErrorMessage } from '@mochi/common'
import { feedsApi } from '@/api/feeds'

interface TagInputProps {
  feedId: string
  postId: string
  existingLabels: string[]
  onAdded: (tag: { id: string; label: string }) => void
}

const TAG_PATTERN = /^[a-z0-9 /\-]+$/

export function TagInput({ feedId, postId, existingLabels, onAdded }: TagInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [value, setValue] = useState('')
  const [suggestions, setSuggestions] = useState<{ label: string; count: number }[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      feedsApi.getFeedTags(feedId).then(setSuggestions).catch(() => {})
      inputRef.current?.focus()
    }
  }, [isOpen, feedId])

  const filtered = suggestions.filter(
    (s) =>
      s.label.includes(value.toLowerCase().trim()) &&
      !existingLabels.includes(s.label)
  )

  const submit = async (label: string) => {
    const cleaned = label.trim().toLowerCase()
    if (!cleaned || cleaned.length > 50 || !TAG_PATTERN.test(cleaned)) {
      toast.error('Invalid tag: letters, numbers, spaces, hyphens, and slashes only (max 50 chars)')
      return
    }
    if (existingLabels.includes(cleaned)) {
      setValue('')
      setShowSuggestions(false)
      return
    }
    try {
      const tag = await feedsApi.addPostTag(feedId, postId, cleaned)
      onAdded(tag)
      setValue('')
      setShowSuggestions(false)
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to add tag'))
    }
  }

  if (!isOpen) {
    return (
      <button
        type='button'
        className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs transition-colors'
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsOpen(true)
        }}
      >
        <Plus className='size-3' />
        Tag
      </button>
    )
  }

  return (
    <div className='relative inline-block' onClick={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        type='text'
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setShowSuggestions(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submit(value)
          }
          if (e.key === 'Escape') {
            setIsOpen(false)
            setValue('')
          }
        }}
        onBlur={() => {
          // Delay to allow click on suggestion
          setTimeout(() => {
            setIsOpen(false)
            setValue('')
          }, 200)
        }}
        className='h-6 w-32 rounded-full border px-2.5 text-xs outline-none'
        placeholder='Add tag...'
      />
      {showSuggestions && filtered.length > 0 && (
        <div className='bg-popover absolute top-full left-0 z-10 mt-1 w-48 rounded-[10px] border py-1 shadow-md'>
          {filtered.slice(0, 8).map((s) => (
            <button
              key={s.label}
              type='button'
              className='hover:bg-muted flex w-full items-center justify-between px-3 py-1.5 text-xs'
              onMouseDown={(e) => {
                e.preventDefault()
                submit(s.label)
              }}
            >
              <span>{s.label}</span>
              <span className='text-muted-foreground'>{s.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
