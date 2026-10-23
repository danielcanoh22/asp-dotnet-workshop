using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using TaskTracker.Api.Contracts;
using TaskTracker.Api.Data;
using TaskTracker.Api.Entities;

namespace TaskTracker.Api.Endpoints;

public static class TagEndpoints
{
    public static IEndpointRouteBuilder MapTagEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/tags").WithTags("Tags");

        group.MapGet("/", GetAll);
        group.MapPost("/", Create)
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status409Conflict);
        group.MapDelete("/{id:int}", Delete);

        return app;
    }

    private static async Task<Ok<List<TagResponse>>> GetAll(
        TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var tags = await db.Tags
            .AsNoTracking()
            .OrderBy(t => t.Name)
            .Select(t => new TagResponse(t.Id, t.Name, t.Tasks.Count))
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(tags);
    }

    private static async Task<Results<Created<TagResponse>, ProblemHttpResult>> Create(
        CreateTagRequest request, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var name = request.Name.ToLowerInvariant();

        if (await db.Tags.AnyAsync(t => t.Name == name, cancellationToken))
        {
            return TypedResults.Problem(
                statusCode: StatusCodes.Status409Conflict,
                title: "Tag already exists",
                detail: $"A tag named '{name}' already exists.");
        }

        var tag = new Tag { Name = name };
        db.Tags.Add(tag);
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.Created($"/api/tags/{tag.Id}", new TagResponse(tag.Id, tag.Name, 0));
    }

    private static async Task<Results<NoContent, NotFound>> Delete(
        int id, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        // ExecuteDeleteAsync returns how many rows were deleted.
        var deleted = await db.Tags
            .Where(t => t.Id == id)
            .ExecuteDeleteAsync(cancellationToken);

        return deleted == 0 ? TypedResults.NotFound() : TypedResults.NoContent();
    }
}
