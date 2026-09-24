import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

export function Section({
  title,
  icon,
  children,
  defaultOpen = true,
  actions,
  className,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  actions?: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={cn('border-b', className)}>
      <div className="flex items-center gap-1 px-3 py-2">
        <button
          type="button"
          className="flex flex-1 cursor-pointer items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronDown className={cn('size-3.5 transition-transform', !open && '-rotate-90')} />
          {icon}
          {title}
        </button>
        {actions}
      </div>
      {open && <div className="space-y-2.5 px-3 pb-3">{children}</div>}
    </section>
  )
}

export function Field({ label, children, hint, className }: { label: string; children: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('grid gap-1', className)}>
      <Label>{label}</Label>
      {children}
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  )
}

export function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-2', className)}>{children}</div>
}

export function TextField({
  value,
  onChange,
  placeholder,
  className,
  invalid,
  ...rest
}: {
  value: string | undefined
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  invalid?: boolean
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <Input
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  )
}

export function TextAreaField({ value, onChange, placeholder, rows = 3 }: { value?: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return <Textarea value={value ?? ''} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
}

export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  className,
  placeholder,
}: {
  value: number | undefined
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  className?: string
  placeholder?: string
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  useEffect(() => {
    setText((t) => (Number(t) === value ? t : value === undefined ? '' : String(value)))
  }, [value])
  return (
    <div className={cn('relative', className)}>
      <Input
        type="number"
        inputMode="decimal"
        value={text}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        className={unit ? 'pr-9' : undefined}
        onChange={(e) => {
          setText(e.target.value)
          const n = Number(e.target.value)
          if (e.target.value !== '' && Number.isFinite(n)) {
            const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
            onChange(clamped)
          }
        }}
      />
      {unit && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>}
    </div>
  )
}

export function SelectField<T extends string | number>({
  value,
  options,
  onChange,
  className,
}: {
  value: T | undefined
  options: { value: T; label: string }[] | readonly T[]
  onChange: (v: T) => void
  className?: string
}) {
  const opts = (options as readonly unknown[]).map((o) =>
    typeof o === 'object' && o !== null ? (o as { value: T; label: string }) : { value: o as T, label: String(o) },
  )
  return (
    <NativeSelect
      value={value === undefined ? '' : String(value)}
      className={className}
      onChange={(e) => {
        const raw = e.target.value
        const match = opts.find((o) => String(o.value) === raw)
        if (match) onChange(match.value)
      }}
    >
      {value === undefined && <option value="">–</option>}
      {opts.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </NativeSelect>
  )
}

export function SwitchField({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 text-sm">
      <span>
        {label}
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}

export function KV({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 text-sm', className)}>
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-medium">{children}</span>
    </div>
  )
}
