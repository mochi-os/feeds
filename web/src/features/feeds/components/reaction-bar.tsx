import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@mochi/common'
import { SmilePlus } from 'lucide-react'
import type { ReactionCounts, ReactionId } from '@/types'
import { reactionOptions } from '../constants'

type ReactionBarProps = {
  counts: ReactionCounts
  activeReaction?: ReactionId | null
  onSelect: (reaction: ReactionId) => void
}

export function ReactionBar({ counts, activeReaction, onSelect }: ReactionBarProps) {
  const [open, setOpen] = useState(false)

  // Reactions with counts > 0
  const reactionsWithCounts = reactionOptions.filter((r) => (counts[r.id] ?? 0) > 0)

  const handleSelect = (id: ReactionId) => {
    onSelect(id)
    setOpen(false)
  }

  const activeEmoji = activeReaction
    ? reactionOptions.find((r) => r.id === activeReaction)?.emoji
    : null

  return (
    <div className='flex items-center gap-3 text-sm text-muted-foreground'>
      {/* Show existing reactions */}
      {reactionsWithCounts.length > 0 && (
        <span>
          {reactionsWithCounts.map((r) => `${r.emoji}${counts[r.id]}`).join(' ')}
        </span>
      )}

      {/* Show user's reaction */}
      {activeEmoji && (
        <span>You: {activeEmoji}</span>
      )}

      {/* Add/change reaction */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type='button'
            className='inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors'
          >
            <SmilePlus className='size-4' />
            {activeReaction ? 'Change' : 'React'}
          </button>
        </PopoverTrigger>
        <PopoverContent className='w-auto p-2' align='start'>
          <div className='flex gap-1'>
            {reactionOptions.map((reaction) => (
              <button
                key={reaction.id}
                type='button'
                className={`rounded p-1.5 text-lg transition-colors hover:bg-muted ${
                  activeReaction === reaction.id ? 'bg-muted ring-2 ring-primary' : ''
                }`}
                aria-label={reaction.label}
                onClick={() => handleSelect(reaction.id)}
              >
                {reaction.emoji}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
