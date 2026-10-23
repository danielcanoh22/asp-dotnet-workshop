using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Scalar.AspNetCore;
using TaskTracker.Api.Data;
using TaskTracker.Api.Endpoints;

var builder = WebApplication.CreateBuilder(args);

// --- Services ---
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
builder.Services.AddValidation();

// Enums travel as text in JSON ("High", not 2); numbers are rejected.
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(allowIntegerValues: false)));

builder.Services.AddDbContext<TaskTrackerDbContext>(options =>
    options
        .UseSqlite(builder.Configuration.GetConnectionString("TaskTracker"))
        .EnableSensitiveDataLogging(builder.Environment.IsDevelopment())
        .UseSeeding((context, _) => DataSeeder.Seed(context))
        .UseAsyncSeeding((context, _, cancellationToken) => DataSeeder.SeedAsync(context, cancellationToken)));

var app = builder.Build();

// --- Development-only setup ---
if (app.Environment.IsDevelopment())
{
    // DbContext is scoped: outside a request we create the scope ourselves.
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<TaskTrackerDbContext>();
    await db.Database.MigrateAsync();

    app.MapOpenApi();
    app.MapScalarApiReference(); // UI at /scalar
}

// --- Middleware pipeline ---
// In Development, Minimal APIs throw BadHttpRequestException for input they cannot bind
// (for example ?status=Nope). Keep its 400 instead of turning it into a 500.
app.UseExceptionHandler(new ExceptionHandlerOptions
{
    StatusCodeSelector = exception => exception is BadHttpRequestException badRequest
        ? badRequest.StatusCode
        : StatusCodes.Status500InternalServerError,
});
app.UseStatusCodePages();
app.UseHttpsRedirection();

// --- Endpoints ---
app.MapProjectEndpoints();
app.MapTaskEndpoints();
app.MapTagEndpoints();

app.Run();
