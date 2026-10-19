import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  type LucideIcon,
} from 'lucide-react'

import { type Action, isEnabled, useActions } from '@/client/actions/registry'

import { ActionTooltip } from '../chrome/action-tooltip'

/** The Arrange buttons in three groups, as the reference draws them. */
const GROUPS: readonly (readonly { id: string; icon: LucideIcon }[])[] = [
  [
    { id: 'arrange.alignLeft', icon: AlignStartVertical },
    { id: 'arrange.alignCenter', icon: AlignCenterVertical },
    { id: 'arrange.alignRight', icon: AlignEndVertical },
  ],
  [
    { id: 'arrange.alignTop', icon: AlignStartHorizontal },
    { id: 'arrange.alignMiddle', icon: AlignCenterHorizontal },
    { id: 'arrange.alignBottom', icon: AlignEndHorizontal },
  ],
  [
    {
      id: 'arrange.distributeHorizontal',
      icon: AlignHorizontalDistributeCenter,
    },
    { id: 'arrange.distributeVertical', icon: AlignVerticalDistributeCenter },
  ],
]

const IDS = GROUPS.flat().map(({ id }) => id)

/**
 * Align and distribute for several selected frames, each button running its
 * registered action and naming it and its key on hover. Distribute stays
 * disabled until a third frame is selected.
 */
export function ArrangeSection() {
  const actions = useActions(IDS)
  const byId = new Map(
    actions.flatMap((action) => (action ? [[action.id, action] as const] : [])),
  )
  return (
    <section
      aria-labelledby="inspector-arrange"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <h2 id="inspector-arrange" className="mb-2 text-xs font-semibold">
        Arrange
      </h2>
      <div className="flex flex-wrap gap-1.5">
        {GROUPS.map((group) => (
          <div
            key={group[0]?.id}
            role="group"
            className="flex gap-0.5 rounded-md bg-input p-0.5"
          >
            {group.map(({ id, icon }) => (
              <ArrangeButton key={id} action={byId.get(id)} icon={icon} />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

function ArrangeButton({
  action,
  icon: Icon,
}: {
  action: Action | undefined
  icon: LucideIcon
}) {
  if (!action) return null
  return (
    <ActionTooltip label={action.label} keys={action.keys} side="bottom">
      <button
        type="button"
        aria-label={action.label}
        disabled={!isEnabled(action)}
        onClick={action.run}
        className="grid h-[22px] w-7 place-items-center rounded-[5px] text-muted-foreground outline-none hover:bg-sidebar hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 active:bg-sidebar disabled:pointer-events-none disabled:opacity-40"
      >
        <Icon aria-hidden className="size-[13px]" strokeWidth={1.6} />
      </button>
    </ActionTooltip>
  )
}
