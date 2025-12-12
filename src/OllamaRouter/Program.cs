using OllamaRouter.Configuration;
using OllamaRouter.Services;

var builder = WebApplication.CreateBuilder(args);

// Configuration
builder.Services.Configure<OllamaSettings>(
    builder.Configuration.GetSection(OllamaSettings.SectionName));

// Services
builder.Services.AddSingleton<ServerPool>();
builder.Services.AddScoped<IOllamaProxy, OllamaProxy>();
builder.Services.AddHttpClient("Ollama", client =>
{
    client.Timeout = TimeSpan.FromMinutes(30);
});

// CORS
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

var app = builder.Build();

app.UseCors();

// Endpoints
app.MapPost("/api/chat", async (HttpContext context, IOllamaProxy proxy, CancellationToken ct) =>
{
    await proxy.ProxyRequestAsync(context, "/api/chat", ct);
});

app.MapPost("/api/generate", async (HttpContext context, IOllamaProxy proxy, CancellationToken ct) =>
{
    await proxy.ProxyRequestAsync(context, "/api/generate", ct);
});

app.Run();
