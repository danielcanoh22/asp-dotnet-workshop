using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskTracker.Api.Entities;

namespace TaskTracker.Api.Data.Configurations;

public class TagConfiguration : IEntityTypeConfiguration<Tag>
{
    public void Configure(EntityTypeBuilder<Tag> builder)
    {
        builder.Property(t => t.Name)
            .HasMaxLength(50);

        // The database itself refuses two tags with the same name.
        builder.HasIndex(t => t.Name)
            .IsUnique();

        // Many-to-many: EF Core creates and manages the join table for us.
        builder.HasMany(t => t.Tasks)
            .WithMany(t => t.Tags)
            .UsingEntity(join => join.ToTable("TaskTags"));
    }
}
