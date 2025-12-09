import { FormEvent } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type FeedComposerProps = {
  body: string
  onBodyChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function FeedComposer({
  body,
  onBodyChange,
  onSubmit,
}: FeedComposerProps) {
  return (
    <Card className='shadow-md transition-shadow duration-300 hover:shadow-lg'>
      <CardContent className='space-y-4 p-6'>
        <form className='space-y-4' onSubmit={onSubmit}>
          <div className='space-y-2'>
            <Label htmlFor='post-body' className='text-sm font-medium'>Post</Label>
            <Textarea
              id='post-body'
              rows={4}
              placeholder='Share an update, milestone, or question with your subscribers'
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
