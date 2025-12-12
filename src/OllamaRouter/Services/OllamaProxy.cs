namespace OllamaRouter.Services;

public class OllamaProxy : IOllamaProxy
{
    private readonly ServerPool _serverPool;
    private readonly HttpClient _httpClient;

    public OllamaProxy(ServerPool serverPool, IHttpClientFactory httpClientFactory)
    {
        _serverPool = serverPool;
        _httpClient = httpClientFactory.CreateClient("Ollama");
    }

    public async Task ProxyRequestAsync(
        HttpContext context,
        string endpoint,
        CancellationToken cancellationToken = default)
    {
        using var lease = await _serverPool.AcquireServerAsync(cancellationToken);
        var targetUrl = $"{lease.ServerUrl}{endpoint}";

        try
        {
            await ForwardRequestAsync(context, targetUrl, cancellationToken);
        }
        catch (HttpRequestException)
        {
            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            await context.Response.WriteAsJsonAsync(
                new { error = "Failed to connect to Ollama server" },
                cancellationToken);
        }
    }

    private async Task ForwardRequestAsync(
        HttpContext context,
        string targetUrl,
        CancellationToken cancellationToken)
    {
        using var requestMessage = new HttpRequestMessage(HttpMethod.Post, targetUrl);

        // Forward request body
        requestMessage.Content = new StreamContent(context.Request.Body);
        requestMessage.Content.Headers.ContentType =
            new System.Net.Http.Headers.MediaTypeHeaderValue("application/json");

        using var response = await _httpClient.SendAsync(
            requestMessage,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken);

        context.Response.StatusCode = (int)response.StatusCode;
        context.Response.ContentType = response.Content.Headers.ContentType?.ToString()
            ?? "application/json";

        // Stream response body with immediate flush
        await using var responseStream = await response.Content.ReadAsStreamAsync(cancellationToken);
        var buffer = new byte[4096];
        int bytesRead;

        while ((bytesRead = await responseStream.ReadAsync(buffer, cancellationToken)) > 0)
        {
            await context.Response.Body.WriteAsync(buffer.AsMemory(0, bytesRead), cancellationToken);
            await context.Response.Body.FlushAsync(cancellationToken);
        }
    }
}
