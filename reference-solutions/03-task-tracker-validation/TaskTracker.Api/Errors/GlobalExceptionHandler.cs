using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace TaskTracker.Api.Errors;

// Last handler in the chain: whatever nobody else handled ends here.
public sealed class GlobalExceptionHandler(
    IProblemDetailsService problemDetailsService,
    IHostEnvironment environment,
    ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        ProblemDetails problem;

        if (exception is BadHttpRequestException badRequest)
        {
            // In Development, Minimal APIs throw this for input they cannot bind (bad JSON, ?status=Nope).
            problem = new ProblemDetails
            {
                Status = badRequest.StatusCode,
                Title = "Bad request",
                Detail = badRequest.Message,
            };
        }
        else
        {
            // .NET 10 does not log exceptions that a handler marks as handled, so we log it ourselves.
            logger.LogError(exception, "Unhandled exception on {Method} {Path}",
                httpContext.Request.Method, httpContext.Request.Path);

            problem = new ProblemDetails
            {
                Status = StatusCodes.Status500InternalServerError,
                Title = "An unexpected error occurred",
                // Internal details help you while developing and help an attacker in production.
                Detail = environment.IsDevelopment() ? exception.Message : null,
            };
            problem.Extensions["code"] = "server.unexpected_error";
        }

        httpContext.Response.StatusCode = problem.Status.Value;

        return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problem,
            Exception = exception,
        });
    }
}
