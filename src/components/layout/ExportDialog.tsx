import { useRef, useState } from 'react'
import { ClipboardCopy, Download, FileUp, Upload } from 'lucide-react'
import { create } from 'zustand'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { importProjectJson } from '@/store/actions/project'
import { toast } from '@/store/uiStore'
import { downloadText } from '@/utils/importExport'

interface ExportRequest {
  title: string
  description?: string
  filename: string
  text: string
  mime: string
  /** prepend a UTF-8 byte order mark to the downloaded file (Excel needs it for umlauts) */
  bom?: boolean
}

const useExport = create<{ req: ExportRequest | null; importOpen: boolean }>(() => ({ req: null, importOpen: false }))

/** shows a file's content with "download" and "copy" – copying also works where downloads are blocked */
export function showExport(req: ExportRequest) {
  useExport.setState({ req })
}

export function showImport() {
  useExport.setState({ importOpen: true })
}

async function copyText(text: string, fallback: HTMLTextAreaElement | null) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    if (!fallback) return false
    fallback.focus()
    fallback.select()
    try {
      return document.execCommand('copy')
    } catch {
      return false
    }
  }
}

export function ExportDialog() {
  const req = useExport((s) => s.req)
  const ref = useRef<HTMLTextAreaElement>(null)
  const downloadRef = useRef<HTMLButtonElement>(null)
  const close = () => useExport.setState({ req: null })
  return (
    <Dialog open={!!req} onOpenChange={(o) => !o && close()}>
      <DialogContent
        wide
        data-testid="export-dialog"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          downloadRef.current?.focus()
        }}
      >
        {req && (
          <>
            <DialogHeader>
              <DialogTitle>{req.title}</DialogTitle>
              <DialogDescription>
                {req.description ?? 'Datei herunterladen oder den Inhalt kopieren und z. B. in einen Texteditor einfügen.'} Dateiname: <code className="text-xs">{req.filename}</code>
              </DialogDescription>
            </DialogHeader>
            <Textarea ref={ref} readOnly value={req.text} className="h-72 font-mono text-[11px]" data-testid="export-text" />
            <DialogFooter>
              <Button
                variant="outline"
                onClick={async () => {
                  const ok = await copyText(req.text, ref.current)
                  toast(ok ? 'In die Zwischenablage kopiert' : 'Kopieren nicht möglich – Text markieren und mit Strg+C kopieren', ok ? 'success' : 'warning')
                }}
                data-testid="export-copy"
              >
                <ClipboardCopy /> Kopieren
              </Button>
              <Button
                ref={downloadRef}
                onClick={() => {
                  try {
                    downloadText(req.filename, (req.bom ? '\uFEFF' : '') + req.text, req.mime)
                  } catch {
                    toast('Download nicht möglich – bitte „Kopieren“ verwenden', 'warning')
                  }
                }}
                data-testid="export-download"
              >
                <Download /> Herunterladen
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function ImportDialog() {
  const open = useExport((s) => s.importOpen)
  const [text, setText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const close = () => {
    useExport.setState({ importOpen: false })
    setText('')
  }
  const run = async (json: string) => {
    if (await importProjectJson(json)) close()
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent data-testid="import-dialog">
        <DialogHeader>
          <DialogTitle>Projekt importieren</DialogTitle>
          <DialogDescription>Eine exportierte <code className="text-xs">.networkplanner.json</code>-Datei wählen oder ihren Inhalt unten einfügen. Das Projekt wird als neues Projekt geöffnet – das aktuelle bleibt gespeichert.</DialogDescription>
        </DialogHeader>
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          <FileUp /> Datei auswählen …
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) await run(await f.text())
          }}
        />
        <div className="text-center text-xs text-muted-foreground">oder</div>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder='{"version": …} – JSON hier einfügen' className="h-40 font-mono text-[11px]" data-testid="import-text" />
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Abbrechen
          </Button>
          <Button disabled={!text.trim()} onClick={() => run(text)} data-testid="import-run">
            <Upload /> Importieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
