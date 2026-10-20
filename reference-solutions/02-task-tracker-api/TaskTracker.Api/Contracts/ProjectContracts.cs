using System.ComponentModel.DataAnnotations;

namespace TaskTracker.Api.Contracts;

public record CreateProjectRequest(
    [Required, StringLength(100)] string Name,
    [StringLength(500)] string? Description = null);

public record UpdateProjectRequest(
    [Required, StringLength(100)] string Name,
    [StringLength(500)] string? Description);

public record ProjectResponse(
    int Id,
    string Name,
    string? Description,
    DateTime CreatedAt,
    int TaskCount,
    int CompletedTaskCount);
