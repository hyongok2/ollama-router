namespace OllamaRouter.Configuration;

public class OllamaSettings
{
    public const string SectionName = "Ollama";

    public List<string> Servers { get; set; } = [];

    public int MaxConcurrentPerServer { get; set; } = 2;
}
