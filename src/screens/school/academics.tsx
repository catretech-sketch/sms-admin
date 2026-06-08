/* ============================================================
   SchoolMate — Academics hub
   Tabs: Classes & sections · Timetable builder · Periods ·
   Subjects · Homework. Frontend-only, mock data, fully
   interactive (click-to-place timetable, auto-generate, etc).
   ============================================================ */
import { Fragment, useMemo, useState } from 'react'
import { useApp, useToast } from '@/lib/hooks'
import { can } from '@/lib/gating'
import {
  PageHead, Tabs, Card, CardHead, Btn, Badge, Select, Field, Input,
  Modal, Icon, Empty, DataTable, type Column, type BadgeTone,
} from '@/components/ui'
import { teachers, subjects, grades, sections } from '@/data/mockDb'
import type { Teacher } from '@/types'
import { cellKey, clashingClass, pickTeacher, conflictsFor, type Cell, type Grid } from '@/lib/timetable'

/* ---------- shared helpers / constants ---------- */
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const PERIODS = 8                 // teaching periods per day (P1..P8)
const LUNCH_AFTER = 4             // lunch break shown after period 4
const TOTAL_SLOTS = PERIODS * DAYS.length   // 40 teaching slots / week
const ERASE = '__erase'

const classList = grades.slice(8).flatMap((g) => sections.map((s) => `${g}-${s}`))

const teacherById = (id: string): Teacher | undefined => teachers.find((t) => t.id === id)
const teacherName = (id: string): string => teacherById(id)?.name ?? '—'
const teacherOpts = teachers.map((t) => ({ value: t.id, label: `${t.name} · ${t.dept}` }))

/* teachers qualified to teach a subject (fall back to all) */
function qualified(subject: string): Teacher[] {
  const q = teachers.filter((t) => t.subjects.includes(subject))
  return q.length ? q : teachers
}

/* deterministic colour per subject */
function subjStyle(s: string): { bg: string; fg: string; bd: string } {
  const hue = ([...s].reduce((a, c) => a + c.charCodeAt(0), 0) * 7) % 360
  return { bg: `hsl(${hue} 65% 94%)`, fg: `hsl(${hue} 55% 32%)`, bd: `hsl(${hue} 50% 80%)` }
}


/* ============================================================
   1 · Classes & sections
   ============================================================ */
interface ClassRow { name: string; grade: string; section: string; teacherId: string; students: number; room: string }

function ClassesTab({ editable }: { editable: boolean }) {
  const toast = useToast()

  const initial = useMemo<ClassRow[]>(() => {
    const ctMap: Record<string, string> = {}
    teachers.forEach((t) => { if (t.classTeacher && !ctMap[t.classTeacher]) ctMap[t.classTeacher] = t.id })
    return classList.map((name, i) => {
      const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0)
      const [grade, section] = name.split('-')
      return { name, grade, section, teacherId: ctMap[name] ?? '', students: 30 + (hash % 16), room: `Room ${101 + i}` }
    })
  }, [])

  const [rows, setRows] = useState<ClassRow[]>(initial)
  const [pick, setPick] = useState<ClassRow | null>(null)
  const [pickSel, setPickSel] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [aGrade, setAGrade] = useState(grades[8])
  const [aSec, setASec] = useState(sections[0])
  const [aRoom, setARoom] = useState('')

  const openPicker = (r: ClassRow) => { setPick(r); setPickSel(r.teacherId || teachers[0].id) }
  const assign = () => {
    if (!pick) return
    setRows((rs) => rs.map((r) => r.name === pick.name ? { ...r, teacherId: pickSel } : r))
    toast.success('Class teacher assigned', `${teacherName(pickSel)} → ${pick.name}.`)
    setPick(null)
  }
  const addClass = () => {
    const name = `${aGrade}-${aSec}`
    if (rows.some((r) => r.name === name)) { toast.danger('Class exists', `${name} is already in the list.`); return }
    setRows((rs) => [...rs, { name, grade: aGrade, section: aSec, teacherId: '', students: 0, room: aRoom.trim() || '—' }])
    toast.success('Class added', `${name} created.`)
    setAddOpen(false); setARoom('')
  }

  const cols: Column<ClassRow>[] = [
    { key: 'name', label: 'Class', sortValue: (r) => r.name, render: (r) => (
      <div className="row ai-center gap10">
        <span className="sm-card-ic"><Icon name="grid" size={15} /></span>
        <div><div className="fw6">{r.name}</div><div className="t-xs muted">Grade {r.grade} · Sec {r.section}</div></div>
      </div>
    ) },
    { key: 'teacher', label: 'Class teacher', sortValue: (r) => teacherName(r.teacherId), render: (r) => (
      r.teacherId
        ? <Badge tone="brand" icon="user">{teacherName(r.teacherId)}</Badge>
        : editable
          ? <Btn size="sm" variant="secondary" icon="plus" onClick={() => openPicker(r)}>Assign</Btn>
          : <span className="muted t-sm">Unassigned</span>
    ) },
    { key: 'students', label: 'Students', align: 'center', sortValue: (r) => r.students, render: (r) => <span className="fw6">{r.students}</span> },
    { key: 'room', label: 'Room', sortValue: (r) => r.room, render: (r) => <span className="muted">{r.room}</span> },
    { key: 'act', label: '', render: (r) => editable
      ? <Btn size="sm" variant="ghost" icon="edit" onClick={() => openPicker(r)}>Class teacher</Btn>
      : null },
  ]

  return (
    <Card pad={false}>
      <div className="row ai-center jc-between gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <div><div className="fw6">Classes & sections</div><div className="t-sm muted">{rows.length} classes · current academic year</div></div>
        {editable && <Btn variant="primary" icon="plus" onClick={() => setAddOpen(true)}>Add class</Btn>}
      </div>
      <DataTable<ClassRow> columns={cols} rows={rows} rowKey={(r) => r.name} pageSize={12} initialSort={{ key: 'name', dir: 'asc' }} />

      {/* assign class-teacher picker */}
      <Modal open={!!pick} onClose={() => setPick(null)} icon="user" title="Assign class teacher" sub={pick ? `Class ${pick.name}` : ''}
        footer={<div className="row gap8 jc-end"><Btn variant="ghost" onClick={() => setPick(null)}>Cancel</Btn><Btn variant="primary" icon="check" onClick={assign}>Assign</Btn></div>}>
        <Field label="Teacher"><Select options={teacherOpts} value={pickSel} onChange={(e) => setPickSel(e.target.value)} /></Field>
      </Modal>

      {/* add class */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} icon="plus" title="Add class"
        footer={<div className="row gap8 jc-end"><Btn variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Btn><Btn variant="primary" icon="check" onClick={addClass}>Add class</Btn></div>}>
        <div className="sm-grid-2 gap12">
          <Field label="Grade"><Select options={grades} value={aGrade} onChange={(e) => setAGrade(e.target.value)} /></Field>
          <Field label="Section"><Select options={sections} value={aSec} onChange={(e) => setASec(e.target.value)} /></Field>
        </div>
        <Field label="Room" hint="Optional — e.g. Room 204"><Input icon="building" value={aRoom} placeholder="Room…" onChange={(e) => setARoom(e.target.value)} /></Field>
      </Modal>
    </Card>
  )
}

/* ============================================================
   2 · Timetable builder (centerpiece)
   ============================================================ */
function TeacherChips({ subject, ids, onChange, editable }: {
  subject: string; ids: string[]; onChange: (ids: string[]) => void; editable: boolean
}) {
  const pool = qualified(subject)
  const avail = pool.filter((t) => !ids.includes(t.id))
  return (
    <div className="row ai-center gap6 wrap">
      {ids.map((id) => (
        <span key={id} className="sm-badge soft sm-badge-brand" style={{ gap: 4 }}>
          <Icon name="user" size={11} />{teacherName(id)}
          {editable && ids.length > 1 && (
            <button onClick={() => onChange(ids.filter((x) => x !== id))} aria-label="Remove"
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', display: 'inline-flex', padding: 0, marginLeft: 2 }}>
              <Icon name="x" size={11} />
            </button>
          )}
        </span>
      ))}
      {editable && ids.length < 3 && avail.length > 0 && (
        <Select style={{ minWidth: 130, height: 30 }} value=""
          options={[{ value: '', label: '+ Add teacher' }, ...avail.map((t) => ({ value: t.id, label: t.name }))]}
          onChange={(e) => { if (e.target.value) onChange([...ids, e.target.value]) }} />
      )}
    </div>
  )
}

function TimetableTab({ editable }: { editable: boolean }) {
  const toast = useToast()
  const [cls, setCls] = useState(classList[0])
  const [grids, setGrids] = useState<Record<string, Grid>>({})
  const [mode, setMode] = useState<Record<string, 'choice' | 'build'>>({})
  const [classTeachers, setClassTeachers] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    teachers.forEach((t) => { if (t.classTeacher && !m[t.classTeacher]) m[t.classTeacher] = t.id })
    return m
  })
  /* per-subject teacher roster (1–3), shared by palette + auto config */
  const [subjTeachers, setSubjTeachers] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(subjects.map((s) => [s, [qualified(s)[0].id]])))
  /* per-subject periods-per-week for the generator */
  const [ppw, setPpw] = useState<Record<string, number>>(() => {
    const base = Math.floor(TOTAL_SLOTS / subjects.length)
    let extra = TOTAL_SLOTS - base * subjects.length
    return Object.fromEntries(subjects.map((s) => [s, base + (extra-- > 0 ? 1 : 0)]))
  })
  const [brush, setBrush] = useState('')
  const [placeCounts, setPlaceCounts] = useState<Record<string, number>>({})
  const [cfgOpen, setCfgOpen] = useState(false)

  const g = grids[cls] ?? {}
  const conflicts = useMemo(() => conflictsFor(grids, cls), [grids, cls])
  const m = mode[cls] ?? 'choice'
  const filled = Object.values(g).filter((c): c is Cell => !!c).length
  const ctId = classTeachers[cls] ?? ''

  const setSubjTeam = (s: string, ids: string[]) => setSubjTeachers((p) => ({ ...p, [s]: ids }))

  /* ---- manual click-to-place ---- */
  const place = (d: number, p: number) => {
    if (!editable || m !== 'build') return
    const key = cellKey(d, p)
    if (!brush) { toast.info('Pick a subject', 'Choose a subject from the palette (or Erase) first.'); return }
    if (brush === ERASE) { setGrids((prev) => ({ ...prev, [cls]: { ...(prev[cls] ?? {}), [key]: null } })); return }
    const team = subjTeachers[brush] ?? []
    const c = placeCounts[brush] ?? 0
    const tid = team.length ? team[c % team.length] : ''
    const clashWith = tid ? clashingClass(grids, tid, d, p, cls) : null
    setGrids((prev) => ({ ...prev, [cls]: { ...(prev[cls] ?? {}), [key]: { subject: brush, teacherId: tid } } }))
    setPlaceCounts((prev) => ({ ...prev, [brush]: (prev[brush] ?? 0) + 1 }))
    if (clashWith) toast.danger('Teacher clash', `${teacherName(tid)} is also teaching ${clashWith} on ${DAYS[d]} P${p + 1}.`)
  }

  const startManual = () => { setGrids((p) => ({ ...p, [cls]: {} })); setMode((p) => ({ ...p, [cls]: 'build' })) }
  const clearGrid = () => { setGrids((p) => ({ ...p, [cls]: {} })); setPlaceCounts({}) }
  const restart = () => { setMode((p) => ({ ...p, [cls]: 'choice' })); setGrids((p) => ({ ...p, [cls]: {} })); setPlaceCounts({}) }

  /* ---- auto generate: round-robin so subjects spread diagonally ---- */
  const cfgTotal = Object.values(ppw).reduce((a, b) => a + b, 0)
  const generate = () => {
    const left: Record<string, number> = { ...ppw }
    const tokens: string[] = []
    let remaining = Math.min(cfgTotal, TOTAL_SLOTS)
    while (tokens.length < remaining) {
      for (const s of subjects) { if (left[s] > 0 && tokens.length < remaining) { tokens.push(s); left[s]-- } }
    }
    const next: Grid = {}
    const rot: Record<string, number> = {}
    let ti = 0
    for (let p = 0; p < PERIODS; p++) {
      for (let d = 0; d < DAYS.length; d++) {
        if (ti >= tokens.length) continue
        const s = tokens[ti++]
        const team = subjTeachers[s] ?? []
        const tid = pickTeacher({ ...grids, [cls]: next }, team, d, p, cls, rot[s] ?? 0)
        rot[s] = (rot[s] ?? 0) + 1
        next[cellKey(d, p)] = { subject: s, teacherId: tid }
      }
    }
    setGrids((prev) => ({ ...prev, [cls]: next }))
    setMode((prev) => ({ ...prev, [cls]: 'build' }))
    setPlaceCounts({})
    setCfgOpen(false)
    const clashCount = conflictsFor({ ...grids, [cls]: next }, cls).size
    toast.success('Timetable generated', `${Math.min(tokens.length, TOTAL_SLOTS)} periods placed for ${cls} · ${clashCount === 0 ? '0 clashes' : `${clashCount} clash${clashCount > 1 ? 'es' : ''} to review`}.`)
  }

  /* grid rows incl. fixed lunch break */
  const rowsDesc: ({ type: 'period'; p: number } | { type: 'lunch' })[] = []
  for (let p = 0; p < PERIODS; p++) { rowsDesc.push({ type: 'period', p }); if (p === LUNCH_AFTER - 1) rowsDesc.push({ type: 'lunch' }) }

  return (
    <div className="col gap16">
      {/* toolbar */}
      <Card>
        <div className="row ai-center jc-between gap12 wrap">
          <div className="row ai-center gap12 wrap">
            <Field label="Class"><Select style={{ minWidth: 140 }} options={classList} value={cls} onChange={(e) => setCls(e.target.value)} /></Field>
            {ctId && <Badge tone="brand" icon="user" style={{ alignSelf: 'flex-end', marginBottom: 4 }}>Class teacher: {teacherName(ctId)}</Badge>}
          </div>
          {m === 'build' && (
            <div className="row ai-center gap8 wrap">
              <Badge tone={filled === TOTAL_SLOTS ? 'success' : 'neutral'}>{filled}/{TOTAL_SLOTS} periods set</Badge>
              {conflicts.size > 0
                ? <Badge tone="danger" icon="alert">{conflicts.size} clash{conflicts.size > 1 ? 'es' : ''}</Badge>
                : filled > 0 ? <Badge tone="success" icon="checkCircle">No clashes</Badge> : null}
              {editable && <Btn size="sm" variant="secondary" icon="sparkle" onClick={() => setCfgOpen(true)}>Re-generate</Btn>}
              {editable && <Btn size="sm" variant="ghost" icon="refresh" onClick={restart}>Restart</Btn>}
              {editable && <Btn size="sm" variant="primary" icon="check" onClick={() => {
                const n = conflicts.size
                if (n > 0) toast.danger('Saved with clashes', `${cls} saved (${filled}/${TOTAL_SLOTS}) · ${n} clash${n > 1 ? 'es' : ''} — resolve before publishing.`)
                else toast.success('Timetable saved', `${cls} routine saved (${filled}/${TOTAL_SLOTS} periods).`)
              }}>Save</Btn>}
            </div>
          )}
        </div>
      </Card>

      {/* choice screen */}
      {m === 'choice' && (
        editable ? (
          <div className="sm-grid-2 gap16">
            <Card hover className="pad" onClick={() => setCfgOpen(true)}>
              <div className="row ai-center gap12">
                <span className="sm-kpi-ic" style={{ background: 'var(--brand-50)', color: 'var(--brand-600)' }}><Icon name="sparkle" size={20} /></span>
                <div><div className="fw6">Auto-generate <Badge tone="success">recommended</Badge></div><div className="t-sm muted">Set periods-per-week + teachers; we build a balanced routine.</div></div>
              </div>
            </Card>
            <Card hover className="pad" onClick={startManual}>
              <div className="row ai-center gap12">
                <span className="sm-kpi-ic" style={{ background: 'var(--surface-2)' }}><Icon name="edit" size={20} /></span>
                <div><div className="fw6">Build manually</div><div className="t-sm muted">Pick a subject from the palette, then tap cells to place it.</div></div>
              </div>
            </Card>
          </div>
        ) : (
          <Empty icon="calendar" title="No timetable yet" body={`No routine has been published for ${cls}.`} />
        )
      )}

      {/* builder */}
      {m === 'build' && (
        <div className="row gap16 wrap" style={{ alignItems: 'flex-start' }}>
          {/* palette */}
          {editable && (
            <Card style={{ width: 260, flex: '0 0 auto' }}>
              <CardHead title="Subjects" sub="Pick one, then tap a cell" icon="book" />
              <div className="col gap8" style={{ marginTop: 8 }}>
                {subjects.map((s) => {
                  const st = subjStyle(s)
                  const on = brush === s
                  return (
                    <div key={s} className="col gap6" style={{ border: `1px solid ${on ? st.fg : 'var(--border)'}`, borderRadius: 10, padding: 8, background: on ? st.bg : undefined }}>
                      <button onClick={() => setBrush(s)} style={{ border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: st.fg, flex: '0 0 auto' }} />
                        <span className="fw6 t-sm" style={{ color: st.fg }}>{s}</span>
                      </button>
                      <TeacherChips subject={s} ids={subjTeachers[s] ?? []} onChange={(ids) => setSubjTeam(s, ids)} editable={editable} />
                    </div>
                  )
                })}
                <div className="row gap8" style={{ marginTop: 4 }}>
                  <Btn size="sm" variant={brush === ERASE ? 'danger' : 'secondary'} icon="trash" onClick={() => setBrush(ERASE)}>Erase</Btn>
                  <Btn size="sm" variant="ghost" onClick={clearGrid}>Clear all</Btn>
                </div>
              </div>
            </Card>
          )}

          {/* weekly grid */}
          <Card style={{ flex: 1, minWidth: 320, overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `64px repeat(${DAYS.length}, minmax(94px, 1fr))`, gap: 6, minWidth: 560 }}>
              <div />
              {DAYS.map((d) => <div key={d} className="t-xs fw6 ta-center muted" style={{ padding: '4px 0' }}>{d}</div>)}
              {rowsDesc.map((rd, ri) => rd.type === 'lunch' ? (
                <Fragment key={`lunch-${ri}`}>
                  <div className="t-xs muted ai-center" style={{ display: 'flex', justifyContent: 'center' }}><Icon name="clock" size={13} /></div>
                  <div className="t-xs fw6 muted" style={{ gridColumn: `2 / span ${DAYS.length}`, textAlign: 'center', padding: '6px 0', background: 'var(--surface-2)', borderRadius: 8 }}>Lunch break</div>
                </Fragment>
              ) : (
                <Fragment key={`p-${rd.p}`}>
                  <div className="t-xs fw6 muted" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>P{rd.p + 1}</div>
                  {DAYS.map((_d, di) => {
                    const ck = cellKey(di, rd.p)
                    const cell = g[ck]
                    const st = cell ? subjStyle(cell.subject) : null
                    const isClash = conflicts.has(ck)
                    const clashWith = cell && isClash ? clashingClass(grids, cell.teacherId, di, rd.p, cls) : null
                    return (
                      <button key={di} onClick={() => place(di, rd.p)} disabled={!editable}
                        title={clashWith ? `Also in ${clashWith} · ${DAYS[di]} P${rd.p + 1}` : undefined}
                        style={{
                          minHeight: 56, borderRadius: 8, padding: 6, textAlign: 'left',
                          cursor: editable ? 'pointer' : 'default',
                          border: `${isClash ? '2px' : '1px'} solid ${isClash ? 'var(--danger)' : st ? st.bd : 'var(--border)'}`,
                          background: st ? st.bg : 'var(--surface)',
                          display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2,
                        }}>
                        {cell ? (
                          <>
                            <span className="fw6 t-xs" style={{ color: st!.fg }}>{cell.subject}</span>
                            <span className="t-xs" style={{ lineHeight: 1.1, display: 'flex', alignItems: 'center', gap: 3, color: isClash ? 'var(--danger)' : 'var(--text-2)' }}>
                              {isClash && <Icon name="alert" size={11} />}{teacherName(cell.teacherId)}
                            </span>
                          </>
                        ) : <span className="muted" style={{ opacity: editable ? 0.5 : 0.2, fontSize: 16, textAlign: 'center' }}>{editable ? '+' : '·'}</span>}
                      </button>
                    )
                  })}
                </Fragment>
              ))}
            </div>
            {editable && <div className="t-xs muted" style={{ marginTop: 10 }}>{brush === ERASE ? 'Erase mode — tap a cell to clear it.' : brush ? `Placing “${brush}”. Tap a cell to drop it (teachers rotate).` : 'Select a subject from the palette to start placing.'}</div>}
          </Card>
        </div>
      )}

      {/* auto-generate config */}
      <Modal open={cfgOpen} onClose={() => setCfgOpen(false)} size="lg" icon="sparkle" title="Auto-generate timetable" sub={`Class ${cls} · set periods-per-week & teachers`}
        footer={
          <div className="row ai-center jc-between" style={{ width: '100%' }}>
            <Badge tone={cfgTotal === TOTAL_SLOTS ? 'success' : cfgTotal > TOTAL_SLOTS ? 'danger' : 'warning'}>
              {cfgTotal}/{TOTAL_SLOTS} periods{cfgTotal === TOTAL_SLOTS ? ' · perfect fit' : cfgTotal > TOTAL_SLOTS ? ' · over capacity' : ' · free periods left'}
            </Badge>
            <div className="row gap8"><Btn variant="ghost" onClick={() => setCfgOpen(false)}>Cancel</Btn><Btn variant="primary" icon="sparkle" onClick={generate}>Generate</Btn></div>
          </div>
        }>
        <Field label="Class teacher"><Select options={[{ value: '', label: '— Select —' }, ...teacherOpts]} value={ctId} onChange={(e) => setClassTeachers((p) => ({ ...p, [cls]: e.target.value }))} /></Field>
        <div className="col gap10" style={{ marginTop: 12 }}>
          {subjects.map((s) => {
            const st = subjStyle(s)
            return (
              <div key={s} className="row ai-center gap12 wrap" style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
                <div className="row ai-center gap8" style={{ width: 150 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: st.fg, flex: '0 0 auto' }} />
                  <span className="fw6 t-sm">{s}</span>
                </div>
                <div style={{ width: 110 }}>
                  <Select value={String(ppw[s] ?? 0)} options={Array.from({ length: 11 }, (_, i) => ({ value: String(i), label: `${i}/week` }))}
                    onChange={(e) => setPpw((p) => ({ ...p, [s]: Number(e.target.value) }))} />
                </div>
                <div className="flex1"><TeacherChips subject={s} ids={subjTeachers[s] ?? []} onChange={(ids) => setSubjTeam(s, ids)} editable /></div>
              </div>
            )
          })}
        </div>
      </Modal>
    </div>
  )
}

/* ============================================================
   3 · Periods — daily bell schedule
   ============================================================ */
interface PeriodRow { label: string; start: string; end: string; type: string }
const PTYPES = ['Class', 'Break', 'Assembly']
const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return (h || 0) * 60 + (m || 0) }
const durOf = (a: string, b: string) => { const d = toMin(b) - toMin(a); return d > 0 ? `${d} min` : '—' }

function PeriodsTab({ editable }: { editable: boolean }) {
  const toast = useToast()
  const [rows, setRows] = useState<PeriodRow[]>([
    { label: 'Assembly', start: '08:00', end: '08:15', type: 'Assembly' },
    { label: 'Period 1', start: '08:15', end: '09:00', type: 'Class' },
    { label: 'Period 2', start: '09:00', end: '09:45', type: 'Class' },
    { label: 'Short break', start: '09:45', end: '09:55', type: 'Break' },
    { label: 'Period 3', start: '09:55', end: '10:40', type: 'Class' },
    { label: 'Period 4', start: '10:40', end: '11:25', type: 'Class' },
    { label: 'Lunch', start: '11:25', end: '12:05', type: 'Break' },
    { label: 'Period 5', start: '12:05', end: '12:50', type: 'Class' },
    { label: 'Period 6', start: '12:50', end: '13:35', type: 'Class' },
  ])

  const update = (i: number, patch: Partial<PeriodRow>) => setRows((rs) => rs.map((r, j) => j === i ? { ...r, ...patch } : r))
  const del = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i))
  const add = () => { const last = rows[rows.length - 1]; setRows((rs) => [...rs, { label: `Period ${rs.filter((r) => r.type === 'Class').length + 1}`, start: last?.end ?? '14:00', end: '14:45', type: 'Class' }]) }

  return (
    <Card pad={false}>
      <div className="row ai-center jc-between gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <div><div className="fw6">Daily bell schedule</div><div className="t-sm muted">{rows.length} periods · {durOf(rows[0]?.start ?? '08:00', rows[rows.length - 1]?.end ?? '08:00')} school day</div></div>
        {editable && <div className="row gap8"><Btn variant="secondary" icon="plus" onClick={add}>Add period</Btn><Btn variant="primary" icon="check" onClick={() => toast.success('Schedule saved', `${rows.length} periods saved.`)}>Save</Btn></div>}
      </div>
      <table className="sm-table">
        <thead><tr><th>Label</th><th>Start</th><th>End</th><th>Type</th><th className="ta-right">Duration</th>{editable && <th />}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ minWidth: 160 }}>{editable ? <Input value={r.label} onChange={(e) => update(i, { label: e.target.value })} /> : <span className="fw6">{r.label}</span>}</td>
              <td>{editable ? <Input type="time" value={r.start} onChange={(e) => update(i, { start: e.target.value })} /> : r.start}</td>
              <td>{editable ? <Input type="time" value={r.end} onChange={(e) => update(i, { end: e.target.value })} /> : r.end}</td>
              <td style={{ minWidth: 130 }}>{editable ? <Select options={PTYPES} value={r.type} onChange={(e) => update(i, { type: e.target.value })} /> : <Badge tone={r.type === 'Class' ? 'brand' : r.type === 'Break' ? 'warning' : 'info'}>{r.type}</Badge>}</td>
              <td className="ta-right muted">{durOf(r.start, r.end)}</td>
              {editable && <td className="ta-right"><Btn size="sm" variant="ghost" icon="trash" onClick={() => del(i)} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

/* ============================================================
   4 · Subjects
   ============================================================ */
function SubjectsTab({ editable }: { editable: boolean }) {
  const toast = useToast()
  const [list, setList] = useState<string[]>(subjects)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  const add = () => {
    const n = name.trim()
    if (!n) { toast.danger('Name required', 'Enter a subject name.'); return }
    if (list.includes(n)) { toast.danger('Already exists', `${n} is already a subject.`); return }
    setList((l) => [...l, n]); toast.success('Subject added', `${n} created.`); setName(''); setOpen(false)
  }

  return (
    <Card pad={false}>
      <div className="row ai-center jc-between gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <div><div className="fw6">Subjects</div><div className="t-sm muted">{list.length} subjects offered</div></div>
        {editable && <Btn variant="primary" icon="plus" onClick={() => setOpen(true)}>Add subject</Btn>}
      </div>
      <div className="sm-grid-3 gap12" style={{ padding: 16 }}>
        {list.map((s) => {
          const st = subjStyle(s); const n = qualified(s).length
          return (
            <div key={s} className="row ai-center jc-between" style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
              <div className="row ai-center gap10">
                <span style={{ width: 28, height: 28, borderRadius: 8, background: st.bg, color: st.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Icon name="book" size={15} /></span>
                <span className="fw6 t-sm">{s}</span>
              </div>
              <Badge tone="neutral" icon="users">{n}</Badge>
            </div>
          )
        })}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} icon="book" title="Add subject"
        footer={<div className="row gap8 jc-end"><Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn><Btn variant="primary" icon="check" onClick={add}>Add</Btn></div>}>
        <Field label="Subject name" required><Input icon="book" value={name} placeholder="e.g. Physics" onChange={(e) => setName(e.target.value)} /></Field>
      </Modal>
    </Card>
  )
}

/* ============================================================
   5 · Homework tracker
   ============================================================ */
interface Hw { id: number; cls: string; subject: string; title: string; due: string; status: string }
const hwTone: Record<string, BadgeTone> = { Assigned: 'brand', Submitted: 'info', Graded: 'success', Overdue: 'danger' }

function HomeworkTab({ editable }: { editable: boolean }) {
  const toast = useToast()
  const [rows, setRows] = useState<Hw[]>([
    { id: 1, cls: 'IX-A', subject: 'Mathematics', title: 'Quadratic equations — Ex 4.3', due: '2026-06-12', status: 'Assigned' },
    { id: 2, cls: 'X-B', subject: 'Science', title: 'Chemical reactions worksheet', due: '2026-06-10', status: 'Submitted' },
    { id: 3, cls: 'IX-C', subject: 'English', title: 'Essay: My favourite book', due: '2026-06-05', status: 'Graded' },
    { id: 4, cls: 'XI-A', subject: 'Computer', title: 'Python loops assignment', due: '2026-06-04', status: 'Overdue' },
    { id: 5, cls: 'X-A', subject: 'Social Studies', title: 'Map work — rivers of India', due: '2026-06-14', status: 'Assigned' },
  ])
  const [open, setOpen] = useState(false)
  const [cls, setCls] = useState(classList[0])
  const [subject, setSubject] = useState(subjects[0])
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('2026-06-15')

  const add = () => {
    if (!title.trim()) { toast.danger('Title required', 'Enter a homework title.'); return }
    setRows((r) => [{ id: Date.now(), cls, subject, title: title.trim(), due, status: 'Assigned' }, ...r])
    toast.success('Homework assigned', `${subject} → ${cls}.`); setTitle(''); setOpen(false)
  }

  const cols: Column<Hw>[] = [
    { key: 'cls', label: 'Class', sortValue: (r) => r.cls, render: (r) => <Badge tone="neutral">{r.cls}</Badge> },
    { key: 'subject', label: 'Subject', sortValue: (r) => r.subject, render: (r) => <span className="fw6">{r.subject}</span> },
    { key: 'title', label: 'Title', sortValue: (r) => r.title },
    { key: 'due', label: 'Due', sortValue: (r) => r.due, render: (r) => <span className="muted">{r.due}</span> },
    { key: 'status', label: 'Status', align: 'center', sortValue: (r) => r.status, render: (r) => <Badge tone={hwTone[r.status] ?? 'neutral'} dot>{r.status}</Badge> },
  ]

  return (
    <Card pad={false}>
      <div className="row ai-center jc-between gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <div><div className="fw6">Homework tracker</div><div className="t-sm muted">{rows.length} assignments</div></div>
        {editable && <Btn variant="primary" icon="plus" onClick={() => setOpen(true)}>Assign homework</Btn>}
      </div>
      <DataTable<Hw> columns={cols} rows={rows} rowKey={(r) => r.id} pageSize={10} initialSort={{ key: 'due', dir: 'asc' }}
        empty={<Empty icon="clipboard" title="No homework yet" body="Assign homework to track it here." />} />
      <Modal open={open} onClose={() => setOpen(false)} icon="clipboard" title="Assign homework"
        footer={<div className="row gap8 jc-end"><Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn><Btn variant="primary" icon="check" onClick={add}>Assign</Btn></div>}>
        <div className="sm-grid-2 gap12">
          <Field label="Class"><Select options={classList} value={cls} onChange={(e) => setCls(e.target.value)} /></Field>
          <Field label="Subject"><Select options={subjects} value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        </div>
        <Field label="Title" required><Input icon="clipboard" value={title} placeholder="e.g. Chapter 5 exercises" onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Due date"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      </Modal>
    </Card>
  )
}

/* ============================================================
   Academics hub — tab shell
   ============================================================ */
function AcademicsScreen() {
  const app = useApp()
  const editable = can(app.role, 'academics', 'E')
  const [tab, setTab] = useState('classes')

  const tabs = [
    { value: 'classes', label: 'Classes', icon: 'grid' },
    { value: 'timetable', label: 'Timetable', icon: 'calendar' },
    { value: 'periods', label: 'Periods', icon: 'clock' },
    { value: 'subjects', label: 'Subjects', icon: 'book' },
    { value: 'homework', label: 'Homework', icon: 'clipboard' },
  ]

  return (
    <div>
      <PageHead title="Academics" sub={`${app.school.name} · classes, timetable & curriculum`}
        actions={editable ? <Badge tone="success" icon="edit">Editing enabled</Badge> : <Badge tone="neutral" icon="eye">View only</Badge>} />
      <div style={{ marginBottom: 16 }}><Tabs value={tab} onChange={setTab} tabs={tabs} /></div>

      {/* keep all panels mounted so builder state survives tab switches */}
      <div style={{ display: tab === 'classes' ? 'block' : 'none' }}><ClassesTab editable={editable} /></div>
      <div style={{ display: tab === 'timetable' ? 'block' : 'none' }}><TimetableTab editable={editable} /></div>
      <div style={{ display: tab === 'periods' ? 'block' : 'none' }}><PeriodsTab editable={editable} /></div>
      <div style={{ display: tab === 'subjects' ? 'block' : 'none' }}><SubjectsTab editable={editable} /></div>
      <div style={{ display: tab === 'homework' ? 'block' : 'none' }}><HomeworkTab editable={editable} /></div>
    </div>
  )
}

/* ---------- export contract ---------- */
import type { ComponentType } from 'react'
export const academicsScreens: Record<string, ComponentType> = { 'school.academics': AcademicsScreen }
