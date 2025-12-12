# 사용 방법

## 요구 사항

- .NET 8.0 SDK
- Node.js 18+ (웹 테스터 사용 시)
- Ollama 서버 1개 이상

## 빠른 시작

### 1. 빌드

```bash
cd src/OllamaRouter
dotnet build
```

### 2. 설정

`appsettings.json` 수정:

```json
{
  "Ollama": {
    "Servers": [
      "http://192.168.1.10:11434",
      "http://192.168.1.11:11434"
    ],
    "MaxConcurrentPerServer": 2
  }
}
```

### 3. 실행

```bash
dotnet run
```

기본 포트: `http://localhost:5000`

## 설정 상세

### 서버 목록 (Servers)

Ollama 서버 URL 배열:

```json
{
  "Ollama": {
    "Servers": [
      "http://gpu-server-1:11434",
      "http://gpu-server-2:11434",
      "http://gpu-server-3:11434"
    ]
  }
}
```

- 최소 1개 이상 필요
- URL 끝에 슬래시(/) 없이 입력
- 포트 번호 필수

### 동시 요청 제한 (MaxConcurrentPerServer)

서버당 최대 동시 요청 수:

```json
{
  "Ollama": {
    "MaxConcurrentPerServer": 2
  }
}
```

- 기본값: 2
- Ollama의 `OLLAMA_NUM_PARALLEL` 설정과 일치시키기 권장
- 총 최대 동시 요청 = 서버 수 × MaxConcurrentPerServer

### 포트 변경

`launchSettings.json` 또는 환경 변수:

```bash
# 환경 변수로 포트 지정
ASPNETCORE_URLS=http://0.0.0.0:8080 dotnet run
```

## 테스트

### curl 테스트

```bash
# Generate API
curl http://localhost:5000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model":"llama3.2","prompt":"Hello","stream":true}'

# Chat API
curl http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"model":"llama3.2","messages":[{"role":"user","content":"Hello"}]}'
```

### 웹 테스터

```bash
cd web
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 접속

## 프로덕션 배포

### 빌드

```bash
dotnet publish -c Release -o ./publish
```

### systemd 서비스 (Linux)

`/etc/systemd/system/ollama-router.service`:

```ini
[Unit]
Description=Ollama Router
After=network.target

[Service]
WorkingDirectory=/opt/ollama-router
ExecStart=/opt/ollama-router/OllamaRouter
Restart=always
RestartSec=10
User=www-data
Environment=ASPNETCORE_URLS=http://0.0.0.0:5000

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable ollama-router
sudo systemctl start ollama-router
```

### Docker (예시)

```dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY publish/ .
ENV ASPNETCORE_URLS=http://0.0.0.0:5000
EXPOSE 5000
ENTRYPOINT ["dotnet", "OllamaRouter.dll"]
```

## 기존 시스템 연동

### 엔드포인트만 변경

기존 Ollama 연동 코드에서 URL만 변경:

```python
# Before
client = OllamaClient("http://gpu-server:11434")

# After
client = OllamaClient("http://ollama-router:5000")
```

### 모든 옵션 호환

기존에 사용하던 모든 옵션 그대로 사용 가능:

```json
{
  "model": "llama3.2",
  "prompt": "Hello",
  "stream": true,
  "temperature": 0.7,
  "top_p": 0.9,
  "num_predict": 100
}
```

## 문제 해결

### 연결 실패

```
Error: Failed to connect to Ollama server
```

- Ollama 서버 실행 여부 확인
- 네트워크/방화벽 확인
- URL 오타 확인

### 모든 서버 포화

요청이 지연되는 경우:
- MaxConcurrentPerServer 값 증가 검토
- 서버 추가 검토
- Ollama의 `OLLAMA_NUM_PARALLEL` 설정 확인

### CORS 오류 (웹 클라이언트)

라우터에 CORS가 이미 설정되어 있습니다. 여전히 문제가 있다면:
- 브라우저 캐시 삭제
- 올바른 라우터 URL 확인
