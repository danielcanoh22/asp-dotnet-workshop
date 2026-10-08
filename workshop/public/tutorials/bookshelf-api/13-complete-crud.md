## Objetivo del paso

Este paso es distinto: casi todo lo que necesitas ya lo has practicado. Has recorrido las cuatro capas con `GET` y con `POST`, y repetir el mismo patrón con los tres endpoints que faltan es el mejor ejercicio. Por eso aquí el protagonismo es tuyo: cada endpoint es un **reto** con su especificación, sus pistas y su solución. Vas a:

1. Repasar la semántica de `PUT`, `PATCH` y `DELETE`, y la idempotencia.
2. Documentar los códigos de estado de tus acciones con `[ProducesResponseType]`.
3. Implementar `PUT /api/books/{id}`.
4. Implementar `DELETE /api/books/{id}`.
5. Implementar `PATCH /api/books/{id}/read`.
6. Probar el CRUD completo con la versión final de `Bookshelf.Api.http`.

## Antes de empezar: PUT, PATCH, DELETE

En el paso 4 los viste en la teoría. Los pasamos a la práctica:

:::concept Los tres verbos que faltan
| Verbo | Qué hace en Bookshelf | Cuerpo | Respuesta de éxito | Idempotente |
| --- | --- | --- | --- | --- |
| `PUT /api/books/{id}` | **Reemplaza** todos los datos editables de un libro. | Obligatorio: **todos** los campos (`UpdateBookRequest`). | `204 No Content` | Sí |
| `DELETE /api/books/{id}` | **Elimina** un libro. | No lleva. | `204 No Content` | Sí |
| `PATCH /api/books/{id}/read` | Cambia **una parte**: marca como leído y fija la valoración. | Solo `rating` (opcional). | `200 OK` con el libro actualizado | Sí, tal como lo hemos diseñado |

**Idempotencia, otra vez.** Repetir `PUT` con el mismo cuerpo deja el libro igual: el estado final no cambia. Repetir `DELETE` también deja el mismo estado (el libro no existe), aunque la **respuesta** pueda cambiar: la primera vez da `204` y la segunda `404`, porque ya no hay nada que borrar. Idempotente se refiere al **estado del sistema**, no al código de respuesta.
:::

:::why ¿Por qué 204 y no 200?
`204 No Content` significa "la operación salió bien y no hay cuerpo que enviarte". En `PUT` el cliente ya conoce el estado final (lo acaba de enviar) y en `DELETE` el recurso ya no existe: devolver un cuerpo sería ruido. En cambio `PATCH /read` devuelve `200` con el libro porque el servidor **calcula** algo que el cliente no sabe de antemano (el estado resultante tras marcarlo).
:::

## Documentar los códigos con ProducesResponseType

:::concept ProducesResponseType
Una acción como `GetById` puede devolver `200` (por el tipo `ActionResult<BookResponse>`) o `404` (por `NotFound()`), pero ese segundo resultado **no aparece en ninguna firma**: solo está dentro del código. `[ProducesResponseType(StatusCodes.Status404NotFound)]` es un atributo que **declara** un código de estado que la acción puede devolver. No cambia el comportamiento en tiempo de ejecución; sirve de **documentación** para quien lea el código y, sobre todo, para la herramienta que genera el documento OpenAPI (paso 15), que listará cada respuesta posible.

`StatusCodes` es una clase estática de ASP.NET Core (espacio de nombres `Microsoft.AspNetCore.Http`, incluido en los *implicit usings*) con una constante por cada código HTTP, para no escribir números mágicos.
:::

Convención del tutorial: en las acciones que devuelven `ActionResult<T>` declaramos los códigos de **error** (y el `201` de `Create`), y dejamos sin declarar el `200` del éxito habitual. Para una acción que devuelve `IActionResult` (sin tipo), declaramos todos, incluido el éxito. En el paso 15 verás una consecuencia de esta convención en la documentación generada y cómo mejorarla.

Empieza aplicándolo a las dos acciones que ya tienes. Añade los atributos justo bajo `[HttpGet("{id:int}")]` y `[HttpPost]`:

```csharp title="Controllers/BooksController.cs (acciones existentes)"
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
```

Cada acción que vayas a escribir ahora lleva los suyos, y verás cuáles en las soluciones.

::::challenge Implementa PUT /api/books/{id}
**Especificación:**

| | |
| --- | --- |
| Ruta | `PUT /api/books/{id}` (con `{id:int}`) |
| Cuerpo | `title`, `author`, `year`, `genre`, `isRead`, `rating` (este último opcional) |
| Validación | Mismas reglas que al crear (`title`, `author`, `year`, `genre`), más `rating` entre 1 y 5 **si se envía** |
| `204 No Content` | Libro actualizado |
| `400 Bad Request` | Datos inválidos |
| `404 Not Found` | No existe un libro con ese `id` |

Reemplaza **todos** los campos del libro por los recibidos. Registra con `ILogger` un mensaje cuando se actualice.

Piensa en las capas antes de teclear: ¿qué clase nueva necesitas? ¿Dónde convertirías ese DTO en cambios sobre un `Book`? ¿Cómo comunica el servicio al controller que el libro no existía?

:::hint
Necesitas, de fuera hacia dentro: un DTO `UpdateBookRequest` (como `CreateBookRequest` pero con `IsRead` y `Rating`, y las mismas validaciones), un nuevo método en el servicio, y una acción en el controller con `[HttpPut("{id:int}")]`. Reutiliza el repositorio: ya tiene `GetByIdAsync` y `UpdateAsync`.
:::

:::hint
El servicio no sabe de `404`. Haz que `UpdateAsync(int id, UpdateBookRequest request)` devuelva `Task<bool>`: `false` si el libro no existe, `true` si lo actualizó. El controller traduce: `true` → `NoContent()`, `false` → `NotFound()`. Como no hay cuerpo que devolver, la acción devuelve `Task<IActionResult>` (sin `<T>`). La acción recibe **dos** parámetros: `id` (de la ruta) y el DTO (del cuerpo).
:::

:::hint
Para copiar los campos del DTO al `Book` existente, añade a `BookMappings` un tercer método de extensión: `public static void ApplyTo(this UpdateBookRequest request, Book book)`, que asigne las seis propiedades. En el servicio: obtén el libro con `repository.GetByIdAsync(id)`; si es `null`, devuelve `false`; si no, `request.ApplyTo(book)` y `repository.UpdateAsync(book)`.
:::

:::solution
```csharp title="Dtos/UpdateBookRequest.cs"
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
```

```csharp title="Mappings/BookMappings.cs"
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
```

```csharp title="Services/IBookService.cs"
using Bookshelf.Api.Dtos;

namespace Bookshelf.Api.Services;

public interface IBookService
{
    Task<List<BookResponse>> GetAllAsync(string? genre, bool? isRead);
    Task<BookResponse?> GetByIdAsync(int id);
    Task<BookResponse> CreateAsync(CreateBookRequest request);
    Task<bool> UpdateAsync(int id, UpdateBookRequest request);
}
```

```csharp title="Services/BookService.cs (método nuevo, al final de la clase)"
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
```

```csharp title="Controllers/BooksController.cs (acción nueva, al final de la clase)"
[HttpPut("{id:int}")]
[ProducesResponseType(StatusCodes.Status204NoContent)]
[ProducesResponseType(StatusCodes.Status400BadRequest)]
[ProducesResponseType(StatusCodes.Status404NotFound)]
public async Task<IActionResult> Update(int id, UpdateBookRequest request)
{
    var updated = await bookService.UpdateAsync(id, request);
    return updated ? NoContent() : NotFound();
}
```

Cómo funciona:

- `UpdateBookRequest` repite las reglas de `CreateBookRequest` y suma `IsRead` y `Rating`. Es un DTO propio porque lo que **entra** al actualizar no es lo mismo que al crear: un `PUT` reemplaza el recurso entero.
- `ApplyTo` es el mapeo de "DTO hacia un modelo que ya existe": modifica el `Book` en su sitio (devuelve `void`), en lugar de crear uno nuevo. Mantiene el `Id`.
- El servicio devuelve `bool` para decir "existía o no". El repositorio también devuelve `bool`, así que el valor se propaga limpiamente hacia arriba. Es un diseño sencillo; la alternativa (lanzar una excepción de "no encontrado") la dejamos para un tutorial más avanzado.
- La acción devuelve `IActionResult` porque no hay cuerpo. Por eso declaramos con `[ProducesResponseType]` los **tres** códigos posibles, incluido el de éxito.
- Si envías a la vez datos inválidos **y** un `id` que no existe, recibes `400`: la validación ocurre antes de ejecutar la acción, así que el `404` ni se llega a calcular.
:::
::::

::::challenge Implementa DELETE /api/books/{id}
**Especificación:**

| | |
| --- | --- |
| Ruta | `DELETE /api/books/{id}` (con `{id:int}`) |
| Cuerpo | Ninguno |
| `204 No Content` | Libro eliminado |
| `404 Not Found` | No existe un libro con ese `id` |

Registra un mensaje con `ILogger` cuando se elimine un libro. Después de implementarlo, pruébalo **dos veces seguidas** con el mismo `id` y explica por qué la segunda respuesta es distinta aunque `DELETE` sea idempotente.

:::hint
Es más sencillo que `PUT`: no hay DTO ni mapeo. Necesitas un método en el servicio y una acción en el controller. El repositorio ya tiene `DeleteAsync(int id)`, que devuelve `bool`.
:::

:::hint
Servicio: `Task<bool> DeleteAsync(int id)`, que llama al repositorio y, si borró algo, escribe el log y devuelve el resultado. Controller: `[HttpDelete("{id:int}")]`, `Task<IActionResult>`, y la misma traducción que en `PUT`: `true` → `NoContent()`, `false` → `NotFound()`.
:::

:::solution
```csharp title="Services/IBookService.cs"
using Bookshelf.Api.Dtos;

namespace Bookshelf.Api.Services;

public interface IBookService
{
    Task<List<BookResponse>> GetAllAsync(string? genre, bool? isRead);
    Task<BookResponse?> GetByIdAsync(int id);
    Task<BookResponse> CreateAsync(CreateBookRequest request);
    Task<bool> UpdateAsync(int id, UpdateBookRequest request);
    Task<bool> DeleteAsync(int id);
}
```

```csharp title="Services/BookService.cs (método nuevo, al final de la clase)"
public async Task<bool> DeleteAsync(int id)
{
    var deleted = await repository.DeleteAsync(id);
    if (deleted)
    {
        logger.LogInformation("Deleted book {BookId}", id);
    }

    return deleted;
}
```

```csharp title="Controllers/BooksController.cs (acción nueva, al final de la clase)"
[HttpDelete("{id:int}")]
[ProducesResponseType(StatusCodes.Status204NoContent)]
[ProducesResponseType(StatusCodes.Status404NotFound)]
public async Task<IActionResult> Delete(int id)
{
    var deleted = await bookService.DeleteAsync(id);
    return deleted ? NoContent() : NotFound();
}
```

Cómo funciona:

- El servicio apenas aporta nada más que el log, y eso está bien: no todas las operaciones tienen reglas de negocio todavía. La capa existe para cuando las haya.
- La **primera** llamada a `DELETE /api/books/8` devuelve `204`; la **segunda**, `404`. Es idempotente porque el **estado** del sistema es el mismo tras una o tras diez llamadas (el libro 8 no existe), pero la **respuesta** informa de lo que pasó en esa llamada concreta: "había algo que borrar" frente a "no había nada".
:::
::::

::::challenge Implementa PATCH /api/books/{id}/read
**Especificación:**

| | |
| --- | --- |
| Ruta | `PATCH /api/books/{id}/read` (con `{id:int}`) |
| Cuerpo | `{ "rating": 5 }`. `rating` es **opcional** y, si viene, debe estar entre 1 y 5 |
| `200 OK` | Devuelve el libro actualizado (`BookResponse`) con `isRead = true` y la valoración enviada |
| `400 Bad Request` | `rating` fuera de rango |
| `404 Not Found` | No existe un libro con ese `id` |

Es el único endpoint que devuelve **cuerpo** tras modificar. Registra un log al marcar el libro como leído.

Pregunta de diseño: ¿por qué crees que `rating` está en un DTO propio (`MarkAsReadRequest`) y no se reutiliza `UpdateBookRequest`?

:::hint
Sigue las mismas capas: DTO `MarkAsReadRequest` (una sola propiedad), método en el servicio, acción en el controller con `[HttpPatch("{id:int}/read")]`. No necesitas un nuevo método en el repositorio: usa `GetByIdAsync` y `UpdateAsync`.
:::

:::hint
`MarkAsReadRequest` tiene una propiedad `int? Rating` con `[Range(1, 5)]`: al ser `int?`, el rango solo se valida si hay valor (lo vimos en el paso 12). El servicio devuelve `Task<BookResponse?>`: `null` si el libro no existe, o el libro actualizado ya convertido a `BookResponse`. El controller usa `ActionResult<BookResponse>` y `book is null ? NotFound() : Ok(book)`, igual que `GetById`.
:::

:::hint
En el servicio: busca el libro; si es `null`, devuelve `null`. Si existe, asigna `book.IsRead = true` y `book.Rating = request.Rating`, guarda con `repository.UpdateAsync(book)`, escribe el log y devuelve `book.ToResponse()`.
:::

:::solution
```csharp title="Dtos/MarkAsReadRequest.cs"
using System.ComponentModel.DataAnnotations;

namespace Bookshelf.Api.Dtos;

public class MarkAsReadRequest
{
    // Optional: a book can be marked as read without rating it.
    [Range(1, 5)]
    public int? Rating { get; set; }
}
```

```csharp title="Services/IBookService.cs"
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
```

```csharp title="Services/BookService.cs"
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
```

```csharp title="Controllers/BooksController.cs"
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
```

Cómo funciona:

- `MarkAsReadRequest` es un DTO propio porque la operación pide **menos** que un `PUT` (solo una valoración opcional) y tiene su propia regla (1 a 5). Reutilizar `UpdateBookRequest` obligaría a enviar seis campos para marcar un libro como leído, justo lo que `PATCH` quiere evitar.
- El servicio no solo comunica "no existe" (`null`): devuelve el libro ya convertido en DTO, porque el cliente necesita ver el resultado.
- Fíjate en que `[ProducesResponseType]` solo lista `400` y `404`: el `200` lo produce `Ok(book)` y, siguiendo la convención del paso, no lo declaramos.
- **Una consecuencia a tener presente:** `book.Rating = request.Rating` *reemplaza* la valoración por la que envíes. Si marcas como leído un libro que ya tenía valoración 5 enviando `{}`, la valoración pasa a `null`. Es una decisión sencilla de este tutorial, y queda como idea de mejora (por ejemplo, conservar la valoración anterior si no se envía una nueva).
:::
::::

## Prueba el CRUD completo

Con los tres endpoints terminados, `Bookshelf.Api.http` queda en su versión final. Reemplaza todo su contenido por el siguiente (conserva **tu** puerto en la primera línea):

```http title="Bookshelf.Api.http"
@Bookshelf.Api_HostAddress = http://localhost:5125

### List all books
GET {{Bookshelf.Api_HostAddress}}/api/books
Accept: application/json

### Filter by genre and read status
GET {{Bookshelf.Api_HostAddress}}/api/books?genre=Fantasy&isRead=true
Accept: application/json

### Get one book
GET {{Bookshelf.Api_HostAddress}}/api/books/1
Accept: application/json

### Get a book that does not exist (404)
GET {{Bookshelf.Api_HostAddress}}/api/books/999
Accept: application/json

### Create a book (201 + Location header)
POST {{Bookshelf.Api_HostAddress}}/api/books
Content-Type: application/json

{
  "title": "Pedro Páramo",
  "author": "Juan Rulfo",
  "year": 1955,
  "genre": "Fiction"
}

### Create with invalid data (400 validation problem)
POST {{Bookshelf.Api_HostAddress}}/api/books
Content-Type: application/json

{
  "title": "",
  "author": "Someone",
  "year": 5,
  "genre": "Fiction"
}

### Update a book (204)
PUT {{Bookshelf.Api_HostAddress}}/api/books/3
Content-Type: application/json

{
  "title": "La casa de los espíritus",
  "author": "Isabel Allende",
  "year": 1982,
  "genre": "Fiction",
  "isRead": true,
  "rating": 4
}

### Mark as read with a rating
PATCH {{Bookshelf.Api_HostAddress}}/api/books/6/read
Content-Type: application/json

{
  "rating": 5
}

### Delete a book (204)
DELETE {{Bookshelf.Api_HostAddress}}/api/books/8
```

Este archivo ya incluye la petición inválida del paso 12. Si quieres, conserva debajo las peticiones extra que escribiste en el reto de ese paso.

:::checkpoint El CRUD completo
Con el archivo `books.json` en su estado inicial (ocho libros), ejecuta las peticiones **en orden** y comprueba:

| Petición | Resultado esperado |
| --- | --- |
| `PUT /api/books/3` con los datos de ejemplo | `204`, sin cuerpo. Después `GET /api/books/3` muestra `"isRead": true` y `"rating": 4`. |
| `PATCH /api/books/6/read` con `{ "rating": 5 }` | `200` con *Dune* (`"isRead": true`, `"rating": 5`). |
| `PATCH /api/books/6/read` con `{ "rating": 0 }` | `400` con `errors` → `Rating: "The field Rating must be between 1 and 5."` |
| `PATCH /api/books/999/read` | `404` |
| `DELETE /api/books/8` | `204`. Una segunda vez: `404`. |
| `PUT /api/books/999` con un cuerpo válido | `404` |
| `PUT /api/books/3` con `title` vacío | `400` (la validación va antes que la búsqueda) |

Revisa también la consola: cada operación de escritura deja su log (`Updated book 3`, `Marked book 6 as read`, `Deleted book 8`).
:::

:::warning Los ids se reutilizan
El repositorio asigna `max(id) + 1`. Si **borras el libro con el id más alto** y creas uno nuevo, el nuevo recibe ese mismo id: tras borrar el 8, un `POST` crea de nuevo el 8. Para un archivo de pruebas es aceptable; una base de datos real usa identificadores que **nunca** se reutilizan, y lo verás en el siguiente tutorial.
:::

:::tip Restablece los datos de prueba
Has creado, modificado y borrado libros. Para volver a los ocho originales, restaura `Data/books.json` desde el control de versiones o con el contenido del paso 9.
:::

:::troubleshooting Errores comunes
- **`405 Method Not Allowed`:** la ruta existe pero no para ese verbo. Comprueba que usas `PUT`/`DELETE`/`PATCH` y que el atributo de la acción coincide (`[HttpPut]`, no `[HttpPost]`).
- **`404` en `PATCH /api/books/6/read`:** revisa el atributo: debe ser `[HttpPatch("{id:int}/read")]`, con `/read` incluido.
- **`400` con `"A non-empty request body is required."`:** enviaste `PUT` o `PATCH` sin cuerpo (o sin la cabecera `Content-Type: application/json`).
- **`CS1061: 'UpdateBookRequest' does not contain a definition for 'ApplyTo'`:** falta `using Bookshelf.Api.Mappings;` en `BookService.cs`.
- **El `PUT` devuelve `204` pero `GET` no muestra el cambio:** comprueba que `UpdateAsync` del servicio llama a `request.ApplyTo(book)` **antes** de `repository.UpdateAsync(book)`.
- **`CS0535: 'BookService' does not implement interface member ...`:** añadiste un método a `IBookService` y no a la clase.
:::

:::recap
- `PUT` reemplaza el recurso entero (`204`), `DELETE` lo elimina (`204`) y `PATCH /read` lo modifica en parte (`200` con el libro). `404` si el id no existe; `400` si los datos son inválidos.
- La **idempotencia** habla del estado, no del código: el segundo `DELETE` da `404` pero el estado final es el mismo.
- `[ProducesResponseType]` documenta los códigos que puede devolver una acción; no cambia el comportamiento, pero alimentará la documentación OpenAPI del paso 15.
- Las capas se repiten con el mismo patrón: DTO → mapeo → servicio (devuelve `bool` o `null` para "no existe") → acción (traduce a `NoContent`/`NotFound`/`Ok`).
- `ApplyTo` modifica un modelo existente; `ToBook` crea uno nuevo.
- Los ids se calculan como `max + 1`, y se reutilizan si borras el último.

En el siguiente paso trabajarás lo que ocurre cuando algo falla de verdad: excepciones no controladas, un manejador global de errores y una mirada a fondo al **logging**.
:::
