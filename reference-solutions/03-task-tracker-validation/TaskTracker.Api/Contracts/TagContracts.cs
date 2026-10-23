namespace TaskTracker.Api.Contracts;

public record CreateTagRequest(string Name);

public record TagResponse(int Id, string Name, int TaskCount);
