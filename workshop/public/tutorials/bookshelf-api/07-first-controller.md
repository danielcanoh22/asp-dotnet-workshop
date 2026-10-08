## Objetivo del paso

Ha llegado el momento de que la API devuelva libros. En este paso vas a:

1. Crear el **modelo** `Book`, que representa un libro.
2. Entender qué es un **controller**, qué hace `[ApiController]` y cómo funciona el **enrutamiento por atributos**.
3. Crear `BooksController` con dos acciones: listar todos los libros y obtener uno por su `id`.
4. Probarlas con el archivo `.http`, incluido el caso de un libro que no existe.

Los datos serán, por ahora, una lista fija escrita en el propio controller. Eso es **deliberadamente provisional**: al final del paso explicaremos qué problemas tiene y cómo los resolveremos en los pasos 8 y 9.

## El modelo: la clase Book

:::concept Modelo
Un **modelo** es una clase que representa un concepto de tu dominio, en este caso "un libro". Solo contiene datos (propiedades), sin lógica. A este tipo de clases se las suele llamar **POCO** (*Plain Old CLR Object*). Cuando devuelvas un `Book` desde la API, ASP.NET Core lo convertirá automáticamente en un objeto JSON con una propiedad por cada propiedad de la clase.
:::

:::vs Crear la clase Book
1. En Solution Explorer, haz clic derecho sobre el proyecto `Bookshelf.Api` > **Add** > **New Folder** y nómbrala **`Models`**.
2. Haz clic derecho sobre `Models` > **Add** > **Class…**
3. Escribe el nombre **`Book.cs`** y pulsa **Add**.
4. Reemplaza todo el contenido del archivo por el código siguiente.
:::

```csharp title="Models/Book.cs"
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
```

| Elemento | Qué significa |
| --- | --- |
| `namespace Bookshelf.Api.Models;` | El espacio de nombres coincide con la carpeta (`Models`). Es la convención de .NET. |
| `{ get; set; }` | Una **propiedad automática**: el compilador crea el campo oculto. `get` permite leerla y `set` asignarla. |
| `= string.Empty` | Valor inicial de las propiedades de texto. Con `Nullable` activado, `string` significa "nunca `null`"; sin valor inicial el compilador avisaría (`CS8618`). Aquí garantizamos que, aunque nadie la asigne, la propiedad vale `""` y no `null`. |
| `int? Rating` | `int?` es un **entero que puede ser `null`**. Un libro sin leer no tiene valoración, y el valor `0` sería confuso (¿cero estrellas o sin valorar?). |
| `IsRead` | Un `bool`: su valor por defecto es `false`, que es justo lo que queremos para un libro nuevo. |

:::why ¿Por qué int? para Rating y no 0?
Porque `null` significa "**no hay valoración todavía**", mientras que `0` sería un dato falso. Un modelo honesto distingue "no sé" de "cero". En JSON, un libro sin valorar se verá como `"rating": null`.
:::

## ¿Qué es un controller?

:::concept Controller
Un **controller** es una clase cuyos métodos públicos (llamados **acciones**) atienden peticiones HTTP. ASP.NET Core descubre los controllers del proyecto cuando llamas a `app.MapControllers()` y asocia cada acción con una ruta y un verbo HTTP.

Reglas del juego:

- Hereda de **`ControllerBase`**: la clase base para APIs. Aporta el acceso a la petición y los métodos auxiliares para responder (`Ok()`, `NotFound()`…).
- El nombre termina en **`Controller`** (`BooksController`). El framework quita el sufijo cuando necesita el nombre del recurso: `Books`.
- Se marca con **atributos**: etiquetas entre corchetes que añaden información al compilador y al framework.
:::

:::concept ControllerBase frente a Controller
Existe también una clase `Controller`, que hereda de `ControllerBase` y añade soporte para **vistas** (páginas HTML con Razor). Una API devuelve datos, no vistas, así que se usa `ControllerBase`: es más ligera y expresa mejor la intención.
:::

### Los atributos que usaremos

| Atributo | Dónde va | Qué hace |
| --- | --- | --- |
| `[ApiController]` | Clase | Activa comportamientos pensados para APIs (ver más abajo). |
| `[Route("api/[controller]")]` | Clase | Define el prefijo de ruta de todas las acciones. `[controller]` es un *token* que se sustituye por el nombre de la clase sin el sufijo `Controller`: `Books`. La ruta resultante es `api/Books`. |
| `[HttpGet]` | Método | La acción responde a `GET` en la ruta base del controller (`/api/books`). |
| `[HttpGet("{id:int}")]` | Método | Responde a `GET /api/books/{id}`, donde `{id}` es un **parámetro de ruta**. |

:::concept Qué activa [ApiController]
Este atributo hace por ti varias cosas que en una API siempre quieres:

- **Respuesta `400` automática** cuando los datos recibidos no son válidos, sin escribir código. Lo aprovecharemos en el paso 12.
- **Inferencia de dónde viene cada parámetro** (ruta, query, cuerpo). Lo estudiaremos en el paso 11.
- **Respuestas de error estándar:** los errores `4xx` (como el `404` de `NotFound()`) se devuelven como `ProblemDetails`, un formato JSON estándar para errores. Lo verás enseguida en tu prueba.
- Obliga a usar **enrutamiento por atributos** (`[Route]`, `[HttpGet]`...).
:::

### Rutas, parámetros y restricciones

La plantilla `{id:int}` tiene dos partes separadas por `:`:

- `id` es el **nombre** del parámetro de ruta. ASP.NET Core lo asocia con el parámetro del método que se llame igual (`int id`).
- `int` es una **restricción de ruta** (*route constraint*): la ruta solo coincide si el valor es un entero. Con `/api/books/abc`, la ruta ni siquiera se considera y la respuesta es `404`.

:::why ¿Por qué usar restricciones como :int?
Para que una ruta no acepte valores sin sentido y para evitar ambigüedades entre rutas parecidas. Sin la restricción, `GET /api/books/abc` entraría a tu acción y fallaría al intentar convertir `"abc"` a número. Con ella, el sistema de rutas lo descarta antes de llegar a tu código.
:::

### Resultados de acción: `ActionResult<T>`

Una acción puede devolver directamente un `Book`, pero entonces **solo puede responder `200`**: no hay manera de expresar "no encontrado". Para controlar el código de estado, las acciones devuelven un **resultado de acción**.

:::concept ActionResult y los métodos auxiliares
`ActionResult<T>` es un tipo que puede contener **o bien** un valor de tipo `T` **o bien** una respuesta HTTP de cualquier código. Los métodos auxiliares de `ControllerBase` construyen esas respuestas:

| Método | Código | Cuándo |
| --- | --- | --- |
| `Ok(valor)` | `200` | Todo bien, devuelvo datos. |
| `NotFound()` | `404` | El recurso pedido no existe. |
| `NoContent()` | `204` | Todo bien, sin cuerpo. (Lo usaremos más adelante.) |
| `BadRequest()` | `400` | Datos inválidos. (Lo usaremos más adelante.) |

Declarar el tipo `T` (`ActionResult<Book>`) también aporta información a la documentación OpenAPI: sabe que la respuesta de éxito es un `Book`.
:::

## Crea BooksController

:::vs Crear el controller
1. En Solution Explorer, haz clic derecho sobre la carpeta **`Controllers`** > **Add** > **Class…**
2. Nómbrala **`BooksController.cs`** y pulsa **Add**. (Existe también la opción **Add** > **Controller…** con plantillas, pero para entender cada pieza es mejor escribirlo nosotros.)
3. Reemplaza el contenido por el código siguiente.
:::

```csharp title="Controllers/BooksController.cs"
using Bookshelf.Api.Models;
using Microsoft.AspNetCore.Mvc;

namespace Bookshelf.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BooksController : ControllerBase
{
    // TEMPORARY: in-memory data. We will replace it with a service and a JSON repository.
    private static readonly List<Book> Books =
    [
        new Book { Id = 1, Title = "Cien años de soledad", Author = "Gabriel García Márquez", Year = 1967, Genre = "Fiction", IsRead = true, Rating = 5 },
        new Book { Id = 2, Title = "The Hobbit", Author = "J.R.R. Tolkien", Year = 1937, Genre = "Fantasy", IsRead = true, Rating = 4 },
        new Book { Id = 3, Title = "Dune", Author = "Frank Herbert", Year = 1965, Genre = "Science Fiction", IsRead = false }
    ];

    [HttpGet]
    public ActionResult<List<Book>> GetAll()
    {
        return Ok(Books);
    }

    [HttpGet("{id:int}")]
    public ActionResult<Book> GetById(int id)
    {
        var book = Books.FirstOrDefault(b => b.Id == id);

        if (book is null)
        {
            return NotFound();
        }

        return Ok(book);
    }
}
```

### Explicación línea a línea

**Los `using`:**

- `Bookshelf.Api.Models` para poder escribir `Book`.
- `Microsoft.AspNetCore.Mvc` contiene `ControllerBase` y los atributos `[ApiController]`, `[Route]`, `[HttpGet]`. No está en los *implicit usings*, así que hay que escribirlo.

**La declaración de clase:**

```csharp
[ApiController]
[Route("api/[controller]")]
public class BooksController : ControllerBase
```

Los atributos configuran la clase; `: ControllerBase` es la herencia. La ruta base de todas las acciones es `api/Books` (las rutas no distinguen mayúsculas, así que `/api/books` funciona igual).

**La lista temporal:**

```csharp
private static readonly List<Book> Books =
[
    new Book { Id = 1, ... },
    ...
];
```

| Parte | Qué significa |
| --- | --- |
| `private static readonly` | `static`: una única lista compartida por todas las peticiones (si no, se crearía una nueva con cada petición, porque ASP.NET Core crea una instancia nueva del controller por petición). `readonly`: la variable no se puede reasignar. |
| `[ ... ]` | **Collection expression** (C# 12): una forma abreviada de escribir el contenido de una colección. Equivale a `new List<Book> { ... }`. |
| `new Book { Id = 1, ... }` | **Inicializador de objeto**: crea un `Book` y asigna sus propiedades sin necesidad de un constructor. |
| `Rating` omitido en Dune | Al no asignarlo, vale `null` (es un libro sin leer). |

**`GetAll`:**

```csharp
[HttpGet]
public ActionResult<List<Book>> GetAll()
{
    return Ok(Books);
}
```

`[HttpGet]` sin parámetros ata la acción a `GET /api/books`. `Ok(Books)` responde `200` y serializa la lista a JSON.

**`GetById`:**

```csharp
[HttpGet("{id:int}")]
public ActionResult<Book> GetById(int id)
{
    var book = Books.FirstOrDefault(b => b.Id == id);

    if (book is null)
    {
        return NotFound();
    }

    return Ok(book);
}
```

- `"{id:int}"`: parámetro de ruta con restricción. El valor de la URL se **vincula** (*model binding*) al parámetro `int id` por coincidir el nombre.
- `FirstOrDefault(b => b.Id == id)` es LINQ: devuelve el primer libro cuyo `Id` coincide, o `null` si no hay ninguno.
- `book is null` es la forma idiomática en C# de comprobar nulos.
- `NotFound()` produce `404`; `Ok(book)` produce `200`. Este patrón "buscar, si no existe devolver 404, si existe devolver 200" se repetirá en casi todos los endpoints.

## Añade las peticiones al archivo .http

Reemplaza el contenido de `Bookshelf.Api.http` por el siguiente (conserva **tu** puerto en la primera línea):

```http title="Bookshelf.Api.http"
@Bookshelf.Api_HostAddress = http://localhost:5125

### List all books
GET {{Bookshelf.Api_HostAddress}}/api/books
Accept: application/json

### Get one book
GET {{Bookshelf.Api_HostAddress}}/api/books/1
Accept: application/json

### Get a book that does not exist (404)
GET {{Bookshelf.Api_HostAddress}}/api/books/999
Accept: application/json
```

Cada bloque está separado por `###`; el texto tras `###` es un comentario descriptivo que el editor muestra como título.

Ejecuta la API con <kbd>Ctrl</kbd> + <kbd>F5</kbd> (perfil **http**) y envía las tres peticiones.

:::checkpoint Tres respuestas, tres códigos
**1. `GET /api/books`** → `200 OK`. Una lista con tres libros:

```json
[
  {
    "id": 1,
    "title": "Cien años de soledad",
    "author": "Gabriel García Márquez",
    "year": 1967,
    "genre": "Fiction",
    "isRead": true,
    "rating": 5
  },
  {
    "id": 2,
    "title": "The Hobbit",
    "author": "J.R.R. Tolkien",
    "year": 1937,
    "genre": "Fantasy",
    "isRead": true,
    "rating": 4
  },
  {
    "id": 3,
    "title": "Dune",
    "author": "Frank Herbert",
    "year": 1965,
    "genre": "Science Fiction",
    "isRead": false,
    "rating": null
  }
]
```

Observa que los nombres de propiedad llegan en **camelCase** (`isRead`) aunque en C# sean `IsRead`, y que Dune muestra `"rating": null`.

**2. `GET /api/books/1`** → `200 OK`. El libro con `id` 1:

```json
{
  "id": 1,
  "title": "Cien años de soledad",
  "author": "Gabriel García Márquez",
  "year": 1967,
  "genre": "Fiction",
  "isRead": true,
  "rating": 5
}
```

**3. `GET /api/books/999`** → `404 Not Found`, con cabecera `Content-Type: application/problem+json` y un cuerpo así (el `traceId` cambia en cada llamada):

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Not Found",
  "status": 404,
  "traceId": "00-e36d011f620f285e67e48873e8511251-7312b049a7d4bb54-00"
}
```

Es el efecto de `[ApiController]`: tu `NotFound()` no tiene cuerpo, pero el atributo lo convierte automáticamente en un `ProblemDetails`.

**Prueba extra:** `GET /api/books/abc` devuelve `404` **sin cuerpo**. La restricción `:int` descarta la ruta antes de entrar a tu código, así que el `ProblemDetails` no se genera.

En la consola de la API, tu middleware del paso 6 registra cada petición:

```
info: Bookshelf.Api.Middleware.RequestTimingMiddleware[0]
      GET /api/books responded 200 in 42 ms
info: Bookshelf.Api.Middleware.RequestTimingMiddleware[0]
      GET /api/books/999 responded 404 in 18 ms
```
:::

## Un código que funciona, pero huele mal

La API ya responde, pero el controller tiene varios problemas que conviene reconocer:

| Problema | Consecuencia |
| --- | --- |
| **Los datos están en memoria** (una lista `static`) | Todo cambio se pierde al reiniciar la aplicación. |
| **El controller accede a los datos** directamente | El controller debería traducir HTTP, no decidir cómo se almacenan los libros. Mezcla responsabilidades. |
| **Todo vive en una sola clase** | Cuando añadamos crear, actualizar y borrar, se volverá difícil de leer y de cambiar. |

Los resolveremos en dos pasos:

- **Paso 8:** introduciremos la **inyección de dependencias** y un **servicio** que encapsule la lógica.
- **Paso 9:** crearemos un **repositorio** que lea y escriba los libros en un archivo JSON.

:::troubleshooting Errores comunes
- **`CS0246: The type or namespace name 'ControllerBase' could not be found`:** falta `using Microsoft.AspNetCore.Mvc;`.
- **`CS0246: The type or namespace name 'Book' could not be found`:** falta `using Bookshelf.Api.Models;`, o el namespace de `Book.cs` no es `Bookshelf.Api.Models`.
- **`GET /api/books` devuelve `404` sin cuerpo:** el controller no se registró. Comprueba que `Program.cs` tiene `builder.Services.AddControllers();` y `app.MapControllers();`, y que la clase hereda de `ControllerBase` y lleva `[ApiController]`.
- **`GET /api/books/1` devuelve `404` pero `GET /api/books` funciona:** revisa que el atributo sea `[HttpGet("{id:int}")]` y que el parámetro del método se llame `id`, igual que en la plantilla.
- **Error `AmbiguousMatchException` al llamar a una ruta:** dos acciones coinciden con la misma ruta y verbo. Revisa que no hayas duplicado un `[HttpGet]`.
:::

::::challenge Filtra los libros por género
Ya practicaste leer un valor desde la **ruta** (`{id:int}`). Ahora haz lo mismo con la **query string**: modifica `GetAll` para aceptar un parámetro opcional `genre`, de modo que:

- `GET /api/books` siga devolviendo los tres libros.
- `GET /api/books?genre=Fantasy` devuelva solo los libros de ese género.
- La comparación **no distinga mayúsculas** (`fantasy` y `Fantasy` dan el mismo resultado).
- Si ningún libro coincide, responda `200` con una lista vacía `[]`.

Añade una petición `GET /api/books?genre=Fantasy` a tu archivo `.http` y compruébalo.

:::hint
En una acción de controller, los parámetros pueden venir de tres sitios: de la **ruta** (`/books/{id}`), de la **query string** (`?genre=Fantasy`) o del **cuerpo** (JSON enviado con `POST`). Un parámetro simple del método (`string`, `int`) que no aparece en la plantilla de la ruta se busca automáticamente en la **query string**, con el mismo nombre.
:::

:::hint
Añade un parámetro `string? genre` a `GetAll`. El `?` es importante: marca el parámetro como **opcional**. Puedes dejarlo explícito con el atributo `[FromQuery]` delante del parámetro. Dentro del método, si `genre` trae un valor, filtra la lista con LINQ (`Where`); si no, deja la lista completa.
:::

:::hint
Para comparar sin distinguir mayúsculas usa `string.Equals(a, b, StringComparison.OrdinalIgnoreCase)`. Para saber si el parámetro trae algo útil, usa `string.IsNullOrWhiteSpace(genre)`. Parte de `IEnumerable<Book> books = Books;` y reasigna `books` si hay filtro. Al final, devuelve `Ok(books.ToList())`.
:::

:::solution
```csharp title="Controllers/BooksController.cs"
// GET /api/books?genre=Fantasy
[HttpGet]
public ActionResult<List<Book>> GetAll([FromQuery] string? genre)
{
    IEnumerable<Book> books = Books;

    if (!string.IsNullOrWhiteSpace(genre))
    {
        books = books.Where(b => string.Equals(b.Genre, genre, StringComparison.OrdinalIgnoreCase));
    }

    return Ok(books.ToList());
}
```

```http title="Bookshelf.Api.http (petición adicional)"
### Filter by genre
GET {{Bookshelf.Api_HostAddress}}/api/books?genre=Fantasy
Accept: application/json
```

Cómo funciona:

- `[FromQuery]` indica explícitamente que el valor viene de la query string. Sin el atributo, con `[ApiController]` el resultado sería el mismo (un parámetro simple que no está en la ruta se toma de la query), pero ser explícito hace el código más fácil de leer.
- `string?` hace el parámetro **opcional**: si la petición no incluye `genre`, llega `null`.
- `IEnumerable<Book> books = Books;` empieza con la colección completa. Solo si hay un `genre` útil se reasigna con `Where`, que **no modifica** la lista original: crea una vista filtrada.
- `books.ToList()` materializa el resultado en una `List<Book>`, que es lo que declara el tipo de retorno.
- `GET /api/books?genre=Fantasy` devuelve únicamente *The Hobbit*; `?genre=fantasy` devuelve lo mismo; `?genre=Nope` devuelve `[]`; y `GET /api/books` (o `?genre=`) devuelve los tres libros.

Para el filtro por `isRead` y el uso definitivo de `[FromQuery]` junto a otros parámetros, esperaremos al paso 11.
:::
::::

:::warning Un detalle sobre string y string?
Si en el reto escribes `string genre` (sin `?`), con `Nullable` activado y `[ApiController]` el framework considera el parámetro **obligatorio**: `GET /api/books` sin `genre` devolvería `400 Bad Request` con el mensaje `"The genre field is required."`. Por eso el `?` no es decorativo: expresa "este valor es opcional".
:::

:::recap
- Un **modelo** (`Book`) es una clase de datos. `int? Rating` distingue "sin valoración" de "cero".
- Un **controller** hereda de `ControllerBase`, usa `[ApiController]` y `[Route("api/[controller]")]`, y expone **acciones** marcadas con `[HttpGet]`, `[HttpPost]`, etc.
- `{id:int}` es un **parámetro de ruta con restricción**; se vincula al parámetro del método por nombre.
- `ActionResult<T>` permite devolver datos (`Ok`) o errores (`NotFound`). `[ApiController]` convierte los `404` en `ProblemDetails`.
- Un parámetro simple que no está en la ruta se toma de la **query string**; con `string?` es opcional.
- La lista `static` es un recurso temporal: no persiste y mezcla responsabilidades.

En el siguiente paso introducirás la **inyección de dependencias** y un servicio, para que el controller deje de conocer cómo se obtienen los libros.
:::
