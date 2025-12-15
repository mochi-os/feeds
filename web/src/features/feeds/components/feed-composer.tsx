import { FormEvent } from 'react'
import { Send } from 'lucide-react'
import { Button, Card, CardContent, Input, Label, Textarea } from '@mochi/common'

type FeedComposerProps = {
  title: string
  body: string
  onTitleChange: (value: string) => void
  onBodyChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function FeedComposer({
  title,
  body,
  onTitleChange,
  onBodyChange,
  onSubmit,
}: FeedComposerProps) {
  return (
    <Card className='shadow-md transition-shadow duration-300 hover:shadow-lg'>
      <CardContent className='space-y-4 p-6'>
        <form className='space-y-4' onSubmit={onSubmit}>
          <div className='space-y-2'>
            <Label htmlFor='post-title' className='text-sm font-medium'>Title</Label>
            <Input
              id='post-title'
              placeholder='Share a milestone or question'
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              className='transition-all duration-300 focus:shadow-sm'
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='post-body' className='text-sm font-medium'>Post</Label>
            <Textarea
              id='post-body'
              rows={4}
              placeholder='Write an update for this feed'
              value={body}
              onChange={(event) => onBodyChange(event.target.value)}
              className='transition-all duration-300 focus:shadow-sm'
            />
          </div>
          <div className='flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground'>
            <span>Everyone subscribed will receive this update.</span>
            <Button 
              type='submit' 
              size='sm' 
              disabled={!body.trim()}
              className='transition-all duration-300 hover:scale-105 disabled:hover:scale-100'
            >
              <Send className='size-4' />
              Publish update
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
