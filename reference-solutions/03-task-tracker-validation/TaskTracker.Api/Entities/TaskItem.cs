namespace TaskTracker.Api.Entities;

// Named TaskItem (not Task) to avoid clashing with System.Threading.Tasks.Task.
public class TaskItem
{
    public const int MaxTags = 5;

    public int Id { get; set; }
    public required string Title { get; set; }
    public string? Description { get; set; }
    public TaskItemStatus Status { get; set; } = TaskItemStatus.Todo;
    public TaskPriority Priority { get; set; } = TaskPriority.Medium;
    public DateOnly? DueDate { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? CompletedAt { get; set; }

    // Concurrency token: grows on every change, so a stale copy can be detected.
    public int Version { get; set; }

    public int ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    public List<Tag> Tags { get; set; } = [];
}
