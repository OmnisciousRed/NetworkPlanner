import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { dismissToast, useUiStore } from '@/store/uiStore'
import { cn } from '@/lib/utils'

const ICONS = { info: Info, success: CircleCheck, warning: TriangleAlert, error: CircleAlert }
const COLORS = {
  info: 'text-primary',
  success: 'text-success',
  warning: 'text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]',
  error: 'text-destructive',
}

export function Toaster() {
  const toasts = useUiStore((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-4 right-[356px] z-[70] flex flex-col items-end gap-2" data-testid="toaster">
      {toasts.map((t) => {
        const Icon = ICONS[t.level]
        return (
          <div key={t.id} className="pointer-events-auto flex max-w-xl items-center gap-2.5 rounded-lg border bg-popover px-3 py-2 text-sm shadow-xl" role="status">
            <Icon className={cn('size-4 shrink-0', COLORS[t.level])} />
            <span className="min-w-0">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="ml-1 shrink-0 cursor-pointer rounded px-2 py-0.5 text-xs font-semibold text-primary hover:bg-accent"
                onClick={() => {
                  t.action!.run()
                  dismissToast(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" className="cursor-pointer text-muted-foreground hover:text-foreground" onClick={() => dismissToast(t.id)}>
              <X className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
