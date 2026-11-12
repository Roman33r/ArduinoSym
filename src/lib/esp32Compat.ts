import type { BoardId } from './boards'

export function adaptCodeToBoard(code: string, board: BoardId): string {
  if (board === 'esp32') {
    return code
      .replace(/#include\s*<Servo\.h>/g, '#include <ESP32Servo.h>')
      .replace(/\banalogWrite\(/g, 'ledcWrite(')
  }
  return code
    .replace(/#include\s*<ESP32Servo\.h>/g, '#include <Servo.h>')
    .replace(/\bledcWrite\(/g, 'analogWrite(')
}

// ESP32 API is emulated through AVR equivalents: ledcWrite drives the pin
// directly (Arduino Core 3.x style), the LEDC setup calls become no-ops.
const ESP32_PRELUDE = `#define ledcWrite(pin, duty) analogWrite(pin, duty)
inline void ledcSetup(uint8_t, double, uint8_t) {}
inline void ledcAttachPin(uint8_t, uint8_t) {}
inline void ledcDetachPin(uint8_t) {}
`

export function esp32CompileSource(code: string): string {
  const withServo = code.replace(/#include\s*<ESP32Servo\.h>/g, '#include <Servo.h>')
  return `${ESP32_PRELUDE}\n${withServo}`
}
