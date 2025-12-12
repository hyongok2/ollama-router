namespace OllamaRouter.Services;

public interface IOllamaProxy
{
    Task ProxyRequestAsync(
        HttpContext context,
        string endpoint,
        CancellationToken cancellationToken = default);
}
