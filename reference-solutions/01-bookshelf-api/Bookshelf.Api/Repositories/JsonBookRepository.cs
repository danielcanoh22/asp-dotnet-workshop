using System.Text.Encodings.Web;
using System.Text.Json;
using Bookshelf.Api.Models;
using Bookshelf.Api.Options;
using Microsoft.Extensions.Options;

namespace Bookshelf.Api.Repositories;

public class JsonBookRepository : IBookRepository
{
    // camelCase names, readable indentation, and accents (García) kept as-is in the file.
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    // Only one request at a time may read or write the file.
    private readonly SemaphoreSlim _lock = new(1, 1);
    private readonly string _filePath;

    public JsonBookRepository(IOptions<BookStorageOptions> options, IHostEnvironment environment)
    {
        _filePath = Path.Combine(environment.ContentRootPath, options.Value.FilePath);
    }

    public async Task<List<Book>> GetAllAsync()
    {
        await _lock.WaitAsync();
        try
        {
            return await LoadAsync();
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<Book?> GetByIdAsync(int id)
    {
        await _lock.WaitAsync();
        try
        {
            var books = await LoadAsync();
            return books.FirstOrDefault(b => b.Id == id);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<Book> AddAsync(Book book)
    {
        await _lock.WaitAsync();
        try
        {
            var books = await LoadAsync();
            book.Id = books.Count == 0 ? 1 : books.Max(b => b.Id) + 1;
            books.Add(book);
            await SaveAsync(books);
            return book;
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<bool> UpdateAsync(Book book)
    {
        await _lock.WaitAsync();
        try
        {
            var books = await LoadAsync();
            var index = books.FindIndex(b => b.Id == book.Id);
            if (index < 0)
            {
                return false;
            }

            books[index] = book;
            await SaveAsync(books);
            return true;
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<bool> DeleteAsync(int id)
    {
        await _lock.WaitAsync();
        try
        {
            var books = await LoadAsync();
            var removed = books.RemoveAll(b => b.Id == id) > 0;
            if (removed)
            {
                await SaveAsync(books);
            }

            return removed;
        }
        finally
        {
            _lock.Release();
        }
    }

    // Callers must already hold the lock.
    private async Task<List<Book>> LoadAsync()
    {
        if (!File.Exists(_filePath))
        {
            return [];
        }

        await using var stream = File.OpenRead(_filePath);
        var books = await JsonSerializer.DeserializeAsync<List<Book>>(stream, JsonOptions);
        return books ?? [];
    }

    // Callers must already hold the lock.
    private async Task SaveAsync(List<Book> books)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_filePath)!);

        await using var stream = File.Create(_filePath);
        await JsonSerializer.SerializeAsync(stream, books, JsonOptions);
    }
}
