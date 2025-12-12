# API 상세

## 개요

Ollama Router는 Ollama API와 100% 호환됩니다. 아래 두 엔드포인트를 지원합니다.

## POST /api/generate

텍스트 생성 API

### 요청

```http
POST /api/generate
Content-Type: application/json
```

```json
{
  "model": "llama3.2",
  "prompt": "왜 하늘은 파란색인가요?",
  "stream": true
}
```

### 요청 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| model | string | O | 모델 이름 |
| prompt | string | O | 입력 프롬프트 |
| stream | boolean | - | 스트리밍 여부 (기본: true) |
| temperature | number | - | 샘플링 온도 (0.0-2.0) |
| top_p | number | - | Top-P 샘플링 (0.0-1.0) |
| top_k | number | - | Top-K 샘플링 |
| num_predict | number | - | 최대 생성 토큰 수 |
| stop | string[] | - | 중지 시퀀스 |
| system | string | - | 시스템 프롬프트 |

### 응답 (스트리밍)

각 줄이 JSON 객체:

```json
{"model":"llama3.2","created_at":"2024-01-01T00:00:00Z","response":"하늘","done":false}
{"model":"llama3.2","created_at":"2024-01-01T00:00:00Z","response":"이","done":false}
{"model":"llama3.2","created_at":"2024-01-01T00:00:00Z","response":" 파란","done":false}
...
{"model":"llama3.2","created_at":"2024-01-01T00:00:00Z","response":"","done":true,"total_duration":1234567890}
```

### 응답 (비스트리밍)

`stream: false` 설정 시:

```json
{
  "model": "llama3.2",
  "created_at": "2024-01-01T00:00:00Z",
  "response": "하늘이 파란색인 이유는...",
  "done": true,
  "total_duration": 1234567890,
  "load_duration": 123456789,
  "prompt_eval_count": 10,
  "prompt_eval_duration": 12345678,
  "eval_count": 50,
  "eval_duration": 123456789
}
```

---

## POST /api/chat

채팅 API (멀티턴 대화)

### 요청

```http
POST /api/chat
Content-Type: application/json
```

```json
{
  "model": "llama3.2",
  "messages": [
    {"role": "system", "content": "당신은 친절한 AI 어시스턴트입니다."},
    {"role": "user", "content": "안녕하세요!"},
    {"role": "assistant", "content": "안녕하세요! 무엇을 도와드릴까요?"},
    {"role": "user", "content": "오늘 날씨가 어때요?"}
  ],
  "stream": true
}
```

### 요청 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| model | string | O | 모델 이름 |
| messages | array | O | 대화 메시지 배열 |
| stream | boolean | - | 스트리밍 여부 (기본: true) |
| temperature | number | - | 샘플링 온도 |
| top_p | number | - | Top-P 샘플링 |
| top_k | number | - | Top-K 샘플링 |
| num_predict | number | - | 최대 생성 토큰 수 |

### 메시지 객체

```json
{
  "role": "user | assistant | system",
  "content": "메시지 내용"
}
```

### 응답 (스트리밍)

```json
{"model":"llama3.2","created_at":"...","message":{"role":"assistant","content":"안녕"},"done":false}
{"model":"llama3.2","created_at":"...","message":{"role":"assistant","content":"하세요"},"done":false}
...
{"model":"llama3.2","created_at":"...","message":{"role":"assistant","content":""},"done":true}
```

---

## 에러 응답

### Ollama 에러

Ollama 서버에서 발생한 에러는 그대로 전달됩니다:

```json
{
  "error": "model 'unknown-model' not found"
}
```

HTTP 상태 코드도 원본 그대로 전달:
- 400 Bad Request
- 404 Not Found
- 500 Internal Server Error

### 라우터 에러

라우터 자체 에러:

```json
{
  "error": "Failed to connect to Ollama server"
}
```

HTTP 503 Service Unavailable:
- 모든 Ollama 서버 연결 불가 시

---

## 예제 코드

### Python

```python
import requests

response = requests.post(
    "http://localhost:5000/api/generate",
    json={
        "model": "llama3.2",
        "prompt": "Hello, world!",
        "stream": True
    },
    stream=True
)

for line in response.iter_lines():
    if line:
        data = json.loads(line)
        print(data.get("response", ""), end="", flush=True)
```

### JavaScript

```javascript
const response = await fetch("http://localhost:5000/api/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "llama3.2",
    prompt: "Hello, world!",
    stream: true
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const lines = chunk.split("\n").filter(line => line.trim());

  for (const line of lines) {
    const data = JSON.parse(line);
    process.stdout.write(data.response || "");
  }
}
```

### curl

```bash
# 스트리밍
curl -N http://localhost:5000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model":"llama3.2","prompt":"Hello","stream":true}'

# 비스트리밍
curl http://localhost:5000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model":"llama3.2","prompt":"Hello","stream":false}'
```
