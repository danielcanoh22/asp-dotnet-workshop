namespace TaskTracker.Api.Entities;

// Stored as an integer on purpose: Low < Medium < High, so ORDER BY works.
public enum TaskPriority
{
    Low,
    Medium,
    High,
}
