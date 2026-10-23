## Objetivo del paso

En el tutorial 2 dejaste una advertencia pendiente: si dos clientes crean la etiqueta `backend` exactamente a la vez, los dos pasan la comprobación previa y el segundo `INSERT` choca con el índice único. Resultado: un `500`. Ahora tienes la herramienta para resolverlo: un manejador de excepciones que se coloca **delante** del global y traduce los errores de la base de datos que el cliente sí puede resolver. Vas a:

1. Reproducir la carrera **desactivando temporalmente** la comprobación previa, y ver el `500` que produce.
2. Entender cómo llega un error de SQLite hasta tu código: **`DbUpdateException`** y **`SqliteException`**, con sus códigos de error extendidos.
3. Escribir un **`DatabaseExceptionHandler`** que convierte la violación de un índice único (`2067`) y de una clave foránea (`787`) en un `409`.
4. Registrarlo **antes** del manejador global y entender por qué el orden importa.
5. Restaurar las comprobaciones previas y entender por qué siguen siendo necesarias.

## Reproducir la carrera

Una carrera de milisegundos es difícil de provocar a mano. Pero no hace falta: lo que quieres ver es **qué pasa cuando la base de datos es la única defensa**. Para eso basta con quitar, por un momento, la comprobación previa.

:::vs Desactivar temporalmente las comprobaciones previas
1. Abre `Endpoints/TagEndpoints.cs`. En el método `Create`, selecciona las cuatro líneas del `if (await db.Tags.AnyAsync(...))` (el `if`, las dos llaves y el `return` de dentro) y coméntalas con <kbd>Ctrl</kbd> + <kbd>K</kbd>, <kbd>Ctrl</kbd> + <kbd>C</kbd>.
2. Abre `Endpoints/TaskEndpoints.cs`. En el método `Create` (el que crea tareas), comenta de la misma forma las cuatro líneas del `if (!await db.Projects.AnyAsync(...))`.
:::

Así quedan los dos fragmentos:

```csharp title="Endpoints/TagEndpoints.cs (método Create, comprobación comentada)"
var name = request.Name.ToLowerInvariant();

// if (await db.Tags.AnyAsync(t => t.Name == name, cancellationToken))
// {
//     return ApiProblems.TagAlreadyExists(name);
// }

var tag = new Tag { Name = name };
```

```csharp title="Endpoints/TaskEndpoints.cs (método Create, comprobación comentada)"
// if (!await db.Projects.AnyAsync(p => p.Id == projectId, cancellationToken))
// {
//     return TypedResults.NotFound();
// }

var task = new TaskItem
```

El proyecto sigue compilando sin advertencias: los dos métodos devuelven tipos que su `Results<...>` ya admite, aunque ahora nunca usen algunos.

:::warning Es un experimento
Estas dos comprobaciones vuelven a su sitio al final del paso. No sigas adelante sin restaurarlas: la solución de referencia las tiene.
:::

Ejecuta la API y lanza dos peticiones:

| Petición | Qué choca en la base de datos |
| --- | --- |
| `POST /api/tags` con `{ "name": "backend" }` | El índice único de `Tags.Name`: `backend` ya existe en los datos sembrados. |
| `POST /api/projects/999/tasks` con `{ "title": "Orphan task" }` | La clave foránea de `Tasks.ProjectId`: no existe el proyecto `999`. |

Las dos responden igual, gracias a tu manejador global:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.6.1",
  "title": "An unexpected error occurred",
  "status": 500,
  "detail": "An error occurred while saving the entity changes. See the inner exception for details.",
  "instance": "POST /api/tags",
  "code": "server.unexpected_error",
  "traceId": "00-f3299b44c22697b1761bc06cab9f3f6b-f2f76d369fc8cddb-00"
}
```

Es un `500` seguro, pero injusto: el servidor no ha fallado. El cliente ha pedido algo que **choca con los datos existentes**, y eso es un `409`. La información para distinguirlo está en la consola.

## Cómo llega un error de SQLite a tu código

Mira la consola tras el primer `POST`:

```
fail: Microsoft.EntityFrameworkCore.Update[10000]
      An exception occurred in the database while saving changes for context type 'TaskTracker.Api.Data.TaskTrackerDbContext'.
      Microsoft.EntityFrameworkCore.DbUpdateException: An error occurred while saving the entity changes. See the inner exception for details.
       ---> Microsoft.Data.Sqlite.SqliteException (0x80004005): SQLite Error 19: 'UNIQUE constraint failed: Tags.Name'.
```

Y tras el segundo, la misma estructura con `SQLite Error 19: 'FOREIGN KEY constraint failed'`.

:::concept Dos excepciones, una dentro de otra
- **`DbUpdateException`** es la excepción de **EF Core**: "algo falló al ejecutar `SaveChanges`". Es la misma para cualquier proveedor (SQLite, SQL Server, PostgreSQL), así que por sí sola no dice qué pasó.
- Su **`InnerException`** es la excepción del **proveedor**: aquí, **`SqliteException`**, de `Microsoft.Data.Sqlite`. Esa sí sabe exactamente qué regla de la base de datos se incumplió.

Con SQL Server o PostgreSQL, la excepción interna sería otra (`SqlException`, `PostgresException`) con sus propios códigos. La idea es la misma; los números cambian.
:::

:::concept Código primario y código extendido
Fíjate en que los dos errores dicen **`SQLite Error 19`**: es `SQLITE_CONSTRAINT`, el código **primario** de "se incumplió una restricción". No basta para distinguirlos.

SQLite también tiene códigos **extendidos**, más precisos, que `SqliteException` expone en la propiedad **`SqliteExtendedErrorCode`**:

| Código extendido | Nombre en SQLite | Significa |
| --- | --- | --- |
| `2067` | `SQLITE_CONSTRAINT_UNIQUE` | Un índice único rechazó un valor repetido. |
| `787` | `SQLITE_CONSTRAINT_FOREIGNKEY` | Una clave foránea apunta a una fila que no existe. |

La lista completa está en la documentación de SQLite (*Result and Error Codes*, `sqlite.org/rescode.html`). Comparar códigos es mucho más fiable que buscar texto como `"UNIQUE constraint failed"` en el mensaje, que podría cambiar entre versiones.
:::

## El manejador de errores de base de datos

:::vs Crear Errors/DatabaseExceptionHandler.cs
Clic derecho sobre la carpeta `Errors` > **Add** > **Class…** > **`DatabaseExceptionHandler.cs`**, y reemplaza todo su contenido por el siguiente.
:::

```csharp title="Errors/DatabaseExceptionHandler.cs"
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace TaskTracker.Api.Errors;

// Translates database errors that the client can act on into 409 Conflict.
public sealed class DatabaseExceptionHandler(
    IProblemDetailsService problemDetailsService,
    ILogger<DatabaseExceptionHandler> logger) : IExceptionHandler
{
    // SQLite extended result codes: https://www.sqlite.org/rescode.html
    private const int SqliteConstraintForeignKey = 787;
    private const int SqliteConstraintUnique = 2067;

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var problem = exception switch
        {
            DbUpdateException { InnerException: SqliteException { SqliteExtendedErrorCode: SqliteConstraintUnique } } =>
                Conflict(
                    "database.duplicate_value",
                    "Duplicate value",
                    "A record with the same unique value already exists."),

            DbUpdateException { InnerException: SqliteException { SqliteExtendedErrorCode: SqliteConstraintForeignKey } } =>
                Conflict(
                    "database.related_data_missing",
                    "Related data is missing",
                    "The record references data that does not exist or no longer exists."),

            _ => null,
        };

        if (problem is null)
        {
            return false; // Not ours: the next handler gets a chance.
        }

        logger.LogWarning(exception, "Database conflict on {Method} {Path}: {Code}",
            httpContext.Request.Method, httpContext.Request.Path, problem.Extensions["code"]);

        httpContext.Response.StatusCode = StatusCodes.Status409Conflict;

        return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problem,
            Exception = exception,
        });
    }

    private static ProblemDetails Conflict(string code, string title, string detail) =>
        new()
        {
            Status = StatusCodes.Status409Conflict,
            Title = title,
            Detail = detail,
            Extensions = { ["code"] = code },
        };
}
```

Lo importante:

- **Un `switch` con patrones de propiedades.** `DbUpdateException { InnerException: SqliteException { SqliteExtendedErrorCode: SqliteConstraintUnique } }` se lee como "una `DbUpdateException` cuya `InnerException` es una `SqliteException` cuyo `SqliteExtendedErrorCode` vale `2067`". Comprueba el tipo y los valores de una vez, sin conversiones ni `if` anidados.
- **Constantes con nombre** en lugar de `2067` y `787` sueltos, y el enlace a la documentación al lado.
- **`_ => null`** y **`return false`**: si la excepción no es de las suyas (otra `DbUpdateException`, un `NullReferenceException`...), el manejador no hace nada y la cadena sigue. Ese `false` es lo que permite que el `GlobalExceptionHandler` siga recogiendo todo lo demás.
- **Los mensajes no repiten el de SQLite.** `Tags.Name` es un detalle interno del esquema. El `detail` explica el problema en términos de la API, sin nombres de tablas.
- **`LogWarning` y no `LogError`.** No es un fallo del servidor, pero sí algo que conviene ver: si aparece a menudo, tus comprobaciones previas tienen un hueco. Como en el manejador global, en .NET 10 nadie más lo registraría por ti.
- **`Extensions = { ["code"] = code }`** es un inicializador de colección sobre la propiedad `Extensions`, que ya existe: añade la entrada sin reemplazar el diccionario.

## El orden de la cadena

Registra el nuevo manejador en `Program.cs`, **antes** del global:

```csharp title="Program.cs (sección Services, los dos manejadores)"
// Called in registration order until one returns true.
builder.Services.AddExceptionHandler<DatabaseExceptionHandler>();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
```

:::why ¿Por qué importa el orden?
El `GlobalExceptionHandler` **siempre** devuelve `true`: es su trabajo, recoger todo. Si lo registraras primero, convertiría cualquier `DbUpdateException` en un `500` y el `DatabaseExceptionHandler` nunca llegaría a ejecutarse. La regla general: **de lo más específico a lo más genérico**, como los `catch` de un `try`. El manejador que lo acepta todo va siempre el último.
:::

:::checkpoint Errores de base de datos traducidos
Compila y reinicia la API (las comprobaciones previas siguen comentadas). Repite las dos peticiones:

| Petición | Resultado esperado |
| --- | --- |
| `POST /api/tags` con `{ "name": "backend" }` | `409`, `"code": "database.duplicate_value"` |
| `POST /api/projects/999/tasks` con `{ "title": "Orphan task" }` | `409`, `"code": "database.related_data_missing"` |
| `POST /api/tags` con `{ "name": "docs" }` | `201`: los datos válidos no pasan por ningún manejador. |

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Duplicate value",
  "status": 409,
  "detail": "A record with the same unique value already exists.",
  "instance": "POST /api/tags",
  "code": "database.duplicate_value",
  "traceId": "00-3c63207d99887a313c536fffba58eab1-7d22b873f138e7cd-00"
}
```

En la consola verás, por cada petición, tu aviso (`warn: TaskTracker.Api.Errors.DatabaseExceptionHandler[0] Database conflict on POST /api/tags: database.duplicate_value`) y, **antes**, dos entradas `fail` de EF Core: `Microsoft.EntityFrameworkCore.Database.Command[20102]` (el comando que falló) y `Microsoft.EntityFrameworkCore.Update[10000]` (la excepción al guardar). EF Core las escribe en el momento en que falla `SaveChanges`, mucho antes de que tu manejador intervenga, así que siguen apareciendo aunque el cliente reciba un `409` correcto. No es un error tuyo: el registro de EF Core y la respuesta HTTP son cosas independientes.
:::

## Restaura las comprobaciones previas

:::vs Quitar los comentarios
En `TagEndpoints.cs` y en `TaskEndpoints.cs`, selecciona las cuatro líneas comentadas y quita los comentarios con <kbd>Ctrl</kbd> + <kbd>K</kbd>, <kbd>Ctrl</kbd> + <kbd>U</kbd>. Los dos métodos `Create` vuelven a ser exactamente como estaban.
:::

Repite las dos peticiones: ahora responden **`409` con `"code": "tag.already_exists"`** y **`404`**, como antes del experimento. Los manejadores no intervienen, porque ya no hay excepción.

:::concept Por qué la comprobación previa sigue siendo necesaria
Si el manejador ya convierte el choque en un `409`, ¿para qué la comprobación? Compara las respuestas:

| | Con la comprobación previa | Solo con el manejador |
| --- | --- | --- |
| Etiqueta repetida | `409`, `tag.already_exists`: *"A tag named 'backend' already exists."* | `409`, `database.duplicate_value`: *"A record with the same unique value already exists."* |
| Proyecto inexistente | **`404`**: el proyecto no existe | `409`, `database.related_data_missing` |
| Coste | Una consulta ligera antes de escribir | Un `INSERT` fallido, una excepción y dos `fail` en el log |

La comprobación da **el mensaje exacto y el código de estado correcto**: crear una tarea en un proyecto que no existe es un `404`, no un conflicto. El manejador no puede saberlo, porque solo ve "una clave foránea falló", sin saber cuál ni por qué.

Por eso son **dos capas**: la comprobación previa resuelve el caso normal con la mejor respuesta posible, y el manejador es la **red de seguridad** para el caso raro (la carrera de milisegundos o un hueco que se te escapó) que, en lugar de un `500`, da un `409` razonable. Es la idea de "validación de entrada frente a restricciones de la base de datos" del tutorial 2, aplicada a los errores.
:::

:::checkpoint Todo en su sitio
Con las comprobaciones restauradas y la API reiniciada:

| Petición | Resultado esperado |
| --- | --- |
| `POST /api/tags` con `{ "name": "backend" }` | `409`, `"code": "tag.already_exists"` |
| `POST /api/projects/999/tasks` con `{ "title": "Orphan task" }` | `404` |
| `GET /api/projects/1/tasks?status=Unknown` | `400`, `"title": "Bad request"`: el manejador de base de datos devolvió `false` y el global lo resolvió. |

Y la consola ya no muestra ningún `fail` para estas peticiones.
:::

:::troubleshooting Errores comunes
- **Los errores de base de datos siguen dando `500`:** el `DatabaseExceptionHandler` está registrado **después** del `GlobalExceptionHandler`, o no está registrado. El orden de las líneas `AddExceptionHandler` importa.
- **`CS0246: The type or namespace name 'SqliteException' could not be found`:** falta `using Microsoft.Data.Sqlite;`. El paquete ya está instalado: llega con `Microsoft.EntityFrameworkCore.Sqlite`.
- **`CS9135: A constant value of type 'int' is expected`:** en un patrón solo se pueden usar constantes. Declara los códigos con `const`, no con `static readonly`.
- **Todo error de base de datos acaba en `409`, también los que no deberían:** el `switch` tiene un caso demasiado general (por ejemplo, `DbUpdateException => ...` sin condiciones). Cada caso debe comprobar el código extendido.
- **El `409` llega sin `instance`:** creaste el JSON a mano en lugar de usar `problemDetailsService.TryWriteAsync`, que es lo que aplica `CustomizeProblemDetails`.
- **La etiqueta repetida devuelve `database.duplicate_value` al final del paso:** la comprobación de `TagEndpoints.Create` sigue comentada.
:::

:::recap
- EF Core envuelve los errores del proveedor: **`DbUpdateException`** por fuera, **`SqliteException`** dentro (`InnerException`).
- Distingue errores por el **código extendido** (`SqliteExtendedErrorCode`): `2067` es un índice único y `787` una clave foránea. Ambos comparten el primario `19`.
- Los **patrones de propiedades** en un `switch` comprueban tipo y valores de la excepción en una sola expresión.
- Un manejador devuelve **`false`** para lo que no es suyo, y la cadena sigue. Por eso los manejadores se registran **de lo específico a lo genérico**.
- EF Core registra `fail` al fallar `SaveChanges` aunque después tu manejador traduzca el error.
- La **comprobación previa** da el mejor mensaje y el código correcto (`404` frente a `409`); el **manejador** es la red de seguridad para lo que se escapa.

En el siguiente paso resolverás un conflicto que ninguna restricción de la base de datos puede detectar: dos personas editando la misma tarea a la vez.
:::
