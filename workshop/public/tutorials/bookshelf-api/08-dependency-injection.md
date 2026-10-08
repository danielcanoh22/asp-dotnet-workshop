## Objetivo del paso

En el paso 6 viste que un middleware recibía un `ILogger<...>` sin que tú lo crearas, y te adelantamos que a ese mecanismo se le llama **inyección de dependencias**. Hoy lo estudiamos a fondo y lo usamos para limpiar el controller. En este paso vas a:

1. Entender el problema que resuelve la inyección de dependencias (DI) y los conceptos de **inversión de control**, **interfaz** y **contenedor**.
2. Crear `IBookService` y `BookService`, y mover allí los datos que hoy viven en el controller.
3. **Registrar** el servicio en el contenedor y **pedirlo** en el constructor del controller.
4. Comprobar con un experimento cómo se comportan los tres **tiempos de vida** (*singleton*, *scoped* y *transient*) y provocar a propósito el error más famoso de la DI: la **dependencia cautiva**.
5. Practicar el patrón tú solo moviendo `GetById` al servicio.

## El problema: un controller que lo hace todo

Mira el controller del paso anterior. Tiene tres responsabilidades mezcladas:

- Traducir HTTP (rutas, códigos de estado). Esto **sí** es su trabajo.
- Guardar los datos (la lista `static`).
- Decidir cómo se filtran los libros (la lógica de `genre`).

Imagina ahora que quieres cambiar la lista por un archivo JSON. Tendrías que abrir el controller, que habla de HTTP, y meter ahí código de ficheros. Y si mañana otro controller necesita los mismos libros, tendrías que copiar todo. Hay un tercer problema, menos evidente: ¿cómo comprobarías la lógica de filtrado sin levantar un servidor web? Con el código dentro del controller, no puedes.

La solución general es repartir las responsabilidades en clases pequeñas que **colaboran**. El controller dirá "dame los libros" y otra clase, el **servicio**, sabrá cómo conseguirlos. Pero eso abre una pregunta clave: **¿quién crea esa clase?**

### La mala respuesta: `new` dentro del controller

```csharp
public class BooksController : ControllerBase
{
    private readonly BookService _bookService = new BookService();
}
```

Parece inocente, pero el controller acaba de quedar **acoplado** a una implementación concreta:

| Problema | Por qué duele |
| --- | --- |
| El controller decide **qué clase** concreta usa | Para cambiar de `BookService` a otra implementación hay que editar el controller. |
| El controller decide **cuándo y cuántas veces** se crea | No puedes compartir una única instancia entre peticiones ni controlar su vida. |
| Si `BookService` necesita a su vez otras clases (un repositorio, un logger, la configuración…), el controller tendría que crearlas también | El controller acaba conociendo todo el árbol de dependencias. |
| No puedes sustituir `BookService` por una versión falsa | Imposible probar el controller de forma aislada. |

## Inversión de control e inyección de dependencias

:::concept Inversión de control (IoC)
En el código "normal", cada clase **busca o crea** lo que necesita: *"necesito un servicio, hago `new`"*. La **inversión de control** da la vuelta a esa responsabilidad: la clase **declara** lo que necesita y *otro* (el framework) se encarga de proporcionárselo. El control sobre la creación de objetos pasa de tus clases al exterior; de ahí lo de "inversión".
:::

:::concept Inyección de dependencias (DI)
Es la técnica concreta con la que se consigue la IoC en ASP.NET Core. Una **dependencia** es cualquier objeto que otra clase necesita para funcionar. La DI consiste en que la clase **pide sus dependencias en el constructor** (no las crea) y un componente llamado **contenedor de DI** (*DI container*, o *service provider*) las construye y se las **inyecta**.

El contenedor funciona con dos fases que ya conoces del paso 5:

1. **Registro** (antes de `builder.Build()`): le cuentas al contenedor qué servicios existen, en `builder.Services`.
2. **Resolución** (durante la ejecución): cuando alguien necesita una clase, el contenedor mira los parámetros de su constructor, resuelve cada uno (creándolo si hace falta, y recursivamente) y construye el objeto.
:::

Un esquema de lo que va a pasar con cada petición a `GET /api/books`:

```
Petición ──▶ el framework necesita un BooksController
                   │
                   ├─ su constructor pide un IBookService
                   │         │
                   │         └─ el contenedor mira su registro:
                   │            "IBookService → BookService"
                   │            y construye (o reutiliza) un BookService
                   ▼
            new BooksController(bookService)   ← lo hace el contenedor, no tú
```

### Interfaces: contratos en lugar de clases concretas

Fíjate en que el registro dice "`IBookService` → `BookService`". Es decir, el controller no va a pedir un `BookService` concreto, sino algo que cumpla el **contrato** `IBookService`.

:::concept Interfaz
Una **interfaz** describe *qué* se puede hacer (una lista de métodos) sin decir *cómo*. Por convención su nombre empieza por `I`. Una clase que la **implementa** se compromete a ofrecer todos esos miembros.

```csharp
public interface IBookService          // el contrato: "se pueden obtener libros"
{
    List<Book> GetAll(string? genre);
}

public class BookService : IBookService // una implementación concreta del contrato
{
    public List<Book> GetAll(string? genre) { /* ... */ }
}
```

El controller dependerá del contrato (`IBookService`). Hoy la implementación guarda los libros en memoria; en el paso 9 usará un archivo; en el futuro podría usar una base de datos. **El controller no cambiará.**
:::

:::why ¿Por qué una interfaz y no directamente la clase?
Porque separa "qué necesito" de "quién lo hace". Ganas tres cosas: puedes **cambiar la implementación** sin tocar a quien la usa, puedes **sustituirla por una falsa** al probar, y el contrato queda como documentación de lo que ofrece la capa. A cambio, escribes un archivo más. En un proyecto de este tamaño es un precio pequeño y, sobre todo, es el patrón que verás en casi cualquier código ASP.NET Core profesional.
:::

## Crea el servicio

Vamos a crear la capa de servicios. En esta primera versión será **provisional**: el servicio guardará los libros en memoria, exactamente igual que el controller, pero ya fuera de él.

:::vs Crear la carpeta y los archivos
1. En Solution Explorer, haz clic derecho sobre el proyecto `Bookshelf.Api` > **Add** > **New Folder** y nómbrala **`Services`**.
2. Haz clic derecho sobre `Services` > **Add** > **Class…**, escribe **`IBookService.cs`** y pulsa **Add**. (Visual Studio crea una `class`; la cambiarás por `interface` al pegar el código.)
3. Repite el paso 2 con **`BookService.cs`**.
4. Reemplaza el contenido de ambos archivos por el código siguiente.
:::

```csharp title="Services/IBookService.cs"
using Bookshelf.Api.Models;

namespace Bookshelf.Api.Services;

public interface IBookService
{
    List<Book> GetAll(string? genre);
}
```

```csharp title="Services/BookService.cs"
using Bookshelf.Api.Models;

namespace Bookshelf.Api.Services;

public class BookService : IBookService
{
    // TEMPORARY: in-memory data. In step 9 the data will come from a repository.
    private static readonly List<Book> Books =
    [
        new Book { Id = 1, Title = "Cien años de soledad", Author = "Gabriel García Márquez", Year = 1967, Genre = "Fiction", IsRead = true, Rating = 5 },
        new Book { Id = 2, Title = "The Hobbit", Author = "J.R.R. Tolkien", Year = 1937, Genre = "Fantasy", IsRead = true, Rating = 4 },
        new Book { Id = 3, Title = "Dune", Author = "Frank Herbert", Year = 1965, Genre = "Science Fiction", IsRead = false }
    ];

    public List<Book> GetAll(string? genre)
    {
        IEnumerable<Book> books = Books;

        if (!string.IsNullOrWhiteSpace(genre))
        {
            books = books.Where(b => string.Equals(b.Genre, genre, StringComparison.OrdinalIgnoreCase));
        }

        return books.ToList();
    }
}
```

| Elemento | Qué significa |
| --- | --- |
| `public interface IBookService` | Un contrato con un único método por ahora. Un método de interfaz **no tiene cuerpo**: solo la firma. |
| `public class BookService : IBookService` | La clase **implementa** la interfaz. Si olvidas algún miembro del contrato, el compilador da error. |
| `private static readonly List<Book> Books` | La misma lista que tenías en el controller. Sigue siendo `static` por una razón importante que explicamos justo debajo. |
| `GetAll(string? genre)` | La lógica de filtrado que antes estaba en el controller, movida tal cual. El servicio no sabe nada de HTTP: recibe un `string?` y devuelve una lista. |

:::warning ¿Por qué sigue siendo static la lista?
Con `AddScoped` (lo registraremos en un momento) el contenedor crea **un `BookService` nuevo por cada petición**. Si la lista fuera un campo normal, cada petición tendría su propia lista nueva y los cambios no se compartirían. Con `static`, la lista pertenece a la clase, no a las instancias, y todas las peticiones ven la misma. Es un apaño temporal; en el paso 9 desaparece, porque los datos vivirán en un archivo.
:::

## Registra el servicio en el contenedor

Un servicio que el contenedor no conoce no se puede inyectar. Hay que **registrarlo** en la fase 1 de `Program.cs`.

:::vs Editar Program.cs
1. Abre `Program.cs`.
2. Añade `using Bookshelf.Api.Services;` junto al `using` que ya tienes.
3. Añade la línea de registro justo después de `builder.Services.AddOpenApi();`, antes de `var app = builder.Build();`.
:::

```csharp title="Program.cs"
using Bookshelf.Api.Middleware;
using Bookshelf.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

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

`builder.Services.AddScoped<IBookService, BookService>();` se lee: "cuando alguien pida un `IBookService`, entrégale un `BookService`, con tiempo de vida *scoped*". El significado de *scoped* y de sus hermanos llega en la siguiente sección; por ahora, acepta que es la elección correcta para esta clase y lo justificaremos con evidencia.

### Los métodos de registro

El patrón de nombre es siempre `Add{Lifetime}<TService, TImplementation>()`:

| Registro | Se lee como |
| --- | --- |
| `AddScoped<IBookService, BookService>()` | "Para `IBookService`, usa `BookService`." Es la forma más habitual: interfaz y clase. |
| `AddScoped<BookService>()` | "Registro la propia clase, sin interfaz." Válido, pero pierdes el contrato (ya lo usamos así en el experimento de abajo). |
| `AddScoped<IBookService>(sp => new BookService(...))` | "Para `IBookService`, ejecuta esta función para crearlo." Una **fábrica**, útil cuando la construcción necesita lógica propia. |

## Pide el servicio en el controller

Ahora el controller deja de crear o guardar datos: solo **pide** un `IBookService`. Hay dos formas equivalentes de escribirlo.

**Forma clásica (constructor tradicional)**, que verás en mucho código existente:

```csharp
public class BooksController : ControllerBase
{
    private readonly IBookService _bookService;

    public BooksController(IBookService bookService)
    {
        _bookService = bookService;
    }
}
```

**Forma moderna (constructor primario, C# 12)**, que usaremos en el tutorial. Es la misma sintaxis que ya viste en el middleware del paso 6:

```csharp
public class BooksController(IBookService bookService) : ControllerBase
{
    // bookService is available in every method of the class.
}
```

Ambas son equivalentes: el compilador captura `bookService` como un campo oculto. Elige la moderna para tener menos ruido, pero reconoce la clásica porque la encontrarás constantemente.

Para que veas el cambio de forma gradual, haz **solo** `GetAll` ahora; `GetById` seguirá leyendo la lista `static` del controller hasta que lo muevas tú en el reto.

:::vs Editar BooksController
1. Abre `Controllers/BooksController.cs`.
2. Añade `using Bookshelf.Api.Services;`.
3. Cambia la declaración de la clase para pedir `IBookService` en el constructor primario.
4. En `GetAll`, sustituye el cuerpo por una llamada al servicio. **No toques `GetById` ni la lista `Books`**.
:::

```csharp title="Controllers/BooksController.cs"
using Bookshelf.Api.Models;
using Bookshelf.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace Bookshelf.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BooksController(IBookService bookService) : ControllerBase
{
    // TEMPORARY: GetById still reads the static list. You will move it to the service in the challenge.
    private static readonly List<Book> Books =
    [
        new Book { Id = 1, Title = "Cien años de soledad", Author = "Gabriel García Márquez", Year = 1967, Genre = "Fiction", IsRead = true, Rating = 5 },
        new Book { Id = 2, Title = "The Hobbit", Author = "J.R.R. Tolkien", Year = 1937, Genre = "Fantasy", IsRead = true, Rating = 4 },
        new Book { Id = 3, Title = "Dune", Author = "Frank Herbert", Year = 1965, Genre = "Science Fiction", IsRead = false }
    ];

    // GET /api/books?genre=Fantasy
    [HttpGet]
    public ActionResult<List<Book>> GetAll([FromQuery] string? genre)
    {
        var books = bookService.GetAll(genre);
        return Ok(books);
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

Observa lo que ha cambiado en `GetAll`: ya no sabe nada del filtrado ni de dónde salen los libros. Solo traduce "petición HTTP con `genre`" a "llamada al servicio" y "lista" a "respuesta `200`". Ese es el trabajo de un controller.

:::checkpoint La API se comporta igual que antes
Compila (<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd>), ejecuta con <kbd>Ctrl</kbd> + <kbd>F5</kbd> (perfil **http**) y envía desde `Bookshelf.Api.http` las peticiones que ya tenías:

- `GET /api/books` → `200` con los tres libros.
- `GET /api/books?genre=Fantasy` → `200` solo con *The Hobbit*.
- `GET /api/books/1` → `200`; `GET /api/books/999` → `404`.

Un refactor correcto cambia **cómo** está organizado el código sin cambiar **lo que hace**. Si el resultado de las cuatro peticiones es idéntico al del paso 7, tu primer servicio inyectado funciona.
:::

## Los tiempos de vida

Falta explicar la palabra *scoped* que escribimos en el registro. El contenedor no solo decide **qué** clase entregar, sino **cuánto vive** cada instancia y **cuándo se reutiliza**. Esa decisión se llama **tiempo de vida** (*lifetime*) y es una de las ideas más importantes de ASP.NET Core.

:::concept Los tres tiempos de vida
| Tiempo de vida | Registro | Cuándo se crea la instancia | Cuándo se reutiliza |
| --- | --- | --- | --- |
| **Singleton** | `AddSingleton` | La primera vez que alguien la pide. | **Siempre**: la misma instancia durante toda la vida de la aplicación, para todas las peticiones. |
| **Scoped** | `AddScoped` | La primera vez que se pide **dentro de una petición HTTP**. | Dentro de **esa misma petición**: todos los que la pidan reciben la misma. La siguiente petición obtiene otra nueva. |
| **Transient** | `AddTransient` | **Cada vez** que alguien la pide. | **Nunca**: cada consumidor recibe su propia instancia. |

El **ámbito** (*scope*) de *scoped* es la petición HTTP: ASP.NET Core abre un ámbito al empezar cada petición y lo cierra al terminar.
:::

La teoría se entiende mucho mejor viéndola. Vamos a hacer un experimento temporal: un servicio con un identificador único que cambiará (o no) según el tiempo de vida con que lo registremos.

### Experimento: tres registros de la misma clase

Piensa en el diseño del experimento. Una clase `Operation` genera un `Guid` (un identificador único de 128 bits) **en su constructor**. Cada instancia nueva tiene, por tanto, un `Guid` distinto: si dos consumidores muestran el mismo `Guid`, es que recibieron **la misma instancia**. Registraremos esa clase tres veces, con tiempos de vida distintos, bajo tres interfaces distintas.

:::vs Crear los archivos del experimento
1. Crea la carpeta **`Lifetimes`** en el proyecto (clic derecho > **Add** > **New Folder**).
2. Dentro, crea tres archivos con **Add** > **Class…**: `Operation.cs`, `OperationService.cs` y `LifetimesDemoController.cs`.
3. Pega el contenido de cada uno.
:::

```csharp title="Lifetimes/Operation.cs"
namespace Bookshelf.Api.Lifetimes;

public interface IOperation
{
    Guid OperationId { get; }
}

public interface ISingletonOperation : IOperation;
public interface IScopedOperation : IOperation;
public interface ITransientOperation : IOperation;

// One class, registered three times with a different lifetime each time.
// Every new instance gets its own Guid, so the Guid tells us which instance we received.
public class Operation : ISingletonOperation, IScopedOperation, ITransientOperation
{
    public Guid OperationId { get; } = Guid.NewGuid();
}
```

```csharp title="Lifetimes/OperationService.cs"
namespace Bookshelf.Api.Lifetimes;

// A second consumer, so we can compare what the controller got with what this service got
// in the same request.
public class OperationService(
    ISingletonOperation singleton,
    IScopedOperation scoped,
    ITransientOperation transient)
{
    public ISingletonOperation Singleton { get; } = singleton;
    public IScopedOperation Scoped { get; } = scoped;
    public ITransientOperation Transient { get; } = transient;
}
```

```csharp title="Lifetimes/LifetimesDemoController.cs"
using Microsoft.AspNetCore.Mvc;

namespace Bookshelf.Api.Lifetimes;

[ApiController]
[Route("api/lifetimes-demo")]
public class LifetimesDemoController(
    ISingletonOperation singleton,
    IScopedOperation scoped,
    ITransientOperation transient,
    OperationService operationService) : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok(new
    {
        controller = new
        {
            singleton = singleton.OperationId,
            scoped = scoped.OperationId,
            transient = transient.OperationId
        },
        service = new
        {
            singleton = operationService.Singleton.OperationId,
            scoped = operationService.Scoped.OperationId,
            transient = operationService.Transient.OperationId
        }
    });
}
```

Dos novedades de sintaxis: `public interface ISingletonOperation : IOperation;` es una interfaz sin miembros propios, y el `;` final sustituye a las llaves vacías (C# 12). Y `Ok(new { ... })` devuelve un **tipo anónimo**, un objeto creado al vuelo solo para serializarlo a JSON.

Ahora registra los cuatro servicios en `Program.cs`, debajo del registro de `IBookService` (y añade `using Bookshelf.Api.Lifetimes;` arriba):

```csharp title="Program.cs (añadido temporal)"
builder.Services.AddSingleton<ISingletonOperation, Operation>();
builder.Services.AddScoped<IScopedOperation, Operation>();
builder.Services.AddTransient<ITransientOperation, Operation>();
builder.Services.AddTransient<OperationService>();
```

Ejecuta la API y llama **dos veces** a `GET /api/lifetimes-demo` (añade la petición a tu archivo `.http` o ábrela en el navegador: `http://localhost:5125/api/lifetimes-demo`). Los `Guid` serán distintos en tu máquina; lo importante es **cuáles se repiten**. Por brevedad aquí mostramos solo el inicio de cada uno, de una ejecución real:

| Quién lo recibió | Singleton | Scoped | Transient |
| --- | --- | --- | --- |
| Petición 1, **controller** | `d3cc01bc…` | `6afe4094…` | `d8ac0687…` |
| Petición 1, **servicio** | `d3cc01bc…` | `6afe4094…` | `b04f4db7…` |
| Petición 2, **controller** | `d3cc01bc…` | `035a6fd1…` | `a35d73e5…` |
| Petición 2, **servicio** | `d3cc01bc…` | `035a6fd1…` | `49cb8d89…` |

Léelo columna por columna:

- **Singleton:** el mismo `Guid` en las cuatro filas. Una sola instancia para toda la aplicación, sin importar la petición ni quién la pida.
- **Scoped:** controller y servicio comparten `Guid` **dentro de la misma petición**, pero la petición 2 tiene uno distinto de la 1. Una instancia por petición.
- **Transient:** los cuatro son distintos. Incluso dentro de la misma petición, controller y servicio recibieron instancias separadas.

:::why ¿Cómo elegir el tiempo de vida?
Pregúntate qué debe compartirse y durante cuánto:

- **Singleton:** para algo **sin estado por petición** y costoso de crear o que debe ser único (una caché, un acceso a un archivo compartido). Debe ser **seguro entre hilos**, porque lo usarán muchas peticiones a la vez. Lo usaremos para el repositorio en el paso 9.
- **Scoped:** para el trabajo **de una petición**: un servicio que coordina una operación, o (más adelante, con bases de datos) un contexto de datos que no debe mezclarse entre usuarios. Es una elección segura por defecto para servicios de aplicación como `BookService`.
- **Transient:** para clases **ligeras y sin estado**, de las que no importa tener varias copias.

Ante la duda con un servicio de aplicación, *scoped*. Un singleton mal escrito provoca fallos difíciles de ver (estado compartido entre usuarios); un transient solo cuesta crear más objetos.
:::

### La regla de oro: nunca un servicio de vida larga dependiendo de uno de vida corta

Imagina un singleton (vive toda la aplicación) que recibe en su constructor un servicio *scoped* (debería vivir una petición). El singleton se crea **una sola vez**, así que se queda con **esa** instancia *scoped* para siempre. Un servicio que debía ser "de una petición" acaba compartido por todos los usuarios y todas las peticiones. A esto se le llama **dependencia cautiva** (*captive dependency*): la instancia de vida corta queda "secuestrada" por la de vida larga.

| Quién depende de quién | ¿Permitido? |
| --- | --- |
| Transient → Scoped, Singleton | Sí |
| Scoped → Scoped, Singleton | Sí |
| Singleton → Singleton | Sí |
| Singleton → **Scoped** o **Transient** | **No**: dependencia cautiva |
| Scoped → Transient | Sí (el transient vive lo que su dueño) |

Regla mnemotécnica: **un servicio solo puede depender de otros que vivan, al menos, tanto como él**.

Provoquémoslo a propósito. En `Program.cs`, cambia temporalmente el registro del servicio del experimento a singleton, que depende de `IScopedOperation`:

```csharp title="Program.cs (provoca el error, temporal)"
builder.Services.AddSingleton<OperationService>();
```

Ejecuta la API con <kbd>Ctrl</kbd> + <kbd>F5</kbd>. La aplicación **ni siquiera arranca**. En entorno `Development`, ASP.NET Core activa dos opciones del contenedor, `ValidateScopes` y `ValidateOnBuild`, que revisan todo el registro al llamar a `builder.Build()` y detectan el problema antes de que sirva una sola petición. El error empieza así:

```
System.AggregateException: Some services are not able to be constructed (Error while validating the service descriptor 'ServiceType: Bookshelf.Api.Lifetimes.OperationService Lifetime: Singleton ImplementationType: Bookshelf.Api.Lifetimes.OperationService': Cannot consume scoped service 'Bookshelf.Api.Lifetimes.IScopedOperation' from singleton 'Bookshelf.Api.Lifetimes.OperationService'.)
```

La frase clave es **`Cannot consume scoped service 'X' from singleton 'Y'`**: lee primero `Y` (el singleton culpable) y luego `X` (la dependencia scoped). La solución es cambiar el tiempo de vida de uno de los dos para que sean compatibles, no desactivar la validación.

:::warning La validación solo está activa en Development
En `Production` esas comprobaciones no se hacen por defecto (cuestan tiempo de arranque), así que el mismo error pasaría desapercibido y se manifestaría como datos mezclados entre usuarios. Es una razón más para desarrollar siempre con el entorno `Development` y no ignorar este error.
:::

### Limpia el experimento

El experimento ha cumplido su función. **Bórralo** para que no contamine el proyecto:

1. Elimina la carpeta `Lifetimes` (clic derecho > **Delete**).
2. En `Program.cs`, quita las cuatro líneas de registro del experimento y el `using Bookshelf.Api.Lifetimes;`. Debe quedar tal como lo dejamos antes del experimento (el listado de `Program.cs` de arriba).
3. Compila de nuevo para confirmar que no quedan referencias.

:::troubleshooting Errores comunes
- **`InvalidOperationException: Unable to resolve service for type 'Bookshelf.Api.Services.IBookService' while attempting to activate 'Bookshelf.Api.Controllers.BooksController'`:** olvidaste registrar el servicio (`builder.Services.AddScoped<IBookService, BookService>();`), o lo registraste después de `builder.Build()`. Compila sin error y falla en la **primera petición**, con un `500`.
- **`CS0535: 'BookService' does not implement interface member 'IBookService.GetById(int)'`:** la interfaz declara un método que la clase no tiene. Es el compilador protegiendo el contrato. Verás este error al hacer el reto si cambias la interfaz antes que la clase.
- **`Cannot consume scoped service 'X' from singleton 'Y'` al arrancar:** una dependencia cautiva (ver arriba). Cambia el tiempo de vida de `Y` a *scoped* o *transient*, o el de `X` a *singleton*.
- **`CS7036: There is no argument given that corresponds to the required parameter 'bookService'`:** estás haciendo `new BooksController()` en algún sitio. Los controllers los crea el framework; no los instancies.
- **`GET /api/books` devuelve la lista vacía o datos distintos entre peticiones:** si quitaste `static` de la lista del servicio mientras es *scoped*, cada petición tiene su propia lista. Déjala `static` por ahora.
:::

::::challenge Mueve GetById al servicio
Acabas de aplicar un patrón completo con `GetAll`: añadir el método al **contrato**, implementarlo en el **servicio** y **llamarlo** desde el controller. Repítelo tú con `GetById`, de modo que el controller ya no necesite la lista `static` y puedas **borrarla**.

Comportamiento esperado (idéntico al de antes):

- `GET /api/books/1` responde `200` con el libro.
- `GET /api/books/999` responde `404`.

Pregunta de diseño antes de empezar: ¿qué debería devolver el servicio cuando el libro no existe? ¿Debería el servicio saber algo de `404`?

:::hint
Sigue el orden de la capa hacia fuera: primero `IBookService` (el contrato), luego `BookService` (la implementación) y por último el controller. Si empiezas por el controller, el compilador te dirá que `IBookService` no tiene `GetById`.
:::

:::hint
El servicio no conoce HTTP, así que no puede devolver `NotFound()`. Devuelve un `Book?` (el `?` indica que puede ser `null`): el libro si existe, `null` si no. La decisión de convertir `null` en `404` es del controller. El cuerpo del servicio es la misma línea con `FirstOrDefault` que ya usaba el controller.
:::

:::hint
En el controller, `GetById` conserva su comprobación `if (book is null)` con `NotFound()`, pero la variable `book` ahora sale de `bookService.GetById(id)`. Al terminar, borra la lista `Books` del controller: ya no la usa nadie.
:::

:::solution
```csharp title="Services/IBookService.cs"
using Bookshelf.Api.Models;

namespace Bookshelf.Api.Services;

public interface IBookService
{
    List<Book> GetAll(string? genre);
    Book? GetById(int id);
}
```

```csharp title="Services/BookService.cs (método nuevo, al final de la clase)"
public Book? GetById(int id)
{
    return Books.FirstOrDefault(b => b.Id == id);
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
    public ActionResult<List<Book>> GetAll([FromQuery] string? genre)
    {
        var books = bookService.GetAll(genre);
        return Ok(books);
    }

    [HttpGet("{id:int}")]
    public ActionResult<Book> GetById(int id)
    {
        var book = bookService.GetById(id);

        if (book is null)
        {
            return NotFound();
        }

        return Ok(book);
    }
}
```

Por qué es así:

- El **contrato** dice `Book?`: "o te doy el libro, o te doy nada". Es una forma honesta de expresar "puede no existir" sin lanzar excepciones.
- El **servicio** no sabe qué es un `404`; solo informa de si encontró el libro. Que "no encontrado" se traduzca en `404` es un detalle de HTTP, y por eso vive en el controller.
- El controller ya no tiene datos: solo traduce. Todos los libros viven en un único lugar (`BookService`), así que `GetAll` y `GetById` nunca podrán discrepar.
- Si la lista de libros sigue en el controller por descuido, el código compila y *parece* funcionar, pero estarías sirviendo dos copias de los datos. Comprueba que borraste `Books` del controller.
:::
::::

:::recap
- La **inversión de control** hace que una clase declare lo que necesita y otro se lo proporcione; la **inyección de dependencias** lo logra pidiendo las dependencias en el **constructor**.
- Una **interfaz** es un contrato: el controller depende de `IBookService`, no de `BookService`, así que la implementación se puede cambiar sin tocarlo.
- El **contenedor** se rellena en `builder.Services` (fase de registro) y resuelve el árbol de dependencias por ti. Un servicio sin registrar da `Unable to resolve service` en la primera petición.
- **Singleton** = una instancia para toda la aplicación; **Scoped** = una por petición HTTP; **Transient** = una por cada vez que se pide. El experimento de los `Guid` lo demuestra.
- Un servicio solo puede depender de otros con **igual o mayor** vida. Lo contrario es una **dependencia cautiva**, y en `Development` la aplicación se niega a arrancar.
- Hoy `BookService` es provisional (lista `static` en memoria, métodos síncronos y que devuelven `Book`).

En el siguiente paso crearás un **repositorio** que lee y escribe `books.json`, harás el código **asíncrono** y verás por qué ese repositorio sí debe ser un singleton.
:::
