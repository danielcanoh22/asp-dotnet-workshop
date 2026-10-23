namespace TaskTracker.Api.Entities;

public class Tag
{
    public int Id { get; set; }
    public required string Name { get; set; }

    public List<TaskItem> Tasks { get; set; } = [];
}
