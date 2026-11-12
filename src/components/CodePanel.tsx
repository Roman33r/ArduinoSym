import { useEffect, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { cpp } from '@codemirror/lang-cpp'
import { oneDark } from '@codemirror/theme-one-dark'
import { FileCode2, Send, Terminal, Trash2 } from 'lucide-react'
import { arduinoAssist } from '../lib/arduinoAssist'
import type { BoardId } from '../lib/boards'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './ui/resizable'
import { useDefaultLayout } from 'react-resizable-panels'

interface CodePanelProps {
  code: string
  serial: string
  running: boolean
  resizable: boolean
  board: BoardId
  boardName: string
  chip: string
  onChange: (code: string) => void
  onClearSerial: () => void
  onSendSerial: (text: string) => void
}

export default function CodePanel({ code, serial, running, resizable, board, boardName, chip, onChange, onClearSerial, onSendSerial }: CodePanelProps) {
  const [input, setInput] = useState('')
  const outputRef = useRef<HTMLPreElement>(null)
  const { defaultLayout, onLayoutChange } = useDefaultLayout({ id: 'code-panel-split', panelIds: ['editor', 'serial'], storage: localStorage })

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [serial])

  const editorSection = (
    <section className="editor-section" aria-label="Редактор Arduino-кода">
      <header className="panel-header code-file-header">
        <div><FileCode2 size={16} /><strong>sketch.ino</strong><span>C++</span></div>
        <span className={running ? 'editor-state is-running' : 'editor-state'}>{running ? 'Выполняется' : boardName}</span>
      </header>
      <div className="editor-wrap">
        <CodeMirror
          value={code}
          height="100%"
          theme={oneDark}
          extensions={[cpp(), arduinoAssist(board)]}
          onChange={onChange}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            highlightActiveLine: true,
            foldGutter: true,
            autocompletion: true,
            closeBrackets: true,
            indentOnInput: true,
          }}
          aria-label="Код программы Arduino"
        />
      </div>
      <footer className="editor-footer"><span>{chip}</span><span>{code.split('\n').length} строк</span><span>{running ? 'Перезапустите, чтобы применить правки' : 'Код сохраняется локально'}</span></footer>
    </section>
  )

  const serialSection = (
    <section className="serial-section" aria-label="Монитор последовательного порта">
      <header className="panel-header">
        <div><Terminal size={16} /><strong>Монитор порта</strong><span>Serial</span></div>
        <button className="icon-text-button" type="button" onClick={onClearSerial}><Trash2 size={14} />Очистить</button>
      </header>
      <pre ref={outputRef} className="serial-output" aria-live="polite">{serial || 'Вывод программы появится здесь после запуска.'}</pre>
      <form className="serial-form" onSubmit={(event) => {
        event.preventDefault()
        if (!input.trim()) return
        onSendSerial(input)
        setInput('')
      }}>
        <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Строка для Serial…" aria-label="Текст для отправки в Serial" disabled={!running} />
        <button type="submit" aria-label="Отправить в Serial" disabled={!running || !input.trim()}><Send size={16} /></button>
      </form>
    </section>
  )

  return (
    <div className="code-panel">
      {resizable ? (
        <ResizablePanelGroup orientation="vertical" defaultLayout={defaultLayout} onLayoutChange={onLayoutChange} className="code-panel-group">
          <ResizablePanel defaultSize="62%" minSize="25%" className="code-rp" id="editor">
            {editorSection}
          </ResizablePanel>
          <ResizableHandle className="code-resize-handle" />
          <ResizablePanel defaultSize="38%" minSize="18%" className="code-rp" id="serial">
            {serialSection}
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <>{editorSection}{serialSection}</>
      )}
    </div>
  )
}
