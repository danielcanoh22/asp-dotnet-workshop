using System.Globalization;
using System.Text.Json.Serialization;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Scalar.AspNetCore;
using TaskTracker.Api.Data;
using TaskTracker.Api.Endpoints;
using TaskTracker.Api.Errors;

var builder = WebApplication.CreateBuilder(args);

// --- Services ---
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails(options =>
    // Runs for every ProblemDetails the app writes: validation, TypedResults.Problem and exception handlers.
    options.CustomizeProblemDetails = context =>
        context.ProblemDetails.Instance ??=
            $"{context.HttpContext.Request.Method} {context.HttpContext.Request.Path}");

// Called in registration order until one returns true.
builder.Services.AddExceptionHandler<DatabaseExceptionHandler>();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

// Registers every AbstractValidator<T> in this project as IValidator<T>.
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

// FluentValidation translates its messages to the machine's culture. An API answers the same everywhere.
ValidatorOptions.Global.LanguageManager.Culture = CultureInfo.InvariantCulture;

// The clock as a service: validators ask it for "now" instead of reading DateTime directly.
builder.Services.AddSingleton(TimeProvider.System);

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
app.UseExceptionHandler(); // Runs the IExceptionHandler chain registered above.
app.UseStatusCodePages();
app.UseHttpsRedirection();

// --- Endpoints ---
app.MapProjectEndpoints();
app.MapTaskEndpoints();
app.MapTagEndpoints();

app.Run();
