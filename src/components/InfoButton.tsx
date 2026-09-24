import { Info } from 'lucide-react'
import type { ComponentKind, DeviceKind } from '@/models'
import { COMPONENT_EXPLANATIONS, DEVICE_EXPLANATIONS, type Explanation } from '@/data/explanations'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export function explanationFor(kind: { component?: ComponentKind; device?: DeviceKind }): Explanation | undefined {
  if (kind.component) return COMPONENT_EXPLANATIONS[kind.component]
  if (kind.device) return DEVICE_EXPLANATIONS[kind.device]
  return undefined
}

export function ExplanationBody({ e }: { e: Explanation }) {
  return (
    <div className="space-y-2.5 text-[13px] leading-relaxed">
      <div>
        <div className="mb-0.5 text-xs font-semibold text-primary">ⓘ Was ist das?</div>
        <p>{e.what}</p>
      </div>
      <div>
        <div className="mb-0.5 text-xs font-semibold text-primary">Warum brauche ich das?</div>
        <p>{e.why}</p>
      </div>
      <div>
        <div className="mb-0.5 text-xs font-semibold text-primary">Womit kann ich es verbinden?</div>
        <p>{e.connects}</p>
      </div>
      <div>
        <div className="mb-0.5 text-xs font-semibold text-primary">Was muss ich beachten?</div>
        <p>{e.notes}</p>
      </div>
    </div>
  )
}

export function InfoButton({
  component,
  device,
  className,
  label,
}: {
  component?: ComponentKind
  device?: DeviceKind
  className?: string
  label?: boolean
}) {
  const e = explanationFor({ component, device })
  if (!e) return null
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex cursor-pointer items-center gap-1 rounded-md text-xs text-muted-foreground hover:text-primary',
            className,
          )}
          onClick={(ev) => ev.stopPropagation()}
          onPointerDown={(ev) => ev.stopPropagation()}
          aria-label={`Was ist ${e.title}?`}
        >
          <Info className="size-3.5" />
          {label && 'Was ist das?'}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96" side="right" align="start">
        <div className="mb-2 text-sm font-semibold">{e.title}</div>
        <ExplanationBody e={e} />
      </PopoverContent>
    </Popover>
  )
}
