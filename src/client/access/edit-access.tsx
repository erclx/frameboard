import { useEffect, useState } from 'react'
import { useStore } from 'zustand'

import { Button } from '@/client/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/client/components/ui/dialog'
import { BoardWriteError, writeBoard } from '@/client/live/write'

import { askToEdit, closeEditAccess, editAccessStore } from './edit-store'
import { useEditOffered } from './view-only'

export function EditAccessButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      aria-haspopup="dialog"
      className="text-foreground focus-visible:ring-ring motion-reduce:transition-none"
      onClick={askToEdit}
    >
      Edit this board
    </Button>
  )
}

export interface EditAccessProps {
  /** Sends the request, the API in the app. */
  send?: typeof fetch
  /** Loads the tab again, whose socket then says it writes. */
  reload?: () => void
}

/** Confirms that this tab should write, then reloads it as one that does. */
export function EditAccessDialog({
  send,
  reload = () => location.reload(),
}: EditAccessProps) {
  const offered = useEditOffered()
  const open = useStore(editAccessStore, (state) => state.open)
  const [asking, setAsking] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  // A dropped socket takes the dialog with it, so a reconnect never reopens it.
  useEffect(() => {
    if (!offered) closeEditAccess()
  }, [offered])

  const edit = async () => {
    setAsking(true)
    setRefusal(null)
    try {
      await writeBoard('/api/access/edit', {}, 'POST', send)
      reload()
    } catch (error) {
      setRefusal(
        error instanceof BoardWriteError
          ? error.message
          : 'The board did not answer.',
      )
    } finally {
      setAsking(false)
    }
  }

  return (
    <Dialog
      open={open && offered}
      onOpenChange={(next) => {
        if (next) return
        closeEditAccess()
        setRefusal(null)
      }}
    >
      <DialogContent showCloseButton={false} className="gap-3 p-4">
        <DialogTitle className="text-title font-semibold">
          Edit this board?
        </DialogTitle>
        <DialogDescription>
          This tab will be able to change the files in this board folder.
        </DialogDescription>
        {refusal === null ? null : (
          <p role="alert" className="text-sm text-destructive">
            {refusal} This tab stays view only. Run frameboard open to edit.
          </p>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            disabled={asking}
            focusableWhenDisabled
            onClick={() => void edit()}
          >
            Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
