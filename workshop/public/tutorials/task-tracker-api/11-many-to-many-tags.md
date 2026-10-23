## Objetivo del paso

Las tareas necesitan **etiquetas** (`backend`, `frontend`, `urgent`...) para poder clasificarlas y filtrarlas. Una tarea puede tener varias etiquetas, y una etiqueta puede estar en muchas tareas: es una relación **muchos a muchos**, la última pieza del modelo. Vas a:

1. Entender cómo se guarda una relación muchos a muchos: la **tabla intermedia**.
2. Crear la entidad `Tag` y configurar la relación, con un **índice único** para el nombre.
3. Generar y aplicar la migración `AddTags`.
4. Crear los endpoints de etiquetas, con un `409 Conflict` para nombres repetidos.
5. Asignar y quitar etiquetas a una tarea, entendiendo **`Include`** y la **resolución de identidad**.
6. Incluir las etiquetas en `TaskResponse` y filtrar tareas por etiqueta.

## Muchos a muchos: la tabla intermedia

En el paso 9 la relación se guardaba con una columna (`ProjectId`) en el lado "muchos". Aquí los dos lados son "muchos": no puedes poner una columna `TagId` en `Tasks` (una tarea tendría una sola etiqueta) ni una `TaskId` en `Tags`.

:::concept Tabla intermedia (join table)
Una relación muchos a muchos se guarda en una **tercera tabla** cuyas filas son **parejas**: "la tarea 7 tiene la etiqueta 1". Esa tabla tiene dos claves foráneas, una hacia cada lado, y su clave primaria es la **combinación de las dos**, de modo que la misma pareja no puede repetirse.

```
Tasks              TaskTags                 Tags
┌────┬────────┐    ┌─────────┬────────┐    ┌────┬──────────┐
│ Id │ Title  │    │ TasksId │ TagsId │    │ Id │ Name     │
├────┼────────┤    ├─────────┼────────┤    ├────┼──────────┤
│  6 │ ...    │◀───│    6    │   1    │───▶│  1 │ backend  │
│  7 │ ...    │◀───│    7    │   1    │    │  2 │ frontend │
│    │        │◀───│    7    │   2    │───▶│  3 │ urgent   │
└────┴────────┘    └─────────┴────────┘    └────┴──────────┘
```

Asignar una etiqueta es **insertar una fila** en `TaskTags`; quitarla es **borrar esa fila**. Ni la tarea ni la etiqueta cambian.
:::

:::concept Navegaciones de salto (skip navigations)
EF Core puede gestionar la tabla intermedia **sin que escribas una clase para ella**. Tú declaras `List<Tag> Tags` en `TaskItem` y `List<TaskItem> Tasks` en `Tag`, y EF Core entiende que hay una tabla en medio. Esas navegaciones "saltan" por encima de la tabla intermedia: por eso se llaman *skip navigations*. Cuando haces `task.Tags.Add(tag)`, EF Core inserta la fila de `TaskTags` por ti.

Si algún día la relación necesitara datos propios (por ejemplo, **quién** asignó la etiqueta y **cuándo**), entonces sí crearías una entidad para la tabla intermedia. Para una relación pura, no hace falta.
:::

## La entidad Tag

:::vs Crear Entities/Tag.cs
Clic derecho sobre `Entities` > **Add** > **Class…** > **`Tag.cs`**, y reemplaza todo su contenido por el siguiente.
:::

```csharp title="Entities/Tag.cs"
namespace TaskTracker.Api.Entities;

public class Tag
{
    public int Id { get; set; }
    public required string Name { get; set; }

    public List<TaskItem> Tasks { get; set; } = [];
}
```

Y añade el otro lado de la relación en `TaskItem`: una lista de etiquetas al final de la clase.

:::vs Editar Entities/TaskItem.cs
Abre `Entities/TaskItem.cs` y reemplaza todo su contenido por el siguiente (la novedad es la última propiedad).
:::

```csharp title="Entities/TaskItem.cs"
namespace TaskTracker.Api.Entities;

// Named TaskItem (not Task) to avoid clashing with System.Threading.Tasks.Task.
public class TaskItem
{
    public int Id { get; set; }
    public required string Title { get; set; }
    public string? Description { get; set; }
    public TaskItemStatus Status { get; set; } = TaskItemStatus.Todo;
    public TaskPriority Priority { get; set; } = TaskPriority.Medium;
    public DateOnly? DueDate { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? CompletedAt { get; set; }

    public int ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    public List<Tag> Tags { get; set; } = [];
}
```

Fíjate en que **no hay** ninguna propiedad `TagId` ni `TaskId`: las claves foráneas viven en la tabla intermedia, que no tiene clase.

## Configurar la relación

:::vs Crear Data/Configurations/TagConfiguration.cs
Clic derecho sobre `Data/Configurations` > **Add** > **Class…** > **`TagConfiguration.cs`**, y reemplaza todo su contenido por el siguiente.
:::

```csharp title="Data/Configurations/TagConfiguration.cs"
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskTracker.Api.Entities;

namespace TaskTracker.Api.Data.Configurations;

public class TagConfiguration : IEntityTypeConfiguration<Tag>
{
    public void Configure(EntityTypeBuilder<Tag> builder)
    {
        builder.Property(t => t.Name)
            .HasMaxLength(50);

        // The database itself refuses two tags with the same name.
        builder.HasIndex(t => t.Name)
            .IsUnique();

        // Many-to-many: EF Core creates and manages the join table for us.
        builder.HasMany(t => t.Tasks)
            .WithMany(t => t.Tags)
            .UsingEntity(join => join.ToTable("TaskTags"));
    }
}
```

| Configuración | Qué hace |
| --- | --- |
| `HasIndex(t => t.Name).IsUnique()` | Un **índice único**: además de acelerar las búsquedas por nombre, hace que la **base de datos rechace** una segunda etiqueta con el mismo nombre. Es la última línea de defensa, aunque tu código se equivoque. |
| `HasMany(...).WithMany(...)` | "Una etiqueta tiene muchas tareas, y una tarea tiene muchas etiquetas." |
| `UsingEntity(join => join.ToTable("TaskTags"))` | Solo cambia el **nombre** de la tabla intermedia. Por convención se llamaría `TagTaskItem` (los dos tipos en orden alfabético); `TaskTags` se lee mejor. |

:::vs Editar Data/TaskTrackerDbContext.cs
Añade el `DbSet` de etiquetas debajo del de tareas. El archivo queda así:
:::

```csharp title="Data/TaskTrackerDbContext.cs"
using Microsoft.EntityFrameworkCore;
using TaskTracker.Api.Entities;

namespace TaskTracker.Api.Data;

public class TaskTrackerDbContext(DbContextOptions<TaskTrackerDbContext> options) : DbContext(options)
{
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<TaskItem> Tasks => Set<TaskItem>();
    public DbSet<Tag> Tags => Set<Tag>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        // Applies to every DateTime and DateTime? property in the model.
        configurationBuilder.Properties<DateTime>().HaveConversion<UtcDateTimeConverter>();
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Picks up every IEntityTypeConfiguration<T> in this project (Data/Configurations).
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(TaskTrackerDbContext).Assembly);
    }
}
```

Esta es la versión final del contexto: tres `DbSet`, una convención y las configuraciones.

## La migración AddTags

:::vs Crear y aplicar la migración
Con la API detenida y el proyecto compilado, en la **Package Manager Console**:

```powershell
Add-Migration AddTags
Update-Database
```
:::

(Con la CLI: `dotnet ef migrations add AddTags` y `dotnet ef database update`.)

La parte interesante del método `Up` es la tabla intermedia:

```csharp title="Migrations/<fecha>_AddTags.cs (fragmento de Up)"
migrationBuilder.CreateTable(
    name: "TaskTags",
    columns: table => new
    {
        TagsId = table.Column<int>(type: "INTEGER", nullable: false),
        TasksId = table.Column<int>(type: "INTEGER", nullable: false)
    },
    constraints: table =>
    {
        table.PrimaryKey("PK_TaskTags", x => new { x.TagsId, x.TasksId });
        table.ForeignKey(
            name: "FK_TaskTags_Tags_TagsId",
            column: x => x.TagsId,
            principalTable: "Tags",
            principalColumn: "Id",
            onDelete: ReferentialAction.Cascade);
        table.ForeignKey(
            name: "FK_TaskTags_Tasks_TasksId",
            column: x => x.TasksId,
            principalTable: "Tasks",
            principalColumn: "Id",
            onDelete: ReferentialAction.Cascade);
    });

migrationBuilder.CreateIndex(
    name: "IX_Tags_Name",
    table: "Tags",
    column: "Name",
    unique: true);

migrationBuilder.CreateIndex(
    name: "IX_TaskTags_TasksId",
    table: "TaskTags",
    column: "TasksId");
```

Léela con calma:

- **Clave primaria compuesta** `(TagsId, TasksId)`: la misma pareja no puede existir dos veces.
- **Dos claves foráneas en cascada**: si borras una tarea, desaparecen sus filas en `TaskTags` (pero no las etiquetas); si borras una etiqueta, desaparecen sus asignaciones (pero no las tareas). Exactamente lo que esperarías.
- **`IX_TaskTags_TasksId`**: la clave primaria ya sirve para buscar por `TagsId` (es su primera columna, como viste con el índice compuesto del paso 9). Para buscar "las etiquetas de la tarea 7" hace falta un índice que empiece por `TasksId`, y EF Core lo crea.
- **`IX_Tags_Name`** con `unique: true`: el índice único de la configuración.

Otra migración puramente aditiva: dos tablas nuevas y ningún cambio en las existentes.

## Los endpoints de etiquetas

Las etiquetas son un recurso propio, compartido por todos los proyectos: `GET /api/tags`, `POST /api/tags` y `DELETE /api/tags/{id}`.

:::vs Crear Contracts/TagContracts.cs
Clic derecho sobre `Contracts` > **Add** > **Class…** > **`TagContracts.cs`**, y reemplaza todo su contenido por el siguiente.
:::

```csharp title="Contracts/TagContracts.cs"
namespace TaskTracker.Api.Contracts;

public record CreateTagRequest(string Name);

public record TagResponse(int Id, string Name, int TaskCount);
```

`TaskCount` dirá en cuántas tareas se usa cada etiqueta: otra proyección con `Count`, como la de los proyectos.

### Nombres normalizados y 409 Conflict

¿Son `Backend` y `backend` la misma etiqueta? Para un usuario, sí. Así que **normalizamos**: guardamos siempre el nombre en minúsculas. Y si ya existe una etiqueta con ese nombre, respondemos **`409 Conflict`**.

:::concept 409 Conflict
`409` significa "la petición es correcta, pero **choca con el estado actual** del recurso". No es un `400` (los datos tienen buen formato) ni un `404`. El ejemplo de manual es crear algo que ya existe con un identificador que debe ser único.

Para devolverlo con el formato `ProblemDetails` del resto de errores usamos `TypedResults.Problem(...)`, que crea un `ProblemHttpResult` con el código, un título y un detalle legibles.
:::

El borrado de etiquetas será tu reto, así que de momento la clase tiene `GetAll` y `Create`:

:::vs Crear Endpoints/TagEndpoints.cs
Clic derecho sobre `Endpoints` > **Add** > **Class…** > **`TagEndpoints.cs`**, y reemplaza todo su contenido por el siguiente.
:::

```csharp title="Endpoints/TagEndpoints.cs"
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using TaskTracker.Api.Contracts;
using TaskTracker.Api.Data;
using TaskTracker.Api.Entities;

namespace TaskTracker.Api.Endpoints;

public static class TagEndpoints
{
    public static IEndpointRouteBuilder MapTagEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/tags").WithTags("Tags");

        group.MapGet("/", GetAll);
        group.MapPost("/", Create);

        return app;
    }

    private static async Task<Ok<List<TagResponse>>> GetAll(
        TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var tags = await db.Tags
            .AsNoTracking()
            .OrderBy(t => t.Name)
            .Select(t => new TagResponse(t.Id, t.Name, t.Tasks.Count))
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(tags);
    }

    private static async Task<Results<Created<TagResponse>, ProblemHttpResult>> Create(
        CreateTagRequest request, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var name = request.Name.ToLowerInvariant();

        if (await db.Tags.AnyAsync(t => t.Name == name, cancellationToken))
        {
            return TypedResults.Problem(
                statusCode: StatusCodes.Status409Conflict,
                title: "Tag already exists",
                detail: $"A tag named '{name}' already exists.");
        }

        var tag = new Tag { Name = name };
        db.Tags.Add(tag);
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.Created($"/api/tags/{tag.Id}", new TagResponse(tag.Id, tag.Name, 0));
    }
}
```

- **`GetAll`** proyecta directamente con una lambda, sin clase de mapeo: el `TagResponse` es tan pequeño que no compensa. `t.Tasks.Count` atraviesa la tabla intermedia y se traduce a una subconsulta `COUNT(*)`.
- **`ToLowerInvariant()`** convierte a minúsculas con reglas independientes del idioma del servidor (la versión sin `Invariant` depende de la cultura configurada y puede dar resultados distintos en algunos idiomas).
- **`TypedResults.Created(...)`** en lugar de `CreatedAtRoute`: no hay un endpoint `GET /api/tags/{id}` al que apuntar con un nombre de ruta, así que construimos la URL a mano. La cabecera `Location` será `/api/tags/1`, una URL relativa, perfectamente válida.
- **`Results<Created<TagResponse>, ProblemHttpResult>`**: los dos resultados posibles, igual que con `NotFound` en los otros endpoints.

:::warning La comprobación previa no basta sola
Entre el `AnyAsync` y el `SaveChangesAsync` pasan unos milisegundos. Si dos clientes crean `backend` exactamente a la vez, los dos podrían ver que no existe. Por eso existe el **índice único**: el segundo `INSERT` fallará en la base de datos (con un `500`, porque no capturamos esa excepción). La comprobación da un buen mensaje en el caso normal; el índice garantiza la integridad en el caso raro. Capturar esa excepción para devolver también un `409` es un buen ejercicio de manejo de errores que verás en el tutorial 3.
:::

## Etiquetas en las tareas

Ahora lo más interesante: asignar etiquetas a tareas, mostrarlas y filtrar por ellas. Empieza por los contratos.

:::vs Editar Contracts/TaskContracts.cs
Abre `Contracts/TaskContracts.cs` y reemplaza todo su contenido por el siguiente. Hay tres novedades: `AssignTagRequest`, la propiedad `Tag` en `TaskListQuery` (con su comentario actualizado) y la lista `Tags` al final de `TaskResponse`.
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
    List<string> Tags);
```

En la respuesta, las etiquetas son una simple lista de nombres (`["backend", "frontend"]`). Para el cliente es más cómodo que una lista de objetos, y los nombres son únicos.

### El mapeo con una colección

:::vs Editar Mappings/TaskMappings.cs
Abre `Mappings/TaskMappings.cs` y reemplaza todo su contenido por el siguiente (la novedad es la última línea del `new TaskResponse`).
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
            task.CompletedAt,
            task.Tags.OrderBy(tag => tag.Name).Select(tag => tag.Name).ToList());

    private static readonly Func<TaskItem, TaskResponse> ToResponseFunc = ToResponseExpression.Compile();

    public static TaskResponse ToResponse(this TaskItem task) => ToResponseFunc(task);
}
```

Una proyección puede contener **otra consulta** sobre una colección. EF Core la traduce añadiendo un `LEFT JOIN` con `TaskTags` y `Tags`, y ordena por nombre en la propia base de datos:

```sql
SELECT "t2"."Id", "t2"."ProjectId", "t2"."Title", ..., "s"."Name", "s"."TagsId", "s"."TasksId", "s"."Id"
FROM (
    SELECT ... FROM "Tasks" AS "t" WHERE "t"."Id" = @id LIMIT 2
) AS "t2"
LEFT JOIN (
    SELECT "t1"."Name", "t0"."TagsId", "t0"."TasksId", "t1"."Id"
    FROM "TaskTags" AS "t0"
    INNER JOIN "Tags" AS "t1" ON "t0"."TagsId" = "t1"."Id"
) AS "s" ON "t2"."Id" = "s"."TasksId"
ORDER BY "t2"."Id", "s"."Name", "s"."TagsId", "s"."TasksId"
```

Sigue siendo **una sola consulta**, por muchas tareas que devuelva el listado. Los handlers que ya usan `ToResponseExpression` (`GetByProject`, `GetById`) muestran las etiquetas sin tocarlos.

### Filtrar por etiqueta

En `GetByProject`, añade un tercer filtro justo **después** del de prioridad (y antes del `switch` de ordenación):

```csharp title="Endpoints/TaskEndpoints.cs (GetByProject, tras el filtro de prioridad)"
if (!string.IsNullOrWhiteSpace(query.Tag))
{
    var tagName = query.Tag.Trim().ToLowerInvariant();
    tasks = tasks.Where(t => t.Tags.Any(tag => tag.Name == tagName));
}
```

- Normalizamos igual que al crear (`Trim` + `ToLowerInvariant`), así que `?tag=Backend` encuentra `backend`.
- `t.Tags.Any(...)` se traduce a un `EXISTS (SELECT 1 FROM "TaskTags" ... INNER JOIN "Tags" ... WHERE "t1"."Name" = @tagName)`: la base de datos comprueba la condición sin traer las etiquetas.
- Es un filtro más de la **ejecución diferida** del paso 10: se combina con `status`, `priority` y `sortBy`.

## Asignar y quitar etiquetas

Dos rutas nuevas en el grupo `tasks`:

| Petición | Cuerpo | Respuestas |
| --- | --- | --- |
| `POST /api/tasks/{id}/tags` | `{ "tagId": 1 }` | `204`; `404` si no existe la tarea o la etiqueta. Asignar dos veces la misma no es un error. |
| `DELETE /api/tasks/{id}/tags/{tagId}` | Ninguno | `204`; `404` si no existe la tarea o la tarea no tiene esa etiqueta. |

Aquí no basta con proyectar: vas a **modificar la colección** `Tags` de una tarea. Es el caso para el que guardábamos `Include` desde el paso 9.

:::concept Por qué hace falta Include para modificar
Si cargas la tarea con `FindAsync`, su lista `Tags` está **vacía**: EF Core no la ha cargado. Si haces `task.Tags.Add(tag)` sobre esa lista vacía, funcionaría para una etiqueta nueva, pero no podrías saber si la tarea **ya** la tenía, y para **quitar** una etiqueta necesitas que esté en la lista.

`db.Tasks.Include(t => t.Tags)` carga la tarea **y** sus etiquetas en la misma consulta, con seguimiento. A partir de ahí, la lista refleja el estado real, y el seguimiento de cambios detecta lo que añades o quitas: `Add` → `INSERT` en `TaskTags`; `Remove` → `DELETE` en `TaskTags`.
:::

:::concept Resolución de identidad
Un `DbContext` garantiza que, mientras viva, **cada fila de la base de datos corresponde a un único objeto** en memoria. Si cargas la etiqueta 1 con `Include` (dentro de `task.Tags`) y luego otra vez con `FindAsync`, recibes **el mismo objeto**, no una copia. A eso se le llama **resolución de identidad** (*identity resolution*).

Gracias a ello, `task.Tags.Contains(tag)` funciona aunque `Contains` compare referencias: si la tarea ya tenía la etiqueta, el `tag` de `FindAsync` es exactamente el objeto que hay en la lista. (Y `FindAsync` ni siquiera consulta la base de datos en ese caso: la encuentra entre las entidades que ya sigue.)
:::

Haz tres cambios en `Endpoints/TaskEndpoints.cs`. Primero, registra las dos rutas al final de `MapTaskEndpoints`:

```csharp title="Endpoints/TaskEndpoints.cs (método MapTaskEndpoints completo)"
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
    tasks.MapPost("/{id:int}/tags", AssignTag);
    tasks.MapDelete("/{id:int}/tags/{tagId:int}", RemoveTag);

    return app;
}
```

Después, añade los dos handlers al final de la clase (tras `Delete`):

```csharp title="Endpoints/TaskEndpoints.cs (métodos nuevos, al final de la clase)"
private static async Task<Results<NoContent, NotFound>> AssignTag(
    int id, AssignTagRequest request, TaskTrackerDbContext db, CancellationToken cancellationToken)
{
    var task = await db.Tasks
        .Include(t => t.Tags)
        .SingleOrDefaultAsync(t => t.Id == id, cancellationToken);
    var tag = await db.Tags.FindAsync([request.TagId], cancellationToken);
    if (task is null || tag is null)
    {
        return TypedResults.NotFound();
    }

    // Assigning twice is harmless: the second call changes nothing.
    if (!task.Tags.Contains(tag))
    {
        task.Tags.Add(tag);
        await db.SaveChangesAsync(cancellationToken);
    }

    return TypedResults.NoContent();
}

private static async Task<Results<NoContent, NotFound>> RemoveTag(
    int id, int tagId, TaskTrackerDbContext db, CancellationToken cancellationToken)
{
    var task = await db.Tasks
        .Include(t => t.Tags)
        .SingleOrDefaultAsync(t => t.Id == id, cancellationToken);
    var tag = task?.Tags.SingleOrDefault(t => t.Id == tagId);
    if (task is null || tag is null)
    {
        return TypedResults.NotFound();
    }

    // Removes the row in the join table; the tag itself is kept.
    task.Tags.Remove(tag);
    await db.SaveChangesAsync(cancellationToken);

    return TypedResults.NoContent();
}
```

Y el tercer cambio es el filtro por etiqueta de la sección anterior, si aún no lo has añadido.

Puntos clave:

- **`AssignTag` es idempotente.** Si la tarea ya tiene la etiqueta, no hace nada y responde `204` igualmente. Sin el `Contains`, el segundo `INSERT` violaría la clave primaria de `TaskTags` y el cliente recibiría un `500`.
- **`SingleOrDefaultAsync(t => t.Id == id)`** en lugar de `FindAsync`: `FindAsync` no admite `Include`. El predicado puede ir directamente dentro de `SingleOrDefaultAsync`.
- **En `RemoveTag` no hay una segunda consulta.** La etiqueta se busca **en memoria**, en `task.Tags`, que ya se cargó con `Include`. `task?.Tags` usa el operador `?.` porque `task` puede ser `null`. Si la tarea no tiene esa etiqueta, la respuesta es `404`, que también cubre el caso de una etiqueta inexistente.
- **`task.Tags.Remove(tag)`** borra solo la fila de `TaskTags`. La etiqueta sigue existiendo para otras tareas.

Por último, registra los endpoints de etiquetas en `Program.cs`, en la sección de endpoints:

```csharp title="Program.cs (sección Endpoints)"
// --- Endpoints ---
app.MapProjectEndpoints();
app.MapTaskEndpoints();
app.MapTagEndpoints();
```

## Pruébalo

Añade al final de `TaskTracker.Api.http` las peticiones de etiquetas (cambia los `id` por los tuyos):

```http title="TaskTracker.Api.http (peticiones nuevas, al final)"

### --- Tags ---

GET {{TaskTracker.Api_HostAddress}}/api/tags

###

POST {{TaskTracker.Api_HostAddress}}/api/tags
Content-Type: application/json

{
  "name": "docs"
}

###

POST {{TaskTracker.Api_HostAddress}}/api/tasks/1/tags
Content-Type: application/json

{
  "tagId": 1
}

###

DELETE {{TaskTracker.Api_HostAddress}}/api/tasks/1/tags/1
```

Crea las etiquetas `Backend` (con mayúscula, a propósito), `frontend` y `urgent`, y asigna dos de ellas a una tarea. Al leer la tarea:

```json
{
  "id": 7,
  "projectId": 3,
  "title": "Write the release notes",
  "description": "Changelog and upgrade notes.",
  "status": "InProgress",
  "priority": "High",
  "dueDate": "2026-11-15",
  "createdAt": "2026-10-20T19:29:45.4165721Z",
  "completedAt": null,
  "tags": ["backend", "frontend"]
}
```

Mira el SQL de la primera asignación: un `SELECT` con `LEFT JOIN` (el `Include`), un `SELECT` de la etiqueta y un `INSERT INTO "TaskTags" ("TagsId", "TasksId")`. En la segunda asignación de la misma etiqueta ya no hay `INSERT`: ni siquiera el `SELECT` de la etiqueta, porque `FindAsync` la encontró entre las entidades cargadas por el `Include`.

::::challenge Implementa DELETE /api/tags/{id}
**Especificación:**

| | |
| --- | --- |
| Ruta | `DELETE /api/tags/{id}` (con `{id:int}`) |
| `204 No Content` | Etiqueta eliminada |
| `404 Not Found` | No existe una etiqueta con ese `id` |

Al borrar una etiqueta deben desaparecer sus asignaciones, pero **no** las tareas. Pregunta: ¿necesitas cargar las tareas de la etiqueta con `Include` para lograrlo?

:::hint
Es el mismo patrón que `Delete` de proyectos y de tareas: `FindAsync`, comprobar `null`, `Remove`, `SaveChangesAsync`. Necesitas una línea `group.MapDelete(...)` en `MapTagEndpoints` y un handler `Delete`.
:::

:::hint
Sobre la pregunta: recuerda las claves foráneas de `TaskTags` en la migración. ¿Qué `onDelete` tienen?
:::

:::solution
```csharp title="Endpoints/TagEndpoints.cs (línea nueva en MapTagEndpoints, tras MapPost)"
group.MapDelete("/{id:int}", Delete);
```

```csharp title="Endpoints/TagEndpoints.cs (método nuevo, al final de la clase)"
private static async Task<Results<NoContent, NotFound>> Delete(
    int id, TaskTrackerDbContext db, CancellationToken cancellationToken)
{
    var tag = await db.Tags.FindAsync([id], cancellationToken);
    if (tag is null)
    {
        return TypedResults.NotFound();
    }

    db.Tags.Remove(tag);
    await db.SaveChangesAsync(cancellationToken);

    return TypedResults.NoContent();
}
```

Cómo funciona:

- **No hace falta `Include`.** EF Core envía un único `DELETE FROM "Tags"`, y la clave foránea `FK_TaskTags_Tags_TagsId`, con `ON DELETE CASCADE`, borra las filas de `TaskTags` de esa etiqueta. Las tareas no se tocan.
- Funciona, pero hace **dos** viajes a la base de datos (el `SELECT` del `FindAsync` y el `DELETE`) solo para borrar una fila. En el paso 13 lo reescribirás con una sola sentencia.

`TagEndpoints.cs` queda así:

```csharp title="Endpoints/TagEndpoints.cs"
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using TaskTracker.Api.Contracts;
using TaskTracker.Api.Data;
using TaskTracker.Api.Entities;

namespace TaskTracker.Api.Endpoints;

public static class TagEndpoints
{
    public static IEndpointRouteBuilder MapTagEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/tags").WithTags("Tags");

        group.MapGet("/", GetAll);
        group.MapPost("/", Create);
        group.MapDelete("/{id:int}", Delete);

        return app;
    }

    private static async Task<Ok<List<TagResponse>>> GetAll(
        TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var tags = await db.Tags
            .AsNoTracking()
            .OrderBy(t => t.Name)
            .Select(t => new TagResponse(t.Id, t.Name, t.Tasks.Count))
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(tags);
    }

    private static async Task<Results<Created<TagResponse>, ProblemHttpResult>> Create(
        CreateTagRequest request, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var name = request.Name.ToLowerInvariant();

        if (await db.Tags.AnyAsync(t => t.Name == name, cancellationToken))
        {
            return TypedResults.Problem(
                statusCode: StatusCodes.Status409Conflict,
                title: "Tag already exists",
                detail: $"A tag named '{name}' already exists.");
        }

        var tag = new Tag { Name = name };
        db.Tags.Add(tag);
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.Created($"/api/tags/{tag.Id}", new TagResponse(tag.Id, tag.Name, 0));
    }

    private static async Task<Results<NoContent, NotFound>> Delete(
        int id, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var tag = await db.Tags.FindAsync([id], cancellationToken);
        if (tag is null)
        {
            return TypedResults.NotFound();
        }

        db.Tags.Remove(tag);
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.NoContent();
    }
}
```
:::
::::

:::checkpoint Etiquetas funcionando
Con la API en marcha y tus propios `id`:

| Petición | Resultado esperado |
| --- | --- |
| `POST /api/tags` con `{ "name": "Backend" }` | `201`, `Location: /api/tags/1`, cuerpo `{ "id": 1, "name": "backend", "taskCount": 0 }` (en minúsculas). |
| `POST /api/tags` con `{ "name": "backend" }` | `409` con `"title": "Tag already exists"` y `"detail": "A tag named 'backend' already exists."` |
| `POST /api/tasks/7/tags` con `{ "tagId": 1 }` | `204`. Repetido: `204` otra vez, y la tarea sigue teniendo la etiqueta **una** sola vez. |
| `POST /api/tasks/7/tags` con `{ "tagId": 99 }` | `404` |
| `POST /api/tasks/999/tags` con `{ "tagId": 1 }` | `404` |
| `GET /api/tasks/7` | `"tags": ["backend", "frontend"]`, en orden alfabético. |
| `GET /api/tags` | Cada etiqueta con su `taskCount` correcto. |
| `GET /api/projects/3/tasks?tag=Backend` | Solo las tareas con la etiqueta `backend`. |
| `DELETE /api/tasks/7/tags/2` | `204`. Una segunda vez: `404`. La etiqueta 2 sigue existiendo en `GET /api/tags`. |
| `DELETE /api/tags/3` (reto) | `204`; una segunda vez, `404`. Las tareas que la tenían siguen existiendo, sin ella. |

En la base de datos, comprueba que `__EFMigrationsHistory` tiene **tres** migraciones y que `TaskTags` contiene las parejas que esperas.
:::

:::troubleshooting Errores comunes
- **La migración crea una tabla `TagTaskItem` en lugar de `TaskTags`:** falta el `UsingEntity(join => join.ToTable("TaskTags"))` en `TagConfiguration`. Si ya la aplicaste, usa `Update-Database AddTasks` para volver a la migración anterior, `Remove-Migration`, corrige y vuelve a generarla.
- **`SQLite Error 19: 'UNIQUE constraint failed: TaskTags.TagsId, TaskTags.TasksId'`:** asignaste una etiqueta que la tarea ya tenía sin comprobarlo antes. Revisa el `if (!task.Tags.Contains(tag))` y que la tarea se carga con `Include(t => t.Tags)`.
- **`SQLite Error 19: 'UNIQUE constraint failed: Tags.Name'`:** dos etiquetas con el mismo nombre. Revisa que normalizas con `ToLowerInvariant()` **antes** de la comprobación `AnyAsync`.
- **`RemoveTag` siempre devuelve `404`:** falta el `Include(t => t.Tags)`: sin él, `task.Tags` está vacía y nunca encuentra la etiqueta.
- **`CS1061: 'ValueTask<TaskItem?>' does not contain a definition for 'Include'`:** intentaste usar `Include` después de `FindAsync`. `Include` va sobre el `DbSet`, antes de la consulta: `db.Tasks.Include(...).SingleOrDefaultAsync(...)`.
- **`tags` aparece siempre vacío en las respuestas:** revisa la última línea de `TaskMappings.ToResponseExpression`.
:::

:::recap
- Una relación **muchos a muchos** se guarda en una **tabla intermedia** de parejas, con clave primaria compuesta y dos claves foráneas en cascada.
- Con **navegaciones de salto** (`List<Tag> Tags` y `List<TaskItem> Tasks`), EF Core gestiona la tabla intermedia sin una clase propia. `UsingEntity(...ToTable("TaskTags"))` solo le cambia el nombre.
- Un **índice único** hace que la base de datos garantice la unicidad; la comprobación previa con `AnyAsync` da un `409 Conflict` con un mensaje claro.
- `TypedResults.Problem(statusCode: 409, ...)` devuelve errores propios en formato `ProblemDetails`.
- Para **modificar** una colección, cárgala con **`Include`**. La **resolución de identidad** garantiza un único objeto por fila y por contexto, y hace que `Contains` funcione.
- `task.Tags.Add(tag)` inserta una fila en `TaskTags`; `task.Tags.Remove(tag)` la borra. Ni la tarea ni la etiqueta se eliminan.
- Una proyección puede incluir una colección (`Tags`), y un filtro `Any` se traduce a `EXISTS`.

Tu modelo de datos está completo. En el siguiente paso cerrarás un agujero importante: ahora mismo la API acepta títulos vacíos y nombres de cualquier longitud.
:::
