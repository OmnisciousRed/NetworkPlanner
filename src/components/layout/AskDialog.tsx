import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * In-app replacements for window.prompt / window.confirm: they look like the
 * rest of the app and also work where the browser blocks native popups
 * (e.g. when the app is embedded).
 */

export interface AskField {
  key: string
  label: string
  value?: string
  placeholder?: string
  hint?: string
  /** returns an error message or null */
  validate?: (v: string) => string | null
}

interface AskRequest {
  title: string
  description?: string
  fields: AskField[]
  confirmLabel: string
  destructive?: boolean
  resolve: (values: Record<string, string> | null) => void
}

const useAsk = create<{ req: AskRequest | null }>(() => ({ req: null }))

export function ask(opts: Omit<AskRequest, 'resolve' | 'confirmLabel' | 'fields'> & { fields?: AskField[]; confirmLabel?: string }) {
  return new Promise<Record<string, string> | null>((resolve) => {
    useAsk.getState().req?.resolve(null)
    useAsk.setState({ req: { fields: [], confirmLabel: 'OK', ...opts, resolve } })
  })
}

export async function askText(title: string, label: string, value = '', opts: Partial<AskField> & { description?: string; confirmLabel?: string } = {}) {
  const { description, confirmLabel, ...field } = opts
  const r = await ask({ title, description, confirmLabel, fields: [{ key: 'v', label, value, ...field }] })
  return r ? r.v : null
}

export async function askConfirm(title: string, description?: string, opts: { confirmLabel?: string; destructive?: boolean } = {}) {
  return (await ask({ title, description, ...opts })) !== null
}

export function AskDialog() {
  const req = useAsk((s) => s.req)
  const [values, setValues] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState(false)
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!req) return
    setValues(Object.fromEntries(req.fields.map((f) => [f.key, f.value ?? ''])))
    setTouched(false)
  }, [req])

  const close = (result: Record<string, string> | null) => {
    req?.resolve(result)
    useAsk.setState({ req: null })
  }
  const errors = Object.fromEntries((req?.fields ?? []).map((f) => [f.key, f.validate?.(values[f.key] ?? '') ?? null]))
  const hasError = Object.values(errors).some(Boolean)
  const submit = () => {
    setTouched(true)
    if (hasError) return
    close(values)
  }

  return (
    <Dialog open={!!req} onOpenChange={(o) => !o && close(null)}>
      <DialogContent
        onOpenAutoFocus={(e) => {
          if (firstRef.current) {
            e.preventDefault()
            firstRef.current.focus()
            firstRef.current.select()
          }
        }}
        data-testid="ask-dialog"
      >
        {req && (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <DialogHeader>
              <DialogTitle>{req.title}</DialogTitle>
              {req.description && <DialogDescription>{req.description}</DialogDescription>}
            </DialogHeader>
            {req.fields.map((f, i) => (
              <label key={f.key} className="grid gap-1 text-sm">
                <span className="text-xs font-medium text-muted-foreground">{f.label}</span>
                <Input
                  ref={i === 0 ? firstRef : undefined}
                  value={values[f.key] ?? ''}
                  placeholder={f.placeholder}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  aria-invalid={touched && !!errors[f.key]}
                  data-testid={`ask-${f.key}`}
                />
                {touched && errors[f.key] ? (
                  <span className="text-[11px] text-destructive">{errors[f.key]}</span>
                ) : (
                  f.hint && <span className="text-[11px] text-muted-foreground">{f.hint}</span>
                )}
              </label>
            ))}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(null)}>
                Abbrechen
              </Button>
              <Button type="submit" variant={req.destructive ? 'destructive' : 'default'} data-testid="ask-ok">
                {req.confirmLabel}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
