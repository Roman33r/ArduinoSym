import type { BoardPin } from '../types/circuit'

export type BoardId = 'uno' | 'esp32'

export interface BoardPinSpec {
  id: BoardPin
  /** Подпись на шелкографии платы. */
  label: string
  /** Имя контакта в коде, если отличается от подписи (например VP = A0). */
  alias?: string
  x: number
  y: number
  labelDx: number
  labelDy: number
  anchor: 'start' | 'middle' | 'end'
}

export interface BoardSpec {
  id: BoardId
  name: string
  shortName: string
  chip: string
  caption: string
  hint: string
  pins: BoardPinSpec[]
}

const middle = 'middle' as const

const UNO_PINS: BoardPinSpec[] = [
  ...Array.from({ length: 14 }, (_, index): BoardPinSpec => ({
    id: `D${index}` as BoardPin, label: `D${index}`, x: 79 + index * 17, y: 130, labelDx: 0, labelDy: -20, anchor: middle,
  })),
  ...Array.from({ length: 6 }, (_, index): BoardPinSpec => ({
    id: `A${index}` as BoardPin, label: `A${index}`, x: 177 + index * 28, y: 510, labelDx: 0, labelDy: 23, anchor: middle,
  })),
  { id: 'VIN', label: 'VIN', x: 62, y: 510, labelDx: 0, labelDy: 23, anchor: middle },
  { id: 'GND', label: 'GND', x: 91, y: 510, labelDx: 0, labelDy: 23, anchor: middle },
  { id: '5V', label: '5V', x: 120, y: 510, labelDx: 0, labelDy: 23, anchor: middle },
  { id: '3V3', label: '3V3', x: 149, y: 510, labelDx: 0, labelDy: 23, anchor: middle },
  { id: 'RESET', label: 'RESET', x: 345, y: 510, labelDx: 0, labelDy: 23, anchor: middle },
]

const ESP32_ANALOG: Array<[BoardPin, string]> = [
  ['A0', 'VP'], ['A1', 'VN'], ['A2', 'D34'], ['A3', 'D35'], ['A4', 'D32'], ['A5', 'D33'],
]

const espRow = (y: number) => 178 + y * 23

const ESP32_PINS: BoardPinSpec[] = [
  { id: 'RESET', label: 'EN', alias: 'RESET', x: 88, y: espRow(0), labelDx: 14, labelDy: 3, anchor: 'start' },
  ...ESP32_ANALOG.map(([id, label], index): BoardPinSpec => ({
    id, label, alias: id, x: 88, y: espRow(index + 1), labelDx: 14, labelDy: 3, anchor: 'start' as const,
  })),
  { id: 'GND', label: 'GND', x: 88, y: espRow(7), labelDx: 14, labelDy: 3, anchor: 'start' },
  { id: 'VIN', label: 'VIN', x: 88, y: espRow(8), labelDx: 14, labelDy: 3, anchor: 'start' },
  { id: '5V', label: '5V', x: 88, y: espRow(9), labelDx: 14, labelDy: 3, anchor: 'start' },
  { id: '3V3', label: '3V3', x: 88, y: espRow(10), labelDx: 14, labelDy: 3, anchor: 'start' },
  ...Array.from({ length: 14 }, (_, index): BoardPinSpec => {
    const pin = 13 - index
    return { id: `D${pin}` as BoardPin, label: `D${pin}`, x: 332, y: espRow(index), labelDx: -14, labelDy: 3, anchor: 'end' as const }
  }),
]

export const BOARDS: Record<BoardId, BoardSpec> = {
  uno: {
    id: 'uno',
    name: 'Arduino Uno R3',
    shortName: 'Uno R3',
    chip: 'ATmega328P',
    caption: 'ARDUINO UNO',
    hint: 'Классическая плата: цифровые D0–D13, аналоговые A0–A5, логика 5 В.',
    pins: UNO_PINS,
  },
  esp32: {
    id: 'esp32',
    name: 'ESP32 DevKit V1',
    shortName: 'ESP32',
    chip: 'ESP32-WROOM-32',
    caption: 'ESP32 DEVKIT',
    hint: 'Логика 3.3 В, код в стиле ESP32: ledcWrite и ESP32Servo. Аналоговые входы VP, VN и D32–D35 — в коде это A0–A5.',
    pins: ESP32_PINS,
  },
}

export const BOARD_IDS = Object.keys(BOARDS) as BoardId[]

export function getBoardPinPoint(board: BoardId, id: string): { x: number; y: number } | null {
  const spec = BOARDS[board].pins.find((pin) => pin.id === id)
  return spec ? { x: spec.x, y: spec.y } : null
}

export function describeBoardPin(board: BoardId, id: string): string {
  const spec = BOARDS[board].pins.find((pin) => pin.id === id)
  const owner = board === 'esp32' ? 'ESP32' : 'Arduino'
  if (!spec) return `${owner} · ${id}`
  return spec.alias ? `${owner} · ${spec.label} (в коде ${spec.alias})` : `${owner} · ${spec.label}`
}

export function pinOptionLabel(board: BoardId, id: string): string {
  const spec = BOARDS[board].pins.find((pin) => pin.id === id)
  if (!spec) return id
  return spec.alias ? `${spec.label} · ${spec.alias}` : spec.label
}
