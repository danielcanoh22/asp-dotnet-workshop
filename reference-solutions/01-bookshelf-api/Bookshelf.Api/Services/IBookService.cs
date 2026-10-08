using Bookshelf.Api.Dtos;

namespace Bookshelf.Api.Services;

public interface IBookService
{
    Task<List<BookResponse>> GetAllAsync(string? genre, bool? isRead);
    Task<BookResponse?> GetByIdAsync(int id);
    Task<BookResponse> CreateAsync(CreateBookRequest request);
    Task<bool> UpdateAsync(int id, UpdateBookRequest request);
    Task<bool> DeleteAsync(int id);
    Task<BookResponse?> MarkAsReadAsync(int id, MarkAsReadRequest request);
}
