export type ComponentKind =
  | 'led'
  | 'resistor'
  | 'button'
  | 'potentiometer'
  | 'light'
  | 'temperature'
  | 'ultrasonic'
  | 'buzzer'
  | 'rgb'
  | 'servo'
  | 'dht22'
  | 'ds18b20'

export type BoardPin =
  | `D${number}`
  | `A${number}`
  | '5V'
  | '3V3'
  | 'GND'
  | 'VIN'
  | 'RESET'

export type Endpoint = string

export interface CircuitComponent {
  id: string
  kind: ComponentKind
  slot: number
  value: number
  pressed?: boolean
  color?: 'red' | 'green' | 'yellow' | 'blue'
  secondaryValue?: number
}

export interface Wire {
  id: string
  from: Endpoint
  to: Endpoint
  color: string
  bend?: { x: number; y: number }
}

export interface CircuitState {
  components: CircuitComponent[]
  wires: Wire[]
}

export interface ComponentDefinition {
  kind: ComponentKind
  name: string
  shortName: string
  description: string
  terminals: string[]
  defaultValue: number
  min: number
  max: number
  step: number
  unit: string
  valueLabel?: string
  secondaryValue?: {
    label: string
    defaultValue: number
    min: number
    max: number
    step: number
    unit: string
  }
}

export interface UltrasonicMapping {
  id: string
  trigPin: number
  echoPin: number
  distance: number
}

export interface ServoMapping {
  id: string
  signalPin: number
}

export interface Dht22Mapping {
  id: string
  dataPin: number
  temperature: number
  humidity: number
}

export interface Ds18b20Mapping {
  id: string
  dataPin: number
  temperature: number
}

export interface CircuitAnalysis {
  digitalInputs: Record<number, boolean>
  analogVoltages: number[]
  ledLevels: Record<string, number>
  rgbLevels: Record<string, [number, number, number]>
  buzzerLevels: Record<string, number>
  ultrasonic: UltrasonicMapping[]
  servos: ServoMapping[]
  dht22Sensors: Dht22Mapping[]
  ds18b20Sensors: Ds18b20Mapping[]
  issues: string[]
  poweredCount: number
}

export interface PinSnapshot {
  levels: boolean[]
  modes: Array<'input' | 'pullup' | 'output'>
  duties: number[]
}

export interface RunnerSnapshot {
  pins: PinSnapshot
  servoAngles: Record<string, number>
  cycles: number
  serial: string
}
