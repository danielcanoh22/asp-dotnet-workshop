## Objetivo del paso

Hasta ahora te has ocupado de los errores **esperados**: datos mal formados, recursos que no existen, reglas de negocio. Este paso trata de los otros: los que **no deberían pasar**. Una base de datos que no responde, un `null` que nadie previó, un error de programación. No puedes evitarlos todos, pero sí decidir **qué ve el cliente** y **qué queda en tus logs** cuando ocurren. Vas a:

1. Provocar una excepción a propósito con un endpoint **temporal** y ver qué responde hoy tu API.
2. Entender **`IExceptionHandler`**: una cadena de manejadores que el middleware de excepciones recorre en orden.
3. Escribir un **`GlobalExceptionHandler`** que responde con `ProblemDetails` usando **`IProblemDetailsService`**.
4. Sustituir el `StatusCodeSelector` del tutorial 2 por un simple `app.UseExceptionHandler()`.
5. Saber por qué en .NET 10 **tienes que registrar tú el error en el log**.
6. Ver la diferencia entre **Development** y **Production**, y por qué el `detail` de un `500` nunca debe salir de tu máquina.

## Un endpoint que falla a propósito

Para estudiar un error inesperado necesitas uno que puedas repetir. Añade este endpoint **temporal** en `Program.cs`, justo después de `app.MapTagEndpoints();`. Lo borrarás al final del paso.

```csharp title="Program.cs (experimento temporal, tras app.MapTagEndpoints())"
// TEMPORARY: an endpoint that fails on purpose. Delete it at the end of step 9.
app.MapGet("/api/boom", () => { throw new InvalidOperationException("Boom! Connection to 'tasks-db-01' failed for user 'admin'."); });
```

El mensaje imita los que lanzan de verdad las bibliotecas de acceso a datos: nombres de servidores, usuarios, rutas de archivos. Justo lo que no quieres enseñar a un desconocido.

Ejecuta la API y lanza `GET /api/boom`. La respuesta:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.6.1",
  "title": "An error occurred while processing your request.",
  "status": 500,
  "instance": "GET /api/boom",
  "traceId": "00-7cd83d49c5b6fe9431b82bd46f548c72-bfefda2dd9c17a92-00"
}
```

Y en la consola:

```
fail: Microsoft.AspNetCore.Diagnostics.ExceptionHandlerMiddleware[1]
      An unhandled exception has occurred while executing the request.
      System.InvalidOperationException: Boom! Connection to 'tasks-db-01' failed for user 'admin'.
         at Program.<>c.<<Main>$>b__0_3() in ...\Program.cs:line 71
```

No está mal: es el `UseExceptionHandler` que configuraste en el tutorial 2, con el `StatusCodeSelector` que mantenía los `400` de *binding*. No filtra el mensaje y deja la excepción completa en el log. Pero:

- Todo error inesperado es igual de opaco, también en tu máquina, donde ver el mensaje te ahorraría abrir la consola.
- No tiene `code`, a diferencia del resto de tu catálogo.
- No hay un sitio donde **decidir por tipo de excepción**. En el paso siguiente querrás que un `DbUpdateException` concreto se convierta en `409` y no en `500`.

## IExceptionHandler: una cadena de manejadores

:::concept IExceptionHandler
`IExceptionHandler` es una interfaz de ASP.NET Core con un único método:

```csharp
ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken);
```

Cuando una excepción llega al middleware de `UseExceptionHandler`, este **recorre los manejadores registrados en orden**:

- Si un manejador devuelve **`true`**, la excepción está resuelta: él ha escrito la respuesta y el recorrido termina.
- Si devuelve **`false`**, "no es mía": el middleware prueba con el siguiente.
- Si ninguno devuelve `true`, el middleware aplica su comportamiento por defecto (el `500` genérico que acabas de ver).

Se registran con **`builder.Services.AddExceptionHandler<T>()`**, y el orden de registro es el orden de la cadena. Registrarlos no basta: sin `app.UseExceptionHandler()` en el pipeline, nadie los llama.
:::

:::warning Los manejadores son singleton
ASP.NET Core crea **una sola instancia** de cada `IExceptionHandler` para toda la aplicación. Por eso solo deben recibir en el constructor servicios que también lo sean (`ILogger<T>`, `IHostEnvironment`, `IProblemDetailsService`). Si necesitaras algo *scoped*, como el `DbContext`, tendrías que pedirlo a `httpContext.RequestServices` dentro de `TryHandleAsync`. Nuestros manejadores no lo necesitan.
:::

:::concept IProblemDetailsService
El manejador tiene que escribir la respuesta él mismo. Podría serializar un JSON a mano, pero entonces se saltaría todo lo que configuraste en el paso 7. **`IProblemDetailsService`** es el servicio que registra `AddProblemDetails()`, el mismo que usan la validación, los `TypedResults.Problem` y `UseStatusCodePages`. Su método **`TryWriteAsync`** recibe un `ProblemDetailsContext` y escribe la respuesta pasando por `CustomizeProblemDetails`. Así tus `500` también tendrán `instance` y `traceId` sin repetir código.

Un detalle importante: `TryWriteAsync` **no** cambia el código de estado de la respuesta. Hay que asignar `httpContext.Response.StatusCode` antes de llamarlo.
:::

## El manejador global

Este será el **último** manejador de la cadena: el que recoge todo lo que nadie más resolvió. Distingue dos casos:

| Excepción | Qué significa | Respuesta |
| --- | --- | --- |
| `BadHttpRequestException` | La petición no se pudo leer: JSON mal formado, `?status=Unknown`... Es culpa del cliente. | Su propio código (`400`), con `"title": "Bad request"` y el mensaje como `detail`. |
| Cualquier otra | Algo falló en el servidor. | `500`, `"code": "server.unexpected_error"`, registrado en el log, `detail` **solo en Development**. |

:::why ¿Por qué aparece BadHttpRequestException?
Lo viste en el paso 10 del tutorial 2: en `Development`, Minimal APIs activa `ThrowOnBadRequest` y, cuando no puede enlazar un parámetro, **lanza** un `BadHttpRequestException` en lugar de responder `400` en silencio. Así ves el motivo en la consola mientras desarrollas. Ese era el trabajo del `StatusCodeSelector`: impedir que esa excepción acabara en `500`. Ahora lo hará el manejador, y además pondrá el motivo en el `detail`.
:::

:::vs Crear Errors/GlobalExceptionHandler.cs
Clic derecho sobre la carpeta `Errors` > **Add** > **Class…** > **`GlobalExceptionHandler.cs`**, y reemplaza todo su contenido por el siguiente.
:::

```csharp title="Errors/GlobalExceptionHandler.cs"
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace TaskTracker.Api.Errors;

// Last handler in the chain: whatever nobody else handled ends here.
public sealed class GlobalExceptionHandler(
    IProblemDetailsService problemDetailsService,
    IHostEnvironment environment,
    ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        ProblemDetails problem;

        if (exception is BadHttpRequestException badRequest)
        {
            // In Development, Minimal APIs throw this for input they cannot bind (bad JSON, ?status=Nope).
            problem = new ProblemDetails
            {
                Status = badRequest.StatusCode,
                Title = "Bad request",
                Detail = badRequest.Message,
            };
        }
        else
        {
            // .NET 10 does not log exceptions that a handler marks as handled, so we log it ourselves.
            logger.LogError(exception, "Unhandled exception on {Method} {Path}",
                httpContext.Request.Method, httpContext.Request.Path);

            problem = new ProblemDetails
            {
                Status = StatusCodes.Status500InternalServerError,
                Title = "An unexpected error occurred",
                // Internal details help you while developing and help an attacker in production.
                Detail = environment.IsDevelopment() ? exception.Message : null,
            };
            problem.Extensions["code"] = "server.unexpected_error";
        }

        httpContext.Response.StatusCode = problem.Status.Value;

        return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problem,
            Exception = exception,
        });
    }
}
```

Lo importante:

- **Constructor primario** con tres dependencias singleton: el servicio de `ProblemDetails`, el entorno (para saber si es `Development`) y un logger con la categoría de la clase.
- **`ProblemDetails`** (de `Microsoft.AspNetCore.Mvc`) es la clase que representa el JSON. Aquí la construyes tú, porque `TypedResults.Problem` crea un *resultado* de endpoint y en un manejador no hay endpoint que lo ejecute.
- **`problem.Extensions["code"]`** es el mismo mecanismo que usó `ApiProblems` con su diccionario `extensions`.
- **`Detail = environment.IsDevelopment() ? exception.Message : null`**: con `null`, el campo ni siquiera aparece en el JSON.
- **`return await problemDetailsService.TryWriteAsync(...)`**: devuelve `true` si pudo escribir la respuesta. Si por algún motivo no pudiera (por ejemplo, un cliente que no acepta JSON), devolvería `false` y el middleware seguiría con el siguiente manejador o, si no hay más, con su respuesta por defecto. Pasar `Exception` en el contexto permite que otros componentes sepan qué la provocó.
- **No hay `code` en el `400`**: como viste en el paso 7, el `code` distingue errores con el mismo `status`, y la validación y el *binding* no lo necesitan.

:::warning .NET 10 ya no registra lo que tú resuelves
Hasta .NET 9, el middleware escribía la excepción en el log (el `fail: ...ExceptionHandlerMiddleware[1]` que has visto) **aunque un `IExceptionHandler` la hubiera resuelto**. Desde .NET 10, si `TryHandleAsync` devuelve `true`, el middleware **no la registra** por defecto: entiende que, si la has manejado, también has decidido qué hacer con ella.

Para un `400` de cliente, perfecto: no es un fallo del servidor. Para un `500`, sería un desastre: tu API fallaría y **nadie se enteraría**. Por eso el manejador llama a `logger.LogError(exception, ...)` antes de responder, con la excepción completa y la petición que la causó.

Si prefieres el comportamiento anterior, `ExceptionHandlerOptions` tiene una propiedad nueva, `SuppressDiagnosticsCallback`, que decide para cada excepción si se suprime el registro. Nosotros preferimos que cada manejador decida explícitamente qué registra.
:::

## Registrar la cadena y simplificar el pipeline

Abre `Program.cs`. Añade el `using` de la carpeta `Errors` junto a los demás:

```csharp title="Program.cs (using nuevo, tras TaskTracker.Api.Endpoints)"
using TaskTracker.Api.Errors;
```

Registra el manejador justo después de `AddProblemDetails`. La sección de servicios empieza así:

```csharp title="Program.cs (sección Services, hasta el manejador)"
// --- Services ---
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails(options =>
    // Runs for every ProblemDetails the app writes: validation, TypedResults.Problem and exception handlers.
    options.CustomizeProblemDetails = context =>
        context.ProblemDetails.Instance ??=
            $"{context.HttpContext.Request.Method} {context.HttpContext.Request.Path}");

// Called in registration order until one returns true.
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
```

Ahora la cadena tiene un solo eslabón; en el paso siguiente añadirás otro **delante** de este, y por eso el comentario ya habla de orden.

Por último, reemplaza el bloque de `UseExceptionHandler` con su `StatusCodeSelector` (y los dos comentarios que lo acompañan). La sección del pipeline queda así:

```csharp title="Program.cs (sección Middleware pipeline)"
// --- Middleware pipeline ---
app.UseExceptionHandler(); // Runs the IExceptionHandler chain registered above.
app.UseStatusCodePages();
app.UseHttpsRedirection();
```

Sin argumentos, `UseExceptionHandler()` ejecuta los `IExceptionHandler` registrados y, si ninguno resuelve la excepción, responde con el `ProblemDetails` por defecto (por eso necesita que exista `AddProblemDetails()`). El `StatusCodeSelector` ya no hace falta: tu manejador asigna el código de los `BadHttpRequestException` por su cuenta.

:::checkpoint El manejador global en Development
Compila y ejecuta la API con el perfil **http**, como siempre. Comprueba:

| Petición | Resultado esperado |
| --- | --- |
| `GET /api/boom` | `500` con `"title": "An unexpected error occurred"`, el mensaje en `detail` y `"code": "server.unexpected_error"`. |
| `GET /api/projects/1/tasks?status=Unknown` | `400`, `"title": "Bad request"`, `"detail": "Failed to bind parameter \"Nullable<TaskItemStatus> Status\" from \"Unknown\"."` |
| `POST /api/projects` con el JSON roto de `errors.http` (`{ "name":`) | `400`, `"title": "Bad request"`, `"detail": "Failed to read parameter \"CreateProjectRequest request\" from the request body as JSON."` |
| `GET /api/projects/999` | `404` como antes: los resultados que devuelven tus handlers no son excepciones y no pasan por la cadena. |

La respuesta de `/api/boom`:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.6.1",
  "title": "An unexpected error occurred",
  "status": 500,
  "detail": "Boom! Connection to 'tasks-db-01' failed for user 'admin'.",
  "instance": "GET /api/boom",
  "code": "server.unexpected_error",
  "traceId": "00-9ff2080a62c3f74541cd93e634d3a06c-c6b52e150c8dadb1-00"
}
```

Y en la consola, **una sola** entrada, la tuya:

```
fail: TaskTracker.Api.Errors.GlobalExceptionHandler[0]
      Unhandled exception on GET /api/boom
      System.InvalidOperationException: Boom! Connection to 'tasks-db-01' failed for user 'admin'.
```

La de `ExceptionHandlerMiddleware` ya no aparece. Y los dos `400` no dejan ninguna entrada `fail`: son errores del cliente, no del servidor.
:::

## Development frente a Production

El `detail` del `500` te enseña el mensaje mientras desarrollas. Ahora comprueba que **no** sale de tu máquina. Para eso tienes que ejecutar la API en el entorno `Production`, y hay una trampa.

:::concept El perfil de lanzamiento manda
`Properties/launchSettings.json` define el perfil **http**, y ese perfil fija `"ASPNETCORE_ENVIRONMENT": "Development"`. Cuando ejecutas con un perfil, su valor **sustituye** al de la variable de entorno que hayas puesto en la consola. Por eso, si haces `$env:ASPNETCORE_ENVIRONMENT = "Production"` y después `dotnet run`, la consola dirá igualmente `Hosting environment: Development`: `dotnet run` usa el primer perfil del archivo (verás `Using launch settings from ...launchSettings.json...` al arrancar).

La solución es **`dotnet run --no-launch-profile`**: no se lee `launchSettings.json` y mandan las variables de entorno. Como tampoco se lee el puerto del perfil, lo indicas con `ASPNETCORE_URLS`.
:::

:::vs Ejecutar la API en Production
1. **Detén la API** en Visual Studio. Si sigue en marcha, el puerto `5283` estará ocupado.
2. Abre la terminal integrada: **View** > **Terminal**. Es una *Developer PowerShell*.
3. Muévete a la carpeta del proyecto (la que contiene `TaskTracker.Api.csproj`) con `cd`. Es importante: la cadena de conexión `Data Source=tasktracker.db` es **relativa a la carpeta desde la que arrancas**.
4. Ejecuta:

```powershell
$env:ASPNETCORE_ENVIRONMENT = "Production"
$env:ASPNETCORE_URLS = "http://localhost:5283"
dotnet run --no-launch-profile
```

5. En la salida debe aparecer `Hosting environment: Production` y `Now listening on: http://localhost:5283`.
:::

Lanza ahora las mismas peticiones desde `errors.http` o desde el navegador:

| Petición | En Production |
| --- | --- |
| `GET /api/boom` | `500`, mismo `title`, `code`, `instance` y `traceId`, pero **sin `detail`**. |
| `GET /api/projects/1/tasks?status=Unknown` | `400` con `"title": "Bad Request"` (con **R** mayúscula) y sin `detail`. |
| `POST /api/projects` con el JSON roto | `400`, `"title": "Bad Request"`, sin `detail`. |
| `GET /scalar` y `GET /openapi/v1.json` | `404`: solo se mapean en `Development`. |

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.6.1",
  "title": "An unexpected error occurred",
  "status": 500,
  "instance": "GET /api/boom",
  "code": "server.unexpected_error",
  "traceId": "00-a14bd4fb669cab0fe85ad02e9e7b5bbe-3d0b5572e0e896d0-00"
}
```

Fíjate en tres cosas:

- **El mensaje ya no sale, pero sigue en tu log.** La consola muestra el mismo `fail: TaskTracker.Api.Errors.GlobalExceptionHandler[0]` con la excepción completa. El cliente recibe un `traceId`; tú tienes los detalles. Es el reparto correcto.
- **Los `400` son distintos, y no es un error.** En `Production`, `ThrowOnBadRequest` está desactivado: Minimal APIs responde `400` **sin lanzar ninguna excepción**, así que tu manejador ni se entera. Ese `"Bad Request"` lo escribe `UseStatusCodePages` con el título estándar. Es razonable: el detalle de un fallo de *binding* ayuda a quien desarrolla, y fuera de tu máquina basta con saber que la petición estaba mal.
- **La base de datos es la misma.** En `Production` no se ejecuta el `MigrateAsync` del bloque de desarrollo, ni se siembran datos. La API usa el `tasktracker.db` que ya tenías, porque arrancaste desde la carpeta del proyecto.

Cuando termines, detén la API con <kbd>Ctrl</kbd> + <kbd>C</kbd> y borra las dos variables para que no afecten a lo siguiente que ejecutes en esa terminal (o simplemente ciérrala):

```powershell
Remove-Item Env:ASPNETCORE_ENVIRONMENT, Env:ASPNETCORE_URLS
```

:::tip ¿Y sin salir de Visual Studio?
También puedes crear un segundo perfil de lanzamiento con `ASPNETCORE_ENVIRONMENT` en `Production` (desde las propiedades de depuración del proyecto o editando `launchSettings.json`) y elegirlo en el desplegable de ejecución. Funciona igual, pero modifica un archivo del proyecto. Si lo haces, bórralo al terminar el paso para que tu proyecto siga coincidiendo con la solución de referencia.
:::

## Borra el endpoint temporal

El experimento ha cumplido su función. En `Program.cs`, **borra las dos líneas** que añadiste tras `app.MapTagEndpoints();` (el comentario `// TEMPORARY...` y el `app.MapGet("/api/boom", ...)`). La sección de endpoints vuelve a ser:

```csharp title="Program.cs (sección Endpoints)"
// --- Endpoints ---
app.MapProjectEndpoints();
app.MapTaskEndpoints();
app.MapTagEndpoints();

app.Run();
```

:::checkpoint Sin endpoint temporal
Compila (0 advertencias, 0 errores), ejecuta con el perfil **http** y comprueba que `GET /api/boom` devuelve `404` con `"instance": "GET /api/boom"`. Las peticiones de `errors.http` siguen respondiendo como en el checkpoint anterior.
:::

:::troubleshooting Errores comunes
- **La consola dice `Hosting environment: Development` aunque pusiste `Production`:** ejecutaste `dotnet run` sin `--no-launch-profile`, o con <kbd>F5</kbd> desde Visual Studio. El perfil **http** sustituye la variable de entorno.
- **`Failed to bind to address http://127.0.0.1:5283: address already in use`:** la API sigue en marcha desde Visual Studio (o desde otra terminal). Detenla y repite.
- **La API en Production escucha en `http://localhost:5000`:** falta `$env:ASPNETCORE_URLS`. Sin perfil de lanzamiento, ese es el puerto por defecto.
- **`SQLite Error 1: 'no such table: Projects'` en Production:** arrancaste desde otra carpeta y SQLite creó allí un `tasktracker.db` vacío; en `Production` nadie aplica las migraciones. Detén la API, borra ese archivo nuevo y arranca desde la carpeta del proyecto.
- **Tu manejador no se ejecuta (el `500` sigue diciendo `An error occurred while processing your request.`):** falta `builder.Services.AddExceptionHandler<GlobalExceptionHandler>();`, o la API no se reinició.
- **`InvalidOperationException: An error occurred when configuring the exception handler middleware`** al arrancar: `UseExceptionHandler()` sin argumentos necesita `AddProblemDetails()` registrado. Comprueba que no lo borraste al editar la sección de servicios.
- **El `500` no aparece en la consola:** falta el `logger.LogError(...)`. En .NET 10, si el manejador devuelve `true`, nadie más lo registra.
- **El `500` tiene `detail` en Production:** comprobaste `IsProduction()` al revés, o escribiste `exception.Message` sin la condición.
:::

:::recap
- Un **`IExceptionHandler`** decide si resuelve una excepción (`true`) o la pasa al siguiente (`false`). Se registran con `AddExceptionHandler<T>()`, se ejecutan **en orden de registro** y son **singleton**.
- `app.UseExceptionHandler()` sin opciones recorre esa cadena; si nadie resuelve, aplica el `ProblemDetails` por defecto.
- **`IProblemDetailsService.TryWriteAsync`** escribe el error por el mismo camino que el resto (con `instance` y `traceId`). Asigna antes `Response.StatusCode`.
- `BadHttpRequestException` es culpa del cliente (`400`); cualquier otra excepción es un `500` con `code: server.unexpected_error`.
- Desde **.NET 10**, el middleware no registra las excepciones que un manejador resuelve: registra tú los `500`.
- El **`detail`** de un `500` solo en `Development`: el cliente recibe un `traceId`, el log se queda los detalles.
- El perfil `http` fuerza `Development`; para probar `Production`, `dotnet run --no-launch-profile` con `ASPNETCORE_ENVIRONMENT` y `ASPNETCORE_URLS`. En `Production`, Minimal APIs responde los `400` de *binding* sin lanzar excepciones, y no se migra ni se siembra la base de datos.

En el siguiente paso añadirás un segundo manejador, **delante** de este, que convierte los errores de la base de datos que el cliente sí puede resolver en un `409`.
:::
