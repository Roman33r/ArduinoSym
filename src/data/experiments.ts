import { defaultWireColor, makeComponent } from '../lib/circuit'
import type { CircuitState, Wire } from '../types/circuit'

export interface Experiment {
  id: string
  name: string
  category: string
  level: 'Первый шаг' | 'Базовый' | 'Практика' | 'Проект'
  description: string
  task: string
  code: string
  /** Вариант программы в стиле ESP32: ledcWrite, ESP32Servo, расчёты под 3.3 В. */
  codeEsp32?: string
  circuit: CircuitState
}

const wire = (from: string, to: string, index: number): Wire => ({
  id: `wire-${index}-${from}-${to}`,
  from,
  to,
  color: defaultWireColor(from === 'GND' ? to : from),
})

function circuit(componentSpecs: Array<Parameters<typeof makeComponent>[0]>, connections: Array<[string, string]>): CircuitState {
  return {
    components: componentSpecs.map((kind, slot) => makeComponent(kind, slot, `${kind}-preset-${slot}`)),
    wires: connections.map(([from, to], index) => wire(from, to, index)),
  }
}

const blinkCircuit = circuit(['led', 'resistor'], [
  ['D13', 'b7'], ['c8', 'b2'], ['b3', 'GND'],
])

const buttonCircuit = circuit(['led', 'resistor', 'button'], [
  ['D13', 'b7'], ['c8', 'b2'], ['b3', 'GND'],
  ['D2', 'b12'], ['b13', 'GND'],
])

const analogCircuit = (kind: 'potentiometer' | 'light' | 'temperature', pin = 'A0') => circuit([kind], [
  ['5V', 'b2'], [pin, 'b3'], ['GND', 'b4'],
])

const rgbCircuit = circuit(['rgb', 'resistor', 'resistor', 'resistor'], [
  ['D9', 'b7'], ['c8', 'b2'],
  ['D10', 'b12'], ['c13', 'b3'],
  ['D11', 'b17'], ['c18', 'b4'],
  ['b5', 'GND'],
])

const servoCircuit = circuit(['servo', 'potentiometer'], [
  ['5V', 'b2'], ['GND', 'b3'], ['D9', 'b4'],
  ['5V', 'b7'], ['A0', 'b8'], ['GND', 'b9'],
])

const dht22Circuit = circuit(['dht22'], [
  ['5V', 'b2'], ['D2', 'b3'], ['GND', 'b5'],
])

const ds18b20Circuit = circuit(['ds18b20'], [
  ['5V', 'b2'], ['D2', 'b3'], ['GND', 'b4'],
])

const nightCircuit = circuit(['light', 'led', 'resistor'], [
  ['5V', 'b2'], ['A0', 'b3'], ['GND', 'b4'],
  ['D9', 'b12'], ['c13', 'b7'], ['b8', 'GND'],
])

const parkingCircuit = circuit(['ultrasonic', 'buzzer', 'led', 'resistor'], [
  ['5V', 'b2'], ['D7', 'b3'], ['D8', 'b4'], ['GND', 'b5'],
  ['D4', 'b7'], ['GND', 'b8'],
  ['D13', 'b17'], ['c18', 'b12'], ['GND', 'b13'],
])

export const EXPERIMENTS: Experiment[] = [
  {
    id: 'blink',
    name: 'Первый светодиод',
    category: 'Цифровой выход',
    level: 'Первый шаг',
    description: 'Классический Blink на реальной эмуляции микроконтроллера. Проследите путь сигнала от D13 через резистор к светодиоду.',
    task: 'Измените обе паузы на 200 мс. Затем перенесите сигнальный провод на D12 и исправьте номер контакта в коде.',
    circuit: blinkCircuit,
    code: `const int LED_PIN = 13;\n\nvoid setup() {\n  pinMode(LED_PIN, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(LED_PIN, HIGH);\n  delay(1000);\n  digitalWrite(LED_PIN, LOW);\n  delay(1000);\n}`,
  },
  {
    id: 'button',
    name: 'Кнопка управляет светом',
    category: 'Цифровой вход',
    level: 'Базовый',
    description: 'Кнопка соединяет D2 с GND. Внутренняя подтяжка удерживает вход HIGH, пока кнопка отпущена.',
    task: 'Нажмите кнопку прямо на макетке во время работы программы. Затем измените логику так, чтобы светодиод горел при отпущенной кнопке.',
    circuit: buttonCircuit,
    code: `const int BUTTON_PIN = 2;\nconst int LED_PIN = 13;\n\nvoid setup() {\n  pinMode(BUTTON_PIN, INPUT_PULLUP);\n  pinMode(LED_PIN, OUTPUT);\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  bool pressed = digitalRead(BUTTON_PIN) == LOW;\n  digitalWrite(LED_PIN, pressed ? HIGH : LOW);\n  Serial.println(pressed ? "Кнопка нажата" : "Кнопка отпущена");\n  delay(250);\n}`,
  },
  {
    id: 'potentiometer',
    name: 'Плавная яркость',
    category: 'Аналоговый сигнал',
    level: 'Базовый',
    description: 'Потенциометр выдаёт напряжение от 0 до 5 В. Программа считывает его и повторно выводит значение в Serial.',
    task: 'Поворачивайте ручку на макетке и наблюдайте за значениями. Добавьте светодиод с резистором и управляйте яркостью через analogWrite().',
    circuit: analogCircuit('potentiometer'),
    code: `const int POT_PIN = A0;\n\nvoid setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  int raw = analogRead(POT_PIN);\n  float volts = raw * 5.0 / 1023.0;\n  Serial.print("ADC: ");\n  Serial.print(raw);\n  Serial.print("  Напряжение: ");\n  Serial.print(volts);\n  Serial.println(" В");\n  delay(300);\n}`,
    codeEsp32: `const int POT_PIN = A0;\n\nvoid setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  int raw = analogRead(POT_PIN);\n  float volts = raw * 3.3 / 1023.0;\n  Serial.print("ADC: ");\n  Serial.print(raw);\n  Serial.print("  Напряжение: ");\n  Serial.print(volts);\n  Serial.println(" В");\n  delay(300);\n}`,
  },
  {
    id: 'night-light',
    name: 'Автоматический ночник',
    category: 'Датчик + ШИМ',
    level: 'Практика',
    description: 'Датчик освещённости подключён к A0, а светодиод — к ШИМ-выходу D9. В темноте яркость увеличивается.',
    task: 'Меняйте освещённость на датчике. Подберите собственный порог и добавьте плавное включение вместо резкого.',
    circuit: nightCircuit,
    code: `const int LIGHT_PIN = A0;\nconst int LED_PIN = 9;\n\nvoid setup() {\n  pinMode(LED_PIN, OUTPUT);\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  int light = analogRead(LIGHT_PIN);\n  int brightness = map(light, 0, 1023, 220, 0);\n  analogWrite(LED_PIN, brightness);\n  Serial.print("Свет: ");\n  Serial.print(light);\n  Serial.print("  Яркость: ");\n  Serial.println(brightness);\n  delay(150);\n}`,
    codeEsp32: `const int LIGHT_PIN = A0;\nconst int LED_PIN = 9;\n\nvoid setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  int light = analogRead(LIGHT_PIN);\n  int brightness = map(light, 0, 1023, 220, 0);\n  ledcWrite(LED_PIN, brightness);\n  Serial.print("Свет: ");\n  Serial.print(light);\n  Serial.print("  Яркость: ");\n  Serial.println(brightness);\n  delay(150);\n}`,
  },
  {
    id: 'distance',
    name: 'Парковочный помощник',
    category: 'Ультразвук',
    level: 'Проект',
    description: 'HC-SR04 измеряет время возвращения эха. При расстоянии меньше 30 см включаются светодиод и зуммер.',
    task: 'Двигайте ползунок расстояния на датчике. Измените порог тревоги и добавьте промежуточный уровень предупреждения.',
    circuit: parkingCircuit,
    code: `const int TRIG_PIN = 7;\nconst int ECHO_PIN = 8;\nconst int LED_PIN = 13;\nconst int BUZZER_PIN = 4;\n\nvoid setup() {\n  pinMode(TRIG_PIN, OUTPUT);\n  pinMode(ECHO_PIN, INPUT);\n  pinMode(LED_PIN, OUTPUT);\n  pinMode(BUZZER_PIN, OUTPUT);\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  digitalWrite(TRIG_PIN, LOW);\n  delayMicroseconds(2);\n  digitalWrite(TRIG_PIN, HIGH);\n  delayMicroseconds(10);\n  digitalWrite(TRIG_PIN, LOW);\n\n  unsigned long duration = pulseIn(ECHO_PIN, HIGH, 30000);\n  float distance = duration * 0.0343 / 2;\n  bool danger = duration > 0 && distance < 30;\n  digitalWrite(LED_PIN, danger);\n  digitalWrite(BUZZER_PIN, danger);\n  Serial.print("Расстояние: ");\n  Serial.print(distance);\n  Serial.println(" см");\n  delay(200);\n}`,
  },
  {
    id: 'rgb',
    name: 'Смешивание цветов',
    category: 'Три канала ШИМ',
    level: 'Практика',
    description: 'Каждый канал RGB-светодиод получает собственный резистор и независимый ШИМ-сигнал.',
    task: 'Измените три аргумента setColor(). Получите фиолетовый, бирюзовый и тёплый белый цвет.',
    circuit: rgbCircuit,
    code: `const int RED_PIN = 9;\nconst int GREEN_PIN = 10;\nconst int BLUE_PIN = 11;\n\nvoid setColor(int red, int green, int blue) {\n  analogWrite(RED_PIN, red);\n  analogWrite(GREEN_PIN, green);\n  analogWrite(BLUE_PIN, blue);\n}\n\nvoid setup() {\n  pinMode(RED_PIN, OUTPUT);\n  pinMode(GREEN_PIN, OUTPUT);\n  pinMode(BLUE_PIN, OUTPUT);\n}\n\nvoid loop() {\n  setColor(255, 70, 0);\n  delay(1200);\n  setColor(0, 180, 220);\n  delay(1200);\n  setColor(160, 0, 255);\n  delay(1200);\n}`,
    codeEsp32: `const int RED_PIN = 9;\nconst int GREEN_PIN = 10;\nconst int BLUE_PIN = 11;\n\nvoid setColor(int red, int green, int blue) {\n  ledcWrite(RED_PIN, red);\n  ledcWrite(GREEN_PIN, green);\n  ledcWrite(BLUE_PIN, blue);\n}\n\nvoid setup() {\n  pinMode(RED_PIN, OUTPUT);\n  pinMode(GREEN_PIN, OUTPUT);\n  pinMode(BLUE_PIN, OUTPUT);\n}\n\nvoid loop() {\n  setColor(255, 70, 0);\n  delay(1200);\n  setColor(0, 180, 220);\n  delay(1200);\n  setColor(160, 0, 255);\n  delay(1200);\n}`,
  },
  {
    id: 'servo',
    name: 'Серво и потенциометр',
    category: 'Библиотека Servo',
    level: 'Проект',
    description: 'Показание потенциометра преобразуется в угол от 0 до 180°. Эмулятор измеряет реальные импульсы библиотеки Servo.',
    task: 'Поворачивайте потенциометр и следите за валом сервопривода. Ограничьте диапазон движения от 30 до 120°.',
    circuit: servoCircuit,
    code: `#include <Servo.h>\n\nServo servo;\nconst int POT_PIN = A0;\n\nvoid setup() {\n  servo.attach(9);\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  int raw = analogRead(POT_PIN);\n  int angle = map(raw, 0, 1023, 0, 180);\n  servo.write(angle);\n  Serial.print("Угол: ");\n  Serial.println(angle);\n  delay(100);\n}`,
    codeEsp32: `#include <ESP32Servo.h>\n\nServo servo;\nconst int POT_PIN = A0;\n\nvoid setup() {\n  servo.attach(9);\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  int raw = analogRead(POT_PIN);\n  int angle = map(raw, 0, 1023, 0, 180);\n  servo.write(angle);\n  Serial.print("Угол: ");\n  Serial.println(angle);\n  delay(100);\n}`,
  },
  {
    id: 'temperature',
    name: 'Цифровой термометр',
    category: 'TMP36',
    level: 'Практика',
    description: 'Напряжение TMP36 пересчитывается в температуру. Все промежуточные значения видны в мониторе порта.',
    task: 'Измените температуру на датчике. Добавьте предупреждение «Жарко!», когда температура превышает 30 °C.',
    circuit: analogCircuit('temperature'),
    code: `const int TEMP_PIN = A0;\n\nvoid setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  int raw = analogRead(TEMP_PIN);\n  float voltage = raw * 5.0 / 1024.0;\n  float temperature = (voltage - 0.5) * 100.0;\n  Serial.print("Температура: ");\n  Serial.print(temperature);\n  Serial.println(" °C");\n  delay(500);\n}`,
    codeEsp32: `const int TEMP_PIN = A0;\n\nvoid setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  int raw = analogRead(TEMP_PIN);\n  float voltage = raw * 3.3 / 1024.0;\n  float temperature = (voltage - 0.5) * 100.0;\n  Serial.print("Температура: ");\n  Serial.print(temperature);\n  Serial.println(" °C");\n  delay(500);\n}`,
  },
  {
    id: 'dht22',
    name: 'Климат с DHT22',
    category: 'Температура + влажность',
    level: 'Практика',
    description: 'DHT22 передаёт 40 бит: влажность, температуру и контрольную сумму. Используется стандартная библиотека DHT.',
    task: 'Измените температуру и влажность в инспекторе во время работы. Добавьте предупреждение при влажности выше 70%.',
    circuit: dht22Circuit,
    code: `#include <DHT.h>\n\nconst int DHT_PIN = 2;\nDHT dht(DHT_PIN, DHT22);\n\nvoid setup() {\n  Serial.begin(9600);\n  dht.begin();\n}\n\nvoid loop() {\n  delay(2000);\n  float humidity = dht.readHumidity();\n  float temperature = dht.readTemperature();\n  if (isnan(humidity) || isnan(temperature)) {\n    Serial.println("Ошибка чтения DHT22");\n    return;\n  }\n  Serial.print("Температура: ");\n  Serial.print(temperature, 1);\n  Serial.print(" °C  Влажность: ");\n  Serial.print(humidity, 1);\n  Serial.println(" %");\n}`,
  },
  {
    id: 'ds18b20',
    name: 'DS18B20 по 1-Wire',
    category: 'Цифровая шина',
    level: 'Проект',
    description: 'Прямая реализация 1-Wire без внешних библиотек: reset, presence, Convert T, scratchpad и проверка CRC.',
    task: 'Измените температуру датчика. Разберите функции owWriteBit(), owReadBit() и проверку контрольной суммы.',
    circuit: ds18b20Circuit,
    code: `const byte ONE_WIRE_PIN = 2;\n\nbool owReset() {\n  pinMode(ONE_WIRE_PIN, OUTPUT);\n  digitalWrite(ONE_WIRE_PIN, LOW);\n  delayMicroseconds(480);\n  pinMode(ONE_WIRE_PIN, INPUT_PULLUP);\n  delayMicroseconds(70);\n  bool present = digitalRead(ONE_WIRE_PIN) == LOW;\n  delayMicroseconds(410);\n  return present;\n}\n\nvoid owWriteBit(bool one) {\n  pinMode(ONE_WIRE_PIN, OUTPUT);\n  digitalWrite(ONE_WIRE_PIN, LOW);\n  if (one) {\n    delayMicroseconds(6);\n    pinMode(ONE_WIRE_PIN, INPUT_PULLUP);\n    delayMicroseconds(64);\n  } else {\n    delayMicroseconds(60);\n    pinMode(ONE_WIRE_PIN, INPUT_PULLUP);\n    delayMicroseconds(10);\n  }\n}\n\nbool owReadBit() {\n  pinMode(ONE_WIRE_PIN, OUTPUT);\n  digitalWrite(ONE_WIRE_PIN, LOW);\n  delayMicroseconds(3);\n  pinMode(ONE_WIRE_PIN, INPUT_PULLUP);\n  delayMicroseconds(10);\n  bool value = digitalRead(ONE_WIRE_PIN);\n  delayMicroseconds(50);\n  return value;\n}\n\nvoid owWriteByte(byte value) {\n  for (byte i = 0; i < 8; i++) {\n    owWriteBit(value & 1);\n    value >>= 1;\n  }\n}\n\nbyte owReadByte() {\n  byte value = 0;\n  for (byte i = 0; i < 8; i++) {\n    if (owReadBit()) value |= (1 << i);\n  }\n  return value;\n}\n\nbyte owCrc(byte *data, byte length) {\n  byte crc = 0;\n  while (length--) {\n    byte value = *data++;\n    for (byte i = 0; i < 8; i++) {\n      byte mix = (crc ^ value) & 1;\n      crc >>= 1;\n      if (mix) crc ^= 0x8C;\n      value >>= 1;\n    }\n  }\n  return crc;\n}\n\nvoid setup() {\n  Serial.begin(9600);\n  pinMode(ONE_WIRE_PIN, INPUT_PULLUP);\n}\n\nvoid loop() {\n  if (!owReset()) {\n    Serial.println("DS18B20 не найден");\n    delay(2000);\n    return;\n  }\n  owWriteByte(0xCC);\n  owWriteByte(0x44);\n  delay(800);\n\n  if (!owReset()) return;\n  owWriteByte(0xCC);\n  owWriteByte(0xBE);\n  byte data[9];\n  for (byte i = 0; i < 9; i++) data[i] = owReadByte();\n\n  if (owCrc(data, 8) != data[8]) {\n    Serial.println("Ошибка CRC");\n    return;\n  }\n  int16_t raw = data[0] | ((int16_t)data[1] << 8);\n  Serial.print("Температура: ");\n  Serial.print(raw / 16.0, 2);\n  Serial.println(" °C");\n  delay(1200);\n}`,
  },
]

export const LESSONS = [
  { id: 1, title: 'Знакомство с Arduino', duration: '8 минут', summary: 'Вход, программа и действие: как микроконтроллер управляет устройством.', topics: ['Arduino Uno', 'Вход и выход', 'Безопасность'], experiment: 'blink' },
  { id: 2, title: 'Плата и макетка', duration: '12 минут', summary: 'Контакты питания, внутренние соединения макетной платы и полярность деталей.', topics: ['GND и 5V', 'Макетная плата', 'Резистор'], experiment: 'blink' },
  { id: 3, title: 'Первая программа', duration: '10 минут', summary: 'setup(), loop(), компиляция и загрузка программы в микроконтроллер.', topics: ['setup', 'loop', 'delay'], experiment: 'blink' },
  { id: 4, title: 'Цифровые сигналы', duration: '15 минут', summary: 'HIGH, LOW и кнопка с внутренней подтяжкой INPUT_PULLUP.', topics: ['digitalWrite', 'digitalRead', 'INPUT_PULLUP'], experiment: 'button' },
  { id: 5, title: 'Аналоговый мир', duration: '15 минут', summary: 'Напряжение, значения 0–1023 и плавное управление через ШИМ.', topics: ['analogRead', 'analogWrite', 'map'], experiment: 'potentiometer' },
  { id: 6, title: 'Работа с датчиками', duration: '18 минут', summary: 'Освещённость, температура и преобразование показаний в понятные величины.', topics: ['TMP36', 'Датчик света', 'Serial'], experiment: 'temperature' },
  { id: 7, title: 'Время и расстояние', duration: '18 минут', summary: 'Импульсы TRIG и ECHO, pulseIn() и расчёт расстояния по скорости звука.', topics: ['pulseIn', 'HC-SR04', 'Условия'], experiment: 'distance' },
  { id: 8, title: 'Собираем устройство', duration: '20 минут', summary: 'Библиотеки, несколько компонентов и самостоятельная доработка готового проекта.', topics: ['Servo', 'Проект', 'Эксперимент'], experiment: 'servo' },
]
