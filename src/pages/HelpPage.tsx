import { useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import { ArrowLeft, BookOpen, Download, Search, X } from 'lucide-react'
import manual from '../../docs/HANDBUCH.md?raw'
import { useUiStore } from '@/store/uiStore'
import { closeHelp } from '@/store/navigation'
import { showExport } from '@/components/layout/ExportDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const shots = import.meta.glob('../../docs/screenshots/*.{png,jpg,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

interface Heading {
  id: string
  text: string
  level: 2 | 3
}

interface Section {
  id: string
  title: string
  html: string
  plain: string
  headings: Heading[]
}

const BACK_LABEL: Record<string, string> = {
  overview: 'Zurück zur Übersicht',
  hardware: 'Zurück zum Hardware Builder',
  rack: 'Zurück zum Rack Builder',
  network: 'Zurück zum Netzwerk-Designer',
  ipam: 'Zurück zu VLAN & IP',
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** splits the manual into h2 sections; headings may carry an explicit id: `## Titel {#id}` */
function parseManual(md: string): { title: string; sections: Section[] } {
  const lines = md.split('\n')
  let title = 'Handbuch'
  const sections: { id: string; title: string; lines: string[]; headings: Heading[] }[] = [{ id: 'einleitung', title: 'Einleitung', lines: [], headings: [] }]
  let fence = false
  for (const line of lines) {
    if (line.startsWith('```')) fence = !fence
    const m = !fence && /^(#{1,3}) (.+?)(?:\s*\{#([\w-]+)\})?\s*$/.exec(line)
    if (!m) {
      sections[sections.length - 1].lines.push(line)
      continue
    }
    const level = m[1].length
    const text = m[2]
    if (level === 1) {
      title = text
      continue
    }
    const id = m[3] ?? slugify(text)
    if (level === 2) sections.push({ id, title: text, lines: [], headings: [] })
    const sec = sections[sections.length - 1]
    sec.headings.push({ id, text, level: level as 2 | 3 })
    sec.lines.push(`<h${level} id="${id}">${escapeHtml(text)}</h${level}>`, '')
  }
  return {
    title,
    sections: sections
      .filter((s) => s.lines.join('').trim())
      .map((s) => {
        const md = s.lines.join('\n')
        let html = marked.parse(md, { async: false, gfm: true }) as string
        html = html.replace(/<img src="(?:\.\/)?screenshots\/([^"]+)"/g, (_, name: string) => {
          const url = shots[`../../docs/screenshots/${name}`]
          return url ? `<img src="${url}"` : '<img hidden src=""'
        })
        html = html.replace(/<a href="(https?:[^"]+)"/g, '<a target="_blank" rel="noreferrer" href="$1"')
        const plain = md
          .replace(/<[^>]+>/g, ' ')
          .replace(/[*_`#>|]/g, ' ')
          .replace(/\s+/g, ' ')
        return { id: s.id, title: s.title, html, plain: `${s.title} ${plain}`.toLowerCase(), headings: s.headings }
      }),
  }
}

function highlight(root: HTMLElement, query: string) {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!words.length) return
  const re = new RegExp(`(${words.join('|')})`, 'gi')
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  for (const n of nodes) {
    if (!n.data.match(re)) continue
    const frag = document.createDocumentFragment()
    let last = 0
    n.data.replace(re, (m: string, _g: string, idx: number) => {
      frag.append(n.data.slice(last, idx))
      const mark = document.createElement('mark')
      mark.textContent = m
      frag.append(mark)
      last = idx + m.length
      return m
    })
    frag.append(n.data.slice(last))
    n.parentNode?.replaceChild(frag, n)
  }
}

export function HelpPage() {
  const { title, sections } = useMemo(() => parseManual(manual), [])
  const helpSection = useUiStore((s) => s.helpSection)
  const prevView = useUiStore((s) => s.prevView)
  const [q, setQ] = useState('')
  const [active, setActive] = useState<string>(sections[0]?.id ?? '')
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const query = q.trim().toLowerCase()
  const visible = useMemo(() => {
    if (!query) return sections
    const words = query.split(/\s+/)
    return sections.filter((s) => words.every((w) => s.plain.includes(w)))
  }, [sections, query])

  const scrollTo = (id: string) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
    if (!el || !scrollRef.current) return false
    scrollRef.current.scrollTo({ top: el.offsetTop - 12, behavior: 'smooth' })
    setActive(id)
    return true
  }

  // jump to the requested section (from a "?" button)
  useEffect(() => {
    if (!helpSection) return
    setQ('')
    const t = requestAnimationFrame(() => {
      const el = scrollRef.current?.querySelector<HTMLElement>(`#${CSS.escape(helpSection.id)}`)
      if (el && scrollRef.current) scrollRef.current.scrollTop = el.offsetTop - 12
      setActive(helpSection.id)
    })
    return () => cancelAnimationFrame(t)
  }, [helpSection])

  useEffect(() => {
    if (contentRef.current && query) highlight(contentRef.current, query)
    if (query && scrollRef.current) scrollRef.current.scrollTop = 0
  }, [query, visible])

  // scroll spy for the table of contents
  const onScroll = () => {
    const root = scrollRef.current
    if (!root) return
    const hs = root.querySelectorAll<HTMLElement>('h2[id], h3[id]')
    let current = hs[0]?.id
    for (const h of hs) {
      if (h.offsetTop - root.scrollTop <= 40) current = h.id
      else break
    }
    if (current) setActive(current)
  }

  // in-page links such as [Glossar](#glossar)
  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a')
    const href = a?.getAttribute('href')
    if (!href?.startsWith('#')) return
    e.preventDefault()
    const id = href.slice(1)
    if (!scrollTo(id)) {
      setQ('')
      requestAnimationFrame(() => scrollTo(id))
    }
  }

  const activeSection = sections.find((s) => s.headings.some((h) => h.id === active))?.id

  return (
    <div className="flex min-h-0 min-w-0 flex-1 bg-background" data-testid="help-page">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex items-center gap-2 border-b px-3 py-3">
          <BookOpen className="size-4 text-primary" />
          <span className="font-semibold">Inhalt</span>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto p-2 text-sm scroll-thin" aria-label="Inhaltsverzeichnis">
          {sections.map((s) => (
            <div key={s.id}>
              <button
                type="button"
                onClick={() => {
                  if (!scrollTo(s.id)) {
                    setQ('')
                    requestAnimationFrame(() => scrollTo(s.id))
                  }
                }}
                className={cn(
                  'block w-full cursor-pointer truncate rounded-md px-2 py-1 text-left hover:bg-accent',
                  activeSection === s.id && 'bg-primary/10 font-medium text-primary',
                  query && !visible.includes(s) && 'opacity-40',
                )}
              >
                {s.title}
              </button>
              {activeSection === s.id &&
                s.headings
                  .filter((h) => h.level === 3)
                  .map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => scrollTo(h.id)}
                      className={cn('block w-full cursor-pointer truncate rounded-md py-0.5 pl-5 pr-2 text-left text-xs text-muted-foreground hover:bg-accent', active === h.id && 'text-primary')}
                    >
                      {h.text}
                    </button>
                  ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2">
          <Button size="sm" variant="ghost" onClick={closeHelp} data-testid="help-back">
            <ArrowLeft /> {(prevView && BACK_LABEL[prevView]) ?? 'Zurück'}
          </Button>
          <div className="relative ml-auto w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Im Handbuch suchen …" className="h-8 pl-8 pr-8" data-testid="help-search" />
            {q && (
              <button type="button" onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground" aria-label="Suche löschen">
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => showExport({ title: 'Handbuch (Markdown)', filename: 'NetworkPlanner-Handbuch.md', text: manual, mime: 'text/markdown', description: 'Das komplette Handbuch als Textdatei.' })}
          >
            <Download /> Als Datei
          </Button>
        </div>
        <div ref={scrollRef} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto scroll-thin">
          <div className="mx-auto max-w-3xl px-5 pb-24 pt-6">
            {!query && <h1 className="mb-2 text-2xl font-bold tracking-tight">{title}</h1>}
            {query && (
              <div className="mb-4 text-sm text-muted-foreground">
                {visible.length ? `${visible.length} ${visible.length === 1 ? 'Kapitel enthält' : 'Kapitel enthalten'} „${q.trim()}“` : `Nichts gefunden für „${q.trim()}“.`}
              </div>
            )}
            <div ref={contentRef} key={query} className="manual" onClick={onClick}>
              {visible.map((s) => (
                <section key={s.id} dangerouslySetInnerHTML={{ __html: s.html }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
