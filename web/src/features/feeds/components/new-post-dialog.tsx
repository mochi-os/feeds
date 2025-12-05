import { useEffect, useState } from 'react'
import { FilePlus2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from '@/components/ui/responsive-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { type FeedSummary } from '../types'

type NewPostDialogProps = {
  feeds: FeedSummary[]
  onSubmit: (input: { feedId: string; body: string; attachment: File | null }) => void
}

type NewPostFormState = {
  feedId: string
  body: string
  attachment: File | null
}

export function NewPostDialog({ feeds, onSubmit }: NewPostDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [form, setForm] = useState<NewPostFormState>(() => ({
    feedId: feeds[0]?.id ?? '',
    body: '',
    attachment: null,
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
    setForm((prev) => ({ ...prev, body: '', attachment: null }))
    setIsOpen(false)
  }

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={setIsOpen}>
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
      <ResponsiveDialogContent className='sm:max-w-[640px]'>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>New post</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <form className='space-y-4' onSubmit={handleSubmit}>
          <div className='space-y-2'>
            <Label htmlFor='legacy-post-feed'>Select feed</Label>
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
          <div className='space-y-2'>
            <Label htmlFor='legacy-post-body'>Enter post, markdown is allowed</Label>
            <Textarea
              id='legacy-post-body'
              rows={8}
              placeholder='Enter post, markdown is allowed'
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
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  attachment: event.target.files?.[0] ?? null,
                }))
              }
            />
          </div>
          <ResponsiveDialogFooter className='gap-2'>
            <ResponsiveDialogClose asChild>
              <Button type='button' variant='outline'>
                Cancel
              </Button>
            </ResponsiveDialogClose>
            <Button type='submit' disabled={!form.feedId || !form.body.trim()}>
              <Send className='size-4' />
              Post
            </Button>
          </ResponsiveDialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
