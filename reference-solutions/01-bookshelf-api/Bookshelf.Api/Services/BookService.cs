using Bookshelf.Api.Dtos;
using Bookshelf.Api.Mappings;
using Bookshelf.Api.Repositories;

namespace Bookshelf.Api.Services;

public class BookService(IBookRepository repository, ILogger<BookService> logger) : IBookService
{
    public async Task<List<BookResponse>> GetAllAsync(string? genre, bool? isRead)
    {
        var books = await repository.GetAllAsync();

        if (!string.IsNullOrWhiteSpace(genre))
        {
            books = books
                .Where(b => b.Genre.Equals(genre, StringComparison.OrdinalIgnoreCase))
                .ToList();
        }

        if (isRead.HasValue)
        {
            books = books.Where(b => b.IsRead == isRead.Value).ToList();
        }

        return books.Select(b => b.ToResponse()).ToList();
    }

    public async Task<BookResponse?> GetByIdAsync(int id)
    {
        var book = await repository.GetByIdAsync(id);
        return book?.ToResponse();
    }

    public async Task<BookResponse> CreateAsync(CreateBookRequest request)
    {
        var book = await repository.AddAsync(request.ToBook());
        logger.LogInformation("Created book {BookId}: {Title}", book.Id, book.Title);
        return book.ToResponse();
    }

    public async Task<bool> UpdateAsync(int id, UpdateBookRequest request)
    {
        var book = await repository.GetByIdAsync(id);
        if (book is null)
        {
            return false;
        }

        request.ApplyTo(book);
        var updated = await repository.UpdateAsync(book);
        if (updated)
        {
            logger.LogInformation("Updated book {BookId}", id);
        }

        return updated;
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var deleted = await repository.DeleteAsync(id);
        if (deleted)
        {
            logger.LogInformation("Deleted book {BookId}", id);
        }

        return deleted;
    }

    public async Task<BookResponse?> MarkAsReadAsync(int id, MarkAsReadRequest request)
    {
        var book = await repository.GetByIdAsync(id);
        if (book is null)
        {
            return null;
        }

        book.IsRead = true;
        book.Rating = request.Rating;
        await repository.UpdateAsync(book);

        logger.LogInformation("Marked book {BookId} as read", id);
        return book.ToResponse();
    }
}
