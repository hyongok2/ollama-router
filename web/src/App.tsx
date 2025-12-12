import { useState, useRef } from 'react'
import './App.css'

interface Stats {
  startTime: number | null
  firstTokenTime: number | null
  tokenCount: number
  tps: number
}

function App() {
  const [host, setHost] = useState('localhost')
  const [port, setPort] = useState('5242')
  const [model, setModel] = useState('gpt-oss:20b')
  const [prompt, setPrompt] = useState('')
  const [output, setOutput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [stats, setStats] = useState<Stats>({
    startTime: null,
    firstTokenTime: null,
    tokenCount: 0,
    tps: 0
  })
  const abortControllerRef = useRef<AbortController | null>(null)

  const handleSubmit = async () => {
    if (!prompt.trim() || isLoading) return

    setOutput('')
    setIsLoading(true)
    const startTime = Date.now()
    setStats({ startTime, firstTokenTime: null, tokenCount: 0, tps: 0 })

    abortControllerRef.current = new AbortController()

    try {
      const response = await fetch(`http://${host}:${port}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: true }),
        signal: abortControllerRef.current.signal
      })

      if (!response.ok) {
        const error = await response.text()
        setOutput(`Error: ${error}`)
        setIsLoading(false)
        return
      }

      const reader = response.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      let firstToken = true
      let tokenCount = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter(line => line.trim())

        for (const line of lines) {
          try {
            const json = JSON.parse(line)
            if (json.response) {
              if (firstToken) {
                setStats(prev => ({ ...prev, firstTokenTime: Date.now() }))
                firstToken = false
              }
              tokenCount++
              setOutput(prev => prev + json.response)

              const elapsed = (Date.now() - startTime) / 1000
              const tps = elapsed > 0 ? tokenCount / elapsed : 0
              setStats(prev => ({ ...prev, tokenCount, tps }))
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setOutput(`Error: ${err.message}`)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    abortControllerRef.current?.abort()
    setIsLoading(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleSubmit()
    }
  }

  const formatTime = (ms: number | null) => {
    if (ms === null) return '-'
    return `${ms}ms`
  }

  const ttft = stats.firstTokenTime && stats.startTime
    ? stats.firstTokenTime - stats.startTime
    : null

  return (
    <div className="container">
      <h1>Ollama Router Tester</h1>

      <div className="config-row">
        <div className="input-group">
          <label>Host</label>
          <input
            type="text"
            value={host}
            onChange={e => setHost(e.target.value)}
            placeholder="localhost"
          />
        </div>
        <div className="input-group">
          <label>Port</label>
          <input
            type="text"
            value={port}
            onChange={e => setPort(e.target.value)}
            placeholder="5242"
          />
        </div>
        <div className="input-group model">
          <label>Model</label>
          <input
            type="text"
            value={model}
            onChange={e => setModel(e.target.value)}
            placeholder="model name"
          />
        </div>
      </div>

      <div className="prompt-section">
        <div className="prompt-header">
          <label>Prompt</label>
          <span className="char-count">{prompt.length} chars</span>
        </div>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter your prompt here... (Ctrl+Enter to submit)"
          rows={8}
        />
      </div>

      <div className="button-row">
        <button onClick={handleSubmit} disabled={isLoading || !prompt.trim()}>
          {isLoading ? 'Generating...' : 'Generate'}
        </button>
        {isLoading && (
          <button onClick={handleCancel} className="cancel">
            Cancel
          </button>
        )}
      </div>

      <div className="stats-row">
        <span>TTFT: {formatTime(ttft)}</span>
        <span>Tokens: {stats.tokenCount}</span>
        <span>TPS: {stats.tps.toFixed(2)}</span>
      </div>

      <div className="output-section">
        <label>Output</label>
        <div className="output-box">
          {output || <span className="placeholder">Response will appear here...</span>}
        </div>
      </div>
    </div>
  )
}

export default App
