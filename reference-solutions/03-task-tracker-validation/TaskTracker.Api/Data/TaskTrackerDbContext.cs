using Microsoft.EntityFrameworkCore;
using TaskTracker.Api.Entities;

namespace TaskTracker.Api.Data;

public class TaskTrackerDbContext(DbContextOptions<TaskTrackerDbContext> options) : DbContext(options)
{
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<TaskItem> Tasks => Set<TaskItem>();
    public DbSet<Tag> Tags => Set<Tag>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        // Applies to every DateTime and DateTime? property in the model.
        configurationBuilder.Properties<DateTime>().HaveConversion<UtcDateTimeConverter>();
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Picks up every IEntityTypeConfiguration<T> in this project (Data/Configurations).
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(TaskTrackerDbContext).Assembly);
    }
}
