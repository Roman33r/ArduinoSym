import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { StateField, type EditorState, type Extension } from '@codemirror/state'
import { showTooltip, type Tooltip } from '@codemirror/view'
import type { BoardId } from './boards'

interface ArduinoParam {
  name: string
  type: string
  hint: string
}

interface ArduinoFunction {
  name: string
  returns: string
  params: ArduinoParam[]
  description: string
}

interface ArduinoConstant {
  name: string
  value: string
  description: string
}

const ARDUINO_FUNCTIONS: ArduinoFunction[] = [
  {
    name: 'pinMode',
    returns: 'void',
    params: [
      { name: 'pin', type: 'uint8_t', hint: 'номер контакта, например 13 или LED_BUILTIN' },
      { name: 'mode', type: 'uint8_t', hint: 'INPUT, OUTPUT или INPUT_PULLUP' },
    ],
    description: 'Настраивает контакт как вход или выход.',
  },
  {
    name: 'digitalWrite',
    returns: 'void',
    params: [
      { name: 'pin', type: 'uint8_t', hint: 'цифровой контакт' },
      { name: 'value', type: 'uint8_t', hint: 'HIGH или LOW' },
    ],
    description: 'Подаёт на контакт высокий (5 В) или низкий (0 В) уровень.',
  },
  {
    name: 'digitalRead',
    returns: 'int',
    params: [{ name: 'pin', type: 'uint8_t', hint: 'цифровой контакт' }],
    description: 'Читает уровень на контакте: HIGH или LOW.',
  },
  {
    name: 'analogRead',
    returns: 'int',
    params: [{ name: 'pin', type: 'uint8_t', hint: 'аналоговый вход A0–A5' }],
    description: 'Возвращает значение АЦП 0–1023 (10 бит).',
  },
  {
    name: 'analogWrite',
    returns: 'void',
    params: [
      { name: 'pin', type: 'uint8_t', hint: 'ШИМ-контакт: 3, 5, 6, 9, 10, 11' },
      { name: 'value', type: 'int', hint: 'скважность 0–255' },
    ],
    description: 'Выдаёт ШИМ-сигнал (аналоговое значение) на контакт.',
  },
  {
    name: 'analogReference',
    returns: 'void',
    params: [{ name: 'type', type: 'uint8_t', hint: 'DEFAULT, INTERNAL или EXTERNAL' }],
    description: 'Выбирает опорное напряжение АЦП.',
  },
  {
    name: 'delay',
    returns: 'void',
    params: [{ name: 'ms', type: 'unsigned long', hint: 'пауза в миллисекундах' }],
    description: 'Приостанавливает программу на заданное число миллисекунд.',
  },
  {
    name: 'delayMicroseconds',
    returns: 'void',
    params: [{ name: 'us', type: 'unsigned int', hint: 'пауза в микросекундах' }],
    description: 'Приостанавливает программу на заданное число микросекунд.',
  },
  {
    name: 'millis',
    returns: 'unsigned long',
    params: [],
    description: 'Миллисекунды с момента старта программы.',
  },
  {
    name: 'micros',
    returns: 'unsigned long',
    params: [],
    description: 'Микросекунды с момента старта программы.',
  },
  {
    name: 'tone',
    returns: 'void',
    params: [
      { name: 'pin', type: 'uint8_t', hint: 'контакт с зуммером' },
      { name: 'frequency', type: 'unsigned int', hint: 'частота в герцах' },
      { name: 'duration', type: 'unsigned long', hint: 'длительность в мс (необязательно)' },
    ],
    description: 'Генерирует меандр заданной частоты на контакте.',
  },
  {
    name: 'noTone',
    returns: 'void',
    params: [{ name: 'pin', type: 'uint8_t', hint: 'контакт, на котором звучит tone()' }],
    description: 'Останавливает генерацию tone() на контакте.',
  },
  {
    name: 'pulseIn',
    returns: 'unsigned long',
    params: [
      { name: 'pin', type: 'uint8_t', hint: 'контакт для измерения' },
      { name: 'state', type: 'uint8_t', hint: 'HIGH или LOW' },
      { name: 'timeout', type: 'unsigned long', hint: 'таймаут в мкс (необязательно)' },
    ],
    description: 'Измеряет длительность импульса в микросекундах.',
  },
  {
    name: 'map',
    returns: 'long',
    params: [
      { name: 'value', type: 'long', hint: 'исходное значение' },
      { name: 'in_min', type: 'long', hint: 'нижняя граница входа' },
      { name: 'in_max', type: 'long', hint: 'верхняя граница входа' },
      { name: 'out_min', type: 'long', hint: 'нижняя граница выхода' },
      { name: 'out_max', type: 'long', hint: 'верхняя граница выхода' },
    ],
    description: 'Пропорционально переносит значение из одного диапазона в другой.',
  },
  {
    name: 'constrain',
    returns: 'long',
    params: [
      { name: 'x', type: 'long', hint: 'значение' },
      { name: 'a', type: 'long', hint: 'минимум' },
      { name: 'b', type: 'long', hint: 'максимум' },
    ],
    description: 'Ограничивает значение диапазоном [a; b].',
  },
  {
    name: 'abs',
    returns: 'long',
    params: [{ name: 'x', type: 'long', hint: 'число' }],
    description: 'Модуль числа.',
  },
  {
    name: 'min',
    returns: 'long',
    params: [
      { name: 'a', type: 'long', hint: 'первое значение' },
      { name: 'b', type: 'long', hint: 'второе значение' },
    ],
    description: 'Возвращает меньшее из двух значений.',
  },
  {
    name: 'max',
    returns: 'long',
    params: [
      { name: 'a', type: 'long', hint: 'первое значение' },
      { name: 'b', type: 'long', hint: 'второе значение' },
    ],
    description: 'Возвращает большее из двух значений.',
  },
  {
    name: 'pow',
    returns: 'double',
    params: [
      { name: 'base', type: 'float', hint: 'основание' },
      { name: 'exponent', type: 'float', hint: 'показатель степени' },
    ],
    description: 'Возводит число в степень.',
  },
  {
    name: 'sqrt',
    returns: 'double',
    params: [{ name: 'x', type: 'float', hint: 'число' }],
    description: 'Квадратный корень.',
  },
  {
    name: 'sq',
    returns: 'long',
    params: [{ name: 'x', type: 'long', hint: 'число' }],
    description: 'Квадрат числа.',
  },
  {
    name: 'random',
    returns: 'long',
    params: [
      { name: 'min', type: 'long', hint: 'минимум (включительно)' },
      { name: 'max', type: 'long', hint: 'максимум (исключительно, необязательно)' },
    ],
    description: 'Псевдослучайное число из диапазона.',
  },
  {
    name: 'randomSeed',
    returns: 'void',
    params: [{ name: 'seed', type: 'unsigned long', hint: 'зерно генератора' }],
    description: 'Инициализирует генератор случайных чисел.',
  },
  {
    name: 'Serial.begin',
    returns: 'void',
    params: [{ name: 'speed', type: 'unsigned long', hint: 'скорость, например 9600' }],
    description: 'Открывает последовательный порт на заданной скорости.',
  },
  {
    name: 'Serial.print',
    returns: 'size_t',
    params: [
      { name: 'value', type: 'const char *', hint: 'строка, число или символ' },
      { name: 'format', type: 'int', hint: 'DEC, HEX, BIN… (необязательно)' },
    ],
    description: 'Печатает данные в порт без перевода строки.',
  },
  {
    name: 'Serial.println',
    returns: 'size_t',
    params: [
      { name: 'value', type: 'const char *', hint: 'строка, число или символ' },
      { name: 'format', type: 'int', hint: 'DEC, HEX, BIN… (необязательно)' },
    ],
    description: 'Печатает данные в порт и добавляет перевод строки.',
  },
  {
    name: 'Serial.available',
    returns: 'int',
    params: [],
    description: 'Сколько байт ожидает чтения в буфере порта.',
  },
  {
    name: 'Serial.read',
    returns: 'int',
    params: [],
    description: 'Читает один байт из порта или −1, если данных нет.',
  },
  {
    name: 'Serial.write',
    returns: 'size_t',
    params: [{ name: 'value', type: 'uint8_t', hint: 'байт для отправки' }],
    description: 'Отправляет сырой байт в порт.',
  },
  {
    name: 'Servo.attach',
    returns: 'uint8_t',
    params: [{ name: 'pin', type: 'uint8_t', hint: 'контакт сигнала сервопривода' }],
    description: 'Привязывает сервопривод к контакту.',
  },
  {
    name: 'Servo.write',
    returns: 'void',
    params: [{ name: 'angle', type: 'int', hint: 'угол 0–180°' }],
    description: 'Поворачивает вал сервопривода на заданный угол.',
  },
  {
    name: 'Servo.writeMicroseconds',
    returns: 'void',
    params: [{ name: 'us', type: 'int', hint: 'длительность импульса 544–2400 мкс' }],
    description: 'Задаёт положение сервопривода длительностью импульса.',
  },
  {
    name: 'Servo.read',
    returns: 'int',
    params: [],
    description: 'Последний переданный сервоприводу угол.',
  },
]

const ESP32_FUNCTIONS: ArduinoFunction[] = [
  {
    name: 'ledcWrite',
    returns: 'void',
    params: [
      { name: 'pin', type: 'uint8_t', hint: 'контакт ШИМ, например 9 (Arduino Core 3.x)' },
      { name: 'duty', type: 'uint32_t', hint: 'скважность 0–255 при разрядности 8 бит' },
    ],
    description: 'ШИМ на ESP32 через LEDC. В симуляторе эквивалентно analogWrite().',
  },
  {
    name: 'ledcSetup',
    returns: 'double',
    params: [
      { name: 'channel', type: 'uint8_t', hint: 'канал LEDC 0–15 (Core 2.x)' },
      { name: 'freq', type: 'double', hint: 'частота ШИМ в герцах, например 5000' },
      { name: 'resolution', type: 'uint8_t', hint: 'разрядность 1–16 бит, обычно 8' },
    ],
    description: 'Настраивает канал ШИМ LEDC (Core 2.x). В симуляторе настройка не требуется.',
  },
  {
    name: 'ledcAttachPin',
    returns: 'void',
    params: [
      { name: 'pin', type: 'uint8_t', hint: 'контакт для вывода ШИМ (Core 2.x)' },
      { name: 'channel', type: 'uint8_t', hint: 'канал LEDC, настроенный ledcSetup()' },
    ],
    description: 'Привязывает канал LEDC к контакту (Core 2.x). В симуляторе не требуется.',
  },
  {
    name: 'ledcDetachPin',
    returns: 'void',
    params: [{ name: 'pin', type: 'uint8_t', hint: 'контакт, который нужно освободить' }],
    description: 'Отключает ШИМ-канал от контакта.',
  },
]

function functionsFor(board: BoardId): ArduinoFunction[] {
  const base = board === 'esp32'
    ? ARDUINO_FUNCTIONS.map((item) => item.name === 'analogWrite'
      ? { ...item, description: 'Выдаёт ШИМ-сигнал на контакт. На реальном ESP32 чаще используют ledcWrite().' }
      : item)
    : ARDUINO_FUNCTIONS
  return board === 'esp32' ? [...base, ...ESP32_FUNCTIONS] : base
}

function constantsFor(board: BoardId): ArduinoConstant[] {
  return ARDUINO_CONSTANTS.map((item) => {
    if (item.name === 'LED_BUILTIN' && board === 'esp32') {
      return { ...item, value: '2', description: 'Встроенный светодиод на GPIO2 (ESP32 DevKit).' }
    }
    return item
  })
}
const ARDUINO_CONSTANTS: ArduinoConstant[] = [
  { name: 'HIGH', value: '0x1', description: 'Высокий логический уровень.' },
  { name: 'LOW', value: '0x0', description: 'Низкий логический уровень.' },
  { name: 'INPUT', value: '0x0', description: 'Контакт работает как вход.' },
  { name: 'OUTPUT', value: '0x1', description: 'Контакт работает как выход.' },
  { name: 'INPUT_PULLUP', value: '0x2', description: 'Вход с подтяжкой к питанию.' },
  { name: 'LED_BUILTIN', value: '13', description: 'Встроенный светодиод на контакте 13.' },
  ...Array.from({ length: 6 }, (_, index) => ({
    name: `A${index}`,
    value: `${14 + index}`,
    description: `Аналоговый вход A${index}.`,
  })),
]

function buildInfoNode(item: ArduinoFunction) {
  const root = document.createElement('div')
  root.className = 'cm-arduino-info'

  const signature = document.createElement('div')
  signature.className = 'cm-arduino-signature'
  const name = document.createElement('b')
  name.textContent = `${item.name}(`
  signature.append(name)
  item.params.forEach((param, index) => {
    const type = document.createElement('span')
    type.className = 'cm-arduino-type'
    type.textContent = `${param.type} `
    signature.append(type, param.name)
    if (index < item.params.length - 1) signature.append(', ')
  })
  const returns = document.createElement('span')
  returns.className = 'cm-arduino-return'
  returns.textContent = `) → ${item.returns}`
  signature.append(returns)
  root.append(signature)

  if (item.params.length) {
    const list = document.createElement('ul')
    item.params.forEach((param) => {
      const row = document.createElement('li')
      const paramName = document.createElement('code')
      paramName.textContent = `${param.name}: ${param.type}`
      row.append(paramName, ` — ${param.hint}`)
      list.append(row)
    })
    root.append(list)
  }

  const description = document.createElement('p')
  description.textContent = item.description
  root.append(description)
  return root
}

function arduinoCompletions(context: CompletionContext, board: BoardId): CompletionResult | null {
  const word = context.matchBefore(/[A-Za-z_][\w.]*$/)
  if (!word && !context.explicit) return null
  const from = word ? word.from : context.pos

  const options: Completion[] = [
    ...functionsFor(board).map((item) => ({
      label: item.name,
      type: 'function',
      detail: item.returns,
      info: () => buildInfoNode(item),
      boost: 2,
    })),
    ...constantsFor(board).map((item) => ({
      label: item.name,
      type: 'constant',
      detail: item.value,
      info: item.description,
      boost: 1,
    })),
  ]
  return { from, options, validFor: /^[\w.]*$/ }
}

function findCallContext(docText: string, cursor: number) {
  let depth = 0
  let commas = 0
  const lowerBound = Math.max(0, cursor - 600)
  for (let index = cursor - 1; index >= lowerBound; index -= 1) {
    const char = docText[index]
    if (char === ')' || char === ']' || char === '}') depth += 1
    else if (char === '(' || char === '[' || char === '{') {
      if (depth === 0 && char === '(') {
        const before = docText.slice(lowerBound, index)
        const match = /([A-Za-z_][\w.]*)$/.exec(before)
        if (!match) return null
        return { name: match[1], activeParam: commas, openParen: index }
      }
      depth = Math.max(0, depth - 1)
    } else if (char === ',' && depth === 0) {
      commas += 1
    } else if (char === ';' && depth === 0) {
      return null
    }
  }
  return null
}

function makeSignatureTooltipField(functions: ArduinoFunction[]) {
  return StateField.define<Tooltip | null>({
    create: (state) => computeSignatureTooltip(state, functions),
    update: (_value, transaction) => computeSignatureTooltip(transaction.state, functions),
    provide: (field) => showTooltip.from(field, (tooltip) => tooltip),
  })
}

function computeSignatureTooltip(state: EditorState, functions: ArduinoFunction[]): Tooltip | null {
  const { head, empty } = state.selection.main
  if (!empty) return null
  const context = findCallContext(state.doc.toString(), head)
  if (!context) return null
  const item = functions.find((entry) => entry.name === context.name)
  if (!item || !item.params.length) return null
  const activeParam = Math.min(context.activeParam, item.params.length - 1)
  if (head <= context.openParen || head - context.openParen > 400) return null

  return {
    pos: head,
    above: true,
    arrow: false,
    create: () => {
      const dom = document.createElement('div')
      dom.className = 'cm-signature-help'

      const signature = document.createElement('div')
      signature.className = 'cm-signature-line'
      const name = document.createElement('b')
      name.textContent = `${item.name}(`
      signature.append(name)
      item.params.forEach((param, index) => {
        const span = document.createElement('span')
        span.className = index === activeParam ? 'cm-signature-param is-active' : 'cm-signature-param'
        const type = document.createElement('span')
        type.className = 'cm-arduino-type'
        type.textContent = `${param.type} `
        span.append(type, param.name)
        signature.append(span)
        if (index < item.params.length - 1) signature.append(', ')
      })
      const returns = document.createElement('span')
      returns.className = 'cm-arduino-return'
      returns.textContent = `) → ${item.returns}`
      signature.append(returns)
      dom.append(signature)

      const hint = document.createElement('div')
      hint.className = 'cm-signature-hint'
      hint.textContent = item.params[activeParam].hint
      dom.append(hint)
      return { dom }
    },
  }
}

export function arduinoAssist(board: BoardId = 'uno'): Extension {
  return [autocompletion({ override: [(context) => arduinoCompletions(context, board)] }), makeSignatureTooltipField(functionsFor(board))]
}
