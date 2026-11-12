import { describeBoardPin, getBoardPinPoint, type BoardId } from './boards'
import type {
  BoardPin,
  CircuitAnalysis,
  CircuitComponent,
  CircuitState,
  ComponentDefinition,
  ComponentKind,
  Endpoint,
  RunnerSnapshot,
} from '../types/circuit'

export const SLOT_ROWS = [2, 7, 12, 17, 22, 27]
export const COLUMN_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
export const WIRE_COLORS = ['#df5b45', '#253b42', '#e5a73c', '#167f82', '#4878c8', '#8d62a9']

export const COMPONENT_DEFS: Record<ComponentKind, ComponentDefinition> = {
  led: { kind: 'led', name: 'Светодиод', shortName: 'LED', description: 'Анод (+) подключают через резистор, катод (−) — к GND.', terminals: ['A', 'K'], defaultValue: 100, min: 10, max: 100, step: 5, unit: '%' },
  resistor: { kind: 'resistor', name: 'Резистор', shortName: 'R', description: 'Ограничивает ток. Для светодиода подойдут 220–330 Ом.', terminals: ['1', '2'], defaultValue: 220, min: 100, max: 1000, step: 10, unit: 'Ом', valueLabel: 'Сопротивление' },
  button: { kind: 'button', name: 'Кнопка', shortName: 'BTN', description: 'Замыкает два контакта при нажатии. Используйте INPUT_PULLUP.', terminals: ['1', '2'], defaultValue: 0, min: 0, max: 1, step: 1, unit: '' },
  potentiometer: { kind: 'potentiometer', name: 'Потенциометр', shortName: 'POT', description: 'Делитель напряжения: VCC, сигнальный выход и GND.', terminals: ['VCC', 'OUT', 'GND'], defaultValue: 50, min: 0, max: 100, step: 1, unit: '%', valueLabel: 'Поворот ручки' },
  light: { kind: 'light', name: 'Датчик света', shortName: 'LDR', description: 'Аналоговый модуль освещённости с выходом 0–5 В.', terminals: ['VCC', 'OUT', 'GND'], defaultValue: 65, min: 0, max: 100, step: 1, unit: '%', valueLabel: 'Освещённость' },
  temperature: { kind: 'temperature', name: 'Датчик температуры', shortName: 'TMP36', description: 'Аналоговый TMP36: 10 мВ на °C и смещение 500 мВ.', terminals: ['VCC', 'OUT', 'GND'], defaultValue: 24, min: -40, max: 125, step: 1, unit: '°C', valueLabel: 'Температура' },
  ultrasonic: { kind: 'ultrasonic', name: 'Дальномер HC-SR04', shortName: 'HC-SR04', description: 'TRIG принимает импульс, ECHO возвращает время прохождения звука.', terminals: ['VCC', 'TRIG', 'ECHO', 'GND'], defaultValue: 80, min: 2, max: 300, step: 1, unit: 'см', valueLabel: 'Расстояние' },
  buzzer: { kind: 'buzzer', name: 'Активный зуммер', shortName: 'BUZ', description: 'Издаёт звук, когда на «+» подан высокий уровень.', terminals: ['+', '−'], defaultValue: 100, min: 10, max: 100, step: 5, unit: '%', valueLabel: 'Громкость' },
  rgb: { kind: 'rgb', name: 'RGB-светодиод', shortName: 'RGB', description: 'Общий катод. Каждый цветовой канал требует свой резистор.', terminals: ['R', 'G', 'B', 'C'], defaultValue: 100, min: 10, max: 100, step: 5, unit: '%' },
  servo: { kind: 'servo', name: 'Сервопривод', shortName: 'SERVO', description: 'Библиотека Servo управляет углом импульсами на сигнальном входе.', terminals: ['VCC', 'GND', 'SIG'], defaultValue: 90, min: 0, max: 180, step: 1, unit: '°' },
  dht22: {
    kind: 'dht22', name: 'DHT22 · температура и влажность', shortName: 'DHT22',
    description: 'Цифровой датчик с однопроводным протоколом. Модуль содержит подтяжку DATA.', terminals: ['VCC', 'DATA', 'NC', 'GND'],
    defaultValue: 22, min: -40, max: 80, step: 0.1, unit: '°C', valueLabel: 'Температура',
    secondaryValue: { label: 'Влажность', defaultValue: 55, min: 0, max: 100, step: 1, unit: '%' },
  },
  ds18b20: { kind: 'ds18b20', name: 'DS18B20 · 1-Wire', shortName: 'DS18B20', description: 'Цифровой термометр 1-Wire со scratchpad и CRC. Модуль содержит подтяжку DATA.', terminals: ['VCC', 'DATA', 'GND'], defaultValue: 24, min: -55, max: 125, step: 0.1, unit: '°C', valueLabel: 'Температура' },
}

export const EMPTY_SNAPSHOT: RunnerSnapshot = {
  pins: { levels: Array(20).fill(false), modes: Array(20).fill('input'), duties: Array(20).fill(0) },
  servoAngles: {},
  cycles: 0,
  serial: '',
}

export function makeComponent(kind: ComponentKind, slot: number, id = `${kind}-${Date.now()}`): CircuitComponent {
  const definition = COMPONENT_DEFS[kind]
  return {
    id,
    kind,
    slot,
    value: definition.defaultValue,
    ...(definition.secondaryValue ? { secondaryValue: definition.secondaryValue.defaultValue } : {}),
  }
}

export function componentHoles(component: CircuitComponent): string[] {
  const row = SLOT_ROWS[component.slot] ?? SLOT_ROWS[0]
  return COMPONENT_DEFS[component.kind].terminals.map((_, index) => `a${row + index}`)
}

export function holePoint(id: string): { x: number; y: number } {
  if (/^[+-]\d+$/.test(id)) {
    const row = Number(id.slice(1))
    return { x: 485 + (row - 1) * 15.3, y: id[0] === '+' ? 150 : 180 }
  }
  const match = id.match(/^([a-j])(\d+)$/)
  if (!match) return boardPinPoint(id)
  const column = COLUMN_LETTERS.indexOf(match[1])
  const row = Number(match[2])
  const bankOffset = column >= 5 ? 42 : 0
  return { x: 485 + (row - 1) * 15.3, y: 240 + column * 27 + bankOffset }
}

export function boardPinPoint(id: string, board: BoardId = 'uno'): { x: number; y: number } {
  return getBoardPinPoint(board, id) ?? { x: 60, y: 130 }
}

export function endpointPoint(id: string, board: BoardId = 'uno') {
  return /^[+-]\d+$/.test(id) || /^[a-j]\d+$/.test(id) ? holePoint(id) : boardPinPoint(id, board)
}

export function pinNumber(id: string): number | null {
  if (/^D(?:[0-9]|1[0-3])$/.test(id)) return Number(id.slice(1))
  if (/^A[0-5]$/.test(id)) return 14 + Number(id.slice(1))
  return null
}

export function pinName(pin: number): string {
  return pin >= 14 ? `A${pin - 14}` : `D${pin}`
}

class DisjointSet {
  private parent = new Map<string, string>()

  add(item: string) {
    if (!this.parent.has(item)) this.parent.set(item, item)
  }

  find(item: string): string {
    this.add(item)
    const parent = this.parent.get(item)!
    if (parent !== item) this.parent.set(item, this.find(parent))
    return this.parent.get(item)!
  }

  union(a: string, b: string) {
    const rootA = this.find(a)
    const rootB = this.find(b)
    if (rootA !== rootB) this.parent.set(rootB, rootA)
  }
}

function allEndpoints(state: CircuitState): string[] {
  const endpoints = ['5V', '3V3', 'GND', 'VIN', 'RESET']
  for (let pin = 0; pin <= 13; pin += 1) endpoints.push(`D${pin}`)
  for (let pin = 0; pin <= 5; pin += 1) endpoints.push(`A${pin}`)
  for (let row = 1; row <= 30; row += 1) {
    for (const column of COLUMN_LETTERS) endpoints.push(`${column}${row}`)
    endpoints.push(`+${row}`, `-${row}`)
  }
  state.wires.forEach((wire) => endpoints.push(wire.from, wire.to))
  return endpoints
}

function buildNets(state: CircuitState) {
  const dsu = new DisjointSet()
  allEndpoints(state).forEach((endpoint) => dsu.add(endpoint))
  for (let row = 1; row <= 30; row += 1) {
    for (const bank of [['a', 'b', 'c', 'd', 'e'], ['f', 'g', 'h', 'i', 'j']]) {
      for (let index = 1; index < bank.length; index += 1) dsu.union(`${bank[0]}${row}`, `${bank[index]}${row}`)
    }
    if (row > 1) {
      dsu.union('+1', `+${row}`)
      dsu.union('-1', `-${row}`)
    }
  }
  state.wires.forEach((wire) => dsu.union(wire.from, wire.to))
  state.components.forEach((component) => {
    if (component.kind === 'button' && component.pressed) {
      const [first, second] = componentHoles(component)
      dsu.union(first, second)
    }
  })
  return dsu
}

export function getNetEndpoints(state: CircuitState, endpoint: string): Set<string> {
  const dsu = buildNets(state)
  const root = dsu.find(endpoint)
  return new Set(allEndpoints(state).filter((item) => dsu.find(item) === root))
}

function buildResistorGraph(state: CircuitState, dsu: DisjointSet) {
  const graph = new Map<string, Array<{ net: string; value: number }>>()
  state.components.filter((component) => component.kind === 'resistor').forEach((component) => {
    const [a, b] = componentHoles(component).map((hole) => dsu.find(hole))
    if (!graph.has(a)) graph.set(a, [])
    if (!graph.has(b)) graph.set(b, [])
    graph.get(a)!.push({ net: b, value: component.value })
    graph.get(b)!.push({ net: a, value: component.value })
  })
  return graph
}

function resistanceToTargets(start: string, targets: Set<string>, graph: Map<string, Array<{ net: string; value: number }>>): number {
  if (targets.has(start)) return 0
  const queue = [start]
  const visited = new Set([start])
  while (queue.length) {
    const current = queue.shift()!
    for (const edge of graph.get(current) ?? []) {
      if (visited.has(edge.net)) continue
      if (targets.has(edge.net)) return edge.value
      visited.add(edge.net)
      queue.push(edge.net)
    }
  }
  return Number.POSITIVE_INFINITY
}

function boardPinForNet(root: string, dsu: DisjointSet, allowAnalog = true): number | null {
  for (let pin = 0; pin < 20; pin += 1) {
    if (!allowAnalog && pin >= 14) continue
    if (dsu.find(pinName(pin)) === root) return pin
  }
  return null
}

export function analyzeCircuit(state: CircuitState, snapshot: RunnerSnapshot): CircuitAnalysis {
  const dsu = buildNets(state)
  const resistorGraph = buildResistorGraph(state, dsu)
  const root = (endpoint: Endpoint) => dsu.find(endpoint)
  const highOutputs = new Map<string, number>()
  const lowOutputs = new Set<string>([root('GND')])
  snapshot.pins.duties.forEach((duty, pin) => {
    if (snapshot.pins.modes[pin] !== 'output') return
    if (duty > 0.005) highOutputs.set(root(pinName(pin)), duty)
    else lowOutputs.add(root(pinName(pin)))
  })
  highOutputs.set(root('5V'), 1)
  highOutputs.set(root('3V3'), 0.66)
  lowOutputs.add(root('GND'))

  const digitalInputs: Record<number, boolean> = {}
  for (let pin = 0; pin < 20; pin += 1) {
    const net = root(pinName(pin))
    if (net === root('5V') || net === root('3V3')) digitalInputs[pin] = true
    else if (net === root('GND')) digitalInputs[pin] = false
  }

  const analogVoltages = Array(8).fill(0)
  const ledLevels: Record<string, number> = {}
  const rgbLevels: Record<string, [number, number, number]> = {}
  const buzzerLevels: Record<string, number> = {}
  const ultrasonic: CircuitAnalysis['ultrasonic'] = []
  const servos: CircuitAnalysis['servos'] = []
  const dht22Sensors: CircuitAnalysis['dht22Sensors'] = []
  const ds18b20Sensors: CircuitAnalysis['ds18b20Sensors'] = []
  const issues: string[] = []
  let poweredCount = 0

  const isPowered = (holes: string[], groundIndex = holes.length - 1) => {
    const vcc = root(holes[0])
    const ground = root(holes[groundIndex])
    return (vcc === root('5V') || vcc === root('3V3')) && ground === root('GND')
  }

  state.components.forEach((component, index) => {
    const holes = componentHoles(component)
    const roots = holes.map(root)
    const label = `${COMPONENT_DEFS[component.kind].shortName} ${index + 1}`

    if (['potentiometer', 'light', 'temperature'].includes(component.kind)) {
      if (isPowered(holes)) {
        poweredCount += 1
        const outputPin = boardPinForNet(roots[1], dsu)
        if (outputPin !== null && outputPin >= 14) {
          let voltage = 0
          if (component.kind === 'potentiometer') voltage = component.value / 100 * 5
          if (component.kind === 'light') voltage = 0.05 + component.value / 100 * 4.75
          if (component.kind === 'temperature') voltage = Math.max(0, Math.min(5, 0.5 + component.value * 0.01))
          analogVoltages[outputPin - 14] = voltage
        } else {
          issues.push(`${label}: подключите OUT к одному из входов A0–A5.`)
        }
      } else {
        issues.push(`${label}: для питания соедините VCC с 5V, а GND с GND.`)
      }
    }

    if (component.kind === 'led') {
      let bestDuty = 0
      let missingResistor = false
      for (const [sourceNet, duty] of highOutputs) {
        const anodeResistance = resistanceToTargets(roots[0], new Set([sourceNet]), resistorGraph)
        const cathodeResistance = resistanceToTargets(roots[1], lowOutputs, resistorGraph)
        const total = anodeResistance + cathodeResistance
        if (Number.isFinite(total)) {
          if (total === 0) missingResistor = true
          else bestDuty = Math.max(bestDuty, duty)
        }
      }
      ledLevels[component.id] = bestDuty
      if (bestDuty > 0) poweredCount += 1
      if (missingResistor) issues.push(`${label}: добавьте последовательно резистор 220–330 Ом.`)
    }

    if (component.kind === 'rgb') {
      const channels: number[] = []
      for (let channel = 0; channel < 3; channel += 1) {
        let bestDuty = 0
        for (const [sourceNet, duty] of highOutputs) {
          const channelResistance = resistanceToTargets(roots[channel], new Set([sourceNet]), resistorGraph)
          const cathodeResistance = resistanceToTargets(roots[3], lowOutputs, resistorGraph)
          if (channelResistance + cathodeResistance > 0 && Number.isFinite(channelResistance + cathodeResistance)) {
            bestDuty = Math.max(bestDuty, duty)
          }
        }
        channels.push(bestDuty)
      }
      rgbLevels[component.id] = channels as [number, number, number]
      if (channels.some((level) => level > 0)) poweredCount += 1
    }

    if (component.kind === 'buzzer') {
      let level = 0
      for (const [sourceNet, duty] of highOutputs) {
        if (roots[0] === sourceNet && roots[1] === root('GND')) level = Math.max(level, duty)
      }
      buzzerLevels[component.id] = level * component.value / 100
      if (level > 0) poweredCount += 1
    }

    if (component.kind === 'ultrasonic') {
      if (isPowered(holes)) {
        const trigPin = boardPinForNet(roots[1], dsu, false)
        const echoPin = boardPinForNet(roots[2], dsu, false)
        if (trigPin !== null && echoPin !== null) {
          ultrasonic.push({ id: component.id, trigPin, echoPin, distance: component.value })
          poweredCount += 1
        } else {
          issues.push(`${label}: TRIG и ECHO должны быть соединены с цифровыми контактами.`)
        }
      } else {
        issues.push(`${label}: проверьте питание VCC и GND.`)
      }
    }

    if (component.kind === 'servo') {
      if (isPowered(holes, 1)) {
        const signalPin = boardPinForNet(roots[2], dsu, false)
        if (signalPin !== null) {
          servos.push({ id: component.id, signalPin })
          poweredCount += 1
        } else {
          issues.push(`${label}: подключите SIG к цифровому контакту.`)
        }
      } else {
        issues.push(`${label}: подключите VCC к 5V и GND к GND.`)
      }
    }

    if (component.kind === 'dht22' || component.kind === 'ds18b20') {
      if (isPowered(holes)) {
        const dataPin = boardPinForNet(roots[1], dsu, false)
        if (dataPin !== null) {
          if (component.kind === 'dht22') {
            dht22Sensors.push({ id: component.id, dataPin, temperature: component.value, humidity: component.secondaryValue ?? 55 })
          } else {
            ds18b20Sensors.push({ id: component.id, dataPin, temperature: component.value })
          }
          digitalInputs[dataPin] = true
          poweredCount += 1
        } else {
          issues.push(`${label}: подключите DATA к цифровому контакту.`)
        }
      } else {
        issues.push(`${label}: подключите VCC к 5V и GND к GND.`)
      }
    }
  })

  snapshot.pins.duties.forEach((duty, pin) => {
    if (snapshot.pins.modes[pin] === 'output' && duty > 0.5 && root(pinName(pin)) === root('GND')) {
      issues.push(`${pinName(pin)}: высокий уровень замкнут на GND. Немедленно проверьте провод.`)
    }
  })

  return {
    digitalInputs,
    analogVoltages,
    ledLevels,
    rgbLevels,
    buzzerLevels,
    ultrasonic,
    servos,
    dht22Sensors,
    ds18b20Sensors,
    issues: [...new Set(issues)].slice(0, 5),
    poweredCount,
  }
}

export function defaultWireColor(endpoint: string): string {
  if (endpoint === '5V' || endpoint === '3V3' || endpoint.startsWith('+')) return WIRE_COLORS[0]
  if (endpoint === 'GND' || endpoint.startsWith('-')) return WIRE_COLORS[1]
  if (endpoint.startsWith('A')) return WIRE_COLORS[2]
  return WIRE_COLORS[3]
}

export function isValidEndpoint(endpoint: string): boolean {
  return /^[+-](?:[1-9]|[12]\d|30)$/.test(endpoint)
    || /^[a-j](?:[1-9]|[12]\d|30)$/.test(endpoint)
    || /^(?:D(?:[0-9]|1[0-3])|A[0-5]|5V|3V3|GND|VIN|RESET)$/.test(endpoint)
}

export function describeEndpoint(endpoint: string, board: BoardId = 'uno'): string {
  if (/^[a-j]\d+$/.test(endpoint)) return `Отверстие ${endpoint.toUpperCase()}`
  if (endpoint.startsWith('+')) return `Плюсовая дорожка · ${endpoint.slice(1)}`
  if (endpoint.startsWith('-')) return `Минусовая дорожка · ${endpoint.slice(1)}`
  return describeBoardPin(board, endpoint)
}

export const BOARD_PINS: BoardPin[] = [
  ...Array.from({ length: 14 }, (_, index) => `D${index}` as BoardPin),
  ...Array.from({ length: 6 }, (_, index) => `A${index}` as BoardPin),
  'VIN', 'GND', '5V', '3V3', 'RESET',
]
