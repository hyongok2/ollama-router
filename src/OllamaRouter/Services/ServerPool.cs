using Microsoft.Extensions.Options;
using OllamaRouter.Configuration;

namespace OllamaRouter.Services;

public class ServerPool : IDisposable
{
    private readonly List<ServerEntry> _servers;
    private readonly object _lock = new();
    private bool _disposed;

    public ServerPool(IOptions<OllamaSettings> options)
    {
        var settings = options.Value;

        if (settings.Servers.Count == 0)
        {
            throw new InvalidOperationException("No Ollama servers configured");
        }

        _servers = settings.Servers
            .Select(url => new ServerEntry(url, settings.MaxConcurrentPerServer))
            .ToList();
    }

    public async Task<ServerLease> AcquireServerAsync(CancellationToken cancellationToken = default)
    {
        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();

            // Try to acquire immediately from least-loaded server
            var entry = TryAcquireLeastLoaded();
            if (entry != null)
            {
                return new ServerLease(entry);
            }

            // All servers full - wait for any slot to open
            var acquired = await WaitForAnySlotAsync(cancellationToken);
            return new ServerLease(acquired);
        }
    }

    private ServerEntry? TryAcquireLeastLoaded()
    {
        lock (_lock)
        {
            // Find server with most available slots (= least connections)
            var candidates = _servers
                .Select((server, index) => new { server, index, available = server.Semaphore.CurrentCount })
                .Where(x => x.available > 0)
                .OrderByDescending(x => x.available)
                .ThenBy(x => x.index)
                .ToList();

            foreach (var candidate in candidates)
            {
                if (candidate.server.Semaphore.Wait(0))
                {
                    return candidate.server;
                }
            }

            return null;
        }
    }

    private async Task<ServerEntry> WaitForAnySlotAsync(CancellationToken cancellationToken)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var tasks = new List<Task<ServerEntry>>();

        foreach (var server in _servers)
        {
            tasks.Add(WaitForServerAsync(server, cts.Token));
        }

        var completedTask = await Task.WhenAny(tasks);
        cts.Cancel(); // Cancel other waiting tasks

        return await completedTask;
    }

    private async Task<ServerEntry> WaitForServerAsync(ServerEntry server, CancellationToken cancellationToken)
    {
        await server.Semaphore.WaitAsync(cancellationToken);
        return server;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        foreach (var server in _servers)
        {
            server.Semaphore.Dispose();
        }
    }
}

public class ServerEntry
{
    public string Url { get; }
    public SemaphoreSlim Semaphore { get; }

    public ServerEntry(string url, int maxConcurrent)
    {
        Url = url.TrimEnd('/');
        Semaphore = new SemaphoreSlim(maxConcurrent, maxConcurrent);
    }
}

public class ServerLease : IDisposable
{
    private readonly ServerEntry _entry;
    private bool _disposed;

    public string ServerUrl => _entry.Url;

    public ServerLease(ServerEntry entry)
    {
        _entry = entry;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _entry.Semaphore.Release();
    }
}
