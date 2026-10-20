using System.ComponentModel.DataAnnotations;

namespace TaskTracker.Api.Contracts;

public record CreateTagRequest(
    [Required, StringLength(50), RegularExpression("^[a-zA-Z0-9-]+$",
        ErrorMessage = "Use only letters, numbers and hyphens.")] string Name);

public record TagResponse(int Id, string Name, int TaskCount);
