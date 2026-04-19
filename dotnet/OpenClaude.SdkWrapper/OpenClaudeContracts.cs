using System.Collections.Generic;
using System.Runtime.Serialization;

namespace OpenClaude.SdkWrapper
{
    [DataContract]
    public sealed class OpenClaudeSdkRequest
    {
        [DataMember(Name = "prompt", EmitDefaultValue = false)]
        public string Prompt { get; set; }

        [DataMember(Name = "workingDirectory", EmitDefaultValue = false)]
        public string WorkingDirectory { get; set; }

        [DataMember(Name = "model", EmitDefaultValue = false)]
        public string Model { get; set; }

        [DataMember(Name = "outputFormat", EmitDefaultValue = false)]
        public string OutputFormat { get; set; }

        [DataMember(Name = "outputPolicy", EmitDefaultValue = false)]
        public OpenClaudeSdkOutputPolicy OutputPolicy { get; set; }

        [DataMember(Name = "metadata", EmitDefaultValue = false)]
        public Dictionary<string, string> Metadata { get; set; }

        [DataMember(Name = "permission", EmitDefaultValue = false)]
        public OpenClaudeSdkPermission Permission { get; set; }
    }

    [DataContract]
    public sealed class OpenClaudeSdkPermission
    {
        [DataMember(Name = "mode", EmitDefaultValue = false)]
        public string Mode { get; set; }
    }

    [DataContract]
    public sealed class OpenClaudeSdkOutputPolicy
    {
        [DataMember(Name = "baseDirectory", EmitDefaultValue = false)]
        public string BaseDirectory { get; set; }

        [DataMember(Name = "folderName", EmitDefaultValue = false)]
        public string FolderName { get; set; }

        [DataMember(Name = "writeResultJson", EmitDefaultValue = false)]
        public bool? WriteResultJson { get; set; }

        [DataMember(Name = "writeManifestJson", EmitDefaultValue = false)]
        public bool? WriteManifestJson { get; set; }
    }

    [DataContract]
    public sealed class OpenClaudeSdkUsage
    {
        [DataMember(Name = "input_tokens", EmitDefaultValue = false)]
        public int InputTokens { get; set; }

        [DataMember(Name = "output_tokens", EmitDefaultValue = false)]
        public int OutputTokens { get; set; }

        [DataMember(Name = "cache_creation_input_tokens", EmitDefaultValue = false)]
        public int CacheCreationInputTokens { get; set; }

        [DataMember(Name = "cache_read_input_tokens", EmitDefaultValue = false)]
        public int CacheReadInputTokens { get; set; }

        [DataMember(Name = "service_tier", EmitDefaultValue = false)]
        public string ServiceTier { get; set; }
    }

    [DataContract]
    public sealed class OpenClaudeSdkResult
    {
        [DataMember(Name = "success", EmitDefaultValue = false)]
        public bool Success { get; set; }

        [DataMember(Name = "status", EmitDefaultValue = false)]
        public string Status { get; set; }

        [DataMember(Name = "sessionId", EmitDefaultValue = false)]
        public string SessionId { get; set; }

        [DataMember(Name = "turnId", EmitDefaultValue = false)]
        public string TurnId { get; set; }

        [DataMember(Name = "resultText", EmitDefaultValue = false)]
        public string ResultText { get; set; }

        [DataMember(Name = "outputFolderPath", EmitDefaultValue = false)]
        public string OutputFolderPath { get; set; }

        [DataMember(Name = "usage", EmitDefaultValue = false)]
        public OpenClaudeSdkUsage Usage { get; set; }

        [DataMember(Name = "error", EmitDefaultValue = false)]
        public string Error { get; set; }
    }
}
