namespace Bookshelf.Api.Dtos;

// A record fits well here: the response is built once and never changed.
public record BookResponse(
    int Id,
    string Title,
    string Author,
    int Year,
    string Genre,
    bool IsRead,
    int? Rating);
