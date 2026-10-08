## Objetivo del paso

Tu servicio todavía guarda los libros en una lista en memoria, y se pierden al reiniciar. En este paso los pasarás a un archivo `books.json` y, de paso, aprenderás tres ideas que aparecen en cualquier backend real: la **separación en un repositorio**, la **programación asíncrona** y la **concurrencia segura**. Vas a:

1. Entender qué es un **repositorio** y por qué el servicio no debe saber de archivos.
2. Crear `Data/books.json` con datos iniciales.
3. Aprender a leer y escribir JSON con **System.Text.Json**.
4. Entender `async`/`await` a fondo, y por qué un acceso a disco debe ser asíncrono.
5. Proteger el archivo con un **`SemaphoreSlim`** y registrar el repositorio como **singleton**.
6. Convertir `BookService` y el controller a asíncronos (y practicarlo tú con `GetById`).

## El patrón repositorio

Ahora mismo `BookService` hace dos cosas: aplica una **regla** (filtrar por género) y **guarda los datos** (la lista). Son responsabilidades de naturaleza distinta, y la segunda cambiará seguramente: hoy es un archivo, mañana una base de datos.

:::concept Repositorio
Un **repositorio** es una clase cuya única responsabilidad es **leer y escribir datos**. Ofrece operaciones con vocabulario del dominio (`GetAllAsync`, `AddAsync`, `DeleteAsync`) y esconde cómo se guardan realmente. Quien lo usa no sabe si detrás hay un archivo, una base de datos o una lista en memoria.
:::

La arquitectura que estamos construyendo queda así:

```
Controller ──▶ IBookService ──▶ IBookRepository ──▶ books.json
 (HTTP)         (reglas)         (acceso a datos)    (archivo)
```

| Capa | Pregunta que responde | Conoce... | No debe conocer... |
| --- | --- | --- | --- |
| Controller | ¿Cómo traduzco HTTP a una operación? | Rutas, códigos de estado. | Archivos, reglas de negocio. |
| Service | ¿Qué reglas aplico? | Filtros, validaciones de negocio. | HTTP, formato de almacenamiento. |
| Repository | ¿Cómo guardo y recupero los datos? | El archivo JSON. | HTTP, reglas de negocio. |

:::why ¿Por qué separar si es más código?
Porque cada capa puede cambiar sin arrastrar a las demás. En el paso 15 verás el recorrido completo de una petición; y en el siguiente tutorial sustituirás este repositorio por uno que usa una base de datos, **sin tocar controller ni servicio**. Como el servicio depende de la interfaz `IBookRepository`, es el mismo truco de la inyección de dependencias del paso anterior aplicado a una capa más.
:::

## El archivo de datos

Vamos a guardar los libros en `Data/books.json`, en la raíz del proyecto.

:::vs Crear Data/books.json
1. En Solution Explorer, clic derecho sobre el proyecto `Bookshelf.Api` > **Add** > **New Folder** > **`Data`**.
2. Clic derecho sobre `Data` > **Add** > **New Item…**, busca **JSON File** y nómbralo **`books.json`**. (Si en tu instalación no aparece esa plantilla, elige **Text File** y ponle el nombre `books.json`; el contenido es lo único que importa.)
3. Reemplaza todo el contenido por el siguiente JSON.
:::

```json title="Data/books.json"
[
  { "id": 1, "title": "Cien años de soledad", "author": "Gabriel García Márquez", "year": 1967, "genre": "Fiction", "isRead": true, "rating": 5 },
  { "id": 2, "title": "Ficciones", "author": "Jorge Luis Borges", "year": 1944, "genre": "Fiction", "isRead": true, "rating": 5 },
  { "id": 3, "title": "La casa de los espíritus", "author": "Isabel Allende", "year": 1982, "genre": "Fiction", "isRead": false, "rating": null },
  { "id": 4, "title": "The Hobbit", "author": "J.R.R. Tolkien", "year": 1937, "genre": "Fantasy", "isRead": true, "rating": 4 },
  { "id": 5, "title": "1984", "author": "George Orwell", "year": 1949, "genre": "Dystopian", "isRead": true, "rating": 5 },
  { "id": 6, "title": "Dune", "author": "Frank Herbert", "year": 1965, "genre": "Science Fiction", "isRead": false, "rating": null },
  { "id": 7, "title": "El túnel", "author": "Ernesto Sabato", "year": 1948, "genre": "Fiction", "isRead": false, "rating": null },
  { "id": 8, "title": "The Left Hand of Darkness", "author": "Ursula K. Le Guin", "year": 1969, "genre": "Science Fiction", "isRead": true, "rating": 4 }
]
```

Los nombres de propiedad están en camelCase (`isRead`), igual que las respuestas de tu API. El JSON es un array de objetos y cada objeto se corresponde con una instancia de `Book`.

### ¿Dónde se busca el archivo?

:::concept Content root
El **content root** es la carpeta que ASP.NET Core considera "la raíz de la aplicación": donde busca `appsettings.json` y los archivos de contenido. Cuando ejecutas desde Visual Studio (o con `dotnet run`), es la carpeta **del proyecto** (donde está el `.csproj`), no la carpeta `bin`. Se obtiene con `IHostEnvironment.ContentRootPath`, un servicio que el contenedor inyecta y que contiene información sobre el entorno de ejecución.
:::

Dos consecuencias prácticas que conviene entender ahora, porque nos ahorrarán confusiones:

- **No hemos configurado el archivo para copiarse a `bin`.** Existe la propiedad *Copy to Output Directory*, pero no la usamos: leeremos y escribiremos siempre el archivo **de la carpeta del proyecto**. Así los cambios que hace la API (al crear libros, por ejemplo) quedan en el mismo archivo que ves en Solution Explorer y que Git controla.
- **La API modifica este archivo mientras la pruebas.** Es lo esperado: es tu "base de datos". Si quieres volver a los datos iniciales, restaura el archivo desde control de versiones o vuelve a pegar el contenido de arriba. (Cómo desplegar la aplicación y dónde guardar datos en producción queda fuera de este tutorial.)

## System.Text.Json

.NET incluye una biblioteca para trabajar con JSON, `System.Text.Json`. Es la misma que usa ASP.NET Core para convertir tus `Book` en las respuestas. Nosotros la usaremos directamente para el archivo, con dos operaciones:

| Operación | Método | Qué hace |
| --- | --- | --- |
| **Deserializar** | `JsonSerializer.DeserializeAsync<T>(stream, options)` | Lee JSON de un `Stream` y construye objetos de tipo `T`. |
| **Serializar** | `JsonSerializer.SerializeAsync(stream, value, options)` | Convierte objetos a JSON y lo escribe en un `Stream`. |

Un `Stream` es una "tubería" de bytes (aquí, el archivo). Las dos operaciones reciben un objeto `JsonSerializerOptions` con la configuración:

```csharp
private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
{
    WriteIndented = true,
    Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
};
```

| Opción | Qué hace y por qué la usamos |
| --- | --- |
| `new(JsonSerializerDefaults.Web)` | Parte de la configuración "web": nombres de propiedad en **camelCase**, lectura **sin distinguir mayúsculas** y números que pueden venir entre comillas. Es la misma convención de las respuestas de la API, así que el archivo y la API "hablan" igual. |
| `WriteIndented = true` | Escribe el JSON con saltos de línea y sangría. Ocupa más, pero puedes abrirlo y editarlo a mano. |
| `Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping` | Por defecto el serializador **escapa** los caracteres no ASCII: `García` se escribiría `Garc\u00EDa`. Es válido, pero ilegible. El codificador relajado deja las tildes tal cual. El nombre dice "Unsafe" porque no es apto para insertar JSON dentro de HTML; para escribir un archivo de datos es perfectamente seguro. |
| `static readonly` | Las opciones son costosas de construir y se pueden compartir: se crean una sola vez para todas las instancias. |

## Programación asíncrona: async y await

Leer o escribir un archivo es una operación de **entrada/salida** (*I/O*): la CPU no hace el trabajo, lo hace el disco, que es órdenes de magnitud más lento. Un programa puede esperar de dos maneras:

- **Bloqueando el hilo:** el hilo se queda parado hasta que el disco responde. Mientras tanto, ese hilo no sirve a nadie.
- **De forma asíncrona:** el hilo se libera durante la espera y atiende otras peticiones; cuando el disco termina, cualquier hilo disponible continúa la tarea.

Un servidor web tiene un número limitado de hilos. Si cada petición bloquea uno mientras espera al disco o a la red, con pocas peticiones simultáneas se agotan y la API deja de responder aunque la CPU esté casi inactiva. Con `async` el mismo servidor atiende muchas más peticiones.

:::concept Task, async y await
- **`Task`** representa una operación que **terminará en el futuro** y no devuelve valor. **`Task<T>`** es lo mismo pero producirá un valor de tipo `T`. Piensa en un "resguardo" de un trabajo pendiente.
- **`async`** marca un método que puede **suspenderse** en sus `await`. Su tipo de retorno pasa a ser `Task` o `Task<T>`.
- **`await`** significa "espera a que esta tarea termine, **sin bloquear el hilo**; cuando acabe, continúa por la línea siguiente y dame su resultado". Mientras espera, el método devuelve el control a quien lo llamó.

```csharp
public async Task<List<Book>> GetAllAsync()   // returns a Task that will produce a List<Book>
{
    var books = await LoadAsync();            // thread is freed here until the file is read
    return books;                             // the Task completes with this value
}
```

Observa que el método **devuelve** `List<Book>` en su cuerpo pero **declara** `Task<List<Book>>`: el compilador envuelve el valor por ti.
:::

Reglas prácticas que seguiremos en todo el proyecto:

| Regla | Detalle |
| --- | --- |
| **Sufijo `Async`** | Todo método que devuelve `Task` se nombra `...Async` (`GetAllAsync`). Es una convención que avisa de que hay que usar `await`. |
| **Async hasta arriba** (*async all the way*) | Si un método llama con `await` a otro, él mismo debe ser `async`, y su llamador también… hasta llegar al controller. Una sola capa síncrona en medio rompe la cadena. |
| **Nunca `.Result` ni `.Wait()`** | Bloquean el hilo esperando una tarea: pierdes todo el beneficio y, en algunos entornos, provocas bloqueos mutuos (*deadlocks*). |
| **`async` solo para I/O** | Para cálculo puro en CPU no aporta nada. Lo usamos porque tocamos disco. |

Por eso este paso modifica **toda** la cadena: repositorio, servicio y controller pasan a ser asíncronos. ASP.NET Core soporta de forma nativa que una acción de controller devuelva `Task<ActionResult<T>>`.

## Concurrencia: por qué hace falta un candado

Ahora imagina que dos clientes hacen `POST /api/books` casi a la vez (lo implementaremos en el paso 11). El repositorio hace cuatro cosas: **lee** el archivo, **calcula** el siguiente `id`, **añade** el libro y **escribe** el archivo. Si dos peticiones se entrelazan:

```
Petición A: lee el archivo (8 libros) ──┐
Petición B: lee el archivo (8 libros) ──┤  las dos calculan id = 9
Petición A: escribe 9 libros            │
Petición B: escribe 9 libros  ◀─────────┘  pisa el libro de A: se pierde un libro
```

Es una **condición de carrera** (*race condition*) y produce datos perdidos o duplicados. La solución es una **exclusión mutua**: garantizar que solo una petición a la vez ejecuta la secuencia leer-modificar-escribir.

:::concept SemaphoreSlim
Un **semáforo** es un contador de "permisos". `SemaphoreSlim(1, 1)` tiene un único permiso (capacidad 1, valor inicial 1), así que funciona como un **candado**:

- `await _lock.WaitAsync()` **toma** el permiso. Si otro lo tiene, espera (sin bloquear el hilo).
- `_lock.Release()` lo **devuelve**, y deja pasar al siguiente en espera.

¿Por qué no la instrucción `lock` de C#? Porque **no se puede usar `await` dentro de un `lock`** (el compilador lo prohíbe, `CS1996`): el hilo que toma el candado podría no ser el que lo libera. `SemaphoreSlim` sí está pensado para código asíncrono.
:::

El patrón siempre es el mismo, y el `try/finally` es innegociable:

```csharp
await _lock.WaitAsync();
try
{
    // read, modify, write
}
finally
{
    _lock.Release();   // always runs, even if an exception is thrown
}
```

:::warning Sin finally, un error bloquea la API para siempre
Si una excepción ocurre entre `WaitAsync` y `Release` y no hay `finally`, el permiso nunca se devuelve. Todas las peticiones siguientes esperarían eternamente. El `finally` garantiza la liberación pase lo que pase.
:::

## IBookRepository

Primero el contrato. Definimos ya las cinco operaciones que necesitará la API completa; hoy solo usaremos las dos de lectura, y las demás se usarán en los pasos 11 y 13.

:::vs Crear la carpeta y los archivos
1. Clic derecho sobre el proyecto > **Add** > **New Folder** > **`Repositories`**.
2. Dentro, **Add** > **Class…** > **`IBookRepository.cs`** y, otra vez, **`JsonBookRepository.cs`**.
:::

```csharp title="Repositories/IBookRepository.cs"
using Bookshelf.Api.Models;

namespace Bookshelf.Api.Repositories;

public interface IBookRepository
{
    Task<List<Book>> GetAllAsync();
    Task<Book?> GetByIdAsync(int id);
    Task<Book> AddAsync(Book book);
    Task<bool> UpdateAsync(Book book);
    Task<bool> DeleteAsync(int id);
}
```

Fíjate en los tipos de retorno, que cuentan la historia de cada operación:

- `Task<Book?>`: puede que el libro no exista (`null`).
- `Task<Book>` en `AddAsync`: devuelve el libro ya con su `Id` asignado.
- `Task<bool>` en `UpdateAsync` / `DeleteAsync`: `true` si encontró el libro y lo cambió, `false` si no existía. El servicio traducirá ese `false` en un `404` más adelante.

## JsonBookRepository

```csharp title="Repositories/JsonBookRepository.cs"
using System.Text.Encodings.Web;
using System.Text.Json;
using Bookshelf.Api.Models;

namespace Bookshelf.Api.Repositories;

public class JsonBookRepository : IBookRepository
{
    // camelCase names, readable indentation, and accents (García) kept as-is in the file.
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    // Only one request at a time may read or write the file.
    private readonly SemaphoreSlim _lock = new(1, 1);
    private readonly string _filePath;

    public JsonBookRepository(IHostEnvironment environment)
    {
        _filePath = Path.Combine(environment.ContentRootPath, "Data/books.json");
    }

    public async Task<List<Book>> GetAllAsync()
    {
        await _lock.WaitAsync();
        try
        {
            return await LoadAsync();
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<Book?> GetByIdAsync(int id)
    {
        await _lock.WaitAsync();
        try
        {
            var books = await LoadAsync();
            return books.FirstOrDefault(b => b.Id == id);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<Book> AddAsync(Book book)
    {
        await _lock.WaitAsync();
        try
        {
            var books = await LoadAsync();
            book.Id = books.Count == 0 ? 1 : books.Max(b => b.Id) + 1;
            books.Add(book);
            await SaveAsync(books);
            return book;
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<bool> UpdateAsync(Book book)
    {
        await _lock.WaitAsync();
        try
        {
            var books = await LoadAsync();
            var index = books.FindIndex(b => b.Id == book.Id);
            if (index < 0)
            {
                return false;
            }

            books[index] = book;
            await SaveAsync(books);
            return true;
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<bool> DeleteAsync(int id)
    {
        await _lock.WaitAsync();
        try
        {
            var books = await LoadAsync();
            var removed = books.RemoveAll(b => b.Id == id) > 0;
            if (removed)
            {
                await SaveAsync(books);
            }

            return removed;
        }
        finally
        {
            _lock.Release();
        }
    }

    // Callers must already hold the lock.
    private async Task<List<Book>> LoadAsync()
    {
        if (!File.Exists(_filePath))
        {
            return [];
        }

        await using var stream = File.OpenRead(_filePath);
        var books = await JsonSerializer.DeserializeAsync<List<Book>>(stream, JsonOptions);
        return books ?? [];
    }

    // Callers must already hold the lock.
    private async Task SaveAsync(List<Book> books)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_filePath)!);

        await using var stream = File.Create(_filePath);
        await JsonSerializer.SerializeAsync(stream, books, JsonOptions);
    }
}
```

Es un archivo largo, pero repetitivo. Vamos por partes.

**El constructor y la ruta del archivo:**

```csharp
public JsonBookRepository(IHostEnvironment environment)
{
    _filePath = Path.Combine(environment.ContentRootPath, "Data/books.json");
}
```

`IHostEnvironment` lo inyecta el contenedor (es un servicio del framework). `Path.Combine` une la raíz del contenido con la ruta relativa respetando los separadores del sistema operativo. Por ahora la ruta relativa está **escrita a fuego** en el código (una "cadena mágica"); en el paso 10 la sacaremos a la configuración.

**Las cinco operaciones públicas** tienen todas la misma forma: tomar el candado, hacer su trabajo con `LoadAsync`/`SaveAsync` y soltarlo en el `finally`. Detalles:

| Detalle | Explicación |
| --- | --- |
| `book.Id = books.Count == 0 ? 1 : books.Max(b => b.Id) + 1;` | El repositorio **asigna el id**: el máximo existente más uno (o 1 si no hay libros). Es nuestro "autoincremental" casero. Ten presente que si borras el libro con el id más alto y creas otro, ese id se reutiliza. |
| `FindIndex` / `books[index] = book` | `FindIndex` devuelve la posición del libro (o `-1` si no existe); entonces se reemplaza esa posición. |
| `RemoveAll(...) > 0` | `RemoveAll` borra todos los que cumplen la condición y devuelve cuántos borró. |
| `return await LoadAsync();` dentro del `try` | El `finally` se ejecuta **después** de calcular el valor de retorno, así que el candado se suelta tras terminar la lectura. |

**`LoadAsync` y `SaveAsync`** son privados y contienen el acceso real al archivo. El comentario *"Callers must already hold the lock"* es una advertencia de diseño: ellos no toman el candado porque ya lo tiene quien los llama; si lo tomaran también, se bloquearían a sí mismos (el semáforo no es reentrante).

| Línea | Explicación |
| --- | --- |
| `if (!File.Exists(_filePath)) return [];` | Si el archivo todavía no existe, empezamos con una lista vacía en lugar de fallar. `[]` es una *collection expression* vacía. |
| `await using var stream = File.OpenRead(_filePath);` | Abre el archivo para lectura. `await using` libera (cierra) el archivo automáticamente al terminar el método, sin necesidad de `Close()`. |
| `JsonSerializer.DeserializeAsync<List<Book>>(stream, JsonOptions)` | Lee todo el JSON y lo convierte en `List<Book>`. Puede devolver `null` si el contenido es literalmente `null`, de ahí el `?? []`. |
| `Directory.CreateDirectory(...)` | Garantiza que la carpeta `Data` existe antes de escribir. `GetDirectoryName` puede devolver `null` en teoría; el `!` le dice al compilador "sé que aquí no lo es". |
| `File.Create(_filePath)` | Crea el archivo; si ya existe, lo **sobrescribe por completo**. Por eso `SaveAsync` recibe la lista entera: reescribimos el archivo cada vez. |

:::why ¿Por qué reescribir todo el archivo en cada cambio?
Porque es lo más simple y suficiente para un archivo de unas pocas decenas de libros. Una base de datos real actualiza solo la fila afectada, y manejar eso a mano en un archivo sería mucho más complejo. Conocer el límite es parte del diseño: este repositorio no escalaría a miles de libros ni a muchos escritores simultáneos, y en el siguiente tutorial lo cambiarás por una base de datos real.
:::

### ¿Por qué un singleton?

Ahora podemos justificar el tiempo de vida del repositorio con lo que sabes del paso anterior:

- El candado `_lock` es un **campo de la instancia**. Para que sirva, **todas las peticiones deben usar la misma instancia** y, por tanto, el mismo candado. Si el repositorio fuera *scoped* o *transient*, cada petición tendría su propio `SemaphoreSlim` y no se bloquearían entre sí: la protección sería inútil.
- No guarda estado que dependa de una petición concreta.
- Reutilizar una única instancia evita recrear el candado y las opciones del serializador.

Por eso el repositorio es **singleton**, y obliga a que sea **seguro entre hilos**: por eso existe el semáforo.

:::concept Singleton con una dependencia scoped, ¿qué dirección vale?
Con esto tendremos: `BookService` (*scoped*) → `IBookRepository` (*singleton*). Eso **está permitido**: un servicio de vida corta puede usar uno de vida larga sin problema. Lo contrario, un singleton que recibe en su constructor un servicio *scoped*, es la **dependencia cautiva** que viste en el paso 8, y la aplicación no arrancaría. Si algún día quisieras que el repositorio usara un servicio *scoped*, tendrías que pensar de nuevo su diseño.
:::

## BookService y controller, en versión asíncrona

Ahora el servicio usará el repositorio y sus métodos devolverán `Task`.

:::vs Actualizar los archivos
1. Reemplaza `IBookService.cs` y `BookService.cs` por los listados de abajo.
2. En `BooksController.cs`, **elimina** (o comenta) por un momento la acción `GetById`; la recuperarás en el reto. Así el proyecto sigue compilando mientras tanto.
3. En `Program.cs` añade `using Bookshelf.Api.Repositories;` y el registro del repositorio antes del servicio.
:::

```csharp title="Services/IBookService.cs"
using Bookshelf.Api.Models;

namespace Bookshelf.Api.Services;

public interface IBookService
{
    Task<List<Book>> GetAllAsync(string? genre);
}
```

```csharp title="Services/BookService.cs"
using Bookshelf.Api.Models;
using Bookshelf.Api.Repositories;

namespace Bookshelf.Api.Services;

public class BookService(IBookRepository repository) : IBookService
{
    public async Task<List<Book>> GetAllAsync(string? genre)
    {
        var books = await repository.GetAllAsync();

        if (!string.IsNullOrWhiteSpace(genre))
        {
            books = books
                .Where(b => b.Genre.Equals(genre, StringComparison.OrdinalIgnoreCase))
                .ToList();
        }

        return books;
    }
}
```

```csharp title="Controllers/BooksController.cs"
using Bookshelf.Api.Models;
using Bookshelf.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace Bookshelf.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BooksController(IBookService bookService) : ControllerBase
{
    // GET /api/books?genre=Fantasy
    [HttpGet]
    public async Task<ActionResult<List<Book>>> GetAll([FromQuery] string? genre)
    {
        var books = await bookService.GetAllAsync(genre);
        return Ok(books);
    }

    // GetById is parked for the challenge: you will bring it back, asynchronous.
}
```

```csharp title="Program.cs"
using Bookshelf.Api.Middleware;
using Bookshelf.Api.Repositories;
using Bookshelf.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

builder.Services.AddSingleton<IBookRepository, JsonBookRepository>();
builder.Services.AddScoped<IBookService, BookService>();

var app = builder.Build();

app.UseRequestTiming();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.Run();
```

Qué ha cambiado y por qué:

- `BookService(IBookRepository repository)` recibe la dependencia por constructor primario. Ya no hay lista `static`: el servicio depende de un **contrato**, no de un archivo.
- `GetAllAsync` hace `await` del repositorio y aplica el filtro. El filtro sigue en el servicio porque es una **regla**, no acceso a datos. Se simplifica con `b.Genre.Equals(...)` porque `Genre` nunca es `null`.
- El controller marca `GetAll` como `async Task<ActionResult<...>>` y usa `await` al llamar al servicio. El `Ok(...)` y el resto no cambian.

:::checkpoint Los datos ahora vienen del archivo
Ejecuta con <kbd>Ctrl</kbd> + <kbd>F5</kbd> (perfil **http**):

- `GET /api/books` → `200` con **ocho** libros, los del archivo (no los tres de antes). *Ficciones* y *1984* son nuevos.
- `GET /api/books?genre=Fantasy` → `200` solo con *The Hobbit* (`id` 4).
- `GET /api/books/1` → `404` **sin cuerpo**: la acción está aparcada y la ruta no existe. Se resuelve en el reto.

Prueba además una edición en caliente: detén la API, cambia el `title` de un libro en `Data/books.json`, vuelve a ejecutar y comprueba que `GET /api/books` refleja tu cambio. Eso confirma que la lectura viene realmente del archivo. Después, deshaz tu cambio.
:::

::::challenge Recupera GetById de forma asíncrona
Con `GetAll` ya has visto cómo se convierte una cadena de llamadas a asíncrona. Hazlo ahora con **`GetById`**: ya existe `GetByIdAsync` en el repositorio, así que falta el servicio y el controller.

Comportamiento esperado:

- `GET /api/books/4` responde `200` con *The Hobbit*.
- `GET /api/books/999` responde `404` (con `ProblemDetails`).

Pregunta antes de empezar: ¿qué debe cambiar en `IBookService`, en `BookService` y en el controller? ¿En qué orden?

:::hint
Son tres cambios, de la capa más interna a la más externa: añade `GetByIdAsync` a la interfaz `IBookService`, impleméntalo en `BookService` y vuelve a escribir la acción `GetById` en el controller. El repositorio ya está listo.
:::

:::hint
El tipo de retorno es el del repositorio: `Task<Book?>`. En el servicio, `async` + `await repository.GetByIdAsync(id)`. En el controller, la acción devuelve `Task<ActionResult<Book>>`, con `await` delante de la llamada al servicio. Recuerda el sufijo `Async` en los nombres de los métodos de servicio y repositorio (la acción del controller conserva `GetById`).
:::

:::hint
Controller: `var book = await bookService.GetByIdAsync(id);` y a continuación `return book is null ? NotFound() : Ok(book);`. El operador condicional `?:` es una forma compacta de escribir el `if (book is null) {...}` del paso 7; elige la que te resulte más legible.
:::

:::solution
```csharp title="Services/IBookService.cs"
using Bookshelf.Api.Models;

namespace Bookshelf.Api.Services;

public interface IBookService
{
    Task<List<Book>> GetAllAsync(string? genre);
    Task<Book?> GetByIdAsync(int id);
}
```

```csharp title="Services/BookService.cs (método nuevo, al final de la clase)"
public async Task<Book?> GetByIdAsync(int id)
{
    return await repository.GetByIdAsync(id);
}
```

```csharp title="Controllers/BooksController.cs"
using Bookshelf.Api.Models;
using Bookshelf.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace Bookshelf.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BooksController(IBookService bookService) : ControllerBase
{
    // GET /api/books?genre=Fantasy
    [HttpGet]
    public async Task<ActionResult<List<Book>>> GetAll([FromQuery] string? genre)
    {
        var books = await bookService.GetAllAsync(genre);
        return Ok(books);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<Book>> GetById(int id)
    {
        var book = await bookService.GetByIdAsync(id);
        return book is null ? NotFound() : Ok(book);
    }
}
```

Cómo funciona:

- La cadena es **async hasta arriba**: repositorio (`Task<Book?>`) → servicio (`Task<Book?>`) → controller (`Task<ActionResult<Book>>`). Cada capa hace `await` de la siguiente.
- El servicio apenas hace nada todavía: solo delega. Es normal; cuando haya reglas (por ejemplo, convertir a DTO en el paso 11) vivirán aquí.
- `book is null ? NotFound() : Ok(book)` es equivalente al `if` del paso 7. Ambos tipos de retorno (`NotFound()` y `Ok(book)`) son compatibles con `ActionResult<Book>`, así que el operador condicional compila.
- Una variante válida del servicio es `return repository.GetByIdAsync(id);` sin `async`/`await`, que devuelve directamente la tarea. Es correcta cuando no hay nada más que hacer después, pero en el tutorial usamos `async`/`await` de forma uniforme para no tener que razonar sobre cuándo se puede omitir.
:::
::::

:::troubleshooting Errores comunes
- **`CS1061: 'IBookService' does not contain a definition for 'GetAll'`:** quedó una llamada al nombre antiguo. Los métodos asíncronos se llaman ahora `GetAllAsync` / `GetByIdAsync`.
- **`CS4033: The 'await' operator can only be used within an async method`:** usaste `await` en un método que no está marcado con `async` (o cuyo tipo de retorno no es `Task`). Añade `async` y cambia el tipo de retorno.
- **Un `var books = ...` que resulta ser un `Task`:** olvidar `await` ante una llamada asíncrona no siempre da error de compilación (la variable simplemente pasa a ser un `Task`), pero lo que devuelves deja de ser la lista. Si ves un `Task` donde esperabas datos, falta un `await`.
- **`GET /api/books` devuelve `[]`:** el archivo no se encuentra en la ruta esperada y `LoadAsync` lo trata como "sin libros". Comprueba que `books.json` está en la carpeta `Data` **dentro del proyecto** (junto al `.csproj`), no en la raíz de la solución, y que el nombre es exactamente `Data/books.json`.
- **`500` con `JsonException`: The JSON value could not be converted to ...:** el archivo tiene un error de formato (una coma de más, comillas que faltan, un `id` que no es número). Valida el JSON con el editor de Visual Studio, que subraya los errores.
- **Caracteres raros (`Ã­`, `Ã³`) en las tildes:** el archivo no está guardado como UTF-8. En Visual Studio: **File** > **Save … As** > flecha de **Save** > **Save with Encoding…** > **Unicode (UTF-8 without signature)**.
- **La aplicación no responde después de un error al leer o escribir:** revisa que cada `WaitAsync()` tenga su `Release()` en un `finally`.
:::

:::recap
- Un **repositorio** aísla el acceso a datos; el servicio depende de `IBookRepository` y no sabe si hay un archivo detrás.
- `Data/books.json` vive en el **content root** (la carpeta del proyecto) y la API lo edita en el sitio; se restablece desde el control de versiones.
- `System.Text.Json` serializa/deserializa; `JsonSerializerDefaults.Web` da camelCase y el codificador relajado conserva las tildes.
- `async`/`await` libera el hilo durante la espera de I/O. Reglas: sufijo `Async`, async hasta arriba, nunca `.Result`.
- Varias peticiones concurrentes sobre el mismo archivo causan condiciones de carrera: se protege con **`SemaphoreSlim(1, 1)`** y `try/finally`. Por eso el repositorio es **singleton**.
- Un servicio *scoped* puede depender de uno *singleton*, pero no al revés.
- Hoy la ruta del archivo está escrita a fuego en el código.

En el siguiente paso sacarás esa ruta a la **configuración** con el *Options pattern*, y aprenderás cómo ASP.NET Core combina `appsettings.json`, las variables de entorno y la línea de comandos.
:::
