import { Button, Input, ScrollArea } from '@mochi/common'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from '@mochi/common'
import { Loader2, Rss, Search } from 'lucide-react'

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
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      shouldCloseOnInteractOutside={false}
    >
      <ResponsiveDialogContent className='flex max-h-[85vh] flex-col gap-0 overflow-hidden border-none p-0 shadow-2xl sm:max-w-[600px]'>
        <ResponsiveDialogHeader className='bg-muted/30 border-b px-4 py-4'>
          <ResponsiveDialogTitle className='text-xl font-semibold tracking-tight'>
            Search Feeds
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className='text-xs'>
            Search for feeds in the directory
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className='bg-background border-b p-4'>
          <div className='relative'>
            <Search className='text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2' />
            <Input
              type='text'
              placeholder='Type to search feeds...'
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className='bg-muted/50 focus:bg-background focus:border-input border-transparent pl-9 transition-all'
              autoFocus
            />
          </div>
        </div>

        <ScrollArea className='bg-muted/10 h-[400px] flex-1 overflow-y-scroll'>
          {isSearching && (
            <div className='flex flex-col items-center justify-center gap-2 py-12'>
              <Loader2 className='text-primary size-8 animate-spin' />
              <p className='text-muted-foreground text-sm'>Searching...</p>
            </div>
          )}

          {!isSearching && search && (
            <div className='space-y-1 p-2'>
              {searchResults.length === 0 ? (
                <div className='py-12 text-center'>
                  <div className='bg-muted/50 mx-auto mb-3 w-fit rounded-full p-4'>
                    <Rss className='text-muted-foreground size-8' />
                  </div>
                  <h3 className='text-sm font-semibold'>No feeds found</h3>
                  <p className='text-muted-foreground mt-1 text-xs'>
                    Try adjusting your search details
                  </p>
                </div>
              ) : (
                searchResults.map((feed: any) => (
                  <div
                    key={feed.id}
                    className='group hover:bg-background hover:border-border flex items-center justify-between rounded-lg border border-transparent p-3 transition-all duration-200 hover:shadow-sm'
                  >
                    <div className='flex items-center gap-3 overflow-hidden'>
                      <div className='flex size-10 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-600'>
                        <Rss className='size-5' />
                      </div>
                      <div className='min-w-0 flex-1'>
                        <h4 className='mb-1 truncate text-sm leading-none font-medium'>
                          {feed.name}
                        </h4>
                        {feed.fingerprint && (
                          <p className='text-muted-foreground truncate font-mono text-xs opacity-80'>
                            {feed.fingerprint.match(/.{1,3}/g)?.join('-')}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      size='sm'
                      onClick={() => onSubscribe(feed.id)}
                      className='h-8 rounded-full px-4 opacity-0 transition-opacity group-hover:opacity-100'
                      variant='secondary'
                    >
                      Subscribe
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}

          {!search && !isSearching && (
            <div className='text-muted-foreground flex h-full flex-col items-center justify-center py-12 text-center'>
              <Search className='mb-3 size-12 opacity-20' />
              <p className='text-sm font-medium'>Start typing to search</p>
              <p className='text-xs opacity-70'>
                Find and subscribe to amazing feeds
              </p>
            </div>
          )}
        </ScrollArea>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
