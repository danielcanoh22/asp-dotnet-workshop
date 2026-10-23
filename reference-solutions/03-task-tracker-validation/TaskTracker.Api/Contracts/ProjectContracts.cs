namespace TaskTracker.Api.Contracts;

public record CreateProjectRequest(string Name, string? Description = null);

public record UpdateProjectRequest(string Name, string? Description);

public record ProjectResponse(
    int Id,
    string Name,
    string? Description,
    DateTime CreatedAt,
    int TaskCount,
    int CompletedTaskCount);
