using Microsoft.EntityFrameworkCore;
using TaskTracker.Api.Entities;

namespace TaskTracker.Api.Data;

public static class DataSeeder
{
    // Used by Update-Database / dotnet ef database update (EF tools call the synchronous version).
    public static void Seed(DbContext context)
    {
        if (context.Set<Project>().Any() || context.Set<Tag>().Any())
        {
            return;
        }

        context.Set<Project>().AddRange(CreateSampleProjects());
        context.SaveChanges();
    }

    // Used by Database.MigrateAsync() when the app starts in Development.
    public static async Task SeedAsync(DbContext context, CancellationToken cancellationToken)
    {
        if (await context.Set<Project>().AnyAsync(cancellationToken)
            || await context.Set<Tag>().AnyAsync(cancellationToken))
        {
            return;
        }

        context.Set<Project>().AddRange(CreateSampleProjects());
        await context.SaveChangesAsync(cancellationToken);
    }

    private static List<Project> CreateSampleProjects()
    {
        var now = DateTime.UtcNow;
        var today = DateOnly.FromDateTime(now);

        var backend = new Tag { Name = "backend" };
        var frontend = new Tag { Name = "frontend" };
        var urgent = new Tag { Name = "urgent" };

        // Adding the projects also adds their tasks and tags: EF Core follows the navigations.
        return
        [
            new Project
            {
                Name = "Website redesign",
                Description = "New look and faster pages for the company website.",
                CreatedAt = now,
                Tasks =
                [
                    new TaskItem
                    {
                        Title = "Design the new home page",
                        Priority = TaskPriority.High,
                        DueDate = today.AddDays(3),
                        CreatedAt = now,
                        Tags = [frontend, urgent],
                    },
                    new TaskItem
                    {
                        Title = "Set up the contact form API",
                        Status = TaskItemStatus.InProgress,
                        DueDate = today.AddDays(7),
                        CreatedAt = now,
                        Tags = [backend],
                    },
                    new TaskItem
                    {
                        Title = "Choose the color palette",
                        Status = TaskItemStatus.Done,
                        Priority = TaskPriority.Low,
                        CreatedAt = now,
                        CompletedAt = now,
                        Tags = [frontend],
                    },
                ],
            },
            new Project
            {
                Name = "Mobile app launch",
                Description = "Everything needed to publish version 1.0.",
                CreatedAt = now,
                Tasks =
                [
                    new TaskItem
                    {
                        Title = "Fix the login crash",
                        Priority = TaskPriority.High,
                        DueDate = today.AddDays(1),
                        CreatedAt = now,
                        Tags = [backend, urgent],
                    },
                    new TaskItem
                    {
                        Title = "Write the store description",
                        Priority = TaskPriority.Low,
                        CreatedAt = now,
                    },
                ],
            },
        ];
    }
}
