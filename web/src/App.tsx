import { useState, useRef, useEffect } from 'react'
import './App.css'

interface Stats {
  startTime: number | null
  firstTokenTime: number | null
  tokenCount: number
  tps: number
}

const STORAGE_KEY = 'ollama-router-config'

function App() {
  const [host, setHost] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved).host || 'localhost' : 'localhost'
  })
  const [port, setPort] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved).port || '5242' : '5242'
  })
  const [model, setModel] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved).model || '' : ''
  })
  const [prompt, setPrompt] = useState('')
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [stats, setStats] = useState<Stats>({
    startTime: null,
    firstTokenTime: null,
    tokenCount: 0,
    tps: 0
  })
  const abortControllerRef = useRef<AbortController | null>(null)
  const outputRef = useRef<HTMLDivElement>(null)

  // Save config to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ host, port, model }))
  }, [host, port, model])

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current && isLoading) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output, isLoading])

  const handleSubmit = async () => {
    if (!prompt.trim() || isLoading) return

    setOutput('')
    setError('')
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
        const errorText = await response.text()
        setError(errorText || `HTTP ${response.status}`)
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
            if (json.error) {
              setError(json.error)
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    abortControllerRef.current?.abort()
    setIsLoading(false)
  }

  const handleCopy = async () => {
    if (!output) return
    await navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClear = () => {
    setOutput('')
    setError('')
    setStats({ startTime: null, firstTokenTime: null, tokenCount: 0, tps: 0 })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const formatTime = (ms: number | null) => {
    if (ms === null) return '-'
    return `${ms.toLocaleString()}ms`
  }

  const ttft = stats.firstTokenTime && stats.startTime
    ? stats.firstTokenTime - stats.startTime
    : null

  return (
    <div className="container">
      <header className="header">
        <h1>Ollama Router</h1>
        <span className="status-badge">v1.0</span>
      </header>

      <section className="config-section">
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
          <div className="input-group">
            <label>Model</label>
            <input
              type="text"
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="llama3.2, gpt-oss:20b, etc."
            />
          </div>
        </div>
      </section>

      <section className="prompt-section">
        <div className="prompt-header">
          <label>Prompt</label>
          <span className="char-count">{prompt.length.toLocaleString()} chars</span>
        </div>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter your prompt here... (Ctrl+Enter to submit)"
          disabled={isLoading}
        />
      </section>

      <div className="action-row">
        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={isLoading || !prompt.trim() || !model.trim()}
        >
          {isLoading ? (
            <>
              <span className="spinner"></span>
              Generating...
            </>
          ) : (
            'Generate'
          )}
        </button>
        {isLoading && (
          <button className="btn btn-danger" onClick={handleCancel}>
            Cancel
          </button>
        )}
        {output && !isLoading && (
          <button className="btn btn-icon" onClick={handleClear} title="Clear output">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2.5 1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1H3v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V4h.5a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1H2.5zm3 4a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5zM8 5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7A.5.5 0 0 1 8 5zm3 .5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 1 0z"/>
            </svg>
          </button>
        )}
      </div>

      <div className="stats-row">
        <div className="stat-item">
          <span className="stat-label">TTFT</span>
          <span className={`stat-value ${ttft !== null ? 'highlight' : ''}`}>
            {formatTime(ttft)}
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Tokens</span>
          <span className="stat-value">{stats.tokenCount.toLocaleString()}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Speed</span>
          <span className={`stat-value ${stats.tps > 0 ? 'highlight' : ''}`}>
            {stats.tps > 0 ? `${stats.tps.toFixed(1)} t/s` : '-'}
          </span>
        </div>
      </div>

      <section className="output-section">
        <div className="output-header">
          <label>Response</label>
          {output && (
            <button
              className={`btn btn-icon ${copied ? 'copied' : ''}`}
              onClick={handleCopy}
              title={copied ? 'Copied!' : 'Copy to clipboard'}
            >
              {copied ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
                  <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
                </svg>
              )}
            </button>
          )}
        </div>
        <div className="output-box" ref={outputRef}>
          {error ? (
            <div className="error-message">{error}</div>
          ) : output ? (
            <>
              {output}
              {isLoading && <span className="cursor"></span>}
            </>
          ) : (
            <span className="placeholder">Response will appear here...</span>
          )}
        </div>
      </section>
    </div>
  )
}

export default App
