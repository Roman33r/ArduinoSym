// AVR execution is built on AVR8js (MIT), Copyright Uri Shaked and contributors.
import {
  adcConfig,
  avrInstruction,
  AVRADC,
  AVRIOPort,
  AVRTimer,
  AVRUSART,
  CPU,
  PinState,
  portBConfig,
  portCConfig,
  portDConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  usart0Config,
} from 'avr8js'
import { pinName } from './circuit'
import { DigitalSensorBus } from './sensorProtocols'
import type { CircuitAnalysis, PinSnapshot, RunnerSnapshot } from '../types/circuit'

const FLASH = 0x8000
const CPU_FREQUENCY = 16e6

interface CompileResult {
  hex: string
  stdout: string
  stderr: string
}

export async function compileSketch(source: string, signal?: AbortSignal): Promise<CompileResult> {
  const response = await fetch('https://hexi.wokwi.com/build', {
    method: 'POST',
    mode: 'cors',
    cache: 'no-cache',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sketch: source }),
    signal,
  })
  if (!response.ok) throw new Error(`Сервис компиляции вернул ошибку ${response.status}. Попробуйте ещё раз.`)
  const result = await response.json() as CompileResult
  if (result.stderr?.trim()) throw new Error(result.stderr)
  if (!result.hex) throw new Error(result.stdout || 'Не удалось получить машинный код программы.')
  return result
}

// Minimal Intel HEX loader, adapted from the AVR8js demo (MIT).
function loadHex(source: string, target: Uint8Array) {
  for (const line of source.split('\n')) {
    if (line[0] === ':' && line.substr(7, 2) === '00') {
      const bytes = parseInt(line.substr(1, 2), 16)
      const address = parseInt(line.substr(3, 4), 16)
      for (let index = 0; index < bytes; index += 1) {
        target[address + index] = parseInt(line.substr(9 + index * 2, 2), 16)
      }
    }
  }
}

function emptyPins(): PinSnapshot {
  return {
    levels: Array(20).fill(false),
    modes: Array(20).fill('input'),
    duties: Array(20).fill(0),
  }
}

export class AVRRunner {
  readonly program = new Uint16Array(FLASH)
  readonly cpu: CPU
  readonly ports: AVRIOPort[]
  readonly adc: AVRADC
  readonly usart: AVRUSART
  private sensorBus: DigitalSensorBus

  private pins = emptyPins()
  private hardware: CircuitAnalysis | null = null
  private running = false
  private frame = 0
  private lastFrameTime = 0
  private lastEmitTime = 0
  private lastPinCycles = Array(20).fill(0)
  private highCycles = Array(20).fill(0)
  private dutyWindowStart = 0
  private servoStarts: Record<string, number> = {}
  private servoAngles: Record<string, number> = {}
  private serialBuffer = ''
  private serialInput: number[] = []
  private textDecoder = new TextDecoder()
  private onSnapshot: (snapshot: RunnerSnapshot) => void

  constructor(hex: string, onSnapshot: (snapshot: RunnerSnapshot) => void) {
    this.onSnapshot = onSnapshot
    loadHex(hex, new Uint8Array(this.program.buffer))
    this.cpu = new CPU(this.program)
    new AVRTimer(this.cpu, timer0Config)
    new AVRTimer(this.cpu, timer1Config)
    new AVRTimer(this.cpu, timer2Config)
    this.ports = [
      new AVRIOPort(this.cpu, portBConfig),
      new AVRIOPort(this.cpu, portCConfig),
      new AVRIOPort(this.cpu, portDConfig),
    ]
    this.adc = new AVRADC(this.cpu, adcConfig)
    this.usart = new AVRUSART(this.cpu, usart0Config, CPU_FREQUENCY)
    this.sensorBus = new DigitalSensorBus(this.cpu, (pin, value) => this.setExternalPin(pin, value))
    this.usart.onByteTransmit = (value) => {
      this.serialBuffer += this.textDecoder.decode(Uint8Array.of(value), { stream: true })
    }
    this.attachListeners()
  }

  private attachListeners() {
    const configs = [
      { port: this.ports[0], offset: 8, count: 6 },
      { port: this.ports[1], offset: 14, count: 6 },
      { port: this.ports[2], offset: 0, count: 8 },
    ]
    configs.forEach(({ port, offset, count }) => {
      for (let bit = 0; bit < count; bit += 1) {
        const pin = offset + bit
        port.addListener(() => this.handlePinState(pin, port.pinState(bit)))
      }
    })
  }

  private handlePinState(pin: number, state: PinState) {
    const now = this.cpu.cycles
    if (this.pins.levels[pin]) this.highCycles[pin] += now - this.lastPinCycles[pin]
    this.lastPinCycles[pin] = now
    const wasHigh = this.pins.levels[pin]
    const previousMode = this.pins.modes[pin]
    const wasOutputLow = previousMode === 'output' && !wasHigh
    const isHigh = state === PinState.High
    this.pins.levels[pin] = isHigh
    this.pins.modes[pin] = state === PinState.High || state === PinState.Low
      ? 'output'
      : state === PinState.InputPullUp ? 'pullup' : 'input'

    const sensorDriven = this.hardware?.dht22Sensors.some((sensor) => sensor.dataPin === pin)
      || this.hardware?.ds18b20Sensors.some((sensor) => sensor.dataPin === pin)
    if (!sensorDriven && this.pins.modes[pin] !== 'output' && previousMode !== this.pins.modes[pin]) {
      const hardwareValue = this.hardware?.digitalInputs[pin]
      this.setExternalPin(pin, hardwareValue ?? (this.pins.modes[pin] === 'pullup'))
    }

    if (!wasHigh && isHigh) {
      this.hardware?.ultrasonic.filter((sensor) => sensor.trigPin === pin).forEach((sensor) => {
        this.cpu.addClockEvent(() => this.setExternalPin(sensor.echoPin, true), 16 * 250)
        this.cpu.addClockEvent(() => this.setExternalPin(sensor.echoPin, false), 16 * (250 + sensor.distance * 58))
      })
      this.hardware?.servos.filter((servo) => servo.signalPin === pin).forEach((servo) => {
        this.servoStarts[servo.id] = now
      })
    }

    if (wasHigh && !isHigh) {
      this.hardware?.servos.filter((servo) => servo.signalPin === pin).forEach((servo) => {
        const started = this.servoStarts[servo.id]
        if (started === undefined) return
        const pulseMicroseconds = (now - started) / 16
        if (pulseMicroseconds >= 350 && pulseMicroseconds <= 2800) {
          // Arduino Servo uses 544–2400 µs by default for the 0–180° range.
          const angle = Math.round(Math.max(0, Math.min(180, (pulseMicroseconds - 544) / (2400 - 544) * 180)))
          this.servoAngles[servo.id] = angle
        }
      })
    }
    this.sensorBus.handlePinState(pin, state, now, wasOutputLow)
  }

  private setExternalPin(pin: number, value: boolean) {
    if (pin >= 8 && pin <= 13) this.ports[0].setPin(pin - 8, value)
    else if (pin >= 14 && pin <= 19) this.ports[1].setPin(pin - 14, value)
    else if (pin >= 0 && pin <= 7) this.ports[2].setPin(pin, value)
  }

  updateHardware(hardware: CircuitAnalysis) {
    this.hardware = hardware
    this.sensorBus.sync(hardware.dht22Sensors, hardware.ds18b20Sensors)
    hardware.analogVoltages.forEach((voltage, channel) => {
      this.adc.channelValues[channel] = voltage
    })
    for (let pin = 0; pin < 20; pin += 1) {
      if (this.pins.modes[pin] !== 'output') {
        this.setExternalPin(pin, hardware.digitalInputs[pin] ?? (this.pins.modes[pin] === 'pullup'))
      }
    }
  }

  sendSerial(text: string) {
    this.serialInput.push(...new TextEncoder().encode(text))
    this.pumpSerialInput()
  }

  private pumpSerialInput() {
    const next = this.serialInput[0]
    if (next !== undefined && this.usart.writeByte(next)) this.serialInput.shift()
  }

  start() {
    if (this.running) return
    this.running = true
    this.lastFrameTime = performance.now()
    this.lastEmitTime = this.lastFrameTime
    this.frame = requestAnimationFrame(this.tick)
  }

  private tick = (now: number) => {
    if (!this.running) return
    const elapsed = Math.min(0.06, Math.max(0.001, (now - this.lastFrameTime) / 1000))
    this.lastFrameTime = now
    const targetCycles = this.cpu.cycles + Math.floor(CPU_FREQUENCY * elapsed)
    const deadline = performance.now() + 9
    while (this.cpu.cycles < targetCycles && performance.now() < deadline) {
      for (let index = 0; index < 512; index += 1) {
        avrInstruction(this.cpu)
        this.cpu.tick()
      }
      this.pumpSerialInput()
    }
    if (now - this.lastEmitTime >= 70) {
      this.emitSnapshot()
      this.lastEmitTime = now
    }
    this.frame = requestAnimationFrame(this.tick)
  }

  private emitSnapshot() {
    const now = this.cpu.cycles
    const windowCycles = Math.max(1, now - this.dutyWindowStart)
    for (let pin = 0; pin < 20; pin += 1) {
      if (this.pins.levels[pin]) this.highCycles[pin] += now - this.lastPinCycles[pin]
      this.pins.duties[pin] = this.pins.modes[pin] === 'output'
        ? Math.max(0, Math.min(1, this.highCycles[pin] / windowCycles))
        : 0
      this.lastPinCycles[pin] = now
      this.highCycles[pin] = 0
    }
    this.dutyWindowStart = now
    const serial = this.serialBuffer
    this.serialBuffer = ''
    this.onSnapshot({
      pins: {
        levels: [...this.pins.levels],
        modes: [...this.pins.modes],
        duties: [...this.pins.duties],
      },
      servoAngles: { ...this.servoAngles },
      cycles: this.cpu.cycles,
      serial,
    })
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.frame)
  }

  getPinLabel(pin: number) {
    return pinName(pin)
  }
}
