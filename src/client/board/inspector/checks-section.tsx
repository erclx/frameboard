import { useLive } from '@/client/live/store'

import { FindingsList } from '../findings-list'

/**
 * The selected frame's check findings, the same list its badge opens, drawn
 * only while it has any, since the label shows no badge otherwise either.
 */
export function ChecksSection({ frame }: { frame: string }) {
  const findings = useLive((state) => state.findings[frame])
  if (!findings || findings.length === 0) return null
  return (
    <section
      aria-labelledby="inspector-checks"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-2"
    >
      <h2 id="inspector-checks" className="mb-1 text-xs font-semibold">
        Checks · {findings.length}
      </h2>
      <div className="-mx-1.5">
        <FindingsList findings={findings} />
      </div>
    </section>
  )
}
