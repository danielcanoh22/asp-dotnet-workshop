using System.ComponentModel.DataAnnotations;

namespace Bookshelf.Api.Dtos;

public class UpdateBookRequest
{
    [Required]
    [StringLength(200)]
    public string Title { get; set; } = string.Empty;

    [Required]
    [StringLength(100)]
    public string Author { get; set; } = string.Empty;

    [Range(1000, 2100)]
    public int Year { get; set; }

    [Required]
    [StringLength(50)]
    public string Genre { get; set; } = string.Empty;

    public bool IsRead { get; set; }

    [Range(1, 5)]
    public int? Rating { get; set; }
}
