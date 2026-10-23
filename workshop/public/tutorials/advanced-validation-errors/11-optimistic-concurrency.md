## Objetivo del paso

El último punto de la auditoría del paso 2 era el más sutil: tu API **no tiene forma de detectar que alguien ha pisado el trabajo de otro**. No hay excepción, no hay `500`, no hay nada en el log. Simplemente, un cambio desaparece. En este paso lo resuelves con **concurrencia optimista**. Vas a:

1. Entender el problema de la **actualización perdida** (*lost update*) y las dos familias de soluciones.
2. Añadir un **token de concurrencia** (`Version`) a las tareas, con su migración `AddTaskVersion`.
3. Hacer que el cliente envíe la versión que leyó y que EF Core la compare al guardar.
4. Subir la versión en **todas** las escrituras de una tarea, también en la operación masiva que se salta el seguimiento de cambios.
5. Traducir **`DbUpdateConcurrencyException`** a un `409` con `code: concurrency.conflict`.
6. Conocer **ETag** e **If-Match**, la alternativa nativa de HTTP.

## El problema: la actualización perdida

Ana y Luis trabajan en el mismo proyecto. Los dos abren la tarea 1 a la vez:

| Hora | Ana | Luis | Tarea 1 en la base de datos |
| --- | --- | --- | --- |
| 10:00 | `GET /api/tasks/1` | `GET /api/tasks/1` | `"priority": "High"`, sin descripción |
| 10:05 | Cambia la prioridad a `Low` y guarda: `PUT` → `204` | (sigue editando) | `"priority": "Low"` |
| 10:06 | | Añade una descripción y guarda: `PUT` → `204` | `"priority": "High"`, con descripción |

El `PUT` de Luis envía la tarea **completa** tal como él la vio a las 10:00, con `"priority": "High"`. Tu API la guarda sin preguntar, y el cambio de Ana **desaparece**. Los dos recibieron `204`, los dos creen que todo fue bien. Nadie se entera hasta que Ana vuelve a mirar la tarea.

:::concept Pesimista frente a optimista
Hay dos formas de evitarlo:

| | Concurrencia pesimista | Concurrencia optimista |
| --- | --- | --- |
| Idea | "Seguro que habrá conflicto": **bloquea** el registro mientras alguien lo edita. | "Casi nunca habrá conflicto": deja editar a todos y **comprueba al guardar** que nadie cambió nada. |
| Precio | Bloqueos que hay que liberar, esperas, registros bloqueados si alguien abandona. | Si hay conflicto, alguien tiene que repetir su cambio. |
| Encaja con | Transacciones cortas dentro del servidor. | APIs HTTP: entre el `GET` y el `PUT` pueden pasar minutos, y HTTP no tiene sesiones que mantengan un bloqueo. |

En una API, la respuesta es casi siempre **optimista**, y es la que EF Core soporta de forma directa.
:::

:::concept Token de concurrencia
Un **token de concurrencia** es una columna que **cambia en cada escritura**: una versión. Cuando una propiedad está configurada como token, EF Core añade su valor **original** al `WHERE` de cada `UPDATE` (y de cada `DELETE`):

```sql
UPDATE "Tasks" SET "Priority" = @p0, "Version" = @p1
WHERE "Id" = @p2 AND "Version" = @p3
RETURNING 1;
```

Si alguien cambió la fila desde que la leíste, su versión ya no es la que esperabas, el `WHERE` no encuentra ninguna fila y la base de datos responde "0 filas afectadas". EF Core lo detecta y lanza **`DbUpdateConcurrencyException`**. La escritura no se hace: nada se pierde.

Con la versión, la historia de Ana y Luis termina de otra forma: el `PUT` de Luis lleva la versión que leyó a las 10:00, que ya no es la actual, y recibe un `409`. Luis recarga la tarea, ve el cambio de Ana y aplica el suyo encima.
:::

## La versión de una tarea

:::why ¿Por qué un int y no un Guid o un rowversion?
- **`rowversion`** es un tipo de SQL Server que la base de datos actualiza sola en cada escritura. Sería lo más cómodo, pero **SQLite no lo tiene**. Con SQLite, la aplicación cambia la versión a mano.
- **Un `int`** que crece en cada escritura es fácil de leer, de escribir a mano en un `.http` y de comparar: la `3` es más reciente que la `2`. Y encaja con lo que ya tienes en la base de datos: al añadir la columna, las tareas existentes recibirán el valor por defecto, **`0`**, que es una versión tan válida como cualquier otra. Siguen siendo editables desde el primer momento, sin rellenar nada.
- **Un `Guid`** nuevo en cada escritura también funcionaría, pero no dice cuál es más reciente, es incómodo de copiar en una petición y todas las filas existentes empezarían con el mismo `Guid` vacío.
:::

:::vs Editar Entities/TaskItem.cs
Abre `Entities/TaskItem.cs` y reemplaza todo su contenido por el siguiente. Solo se añade `Version`, tras `CompletedAt`.
:::

```csharp title="Entities/TaskItem.cs"
namespace TaskTracker.Api.Entities;

// Named TaskItem (not Task) to avoid clashing with System.Threading.Tasks.Task.
public class TaskItem
{
    public const int MaxTags = 5;

    public int Id { get; set; }
    public required string Title { get; set; }
    public string? Description { get; set; }
    public TaskItemStatus Status { get; set; } = TaskItemStatus.Todo;
    public TaskPriority Priority { get; set; } = TaskPriority.Medium;
    public DateOnly? DueDate { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? CompletedAt { get; set; }

    // Concurrency token: grows on every change, so a stale copy can be detected.
    public int Version { get; set; }

    public int ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    public List<Tag> Tags { get; set; } = [];
}
```

Ahora dile a EF Core que esa propiedad es un token de concurrencia.

:::vs Editar Data/Configurations/TaskItemConfiguration.cs
Abre `Data/Configurations/TaskItemConfiguration.cs` y reemplaza todo su contenido por el siguiente. Se añade la configuración de `Version` tras la de `Status`.
:::

```csharp title="Data/Configurations/TaskItemConfiguration.cs"
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskTracker.Api.Entities;

namespace TaskTracker.Api.Data.Configurations;

public class TaskItemConfiguration : IEntityTypeConfiguration<TaskItem>
{
    public void Configure(EntityTypeBuilder<TaskItem> builder)
    {
        builder.Property(t => t.Title)
            .HasMaxLength(200);

        builder.Property(t => t.Description)
            .HasMaxLength(2000);

        // Saved as "Todo" / "InProgress" / "Done" so the table is readable.
        builder.Property(t => t.Status)
            .HasConversion<string>()
            .HasMaxLength(20);

        // Every UPDATE of a task adds "AND Version = @original" to its WHERE clause.
        builder.Property(t => t.Version)
            .IsConcurrencyToken();

        builder.HasOne(t => t.Project)
            .WithMany(p => p.Tasks)
            .HasForeignKey(t => t.ProjectId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(t => new { t.ProjectId, t.Status });
    }
}
```

`IsConcurrencyToken()` no cambia la columna: sigue siendo un `INTEGER` normal. Lo que cambia es cómo **la usa EF Core** al guardar.

## La migración AddTaskVersion

El modelo tiene una propiedad nueva, así que la base de datos necesita una columna nueva.

:::vs Crear y aplicar la migración
1. **Detén la API.**
2. En la **Package Manager Console**, crea la migración:

```powershell
Add-Migration AddTaskVersion
```

3. Aplícala:

```powershell
Update-Database
```
:::

Con la CLI: `dotnet ef migrations add AddTaskVersion` y `dotnet ef database update`, desde la carpeta del proyecto.

Abre el archivo nuevo de `Migrations`. Su método `Up` es una sola operación:

```csharp title="Migrations/<fecha>_AddTaskVersion.cs (método Up)"
protected override void Up(MigrationBuilder migrationBuilder)
{
    migrationBuilder.AddColumn<int>(
        name: "Version",
        table: "Tasks",
        type: "INTEGER",
        nullable: false,
        defaultValue: 0);
}
```

- **`nullable: false`** porque la propiedad es `int`, no `int?`.
- **`defaultValue: 0`**: SQLite no puede añadir una columna `NOT NULL` a una tabla con filas sin decirle qué valor poner en ellas. Las tareas que ya tenías quedan en la **versión 0**, como se explicó arriba.
- `IsConcurrencyToken()` **no aparece** en la migración: no es algo de la base de datos. Sí aparece en el *snapshot* del modelo (`TaskTrackerDbContextModelSnapshot.cs`), como `.IsConcurrencyToken()` en la propiedad `Version`.

En la salida de `Update-Database` verás el SQL: `ALTER TABLE "Tasks" ADD "Version" INTEGER NOT NULL DEFAULT 0;`.

## La versión viaja con la tarea

Para que el cliente pueda devolver la versión, primero tiene que recibirla, y después tiene que enviarla al editar.

:::vs Editar Contracts/TaskContracts.cs
Abre `Contracts/TaskContracts.cs` y reemplaza todo su contenido por el siguiente. Cambian `UpdateTaskRequest` (con `Version` al final) y `TaskResponse` (también con `Version` al final).
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
    DateOnly? DueDate,
    int? Version); // The version the client read. Nullable so a missing value is a validation error.

public record ChangeTaskStatusRequest(TaskItemStatus Status);

public record AssignTagRequest(int TagId);

public enum TaskSortField
{
    CreatedAt,
    DueDate,
    Priority,
}

// Bound from the query string with [AsParameters]: ?status=Done&priority=High&tag=backend&sortBy=DueDate
public record TaskListQuery(
    TaskItemStatus? Status,
    TaskPriority? Priority,
    string? Tag,
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
    DateTime? CompletedAt,
    List<string> Tags,
    int Version);

public record BulkOperationResponse(int Affected);
```

:::why ¿Por qué int? en la petición?
Si `Version` fuera `int`, un cliente que **olvida** enviarla recibiría el valor por defecto, `0`, sin ningún aviso. Para las tareas que nunca se han editado, `0` es justo su versión actual: el `PUT` funcionaría y la protección se desactivaría en silencio. Con **`int?`**, una versión ausente llega como `null`, y el validador la rechaza con un `400` claro. Es el mismo truco que viste con los tipos anulables en la validación: distinguir "no vino" de "vino con el valor por defecto".
:::

El mapeo construye el `TaskResponse`, así que también recibe el nuevo argumento. En `Mappings/TaskMappings.cs`, reemplaza todo el contenido por este:

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
            task.CompletedAt,
            task.Tags.OrderBy(tag => tag.Name).Select(tag => tag.Name).ToList(),
            task.Version);

    private static readonly Func<TaskItem, TaskResponse> ToResponseFunc = ToResponseExpression.Compile();

    public static TaskResponse ToResponse(this TaskItem task) => ToResponseFunc(task);
}
```

Y el validador de la actualización exige la versión. En `Validation/TaskValidators.cs`, la clase `UpdateTaskRequestValidator` queda así:

```csharp title="Validation/TaskValidators.cs (clase UpdateTaskRequestValidator)"
public class UpdateTaskRequestValidator : AbstractValidator<UpdateTaskRequest>
{
    public UpdateTaskRequestValidator()
    {
        RuleFor(x => x.Title).RequiredText(200);
        RuleFor(x => x.Description).MaximumLength(2000);
        RuleFor(x => x.Version).NotNull();
    }
}
```

## Comparar con la versión que leyó el cliente

Aquí está el detalle que hace funcionar todo. El handler `Update` carga la tarea con `FindAsync`, que trae su versión **actual**. Si la dejaras así, EF Core compararía con la versión que acabas de leer, que obviamente coincide: solo detectarías un cambio ocurrido en los milisegundos entre `FindAsync` y `SaveChangesAsync`. La pregunta correcta no es "¿ha cambiado desde que **yo** la leí?", sino "¿ha cambiado desde que **el cliente** la leyó?".

:::concept OriginalValue
El seguimiento de cambios guarda, para cada propiedad, su valor **original** (el que tenía al cargarla) y su valor **actual**. Para un token de concurrencia, EF Core pone el **original** en el `WHERE` del `UPDATE`. Puedes cambiarlo con:

```csharp
db.Entry(task).Property(t => t.Version).OriginalValue = request.Version!.Value;
```

Desde ese momento, el `UPDATE` dirá `WHERE "Id" = @id AND "Version" = <la versión del cliente>`.
:::

En `Endpoints/TaskEndpoints.cs`, reemplaza el método `Update` por este:

```csharp title="Endpoints/TaskEndpoints.cs (método Update)"
private static async Task<Results<NoContent, NotFound>> Update(
    int id, UpdateTaskRequest request, TaskTrackerDbContext db, CancellationToken cancellationToken)
{
    var task = await db.Tasks.FindAsync([id], cancellationToken);
    if (task is null)
    {
        return TypedResults.NotFound();
    }

    // Compare against the version the client read, not the one we just loaded.
    // If someone saved in between, the UPDATE matches no row and EF throws DbUpdateConcurrencyException.
    db.Entry(task).Property(t => t.Version).OriginalValue = request.Version!.Value;

    task.Title = request.Title;
    task.Description = request.Description;
    task.Priority = request.Priority;
    task.DueDate = request.DueDate;
    task.Version++;
    await db.SaveChangesAsync(cancellationToken);

    return TypedResults.NoContent();
}
```

- **`request.Version!.Value`**: el validador garantiza que no es `null`, pero el compilador no lo sabe. El `!` le dice "confía en mí" y `.Value` saca el `int` del `int?`.
- **`task.Version++`**: la versión sube en cada escritura correcta. El `UPDATE` guarda la nueva (`SET "Version" = @p`) y compara con la anterior (`WHERE ... "Version" = @p`).
- **El tipo de retorno no cambia.** El conflicto no es un resultado que el handler devuelva: es una **excepción** que lanza `SaveChangesAsync`. Desde aquí no puedes saber de antemano si alguien guardó antes, así que es exactamente el tipo de fallo que resuelve un manejador.

Como el `409` puede salir de este endpoint, documéntalo. El método `MapTaskEndpoints` queda así (esta es su versión final):

```csharp title="Endpoints/TaskEndpoints.cs (método MapTaskEndpoints completo)"
public static IEndpointRouteBuilder MapTaskEndpoints(this IEndpointRouteBuilder app)
{
    var projectTasks = app.MapGroup("/api/projects/{projectId:int}/tasks").WithTags("Tasks");

    projectTasks.MapGet("/", GetByProject);
    projectTasks.MapPost("/", Create).WithValidation<CreateTaskRequest>();
    projectTasks.MapPost("/complete-all", CompleteAll);
    projectTasks.MapDelete("/completed", DeleteCompleted);

    var tasks = app.MapGroup("/api/tasks").WithTags("Tasks");

    tasks.MapGet("/{id:int}", GetById).WithName(GetTaskByIdRoute);
    tasks.MapPut("/{id:int}", Update)
        .WithValidation<UpdateTaskRequest>()
        .ProducesProblem(StatusCodes.Status409Conflict);
    tasks.MapPatch("/{id:int}/status", ChangeStatus);
    tasks.MapDelete("/{id:int}", Delete);
    tasks.MapPost("/{id:int}/tags", AssignTag)
        .WithValidation<AssignTagRequest>()
        .ProducesProblem(StatusCodes.Status409Conflict);
    tasks.MapDelete("/{id:int}/tags/{tagId:int}", RemoveTag);

    return app;
}
```

## El conflicto, como 409

`DbUpdateConcurrencyException` es una excepción, así que pasa por tu cadena de manejadores. El sitio natural es `DatabaseExceptionHandler`. Pero cuidado: **`DbUpdateConcurrencyException` hereda de `DbUpdateException`**. En un `switch`, el primer caso que encaja gana, así que el caso más específico debe ir **primero**.

Reemplaza todo el contenido de `Errors/DatabaseExceptionHandler.cs` por el siguiente. Cambian dos cosas al principio del `switch`: un comentario y el caso nuevo.

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
        // Order matters: DbUpdateConcurrencyException is also a DbUpdateException.
        var problem = exception switch
        {
            DbUpdateConcurrencyException => Conflict(
                "concurrency.conflict",
                "The resource was modified by someone else",
                "Reload the resource to get its current version and try again."),

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

El `detail` dice al cliente exactamente qué hacer: **recargar** para obtener la versión actual y volver a intentarlo. Eso es lo que hará Luis.

## Todas las escrituras suben la versión

Una versión solo sirve si cambia **cada vez** que cambia la tarea. Si alguna escritura la olvida, un cliente con una copia antigua podría sobrescribir ese cambio sin que nadie lo detecte. Repasa los endpoints que modifican la fila de una tarea:

| Endpoint | ¿Sube la versión? |
| --- | --- |
| `PUT /api/tasks/{id}` | Sí: acabas de hacerlo. |
| `PATCH /api/tasks/{id}/status` | Debe hacerlo: cambia `Status` y `CompletedAt`. Es tu reto. |
| `POST /api/projects/{projectId}/tasks/complete-all` | Debe hacerlo, y tiene truco (después del reto). |
| `POST` y `DELETE` en `/api/tasks/{id}/tags` | **No**: escriben en la tabla intermedia `TaskTags`, no en la fila de `Tasks`. |
| `DELETE /api/tasks/{id}` y `DELETE .../completed` | No hace falta: la tarea deja de existir. |

:::why ¿Por qué las etiquetas no suben la versión?
La versión protege los **datos de la tarea** que un cliente envía completos en un `PUT`: título, descripción, prioridad, fecha. Las etiquetas no viajan en ese `PUT`, así que un cliente con una copia antigua no puede pisarlas. Asignar o quitar una etiqueta solo inserta o borra una fila de `TaskTags`, y EF Core no genera ningún `UPDATE` sobre `Tasks`. Si tu negocio quisiera considerar "otra etiqueta" como "otra versión de la tarea", tendrías que subirla a mano también ahí. Aquí no lo hacemos.
:::

::::challenge Sube la versión en PATCH /api/tasks/{id}/status
**Especificación:** cada `PATCH /api/tasks/{id}/status` que llega a guardar sube la versión de la tarea en uno. El resto del comportamiento (`204`, `404`, la regla de `CompletedAt`) no cambia.

El `PATCH` **no** recibe una versión del cliente: cambiar el estado es una operación pequeña y concreta que no pisa ningún otro campo, así que no necesita comprobar nada. Pero sí debe **avisar** a los demás de que la tarea cambió.

:::hint
Es una sola línea, en el mismo sitio relativo que en `Update`: justo antes de `SaveChangesAsync`.
:::

:::solution
```csharp title="Endpoints/TaskEndpoints.cs (método ChangeStatus)"
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
    task.Version++;
    await db.SaveChangesAsync(cancellationToken);

    return TypedResults.NoContent();
}
```

Como `Version` es un token de concurrencia, este `UPDATE` también lleva `AND "Version" = @original` en su `WHERE`, con la versión que acaba de cargar `FindAsync`. Solo fallaría si alguien guardara la tarea en los milisegundos entre la lectura y la escritura, y en ese caso el cliente recibiría el mismo `409`.
:::
::::

### La operación masiva

`complete-all` usa `ExecuteUpdateAsync`, que en el tutorial 2 aprendiste que **se salta el seguimiento de cambios**: genera un `UPDATE` directo, sin cargar entidades. Eso tiene dos consecuencias aquí:

- **No hay comprobación de versión.** `ExecuteUpdateAsync` no conoce valores "originales" y no añade el token al `WHERE`. Para una operación masiva tiene sentido: "completa todas las pendientes" no depende de lo que alguien vio antes.
- **Tampoco sube la versión sola.** `task.Version++` no sirve, porque no hay `task`. Tienes que decirle al `UPDATE` que la suba.

`SetProperty` tiene una segunda forma: en lugar de un valor, recibe una **expresión** que se calcula para cada fila con sus propios datos. `t => t.Version + 1` se traduce a `"Version" = "t"."Version" + 1`: cada tarea sube **su** versión.

Reemplaza el método `CompleteAll` por este:

```csharp title="Endpoints/TaskEndpoints.cs (método CompleteAll)"
private static async Task<Results<Ok<BulkOperationResponse>, NotFound>> CompleteAll(
    int projectId, TaskTrackerDbContext db, CancellationToken cancellationToken)
{
    if (!await db.Projects.AnyAsync(p => p.Id == projectId, cancellationToken))
    {
        return TypedResults.NotFound();
    }

    // One UPDATE statement; no entity is loaded into memory.
    var now = DateTime.UtcNow;
    var affected = await db.Tasks
        .Where(t => t.ProjectId == projectId && t.Status != TaskItemStatus.Done)
        .ExecuteUpdateAsync(setters => setters
            .SetProperty(t => t.Status, TaskItemStatus.Done)
            .SetProperty(t => t.CompletedAt, now)
            // ExecuteUpdate skips the change tracker: the version must be bumped by hand.
            .SetProperty(t => t.Version, t => t.Version + 1),
            cancellationToken);

    return TypedResults.Ok(new BulkOperationResponse(affected));
}
```

El SQL sigue siendo una sola sentencia:

```sql
UPDATE "Tasks" AS "t"
SET "Status" = @p,
    "CompletedAt" = @p2,
    "Version" = "t"."Version" + 1
WHERE "t"."ProjectId" = @projectId AND "t"."Status" <> 'Done'
```

## Actualiza los archivos .http

El `PUT` de `TaskTracker.Api.http` necesita ahora una versión. En una base de datos recién sembrada, la tarea 1 está en la versión `0`:

```http title="TaskTracker.Api.http (la petición PUT de tareas)"
PUT {{TaskTracker.Api_HostAddress}}/api/tasks/1
Content-Type: application/json

{
  "title": "Design the new home page",
  "description": "Hero section, features and footer.",
  "priority": "High",
  "dueDate": "2026-11-15",
  "version": 0
}
```

En `errors.http` hay dos novedades. Primero, un error de validación más: añade esta petición **al final de la sección** `### --- 400: validation (FluentValidation) ---`, después de la de la etiqueta `not a valid tag!`:

```http title="errors.http (petición nueva, al final de la sección de validación)"
###

PUT {{TaskTracker.Api_HostAddress}}/api/tasks/1
Content-Type: application/json

{
  "title": "Update without a version",
  "priority": "High"
}
```

Y después, una sección nueva **al final del archivo**, que reproduce la historia de Ana y Luis:

```http title="errors.http (sección nueva, al final)"
### --- 409: optimistic concurrency ---

# First save with the version we read: 204, the task moves to version 1.
PUT {{TaskTracker.Api_HostAddress}}/api/tasks/1
Content-Type: application/json

{
  "title": "Design the new home page",
  "priority": "High",
  "version": 0
}

###

# Second save with the same (now stale) version: 409.
PUT {{TaskTracker.Api_HostAddress}}/api/tasks/1
Content-Type: application/json

{
  "title": "Design the home page (old copy)",
  "priority": "Low",
  "version": 0
}
```

Deja una línea en blanco entre el último `}` de la sección anterior y `### --- 409: optimistic concurrency ---`.

:::checkpoint Concurrencia optimista
Detén la API, recrea la base de datos (`Drop-Database` y `Update-Database`: la siembra crea las tareas ya con la columna `Version`) y arranca la API. Lanza **en orden**:

| Petición | Resultado esperado |
| --- | --- |
| `GET /api/tasks/1` | `200`, con `"version": 0` al final. |
| `PUT /api/tasks/1` con `{ "title": "Design the new home page", "priority": "Low", "version": 0 }` (Ana) | `204` |
| `GET /api/tasks/1` | `"priority": "Low"`, `"version": 1` |
| `PUT /api/tasks/1` con `{ "title": "Design the new home page", "description": "Hero section first.", "priority": "High", "version": 0 }` (Luis, con su copia de las 10:00) | **`409`**, `"code": "concurrency.conflict"` (abajo). |
| `GET /api/tasks/1` | Sigue `"priority": "Low"`, `"version": 1`: el cambio de Ana se conservó. |
| El mismo `PUT` de Luis con `"version": 1` | `204`: ha recargado y aplica su cambio sobre la versión actual. Ahora `"version": 2`. |
| `PUT /api/tasks/1` sin `version` (la petición nueva de `errors.http`) | `400`, `"errors": { "Version": ["'Version' must not be empty."] }` |
| `PATCH /api/tasks/1/status` con `{ "status": "InProgress" }` | `204`; `GET` muestra `"version": 3`. |
| `POST /api/tasks/1/tags` con `{ "tagId": 3 }` | `204`; la versión **sigue en `3`**. |
| `POST /api/projects/1/tasks/complete-all` | `200`, `{ "affected": 2 }`; la tarea 1 pasa a `"version": 4` y la tarea 2 a `"version": 1`. |

La respuesta del conflicto:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "The resource was modified by someone else",
  "status": 409,
  "detail": "Reload the resource to get its current version and try again.",
  "instance": "PUT /api/tasks/1",
  "code": "concurrency.conflict",
  "traceId": "00-588202e261044b63f4722e114e57045e-64680cee3b856b26-00"
}
```

En la consola, el `UPDATE` del primer `PUT` lleva la versión en el `WHERE`:

```sql
UPDATE "Tasks" SET "DueDate" = @p0, "Priority" = @p1, "Version" = @p2
WHERE "Id" = @p3 AND "Version" = @p4
RETURNING 1;
```

(`DueDate` también cambia porque el `PUT` de Ana no la envía: un `PUT` reemplaza los campos editables, y una fecha ausente pasa a `null`.)

Y tras el `PUT` de Luis, tu aviso: `warn: TaskTracker.Api.Errors.DatabaseExceptionHandler[0] Database conflict on PUT /api/tasks/1: concurrency.conflict`.

Abre `/openapi/v1.json`: el `put` de `/api/tasks/{id}` lista ahora `204`, `400`, `404` y `409`.
:::

## La alternativa de HTTP: ETag e If-Match

Has puesto la versión **en el cuerpo** del JSON. HTTP tiene su propio mecanismo para lo mismo, y conviene que lo conozcas.

:::concept ETag, If-Match y 412
- Al responder a un `GET`, el servidor añade la cabecera **`ETag`** con un identificador de la versión del recurso: `ETag: "3"`.
- Al modificarlo, el cliente envía la cabecera **`If-Match: "3"`**: "aplica este cambio solo si el recurso sigue en la versión `"3"`".
- Si ya no lo está, el servidor responde **`412 Precondition Failed`**, el código que viste en la taxonomía del paso 1.

| | Versión en el cuerpo (lo que hiciste) | ETag + If-Match |
| --- | --- | --- |
| Dónde viaja | En el JSON, como un campo más | En cabeceras HTTP estándar |
| Conflicto | `409` con `code: concurrency.conflict` | `412 Precondition Failed` |
| Ventajas | Visible y fácil de usar desde cualquier cliente y desde un `.http`; un solo sitio donde mirar | Estándar: proxies, cachés y bibliotecas HTTP lo entienden; el mismo `ETag` sirve para cachés condicionales (`If-None-Match` → `304`) |
| Inconvenientes | Es una convención de tu API | Más piezas: escribir y leer cabeceras en cada endpoint, y los clientes deben acordarse de enviarlas |

Las dos se apoyan en el mismo token de concurrencia en la base de datos; solo cambia **cómo viaja** la versión. Los `ETag` también son la base de las cachés condicionales de HTTP, un tema que encaja con el tutorial 7 (paginación, caching y versionado).
:::

:::troubleshooting Errores comunes
- **`SQLite Error 1: 'no such column: t.Version'`:** la migración no está aplicada en la base de datos que usa la API. Ejecuta `Update-Database` (o arranca la API en `Development`, que aplica las migraciones pendientes al arrancar).
- **`Add-Migration` falla con `The process cannot access the file ... because it is being used by another process` o un error de compilación:** la API seguía en marcha, o el proyecto no compila. Detén la API, compila y repite.
- **El segundo `PUT` con `"version": 0` devuelve `204` en lugar de `409`:** falta `IsConcurrencyToken()`, o falta la línea de `OriginalValue` (estás comparando con la versión que acabas de cargar).
- **El conflicto devuelve `500` con `DbUpdateConcurrencyException`:** el caso de `DbUpdateConcurrencyException` no está en el `switch`, o está **después** de un caso que también encaja.
- **La versión no sube tras un `PUT` correcto:** falta `task.Version++`. El `UPDATE` comprobaría la versión pero guardaría la misma, y un cliente con la copia "antigua" seguiría pudiendo escribir.
- **Un `PUT` sin `version` devuelve `204`:** `Version` es `int` en lugar de `int?`, o falta `RuleFor(x => x.Version).NotNull()`.
- **`CS7036: There is no argument given that corresponds to the required parameter 'Version'`:** añadiste `Version` a `TaskResponse` pero no a `TaskMappings`.
- **`complete-all` no sube la versión:** falta `.SetProperty(t => t.Version, t => t.Version + 1)`. Con `t => 1` pondrías todas en `1`, no las subirías.
:::

:::recap
- La **actualización perdida** ocurre cuando dos clientes editan la misma copia y el segundo `PUT` pisa al primero sin que nadie se entere.
- La **concurrencia optimista** no bloquea: comprueba al guardar. Un **token de concurrencia** (`IsConcurrencyToken()`) hace que EF Core añada su valor original al `WHERE` y lance **`DbUpdateConcurrencyException`** si no se actualizó ninguna fila.
- Con SQLite, la versión es un `int` que la aplicación sube a mano. La migración `AddTaskVersion` deja las filas existentes en la versión `0`.
- El cliente recibe `version` en cada `TaskResponse` y la devuelve en el `PUT`; `int?` + `NotNull()` impide que la olvide en silencio.
- **`OriginalValue`** hace que EF Core compare con la versión que leyó el **cliente**, no con la que acabas de cargar.
- **Todas** las escrituras de la tarea suben la versión. `ExecuteUpdateAsync` se salta el seguimiento de cambios: súbela con `SetProperty(t => t.Version, t => t.Version + 1)`. Las etiquetas viven en la tabla intermedia y no la cambian.
- `DbUpdateConcurrencyException` hereda de `DbUpdateException`: su caso va **primero** en el `switch`, y responde `409` con `code: concurrency.conflict`.
- **ETag + If-Match** (con `412`) es la alternativa nativa de HTTP para el mismo problema.

En el último paso ejecutarás todo `errors.http` sobre una base de datos recién sembrada, repasarás el catálogo completo de errores y verás qué viene en los próximos tutoriales.
:::
