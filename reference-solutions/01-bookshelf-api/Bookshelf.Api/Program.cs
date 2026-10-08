using Bookshelf.Api.Errors;
using Bookshelf.Api.Middleware;
using Bookshelf.Api.Options;
using Bookshelf.Api.Repositories;
using Bookshelf.Api.Services;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// --- Services ---
builder.Services.AddControllers();
builder.Services.AddOpenApi();

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

builder.Services.Configure<BookStorageOptions>(
    builder.Configuration.GetSection(BookStorageOptions.SectionName));
builder.Services.AddSingleton<IBookRepository, JsonBookRepository>();
builder.Services.AddScoped<IBookService, BookService>();

var app = builder.Build();

// --- Middleware pipeline (order matters) ---
app.UseRequestTiming();
app.UseExceptionHandler();
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference(); // UI at /scalar
}

app.UseHttpsRedirection();
app.UseAuthorization();

// --- Endpoints ---
app.MapControllers();

app.Run();
