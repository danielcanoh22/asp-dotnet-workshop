using Bookshelf.Api.Dtos;
using Bookshelf.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace Bookshelf.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BooksController(IBookService bookService) : ControllerBase
{
    // GET /api/books?genre=Fantasy&isRead=true
    [HttpGet]
    public async Task<ActionResult<List<BookResponse>>> GetAll([FromQuery] string? genre, [FromQuery] bool? isRead)
    {
        var books = await bookService.GetAllAsync(genre, isRead);
        return Ok(books);
    }

    [HttpGet("{id:int}")]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<BookResponse>> GetById(int id)
    {
        var book = await bookService.GetByIdAsync(id);
        return book is null ? NotFound() : Ok(book);
    }

    [HttpPost]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<BookResponse>> Create(CreateBookRequest request)
    {
        var created = await bookService.CreateAsync(request);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    [HttpPut("{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Update(int id, UpdateBookRequest request)
    {
        var updated = await bookService.UpdateAsync(id, request);
        return updated ? NoContent() : NotFound();
    }

    [HttpDelete("{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(int id)
    {
        var deleted = await bookService.DeleteAsync(id);
        return deleted ? NoContent() : NotFound();
    }

    [HttpPatch("{id:int}/read")]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<BookResponse>> MarkAsRead(int id, MarkAsReadRequest request)
    {
        var book = await bookService.MarkAsReadAsync(id, request);
        return book is null ? NotFound() : Ok(book);
    }
}
