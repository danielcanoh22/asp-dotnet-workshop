namespace Bookshelf.Api.Options;

public class BookStorageOptions
{
    public const string SectionName = "BookStorage";

    // Relative paths are resolved against the content root of the application.
    public string FilePath { get; set; } = "Data/books.json";
}
