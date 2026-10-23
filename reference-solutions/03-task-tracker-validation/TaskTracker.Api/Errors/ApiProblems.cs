using Microsoft.AspNetCore.Http.HttpResults;

namespace TaskTracker.Api.Errors;

// Every business error the API can return, in one place: same shape and a stable "code" for clients.
public static class ApiProblems
{
    public static ProblemHttpResult TagAlreadyExists(string name) =>
        Conflict(
            "tag.already_exists",
            "Tag already exists",
            $"A tag named '{name}' already exists.");

    public static ProblemHttpResult ProjectHasOpenTasks(int openTasks) =>
        Conflict(
            "project.has_open_tasks",
            "Project has open tasks",
            $"The project has {openTasks} open task(s). Complete them first or repeat the request with ?force=true.");

    public static ProblemHttpResult TagLimitReached(int maxTags) =>
        Conflict(
            "task.tag_limit_reached",
            "Tag limit reached",
            $"A task can have at most {maxTags} tags.");

    private static ProblemHttpResult Conflict(string code, string title, string detail) =>
        TypedResults.Problem(
            statusCode: StatusCodes.Status409Conflict,
            title: title,
            detail: detail,
            extensions: new Dictionary<string, object?> { ["code"] = code });
}
