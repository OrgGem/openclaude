using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace OpenClaude.SdkWrapper
{
    public sealed class OpenClaudeSdkClientOptions
    {
        public string WorkingDirectory { get; set; }
        public string ExecutablePath { get; set; } = "bun";
        public string ArgumentsTemplate { get; set; } = "run scripts/sdk-cli.ts --request \"{0}\"";
    }

    public sealed class OpenClaudeSdkRunResponse
    {
        public int ExitCode { get; set; }
        public string StandardOutput { get; set; }
        public string StandardError { get; set; }
        public OpenClaudeSdkResult Result { get; set; }
    }

    public sealed class OpenClaudeSdkClient
    {
        private readonly OpenClaudeSdkClientOptions _options;

        public OpenClaudeSdkClient(OpenClaudeSdkClientOptions options)
        {
            if (options == null) throw new ArgumentNullException(nameof(options));
            if (string.IsNullOrWhiteSpace(options.WorkingDirectory))
                throw new ArgumentException("WorkingDirectory is required.", nameof(options));
            if (!Directory.Exists(options.WorkingDirectory))
                throw new DirectoryNotFoundException("WorkingDirectory not found: " + options.WorkingDirectory);

            _options = options;
        }

        public async Task<OpenClaudeSdkRunResponse> RunAsync(OpenClaudeSdkRequest request, CancellationToken cancellationToken = default(CancellationToken))
        {
            if (request == null) throw new ArgumentNullException(nameof(request));
            if (string.IsNullOrWhiteSpace(request.Prompt))
                throw new ArgumentException("Prompt is required.", nameof(request));

            var tempRoot = Path.Combine(Path.GetTempPath(), "openclaude-dotnet-wrapper", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(tempRoot);
            var requestPath = Path.Combine(tempRoot, "request.json");

            try
            {
                WriteJsonFile(requestPath, request);
                var arguments = string.Format(_options.ArgumentsTemplate, requestPath);
                return await RunProcessAsync(_options.ExecutablePath, arguments, cancellationToken).ConfigureAwait(false);
            }
            finally
            {
                TryDeleteDirectory(tempRoot);
            }
        }

        private async Task<OpenClaudeSdkRunResponse> RunProcessAsync(string fileName, string arguments, CancellationToken cancellationToken)
        {
            var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = fileName,
                    Arguments = arguments,
                    WorkingDirectory = _options.WorkingDirectory,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                },
                EnableRaisingEvents = true,
            };

            if (!process.Start())
            {
                throw new InvalidOperationException("Failed to start process: " + fileName);
            }

            var stdoutTask = process.StandardOutput.ReadToEndAsync();
            var stderrTask = process.StandardError.ReadToEndAsync();
            var waitForExitTask = Task.Run(() =>
            {
                process.WaitForExit();
                var exitCode = process.ExitCode;
                return exitCode;
            });
            var cancellationTcs = new TaskCompletionSource<bool>();

            using (cancellationToken.Register(() =>
            {
                try
                {
                    process.Kill();
                }
                catch (InvalidOperationException)
                {
                    // Process may already have exited by the time Kill() is invoked.
                }
                cancellationTcs.TrySetResult(true);
            }))
            {
                var completedTask = await Task.WhenAny(waitForExitTask, cancellationTcs.Task).ConfigureAwait(false);
                if (completedTask == cancellationTcs.Task)
                {
                    throw new OperationCanceledException(cancellationToken);
                }
            }

            string stdout;
            string stderr;
            try
            {
                stdout = await stdoutTask.ConfigureAwait(false);
                stderr = await stderrTask.ConfigureAwait(false);
            }
            catch (IOException ex)
            {
                throw new InvalidOperationException("Failed to read OpenClaude SDK CLI process output streams.", ex);
            }
            catch (ObjectDisposedException ex)
            {
                throw new InvalidOperationException("OpenClaude SDK CLI process output streams were disposed unexpectedly.", ex);
            }

            var response = new OpenClaudeSdkRunResponse
            {
                ExitCode = process.ExitCode,
                StandardOutput = stdout,
                StandardError = stderr,
            };

            if (!string.IsNullOrWhiteSpace(stdout))
            {
                var trimmed = stdout.Trim();
                try
                {
                    response.Result = ReadJson<OpenClaudeSdkResult>(trimmed);
                }
                catch (SerializationException)
                {
                    // Keep raw output in StandardOutput for callers when payload is not valid contract JSON.
                }
            }

            if (response.ExitCode != 0)
            {
                var stderrPreview = Truncate(response.StandardError, 400);
                throw new InvalidOperationException(
                    "OpenClaude SDK CLI process failed with exit code " + response.ExitCode + ". stderr: " + stderrPreview);
            }

            return response;
        }

        private static void WriteJsonFile(string path, OpenClaudeSdkRequest request)
        {
            var serializer = new DataContractJsonSerializer(typeof(OpenClaudeSdkRequest));
            using (var stream = File.Create(path))
            {
                serializer.WriteObject(stream, request);
            }
        }

        private static T ReadJson<T>(string json)
        {
            var serializer = new DataContractJsonSerializer(typeof(T));
            var bytes = Encoding.UTF8.GetBytes(json);
            using (var stream = new MemoryStream(bytes))
            {
                return (T)serializer.ReadObject(stream);
            }
        }

        private static void TryDeleteDirectory(string path)
        {
            try
            {
                if (Directory.Exists(path))
                {
                    Directory.Delete(path, true);
                }
            }
            catch (IOException)
            {
                // Best-effort cleanup; temp folders may still be locked by antivirus/indexers.
            }
            catch (UnauthorizedAccessException)
            {
                // Best-effort cleanup; caller does not rely on temp folder deletion.
            }
        }

        private static string Truncate(string value, int maxLength)
        {
            if (string.IsNullOrEmpty(value)) return string.Empty;
            return value.Length <= maxLength ? value : value.Substring(0, maxLength) + "...";
        }
    }
}
