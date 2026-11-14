import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/client/components/ui/dropdown-menu'
import { toast } from '@/client/components/ui/toast'
import { useLive } from '@/client/live/store'
import { type Structure, structure } from '@/client/live/structure'
import type { ProjectRecord } from '@/shared/records/list'

import { MENU_ROW } from '../chrome/menu'

interface RulesOffProps {
  project: Pick<ProjectRecord, 'name' | 'checksOff'>
  /** The board's structure writes, `structure` outside a test. */
  calls?: Pick<Structure, 'setProjectRule'>
}

/**
 * The project menu's Rules turned off submenu: each rule `checks.off` lists,
 * as the file writes it, with a press turning it back on, after which the
 * server's recheck brings its findings back. A view-only tab lists the rules
 * and presses none, and a project with none off disables the trigger, as
 * Switch project is with one project.
 */
export function RulesOff({ project, calls = structure }: RulesOffProps) {
  const canWrite = useLive((state) => state.canWrite)
  const turnOn = async (rule: string) => {
    try {
      await calls.setProjectRule(project.name, rule, false)
      toast.add({
        title: `Turned on ${rule} in ${project.name}`,
        description: 'Undo turns it off again',
      })
    } catch (error) {
      toast.add({
        title: `Could not turn on ${rule}`,
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
      })
    }
  }
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        disabled={project.checksOff.length === 0}
        className={`${MENU_ROW} data-disabled:opacity-50`}
      >
        Rules turned off
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56 rounded-[10px] p-1 text-xs shadow-[0_12px_40px_rgba(0,0,0,.3)] ring-border">
        {project.checksOff.map((rule) => (
          <DropdownMenuItem
            key={rule}
            disabled={!canWrite}
            // The visible text leads the name, and the rule tells rows apart.
            aria-label={canWrite ? `${rule}, Turn on` : rule}
            title={rule}
            onClick={() => void turnOn(rule)}
            className={MENU_ROW}
          >
            <span className="min-w-0 truncate">{rule}</span>
            {canWrite ? (
              <span className="ml-auto shrink-0 pl-2 text-muted-foreground">
                Turn on
              </span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
