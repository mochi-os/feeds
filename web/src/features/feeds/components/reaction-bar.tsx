import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger, Tooltip, TooltipContent, TooltipTrigger } from '@mochi/common'
import { SmilePlus } from 'lucide-react'
import type { ReactionCounts, ReactionId } from '@/types'
import { reactionOptions } from '../constants'

type ReactionBarProps = {
  counts: ReactionCounts
  activeReaction?: ReactionId | null
  onSelect: (reaction: ReactionId | '') => void
  showCounts?: boolean
  showButton?: boolean
  variant?: 'ghost' | 'secondary'
}

// Helper to check if there are any reactions to display
export function hasReactions(counts: ReactionCounts, activeReaction?: ReactionId | null): boolean {
  const hasActiveCounts = reactionOptions.some((r) => (counts[r.id] ?? 0) > 0)
  return hasActiveCounts || !!activeReaction
}

export function ReactionBar({ counts, activeReaction, onSelect, showCounts = true, showButton = true, variant = 'ghost' }: ReactionBarProps) {
  const [open, setOpen] = useState(false)

  // Reactions with counts > 0, or the user's reaction even if count is 0
  const visibleReactions = reactionOptions.filter(
    (r) => (counts[r.id] ?? 0) > 0 || r.id === activeReaction
  )

  const handlePickerSelect = (id: ReactionId) => {
    // From picker: if already selected, remove it; otherwise select it
    const newReaction = activeReaction === id ? '' : id
    onSelect(newReaction)
    setOpen(false)
  }

  const buttonClass = variant === 'secondary'
    ? 'react-btn text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors'
    : 'react-btn inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground active:bg-interactive-active'

  return (
    <div className='flex items-center gap-1'>
      {/* Reaction summary pills - display only, not clickable */}
      {showCounts && visibleReactions
        .filter((r) => (counts[r.id] ?? 0) > 0 || r.id === activeReaction)
        .map((r) => {
          const baseCount = counts[r.id] ?? 0
          const isYours = r.id === activeReaction
          // If it's user's reaction and count is 0, show 1 (their reaction)
          const count = isYours && baseCount === 0 ? 1 : baseCount
          return (
            <Tooltip key={r.id} delayDuration={300}>
              <TooltipTrigger asChild>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                    isYours
                      ? 'bg-foreground/10 text-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <span>{r.emoji}</span>
                  <span className='font-medium'>{count}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent side='bottom' className='text-xs'>
                {r.label}{isYours ? ' (includes you)' : ''}
              </TooltipContent>
            </Tooltip>
          )
        })}

      {/* Add/change reaction button - shows user's reaction if they have one */}
      {showButton && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type='button'
              className={buttonClass}
            >
              <SmilePlus className='size-3' />
            </button>
          </PopoverTrigger>
          <PopoverContent className='w-auto p-2' align='start'>
            <div className='flex gap-1'>
              {reactionOptions.map((reaction) => (
                <Tooltip key={reaction.id} delayDuration={300}>
                  <TooltipTrigger asChild>
                    <button
                      type='button'
                      className={`rounded p-1.5 text-lg transition-colors hover:bg-interactive-hover active:bg-interactive-active ${
                        activeReaction === reaction.id ? 'bg-foreground/10 ring-1 ring-foreground/20' : ''
                      }`}
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => handlePickerSelect(reaction.id)}
                    >
                      {reaction.emoji}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side='bottom' className='text-xs'>
                    {activeReaction === reaction.id ? `Remove ${reaction.label.toLowerCase()}` : reaction.label}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
