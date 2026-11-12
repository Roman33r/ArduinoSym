import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import {
  Activity,
  BookOpen,
  Cable,
  Check,
  ChevronRight,
  CircleHelp,
  CircuitBoard as CircuitIcon,
  CloudSun,
  Code2,
  Copy,
  Cpu,
  FlaskConical,
  Github,
  Lightbulb,
  ListRestart,
  LoaderCircle,
  Maximize2,
  Minus,
  Palette,
  Play,
  Plus,
  RotateCw,
  ScanLine,
  SlidersHorizontal,
  Square,
  Sun,
  Thermometer,
  Trash2,
  Volume2,
  X,
  Zap,
} from 'lucide-react'
import CircuitBoard, { type Selection } from './components/CircuitBoard'
import CodePanel from './components/CodePanel'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './components/ui/resizable'
import { useDefaultLayout } from 'react-resizable-panels'
import LessonsView from './components/LessonsView'
import { EXPERIMENTS } from './data/experiments'
import { BOARD_IDS, BOARDS, pinOptionLabel, type BoardId } from './lib/boards'
import { adaptCodeToBoard } from './lib/esp32Compat'
import { AVRRunner, compileSketch } from './lib/avrRunner'
import {
  BOARD_PINS,
  COMPONENT_DEFS,
  EMPTY_SNAPSHOT,
  SLOT_ROWS,
  WIRE_COLORS,
  analyzeCircuit,
  defaultWireColor,
  describeEndpoint,
  isValidEndpoint,
  makeComponent,
} from './lib/circuit'
import type { CircuitComponent, CircuitState, ComponentKind, RunnerSnapshot } from './types/circuit'
import './App.css'

type RunStatus = 'idle' | 'compiling' | 'running' | 'error'
type MobilePanel = 'parts' | 'circuit' | 'code'

const COMPONENT_ICONS = {
  led: Lightbulb,
  resistor: Minus,
  button: CircleHelp,
  potentiometer: SlidersHorizontal,
  light: Sun,
  temperature: Thermometer,
  ultrasonic: ScanLine,
  buzzer: Volume2,
  rgb: Palette,
  servo: RotateCw,
  dht22: CloudSun,
  ds18b20: Thermometer,
}

const INITIAL_CIRCUIT = EXPERIMENTS[0].circuit
const INITIAL_CODE = EXPERIMENTS[0].code

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}

function LayoutGroup({ desktop, children }: { desktop: boolean; children: ReactNode }) {
  const { defaultLayout, onLayoutChange } = useDefaultLayout({ id: 'lab-layout-v1', panelIds: ['parts', 'circuit', 'code'], storage: localStorage })
  if (!desktop) return <>{children}</>
  return (
    <ResizablePanelGroup orientation="horizontal" defaultLayout={defaultLayout} onLayoutChange={onLayoutChange} className="lab-panels-desktop">
      {children}
    </ResizablePanelGroup>
  )
}

type LayoutPanelProps = { desktop: boolean; children: ReactNode } & Omit<ComponentProps<typeof ResizablePanel>, 'children'>

function LayoutPanel({ desktop, children, ...panelProps }: LayoutPanelProps) {
  if (!desktop) return <>{children}</>
  return <ResizablePanel className="lab-rp" {...panelProps}>{children}</ResizablePanel>
}

function LayoutHandle({ desktop }: { desktop: boolean }) {
  if (!desktop) return null
  return <ResizableHandle className="lab-resize-handle" aria-label="Изменить ширину панелей" />
}

function loadCircuit(): CircuitState {
  try {
    const saved = JSON.parse(localStorage.getItem('arduino-lab-circuit') || 'null')
    if (saved && Array.isArray(saved.components) && Array.isArray(saved.wires)) return saved
  } catch { /* Start with the safe example. */ }
  return INITIAL_CIRCUIT
}

function loadExperimentId(): string {
  const saved = localStorage.getItem('arduino-lab-experiment')
  if (EXPERIMENTS.some((item) => item.id === saved)) return saved!
  const savedCode = localStorage.getItem('arduino-lab-code')
  return EXPERIMENTS.find((item) => item.code === savedCode)?.id ?? 'blink'
}

function loadCompleted(): number[] {
  try {
    const saved = JSON.parse(localStorage.getItem('arduino-lab-progress') || '[]')
    return Array.isArray(saved) ? saved.filter((id) => Number.isInteger(id) && id >= 1 && id <= 8) : []
  } catch { return [] }
}

export default function App() {
  const [view, setView] = useState<'lab' | 'lessons'>('lab')
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('circuit')
  const [leftTab, setLeftTab] = useState<'components' | 'experiments'>('components')
  const [experimentId, setExperimentId] = useState(loadExperimentId)
  const [circuit, setCircuit] = useState<CircuitState>(loadCircuit)
  const [code, setCode] = useState(() => localStorage.getItem('arduino-lab-code') || INITIAL_CODE)
  const [snapshot, setSnapshot] = useState<RunnerSnapshot>(EMPTY_SNAPSHOT)
  const [status, setStatus] = useState<RunStatus>('idle')
  const [serial, setSerial] = useState('')
  const [selection, setSelection] = useState<Selection>(null)
  const [draftEndpoint, setDraftEndpoint] = useState<string | null>(null)
  const [wireFrom, setWireFrom] = useState('D13')
  const [wireTo, setWireTo] = useState('b2')
  const [wireColor, setWireColor] = useState('auto')
  const [toast, setToast] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [completed, setCompleted] = useState<number[]>(loadCompleted)
  const [zoom, setZoom] = useState(() => window.innerWidth < 700 ? 1.55 : 1)
  const [board, setBoard] = useState<BoardId>(() => localStorage.getItem('arduino-lab-board') === 'esp32' ? 'esp32' : 'uno')
  const desktop = useMediaQuery('(min-width: 821px)')
  const runnerRef = useRef<AVRRunner | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const compileController = useRef<AbortController | null>(null)
  const helpDialog = useRef<HTMLDialogElement>(null)
  const clearDialog = useRef<HTMLDialogElement>(null)

  const experiment = EXPERIMENTS.find((item) => item.id === experimentId) ?? EXPERIMENTS[0]
  const boardSpec = BOARDS[board]
  const analysis = useMemo(() => analyzeCircuit(circuit, snapshot, board), [circuit, snapshot, board])
  const selectedComponent = selection?.type === 'component' ? circuit.components.find((item) => item.id === selection.id) : undefined
  const selectedWire = selection?.type === 'wire' ? circuit.wires.find((item) => item.id === selection.id) : undefined

  const notify = (message: string) => {
    setToast(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2800)
  }

  useEffect(() => { localStorage.setItem('arduino-lab-circuit', JSON.stringify(circuit)) }, [circuit])
  useEffect(() => { localStorage.setItem('arduino-lab-code', code) }, [code])
  useEffect(() => { localStorage.setItem('arduino-lab-experiment', experimentId) }, [experimentId])
  useEffect(() => { localStorage.setItem('arduino-lab-progress', JSON.stringify(completed)) }, [completed])
  useEffect(() => { localStorage.setItem('arduino-lab-board', board) }, [board])
  useEffect(() => { runnerRef.current?.updateHardware(analysis) }, [circuit, status])
  useEffect(() => {
    if (helpOpen) helpDialog.current?.showModal()
    else helpDialog.current?.close()
  }, [helpOpen])
  useEffect(() => {
    if (clearOpen) clearDialog.current?.showModal()
    else clearDialog.current?.close()
  }, [clearOpen])
  useEffect(() => () => {
    runnerRef.current?.stop()
    compileController.current?.abort()
    if (toastTimer.current) clearTimeout(toastTimer.current)
  }, [])

  const stop = (resetPins = true) => {
    compileController.current?.abort()
    runnerRef.current?.stop()
    runnerRef.current = null
    setStatus('idle')
    if (resetPins) setSnapshot(EMPTY_SNAPSHOT)
  }

  const selectBoard = (next: BoardId) => {
    if (next === board) return
    stop()
    setBoard(next)
    const targetCode = next === 'esp32' ? (experiment.codeEsp32 ?? experiment.code) : experiment.code
    const knownVariants = [experiment.code, experiment.codeEsp32].filter(Boolean)
    setCode(knownVariants.includes(code) ? targetCode : adaptCodeToBoard(code, next))
    setSelection(null)
    setDraftEndpoint(null)
    notify(`Плата: ${BOARDS[next].name}. Код и подписи датчиков адаптированы.`)
  }

  const run = async () => {
    if (status === 'running' || status === 'compiling') {
      stop()
      return
    }
    stop()
    setStatus('compiling')
    setSerial('Компиляция программы…\n')
    const controller = new AbortController()
    compileController.current = controller
    try {
      const result = await compileSketch(code, controller.signal, board)
      const runner = new AVRRunner(result.hex, (nextSnapshot) => {
        setSnapshot(nextSnapshot)
        if (nextSnapshot.serial) setSerial((current) => `${current}${nextSnapshot.serial}`.slice(-40000))
      }, board)
      runnerRef.current = runner
      setSnapshot(EMPTY_SNAPSHOT)
      setSerial('')
      setStatus('running')
      runner.updateHardware(analysis)
      runner.start()
      const memoryLine = result.stdout.split('\n').find((line) => line.includes('Sketch uses'))
      notify(memoryLine ? `Программа запущена · ${memoryLine.split('.')[0]}` : 'Программа скомпилирована и запущена')
    } catch (error) {
      if (controller.signal.aborted) return
      setStatus('error')
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка компиляции.'
      setSerial(`Ошибка:\n${message}`)
      notify('Программа не запущена. Проверьте сообщение в мониторе порта.')
    }
  }

  const loadExperiment = (id: string) => {
    const next = EXPERIMENTS.find((item) => item.id === id)
    if (!next) return
    stop()
    setExperimentId(id)
    setCircuit(next.circuit)
    setCode(board === 'esp32' ? (next.codeEsp32 ?? next.code) : next.code)
    setSerial('')
    setSelection(null)
    setDraftEndpoint(null)
    setView('lab')
    setMobilePanel('circuit')
    notify(`Открыт эксперимент «${next.name}»`)
  }

  const addComponent = (kind: ComponentKind) => {
    const used = new Set(circuit.components.map((item) => item.slot))
    const slot = SLOT_ROWS.findIndex((_, index) => !used.has(index))
    if (slot < 0) {
      notify('На макетке заняты все 6 посадочных мест. Удалите лишнюю деталь.')
      return
    }
    const component = makeComponent(kind, slot)
    setCircuit((current) => ({ ...current, components: [...current.components, component] }))
    setSelection({ type: 'component', id: component.id })
    setMobilePanel('circuit')
    notify(`${COMPONENT_DEFS[kind].name}: деталь добавлена на макетку`)
  }

  const duplicateComponent = () => {
    if (!selectedComponent) return
    const used = new Set(circuit.components.map((item) => item.slot))
    const slot = SLOT_ROWS.findIndex((_, index) => !used.has(index))
    if (slot < 0) {
      notify('Сначала освободите посадочное место для копии.')
      return
    }
    const component: CircuitComponent = {
      ...selectedComponent,
      id: `${selectedComponent.kind}-${crypto.randomUUID()}`,
      slot,
      pressed: false,
    }
    setCircuit((current) => ({ ...current, components: [...current.components, component] }))
    setSelection({ type: 'component', id: component.id })
    notify(`${COMPONENT_DEFS[component.kind].name}: копия добавлена`)
  }

  const deleteSelection = () => {
    if (!selection) return
    if (selection.type === 'component') {
      setCircuit((current) => ({ ...current, components: current.components.filter((item) => item.id !== selection.id) }))
    } else {
      setCircuit((current) => ({ ...current, wires: current.wires.filter((item) => item.id !== selection.id) }))
    }
    setSelection(null)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.matches('input, textarea, select') || target.isContentEditable || target.closest('.cm-editor')) return
      if ((event.key === 'Delete' || event.key === 'Backspace') && selection) deleteSelection()
      if (event.key === 'Escape') { setDraftEndpoint(null); setSelection(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selection, circuit])

  const connect = (from: string, to: string) => {
    if (!isValidEndpoint(from) || !isValidEndpoint(to) || from === to) {
      notify('Выберите два разных контакта.')
      return false
    }
    if (circuit.wires.some((wire) => (wire.from === from && wire.to === to) || (wire.from === to && wire.to === from))) {
      notify('Эти контакты уже соединены.')
      return false
    }
    const color = wireColor === 'auto' ? defaultWireColor(from) : wireColor
    setCircuit((current) => ({ ...current, wires: [...current.wires, { id: `wire-${Date.now()}`, from, to, color }] }))
    setDraftEndpoint(null)
    return true
  }

  const handleEndpoint = (endpoint: string) => {
    if (!draftEndpoint) {
      setDraftEndpoint(endpoint)
      setSelection(null)
      notify(`${describeEndpoint(endpoint, board)} — теперь выберите второй контакт`)
    } else {
      connect(draftEndpoint, endpoint)
    }
  }

  const updateComponent = (id: string, changes: Record<string, unknown>) => {
    setCircuit((current) => ({ ...current, components: current.components.map((item) => item.id === id ? { ...item, ...changes } : item) }))
  }

  const clearCircuit = () => {
    stop()
    setCircuit({ components: [], wires: [] })
    setSelection(null)
    setDraftEndpoint(null)
    setClearOpen(false)
    notify('Макетка очищена. Можно собрать собственную схему.')
  }

  const toggleLesson = (id: number) => {
    setCompleted((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id].sort())
  }

  const runningTime = (snapshot.cycles / 16e6).toFixed(1)

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Перейти к рабочей области</a>
      <header className="app-header">
        <button className="brand" type="button" onClick={() => setView('lab')} aria-label="Ардуино лаборатория — на главную">
          <span className="brand-symbol"><CircuitIcon size={23} /></span>
          <span>ардуино<em>лаборатория</em></span>
        </button>
        <nav className="top-nav" aria-label="Основная навигация">
          <button className={view === 'lab' ? 'active' : ''} onClick={() => setView('lab')}><FlaskConical size={16} />Лаборатория</button>
          <button className={view === 'lessons' ? 'active' : ''} onClick={() => setView('lessons')}><BookOpen size={16} />Уроки</button>
          <button onClick={() => setHelpOpen(true)}><CircleHelp size={16} />Как это работает</button>
        </nav>
        <div className="header-meta">
          <span className="save-state"><Check size={13} />Сохранено локально</span>
          <a href="https://github.com/Roman33r/arduino" target="_blank" rel="noopener noreferrer" aria-label="Репозиторий проекта на GitHub"><Github size={19} /></a>
        </div>
      </header>

      {view === 'lessons' ? <LessonsView completed={completed} onToggle={toggleLesson} onOpenExperiment={loadExperiment} /> : <>
        <div className="lab-commandbar">
          <div className="experiment-path"><span>Лаборатория</span><ChevronRight size={14} /><strong>{experiment.name}</strong><small>{experiment.category}</small></div>
          <div className="run-actions">
            <button className="secondary-action clear-action" type="button" onClick={() => setClearOpen(true)}><Trash2 size={16} /><span>Очистить</span></button>
            <button className="secondary-action" type="button" onClick={() => loadExperiment(experimentId)} title="Вернуть исходную схему и код"><ListRestart size={16} /><span>Восстановить</span></button>
            <button className={`run-button ${status === 'running' ? 'is-running' : ''}`} type="button" onClick={run} disabled={status === 'compiling'}>
              {status === 'compiling' ? <LoaderCircle className="spin" size={17} /> : status === 'running' ? <Square size={15} /> : <Play size={17} />}
              {status === 'compiling' ? 'Компиляция…' : status === 'running' ? 'Остановить' : 'Запустить'}
            </button>
          </div>
        </div>

        <div className="mobile-panel-tabs" role="tablist" aria-label="Области лаборатории">
          <button role="tab" aria-selected={mobilePanel === 'parts'} className={mobilePanel === 'parts' ? 'active' : ''} onClick={() => setMobilePanel('parts')}><Plus size={16} />Детали</button>
          <button role="tab" aria-selected={mobilePanel === 'circuit'} className={mobilePanel === 'circuit' ? 'active' : ''} onClick={() => setMobilePanel('circuit')}><Cable size={16} />Схема</button>
          <button role="tab" aria-selected={mobilePanel === 'code'} className={mobilePanel === 'code' ? 'active' : ''} onClick={() => setMobilePanel('code')}><Code2 size={16} />Код</button>
        </div>

        <main className="lab-layout" id="main">
          <LayoutGroup desktop={desktop}>
          <LayoutPanel desktop={desktop} defaultSize="17%" minSize="150px" maxSize="28%" id="parts">
          <aside className={`parts-panel ${mobilePanel === 'parts' ? 'mobile-active' : ''}`} aria-label="Компоненты и эксперименты">
            <div className="side-tabs" role="tablist">
              <button role="tab" aria-selected={leftTab === 'components'} className={leftTab === 'components' ? 'active' : ''} onClick={() => setLeftTab('components')}>Детали</button>
              <button role="tab" aria-selected={leftTab === 'experiments'} className={leftTab === 'experiments' ? 'active' : ''} onClick={() => setLeftTab('experiments')}>Примеры</button>
            </div>
            <div className="parts-scroll">
              {leftTab === 'components' ? <>
                <p className="side-hint">Нажмите на деталь, чтобы установить её на свободное место макетки.</p>
                <div className="component-palette">
                  {(Object.keys(COMPONENT_DEFS) as ComponentKind[]).map((kind) => {
                    const Icon = COMPONENT_ICONS[kind]
                    return <button key={kind} type="button" onClick={() => addComponent(kind)}>
                      <Icon size={20} strokeWidth={1.7} /><span>{COMPONENT_DEFS[kind].name}</span><Plus size={13} />
                    </button>
                  })}
                </div>
                <div className="free-slots"><span>Посадочные места</span><strong>{circuit.components.length} / 6</strong><div>{SLOT_ROWS.map((row, index) => <i key={row} className={circuit.components.some((item) => item.slot === index) ? 'used' : ''} />)}</div></div>
              </> : <div className="experiment-list">
                {EXPERIMENTS.map((item) => <button key={item.id} className={item.id === experimentId ? 'active' : ''} type="button" onClick={() => loadExperiment(item.id)}>
                  <span>{item.level}</span><strong>{item.name}</strong><small>{item.category}</small><ChevronRight size={15} />
                </button>)}
              </div>}
            </div>

            <section className="inspector" aria-label="Инспектор выбранного элемента">
              {selectedComponent ? <>
                <div className="inspector-title"><span>Деталь</span><strong>{COMPONENT_DEFS[selectedComponent.kind].name}</strong></div>
                <p>{COMPONENT_DEFS[selectedComponent.kind].description}</p>
                <label className="select-control"><span>Посадочное место</span><select value={selectedComponent.slot} onChange={(event) => updateComponent(selectedComponent.id, { slot: Number(event.target.value) })}>{SLOT_ROWS.map((row, index) => {
                  const occupied = circuit.components.some((item) => item.slot === index && item.id !== selectedComponent.id)
                  return <option key={row} value={index} disabled={occupied}>Место {index + 1} · ряд {row}{occupied ? ' · занято' : ''}</option>
                })}</select></label>
                {COMPONENT_DEFS[selectedComponent.kind].valueLabel && <label className="value-control"><span>{COMPONENT_DEFS[selectedComponent.kind].valueLabel}<output>{selectedComponent.value} {COMPONENT_DEFS[selectedComponent.kind].unit}</output></span>
                  <input aria-label={COMPONENT_DEFS[selectedComponent.kind].valueLabel} type="range" min={COMPONENT_DEFS[selectedComponent.kind].min} max={COMPONENT_DEFS[selectedComponent.kind].max} step={COMPONENT_DEFS[selectedComponent.kind].step} value={selectedComponent.value} onChange={(event) => updateComponent(selectedComponent.id, { value: Number(event.target.value) })} />
                </label>}
                {COMPONENT_DEFS[selectedComponent.kind].secondaryValue && <label className="value-control"><span>{COMPONENT_DEFS[selectedComponent.kind].secondaryValue!.label}<output>{selectedComponent.secondaryValue ?? COMPONENT_DEFS[selectedComponent.kind].secondaryValue!.defaultValue} {COMPONENT_DEFS[selectedComponent.kind].secondaryValue!.unit}</output></span>
                  <input aria-label={COMPONENT_DEFS[selectedComponent.kind].secondaryValue!.label} type="range" min={COMPONENT_DEFS[selectedComponent.kind].secondaryValue!.min} max={COMPONENT_DEFS[selectedComponent.kind].secondaryValue!.max} step={COMPONENT_DEFS[selectedComponent.kind].secondaryValue!.step} value={selectedComponent.secondaryValue ?? COMPONENT_DEFS[selectedComponent.kind].secondaryValue!.defaultValue} onChange={(event) => updateComponent(selectedComponent.id, { secondaryValue: Number(event.target.value) })} />
                </label>}
                {selectedComponent.kind === 'led' && <label className="select-control"><span>Цвет свечения</span><select value={selectedComponent.color || 'red'} onChange={(event) => updateComponent(selectedComponent.id, { color: event.target.value })}><option value="red">Красный</option><option value="green">Зелёный</option><option value="yellow">Жёлтый</option><option value="blue">Синий</option></select></label>}
                {selectedComponent.kind === 'button' && <label className="button-hold-control"><input type="checkbox" checked={!!selectedComponent.pressed} onChange={(event) => updateComponent(selectedComponent.id, { pressed: event.target.checked })} /><span>Удерживать кнопку нажатой</span></label>}
                <div className="component-actions"><button className="duplicate-button" type="button" onClick={duplicateComponent}><Copy size={15} />Дублировать</button><button className="delete-button" type="button" onClick={deleteSelection}><Trash2 size={15} />Удалить</button></div>
              </> : selectedWire ? <>
                <div className="inspector-title"><span>Соединение</span><strong>{describeEndpoint(selectedWire.from, board)} → {describeEndpoint(selectedWire.to, board)}</strong></div>
                <p>Перетащите точку на проводе, чтобы изменить изгиб. Двойной щелчок по точке вернёт автоматическую форму.</p>
                <div className="wire-color-control"><span>Цвет провода</span><div>{WIRE_COLORS.map((color) => <button key={color} type="button" className={selectedWire.color === color ? 'active' : ''} style={{ '--swatch': color } as React.CSSProperties} aria-label={`Цвет провода ${color}`} onClick={() => setCircuit((current) => ({ ...current, wires: current.wires.map((wire) => wire.id === selectedWire.id ? { ...wire, color } : wire) }))} />)}</div></div>
                <div className="component-actions"><button className="duplicate-button" type="button" onClick={() => setCircuit((current) => ({ ...current, wires: current.wires.map((wire) => wire.id === selectedWire.id ? { ...wire, bend: undefined } : wire) }))}>Автоизгиб</button><button className="delete-button" type="button" onClick={deleteSelection}><Trash2 size={15} />Удалить</button></div>
              </> : <>
                <div className="inspector-title"><span>Проверка цепи</span><strong>{analysis.issues.length ? `${analysis.issues.length} подсказки` : 'Ошибок не найдено'}</strong></div>
                {analysis.issues.length ? <ul className="issue-list">{analysis.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : <p><Zap size={15} />Активных элементов: {analysis.poweredCount}. Соединяйте контакты и наблюдайте за результатом.</p>}
              </>}
            </section>
          </aside>
          </LayoutPanel>
          <LayoutHandle desktop={desktop} />
          <LayoutPanel desktop={desktop} defaultSize="52%" minSize="380px" id="circuit">

          <section className={`circuit-panel ${mobilePanel === 'circuit' ? 'mobile-active' : ''}`} aria-label="Редактор электрической схемы">
            <header className="circuit-toolbar">
              <div className={`simulation-state state-${status}`}><i />{status === 'running' ? `Выполняется · ${runningTime} с` : status === 'compiling' ? 'Компиляция Arduino CLI' : status === 'error' ? 'Ошибка в программе' : 'Симулятор остановлен'}</div>
              <div className="board-switch" role="group" aria-label="Выбор платы">
                {BOARD_IDS.map((id) => <button key={id} type="button" className={board === id ? 'active' : ''} aria-pressed={board === id} title={BOARDS[id].hint} onClick={() => selectBoard(id)}><Cpu size={13} />{BOARDS[id].shortName}</button>)}
              </div>
              <div className="wire-colors" aria-label="Цвет следующего провода">
                <button className={wireColor === 'auto' ? 'auto-color active' : 'auto-color'} onClick={() => setWireColor('auto')} type="button">Авто</button>
                {WIRE_COLORS.map((color) => <button key={color} type="button" className={wireColor === color ? 'active' : ''} style={{ '--swatch': color } as React.CSSProperties} aria-label={`Новый провод: ${color}`} onClick={() => setWireColor(color)} />)}
              </div>
              <div className="zoom-controls"><button type="button" onClick={() => { setZoom(1); document.querySelector('.circuit-stage')?.scrollTo({ left: 0, top: 0, behavior: 'smooth' }) }} aria-label="Показать всю схему" title="Показать всю схему"><Maximize2 size={14} /></button><button type="button" onClick={() => setZoom((value) => Math.max(0.8, value - 0.2))} aria-label="Уменьшить схему"><Minus size={15} /></button><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((value) => Math.min(2.2, value + 0.2))} aria-label="Увеличить схему"><Plus size={15} /></button></div>
            </header>
            <div className="circuit-stage">
              <div className="circuit-canvas-inner" style={{ width: `${zoom * 100}%` }}>
                <CircuitBoard circuit={circuit} analysis={analysis} snapshot={snapshot} board={board} draftEndpoint={draftEndpoint} selection={selection} running={status === 'running'} onEndpoint={handleEndpoint} onSelect={setSelection} onButtonPress={(id, pressed) => updateComponent(id, { pressed })} onWireBend={(id, bend) => setCircuit((current) => ({ ...current, wires: current.wires.map((wire) => wire.id === id ? { ...wire, bend } : wire) }))} />
              </div>
            </div>
            <div className="wire-assistant">
              <div><Cable size={16} /><span>{draftEndpoint ? `${describeEndpoint(draftEndpoint, board)} → выберите второй контакт` : 'Нажмите на два контакта или выберите их ниже'}</span>{draftEndpoint && <button type="button" onClick={() => setDraftEndpoint(null)} aria-label="Отменить соединение"><X size={14} /></button>}</div>
              <form onSubmit={(event) => { event.preventDefault(); if (connect(wireFrom, wireTo)) notify('Провод добавлен') }}>
                <select value={wireFrom} onChange={(event) => setWireFrom(event.target.value)} aria-label="Начало провода">
                  <optgroup label={boardSpec.name}>{BOARD_PINS.map((pin) => <option key={pin} value={pin}>{pinOptionLabel(board, pin)}</option>)}</optgroup>
                  <optgroup label="Ряды макетки">{Array.from({ length: 30 }, (_, index) => <option key={index} value={`b${index + 1}`}>Ряд {index + 1} · верхняя группа</option>)}</optgroup>
                  <optgroup label="Дорожки питания"><option value="+1">Плюсовая дорожка</option><option value="-1">Минусовая дорожка</option></optgroup>
                </select>
                <span>→</span>
                <select value={wireTo} onChange={(event) => setWireTo(event.target.value)} aria-label="Конец провода">
                  <optgroup label={boardSpec.name}>{BOARD_PINS.map((pin) => <option key={pin} value={pin}>{pinOptionLabel(board, pin)}</option>)}</optgroup>
                  <optgroup label="Ряды макетки">{Array.from({ length: 30 }, (_, index) => <option key={index} value={`b${index + 1}`}>Ряд {index + 1} · верхняя группа</option>)}</optgroup>
                  <optgroup label="Нижняя группа">{Array.from({ length: 30 }, (_, index) => <option key={index} value={`f${index + 1}`}>Ряд {index + 1} · нижняя группа</option>)}</optgroup>
                  <optgroup label="Дорожки питания"><option value="+1">Плюсовая дорожка</option><option value="-1">Минусовая дорожка</option></optgroup>
                </select>
                <button type="submit"><Plus size={15} />Соединить</button>
              </form>
            </div>
            <footer className="circuit-statusbar"><span><Activity size={14} />{circuit.components.length} деталей · {circuit.wires.length} проводов</span><span className={analysis.issues.length ? 'has-issues' : ''}>{analysis.issues.length ? analysis.issues[0] : 'Цепь готова к эксперименту'}</span></footer>
          </section>
          </LayoutPanel>
          <LayoutHandle desktop={desktop} />
          <LayoutPanel desktop={desktop} defaultSize="31%" minSize="300px" maxSize="55%" id="code">

          <aside className={`right-panel ${mobilePanel === 'code' ? 'mobile-active' : ''}`}>
            <CodePanel code={code} serial={serial} running={status === 'running'} resizable={desktop} board={board} boardName={boardSpec.name} chip={boardSpec.chip} onChange={setCode} onClearSerial={() => setSerial('')} onSendSerial={(text) => runnerRef.current?.sendSerial(`${text}\n`)} />
            <section className="experiment-brief">
              <span>Задание</span><p>{experiment.task}</p>
            </section>
          </aside>
          </LayoutPanel>
          </LayoutGroup>
        </main>
      </>}

      <dialog ref={helpDialog} className="app-dialog help-dialog" onCancel={() => setHelpOpen(false)} onClick={(event) => { if (event.target === helpDialog.current) setHelpOpen(false) }}>
        <button className="dialog-close" type="button" onClick={() => setHelpOpen(false)} aria-label="Закрыть справку"><X size={19} /></button>
        <span className="section-kicker">Быстрый старт</span><h2>Как устроена лаборатория</h2>
        <ol className="help-steps"><li><span>1</span><div><strong>Установите и настройте детали</strong><p>Добавьте компоненты на шесть посадочных мест. Выбранную деталь можно переместить или дублировать в инспекторе.</p></div></li><li><span>2</span><div><strong>Проложите провода</strong><p>Нажмите на два контакта. Наведите курсор на контакт или выберите провод, чтобы подсветить всю цепь. Перетащите квадратную точку на выбранном проводе для ручного изгиба; двойной щелчок вернёт автоформу.</p></div></li><li><span>3</span><div><strong>Напишите программу</strong><p>Используйте digitalWrite(), analogRead(), Serial, библиотеки Servo и DHT. Готовый пример DS18B20 показывает прямой обмен 1-Wire без внешних библиотек.</p></div></li><li><span>4</span><div><strong>Запустите и меняйте условия</strong><p>Во время работы нажимайте кнопку и двигайте ползунки датчиков в инспекторе. Схему можно пересобирать без остановки.</p></div></li></ol>
        <div className="help-note"><Zap size={18} /><p>Эмулируется ATmega328P и его периферия. Аналоговая часть упрощена: полноценный расчёт токов и аналоговых паразитных эффектов не выполняется.</p></div>
        <div className="help-note"><Cpu size={18} /><p>Переключатель платы над схемой: Arduino Uno R3 или ESP32 DevKit V1. В режиме ESP32 примеры используют ledcWrite() и библиотеку ESP32Servo — при запуске они автоматически адаптируются к эмулируемому ядру. Датчики выдают 0–3.3 В, входы VP, VN и D32–D35 в коде остаются A0–A5 (значения 0–1023).</p></div>
        <button className="run-button" type="button" onClick={() => setHelpOpen(false)}>Понятно, к схеме</button>
      </dialog>

      <dialog ref={clearDialog} className="app-dialog confirm-dialog" onCancel={() => setClearOpen(false)}>
        <button className="dialog-close" type="button" onClick={() => setClearOpen(false)} aria-label="Закрыть"><X size={19} /></button>
        <h2>Очистить макетку?</h2><p>Все детали и провода будут удалены. Код программы останется в редакторе.</p>
        <div><button className="secondary-action" type="button" onClick={() => setClearOpen(false)}>Отмена</button><button className="danger-button" type="button" onClick={clearCircuit}>Очистить схему</button></div>
      </dialog>

      <div className={`toast ${toast ? 'visible' : ''}`} role="status" aria-live="polite">{toast}</div>
    </div>
  )
}
