# Ollama Router 기본 개념

## 개요

Ollama Router는 다중 Ollama 서버를 단일 엔드포인트로 통합하는 API 라우터입니다. 서비스 운영 환경에서 여러 Ollama 인스턴스를 효율적으로 관리하고 부하를 분산할 수 있습니다.

## 핵심 목표

1. **단일 진입점**: 클라이언트는 하나의 엔드포인트만 알면 됨
2. **투명한 프록시**: Ollama API와 100% 호환
3. **부하 분산**: 여러 서버에 요청을 균등하게 분배
4. **동시성 제어**: 서버당 최대 동시 요청 수 제한

## 핵심 개념

### 1. 투명한 프록시 (Transparent Proxy)

클라이언트는 실제 Ollama 서버의 존재를 알 필요가 없습니다.

```
기존: Client → Ollama Server
변경: Client → Ollama Router → Ollama Server(s)
```

- 요청/응답이 변환 없이 그대로 전달됨
- 모든 Ollama 옵션(temperature, top_p 등) 지원
- 에러 응답도 원본 그대로 전달

### 2. Least Connections 라우팅

가장 여유 있는 서버를 우선 선택합니다.

```
서버 상태 (현재 연결 수)
Server 1: 1
Server 2: 0  ← 선택됨
Server 3: 2
Server 4: 1
```

- 현재 연결 수가 가장 적은 서버 우선
- 동일한 경우 인덱스 순서로 선택
- 실시간으로 서버 부하 반영

### 3. 동시성 제어

각 서버당 최대 동시 요청 수를 제한합니다.

```
설정: MaxConcurrentPerServer = 2
서버 4개 = 최대 동시 요청 8개

상태 예시: [2, 2, 2, 2] = 모든 서버 꽉 참 → 대기 큐
```

- SemaphoreSlim 기반 구현
- 서버당 독립적인 제한
- 초과 요청은 슬롯이 빌 때까지 대기

### 4. 스트리밍 지원

토큰 단위로 즉시 클라이언트에 전달합니다.

```
Ollama Server → [chunk] → Router → [chunk] → Client
              → [chunk] →        → [chunk] →
              → [chunk] →        → [chunk] →
```

- 청크 단위 즉시 전송
- 버퍼링 없음 (FlushAsync 호출)
- 지연 시간 최소화

## 사용 사례

### 개발 환경
- 단일 서버로 간단히 테스트

### 프로덕션 환경
- 여러 GPU 서버 병렬 운영
- 부하 분산으로 응답 시간 단축
- 서버 장애 시에도 서비스 지속

### 에이전트 연동
- 기존 Ollama 연동 코드 변경 없이 라우터로 교체
- 동시 요청 시 자동 분배

## 제약 사항

### 지원 API
- `POST /api/chat` - 채팅
- `POST /api/generate` - 텍스트 생성

### 미지원 API
라우터는 순수 프록시 역할만 수행합니다:
- `/api/tags` - 모델 목록
- `/api/show` - 모델 정보
- `/api/pull` - 모델 다운로드
- `/api/embeddings` - 임베딩

이러한 API가 필요한 경우 개별 Ollama 서버에 직접 요청하세요.

## 성능 특성

| 항목 | 값 |
|------|------|
| 라우터 오버헤드 | 1-5ms |
| 최대 동시 요청 | 서버 수 × MaxConcurrentPerServer |
| 스트리밍 지연 | 청크당 < 1ms |
| 메모리 사용 | 매우 낮음 (스트림 기반) |
