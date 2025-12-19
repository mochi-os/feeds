import { useState } from 'react'
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
  Switch,
} from '@mochi/common'
import { Rss, Plus } from 'lucide-react'

type CreateFeedDialogProps = {
  onCreate: (params: { name: string; allowSearch: boolean }) => void
}

export function CreateFeedDialog({ onCreate }: CreateFeedDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [name, setName] = useState('')
  const [allowSearch, setAllowSearch] = useState(true)

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim()) return
    onCreate({ name: name.trim(), allowSearch })
    setName('')
    setAllowSearch(true)
    setIsOpen(false)
  }

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={setIsOpen}>
      <ResponsiveDialogTrigger asChild>
        <Button
          size='sm'
          className='shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-md'
        >
          <Rss className='size-4' />
          Create feed
        </Button>
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent className='sm:max-w-[480px]'>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className='flex items-center gap-2'>
            <Plus className='size-5' />
            Create a new feed
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <form className='space-y-4' onSubmit={handleSubmit}>
          <div className='space-y-2'>
            <Label htmlFor='feed-name'>Feed name</Label>
            <Input
              id='feed-name'
              placeholder='Enter a name for your feed'
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className='flex items-center justify-between rounded-lg border p-4'>
            <div className='space-y-0.5'>
              <Label htmlFor='feed-public'>Allow search</Label>
              <p className='text-sm text-muted-foreground'>
                Make this feed discoverable in search results
              </p>
            </div>
            <Switch
              id='feed-public'
              checked={allowSearch}
              onCheckedChange={setAllowSearch}
            />
          </div>
          <ResponsiveDialogFooter className='gap-2'>
            <ResponsiveDialogClose asChild>
              <Button type='button' variant='outline'>
                Cancel
              </Button>
            </ResponsiveDialogClose>
            <Button type='submit' disabled={!name.trim()}>
              <Rss className='size-4' />
              Create feed
            </Button>
          </ResponsiveDialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
