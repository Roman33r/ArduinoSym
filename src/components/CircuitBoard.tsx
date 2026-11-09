import { useId, useMemo, useState } from 'react'
import {
  BOARD_PINS,
  COLUMN_LETTERS,
  COMPONENT_DEFS,
  componentHoles,
  endpointPoint,
  getNetEndpoints,
  pinNumber,
} from '../lib/circuit'
import type {
  CircuitAnalysis,
  CircuitComponent,
  CircuitState,
  RunnerSnapshot,
  Wire,
} from '../types/circuit'

export type Selection = { type: 'component' | 'wire'; id: string } | null

interface CircuitBoardProps {
  circuit: CircuitState
  analysis: CircuitAnalysis
  snapshot: RunnerSnapshot
  draftEndpoint: string | null
  selection: Selection
  running: boolean
  onEndpoint: (endpoint: string) => void
  onSelect: (selection: Selection) => void
  onButtonPress: (id: string, pressed: boolean) => void
  onWireBend: (id: string, bend?: { x: number; y: number }) => void
}

function wirePath(from: string, to: string, bend?: { x: number; y: number }) {
  const start = endpointPoint(from)
  const end = endpointPoint(to)
  if (bend) return `M ${start.x} ${start.y} Q ${bend.x} ${bend.y}, ${end.x} ${end.y}`
  const distance = Math.max(45, Math.abs(end.x - start.x) * 0.42)
  return `M ${start.x} ${start.y} C ${start.x + distance} ${start.y - 22}, ${end.x - distance} ${end.y - 22}, ${end.x} ${end.y}`
}

function wireHandlePoint(wire: Wire) {
  if (wire.bend) return wire.bend
  const start = endpointPoint(wire.from)
  const end = endpointPoint(wire.to)
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - 33 }
}

function ComponentVisual({
  component,
  analysis,
  snapshot,
  selected,
  onSelect,
  onButtonPress,
}: {
  component: CircuitComponent
  analysis: CircuitAnalysis
  snapshot: RunnerSnapshot
  selected: boolean
  onSelect: () => void
  onButtonPress: (pressed: boolean) => void
}) {
  const holes = componentHoles(component)
  const points = holes.map(endpointPoint)
  const centerX = (points[0].x + points[points.length - 1].x) / 2
  const width = Math.max(42, points[points.length - 1].x - points[0].x + 25)
  const definition = COMPONENT_DEFS[component.kind]
  const ledLevel = analysis.ledLevels[component.id] ?? 0
  const rgb = analysis.rgbLevels[component.id] ?? [0, 0, 0]
  const buzzerLevel = analysis.buzzerLevels[component.id] ?? 0
  const servoAngle = snapshot.servoAngles[component.id] ?? 0
  const color = component.color === 'green' ? '#55b978' : component.color === 'yellow' ? '#f0bf43' : component.color === 'blue' ? '#5596e6' : '#ee6750'
  const rgbColor = `rgb(${Math.round(45 + rgb[0] * 210)}, ${Math.round(45 + rgb[1] * 210)}, ${Math.round(45 + rgb[2] * 210)})`

  return (
    <g
      className={`placed-component component-${component.kind} ${selected ? 'is-selected' : ''} ${component.pressed ? 'is-pressed' : ''}`}
      onClick={(event) => { event.stopPropagation(); onSelect() }}
      onPointerDown={(event) => {
        if (component.kind === 'button') {
          event.stopPropagation()
          event.currentTarget.setPointerCapture(event.pointerId)
          onButtonPress(true)
        }
      }}
      onPointerUp={() => { if (component.kind === 'button') onButtonPress(false) }}
      onPointerCancel={() => { if (component.kind === 'button') onButtonPress(false) }}
      data-component={component.id}
    >
      {selected && <rect className="component-selection" x={centerX - width / 2 - 5} y={172} width={width + 10} height={61} rx={7} />}
      <rect className="component-hit-area" x={centerX - width / 2 - 4} y={171} width={width + 8} height={66} rx={6} />

      {component.kind === 'led' && <>
        {ledLevel > 0.01 && <circle cx={centerX} cy={192} r={23} fill={color} opacity={ledLevel * 0.2} filter="url(#soft-glow)" />}
        <path d={`M ${points[0].x} 216 V ${points[0].y} M ${points[1].x} 211 V ${points[1].y}`} className="component-leg" />
        <path d={`M ${centerX - 13} 207 Q ${centerX - 14} 177 ${centerX} 176 Q ${centerX + 14} 177 ${centerX + 13} 207 Z`} fill={ledLevel > 0.01 ? color : '#71807c'} opacity={0.45 + ledLevel * 0.55} className="led-dome" />
        <path d={`M ${centerX - 13} 207 H ${centerX + 13}`} stroke="#394b4d" strokeWidth="3" />
        <text x={centerX} y={168} className="component-value">{ledLevel > 0.01 ? `${Math.round(ledLevel * 100)}%` : 'OFF'}</text>
      </>}

      {component.kind === 'resistor' && <>
        <path d={`M ${points[0].x} 196 V ${points[0].y} M ${points[1].x} 196 V ${points[1].y}`} className="component-leg" />
        <path d={`M ${points[0].x} 196 H ${points[1].x}`} className="component-leg" />
        <rect x={centerX - 20} y={188} width={40} height={15} rx={7} fill="#d9b985" stroke="#7f6647" strokeWidth="1" />
        <path d={`M ${centerX - 10} 189 V 202 M ${centerX - 3} 189 V 202 M ${centerX + 6} 189 V 202`} stroke="#8b4130" strokeWidth="3" />
        <path d={`M ${centerX + 13} 189 V 202`} stroke="#c29b35" strokeWidth="2" />
        <text x={centerX} y={180} className="component-value">{component.value} Ω</text>
      </>}

      {component.kind === 'button' && <>
        <path d={`M ${points[0].x} 212 V ${points[0].y} M ${points[1].x} 212 V ${points[1].y}`} className="component-leg" />
        <rect x={centerX - 22} y={187} width={44} height={29} rx={5} fill="#3e4d51" stroke="#1e3034" strokeWidth="2" />
        <rect x={centerX - 12} y={component.pressed ? 185 : 176} width={24} height={component.pressed ? 10 : 18} rx={4} fill={component.pressed ? '#d39c39' : '#edf0e9'} stroke="#77827d" />
        <text x={centerX} y={168} className="component-value">{component.pressed ? 'НАЖАТА' : 'НАЖМИТЕ'}</text>
      </>}

      {(component.kind === 'potentiometer' || component.kind === 'light' || component.kind === 'temperature') && <>
        {points.map((point) => <path key={point.x} d={`M ${point.x} 207 V ${point.y}`} className="component-leg" />)}
        <rect x={centerX - width / 2} y={174} width={width} height={39} rx={5} fill={component.kind === 'potentiometer' ? '#477e94' : component.kind === 'light' ? '#d6a446' : '#c86b4e'} stroke="#294a54" strokeWidth="1.5" />
        {component.kind === 'potentiometer' && <g transform={`rotate(${component.value * 2.7 - 135} ${centerX} 193)`}>
          <circle cx={centerX} cy={193} r={13} fill="#e6e8df" stroke="#263e47" strokeWidth="2" />
          <path d={`M ${centerX} 193 V 183`} stroke="#263e47" strokeWidth="2.5" />
        </g>}
        {component.kind === 'light' && <>
          <circle cx={centerX} cy={193} r={10} fill="#fff2b9" stroke="#6f5325" />
          <path d={`M ${centerX - 7} 188 Q ${centerX} 198 ${centerX + 7} 188 M ${centerX - 7} 194 Q ${centerX} 204 ${centerX + 7} 194`} fill="none" stroke="#9c762c" strokeWidth="1" />
        </>}
        {component.kind === 'temperature' && <text x={centerX} y={198} textAnchor="middle" className="sensor-reading light">{component.value}°</text>}
        <text x={centerX} y={168} className="component-value">{definition.shortName} · {component.value}{definition.unit}</text>
      </>}

      {component.kind === 'ultrasonic' && <>
        {points.map((point) => <path key={point.x} d={`M ${point.x} 208 V ${point.y}`} className="component-leg" />)}
        <rect x={centerX - width / 2} y={176} width={width} height={37} rx={4} fill="#3b8790" stroke="#24545c" strokeWidth="1.5" />
        <circle cx={centerX - 15} cy={194} r={12} fill="#c4d0cb" stroke="#344e52" strokeWidth="2" />
        <circle cx={centerX + 15} cy={194} r={12} fill="#c4d0cb" stroke="#344e52" strokeWidth="2" />
        <circle cx={centerX - 15} cy={194} r={7} fill="#819795" />
        <circle cx={centerX + 15} cy={194} r={7} fill="#819795" />
        <text x={centerX} y={168} className="component-value">{component.value} см</text>
      </>}

      {component.kind === 'buzzer' && <>
        <path d={`M ${points[0].x} 206 V ${points[0].y} M ${points[1].x} 206 V ${points[1].y}`} className="component-leg" />
        <ellipse cx={centerX} cy={194} rx={22} ry={18} fill="#344348" stroke="#172b31" strokeWidth="2" />
        <circle cx={centerX} cy={194} r={5} fill="#111f23" />
        {buzzerLevel > 0.01 && <g className="sound-waves" fill="none" stroke="#d59b32" strokeWidth="2" strokeLinecap="round">
          <path d={`M ${centerX - 29} 184 Q ${centerX - 36} 194 ${centerX - 29} 204`} />
          <path d={`M ${centerX + 29} 184 Q ${centerX + 36} 194 ${centerX + 29} 204`} />
        </g>}
        <text x={centerX} y={168} className="component-value">{buzzerLevel > 0.01 ? 'ЗВУК' : 'ТИШЕ'}</text>
      </>}

      {component.kind === 'rgb' && <>
        {points.map((point) => <path key={point.x} d={`M ${point.x} 207 V ${point.y}`} className="component-leg" />)}
        {(rgb.some((level) => level > 0.01)) && <circle cx={centerX} cy={191} r={25} fill={rgbColor} opacity="0.22" filter="url(#soft-glow)" />}
        <path d={`M ${centerX - 16} 207 Q ${centerX - 17} 176 ${centerX} 175 Q ${centerX + 17} 176 ${centerX + 16} 207 Z`} fill={rgbColor} stroke="#52615e" strokeWidth="1.5" />
        <text x={centerX} y={168} className="component-value">RGB</text>
      </>}

      {component.kind === 'servo' && <>
        {points.map((point) => <path key={point.x} d={`M ${point.x} 207 V ${point.y}`} className="component-leg" />)}
        <rect x={centerX - width / 2} y={178} width={width} height={35} rx={4} fill="#397ca0" stroke="#234d63" strokeWidth="1.5" />
        <circle cx={centerX} cy={190} r={9} fill="#e5e7dd" stroke="#264652" />
        <g transform={`rotate(${servoAngle - 90} ${centerX} 190)`}>
          <rect x={centerX - 4} y={171} width={8} height={29} rx={4} fill="#f1f0e6" stroke="#65726c" />
          <circle cx={centerX} cy={190} r={3} fill="#4b5a59" />
        </g>
        <text x={centerX} y={168} className="component-value">{servoAngle}°</text>
      </>}

      {component.kind === 'dht22' && <>
        {points.map((point) => <path key={point.x} d={`M ${point.x} 210 V ${point.y}`} className="component-leg" />)}
        <rect x={centerX - width / 2} y={174} width={width} height={40} rx={4} fill="#e8eee8" stroke="#467681" strokeWidth="1.5" />
        <rect x={centerX - width / 2} y={174} width={width} height={9} rx={4} fill="#478a9a" />
        {[-15, -9, -3, 3, 9, 15].map((offset) => <path key={offset} d={`M ${centerX + offset} 188 V 207`} stroke="#9aaba8" strokeWidth="2" />)}
        <text x={centerX} y={168} className="component-value">DHT22 · {component.value}°C / {component.secondaryValue ?? 55}%</text>
      </>}

      {component.kind === 'ds18b20' && <>
        {points.map((point) => <path key={point.x} d={`M ${point.x} 204 V ${point.y}`} className="component-leg" />)}
        <path d={`M ${centerX - 18} 205 V 190 Q ${centerX - 18} 174 ${centerX} 174 Q ${centerX + 18} 174 ${centerX + 18} 190 V 205 Z`} fill="#33454b" stroke="#172c33" strokeWidth="1.5" />
        <text x={centerX} y={194} textAnchor="middle" className="sensor-reading light">1-WIRE</text>
        <text x={centerX} y={168} className="component-value">DS18B20 · {component.value}°C</text>
      </>}

      {points.map((point, index) => <text key={`${point.x}-label`} x={point.x} y={229} textAnchor="middle" className="terminal-label">{definition.terminals[index]}</text>)}
    </g>
  )
}

export default function CircuitBoard({
  circuit,
  analysis,
  snapshot,
  draftEndpoint,
  selection,
  running,
  onEndpoint,
  onSelect,
  onButtonPress,
  onWireBend,
}: CircuitBoardProps) {
  const [pointer, setPointer] = useState({ x: 0, y: 0 })
  const [hoveredEndpoint, setHoveredEndpoint] = useState<string | null>(null)
  const [draggingWire, setDraggingWire] = useState<string | null>(null)
  const rawId = useId()
  const svgId = rawId.replace(/:/g, '')
  const holes = useMemo(() => {
    const result: string[] = []
    for (let row = 1; row <= 30; row += 1) {
      COLUMN_LETTERS.forEach((column) => result.push(`${column}${row}`))
      result.push(`+${row}`, `-${row}`)
    }
    return result
  }, [])
  const selectedWire = selection?.type === 'wire' ? circuit.wires.find((wire) => wire.id === selection.id) : undefined
  const netEndpoint = hoveredEndpoint ?? selectedWire?.from ?? null
  const highlightedNet = useMemo(() => netEndpoint ? getNetEndpoints(circuit, netEndpoint) : null, [circuit, netEndpoint])
  const draftPath = draftEndpoint ? wirePath(draftEndpoint, `pointer-${svgId}`) : ''
  const actualDraftPath = draftEndpoint ? (() => {
    const start = endpointPoint(draftEndpoint)
    const distance = Math.max(40, Math.abs(pointer.x - start.x) * 0.4)
    return `M ${start.x} ${start.y} C ${start.x + distance} ${start.y - 20}, ${pointer.x - distance} ${pointer.y - 20}, ${pointer.x} ${pointer.y}`
  })() : ''
  void draftPath

  return (
    <svg
      className="circuit-svg"
      viewBox="0 0 1000 570"
      role="group"
      aria-label="Arduino Uno и макетная плата. Выберите два контакта, чтобы соединить их проводом."
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        const point = { x: (event.clientX - rect.left) / rect.width * 1000, y: (event.clientY - rect.top) / rect.height * 570 }
        setPointer(point)
        if (draggingWire) onWireBend(draggingWire, point)
      }}
      onPointerUp={() => setDraggingWire(null)}
      onPointerCancel={() => setDraggingWire(null)}
      onClick={() => onSelect(null)}
    >
      <defs>
        <filter id="soft-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="7" /></filter>
        <linearGradient id="uno-body" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#16878a" /><stop offset="1" stopColor="#0d686e" /></linearGradient>
        <pattern id="bench-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="#d8ded6" strokeWidth="0.55" /></pattern>
      </defs>
      <rect width="1000" height="570" rx="14" fill="#eef0e9" />
      <rect width="1000" height="570" rx="14" fill="url(#bench-grid)" />

      <g className="arduino-board">
        <rect x="47" y="139" width="330" height="380" rx="17" fill="#b8c3ba" opacity="0.35" />
        <path d="M40 145 Q40 130 55 130 H355 Q370 130 370 145 V495 Q370 510 355 510 H55 Q40 510 40 495 Z" fill="url(#uno-body)" stroke="#155d61" strokeWidth="2" />
        <rect x="22" y="226" width="54" height="103" rx="6" fill="#aebfc0" stroke="#6e8386" strokeWidth="2" />
        <rect x="22" y="235" width="47" height="84" rx="3" fill="#d8e0dc" />
        <rect x="22" y="244" width="16" height="65" fill="#85999c" />
        <rect x="48" y="359" width="39" height="76" rx="5" fill="#263b42" />
        <rect x="58" y="369" width="20" height="56" fill="#53666a" />
        <rect x="137" y="251" width="134" height="54" rx="6" fill="#20353b" />
        {Array.from({ length: 9 }, (_, index) => <rect key={index} x={146 + index * 14} y={243} width={7} height={8} fill="#94a7a4" />)}
        <text x="204" y="283" textAnchor="middle" fill="#7f9998" fontSize="12" fontFamily="IBM Plex Mono, monospace">ATMEGA328P</text>
        <rect x="61" y="113" width="231" height="27" rx="4" fill="#20373c" />
        <rect x="61" y="500" width="289" height="20" rx="3" fill="#20373c" />
        <circle cx="61" cy="157" r="7" fill="#d7e4d9" stroke="#819a91" />
        <circle cx="347" cy="483" r="7" fill="#d7e4d9" stroke="#819a91" />
        <text x="213" y="385" textAnchor="middle" fill="#c3e4d7" fontSize="25" fontWeight="700">ARDUINO</text>
        <text x="213" y="407" textAnchor="middle" fill="#9dc9bc" fontSize="13" letterSpacing="4">UNO R3</text>
        <text x="213" y="434" textAnchor="middle" fill="#9dc9bc" fontSize="9" fontFamily="IBM Plex Mono, monospace">16 MHz · ATmega328P</text>
        <rect x="297" y="331" width="41" height="25" rx="5" fill="#d2d8cc" stroke="#75877f" />
        <text x="317" y="348" textAnchor="middle" fontSize="9" fill="#435b56">RESET</text>
        <circle cx="320" cy="181" r="5" fill={snapshot.pins.duties[13] > 0.01 ? '#f2c74d' : '#5c786d'} className={snapshot.pins.duties[13] > 0.01 ? 'pin-active-glow' : ''} />
        <text x="331" y="185" fill="#c3e4d7" fontSize="10">L</text>
        <circle cx="103" cy="468" r="5" fill={running ? '#75d69a' : '#668177'} />
        <text x="114" y="472" fill="#c3e4d7" fontSize="9">ON</text>
      </g>

      <g className="breadboard">
        <rect x="447" y="99" width="570" height="470" rx="17" fill="#b9beb4" opacity="0.35" />
        <rect x="440" y="90" width="570" height="470" rx="17" fill="#f6f3e9" stroke="#c9c9ba" strokeWidth="2" />
        <path d="M461 139 H989 M461 202 H989 M461 369 H989 M461 531 H989" stroke="#d8d5c9" strokeWidth="1" />
        <path d="M466 142 H984" stroke="#d96955" strokeWidth="2" />
        <path d="M466 172 H984" stroke="#5b7f9b" strokeWidth="2" />
        <rect x="462" y="353" width="526" height="16" rx="3" fill="#e4e1d6" />
        <text x="455" y="151" className="rail-label">+</text>
        <text x="455" y="181" className="rail-label">−</text>
        {Array.from({ length: 30 }, (_, index) => (index + 1) % 5 === 0 && <text key={index} x={485 + index * 15.3} y={222} textAnchor="middle" className="row-number">{index + 1}</text>)}
        {COLUMN_LETTERS.map((letter, index) => <text key={letter} x={467} y={244 + index * 27 + (index >= 5 ? 42 : 0)} className="column-label">{letter}</text>)}
        {holes.map((hole) => {
          const point = endpointPoint(hole)
          const active = draftEndpoint === hole
          return <g key={hole} className={`bread-hole ${active ? 'is-draft' : ''} ${highlightedNet?.has(hole) ? 'is-net-highlight' : ''}`} onMouseEnter={() => setHoveredEndpoint(hole)} onMouseLeave={() => setHoveredEndpoint(null)} onClick={(event) => { event.stopPropagation(); onEndpoint(hole) }}>
            <circle cx={point.x} cy={point.y} r="7" fill="transparent" />
            <circle cx={point.x} cy={point.y} r={active ? 4.2 : 2.5} className="hole-inner" />
          </g>
        })}
      </g>

      <g className="wires-layer">
        {circuit.wires.map((wire: Wire) => {
          const selected = selection?.type === 'wire' && selection.id === wire.id
          const highlighted = highlightedNet?.has(wire.from) || highlightedNet?.has(wire.to)
          const handle = wireHandlePoint(wire)
          return <g key={wire.id} className={`wire ${selected ? 'is-selected' : ''} ${highlighted ? 'is-net-highlight' : ''}`} onMouseEnter={() => setHoveredEndpoint(wire.from)} onMouseLeave={() => setHoveredEndpoint(null)} onClick={(event) => { event.stopPropagation(); onSelect({ type: 'wire', id: wire.id }) }}>
            <path d={wirePath(wire.from, wire.to, wire.bend)} fill="none" stroke="transparent" strokeWidth="15" />
            <path d={wirePath(wire.from, wire.to, wire.bend)} fill="none" stroke="#263b42" strokeOpacity="0.16" strokeWidth="7" transform="translate(0 2)" />
            <path d={wirePath(wire.from, wire.to, wire.bend)} fill="none" stroke={wire.color} strokeWidth={selected ? 6 : 4.5} strokeLinecap="round" />
            {selected && <g className="wire-bend-handle" onPointerDown={(event) => {
              event.stopPropagation()
              event.currentTarget.setPointerCapture(event.pointerId)
              setDraggingWire(wire.id)
            }} onDoubleClick={(event) => { event.stopPropagation(); onWireBend(wire.id, undefined) }}>
              <circle cx={handle.x} cy={handle.y} r="10" fill="transparent" />
              <rect x={handle.x - 4.5} y={handle.y - 4.5} width="9" height="9" rx="2" />
            </g>}
          </g>
        })}
        {draftEndpoint && <path d={actualDraftPath} fill="none" stroke="#d89f32" strokeWidth="4" strokeDasharray="7 6" strokeLinecap="round" pointerEvents="none" />}
      </g>

      <g className="components-layer">
        {circuit.components.map((component) => <ComponentVisual
          key={component.id}
          component={component}
          analysis={analysis}
          snapshot={snapshot}
          selected={selection?.type === 'component' && selection.id === component.id}
          onSelect={() => onSelect({ type: 'component', id: component.id })}
          onButtonPress={(pressed) => onButtonPress(component.id, pressed)}
        />)}
      </g>

      <g className="board-pins-layer">
        {BOARD_PINS.map((pin) => {
          const point = endpointPoint(pin)
          const number = pinNumber(pin)
          const active = number !== null && snapshot.pins.duties[number] > 0.05
          const draft = draftEndpoint === pin
          return <g key={pin} className={`board-pin ${active ? 'is-active' : ''} ${draft ? 'is-draft' : ''} ${highlightedNet?.has(pin) ? 'is-net-highlight' : ''}`} onMouseEnter={() => setHoveredEndpoint(pin)} onMouseLeave={() => setHoveredEndpoint(null)} onClick={(event) => { event.stopPropagation(); onEndpoint(pin) }}>
            <circle cx={point.x} cy={point.y} r="10" fill="transparent" />
            <circle cx={point.x} cy={point.y} r={draft ? 6 : 4.5} className="pin-socket" />
            <text x={point.x} y={point.y + (pin.startsWith('D') ? -20 : 23)} textAnchor="middle" className="pin-label">{pin}</text>
          </g>
        })}
      </g>

      <g className="scene-caption">
        <text x="43" y="548">ARDUINO UNO</text>
        <text x="442" y="548">МОНТАЖНАЯ ПЛАТА · 30 РЯДОВ</text>
        <text x="989" y="548" textAnchor="end">{circuit.wires.length} ПРОВОДОВ</text>
      </g>
    </svg>
  )
}
