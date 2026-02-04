import { FormEvent, useRef } from 'react'
import { Button, Input } from '@mochi/common'
import { Paperclip, Send, X } from 'lucide-react'

type FeedComposerProps = {
  body: string
  onBodyChange: (value: string) => void
  files: File[]
  onFilesChange: (files: File[]) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function FeedComposer({
  body,
  onBodyChange,
  files,
  onFilesChange,
  onSubmit,
}: FeedComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files
    if (selectedFiles && selectedFiles.length > 0) {
      onFilesChange([...files, ...Array.from(selectedFiles)])
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleRemoveFile = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index))
  }

  return (
    <form onSubmit={onSubmit} className='space-y-2'>
      <div className='flex gap-2'>
        <Input
          placeholder='Write a post...'
          value={body}
          onChange={(event) => onBodyChange(event.target.value)}
          className='flex-1'
        />
        <Button
          type='button'
          size='icon'
          className='shrink-0'
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className='size-4' />
        </Button>
        <Button type='submit' size='icon' className='shrink-0' disabled={!body.trim() && files.length === 0}>
          <Send className='size-4' />
        </Button>
      </div>
      {files.length > 0 && (
        <div className='flex flex-wrap gap-1'>
          {files.map((file, index) => (
            <div
              key={index}
              className='flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs'
            >
              <span className='max-w-32 truncate'>{file.name}</span>
              <button
                type='button'
                onClick={() => handleRemoveFile(index)}
                className='text-muted-foreground hover:text-foreground'
              >
                <X className='size-3' />
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        ref={fileInputRef}
        type='file'
        multiple
        onChange={handleFileSelect}
        className='hidden'
        accept='image/*,.pdf,.doc,.docx,.txt,.md'
      />
    </form>
  )
}
