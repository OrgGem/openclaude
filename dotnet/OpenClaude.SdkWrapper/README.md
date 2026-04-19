# OpenClaude.SdkWrapper

Thin .NET wrapper around OpenClaude's SDK CLI contract.

## Target frameworks

- `net46`
- `netstandard2.0`

## What this package does

- Creates `request.json` from .NET models
- Executes OpenClaude SDK CLI wrapper process:
  - default: `bun run scripts/sdk-cli.ts --request "<request.json>"`
- Parses JSON result to `OpenClaudeSdkResult`

## Quick usage

```csharp
var client = new OpenClaudeSdkClient(new OpenClaudeSdkClientOptions
{
    WorkingDirectory = @"C:\work\openclaude",
    ExecutablePath = "bun",
    ArgumentsTemplate = "run scripts/sdk-cli.ts --request \"{0}\""
});

var response = await client.RunAsync(new OpenClaudeSdkRequest
{
    Prompt = "Summarize repository changes",
    WorkingDirectory = @"C:\work\openclaude",
    Permission = new OpenClaudeSdkPermission { Mode = "auto-allow" }
});

var resultText = response.Result != null ? response.Result.ResultText : response.StandardOutput;
```

## Pack NuGet

```bash
dotnet pack dotnet/OpenClaude.SdkWrapper/OpenClaude.SdkWrapper.csproj -c Release
```

Generated package will be in:

- `dotnet/OpenClaude.SdkWrapper/bin/Release/*.nupkg`
