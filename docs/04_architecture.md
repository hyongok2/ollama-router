# 아키텍처

## 시스템 구조

```
┌─────────────────────────────────────────────────────────────────┐
│                        Ollama Router                            │
│  ┌───────────┐   ┌─────────────┐   ┌─────────────────────────┐ │
│  │  Program  │──▶│ OllamaProxy │──▶│      ServerPool         │ │
│  │ (Minimal  │   │             │   │                         │ │
│  │   API)    │   │  - Forward  │   │  - Least Connections    │ │
│  │           │   │  - Stream   │   │  - Semaphore Control    │ │
│  └───────────┘   └─────────────┘   └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       ┌───────────┐   ┌───────────┐   ┌───────────┐
       │  Ollama   │   │  Ollama   │   │  Ollama   │
       │ Server 1  │   │ Server 2  │   │ Server 3  │
       └───────────┘   └───────────┘   └───────────┘
```

## 컴포넌트

### Program.cs

애플리케이션 진입점 및 엔드포인트 정의

```csharp
app.MapPost("/api/chat", async (HttpContext context, IOllamaProxy proxy, CancellationToken ct) =>
{
    await proxy.ProxyRequestAsync(context, "/api/chat", ct);
});

app.MapPost("/api/generate", async (HttpContext context, IOllamaProxy proxy, CancellationToken ct) =>
{
    await proxy.ProxyRequestAsync(context, "/api/generate", ct);
});
```

**책임:**
- ASP.NET Core 설정
- DI 컨테이너 구성
- 엔드포인트 라우팅
- CORS 설정

### ServerPool

서버 선택 및 동시성 관리

```csharp
public class ServerPool
{
    private readonly List<ServerEntry> _servers;

    public async Task<ServerLease> AcquireServerAsync(CancellationToken ct)
    {
        // 1. Least Connections로 서버 선택 시도
        // 2. 모두 꽉 찬 경우 대기
        // 3. ServerLease 반환 (Dispose 시 자동 반환)
    }
}
```

**책임:**
- 서버 목록 관리
- Least Connections 알고리즘
- SemaphoreSlim 기반 동시성 제어
- 서버 슬롯 대여/반환

### ServerEntry

개별 서버 정보 및 세마포어

```csharp
public class ServerEntry
{
    public string Url { get; }
    public SemaphoreSlim Semaphore { get; }
}
```

**책임:**
- 서버 URL 저장
- 해당 서버의 세마포어 관리

### ServerLease

서버 슬롯 대여 객체 (IDisposable)

```csharp
public class ServerLease : IDisposable
{
    public string ServerUrl { get; }

    public void Dispose()
    {
        // 세마포어 자동 반환
        _entry.Semaphore.Release();
    }
}
```

**책임:**
- 대여된 서버 URL 제공
- `using` 문 종료 시 자동 반환

### OllamaProxy

HTTP 프록시 및 스트리밍 처리

```csharp
public class OllamaProxy : IOllamaProxy
{
    public async Task ProxyRequestAsync(HttpContext context, string endpoint, CancellationToken ct)
    {
        using var lease = await _serverPool.AcquireServerAsync(ct);
        // 요청 전달 및 응답 스트리밍
    }
}
```

**책임:**
- 서버 획득 (ServerPool)
- HTTP 요청 전달
- 스트리밍 응답 청크 단위 전송
- 에러 처리

## 데이터 흐름

### 요청 처리 흐름

```
1. Client Request
      │
      ▼
2. Program.cs (Endpoint)
      │
      ▼
3. OllamaProxy.ProxyRequestAsync()
      │
      ├─▶ 4. ServerPool.AcquireServerAsync()
      │         │
      │         ├─▶ TryAcquireLeastLoaded()  ──▶ 즉시 획득
      │         │
      │         └─▶ WaitForAnySlotAsync()    ──▶ 대기 후 획득
      │
      ▼
5. HttpClient.SendAsync() ──▶ Ollama Server
      │
      ▼
6. Stream Response (chunk by chunk)
      │
      ├─▶ context.Response.Body.WriteAsync()
      │
      └─▶ context.Response.Body.FlushAsync()
      │
      ▼
7. ServerLease.Dispose() ──▶ Semaphore.Release()
```

### Least Connections 선택 알고리즘

```csharp
private ServerEntry? TryAcquireLeastLoaded()
{
    lock (_lock)
    {
        var candidates = _servers
            .Select((server, index) => new {
                server,
                index,
                available = server.Semaphore.CurrentCount
            })
            .Where(x => x.available > 0)           // 여유 슬롯 있는 서버
            .OrderByDescending(x => x.available)   // 가장 여유 있는 순
            .ThenBy(x => x.index)                  // 동률 시 인덱스 순
            .ToList();

        foreach (var candidate in candidates)
        {
            if (candidate.server.Semaphore.Wait(0))  // 즉시 획득 시도
            {
                return candidate.server;
            }
        }

        return null;
    }
}
```

### 대기 처리

```csharp
private async Task<ServerEntry> WaitForAnySlotAsync(CancellationToken ct)
{
    using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);

    var tasks = _servers
        .Select(s => WaitForServerAsync(s, cts.Token))
        .ToList();

    // 가장 먼저 빈 서버를 획득
    var completed = await Task.WhenAny(tasks);
    cts.Cancel();  // 나머지 대기 취소

    return await completed;
}
```

## 스트리밍 처리

### 청크 단위 전송

```csharp
var buffer = new byte[4096];
int bytesRead;

while ((bytesRead = await responseStream.ReadAsync(buffer, ct)) > 0)
{
    await context.Response.Body.WriteAsync(buffer.AsMemory(0, bytesRead), ct);
    await context.Response.Body.FlushAsync(ct);  // 즉시 전송
}
```

**특징:**
- 4KB 버퍼로 청크 읽기
- 매 청크마다 FlushAsync() 호출
- 버퍼링 없이 즉시 클라이언트 전달

## 설정 구조

```csharp
public class OllamaSettings
{
    public const string SectionName = "Ollama";
    public List<string> Servers { get; set; } = [];
    public int MaxConcurrentPerServer { get; set; } = 2;
}
```

## 프로젝트 구조

```
src/OllamaRouter/
├── Program.cs                    # 진입점, 엔드포인트
├── Configuration/
│   └── OllamaSettings.cs         # 설정 바인딩
├── Models/
│   ├── ChatRequest.cs            # 참조용
│   └── GenerateRequest.cs        # 참조용
├── Services/
│   ├── IOllamaProxy.cs           # 인터페이스
│   ├── OllamaProxy.cs            # 프록시 구현
│   └── ServerPool.cs             # 서버 풀 관리
└── appsettings.json
```

## 기술 스택

| 컴포넌트 | 기술 |
|---------|------|
| Framework | ASP.NET Core 8.0 Minimal API |
| HTTP Client | IHttpClientFactory |
| 동시성 | SemaphoreSlim |
| 설정 | IOptions<T> 패턴 |
| DI | 내장 DI 컨테이너 |
