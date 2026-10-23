## Objetivo del paso

Ya tienes la tabla de tareas; ahora toca exponerla en la API. Este paso tiene dos protagonistas: el **diseño de rutas** para un recurso que vive dentro de otro, y las **consultas dinámicas**, con filtros y ordenación que el cliente elige en la URL. Vas a:

1. Diseñar las rutas de tareas: anidadas bajo el proyecto para la colección y planas para cada tarea.
2. Crear los contratos y el mapeo de tareas.
3. Hacer que los enums viajen como **texto** en JSON.
4. Leer filtros de la query string con **`[AsParameters]`**.
5. Entender la **ejecución diferida** construyendo una consulta paso a paso, con ordenación que deja los nulos al final.
6. Descubrir por qué un enum inválido devuelve `500` en desarrollo, y corregirlo.
7. Implementar tú `PUT`, `PATCH /status` y `DELETE` de tareas.

## Rutas para un recurso que vive dentro de otro

Una tarea siempre pertenece a un proyecto. ¿Cómo lo reflejas en las URL?

:::concept Recursos anidados, pero no demasiado
Hay dos tipos de operación, y cada uno tiene su ruta natural:

| Operación | Ruta | Por qué |
| --- | --- | --- |
| Listar las tareas **de un proyecto** | `GET /api/projects/{projectId}/tasks` | La colección solo tiene sentido dentro de un proyecto. |
| Crear una tarea **en un proyecto** | `POST /api/projects/{projectId}/tasks` | El proyecto forma parte de la identidad de la nueva tarea. |
| Leer, modificar o borrar **una tarea** | `GET`/`PUT`/`DELETE /api/tasks/{id}` | El `id` de una tarea ya es único en toda la base de datos. |
| Cambiar el estado de una tarea | `PATCH /api/tasks/{id}/status` | Una modificación parcial y concreta. |

A este estilo se le llama **anidamiento superficial** (*shallow nesting*): anidas solo donde aporta información. La alternativa, `/api/projects/{projectId}/tasks/{id}` para todo, obliga al cliente a conocer siempre el proyecto y a ti a comprobar que la tarea pertenece a **ese** proyecto (¿qué responderías a `/api/projects/1/tasks/42` si la tarea 42 es del proyecto 2?). Con rutas planas, ese caso simplemente no existe.
:::

En código, eso se traduce en **dos grupos de rutas** dentro de la misma clase `TaskEndpoints`: uno con el prefijo `/api/projects/{projectId:int}/tasks` y otro con `/api/tasks`. Los dos con la etiqueta `Tasks` para la documentación.

## Los contratos de las tareas

:::vs Crear Contracts/TaskContracts.cs
Clic derecho sobre la carpeta `Contracts` > **Add** > **Class…** > **`TaskContracts.cs`**, y reemplaza todo su contenido por el siguiente.
:::

```csharp title="Contracts/TaskContracts.cs"
using TaskTracker.Api.Entities;

namespace TaskTracker.Api.Contracts;

public record CreateTaskRequest(
    string Title,
    string? Description = null,
    TaskPriority Priority = TaskPriority.Medium,
    DateOnly? DueDate = null);

public record UpdateTaskRequest(
    string Title,
    string? Description,
    TaskPriority Priority,
    DateOnly? DueDate);

public record ChangeTaskStatusRequest(TaskItemStatus Status);

public enum TaskSortField
{
    CreatedAt,
    DueDate,
    Priority,
}

// Bound from the query string with [AsParameters]: ?status=Done&priority=High&sortBy=DueDate
public record TaskListQuery(
    TaskItemStatus? Status,
    TaskPriority? Priority,
    TaskSortField? SortBy);

public record TaskResponse(
    int Id,
    int ProjectId,
    string Title,
    string? Description,
    TaskItemStatus Status,
    TaskPriority Priority,
    DateOnly? DueDate,
    DateTime CreatedAt,
    DateTime? CompletedAt);
```

| Tipo | Para qué |
| --- | --- |
| `CreateTaskRequest` | Cuerpo del `POST`. Solo `Title` es obligatorio: los demás tienen valor por defecto, así que el cliente puede omitirlos. **No incluye el estado**: una tarea nueva siempre empieza en `Todo`. |
| `UpdateTaskRequest` | Cuerpo del `PUT`: reemplaza los datos editables. Tampoco incluye el estado. |
| `ChangeTaskStatusRequest` | Cuerpo del `PATCH /status`. El estado tiene su propia operación porque lleva una **regla de negocio** (la fecha de finalización), como verás en el reto. |
| `TaskSortField` | Los criterios de ordenación que aceptamos. Un enum en lugar de un `string` libre: el cliente solo puede pedir valores que existen. |
| `TaskListQuery` | Los filtros opcionales del listado, que vendrán de la query string. Todos anulables: `null` significa "no filtres por esto". |
| `TaskResponse` | Lo que devuelve la API. Incluye `ProjectId` para que el cliente sepa a qué proyecto pertenece una tarea obtenida por `/api/tasks/{id}`. |

Todavía no hay validación (un título vacío se aceptaría). Llega en el paso 12. Y en el paso 11, `TaskResponse` incluirá también las etiquetas de la tarea.

## El mapeo, con el mismo patrón

`TaskMappings` sigue el patrón que estrenaste en el paso 8: un árbol de expresión para las consultas y su versión compilada para los objetos en memoria.

:::vs Crear Mappings/TaskMappings.cs
Clic derecho sobre `Mappings` > **Add** > **Class…** > **`TaskMappings.cs`**, y reemplaza todo su contenido por el siguiente.
:::

```csharp title="Mappings/TaskMappings.cs"
using System.Linq.Expressions;
using TaskTracker.Api.Contracts;
using TaskTracker.Api.Entities;

namespace TaskTracker.Api.Mappings;

public static class TaskMappings
{
    public static readonly Expression<Func<TaskItem, TaskResponse>> ToResponseExpression =
        task => new TaskResponse(
            task.Id,
            task.ProjectId,
            task.Title,
            task.Description,
            task.Status,
            task.Priority,
            task.DueDate,
            task.CreatedAt,
            task.CompletedAt);

    private static readonly Func<TaskItem, TaskResponse> ToResponseFunc = ToResponseExpression.Compile();

    public static TaskResponse ToResponse(this TaskItem task) => ToResponseFunc(task);
}
```

## Leer filtros de la query string: [AsParameters]

El listado aceptará tres parámetros opcionales: `?status=Todo&priority=High&sortBy=DueDate`. Podrías declararlos como tres parámetros sueltos del handler, pero cuando crecen (en el paso 11 llegará un cuarto) la firma se vuelve ilegible.

:::concept [AsParameters]
`[AsParameters]` le dice a Minimal APIs: "no busques este objeto en el cuerpo; **trata cada propiedad como si fuera un parámetro del handler**". Cada propiedad de `TaskListQuery` se enlaza con las mismas reglas que un parámetro normal: como son tipos simples y no aparecen en la ruta, salen de la **query string**, con el nombre de la propiedad (`Status` ↔ `status`; los nombres de los parámetros no distinguen mayúsculas).

Como todas las propiedades son anulables, son opcionales: si el cliente no envía `status`, `query.Status` vale `null`.
:::

:::warning Los valores de un enum en la query sí distinguen mayúsculas
El **nombre** del parámetro da igual (`status`, `Status`), pero su **valor** no: para convertir `"Todo"` en `TaskItemStatus.Todo`, Minimal APIs usa `Enum.TryParse`, que distingue mayúsculas y minúsculas. `?sortBy=DueDate` funciona; `?sortBy=duedate` es una petición incorrecta. Lo verás en acción un poco más abajo.
:::

## Ejecución diferida: construir la consulta por partes

Aquí está el corazón del paso. El cliente puede enviar cualquier combinación de filtros, o ninguno. ¿Cómo escribes **una** consulta que sirva para todas?

:::concept Ejecución diferida (deferred execution)
Un `IQueryable<T>` no contiene datos: contiene **una consulta sin ejecutar**. Cada `Where` u `OrderBy` devuelve un `IQueryable` nuevo con una condición más, pero **no toca la base de datos**. La consulta se traduce a SQL y se ejecuta solo cuando pides los resultados: `ToListAsync`, `SingleOrDefaultAsync`, `AnyAsync`, `CountAsync`, `foreach`...

Eso te permite **componer** la consulta con código normal de C#, con `if` y `switch`, y enviar al final una sola sentencia SQL con exactamente las condiciones que tocan.
:::

```csharp
var tasks = db.Tasks.Where(t => t.ProjectId == projectId);   // nothing runs

if (query.Status is { } status)
{
    tasks = tasks.Where(t => t.Status == status);           // still nothing
}

var result = await tasks.ToListAsync();                      // ONE SQL query, now
```

Si el cliente envía `?status=Done`, el SQL lleva `WHERE "t"."ProjectId" = @projectId AND "t"."Status" = @status`. Si no lo envía, solo la primera condición. El patrón `query.Status is { } status` comprueba que el valor no es `null` y, a la vez, lo guarda en una variable `status` del tipo no anulable (`TaskItemStatus`), lista para usar.

:::warning Cuidado con materializar demasiado pronto
Si escribieras `var tasks = await db.Tasks.ToListAsync();` y filtraras después, traerías **todas** las tareas de la base de datos a memoria y filtrarías en C#. Funciona con diez filas y se vuelve lentísimo con un millón. Regla práctica: **filtra, ordena y proyecta sobre el `IQueryable`, y materializa al final**.
:::

### Ordenar, con los nulos al final

Para la ordenación usamos una expresión `switch` sobre `query.SortBy`:

| `sortBy` | Orden | Detalle |
| --- | --- | --- |
| (sin valor) o `CreatedAt` | Las más antiguas primero. | El orden por defecto. |
| `DueDate` | Fecha límite más próxima primero; **las que no tienen fecha, al final**. | SQLite pone los `NULL` **al principio** en un orden ascendente, que no es lo que quiere un usuario. |
| `Priority` | `High` primero. | Funciona porque la prioridad se guarda como número (paso 9). |

El truco para los nulos: `OrderBy(t => t.DueDate == null)` ordena primero por un booleano. `false` (tiene fecha) va antes que `true` (no tiene), y después `ThenBy(t => t.DueDate)` ordena por la fecha. EF Core lo traduce a:

```sql
ORDER BY "t"."DueDate" IS NULL, "t"."DueDate"
```

:::tip ¿Por qué ThenBy(t => t.Id)?
Si dos tareas tienen la misma prioridad (o la misma fecha de creación), la base de datos puede devolverlas en cualquier orden, y ese orden puede cambiar entre llamadas. Añadir un último criterio único (`Id`) hace el resultado **determinista**: la misma petición devuelve siempre el mismo orden. Será imprescindible cuando pagines resultados (tutorial 7).
:::

## TaskEndpoints

Con todo lo anterior, ya puedes leer el archivo completo. Tiene los dos grupos de rutas y tres handlers: listar (con filtros), obtener una y crear. Los otros tres serán tus retos.

:::vs Crear Endpoints/TaskEndpoints.cs
Clic derecho sobre `Endpoints` > **Add** > **Class…** > **`TaskEndpoints.cs`**, y reemplaza todo su contenido por el siguiente.
:::

```csharp title="Endpoints/TaskEndpoints.cs"
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using TaskTracker.Api.Contracts;
using TaskTracker.Api.Data;
using TaskTracker.Api.Entities;
using TaskTracker.Api.Mappings;

namespace TaskTracker.Api.Endpoints;

public static class TaskEndpoints
{
    private const string GetTaskByIdRoute = "GetTaskById";

    public static IEndpointRouteBuilder MapTaskEndpoints(this IEndpointRouteBuilder app)
    {
        var projectTasks = app.MapGroup("/api/projects/{projectId:int}/tasks").WithTags("Tasks");

        projectTasks.MapGet("/", GetByProject);
        projectTasks.MapPost("/", Create);

        var tasks = app.MapGroup("/api/tasks").WithTags("Tasks");

        tasks.MapGet("/{id:int}", GetById).WithName(GetTaskByIdRoute);

        return app;
    }

    private static async Task<Results<Ok<List<TaskResponse>>, NotFound>> GetByProject(
        int projectId,
        [AsParameters] TaskListQuery query,
        TaskTrackerDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await db.Projects.AnyAsync(p => p.Id == projectId, cancellationToken))
        {
            return TypedResults.NotFound();
        }

        // Nothing runs yet: we are only composing the query.
        var tasks = db.Tasks.AsNoTracking().Where(t => t.ProjectId == projectId);

        if (query.Status is { } status)
        {
            tasks = tasks.Where(t => t.Status == status);
        }

        if (query.Priority is { } priority)
        {
            tasks = tasks.Where(t => t.Priority == priority);
        }

        tasks = query.SortBy switch
        {
            // Tasks without a due date go last.
            TaskSortField.DueDate => tasks.OrderBy(t => t.DueDate == null).ThenBy(t => t.DueDate),
            TaskSortField.Priority => tasks.OrderByDescending(t => t.Priority).ThenBy(t => t.Id),
            _ => tasks.OrderBy(t => t.CreatedAt).ThenBy(t => t.Id),
        };

        // ToListAsync is the moment the SQL is sent to the database.
        var result = await tasks
            .Select(TaskMappings.ToResponseExpression)
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(result);
    }

    private static async Task<Results<Ok<TaskResponse>, NotFound>> GetById(
        int id, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var task = await db.Tasks
            .AsNoTracking()
            .Where(t => t.Id == id)
            .Select(TaskMappings.ToResponseExpression)
            .SingleOrDefaultAsync(cancellationToken);

        return task is null ? TypedResults.NotFound() : TypedResults.Ok(task);
    }

    private static async Task<Results<CreatedAtRoute<TaskResponse>, NotFound>> Create(
        int projectId, CreateTaskRequest request, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        if (!await db.Projects.AnyAsync(p => p.Id == projectId, cancellationToken))
        {
            return TypedResults.NotFound();
        }

        var task = new TaskItem
        {
            ProjectId = projectId,
            Title = request.Title,
            Description = request.Description,
            Priority = request.Priority,
            DueDate = request.DueDate,
            CreatedAt = DateTime.UtcNow,
        };

        db.Tasks.Add(task);
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.CreatedAtRoute(task.ToResponse(), GetTaskByIdRoute, new { id = task.Id });
    }
}
```

Lo que merece la pena mirar con calma:

- **`int projectId` en `GetByProject` y `Create`.** Sale del segmento `{projectId:int}` del **grupo**. Los parámetros de ruta de un `MapGroup` llegan a todos sus handlers.
- **`AnyAsync` antes de listar.** Sin él, un proyecto inexistente devolvería `200` con una lista vacía, igual que un proyecto real sin tareas. Preguntar primero permite responder `404` cuando corresponde. Se traduce a un `SELECT EXISTS (...)` muy barato. Son dos consultas en lugar de una, a cambio de una respuesta correcta.
- **`Create` comprueba también el proyecto.** Si no lo hiciera, la clave foránea rechazaría el `INSERT` y el cliente recibiría un `500` en vez de un `404`.
- **`ProjectId = projectId`** basta para relacionar la tarea: no hace falta cargar el proyecto ni asignar la navegación `Project`.
- **`CreatedAtRoute`** apunta a `GetTaskById`, el nombre de la ruta de `GET /api/tasks/{id}`. Recuerda del paso 4 que los nombres de ruta son únicos en toda la aplicación: por eso no se llama `GetById` a secas.

## Enums como texto en JSON

Antes de registrar los endpoints, un detalle de formato. Por defecto, `System.Text.Json` serializa un enum como su **número**: una tarea nueva saldría como `"status": 0, "priority": 1`. Para un cliente eso no significa nada, y además lo ata a un orden interno de tu código.

:::concept JsonStringEnumConverter
`JsonStringEnumConverter` es un convertidor de `System.Text.Json` que escribe los enums por su **nombre** (`"Todo"`, `"High"`) y los lee también por nombre (sin distinguir mayúsculas al leer: `"high"` también vale). Con `allowIntegerValues: false`, además, **rechaza los números**: `"priority": 2` deja de ser válido. Así el contrato de tu API es uno solo: texto.

Lo registras con `ConfigureHttpJsonOptions`, que configura el JSON que leen y escriben las Minimal APIs.
:::

Abre `Program.cs` y haz dos cambios: configura el convertidor y registra los endpoints de tareas. El archivo queda así:

```csharp title="Program.cs"
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using TaskTracker.Api.Data;
using TaskTracker.Api.Endpoints;

var builder = WebApplication.CreateBuilder(args);

// --- Services ---
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();

// Enums travel as text in JSON ("High", not 2); numbers are rejected.
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(allowIntegerValues: false)));

builder.Services.AddDbContext<TaskTrackerDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("TaskTracker")));

var app = builder.Build();

// --- Development-only setup ---
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// --- Middleware pipeline ---
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseHttpsRedirection();

// --- Endpoints ---
app.MapProjectEndpoints();
app.MapTaskEndpoints();

app.Run();
```

## Pruébalo

Añade estas peticiones al final de `TaskTracker.Api.http`. Cambia el `1` por el `id` de uno de **tus** proyectos (en el paso 8 borraste y creaste algunos; mira cuáles tienes con `GET /api/projects`):

```http title="TaskTracker.Api.http (peticiones nuevas, al final)"

### --- Tasks ---

GET {{TaskTracker.Api_HostAddress}}/api/projects/1/tasks

###

GET {{TaskTracker.Api_HostAddress}}/api/projects/1/tasks?status=Todo&sortBy=DueDate

###

POST {{TaskTracker.Api_HostAddress}}/api/projects/1/tasks
Content-Type: application/json

{
  "title": "Write the release notes",
  "priority": "High",
  "dueDate": "2026-12-01"
}

###

GET {{TaskTracker.Api_HostAddress}}/api/tasks/1
```

Ejecuta la API y lanza el `POST`. La respuesta es `201` con la cabecera `Location: http://localhost:5283/api/tasks/7` (tu puerto y tu `id` serán otros) y:

```json
{
  "id": 7,
  "projectId": 3,
  "title": "Write the release notes",
  "description": null,
  "status": "Todo",
  "priority": "High",
  "dueDate": "2026-12-01",
  "createdAt": "2026-10-20T19:29:45.4165721Z",
  "completedAt": null
}
```

Crea dos o tres tareas más, con prioridades distintas y alguna sin `dueDate`, y prueba combinaciones: `?sortBy=DueDate` (las que no tienen fecha, al final), `?sortBy=Priority` (las `High` primero), `?priority=High`, `?status=Todo&sortBy=Priority`. Observa en la consola cómo cambia el `WHERE` y el `ORDER BY` del SQL en cada caso, mientras el código es siempre el mismo.

## Un enum inválido devuelve 500

Ahora prueba a equivocarte a propósito:

```http
GET {{TaskTracker.Api_HostAddress}}/api/projects/1/tasks?status=Nope
```

Esperarías un `400 Bad Request`: el cliente ha enviado un valor que no existe. Pero la respuesta es:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.6.1",
  "title": "An error occurred while processing your request.",
  "status": 500
}
```

Lo mismo ocurre si envías un cuerpo con `"priority": "Urgent"` o `"priority": 2`. Un `500` dice "el servidor ha fallado", y aquí el servidor no ha fallado: el error es del cliente. Mira la consola:

```
fail: Microsoft.AspNetCore.Diagnostics.ExceptionHandlerMiddleware[1]
      An unhandled exception has occurred while executing the request.
      Microsoft.AspNetCore.Http.BadHttpRequestException: Failed to bind parameter "Nullable<TaskItemStatus> Status" from "Nope".
```

:::concept ThrowOnBadRequest
Cuando Minimal APIs no puede enlazar un parámetro (un enum que no existe, un JSON mal formado, un número que no es número), su comportamiento depende del entorno:

| Entorno | Qué hace | Por qué |
| --- | --- | --- |
| Producción | Responde `400` directamente. | Es lo correcto para el cliente. |
| `Development` | **Lanza** una `BadHttpRequestException`. | Para que, mientras desarrollas, veas el error completo con su pila de llamadas. |

Lo controla la opción `RouteHandlerOptions.ThrowOnBadRequest`, que vale `true` en `Development`. La excepción lleva su código correcto en la propiedad `StatusCode` (`400`)... pero en el paso 4 añadiste `UseExceptionHandler()`, que **captura cualquier excepción** y, por defecto, responde `500`. Las dos piezas hacen bien su trabajo por separado; juntas, convierten un error del cliente en un error del servidor.
:::

La solución es decirle al manejador de excepciones qué código usar según la excepción. `ExceptionHandlerOptions.StatusCodeSelector` es justo eso: una función que recibe la excepción y devuelve el código de estado. Reemplaza en `Program.cs` la línea `app.UseExceptionHandler();` por el bloque siguiente:

```csharp title="Program.cs (sección Middleware pipeline)"
// --- Middleware pipeline ---
// In Development, Minimal APIs throw BadHttpRequestException for input they cannot bind
// (for example ?status=Nope). Keep its 400 instead of turning it into a 500.
app.UseExceptionHandler(new ExceptionHandlerOptions
{
    StatusCodeSelector = exception => exception is BadHttpRequestException badRequest
        ? badRequest.StatusCode
        : StatusCodes.Status500InternalServerError,
});
app.UseStatusCodePages();
app.UseHttpsRedirection();
```

Ahora una `BadHttpRequestException` conserva su `400`, y cualquier otra excepción (un fallo real) sigue siendo `500`. Reinicia y repite la petición:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "Bad Request",
  "status": 400
}
```

La consola sigue mostrando la excepción completa, que es lo que querías en desarrollo, pero el cliente recibe el código correcto.

:::tip La alternativa y su precio
Otra forma de arreglarlo es desactivar el lanzamiento en desarrollo: `builder.Services.Configure<RouteHandlerOptions>(options => options.ThrowOnBadRequest = false);`. El cliente también recibiría `400`, pero perderías el detalle del error en la consola mientras desarrollas. Preferimos conservar esa información y corregir solo el código de estado.
:::

Comprueba también el aviso sobre mayúsculas: `?sortBy=duedate` devuelve ahora `400`, mientras que `?sortBy=DueDate` funciona. En el cuerpo JSON, en cambio, `"priority": "high"` se acepta, porque ahí quien lee es `JsonStringEnumConverter`.

## Tu turno: completa las operaciones de una tarea

Tienes todo lo que necesitas: has escrito `Update` y `Delete` de proyectos en el paso 8, con `FindAsync`, seguimiento de cambios y `SaveChangesAsync`. Las tres operaciones que faltan van en el grupo `tasks` (`/api/tasks`).

::::challenge Implementa PUT /api/tasks/{id}
**Especificación:**

| | |
| --- | --- |
| Ruta | `PUT /api/tasks/{id}` (con `{id:int}`) |
| Cuerpo | `UpdateTaskRequest`: `title`, `description`, `priority`, `dueDate` |
| `204 No Content` | Tarea actualizada |
| `404 Not Found` | No existe una tarea con ese `id` |

Reemplaza los cuatro campos editables. **No cambia el estado** ni el proyecto de la tarea.

:::hint
Es el mismo esquema que `Update` en `ProjectEndpoints`: un handler `Update(int id, UpdateTaskRequest request, TaskTrackerDbContext db, CancellationToken cancellationToken)` que devuelve `Task<Results<NoContent, NotFound>>`, y una línea `tasks.MapPut(...)` en `MapTaskEndpoints`.
:::

:::hint
Obtén la tarea con `db.Tasks.FindAsync([id], cancellationToken)`. Si es `null`, `TypedResults.NotFound()`. Si no, asigna `Title`, `Description`, `Priority` y `DueDate` desde el `request` y llama a `SaveChangesAsync`. El seguimiento de cambios hará el resto.
:::

:::solution
```csharp title="Endpoints/TaskEndpoints.cs (línea nueva en MapTaskEndpoints, tras MapGet)"
tasks.MapPut("/{id:int}", Update);
```

```csharp title="Endpoints/TaskEndpoints.cs (método nuevo, al final de la clase)"
private static async Task<Results<NoContent, NotFound>> Update(
    int id, UpdateTaskRequest request, TaskTrackerDbContext db, CancellationToken cancellationToken)
{
    var task = await db.Tasks.FindAsync([id], cancellationToken);
    if (task is null)
    {
        return TypedResults.NotFound();
    }

    task.Title = request.Title;
    task.Description = request.Description;
    task.Priority = request.Priority;
    task.DueDate = request.DueDate;
    await db.SaveChangesAsync(cancellationToken);

    return TypedResults.NoContent();
}
```

Cómo funciona:

- `FindAsync` carga la tarea **con seguimiento**; al cambiar sus propiedades pasa a `Modified` y `SaveChangesAsync` genera un `UPDATE` solo con las columnas que cambiaron.
- `UpdateTaskRequest` no tiene `Status` ni `ProjectId`, así que es imposible cambiarlos por esta vía aunque el cliente los envíe en el JSON: las propiedades desconocidas se ignoran. El contrato decide qué se puede modificar.
:::
::::

::::challenge Implementa PATCH /api/tasks/{id}/status
**Especificación:**

| | |
| --- | --- |
| Ruta | `PATCH /api/tasks/{id}/status` (con `{id:int}`) |
| Cuerpo | `ChangeTaskStatusRequest`: `{ "status": "Done" }` |
| `204 No Content` | Estado cambiado |
| `400 Bad Request` | Estado que no existe (ya lo tienes resuelto) |
| `404 Not Found` | No existe una tarea con ese `id` |

**La regla de negocio** de `CompletedAt`:

- Si el nuevo estado es `Done` y la tarea **no estaba** completada, `CompletedAt` pasa a ser la fecha y hora actuales (UTC).
- Si el nuevo estado es `Done` y la tarea **ya estaba** completada, `CompletedAt` **conserva** su fecha original (marcarla dos veces no cambia cuándo se terminó).
- Si el nuevo estado es cualquier otro, `CompletedAt` vuelve a `null`.

:::hint
La estructura es idéntica a la de `Update`: `FindAsync`, comprobar `null`, cambiar, guardar. Lo nuevo es solo cómo calcular `CompletedAt`.
:::

:::hint
Si la tarea ya está completada, `task.CompletedAt` tiene valor; si no, es `null`. El operador `??` devuelve el valor de la izquierda si no es `null`, y si lo es, el de la derecha: `task.CompletedAt ?? DateTime.UtcNow`. Combínalo con un operador ternario según `request.Status == TaskItemStatus.Done`.
:::

:::solution
```csharp title="Endpoints/TaskEndpoints.cs (línea nueva en MapTaskEndpoints, tras MapPut)"
tasks.MapPatch("/{id:int}/status", ChangeStatus);
```

```csharp title="Endpoints/TaskEndpoints.cs (método nuevo, al final de la clase)"
private static async Task<Results<NoContent, NotFound>> ChangeStatus(
    int id, ChangeTaskStatusRequest request, TaskTrackerDbContext db, CancellationToken cancellationToken)
{
    var task = await db.Tasks.FindAsync([id], cancellationToken);
    if (task is null)
    {
        return TypedResults.NotFound();
    }

    task.Status = request.Status;
    task.CompletedAt = request.Status == TaskItemStatus.Done
        ? task.CompletedAt ?? DateTime.UtcNow
        : null;
    await db.SaveChangesAsync(cancellationToken);

    return TypedResults.NoContent();
}
```

Cómo funciona:

- `task.CompletedAt ?? DateTime.UtcNow` resuelve los dos primeros casos de la regla en una expresión: si ya había fecha, se conserva; si no, se usa la actual.
- La regla vive en el handler porque es el único sitio que cambia el estado. Si en el futuro otro endpoint necesitara la misma regla, sería el momento de moverla a un método de la entidad (lo harás en el tutorial de Clean Architecture).
- Al leer la tarea, `completedAt` termina en `Z`: `ConfigureConventions` del paso 8 también se aplica a las propiedades `DateTime?`.
- Repetir el `PATCH` con `Done` no cambia nada: es **idempotente**, como debe ser.
:::
::::

::::challenge Implementa DELETE /api/tasks/{id}
**Especificación:**

| | |
| --- | --- |
| Ruta | `DELETE /api/tasks/{id}` (con `{id:int}`) |
| `204 No Content` | Tarea eliminada |
| `404 Not Found` | No existe una tarea con ese `id` |

Después de implementarlo, comprueba que el `taskCount` del proyecto baja en uno.

:::hint
Copia la idea de `Delete` en `ProjectEndpoints`: `FindAsync`, `Remove` y `SaveChangesAsync`.
:::

:::solution
```csharp title="Endpoints/TaskEndpoints.cs (línea nueva en MapTaskEndpoints, tras MapPatch)"
tasks.MapDelete("/{id:int}", Delete);
```

```csharp title="Endpoints/TaskEndpoints.cs (método nuevo, al final de la clase)"
private static async Task<Results<NoContent, NotFound>> Delete(
    int id, TaskTrackerDbContext db, CancellationToken cancellationToken)
{
    var task = await db.Tasks.FindAsync([id], cancellationToken);
    if (task is null)
    {
        return TypedResults.NotFound();
    }

    db.Tasks.Remove(task);
    await db.SaveChangesAsync(cancellationToken);

    return TypedResults.NoContent();
}
```

Con los tres retos resueltos, `TaskEndpoints.cs` queda así. Compáralo con el tuyo:

```csharp title="Endpoints/TaskEndpoints.cs"
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using TaskTracker.Api.Contracts;
using TaskTracker.Api.Data;
using TaskTracker.Api.Entities;
using TaskTracker.Api.Mappings;

namespace TaskTracker.Api.Endpoints;

public static class TaskEndpoints
{
    private const string GetTaskByIdRoute = "GetTaskById";

    public static IEndpointRouteBuilder MapTaskEndpoints(this IEndpointRouteBuilder app)
    {
        var projectTasks = app.MapGroup("/api/projects/{projectId:int}/tasks").WithTags("Tasks");

        projectTasks.MapGet("/", GetByProject);
        projectTasks.MapPost("/", Create);

        var tasks = app.MapGroup("/api/tasks").WithTags("Tasks");

        tasks.MapGet("/{id:int}", GetById).WithName(GetTaskByIdRoute);
        tasks.MapPut("/{id:int}", Update);
        tasks.MapPatch("/{id:int}/status", ChangeStatus);
        tasks.MapDelete("/{id:int}", Delete);

        return app;
    }

    private static async Task<Results<Ok<List<TaskResponse>>, NotFound>> GetByProject(
        int projectId,
        [AsParameters] TaskListQuery query,
        TaskTrackerDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await db.Projects.AnyAsync(p => p.Id == projectId, cancellationToken))
        {
            return TypedResults.NotFound();
        }

        // Nothing runs yet: we are only composing the query.
        var tasks = db.Tasks.AsNoTracking().Where(t => t.ProjectId == projectId);

        if (query.Status is { } status)
        {
            tasks = tasks.Where(t => t.Status == status);
        }

        if (query.Priority is { } priority)
        {
            tasks = tasks.Where(t => t.Priority == priority);
        }

        tasks = query.SortBy switch
        {
            // Tasks without a due date go last.
            TaskSortField.DueDate => tasks.OrderBy(t => t.DueDate == null).ThenBy(t => t.DueDate),
            TaskSortField.Priority => tasks.OrderByDescending(t => t.Priority).ThenBy(t => t.Id),
            _ => tasks.OrderBy(t => t.CreatedAt).ThenBy(t => t.Id),
        };

        // ToListAsync is the moment the SQL is sent to the database.
        var result = await tasks
            .Select(TaskMappings.ToResponseExpression)
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(result);
    }

    private static async Task<Results<Ok<TaskResponse>, NotFound>> GetById(
        int id, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var task = await db.Tasks
            .AsNoTracking()
            .Where(t => t.Id == id)
            .Select(TaskMappings.ToResponseExpression)
            .SingleOrDefaultAsync(cancellationToken);

        return task is null ? TypedResults.NotFound() : TypedResults.Ok(task);
    }

    private static async Task<Results<CreatedAtRoute<TaskResponse>, NotFound>> Create(
        int projectId, CreateTaskRequest request, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        if (!await db.Projects.AnyAsync(p => p.Id == projectId, cancellationToken))
        {
            return TypedResults.NotFound();
        }

        var task = new TaskItem
        {
            ProjectId = projectId,
            Title = request.Title,
            Description = request.Description,
            Priority = request.Priority,
            DueDate = request.DueDate,
            CreatedAt = DateTime.UtcNow,
        };

        db.Tasks.Add(task);
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.CreatedAtRoute(task.ToResponse(), GetTaskByIdRoute, new { id = task.Id });
    }

    private static async Task<Results<NoContent, NotFound>> Update(
        int id, UpdateTaskRequest request, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var task = await db.Tasks.FindAsync([id], cancellationToken);
        if (task is null)
        {
            return TypedResults.NotFound();
        }

        task.Title = request.Title;
        task.Description = request.Description;
        task.Priority = request.Priority;
        task.DueDate = request.DueDate;
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.NoContent();
    }

    private static async Task<Results<NoContent, NotFound>> ChangeStatus(
        int id, ChangeTaskStatusRequest request, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var task = await db.Tasks.FindAsync([id], cancellationToken);
        if (task is null)
        {
            return TypedResults.NotFound();
        }

        task.Status = request.Status;
        task.CompletedAt = request.Status == TaskItemStatus.Done
            ? task.CompletedAt ?? DateTime.UtcNow
            : null;
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.NoContent();
    }

    private static async Task<Results<NoContent, NotFound>> Delete(
        int id, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var task = await db.Tasks.FindAsync([id], cancellationToken);
        if (task is null)
        {
            return TypedResults.NotFound();
        }

        db.Tasks.Remove(task);
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.NoContent();
    }
}
```
:::
::::

:::checkpoint Tareas completas
Usa el `id` de uno de tus proyectos (aquí, `3`) y el de una tarea suya (aquí, `7`). Comprueba:

| Petición | Resultado esperado |
| --- | --- |
| `POST /api/projects/3/tasks` con `{ "title": "Write the release notes", "priority": "High", "dueDate": "2026-12-01" }` | `201`, `Location` hacia `/api/tasks/{id}`, `"status": "Todo"`, `"priority": "High"`. |
| `POST /api/projects/999/tasks` | `404` |
| `GET /api/projects/999/tasks` | `404` (no `200` con lista vacía) |
| `GET /api/projects/3/tasks?sortBy=DueDate` | Tareas con fecha primero (la más próxima arriba), sin fecha al final. |
| `GET /api/projects/3/tasks?status=Nope` | `400` con `ProblemDetails` |
| `GET /api/projects/3/tasks?sortBy=duedate` | `400` (el valor del enum distingue mayúsculas) |
| `POST /api/projects/3/tasks` con `"priority": 2` | `400` (los números están prohibidos) |
| `PUT /api/tasks/7` con `{ "title": "Write the release notes", "description": "Changelog and upgrade notes.", "priority": "High", "dueDate": "2026-11-15" }` | `204`. `GET /api/tasks/7` muestra la descripción y la fecha nuevas. |
| `PATCH /api/tasks/7/status` con `{ "status": "Done" }` | `204`. `GET` muestra `"status": "Done"` y `completedAt` con `Z`. Repetirlo **no cambia** `completedAt`. |
| `PATCH /api/tasks/7/status` con `{ "status": "InProgress" }` | `204`. `completedAt` vuelve a `null`. |
| `PATCH /api/tasks/7/status` con `{ "status": "Finished" }` | `400` |
| `DELETE /api/tasks/{id}` | `204`; una segunda vez, `404`. `GET /api/projects/3` muestra un `taskCount` menor. |
:::

:::tip Un número en la query string sí pasa
`allowIntegerValues: false` afecta al **JSON**. En la query string quien convierte es `Enum.TryParse`, que acepta números: `?status=1` se interpreta como `InProgress`. No es un problema de seguridad (el valor sigue siendo un `TaskItemStatus`), pero conviene saberlo si algún día ves URL con números.
:::

:::troubleshooting Errores comunes
- **`CS0104: 'Task' is an ambiguous reference`:** en algún archivo tienes una clase llamada `Task`. La entidad es `TaskItem`.
- **`400` y en la consola `Required parameter "int id" was not provided from query string`:** el nombre del parámetro del handler no coincide con el de la ruta del grupo, así que Minimal APIs lo busca en la query string. Deben llamarse igual: `{projectId:int}` ↔ `int projectId`.
- **El listado ignora los filtros:** te falta reasignar la variable: `tasks.Where(...)` devuelve una consulta **nueva**; debes escribir `tasks = tasks.Where(...)`.
- **`System.InvalidOperationException: The LINQ expression ... could not be translated`:** usaste dentro de un `Where` u `OrderBy` un método propio de C# que EF Core no sabe traducir. Usa solo propiedades y operadores simples en la consulta.
- **`500` en el listado y en la consola `InvalidOperationException: Body was inferred but the method does not allow inferred body parameters`:** falta `[AsParameters]` delante de `TaskListQuery query`, y Minimal APIs intenta leerlo del cuerpo en un `GET`.
- **Los enums siguen saliendo como números:** `ConfigureHttpJsonOptions` debe ir **antes** de `builder.Build()`. Si tienes también controllers en otro proyecto, recuerda que esta opción solo afecta a Minimal APIs.
- **Sigue devolviendo `500` con `?status=Nope`:** compila y reinicia la API; comprueba que pasas `new ExceptionHandlerOptions { ... }` a `UseExceptionHandler`.
- **`CS0246: The type or namespace name 'JsonStringEnumConverter' could not be found`:** falta `using System.Text.Json.Serialization;` en `Program.cs`.
:::

:::recap
- **Anidamiento superficial:** la colección bajo el padre (`/api/projects/{projectId}/tasks`) y cada elemento con su propia ruta (`/api/tasks/{id}`). Dos `MapGroup` en la misma clase.
- `[AsParameters]` convierte las propiedades de un `record` en parámetros del handler; tipos simples anulables = filtros opcionales de la query string.
- **Ejecución diferida:** un `IQueryable` es una consulta sin ejecutar. Compón filtros y ordenación con `if` y `switch`, y materializa al final con `ToListAsync`.
- `OrderBy(t => t.DueDate == null).ThenBy(t => t.DueDate)` deja los nulos al final; un último `ThenBy(t => t.Id)` hace el orden determinista.
- `JsonStringEnumConverter(allowIntegerValues: false)` hace que los enums viajen como texto y rechaza números. En la query string, los valores de enum distinguen mayúsculas.
- En `Development`, Minimal APIs **lanza** `BadHttpRequestException` ante datos que no puede enlazar; `StatusCodeSelector` en `UseExceptionHandler` conserva su `400`.
- `PATCH /status` aplica una regla de negocio (`CompletedAt`) que justifica tener su propia operación.

En el siguiente paso añadirás **etiquetas** a las tareas: una relación muchos a muchos, con su tabla intermedia.
:::
