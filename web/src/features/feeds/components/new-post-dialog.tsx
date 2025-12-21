import { useEffect, useState } from 'react'
import {
  Button,
  Input,
  Label,
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@mochi/common'
import type { FeedSummary } from '@/types'
import { FilePlus2, Send } from 'lucide-react'

type NewPostDialogProps = {
  feeds: FeedSummary[]
  onSubmit: (input: { feedId: string; body: string; files: File[] }) => void
  /** Controlled open state */
  open?: boolean
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void
  /** Hide the trigger button (use when controlled externally) */
  hideTrigger?: boolean
}

type NewPostFormState = {
  feedId: string
  body: string
  files: File[]
}

const MAX_FILE_SIZE = 1024 * 1024 * 1024 // 1GB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function NewPostDialog({ feeds, onSubmit, open, onOpenChange, hideTrigger }: NewPostDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)

  // Use controlled state if provided, otherwise use internal state
  const isOpen = open !== undefined ? open : internalOpen
  const setIsOpen = onOpenChange ?? setInternalOpen

  const [form, setForm] = useState<NewPostFormState>(() => ({
    feedId: feeds[0]?.id ?? '',
    body: '',
    files: [],
  }))

  useEffect(() => {
    if (feeds.length === 0) {
      setForm((prev) => ({ ...prev, feedId: '' }))
      return
    }

    const hasValidFeed = feeds.some((feed) => feed.id === form.feedId)
    if (!hasValidFeed) {
      setForm((prev) => ({ ...prev, feedId: feeds[0].id }))
    }
  }, [feeds, form.feedId])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.feedId || !form.body.trim()) return
    onSubmit(form)
    setForm((prev) => ({ ...prev, body: '', files: [] }))
    setIsOpen(false)
  }

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={setIsOpen}>
      {!hideTrigger && (
        <ResponsiveDialogTrigger asChild>
          <Button
            variant='outline'
            size='sm'
            className='shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-md'
          >
            <FilePlus2 className='size-4' />
            New post
          </Button>
        </ResponsiveDialogTrigger>
      )}
      <ResponsiveDialogContent className='sm:max-w-[640px]'>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>New post</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <form className='space-y-4' onSubmit={handleSubmit}>
          {feeds.length > 1 && (
            <div className='space-y-2'>
              <Label htmlFor='legacy-post-feed'>Feed</Label>
              <Select
                value={form.feedId}
                onValueChange={(value) => setForm((prev) => ({ ...prev, feedId: value }))}
              >
                <SelectTrigger id='legacy-post-feed' className='w-full justify-between'>
                  <SelectValue placeholder='Choose a feed' />
                </SelectTrigger>
                <SelectContent>
                  {feeds.map((feed) => (
                    <SelectItem key={feed.id} value={feed.id}>
                      {feed.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className='space-y-2'>
            <Label htmlFor='legacy-post-body'>Post content</Label>
            <Textarea
              id='legacy-post-body'
              rows={8}
              placeholder='Markdown is allowed'
              value={form.body}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, body: event.target.value }))
              }
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='legacy-post-file'>Attachments</Label>
            <Input
              id='legacy-post-file'
              type='file'
              multiple
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  files: event.target.files ? Array.from(event.target.files) : [],
                }))
              }
            />
            {form.files.length > 0 && (
              <div className='space-y-1 text-sm'>
                {form.files.map((file, i) => {
                  const tooLarge = file.size > MAX_FILE_SIZE
                  return (
                    <div key={i} className={`flex justify-between ${tooLarge ? 'text-red-600' : 'text-muted-foreground'}`}>
                      <span className='truncate'>{file.name}</span>
                      <span className='ml-2 shrink-0'>
                        {formatFileSize(file.size)}
                        {tooLarge && ' (too large)'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <ResponsiveDialogFooter className='gap-2'>
            <ResponsiveDialogClose asChild>
              <Button type='button' variant='outline'>
                Cancel
              </Button>
            </ResponsiveDialogClose>
            <Button type='submit' disabled={!form.feedId || !form.body.trim() || form.files.some(f => f.size > MAX_FILE_SIZE)}>
              <Send className='size-4' />
              Post
            </Button>
          </ResponsiveDialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
