using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace TaskTracker.Api.Data;

// SQLite has no date type: a DateTime is stored as text and comes back with Kind = Unspecified.
// We always save UTC, so we mark the values read from the database as UTC again.
public class UtcDateTimeConverter() : ValueConverter<DateTime, DateTime>(
    toDatabase => toDatabase,
    fromDatabase => DateTime.SpecifyKind(fromDatabase, DateTimeKind.Utc));
