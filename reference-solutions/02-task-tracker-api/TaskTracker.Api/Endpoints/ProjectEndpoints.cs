using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using TaskTracker.Api.Contracts;
using TaskTracker.Api.Data;
using TaskTracker.Api.Entities;
using TaskTracker.Api.Mappings;

namespace TaskTracker.Api.Endpoints;

public static class ProjectEndpoints
{
    private const string GetProjectByIdRoute = "GetProjectById";

    public static IEndpointRouteBuilder MapProjectEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/projects").WithTags("Projects");

        group.MapGet("/", GetAll);
        group.MapGet("/{id:int}", GetById).WithName(GetProjectByIdRoute);
        group.MapPost("/", Create).ProducesValidationProblem();
        group.MapPut("/{id:int}", Update).ProducesValidationProblem();
        group.MapDelete("/{id:int}", Delete);

        return app;
    }

    private static async Task<Ok<List<ProjectResponse>>> GetAll(
        TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var projects = await db.Projects
            .AsNoTracking()
            .OrderBy(p => p.Name)
            .Select(ProjectMappings.ToResponseExpression)
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(projects);
    }

    private static async Task<Results<Ok<ProjectResponse>, NotFound>> GetById(
        int id, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var project = await db.Projects
            .AsNoTracking()
            .Where(p => p.Id == id)
            .Select(ProjectMappings.ToResponseExpression)
            .SingleOrDefaultAsync(cancellationToken);

        return project is null ? TypedResults.NotFound() : TypedResults.Ok(project);
    }

    private static async Task<CreatedAtRoute<ProjectResponse>> Create(
        CreateProjectRequest request, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var project = new Project
        {
            Name = request.Name,
            Description = request.Description,
            CreatedAt = DateTime.UtcNow,
        };

        db.Projects.Add(project);
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.CreatedAtRoute(project.ToResponse(), GetProjectByIdRoute, new { id = project.Id });
    }

    private static async Task<Results<NoContent, NotFound>> Update(
        int id, UpdateProjectRequest request, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var project = await db.Projects.FindAsync([id], cancellationToken);
        if (project is null)
        {
            return TypedResults.NotFound();
        }

        // The entity is tracked: SaveChanges detects what changed and sends an UPDATE.
        project.Name = request.Name;
        project.Description = request.Description;
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.NoContent();
    }

    private static async Task<Results<NoContent, NotFound>> Delete(
        int id, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var project = await db.Projects.FindAsync([id], cancellationToken);
        if (project is null)
        {
            return TypedResults.NotFound();
        }

        // The database cascades the delete to the project's tasks.
        db.Projects.Remove(project);
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.NoContent();
    }
}
