using System.Linq.Expressions;
using TaskTracker.Api.Contracts;
using TaskTracker.Api.Entities;

namespace TaskTracker.Api.Mappings;

public static class ProjectMappings
{
    // An expression tree: EF Core translates it to SQL inside Select(...).
    public static readonly Expression<Func<Project, ProjectResponse>> ToResponseExpression =
        project => new ProjectResponse(
            project.Id,
            project.Name,
            project.Description,
            project.CreatedAt,
            project.Tasks.Count,
            project.Tasks.Count(t => t.Status == TaskItemStatus.Done));

    // The same mapping compiled once, for objects that are already in memory.
    private static readonly Func<Project, ProjectResponse> ToResponseFunc = ToResponseExpression.Compile();

    public static ProjectResponse ToResponse(this Project project) => ToResponseFunc(project);
}
