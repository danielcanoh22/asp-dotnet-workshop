using Bookshelf.Api.Dtos;
using Bookshelf.Api.Models;

namespace Bookshelf.Api.Mappings;

public static class BookMappings
{
    public static BookResponse ToResponse(this Book book) =>
        new(book.Id, book.Title, book.Author, book.Year, book.Genre, book.IsRead, book.Rating);

    // The Id is not set here: the repository assigns it when the book is saved.
    public static Book ToBook(this CreateBookRequest request) => new()
    {
        Title = request.Title,
        Author = request.Author,
        Year = request.Year,
        Genre = request.Genre
    };

    public static void ApplyTo(this UpdateBookRequest request, Book book)
    {
        book.Title = request.Title;
        book.Author = request.Author;
        book.Year = request.Year;
        book.Genre = request.Genre;
        book.IsRead = request.IsRead;
        book.Rating = request.Rating;
    }
}
