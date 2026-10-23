using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using TaskTracker.Api.Contracts;
using TaskTracker.Api.Data;
using TaskTracker.Api.Entities;
using TaskTracker.Api.Mappings;

namespace TaskTracker.Api.Endpoints;

public static class TaskEndpoints
{
    private const string GetTaskByIdRoute = "GetTaskById";

    public static IEndpointRouteBuilder MapTaskEndpoints(this IEndpointRouteBuilder app)
    {
        var projectTasks = app.MapGroup("/api/projects/{projectId:int}/tasks").WithTags("Tasks");

        projectTasks.MapGet("/", GetByProject);
        projectTasks.MapPost("/", Create).ProducesValidationProblem();
        projectTasks.MapPost("/complete-all", CompleteAll);
        projectTasks.MapDelete("/completed", DeleteCompleted);

        var tasks = app.MapGroup("/api/tasks").WithTags("Tasks");

        tasks.MapGet("/{id:int}", GetById).WithName(GetTaskByIdRoute);
        tasks.MapPut("/{id:int}", Update).ProducesValidationProblem();
        tasks.MapPatch("/{id:int}/status", ChangeStatus);
        tasks.MapDelete("/{id:int}", Delete);
        tasks.MapPost("/{id:int}/tags", AssignTag);
        tasks.MapDelete("/{id:int}/tags/{tagId:int}", RemoveTag);

        return app;
    }

    private static async Task<Results<Ok<List<TaskResponse>>, NotFound>> GetByProject(
        int projectId,
        [AsParameters] TaskListQuery query,
        TaskTrackerDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await db.Projects.AnyAsync(p => p.Id == projectId, cancellationToken))
        {
            return TypedResults.NotFound();
        }

        // Nothing runs yet: we are only composing the query.
        var tasks = db.Tasks.AsNoTracking().Where(t => t.ProjectId == projectId);

        if (query.Status is { } status)
        {
            tasks = tasks.Where(t => t.Status == status);
        }

        if (query.Priority is { } priority)
        {
            tasks = tasks.Where(t => t.Priority == priority);
        }

        if (!string.IsNullOrWhiteSpace(query.Tag))
        {
            var tagName = query.Tag.Trim().ToLowerInvariant();
            tasks = tasks.Where(t => t.Tags.Any(tag => tag.Name == tagName));
        }

        tasks = query.SortBy switch
        {
            // Tasks without a due date go last.
            TaskSortField.DueDate => tasks.OrderBy(t => t.DueDate == null).ThenBy(t => t.DueDate),
            TaskSortField.Priority => tasks.OrderByDescending(t => t.Priority).ThenBy(t => t.Id),
            _ => tasks.OrderBy(t => t.CreatedAt).ThenBy(t => t.Id),
        };

        // ToListAsync is the moment the SQL is sent to the database.
        var result = await tasks
            .Select(TaskMappings.ToResponseExpression)
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(result);
    }

    private static async Task<Results<Ok<TaskResponse>, NotFound>> GetById(
        int id, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var task = await db.Tasks
            .AsNoTracking()
            .Where(t => t.Id == id)
            .Select(TaskMappings.ToResponseExpression)
            .SingleOrDefaultAsync(cancellationToken);

        return task is null ? TypedResults.NotFound() : TypedResults.Ok(task);
    }

    private static async Task<Results<CreatedAtRoute<TaskResponse>, NotFound>> Create(
        int projectId, CreateTaskRequest request, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        if (!await db.Projects.AnyAsync(p => p.Id == projectId, cancellationToken))
        {
            return TypedResults.NotFound();
        }

        var task = new TaskItem
        {
            ProjectId = projectId,
            Title = request.Title,
            Description = request.Description,
            Priority = request.Priority,
            DueDate = request.DueDate,
            CreatedAt = DateTime.UtcNow,
        };

        db.Tasks.Add(task);
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.CreatedAtRoute(task.ToResponse(), GetTaskByIdRoute, new { id = task.Id });
    }

    private static async Task<Results<NoContent, NotFound>> Update(
        int id, UpdateTaskRequest request, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var task = await db.Tasks.FindAsync([id], cancellationToken);
        if (task is null)
        {
            return TypedResults.NotFound();
        }

        task.Title = request.Title;
        task.Description = request.Description;
        task.Priority = request.Priority;
        task.DueDate = request.DueDate;
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.NoContent();
    }

    private static async Task<Results<NoContent, NotFound>> ChangeStatus(
        int id, ChangeTaskStatusRequest request, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var task = await db.Tasks.FindAsync([id], cancellationToken);
        if (task is null)
        {
            return TypedResults.NotFound();
        }

        task.Status = request.Status;
        task.CompletedAt = request.Status == TaskItemStatus.Done
            ? task.CompletedAt ?? DateTime.UtcNow
            : null;
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.NoContent();
    }

    private static async Task<Results<NoContent, NotFound>> Delete(
        int id, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var task = await db.Tasks.FindAsync([id], cancellationToken);
        if (task is null)
        {
            return TypedResults.NotFound();
        }

        db.Tasks.Remove(task);
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.NoContent();
    }

    private static async Task<Results<NoContent, NotFound>> AssignTag(
        int id, AssignTagRequest request, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var task = await db.Tasks
            .Include(t => t.Tags)
            .SingleOrDefaultAsync(t => t.Id == id, cancellationToken);
        var tag = await db.Tags.FindAsync([request.TagId], cancellationToken);
        if (task is null || tag is null)
        {
            return TypedResults.NotFound();
        }

        // Assigning twice is harmless: the second call changes nothing.
        if (!task.Tags.Contains(tag))
        {
            task.Tags.Add(tag);
            await db.SaveChangesAsync(cancellationToken);
        }

        return TypedResults.NoContent();
    }

    private static async Task<Results<NoContent, NotFound>> RemoveTag(
        int id, int tagId, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var task = await db.Tasks
            .Include(t => t.Tags)
            .SingleOrDefaultAsync(t => t.Id == id, cancellationToken);
        var tag = task?.Tags.SingleOrDefault(t => t.Id == tagId);
        if (task is null || tag is null)
        {
            return TypedResults.NotFound();
        }

        // Removes the row in the join table; the tag itself is kept.
        task.Tags.Remove(tag);
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.NoContent();
    }

    private static async Task<Results<Ok<BulkOperationResponse>, NotFound>> CompleteAll(
        int projectId, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        if (!await db.Projects.AnyAsync(p => p.Id == projectId, cancellationToken))
        {
            return TypedResults.NotFound();
        }

        // One UPDATE statement; no entity is loaded into memory.
        var now = DateTime.UtcNow;
        var affected = await db.Tasks
            .Where(t => t.ProjectId == projectId && t.Status != TaskItemStatus.Done)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(t => t.Status, TaskItemStatus.Done)
                .SetProperty(t => t.CompletedAt, now),
                cancellationToken);

        return TypedResults.Ok(new BulkOperationResponse(affected));
    }

    private static async Task<Results<Ok<BulkOperationResponse>, NotFound>> DeleteCompleted(
        int projectId, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        if (!await db.Projects.AnyAsync(p => p.Id == projectId, cancellationToken))
        {
            return TypedResults.NotFound();
        }

        // One DELETE statement; no entity is loaded into memory.
        var affected = await db.Tasks
            .Where(t => t.ProjectId == projectId && t.Status == TaskItemStatus.Done)
            .ExecuteDeleteAsync(cancellationToken);

        return TypedResults.Ok(new BulkOperationResponse(affected));
    }
}
