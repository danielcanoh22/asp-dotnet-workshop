using System.ComponentModel.DataAnnotations;
using TaskTracker.Api.Entities;

namespace TaskTracker.Api.Contracts;

public record CreateTaskRequest(
    [Required, StringLength(200)] string Title,
    [StringLength(2000)] string? Description = null,
    TaskPriority Priority = TaskPriority.Medium,
    DateOnly? DueDate = null);

public record UpdateTaskRequest(
    [Required, StringLength(200)] string Title,
    [StringLength(2000)] string? Description,
    TaskPriority Priority,
    DateOnly? DueDate);

public record ChangeTaskStatusRequest(TaskItemStatus Status);

public record AssignTagRequest(int TagId);

public enum TaskSortField
{
    CreatedAt,
    DueDate,
    Priority,
}

// Bound from the query string with [AsParameters]: ?status=Done&priority=High&tag=backend&sortBy=DueDate
public record TaskListQuery(
    TaskItemStatus? Status,
    TaskPriority? Priority,
    string? Tag,
    TaskSortField? SortBy);

public record TaskResponse(
    int Id,
    int ProjectId,
    string Title,
    string? Description,
    TaskItemStatus Status,
    TaskPriority Priority,
    DateOnly? DueDate,
    DateTime CreatedAt,
    DateTime? CompletedAt,
    List<string> Tags);

public record BulkOperationResponse(int Affected);
