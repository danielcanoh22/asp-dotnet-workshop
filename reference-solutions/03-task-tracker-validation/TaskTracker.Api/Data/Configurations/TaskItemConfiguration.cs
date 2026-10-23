using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskTracker.Api.Entities;

namespace TaskTracker.Api.Data.Configurations;

public class TaskItemConfiguration : IEntityTypeConfiguration<TaskItem>
{
    public void Configure(EntityTypeBuilder<TaskItem> builder)
    {
        builder.Property(t => t.Title)
            .HasMaxLength(200);

        builder.Property(t => t.Description)
            .HasMaxLength(2000);

        // Saved as "Todo" / "InProgress" / "Done" so the table is readable.
        builder.Property(t => t.Status)
            .HasConversion<string>()
            .HasMaxLength(20);

        // Every UPDATE of a task adds "AND Version = @original" to its WHERE clause.
        builder.Property(t => t.Version)
            .IsConcurrencyToken();

        builder.HasOne(t => t.Project)
            .WithMany(p => p.Tasks)
            .HasForeignKey(t => t.ProjectId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(t => new { t.ProjectId, t.Status });
    }
}
