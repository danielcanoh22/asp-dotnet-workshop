namespace Bookshelf.Api.Models;

public class Book
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Author { get; set; } = string.Empty;
    public int Year { get; set; }
    public string Genre { get; set; } = string.Empty;
    public bool IsRead { get; set; }

    // Null until the book is read and rated (1 to 5).
    public int? Rating { get; set; }
}
