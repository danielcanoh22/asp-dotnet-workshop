## Objetivo del paso

Hasta ahora la API solo **devuelve** datos. En este paso aprenderás a **recibirlos**: cómo ASP.NET Core convierte una petición HTTP en los parámetros de tu método, y cómo diseñar los objetos que viajan por la red. Vas a:

1. Entender el **model binding** y las fuentes de datos de una petición (ruta, query, cuerpo, cabeceras).
2. Aprender qué son los **DTOs** y por qué nunca debes exponer tus entidades directamente.
3. Crear `BookResponse`, `CreateBookRequest` y los **mapeos** entre modelo y DTOs.
4. Hacer que el servicio hable en DTOs y registre eventos con `ILogger`.
5. Implementar `POST /api/books`, con `201 Created` y la cabecera `Location`.
6. Practicar el patrón completo añadiendo tú el filtro `isRead` a `GET /api/books`.

## Model binding

Una petición HTTP llega como texto: una URL, cabeceras y, a veces, un cuerpo JSON. Tu método de controller, en cambio, recibe parámetros con **tipos** de C#: `int id`, `string? genre`, un objeto. A la pieza del framework que convierte lo primero en lo segundo se la llama **model binding** (*vinculación de modelos*).

:::concept Fuentes del model binding
Cada parámetro de una acción se rellena desde una **fuente**. Se indica con un atributo:

| Atributo | De dónde sale el valor | Ejemplo |
| --- | --- | --- |
| `[FromRoute]` | De un segmento de la URL definido en la plantilla de ruta. | `GET /api/books/5` con `{id:int}` → `id = 5` |
| `[FromQuery]` | De la *query string*. | `GET /api/books?genre=Fantasy` → `genre = "Fantasy"` |
| `[FromBody]` | Del **cuerpo** de la petición, deserializado desde JSON. | `POST` con `{ "title": "Dune" }` → un objeto |
| `[FromHeader]` | De una cabecera HTTP. | `[FromHeader(Name = "X-Request-Id")] string? requestId` |
| `[FromServices]` | Del contenedor de DI (no de la petición). | Un servicio pedido directamente en la acción. |

Solo puede haber **un** parámetro `[FromBody]` por acción: el cuerpo es un único flujo que se lee una vez.
:::

### Qué infiere [ApiController]

Hasta ahora no escribimos casi ningún atributo de fuente, y funcionó. Es porque `[ApiController]` **infiere** la fuente con estas reglas:

| Tipo de parámetro | Fuente inferida |
| --- | --- |
| **Tipo complejo** (una clase, como `CreateBookRequest`) | `[FromBody]` |
| Tipo simple (`int`, `string`, `bool?`…) cuyo nombre aparece en la plantilla de ruta | `[FromRoute]` |
| Cualquier otro tipo simple | `[FromQuery]` |
| Un tipo complejo que está registrado en el contenedor de DI | `[FromServices]` (tiene prioridad sobre el cuerpo) |

Por eso `GetById(int id)` no necesita nada (el `id` está en `{id:int}`) y el `CreateBookRequest` de nuestra acción `Create` tampoco. A pesar de ello, en `GetAll` dejamos `[FromQuery]` escrito de forma explícita: no es obligatorio, pero hace evidente de dónde viene cada valor.

:::why ¿Por qué un parámetro que falla al convertirse devuelve 400?
Porque `[ApiController]` comprueba el resultado del model binding antes de ejecutar tu acción. Si recibes `GET /api/books?isRead=maybe` y el parámetro es `bool?`, el valor `"maybe"` no se puede convertir: la acción **ni se ejecuta** y el cliente recibe un `400 Bad Request` con un cuerpo `ProblemDetails`. Lo verás en el reto de este paso, y en el siguiente estudiaremos cómo funciona ese mecanismo.
:::

## DTOs: el contrato de tu API

Hasta ahora devolvíamos directamente la clase `Book`. Funciona, pero acopla la **forma de tu API** a la **forma de tus datos internos**. Un **DTO** (*Data Transfer Object*) es una clase hecha específicamente para viajar entre cliente y servidor.

:::concept DTO (Data Transfer Object)
Es un objeto simple, sin lógica, que define **qué datos entran y salen** de un endpoint. En tu API habrá dos tipos:

- **DTOs de petición** (*request*): lo que el cliente **envía** (`CreateBookRequest`).
- **DTOs de respuesta** (*response*): lo que el servidor **devuelve** (`BookResponse`).

El modelo (`Book`) queda como representación **interna** de los datos; los DTOs son el **contrato público**.
:::

¿Por qué no reutilizar `Book` para todo?

| Problema | Qué pasa si recibes un `Book` directamente |
| --- | --- |
| **Sobreescritura masiva** (*overposting*) | Un cliente malintencionado puede enviar campos que tú no querías aceptar: `"id": 99`, `"isRead": true`, `"rating": 5` al crear un libro. El binder los asignaría sin preguntar. |
| **Contrato acoplado** | Si añades un campo interno a `Book` (por ejemplo `CreatedAt`), aparece automáticamente en las respuestas. Si renombras una propiedad, rompes a todos los clientes. |
| **Información innecesaria** | El cliente de "crear" no tiene que conocer `Id`, `IsRead` ni `Rating`: ¡no existen todavía! Con DTOs, cada operación declara solo lo que necesita. |
| **Diferentes necesidades** | Crear exige título, autor y año; actualizar exige además `isRead`; responder incluye el `id`. Una sola clase no encaja en todos. |

Lo comprobaremos más adelante: al enviar `{"id":99, "isRead":true, "rating":5, ...}` a la API final, esos tres campos serán **ignorados** porque `CreateBookRequest` simplemente no los tiene.

### Records frente a clases

Verás que usamos dos estilos distintos de DTO. No es capricho:

:::concept Clase frente a record
| | `CreateBookRequest` (clase) | `BookResponse` (record) |
| --- | --- | --- |
| Sintaxis | `class` con propiedades `{ get; set; }` | `record` con parámetros posicionales |
| Mutabilidad | Mutable: el *binder* crea la instancia y asigna cada propiedad. | **Inmutable**: se construye de una vez y no cambia. |
| Valores iniciales | `= string.Empty` evita `null` si el cliente omite el campo. | Todos los valores llegan por constructor. |
| Cuándo | Datos que **entran** y que el framework rellena (y que validaremos con atributos). | Datos que **salen**: los construimos nosotros una vez. |

Un **record** es un tipo pensado para representar datos: genera por ti el constructor, la igualdad por valores y un `ToString()` legible. Su forma posicional `record BookResponse(int Id, string Title, ...)` define las propiedades de solo lectura en una línea.
:::

Aprovechamos que los DTOs de petición serán clases con propiedades editables para algo que verás en el paso 12: los atributos de validación se colocan directamente sobre cada propiedad.

## Crea los DTOs

:::vs Crear la carpeta y los archivos
1. Clic derecho sobre el proyecto > **Add** > **New Folder** > **`Dtos`**.
2. Dentro, **Add** > **Class…** y crea **`BookResponse.cs`** y **`CreateBookRequest.cs`**.
3. Reemplaza el contenido de cada uno.
:::

```csharp title="Dtos/BookResponse.cs"
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
```

```csharp title="Dtos/CreateBookRequest.cs"
namespace Bookshelf.Api.Dtos;

public class CreateBookRequest
{
    public string Title { get; set; } = string.Empty;

    public string Author { get; set; } = string.Empty;

    public int Year { get; set; }

    public string Genre { get; set; } = string.Empty;
}
```

Observa que `CreateBookRequest` **no tiene** `Id`, `IsRead` ni `Rating`: el cliente no decide el identificador (lo asigna el repositorio) y un libro nuevo siempre empieza sin leer.

:::warning Todavía no validamos nada
`CreateBookRequest` aún no tiene reglas: acepta título vacío o un año absurdo. Es intencionado. En el **paso 12** añadirás los atributos de validación y verás cómo ASP.NET Core rechaza los datos incorrectos. Por ahora ocúpate solo de que el flujo completo funcione.
:::

## Mapeos entre modelo y DTO

Necesitamos convertir en ambos sentidos: de `CreateBookRequest` a `Book` (para guardar) y de `Book` a `BookResponse` (para responder). Esa conversión se llama **mapeo** (*mapping*). Podríamos usar una biblioteca, pero con tan pocas clases es más claro (y más didáctico) escribirlo a mano con **métodos de extensión**.

:::concept Métodos de extensión
Un **método de extensión** permite "añadir" un método a un tipo existente sin modificarlo. Se declara como método `static` en una clase `static`, y el primer parámetro lleva `this`:

```csharp
public static BookResponse ToResponse(this Book book) { ... }
```

Después se llama como si fuera un método propio del tipo: `book.ToResponse()`. Así el código lee de izquierda a derecha ("este libro, a respuesta") y no hace falta ensuciar `Book` con conocimiento de los DTOs.
:::

:::vs Crear BookMappings
1. Clic derecho sobre el proyecto > **Add** > **New Folder** > **`Mappings`**.
2. Dentro, **Add** > **Class…** > **`BookMappings.cs`**.
:::

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
}
```

| Elemento | Qué significa |
| --- | --- |
| `public static class` | Los métodos de extensión deben vivir en una clase estática. |
| `=>` | Miembro con cuerpo de expresión: el método es una única expresión cuyo valor se devuelve. |
| `new(book.Id, ...)` | `new` *con tipo de destino*: el compilador sabe que debe crear un `BookResponse` (el tipo de retorno) y no hace falta repetirlo. Usa el constructor posicional del record. |
| `new() { Title = ..., ... }` | Crea un `Book` con un inicializador de objeto. No se asigna `Id`, `IsRead` ni `Rating`: toman sus valores por defecto (0, `false`, `null`). |

En un paso posterior añadiremos un tercer mapeo para actualizar libros.

## El servicio ahora habla en DTOs

El servicio es la frontera entre el "mundo exterior" (DTOs) y el "mundo interior" (el modelo `Book` y el repositorio). Recibe `CreateBookRequest`, trabaja con `Book` y devuelve `BookResponse`. El controller nunca verá un `Book`.

También incorporamos **logging** al servicio, con la misma idea del paso 6: pedimos un `ILogger<BookService>` en el constructor y escribimos mensajes con plantilla.

```csharp title="Services/IBookService.cs"
using Bookshelf.Api.Dtos;

namespace Bookshelf.Api.Services;

public interface IBookService
{
    Task<List<BookResponse>> GetAllAsync(string? genre);
    Task<BookResponse?> GetByIdAsync(int id);
    Task<BookResponse> CreateAsync(CreateBookRequest request);
}
```

```csharp title="Services/BookService.cs"
using Bookshelf.Api.Dtos;
using Bookshelf.Api.Mappings;
using Bookshelf.Api.Repositories;

namespace Bookshelf.Api.Services;

public class BookService(IBookRepository repository, ILogger<BookService> logger) : IBookService
{
    public async Task<List<BookResponse>> GetAllAsync(string? genre)
    {
        var books = await repository.GetAllAsync();

        if (!string.IsNullOrWhiteSpace(genre))
        {
            books = books
                .Where(b => b.Genre.Equals(genre, StringComparison.OrdinalIgnoreCase))
                .ToList();
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
}
```

| Elemento | Qué significa |
| --- | --- |
| `books.Select(b => b.ToResponse()).ToList()` | `Select` aplica el mapeo a cada libro (proyección LINQ) y `ToList()` materializa el resultado. |
| `book?.ToResponse()` | **Operador condicional nulo** (`?.`): si `book` es `null`, toda la expresión vale `null`; si no, llama al método. Por eso el tipo de retorno es `BookResponse?`. |
| `request.ToBook()` | Convierte el DTO en modelo. Se lo pasamos a `repository.AddAsync`, que le asigna el `Id` y lo guarda. |
| `logger.LogInformation("Created book {BookId}: {Title}", book.Id, book.Title)` | Mensaje con **plantilla**: `{BookId}` y `{Title}` son marcadores que se rellenan con los argumentos, en orden. Se guardan como valores nombrados (no como texto ya mezclado), lo que permite buscar y filtrar logs por campo. Profundizaremos en el paso 14. |

## El controller: POST

Ahora el controller devuelve `BookResponse` y gana su primera acción que **recibe** un cuerpo:

```csharp title="Controllers/BooksController.cs"
using Bookshelf.Api.Dtos;
using Bookshelf.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace Bookshelf.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BooksController(IBookService bookService) : ControllerBase
{
    // GET /api/books?genre=Fantasy
    [HttpGet]
    public async Task<ActionResult<List<BookResponse>>> GetAll([FromQuery] string? genre)
    {
        var books = await bookService.GetAllAsync(genre);
        return Ok(books);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<BookResponse>> GetById(int id)
    {
        var book = await bookService.GetByIdAsync(id);
        return book is null ? NotFound() : Ok(book);
    }

    [HttpPost]
    public async Task<ActionResult<BookResponse>> Create(CreateBookRequest request)
    {
        var created = await bookService.CreateAsync(request);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }
}
```

Fíjate: el `using Bookshelf.Api.Models;` ha desaparecido. El controller ya **no conoce** la clase `Book`; solo ve DTOs. Si el modelo interno cambiara, el controller ni se enteraría.

**La acción `Create`:**

- `[HttpPost]` ata la acción a `POST /api/books`.
- El parámetro `CreateBookRequest request` es un tipo complejo, así que `[ApiController]` infiere `[FromBody]`: el JSON del cuerpo se deserializa a ese objeto. La deserialización no distingue mayúsculas, por eso `"title"` rellena `Title`.
- `CreatedAtAction(...)` construye la respuesta `201 Created` correcta para un `POST` que crea un recurso (paso 4):

| Argumento | Para qué sirve |
| --- | --- |
| `nameof(GetById)` | El **nombre de la acción** que sabe devolver ese recurso. `nameof` evita escribirlo como cadena (si renombras el método, el compilador te avisa). |
| `new { id = created.Id }` | Los valores de ruta necesarios para construir la URL de esa acción: aquí el `id`. |
| `created` | El cuerpo de la respuesta: el libro recién creado, con su `id` ya asignado. |

El resultado es una respuesta `201` con el libro en el cuerpo **y** una cabecera `Location` con la URL donde consultarlo (`http://localhost:5125/api/Books/9`). Así el cliente sabe dónde está el nuevo recurso sin tener que construir la URL.

:::tip ¿Por qué Location dice /api/Books y no /api/books?
Porque la plantilla de ruta es `api/[controller]`, y el token `[controller]` se sustituye por el nombre de la clase sin el sufijo: `Books`, con mayúscula. Al *generar* una URL, ASP.NET Core usa ese texto tal cual. Las rutas no distinguen mayúsculas al *recibir* peticiones, así que la URL de `Location` funciona igual. Es un detalle estético, no un error.
:::

## Prueba con el archivo .http

Reemplaza `Bookshelf.Api.http` por el siguiente (conserva **tu** puerto en la primera línea). Incluye ya una petición para el filtro del reto:

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
```

El `POST` lleva la cabecera `Content-Type: application/json` seguida de **una línea en blanco** y el cuerpo. Sin la línea en blanco, el cuerpo no se envía.

:::checkpoint POST crea un libro
Ejecuta la API y envía la petición **Create a book**. Deberías ver:

- Estado **`201 Created`**.
- Cabecera `Location: http://localhost:5125/api/Books/9` (el número final depende de los libros que ya tengas).
- Cuerpo con el libro, ya con su `id`, `"isRead": false` y `"rating": null`:

```json
{
  "id": 9,
  "title": "Pedro Páramo",
  "author": "Juan Rulfo",
  "year": 1955,
  "genre": "Fiction",
  "isRead": false,
  "rating": null
}
```

Comprueba que **persistió**: `GET /api/books/9` devuelve el libro, y si detienes y reinicias la API sigue ahí. Abre `Data/books.json` y verás el libro añadido al final.

En la consola de la API aparece tu nuevo log, además del de tiempos:

```
info: Bookshelf.Api.Services.BookService[0]
      Created book 9: Pedro Páramo
info: Bookshelf.Api.Middleware.RequestTimingMiddleware[0]
      POST /api/books responded 201 in 126 ms
```

Prueba también el efecto de los DTOs: envía a mano un cuerpo con campos extra, como `{"id": 99, "title": "X", "author": "Y", "year": 2000, "genre": "G", "isRead": true, "rating": 5}`. La API responde `201` pero el libro nuevo tiene un `id` asignado por el repositorio y `"isRead": false`, `"rating": null`: los campos que no existen en `CreateBookRequest` se **ignoraron**.
:::

:::warning Los datos cambian mientras pruebas
Cada `POST` modifica `Data/books.json`. Si quieres volver al estado inicial, restaura ese archivo desde el control de versiones o con el contenido del paso 9. También ten en cuenta que por ahora la API acepta cualquier dato, incluido un libro con título vacío.
:::

:::troubleshooting Errores comunes
- **`415 Unsupported Media Type`:** falta la cabecera `Content-Type: application/json`. Sin ella ASP.NET Core no sabe cómo leer el cuerpo. En el archivo `.http` debe ir justo debajo de la línea del verbo.
- **`400` con el mensaje `"The request field is required."` y un error de JSON (`$.title`, `Path: $...`):** el cuerpo no es un JSON válido (llave sin cerrar, comillas simples, coma sobrante). Revisa la sintaxis.
- **La respuesta es `201` pero el libro tiene todos los campos vacíos o a `0`:** el cuerpo llegó, pero los nombres no coinciden con las propiedades (`titulo` en vez de `title`). El binder ignora las propiedades que no reconoce y deja las demás con su valor por defecto.
- **`CS0246: The type or namespace name 'BookResponse' could not be found`:** falta `using Bookshelf.Api.Dtos;` en el archivo que lo usa.
- **`CS1061: 'Book' does not contain a definition for 'ToResponse'`:** falta `using Bookshelf.Api.Mappings;` en el archivo que invoca el método de extensión. Los métodos de extensión solo se ven si importas su *namespace*.
- **`CS0535: 'BookService' does not implement interface member ...`:** cambiaste la interfaz y no la clase (o al revés). Deben coincidir exactamente.
- **El `Location` apunta a un puerto distinto:** es el de tu perfil de ejecución actual. Si usas `https`, también usa HTTPS.
:::

::::challenge Añade el filtro isRead a GET /api/books
En el paso 7 añadiste el filtro `genre` a `GetAll`. Ahora añade un segundo filtro opcional, **`isRead`**, y combínalos:

- `GET /api/books?isRead=true` → solo los libros leídos.
- `GET /api/books?isRead=false` → solo los no leídos.
- `GET /api/books?genre=Fantasy&isRead=true` → los dos filtros a la vez.
- Sin `isRead`, el comportamiento es el de siempre.
- `GET /api/books?isRead=maybe` → `400 Bad Request`, y debes **entender por qué**.

La firma del método del controller debe quedar `GetAll(string? genre, bool? isRead)`. Prueba con la petición «Filter by genre and read status» de tu archivo `.http`.

:::hint
Es el mismo patrón en las tres capas: un parámetro nuevo que baja del controller al servicio. Empieza por la capa interna: añade `bool? isRead` a `IBookService.GetAllAsync`, impleméntalo en `BookService` y finalmente recíbelo en el controller con `[FromQuery]` y pásalo hacia abajo.
:::

:::hint
Usa `bool?` (con `?`) para que sea opcional: sin parámetro llega `null`. En el servicio, filtra solo cuando tenga valor: `if (isRead.HasValue) { ... }`, y compara `b.IsRead == isRead.Value`. Puedes aplicar este filtro **después** del de género, encadenando sobre la misma variable `books`.
:::

:::hint
Para `?isRead=maybe`, piensa en el model binding: el valor `"maybe"` no se puede convertir a `bool`. ¿Quién lo detecta y qué respuesta produce? Ejecuta la petición y lee el cuerpo del error.
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
}
```

```csharp title="Services/BookService.cs (método GetAllAsync)"
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
```

```csharp title="Controllers/BooksController.cs (acción GetAll)"
// GET /api/books?genre=Fantasy&isRead=true
[HttpGet]
public async Task<ActionResult<List<BookResponse>>> GetAll([FromQuery] string? genre, [FromQuery] bool? isRead)
{
    var books = await bookService.GetAllAsync(genre, isRead);
    return Ok(books);
}
```

Cómo funciona:

- `bool?` hace el parámetro **opcional** y, a la vez, distingue tres estados: no enviado (`null`), `true` y `false`. Con un `bool` simple no podrías saber si el cliente pidió `false` o no pidió nada.
- Los filtros se **encadenan** sobre la misma variable: el segundo trabaja sobre el resultado del primero. Si falta uno, simplemente no se aplica.
- Con `?isRead=maybe`, el binder no puede convertir el texto a `bool`. Como el controller tiene `[ApiController]`, la acción **no llega a ejecutarse** y la respuesta es `400` con un `ProblemDetails` parecido a este:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "errors": {
    "isRead": [ "The value 'maybe' is not valid." ]
  },
  "traceId": "00-e4dcfa95ad9840e0bbd55ee54bb14887-e9b..."
}
```

- `GET /api/books?genre=Fantasy&isRead=false` devuelve `[]` con los datos de ejemplo (el único libro de fantasía está leído), y eso es una respuesta correcta: `200` con una lista vacía, no `404`.
:::
::::

:::recap
- El **model binding** convierte la petición en parámetros: `[FromRoute]`, `[FromQuery]`, `[FromBody]`, `[FromHeader]`. `[ApiController]` infiere la fuente: tipo complejo → cuerpo, tipo simple en la ruta → ruta, otro tipo simple → query.
- Un valor que no se puede convertir produce un `400` automático sin ejecutar la acción.
- Los **DTOs** son el contrato público de la API. Evitan el *overposting*, desacoplan la API del modelo interno y dejan que cada operación pida solo lo que necesita.
- Los DTOs de entrada son **clases** con propiedades editables; los de salida son **records** inmutables.
- Los mapeos (`ToResponse`, `ToBook`) son **métodos de extensión** en `BookMappings`.
- El servicio recibe y devuelve DTOs, y registra eventos con `ILogger<BookService>` y plantillas.
- `POST` devuelve `201 Created` con `CreatedAtAction`, que añade el cuerpo y la cabecera `Location`.
- `CreateBookRequest` todavía no valida nada.

En el siguiente paso añadirás **reglas de validación** con atributos y verás cómo ASP.NET Core rechaza automáticamente los datos incorrectos con una respuesta `ProblemDetails`.
:::
