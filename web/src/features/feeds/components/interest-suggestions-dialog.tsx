import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  toast,
  getErrorMessage,
} from '@mochi/common'
import { feedsApi } from '@/api/feeds'

interface Suggestion {
  qid: string
  label: string
  count: number
}

interface InterestSuggestionsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  feedId: string
  feedName: string
  suggestions: Suggestion[]
}

export function InterestSuggestionsDialog({
  open,
  onOpenChange,
  feedId,
  feedName,
  suggestions,
}: InterestSuggestionsDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(suggestions.map((s) => s.qid)))
  const [isSaving, setIsSaving] = useState(false)

  const toggle = (qid: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(qid)) next.delete(qid)
      else next.add(qid)
      return next
    })
  }

  const handleSave = async () => {
    if (selected.size === 0) {
      onOpenChange(false)
      return
    }
    setIsSaving(true)
    try {
      const qids = Array.from(selected)
      for (const qid of qids) {
        await feedsApi.adjustTagInterest(feedId, qid, 'up')
      }
      toast.success(`Added ${qids.length} interest${qids.length === 1 ? '' : 's'}`)
      onOpenChange(false)
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to add interests'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Add interests from {feedName}?</AlertDialogTitle>
        </AlertDialogHeader>
        <div className='space-y-2 py-2'>
          <p className='text-muted-foreground text-sm'>This feed covers these topics. Select which ones to add to your interests for personalised ranking.</p>
          <div className='max-h-60 space-y-1 overflow-y-auto'>
            {suggestions.map((s) => (
              <label key={s.qid} className='flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent'>
                <input
                  type='checkbox'
                  checked={selected.has(s.qid)}
                  onChange={() => toggle(s.qid)}
                  className='rounded'
                />
                <span className='text-sm'>{s.label}</span>
                <span className='text-muted-foreground ml-auto text-xs'>{s.count} posts</span>
              </label>
            ))}
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Skip</AlertDialogCancel>
          <AlertDialogAction onClick={handleSave} disabled={isSaving || selected.size === 0}>
            {isSaving ? 'Adding...' : `Add ${selected.size} interest${selected.size === 1 ? '' : 's'}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
