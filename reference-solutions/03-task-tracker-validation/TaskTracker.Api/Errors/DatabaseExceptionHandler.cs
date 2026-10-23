using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace TaskTracker.Api.Errors;

// Translates database errors that the client can act on into 409 Conflict.
public sealed class DatabaseExceptionHandler(
    IProblemDetailsService problemDetailsService,
    ILogger<DatabaseExceptionHandler> logger) : IExceptionHandler
{
    // SQLite extended result codes: https://www.sqlite.org/rescode.html
    private const int SqliteConstraintForeignKey = 787;
    private const int SqliteConstraintUnique = 2067;

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        // Order matters: DbUpdateConcurrencyException is also a DbUpdateException.
        var problem = exception switch
        {
            DbUpdateConcurrencyException => Conflict(
                "concurrency.conflict",
                "The resource was modified by someone else",
                "Reload the resource to get its current version and try again."),

            DbUpdateException { InnerException: SqliteException { SqliteExtendedErrorCode: SqliteConstraintUnique } } =>
                Conflict(
                    "database.duplicate_value",
                    "Duplicate value",
                    "A record with the same unique value already exists."),

            DbUpdateException { InnerException: SqliteException { SqliteExtendedErrorCode: SqliteConstraintForeignKey } } =>
                Conflict(
                    "database.related_data_missing",
                    "Related data is missing",
                    "The record references data that does not exist or no longer exists."),

            _ => null,
        };

        if (problem is null)
        {
            return false; // Not ours: the next handler gets a chance.
        }

        logger.LogWarning(exception, "Database conflict on {Method} {Path}: {Code}",
            httpContext.Request.Method, httpContext.Request.Path, problem.Extensions["code"]);

        httpContext.Response.StatusCode = StatusCodes.Status409Conflict;

        return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problem,
            Exception = exception,
        });
    }

    private static ProblemDetails Conflict(string code, string title, string detail) =>
        new()
        {
            Status = StatusCodes.Status409Conflict,
            Title = title,
            Detail = detail,
            Extensions = { ["code"] = code },
        };
}
