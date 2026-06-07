/* ============================================================
   SchoolMate — Tweaks panel (live theming via CSS variables)
   ============================================================ */
import { useState } from 'react'
import { useTheme, type Accent, type Density, type Corners, type Canvas } from '@/context/ThemeProvider'
import { Icon, Segmented } from '@/components/ui'

const ACCENTS: { key: Accent; color: string }[] = [
  { key: 'indigo', color: '#4f46e5' },
  { key: 'emerald', color: '#059669' },
  { key: 'azure', color: '#0284c7' },
  { key: 'plum', color: '#9333ea' },
  { key: 'sunset', color: '#ea580c' },
]

export function Tweaks() {
  const t = useTheme()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button className="sm-tweaks-fab" onClick={() => setOpen((o) => !o)} aria-label="Tweaks">
        <Icon name={open ? 'x' : 'sparkle'} size={20} />
      </button>
      {open && (
        <div className="sm-tweaks-panel">
          <div className="row ai-center jc-between" style={{ marginBottom: 14 }}>
            <span className="fw7 t-lg">Tweaks</span>
            <span className="t-xs muted3">Live theme</span>
          </div>

          <div className="sm-tweaks-row">
            <div className="lab">Mode</div>
            <Segmented value={t.theme} onChange={(v) => t.setTheme(v as 'light' | 'dark')}
              options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          </div>

          <div className="sm-tweaks-row">
            <div className="lab">Brand color</div>
            <div className="sm-swatch-row">
              {ACCENTS.map((a) => (
                <button key={a.key} className={['sm-swatch', t.accent === a.key && 'on'].filter(Boolean).join(' ')}
                  style={{ background: a.color }} onClick={() => t.setAccent(a.key)} aria-label={a.key} />
              ))}
            </div>
          </div>

          <div className="sm-tweaks-row">
            <div className="lab">Density</div>
            <Segmented value={t.density} onChange={(v) => t.setDensity(v as Density)}
              options={[{ value: 'compact', label: 'Compact' }, { value: 'regular', label: 'Regular' }, { value: 'comfy', label: 'Comfy' }]} />
          </div>

          <div className="sm-tweaks-row">
            <div className="lab">Corners</div>
            <Segmented value={t.corners} onChange={(v) => t.setCorners(v as Corners)}
              options={[{ value: 'sharp', label: 'Sharp' }, { value: 'rounded', label: 'Rounded' }, { value: 'pillowy', label: 'Soft' }]} />
          </div>

          <div className="sm-tweaks-row" style={{ marginBottom: 0 }}>
            <div className="lab">Canvas</div>
            <Segmented value={t.canvas} onChange={(v) => t.setCanvas(v as Canvas)}
              options={[{ value: 'cool', label: 'Cool' }, { value: 'warm', label: 'Warm' }, { value: 'paper', label: 'Paper' }]} />
          </div>
        </div>
      )}
    </>
  )
}
