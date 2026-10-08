## Objetivo del paso

Hasta ahora has visto errores **esperados**: un id que no existe (`404`) o un dato inválido (`400`). Pero toda aplicación real tiene también errores **inesperados**: un archivo corrupto, una base de datos caída, un `null` que no debía serlo. En este paso vas a decidir qué hace tu API cuando eso ocurre, y a dominar la herramienta con la que investigarás esos fallos: el **logging**. Vas a:

1. Ver qué pasa por defecto cuando una excepción no se controla, en `Development` y fuera de él.
2. Crear un manejador global con `IExceptionHandler` y activarlo en el pipeline.
3. Convertir también los errores "vacíos" (como un `404` de una ruta inexistente) en `ProblemDetails`.
4. Entender por qué el **orden** de los middleware importa para registrar el tiempo de las peticiones fallidas.
5. Profundizar en `ILogger`: categorías, niveles y filtros por configuración.

## Qué ocurre con una excepción no controlada

Una **excepción no controlada** es un error que nadie captura con `try/catch`: sube por todas las capas (repositorio → servicio → controller) y llega al pipeline. Provoquemos una a propósito para ver el comportamiento actual de tu API.

### Experimento 1: corromper el archivo de datos

1. Detén la API.
2. Abre `Data/books.json` y deja **solo** este contenido, que es un JSON incompleto:

```json title="Data/books.json (temporal, rompe el archivo)"
[ { "id": 1, "title":
```

3. Ejecuta la API y haz `GET /api/books`.

El repositorio intenta deserializar el archivo y `System.Text.Json` lanza una `JsonException`. Nadie la captura. Lo que ve el cliente depende del **entorno**:

| Entorno | Respuesta |
| --- | --- |
| `Development` | `500` con el **detalle completo de la excepción**: tipo, mensaje y *stack trace* (la traza de llamadas, con rutas de archivo de tu máquina). Si lo pides desde un navegador, ASP.NET Core muestra una página HTML con pestañas; con `curl` o similar recibes texto plano. |
| `Production` | `500` **sin cuerpo**. Solo el código. |

En `Development` es una página de ayuda muy útil para ti (la **Developer Exception Page**, que el framework activa por defecto en ese entorno). Pero es una página que **jamás** debe verse en producción.

:::warning Nunca filtres detalles internos al cliente
Un *stack trace* revela nombres de clases, rutas del servidor, versiones de bibliotecas y la estructura de tu código. Un atacante lo usa para planificar su ataque; un usuario normal no puede hacer nada con él. La política correcta es: **el cliente recibe un mensaje genérico; el detalle completo va a los logs**, que solo ve el equipo.
:::

Tampoco es ideal el comportamiento de producción: un `500` vacío no dice nada al cliente y no es consistente con el resto de tus errores, que ya son `ProblemDetails`. Queremos una respuesta **uniforme** y **segura** en todos los entornos.

Fíjate además en la consola: **falta** el log de tu middleware de tiempos (`responded ... in ... ms`). Como la excepción atraviesa el middleware antes de que escriba su mensaje, la petición fallida no deja ninguna línea de tiempos. Volveremos sobre esto al hablar del orden.

## El manejador global de excepciones

ASP.NET Core ofrece una pieza para esto: el **middleware de manejo de excepciones** (`UseExceptionHandler`). Envuelve el resto del pipeline en un `try/catch` y, si hay una excepción, la pasa por una cadena de manejadores. Tú escribes un manejador implementando `IExceptionHandler`.

:::concept IExceptionHandler
Es una interfaz con un único método:

```csharp
ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
```

El middleware llama a cada manejador registrado, en orden, hasta que uno devuelve `true`, que significa "**yo me ocupo**, ya escribí la respuesta". Si devuelve `false`, pasa al siguiente (y, si ninguno la maneja, al comportamiento por defecto). Un manejador es un servicio **singleton**, así que puede recibir dependencias por constructor, como cualquier clase del contenedor.
:::

Crea el manejador:

:::vs Crear Errors/GlobalExceptionHandler.cs
1. Clic derecho sobre el proyecto > **Add** > **New Folder** > **`Errors`**.
2. Dentro, **Add** > **Class…** > **`GlobalExceptionHandler.cs`**.
3. Reemplaza el contenido por el código siguiente.
:::

```csharp title="Errors/GlobalExceptionHandler.cs"
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace Bookshelf.Api.Errors;

public class GlobalExceptionHandler(
    ILogger<GlobalExceptionHandler> logger,
    IProblemDetailsService problemDetailsService) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        logger.LogError(exception, "Unhandled exception on {Method} {Path}",
            httpContext.Request.Method, httpContext.Request.Path);

        httpContext.Response.StatusCode = StatusCodes.Status500InternalServerError;

        // The client gets a generic message; the details stay in the log.
        return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            Exception = exception,
            ProblemDetails = new ProblemDetails
            {
                Status = StatusCodes.Status500InternalServerError,
                Title = "An unexpected error occurred.",
                Detail = "Something went wrong on our side. Please try again later."
            }
        });
    }
}
```

| Elemento | Qué significa |
| --- | --- |
| `ILogger<GlobalExceptionHandler> logger` | Para registrar la excepción. La categoría del logger será el nombre completo de la clase. |
| `IProblemDetailsService problemDetailsService` | Servicio del framework que escribe una respuesta `ProblemDetails` respetando el formato negociado (JSON). Lo registraremos con `AddProblemDetails()`. |
| `ValueTask<bool>` | Parecido a `Task<bool>` pero más ligero cuando a menudo no hay trabajo real. Se usa con `await` igual que una `Task`. |
| `logger.LogError(exception, "Unhandled exception on {Method} {Path}", ...)` | Registra con nivel `Error` y **adjunta la excepción completa** (con su traza) como primer argumento. La plantilla añade contexto: método y ruta como valores nombrados. |
| `httpContext.Response.StatusCode = 500` | Fija el código de estado antes de escribir el cuerpo. |
| `new ProblemDetails { Status, Title, Detail }` | El cuerpo: un mensaje **genérico**. Observa que no incluye `exception.Message` ni la traza. |
| `return await problemDetailsService.TryWriteAsync(...)` | Escribe la respuesta. Devuelve `true` si lo consiguió (el middleware se da por satisfecho) o `false` si no pudo. |
| `Exception = exception` en el contexto | Se pasa a quienes personalicen el `ProblemDetails`. No se serializa por sí solo. |

:::why ¿Por qué el manejador escribe él mismo el log?
Porque desde .NET 10, cuando un `IExceptionHandler` devuelve `true` ("lo manejé"), el middleware **no** vuelve a registrar la excepción por su cuenta. Si el manejador no la registrara, el error desaparecería sin dejar rastro. Por eso el primer paso del manejador es siempre `LogError`: es lo único que te permitirá, después, saber **qué** falló.
:::

### Registrarlo y activarlo

Hacen falta cuatro líneas en `Program.cs`: dos en la fase de servicios y dos en el pipeline. Añade `using Bookshelf.Api.Errors;`, y deja el archivo así:

```csharp title="Program.cs"
using Bookshelf.Api.Errors;
using Bookshelf.Api.Middleware;
using Bookshelf.Api.Options;
using Bookshelf.Api.Repositories;
using Bookshelf.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

builder.Services.Configure<BookStorageOptions>(
    builder.Configuration.GetSection(BookStorageOptions.SectionName));
builder.Services.AddSingleton<IBookRepository, JsonBookRepository>();
builder.Services.AddScoped<IBookService, BookService>();

var app = builder.Build();

app.UseRequestTiming();
app.UseExceptionHandler();
app.UseStatusCodePages();

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

| Línea | Qué hace |
| --- | --- |
| `builder.Services.AddProblemDetails();` | Registra `IProblemDetailsService` y el escritor de `ProblemDetails`. Lo necesita nuestro manejador (sin esta línea, la aplicación no arranca en `Development`: el contenedor detecta que `GlobalExceptionHandler` pide un servicio no registrado). También permite que el framework convierta en `ProblemDetails` otras respuestas de error sin cuerpo. |
| `builder.Services.AddExceptionHandler<GlobalExceptionHandler>();` | Registra el manejador en el contenedor (como singleton). |
| `app.UseExceptionHandler();` | Añade el middleware que captura excepciones y llama a los manejadores. Sin esta línea, los manejadores registrados nunca se ejecutan. |
| `app.UseStatusCodePages();` | Añade el middleware que rellena las respuestas de error (400-599) que **no traen cuerpo**. Lo explicamos a continuación. |

### UseStatusCodePages: respuestas de error vacías

Hay otro tipo de respuesta de error sin cuerpo: cuando ninguna ruta coincide. Prueba `GET /api/nope`. Sin `UseStatusCodePages`, recibes un `404` completamente vacío. Con `AddProblemDetails()` y `UseStatusCodePages()`, ese `404` se convierte en un `ProblemDetails`, igual que los demás:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Not Found",
  "status": 404,
  "traceId": "00-7578c6f20cc0b95370d382d760c60bb0-e8eaabc23ef5d123-00"
}
```

Es la pieza que faltaba para que **todos** tus errores, ya vengan de un controller, de una ruta inexistente o de una excepción, tengan el mismo formato. (Sin `AddProblemDetails`, `UseStatusCodePages` produce un texto plano `Status Code: 404; Not Found`.)

### El orden importa (otra vez)

Mira de nuevo las tres primeras líneas del pipeline:

```csharp
app.UseRequestTiming();
app.UseExceptionHandler();
app.UseStatusCodePages();
```

En el paso 6 aprendiste que los middleware forman una "cebolla": cada uno envuelve a los siguientes. `UseRequestTiming` es la capa **más externa** de las nuestras y `UseExceptionHandler` va justo dentro de ella:

```
Petición ─▶ [Timing] ─▶ [ExceptionHandler] ─▶ [StatusCodePages] ─▶ ... ─▶ Controller ─ excepción
Respuesta ◀─ [Timing]    ◀─ captura la excepción y escribe el 500 ProblemDetails
             (ve el 500 final y lo registra)
```

La excepción sube hasta `ExceptionHandler`, que la captura y escribe el `500`. Para el middleware de tiempos, lo que ocurrió dentro fue una respuesta normal con código `500`: cuando `await next(context)` termina, mide el tiempo y registra `GET /api/books responded 500 in 95 ms`.

Si invirtieras el orden y pusieras `UseExceptionHandler` **antes** de `UseRequestTiming`, la excepción atravesaría primero al middleware de tiempos, que **no la captura** (no tiene `try/catch`), y su línea de log nunca se ejecutaría. Lo comprobamos ejecutándolo: las peticiones fallidas no dejaban ni una línea de tiempos, justo las que más te interesa medir. Regla práctica: lo que quiera **observar todo** (tiempos, logging de peticiones) va **fuera**; el manejo de errores va justo **dentro** de eso, antes de todo lo que pueda lanzar excepciones.

:::checkpoint Un 500 uniforme y seguro
Con `Data/books.json` aún corrupto, ejecuta la API y haz `GET /api/books`:

**Respuesta** (`500`, `Content-Type: application/problem+json`):

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.6.1",
  "title": "An unexpected error occurred.",
  "status": 500,
  "detail": "Something went wrong on our side. Please try again later.",
  "traceId": "00-bcb6a94d91d53048cf2afd9d9ca8e694-dc7915c1c465f056-00"
}
```

No hay nombres de clases, rutas ni trazas: solo un mensaje genérico. **El detalle está en la consola**, con nivel `fail`:

```
fail: Bookshelf.Api.Errors.GlobalExceptionHandler[0]
      Unhandled exception on GET /api/books
      System.Text.Json.JsonException: Expected depth to be zero at the end of the JSON payload. ...
         at Bookshelf.Api.Repositories.JsonBookRepository.LoadAsync() in ...
         at Bookshelf.Api.Repositories.JsonBookRepository.GetAllAsync() in ...
```

(la traza es larga; verás exactamente en qué línea de tu repositorio ocurrió) y, justo después, tu middleware de tiempos con el código final:

```
info: Bookshelf.Api.Middleware.RequestTimingMiddleware[0]
      GET /api/books responded 500 in 95 ms
```

Comprueba además `GET /api/nope` → `404` con `ProblemDetails`.

**Ahora restaura el archivo.** Pega de nuevo en `Data/books.json` el contenido original del paso 9 (o recupéralo del control de versiones) y comprueba que `GET /api/books` vuelve a responder `200` con los ocho libros.
:::

:::tip Cómo relacionar una respuesta con su log
El `traceId` de la respuesta identifica la petición. En una aplicación real, un cliente que reporte «me falló esto» te da ese valor y lo buscas en los logs. Es la razón por la que `ProblemDetails` lo incluye.
:::

## Logging a fondo

Ya has usado `ILogger` en tres sitios: el middleware de tiempos, `BookService` y ahora el manejador de excepciones. Es hora de entenderlo con precisión.

### Categorías

:::concept Categoría de un logger
Cuando pides `ILogger<T>`, el framework crea un logger cuya **categoría** es el **nombre completo del tipo `T`**: `ILogger<BookService>` tiene la categoría `Bookshelf.Api.Services.BookService`. La categoría aparece en cada línea de log (la parte `Bookshelf.Api.Services.BookService[0]` antes del mensaje; el `[0]` es el identificador del evento) y sirve para dos cosas: saber **quién** escribió el mensaje y **filtrar** por origen.
:::

### Niveles

Cada mensaje se escribe con un **nivel** de gravedad. De menor a mayor:

| Nivel | Método | Cuándo usarlo | Ejemplo |
| --- | --- | --- | --- |
| `Trace` (0) | `LogTrace` | Detalle extremo, normalmente solo para depurar a fondo. | Valores de cada variable intermedia. |
| `Debug` (1) | `LogDebug` | Información útil durante el desarrollo, pero ruidosa. | `Listing books (genre: Fantasy)` |
| `Information` (2) | `LogInformation` | Hitos normales de la aplicación. | `Created book 9: Pedro Páramo` |
| `Warning` (3) | `LogWarning` | Algo inesperado, pero la aplicación sigue funcionando. | Un archivo de configuración opcional ausente. |
| `Error` (4) | `LogError` | Una operación falló. | La excepción no controlada de este paso. |
| `Critical` (5) | `LogCritical` | Fallo grave que compromete la aplicación entera. | Imposible conectar con el almacenamiento. |
| `None` (6) | — | Valor especial en configuración para silenciar. | |

En la consola se muestran con un prefijo abreviado: `trce`, `dbug`, `info`, `warn`, `fail` (para `Error`) y `crit`.

### Filtros por configuración

El nivel mínimo se decide en la configuración, sin tocar el código. Abre `appsettings.json`:

```json
"Logging": {
  "LogLevel": {
    "Default": "Information",
    "Microsoft.AspNetCore": "Warning"
  }
}
```

| Entrada | Significado |
| --- | --- |
| `"Default": "Information"` | Para cualquier categoría sin regla propia, se muestran los mensajes de `Information` o más graves. Los `Debug` y `Trace` se descartan. |
| `"Microsoft.AspNetCore": "Warning"` | Para las categorías que **empiezan por** `Microsoft.AspNetCore` (todo el framework web), solo `Warning` o más. Es lo que mantiene la consola limpia: sin esta regla verías una línea por cada paso interno de cada petición. |

Regla de resolución: gana la entrada **más específica** (el prefijo más largo que coincida con la categoría). Y como la configuración es una pila de fuentes (paso 10), el nivel puede variar por entorno con `appsettings.Development.json` o con una variable de entorno (`Logging__LogLevel__Default=Debug`).

Un mensaje por debajo del nivel mínimo **ni siquiera se genera**: es barato dejar muchos `LogDebug` en el código y decidir al ejecutar si se ven.

### Plantillas (repaso)

Compara estas dos formas:

```csharp
logger.LogInformation("Created book {BookId}: {Title}", book.Id, book.Title);   // template
logger.LogInformation($"Created book {book.Id}: {book.Title}");                 // interpolation: avoid
```

La primera es una **plantilla**: los marcadores `{BookId}` y `{Title}` se rellenan por **posición** con los argumentos que siguen, y el sistema conserva los valores como datos estructurados con nombre. Un proveedor de logs avanzado (Seq, Application Insights…) puede entonces buscar «todos los eventos con `BookId = 9`». La segunda construye un texto plano antes de llamar, perdiendo esa estructura y gastando recursos aunque el nivel esté desactivado. Usa siempre plantillas, y escribe los nombres de los marcadores en `PascalCase`.

### Dónde se ven los logs

| Dónde | Cuándo |
| --- | --- |
| **Ventana de consola** de la aplicación | Siempre. Es la que se abre al ejecutar con <kbd>Ctrl</kbd> + <kbd>F5</kbd>. Es el proveedor `Console`, activo por defecto. |
| **Ventana Output** de Visual Studio, desplegable *Show output from* > **Debug** | Al ejecutar **con depuración** (<kbd>F5</kbd>). Viene del proveedor `Debug`, también activo por defecto, que solo escribe cuando hay un depurador conectado. Se abre con **View** > **Output** (<kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>O</kbd>). |

(En aplicaciones reales se añaden más destinos, como archivos o servicios en la nube, con proveedores de logging adicionales. Quedan fuera de este tutorial.)

:::troubleshooting Errores comunes
- **La aplicación no arranca: `Unable to resolve service for type 'Microsoft.AspNetCore.Http.IProblemDetailsService' while attempting to activate 'Bookshelf.Api.Errors.GlobalExceptionHandler'`:** falta `builder.Services.AddProblemDetails();`.
- **El `500` sigue saliendo vacío o como página/texto de depuración:** falta `app.UseExceptionHandler();` en el pipeline (registrar el manejador con `AddExceptionHandler` no basta), o está colocado después del código que lanza la excepción.
- **La excepción ocurre pero no veo ningún `fail:` en la consola:** si ajustaste `Logging:LogLevel` en exceso (por ejemplo `"Default": "None"`), el `Error` se descarta. Revisa los niveles.
- **`GET /api/nope` sigue devolviendo `404` vacío:** falta `app.UseStatusCodePages();` o `AddProblemDetails()`. Sin lo segundo, el cuerpo es texto plano.
- **Las peticiones que fallan no aparecen en los logs de tiempos:** `UseRequestTiming` está después de `UseExceptionHandler`. Debe ir antes.
- **`CS0246: The type or namespace name 'IProblemDetailsService' could not be found`:** esa interfaz pertenece al espacio de nombres `Microsoft.AspNetCore.Http`, incluido en los *implicit usings*. Si falta, revisa que `ImplicitUsings` esté `enable` en el `.csproj`.
- **Dejaste `Data/books.json` roto después del experimento:** restáuralo desde el control de versiones o con el contenido del paso 9.
:::

::::challenge Logs de depuración solo en Development
Quieres ver mensajes de nivel `Debug` de **tu** código mientras desarrollas, pero sin ruido en producción y sin activar el nivel `Debug` de todo el framework.

Tu tarea:

1. Configura el nivel `Debug` para las categorías que empiezan por `Bookshelf.Api`, **solo en `Development`**, sin tocar `appsettings.json` ni código C# para ello.
2. Añade una llamada `LogDebug` en `BookService.GetAllAsync` que registre los filtros recibidos (`genre` e `isRead`), con una plantilla.
3. Comprueba que, al llamar a `GET /api/books?genre=Fantasy`, aparece una línea `dbug:` en la consola.
4. Razona qué ocurriría con `ASPNETCORE_ENVIRONMENT=Production` y por qué el `Microsoft.AspNetCore` no se vuelve ruidoso.
5. **Revierte** los cambios al terminar para que tu proyecto coincida con el del tutorial.

:::hint
Piensa en el paso 10: ¿qué archivo se aplica **solo** en `Development` y pisa a `appsettings.json`? Ahí debes ampliar la sección `Logging:LogLevel` que ya existe. Las categorías se resuelven por prefijo, así que una sola entrada puede cubrir todas las clases de tu proyecto.
:::

:::hint
En `appsettings.Development.json`, dentro de `Logging:LogLevel`, añade una entrada cuya clave sea el prefijo común de los namespaces de tu proyecto (`Bookshelf.Api`) y cuyo valor sea `"Debug"`. En `BookService` ya tienes el `logger`; usa su método `LogDebug` con una plantilla con dos marcadores, por ejemplo `{Genre}` e `{IsRead}`.
:::

:::solution
```json title="appsettings.Development.json (temporal)"
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning",
      "Bookshelf.Api": "Debug"
    }
  }
}
```

```csharp title="Services/BookService.cs (inicio de GetAllAsync, temporal)"
public async Task<List<BookResponse>> GetAllAsync(string? genre, bool? isRead)
{
    logger.LogDebug("Listing books (genre: {Genre}, isRead: {IsRead})", genre, isRead);

    var books = await repository.GetAllAsync();
    // ... the rest does not change
```

Al ejecutar `GET /api/books?genre=Fantasy` con el perfil `http` aparece:

```
dbug: Bookshelf.Api.Services.BookService[0]
      Listing books (genre: Fantasy, isRead: (null))
info: Bookshelf.Api.Middleware.RequestTimingMiddleware[0]
      GET /api/books responded 200 in 96 ms
```

Por qué funciona:

- `appsettings.Development.json` se aplica solo con `ASPNETCORE_ENVIRONMENT=Development` y **pisa clave a clave** a `appsettings.json`. Las claves que no repites (como `Default`) se conservan.
- `"Bookshelf.Api": "Debug"` aplica a toda categoría que **empieza por** ese prefijo: `Bookshelf.Api.Services.BookService`, `Bookshelf.Api.Middleware.RequestTimingMiddleware`, `Bookshelf.Api.Errors.GlobalExceptionHandler`… Mientras tanto, `Microsoft.AspNetCore` sigue en `Warning` porque su regla es más específica para esas categorías, así que el framework no se vuelve ruidoso.
- Con `Production`, el archivo de Development no se carga, el nivel de `Bookshelf.Api.*` es el de `Default` (`Information`) y la llamada `LogDebug` se descarta sin coste: el mensaje ni se construye. Lo comprobamos ejecutando así la aplicación: ningún mensaje de `BookService` aparece.
- `isRead: (null)` es cómo se muestra un valor `null` en una plantilla. No es un error.

**Revierte:** deja `appsettings.Development.json` con las dos entradas originales (sin `Bookshelf.Api`) y borra la línea `LogDebug` de `BookService`. Si te gusta tener el nivel `Debug` en tu máquina, es una configuración legítima, pero el resto del tutorial asume el código sin ella.
:::
::::

:::recap
- Una excepción no controlada produce un `500`: en `Development` con detalle y traza (Developer Exception Page); en `Production` vacío. Nunca expongas trazas al cliente.
- `IExceptionHandler` (`GlobalExceptionHandler`) registra el error completo con `LogError` y responde un `ProblemDetails` **genérico**. Requiere `AddProblemDetails()`, `AddExceptionHandler<T>()` y `UseExceptionHandler()`.
- `UseStatusCodePages()` + `AddProblemDetails()` convierten las respuestas de error sin cuerpo (como un `404` de ruta inexistente) en `ProblemDetails`.
- **Orden:** `UseRequestTiming` primero, para registrar también el `500` final; después `UseExceptionHandler` y `UseStatusCodePages`.
- `ILogger<T>` usa el nombre completo de `T` como **categoría**. Los niveles van de `Trace` a `Critical`; `Logging:LogLevel` filtra por prefijo de categoría, con la regla más específica ganando.
- Usa plantillas (`{BookId}`) y no interpolación; los logs se ven en la consola y, al depurar, en **Output > Debug**.

En el último paso documentarás la API con **OpenAPI** y **Scalar**, revisarás `Program.cs` línea a línea y harás el recorrido completo de una petición, de principio a fin.
:::
