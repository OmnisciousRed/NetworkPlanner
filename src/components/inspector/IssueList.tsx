import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import type { Id } from '@/models'
import type { Issue } from '@/utils/compatibility'
import { useUiStore } from '@/store/uiStore'
import { cn } from '@/lib/utils'

export const ISSUE_ICON = {
  error: CircleAlert,
  warning: TriangleAlert,
  info: Info,
  ok: CircleCheck,
}

export const ISSUE_COLOR = {
  error: 'text-destructive',
  warning: 'text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]',
  info: 'text-primary',
  ok: 'text-success',
}

export function IssueList({ issues, deviceId, dense }: { issues: Issue[]; deviceId: Id; dense?: boolean }) {
  const select = useUiStore((s) => s.select)
  return (
    <ul className={cn('space-y-1', dense && 'space-y-0.5')}>
      {issues.map((i) => {
        const Icon = ISSUE_ICON[i.level]
        const clickable = !!i.componentIds?.length || !!i.slot
        return (
          <li key={i.key}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => {
                if (i.componentIds?.length) select({ type: 'component', deviceId, ids: i.componentIds })
                else if (i.slot) select({ type: 'slot', deviceId, ownerId: i.slot.ownerId, slotId: i.slot.slotId })
              }}
              className={cn(
                'flex w-full items-start gap-2 rounded px-1.5 py-1 text-left text-xs leading-snug',
                clickable && 'cursor-pointer hover:bg-accent',
              )}
            >
              <Icon className={cn('mt-px size-3.5 shrink-0', ISSUE_COLOR[i.level])} />
              <span>{i.message}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
