# Ollama Router

다중 Ollama 서버를 단일 엔드포인트로 통합하는 API 라우터

## 목표

- 서비스 운영을 위한 다중 Ollama 인스턴스 연결
- Ollama API 완벽 호환 (drop-in replacement)
- 핵심 기능에 집중한 심플한 구현

## 아키텍처

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Client    │────▶│  Ollama Router   │────▶│  Ollama #1      │
│             │◀────│                  │◀────│  (concurrent=2) │
└─────────────┘     │  - Round-robin   │     └─────────────────┘
                    │  - Queue 관리     │     ┌─────────────────┐
                    │  - Streaming     │────▶│  Ollama #2      │
                    │                  │◀────│  (concurrent=2) │
                    └──────────────────┘     └─────────────────┘
```

## 핵심 요구사항

| 항목 | 내용 |
|------|------|
| API 호환성 | Ollama API 100% 호환 |
| 라우팅 | Round-robin (순차) |
| 동시성 | 서버당 2개 (총 = 서버 수 × 2) |
| 스트리밍 | 필수 지원 |
| 인증 | 없음 |

## 지원 API

| 엔드포인트 | 설명 |
|-----------|------|
| `POST /api/chat` | 채팅 (스트리밍) |
| `POST /api/generate` | 텍스트 생성 (스트리밍) |

## 설계 원칙

- 클라이언트는 백엔드 서버 존재를 모름 (투명한 프록시)
- 에러 응답은 Ollama 응답 그대로 전달
- 라우터 자체 에러(전체 서버 불가)만 503 반환
- Clean Code, SRP 원칙 준수

## 기술 스택

- ASP.NET Core 8.0 Minimal API
- HttpClient + IHttpClientFactory
- SemaphoreSlim (동시성 제어)

## 프로젝트 구조

```
src/OllamaRouter/
├── Program.cs                    # 진입점, DI, 엔드포인트 매핑
│
├── Models/
│   ├── ChatRequest.cs
│   ├── ChatResponse.cs
│   ├── GenerateRequest.cs
│   └── GenerateResponse.cs
│
├── Services/
│   ├── IOllamaProxy.cs           # 프록시 인터페이스
│   ├── OllamaProxy.cs            # HTTP 요청 + 스트리밍
│   └── ServerPool.cs             # 라우팅 + 동시성 관리
│
├── Configuration/
│   └── OllamaSettings.cs         # 설정 바인딩
│
└── appsettings.json
```

## 설정 예시

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

## 에러 처리

| 상황 | 처리 |
|------|------|
| Ollama 에러 응답 | 상태코드 + 바디 그대로 전달 |
| 라우터 에러 (전체 서버 불가) | 503 Service Unavailable |
