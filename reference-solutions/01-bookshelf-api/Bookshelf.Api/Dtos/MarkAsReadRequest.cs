using System.ComponentModel.DataAnnotations;

namespace Bookshelf.Api.Dtos;

public class MarkAsReadRequest
{
    // Optional: a book can be marked as read without rating it.
    [Range(1, 5)]
    public int? Rating { get; set; }
}
