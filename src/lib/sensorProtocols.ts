import { PinState } from 'avr8js'
import type { Dht22Mapping, Ds18b20Mapping } from '../types/circuit'

interface ClockScheduler {
  addClockEvent: (callback: () => void, cycles: number) => void
}

type DrivePin = (pin: number, value: boolean) => void

type OneWirePhase = 'rom' | 'matchRom' | 'function' | 'writeScratchpad' | 'read' | 'convertPoll' | 'idle'

interface OneWireDevice {
  id: string
  dataPin: number
  temperature: number
  convertedTemperature: number
  pendingTemperature: number
  conversionReadyAt: number
  lowSince: number
  phase: OneWirePhase
  writeBit: number
  writeByte: number
  addressBits: number
  scratchpadWrites: number[]
  readData: number[]
  readByte: number
  readBit: number
  generation: number
}

const us = (microseconds: number) => Math.round(microseconds * 16)

function crc8(bytes: number[]): number {
  let crc = 0
  for (const byte of bytes) {
    let value = byte
    for (let bit = 0; bit < 8; bit += 1) {
      const mix = (crc ^ value) & 1
      crc >>= 1
      if (mix) crc ^= 0x8c
      value >>= 1
    }
  }
  return crc
}

function makeDevice(mapping: Ds18b20Mapping): OneWireDevice {
  return {
    ...mapping,
    convertedTemperature: mapping.temperature,
    pendingTemperature: mapping.temperature,
    conversionReadyAt: 0,
    lowSince: 0,
    phase: 'idle',
    writeBit: 0,
    writeByte: 0,
    addressBits: 0,
    scratchpadWrites: [],
    readData: [],
    readByte: 0,
    readBit: 0,
    generation: 0,
  }
}

export class DigitalSensorBus {
  private dht22: Dht22Mapping[] = []
  private dhtLowStarts = new Map<string, number>()
  private dhtTransactions = new Map<string, number>()
  private oneWire = new Map<string, OneWireDevice>()
  private clock: ClockScheduler
  private drivePin: DrivePin

  constructor(clock: ClockScheduler, drivePin: DrivePin) {
    this.clock = clock
    this.drivePin = drivePin
  }

  sync(dht22: Dht22Mapping[], ds18b20: Ds18b20Mapping[]) {
    this.dht22 = dht22
    const next = new Map<string, OneWireDevice>()
    ds18b20.forEach((mapping) => {
      const existing = this.oneWire.get(mapping.id)
      if (existing) {
        existing.dataPin = mapping.dataPin
        existing.temperature = mapping.temperature
        next.set(mapping.id, existing)
      } else {
        next.set(mapping.id, makeDevice(mapping))
      }
    })
    this.oneWire = next
  }

  handlePinState(pin: number, state: PinState, now: number, wasOutputLow: boolean) {
    if (state === PinState.Low && !wasOutputLow) {
      this.dht22.filter((sensor) => sensor.dataPin === pin).forEach((sensor) => this.dhtLowStarts.set(sensor.id, now))
      this.oneWire.forEach((device) => { if (device.dataPin === pin) device.lowSince = now })
    }

    if (!wasOutputLow || state === PinState.Low) return

    this.dht22.filter((sensor) => sensor.dataPin === pin).forEach((sensor) => {
      const started = this.dhtLowStarts.get(sensor.id)
      if (started !== undefined && now - started >= us(250)) this.startDhtResponse(sensor, now)
    })
    this.oneWire.forEach((device) => {
      if (device.dataPin === pin) this.finishOneWireLow(device, now)
    })
  }

  private startDhtResponse(sensor: Dht22Mapping, now: number) {
    const transaction = (this.dhtTransactions.get(sensor.id) ?? 0) + 1
    this.dhtTransactions.set(sensor.id, transaction)
    const humidity = Math.max(0, Math.min(1000, Math.round(sensor.humidity * 10)))
    const temperatureMagnitude = Math.min(0x7fff, Math.round(Math.abs(sensor.temperature) * 10))
    const temperature = sensor.temperature < 0 ? 0x8000 | temperatureMagnitude : temperatureMagnitude
    const bytes = [humidity >> 8, humidity & 0xff, temperature >> 8, temperature & 0xff]
    bytes.push(bytes.reduce((sum, byte) => (sum + byte) & 0xff, 0))
    const bits = bytes.flatMap((byte) => Array.from({ length: 8 }, (_, index) => (byte >> (7 - index)) & 1))

    let elapsed = 30
    const transition = (value: boolean) => {
      const delay = elapsed
      this.clock.addClockEvent(() => {
        if (this.dhtTransactions.get(sensor.id) === transaction) this.drivePin(sensor.dataPin, value)
      }, us(delay))
    }
    transition(false) // Response: 80 µs LOW.
    elapsed += 80
    transition(true)  // Response: 80 µs HIGH.
    elapsed += 80
    bits.forEach((bit) => {
      transition(false)
      elapsed += 50
      transition(true)
      elapsed += bit ? 70 : 28
    })
    transition(false)
    elapsed += 50
    transition(true)
    void now
  }

  private finishOneWireLow(device: OneWireDevice, now: number) {
    const lowDuration = now - device.lowSince
    if (lowDuration >= us(400)) {
      this.resetOneWire(device)
      return
    }
    if (device.phase === 'read' || device.phase === 'convertPoll') {
      this.readOneWireSlot(device, lowDuration)
    } else {
      this.writeOneWireBit(device, lowDuration <= us(20) ? 1 : 0, now)
    }
  }

  private resetOneWire(device: OneWireDevice) {
    device.phase = 'rom'
    device.writeBit = 0
    device.writeByte = 0
    device.addressBits = 0
    device.scratchpadWrites = []
    device.readData = []
    device.readByte = 0
    device.readBit = 0
    device.generation += 1
    const generation = device.generation
    this.clock.addClockEvent(() => {
      if (device.generation === generation) this.drivePin(device.dataPin, false)
    }, us(30))
    this.clock.addClockEvent(() => {
      if (device.generation === generation) this.drivePin(device.dataPin, true)
    }, us(150))
  }

  private writeOneWireBit(device: OneWireDevice, bit: number, now: number) {
    device.writeByte |= bit << device.writeBit
    device.writeBit += 1
    if (device.writeBit < 8) return
    const command = device.writeByte
    device.writeBit = 0
    device.writeByte = 0

    if (device.phase === 'matchRom') {
      device.addressBits += 8
      if (device.addressBits >= 64) device.phase = 'function'
      return
    }
    if (device.phase === 'writeScratchpad') {
      device.scratchpadWrites.push(command)
      if (device.scratchpadWrites.length >= 3) device.phase = 'idle'
      return
    }
    if (device.phase === 'rom') {
      if (command === 0xcc) device.phase = 'function'
      else if (command === 0x55) {
        device.phase = 'matchRom'
        device.addressBits = 0
      } else if (command === 0x33) {
        const rom = [0x28, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06]
        this.startRead(device, [...rom, crc8(rom)])
      } else {
        device.phase = 'idle'
      }
      return
    }
    if (device.phase !== 'function') return

    if (command === 0x44) {
      device.pendingTemperature = device.temperature
      device.conversionReadyAt = now + us(750_000)
      device.phase = 'convertPoll'
    } else if (command === 0xbe) {
      if (now >= device.conversionReadyAt) device.convertedTemperature = device.pendingTemperature
      const raw = Math.round(device.convertedTemperature * 16) & 0xffff
      const scratchpad = [raw & 0xff, raw >> 8, 0x4b, 0x46, 0x7f, 0xff, 0x0c, 0x10]
      this.startRead(device, [...scratchpad, crc8(scratchpad)])
    } else if (command === 0xb4) {
      this.startRead(device, [1])
    } else if (command === 0x4e) {
      device.phase = 'writeScratchpad'
      device.scratchpadWrites = []
    } else {
      device.phase = 'idle'
    }
  }

  private startRead(device: OneWireDevice, bytes: number[]) {
    device.phase = 'read'
    device.readData = bytes
    device.readByte = 0
    device.readBit = 0
  }

  private readOneWireSlot(device: OneWireDevice, lowDuration: number) {
    let bit = 1
    if (device.phase === 'convertPoll') {
      bit = device.conversionReadyAt <= device.lowSince + lowDuration ? 1 : 0
    } else {
      const byte = device.readData[device.readByte]
      if (byte === undefined) {
        device.phase = 'idle'
      } else {
        bit = (byte >> device.readBit) & 1
        device.readBit += 1
        if (device.readBit === 8) {
          device.readBit = 0
          device.readByte += 1
        }
      }
    }
    this.drivePin(device.dataPin, bit === 1)
    if (bit === 0) {
      const generation = device.generation
      this.clock.addClockEvent(() => {
        if (device.generation === generation) this.drivePin(device.dataPin, true)
      }, Math.max(16, us(60) - lowDuration))
    }
  }
}
