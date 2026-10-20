using System.Linq.Expressions;
using TaskTracker.Api.Contracts;
using TaskTracker.Api.Entities;

namespace TaskTracker.Api.Mappings;

public static class TaskMappings
{
    public static readonly Expression<Func<TaskItem, TaskResponse>> ToResponseExpression =
        task => new TaskResponse(
            task.Id,
            task.ProjectId,
            task.Title,
            task.Description,
            task.Status,
            task.Priority,
            task.DueDate,
            task.CreatedAt,
            task.CompletedAt,
            task.Tags.OrderBy(tag => tag.Name).Select(tag => tag.Name).ToList());

    private static readonly Func<TaskItem, TaskResponse> ToResponseFunc = ToResponseExpression.Compile();

    public static TaskResponse ToResponse(this TaskItem task) => ToResponseFunc(task);
}
