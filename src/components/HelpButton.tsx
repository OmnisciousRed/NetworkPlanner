import { CircleHelp } from 'lucide-react'
import { openHelp } from '@/store/navigation'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'

/** "?" button that opens the manual at the chapter for the current area */
export function HelpButton({ section, label = 'Hilfe zu diesem Bereich (F1)' }: { section: string; label?: string }) {
  return (
    <Tooltip content={label}>
      <Button size="icon-sm" variant="ghost" onClick={() => openHelp(section)} aria-label={label} data-testid={`help-${section}`}>
        <CircleHelp />
      </Button>
    </Tooltip>
  )
}

/** manual chapter for each area */
export const HELP_SECTION: Record<string, string> = {
  overview: 'uebersicht',
  hardware: 'hardware',
  rack: 'rack',
  network: 'netzwerk',
  ipam: 'ipam',
}
