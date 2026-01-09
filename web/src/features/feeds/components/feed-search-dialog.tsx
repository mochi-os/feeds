import { Button, Input, Card, CardContent } from '@mochi/common'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from '@mochi/common'
import { Loader2, Plus, Rss, Search } from 'lucide-react'

interface FeedSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  search: string
  onSearchChange: (search: string) => void
  searchResults: any[]
  isSearching: boolean
  onSubscribe: (feedId: string) => void
}

export function FeedSearchDialog({
  open,
  onOpenChange,
  search,
  onSearchChange,
  searchResults,
  isSearching,
  onSubscribe,
}: FeedSearchDialogProps) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className='flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-[700px]'>
        <ResponsiveDialogHeader className='border-b px-6 pt-6 pb-4'>
          <ResponsiveDialogTitle className='text-2xl font-semibold'>
            Search Feeds
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className='text-muted-foreground mt-1 text-sm'>
            Search for feeds in the directory
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className='flex-1 overflow-y-auto p-6'>
          <Input
            type='text'
            placeholder='Type to search feeds...'
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className='mb-4'
            autoFocus
          />

          {isSearching && (
            <div className='flex items-center justify-center py-12'>
              <Loader2 className='text-muted-foreground size-6 animate-spin' />
            </div>
          )}

          {!isSearching && search && (
            <div className='space-y-3'>
              {searchResults.length === 0 ? (
                <div className='py-12 text-center'>
                  <Rss className='text-muted-foreground mx-auto mb-4 size-12' />
                  <h3 className='text-lg font-semibold'>No feeds found</h3>
                  <p className='text-muted-foreground mt-1 text-sm'>
                    Try adjusting your search
                  </p>
                </div>
              ) : (
                searchResults.map((feed: any) => (
                  <Card
                    key={feed.id}
                    className='hover:bg-accent/50 transition-colors'
                  >
                    <CardContent className='flex items-center justify-between p-4'>
                      <div className='min-w-0 flex-1'>
                        <h4 className='truncate font-semibold'>{feed.name}</h4>
                        <p className='text-muted-foreground text-sm'>
                          {feed.fingerprint_hyphens}
                        </p>
                      </div>
                      <Button
                        size='sm'
                        onClick={() => onSubscribe(feed.id)}
                        className='ml-4'
                      >
                        <Plus className='mr-2 size-4' />
                        Subscribe
                      </Button>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {!search && !isSearching && (
            <div className='py-12 text-center'>
              <Search className='text-muted-foreground mx-auto mb-4 size-12' />
              <h3 className='text-lg font-semibold'>Start typing to search</h3>
              <p className='text-muted-foreground mt-1 text-sm'>
                Find and subscribe to feeds in the directory
              </p>
            </div>
          )}
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
