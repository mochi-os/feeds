import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import {
  Button,
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
  Input,
  Switch,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  toast,
  getErrorMessage,
} from '@mochi/common'
import { Rss, Check, Plus, Loader2 } from 'lucide-react'
import feedsApi from '@/api/feeds'
import { useFeedsStore } from '@/stores/feeds-store'

// Characters disallowed in feed names (matches backend validation)
const DISALLOWED_NAME_CHARS = /[<>\r\n\\;"'`]/

const createFeedSchema = z.object({
  name: z
    .string()
    .min(1, 'Feed name is required')
    .max(1000, 'Name must be 1000 characters or less')
    .refine((val) => !DISALLOWED_NAME_CHARS.test(val), {
      message: 'Name cannot contain < > \\ ; " \' or ` characters',
    }),
  allowSearch: z.boolean(),
})

type CreateFeedFormValues = z.infer<typeof createFeedSchema>

type CreateFeedDialogProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  hideTrigger?: boolean
}

export function CreateFeedDialog({
  open,
  onOpenChange,
  hideTrigger,
}: CreateFeedDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isOpen = open ?? internalOpen
  const setIsOpen = onOpenChange ?? setInternalOpen
  const navigate = useNavigate()
  const refreshFeeds = useFeedsStore((state) => state.refresh)

  const form = useForm<CreateFeedFormValues>({
    resolver: zodResolver(createFeedSchema),
    defaultValues: {
      name: '',
      allowSearch: true,
    },
  })

  const onSubmit = async (values: CreateFeedFormValues) => {
    setIsSubmitting(true)
    try {
      const response = await feedsApi.create({
        name: values.name.trim(),
        privacy: values.allowSearch ? 'public' : 'private',
      })

      const fingerprint = response.data?.fingerprint
      // Refresh sidebar feeds list
      void refreshFeeds()
      form.reset()
      setIsOpen(false)
      
      if (fingerprint) {
        toast.success('Feed created')
        void navigate({ to: '/$feedId', params: { feedId: fingerprint } })
      } else {
        toast.success('Feed created')
        void navigate({ to: '/' })
      }
    } catch (error) {
      console.error('[CreateFeedDialog] Failed to create feed', error)
      toast.error(getErrorMessage(error, 'Failed to create feed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (!open) {
      form.reset()
      setIsSubmitting(false)
    }
  }

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={handleOpenChange}>
      {!hideTrigger && (
        <ResponsiveDialogTrigger asChild>
          <Button size='sm' className='text-sm'>
            <Plus className='size-4' />
            New feed
          </Button>
        </ResponsiveDialogTrigger>
      )}
      <ResponsiveDialogContent className='sm:max-w-[520px]'>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className='flex items-center gap-2'>
            <Rss className='size-5' />
            New feed
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Create a new feed to share your updates.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <Form {...form}>
          <form className='space-y-4' onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Feed name</FormLabel>
                  <FormControl>
                    <Input placeholder='Feed name' disabled={isSubmitting} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='allowSearch'
              render={({ field }) => (
                <FormItem className='flex items-center justify-between rounded-lg border px-4 py-3'>
                  <FormLabel className='text-sm font-medium'>
                    Allow anyone to search for feed
                  </FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <ResponsiveDialogFooter className='gap-2'>
              <ResponsiveDialogClose asChild>
                <Button type='button' variant='outline' disabled={isSubmitting}>
                  Cancel
                </Button>
              </ResponsiveDialogClose>
              <Button type='submit' disabled={!form.formState.isValid || isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className='size-4 animate-spin' />
                ) : (
                  <Check className='size-4' />
                )}
                {isSubmitting ? 'Creating...' : 'Create'}
              </Button>
            </ResponsiveDialogFooter>
          </form>
        </Form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
