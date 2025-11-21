import { useState } from 'react'
import { Plus, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from '@/components/ui/responsive-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

type CreateFeedDialogProps = {
  onCreate: (input: { name: string; allowSearch: boolean }) => void
}

type CreateFeedFormState = {
  name: string
  allowSearch: boolean
}

export function CreateFeedDialog({ onCreate }: CreateFeedDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [form, setForm] = useState<CreateFeedFormState>({
    name: '',
    allowSearch: true,
  })

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.name.trim()) return
    onCreate(form)
    setForm({ name: '', allowSearch: true })
    setIsOpen(false)
  }

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={setIsOpen}>
      <ResponsiveDialogTrigger asChild>
        <Button
          size='sm'
          className='shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-md'
        >
          <Plus className='size-4' />
          Create feed
        </Button>
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent className='sm:max-w-[520px]'>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Create a new feed</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Curate updates for a team, project, or initiative.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <form className='space-y-4' onSubmit={handleSubmit}>
          <div className='space-y-2'>
            <Label htmlFor='feed-name'>Name</Label>
            <Input
              id='feed-name'
              placeholder='Weekly delivery review'
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
            />
          </div>
          <div className='flex items-center justify-between rounded-lg border px-4 py-3'>
            <div className='space-y-1'>
              <Label htmlFor='feed-allow-search' className='text-sm font-medium'>
                Allow anyone to search for feed
              </Label>
              <p className='text-xs text-muted-foreground'>
                Keep the feed discoverable across workspaces.
              </p>
            </div>
            <Switch
              id='feed-allow-search'
              checked={form.allowSearch}
              onCheckedChange={(checked) =>
                setForm((prev) => ({ ...prev, allowSearch: checked }))
              }
            />
          </div>
          <ResponsiveDialogFooter className='gap-2'>
            <ResponsiveDialogClose asChild>
              <Button type='button' variant='outline'>
                <X className='size-4' />
                Cancel
              </Button>
            </ResponsiveDialogClose>
            <Button type='submit' disabled={!form.name.trim()}>
              <Check className='size-4' />
              Create feed
            </Button>
          </ResponsiveDialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
