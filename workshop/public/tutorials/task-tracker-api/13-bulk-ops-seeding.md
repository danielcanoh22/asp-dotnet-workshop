## Objetivo del paso

Hasta ahora, cada escritura seguía el mismo camino: cargar la entidad, cambiarla y llamar a `SaveChangesAsync`. Es el camino correcto para una entidad, pero ¿y si quieres completar **todas** las tareas de un proyecto? En este paso aprenderás a modificar muchas filas con una sola sentencia SQL y, después, a llenar la base de datos con datos de ejemplo de forma automática. Vas a:

1. Entender el coste de `SaveChanges` para operaciones masivas.
2. Usar **`ExecuteUpdateAsync`** y **`ExecuteDeleteAsync`**, y conocer sus advertencias.
3. Crear dos endpoints masivos: completar todas las tareas y borrar las completadas.
4. Reescribir el borrado de etiquetas con una sola sentencia.
5. Sembrar datos iniciales con **`UseSeeding`** y **`UseAsyncSeeding`**.
6. Aplicar las migraciones automáticamente al arrancar en desarrollo, y ver la siembra con **`Drop-Database`** + **`Update-Database`**.

## El coste de SaveChanges en operaciones masivas

Imagina el endpoint "completa todas las tareas del proyecto" escrito con lo que ya sabes:

```csharp
var tasks = await db.Tasks
    .Where(t => t.ProjectId == projectId && t.Status != TaskItemStatus.Done)
    .ToListAsync(cancellationToken);

foreach (var task in tasks)
{
    task.Status = TaskItemStatus.Done;
    task.CompletedAt = DateTime.UtcNow;
}

await db.SaveChangesAsync(cancellationToken);
```

Funciona, pero mira lo que hace:

1. Un `SELECT` que trae **todas** las columnas de cada tarea a memoria, aunque solo vas a cambiar dos.
2. EF Core crea una entidad por fila y guarda una copia de sus valores originales para el seguimiento de cambios.
3. `SaveChangesAsync` compara cada entidad con su copia y genera **un `UPDATE` por tarea** (agrupados en pocos viajes, pero uno por fila).

Con cinco tareas no se nota. Con cincuenta mil, sí. Y la base de datos sabe hacer todo eso con una sola instrucción: `UPDATE "Tasks" SET ... WHERE ...`.

## ExecuteUpdate y ExecuteDelete

:::concept Operaciones masivas (bulk)
`ExecuteUpdateAsync` y `ExecuteDeleteAsync` se aplican sobre una consulta LINQ (normalmente con un `Where`) y la convierten **directamente** en una sentencia `UPDATE` o `DELETE`:

- **No cargan nada en memoria** ni usan el seguimiento de cambios.
- Se ejecutan **en el momento** de llamarlas: no hace falta (ni sirve) `SaveChangesAsync`.
- Devuelven el **número de filas afectadas**.

```csharp
var affected = await db.Tasks
    .Where(t => t.ProjectId == projectId && t.Status == TaskItemStatus.Done)
    .ExecuteDeleteAsync(cancellationToken);
// DELETE FROM "Tasks" AS "t" WHERE "t"."ProjectId" = @projectId AND "t"."Status" = 'Done'
```

En `ExecuteUpdateAsync` indicas qué columnas cambian con `SetProperty(propiedad, valor)`, encadenando tantas como necesites.
:::

:::warning Lo que pierdes al saltarte el seguimiento de cambios
Precisamente porque **no** pasan por el seguimiento de cambios, estas operaciones tienen consecuencias que debes conocer:

| Advertencia | Qué significa |
| --- | --- |
| Las entidades cargadas **no se actualizan** | Si en el mismo contexto ya tenías una tarea cargada y luego haces un `ExecuteUpdateAsync`, el objeto en memoria conserva los valores **antiguos**. Si después llamas a `SaveChangesAsync`, podrías sobrescribir el cambio masivo. Regla: no mezcles en la misma operación entidades seguidas y operaciones masivas sobre las mismas filas. |
| Cada llamada es **inmediata e independiente** | Dos `ExecuteUpdateAsync` seguidos son dos sentencias, cada una en su propia transacción. Si la segunda falla, la primera ya está hecha. Para agruparlas necesitarías una transacción explícita. |
| **Sin lógica de EF Core en memoria** | Nada de lo que haría `SaveChanges` sobre entidades (por ejemplo, borrados en cascada de entidades cargadas) se aplica. Lo que sí se aplica son las reglas de la **base de datos**: el `ON DELETE CASCADE` de las claves foráneas sigue funcionando. |

Para "cambiar una entidad concreta", sigue usando `FindAsync` + `SaveChangesAsync`. Las operaciones masivas son para "cambiar **todas** las filas que cumplan una condición".
:::

## Dos endpoints masivos

Vas a añadir dos operaciones sobre la colección de tareas de un proyecto:

| Petición | Qué hace | Respuesta |
| --- | --- | --- |
| `POST /api/projects/{projectId}/tasks/complete-all` | Marca como `Done` todas las tareas del proyecto que no lo estén, con su `CompletedAt`. | `200` con `{ "affected": N }`; `404` si el proyecto no existe. |
| `DELETE /api/projects/{projectId}/tasks/completed` | Borra las tareas `Done` del proyecto. | `200` con `{ "affected": N }`; `404` si el proyecto no existe. |

:::why ¿Por qué POST para complete-all y 200 en lugar de 204?
"Completar todas" no es crear, reemplazar ni borrar un recurso concreto: es una **acción** sobre una colección. En REST, las acciones que no encajan en los otros verbos se modelan habitualmente con `POST` sobre una ruta con nombre de acción. En cambio, `DELETE .../completed` sí borra algo: el subconjunto de tareas completadas.

Las dos devuelven `200` con un cuerpo en lugar de `204`, porque el cliente quiere saber **cuántas** filas se vieron afectadas, y ese número solo lo conoce el servidor.
:::

Primero, el contrato de respuesta. Añade esta línea al **final** de `Contracts/TaskContracts.cs`, después de `TaskResponse`:

```csharp title="Contracts/TaskContracts.cs (record nuevo, al final del archivo)"
public record BulkOperationResponse(int Affected);
```

Después, en `Endpoints/TaskEndpoints.cs`, registra las dos rutas en el grupo `projectTasks`. El método `MapTaskEndpoints` queda así (esta es ya su versión final):

```csharp title="Endpoints/TaskEndpoints.cs (método MapTaskEndpoints completo)"
public static IEndpointRouteBuilder MapTaskEndpoints(this IEndpointRouteBuilder app)
{
    var projectTasks = app.MapGroup("/api/projects/{projectId:int}/tasks").WithTags("Tasks");

    projectTasks.MapGet("/", GetByProject);
    projectTasks.MapPost("/", Create).ProducesValidationProblem();
    projectTasks.MapPost("/complete-all", CompleteAll);
    projectTasks.MapDelete("/completed", DeleteCompleted);

    var tasks = app.MapGroup("/api/tasks").WithTags("Tasks");

    tasks.MapGet("/{id:int}", GetById).WithName(GetTaskByIdRoute);
    tasks.MapPut("/{id:int}", Update).ProducesValidationProblem();
    tasks.MapPatch("/{id:int}/status", ChangeStatus);
    tasks.MapDelete("/{id:int}", Delete);
    tasks.MapPost("/{id:int}/tags", AssignTag);
    tasks.MapDelete("/{id:int}/tags/{tagId:int}", RemoveTag);

    return app;
}
```

Y añade los dos handlers al final de la clase (tras `RemoveTag`):

```csharp title="Endpoints/TaskEndpoints.cs (métodos nuevos, al final de la clase)"
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
            .SetProperty(t => t.CompletedAt, now),
            cancellationToken);

    return TypedResults.Ok(new BulkOperationResponse(affected));
}

private static async Task<Results<Ok<BulkOperationResponse>, NotFound>> DeleteCompleted(
    int projectId, TaskTrackerDbContext db, CancellationToken cancellationToken)
{
    if (!await db.Projects.AnyAsync(p => p.Id == projectId, cancellationToken))
    {
        return TypedResults.NotFound();
    }

    // One DELETE statement; no entity is loaded into memory.
    var affected = await db.Tasks
        .Where(t => t.ProjectId == projectId && t.Status == TaskItemStatus.Done)
        .ExecuteDeleteAsync(cancellationToken);

    return TypedResults.Ok(new BulkOperationResponse(affected));
}
```

Detalles:

- **`var now = DateTime.UtcNow;`** se calcula una vez, fuera de la consulta. Todas las tareas completadas en la misma operación reciben exactamente la misma fecha, que viaja como un parámetro.
- **`t.Status != TaskItemStatus.Done`** respeta la regla de `CompletedAt` del paso 10: las tareas que ya estaban hechas conservan su fecha original. Por eso, si repites la petición, `affected` es `0`.
- **El `AnyAsync` previo** sigue siendo necesario: sin él, un proyecto inexistente daría `{ "affected": 0 }`, indistinguible de un proyecto sin tareas pendientes.
- Al borrar tareas con `ExecuteDeleteAsync`, sus filas de `TaskTags` desaparecen gracias al `ON DELETE CASCADE` **de la base de datos** (paso 11). Las etiquetas no se tocan.

El SQL de `complete-all` es una única sentencia:

```sql
UPDATE "Tasks" AS "t"
SET "Status" = @p,
    "CompletedAt" = @p2
WHERE "t"."ProjectId" = @projectId AND "t"."Status" <> 'Done'
```

## Borrar etiquetas con una sola sentencia

En el reto del paso 11 escribiste el borrado de etiquetas con `FindAsync` + `Remove`: dos viajes a la base de datos para borrar una fila. Con `ExecuteDeleteAsync` basta uno, y el número de filas afectadas te dice si existía. Reemplaza el método `Delete` de `Endpoints/TagEndpoints.cs` por este:

```csharp title="Endpoints/TagEndpoints.cs (método Delete)"
private static async Task<Results<NoContent, NotFound>> Delete(
    int id, TaskTrackerDbContext db, CancellationToken cancellationToken)
{
    // ExecuteDeleteAsync returns how many rows were deleted.
    var deleted = await db.Tags
        .Where(t => t.Id == id)
        .ExecuteDeleteAsync(cancellationToken);

    return deleted == 0 ? TypedResults.NotFound() : TypedResults.NoContent();
}
```

El SQL pasa de un `SELECT` + `DELETE` a un único `DELETE FROM "Tags" AS "t" WHERE "t"."Id" = @id`. Y la cascada de `TaskTags` la sigue haciendo la base de datos.

:::tip ¿Y los Delete de proyectos y tareas?
Podrías aplicar el mismo cambio, pero los dejamos con `FindAsync` + `Remove` a propósito: así tienes en el proyecto los dos estilos para comparar. En una API real, cualquiera de los dos es válido para borrar una fila; la diferencia de rendimiento solo importa cuando hay muchas.
:::

## Datos de ejemplo: sembrar la base de datos

Cada vez que borras la base de datos, empiezas con tablas vacías y tienes que crear proyectos, tareas y etiquetas a mano para probar. Lo normal es **sembrar** (*seed*) unos datos de ejemplo automáticamente.

:::concept Formas de sembrar datos en EF Core
| Mecanismo | Cómo funciona | Cuándo usarlo |
| --- | --- | --- |
| `HasData(...)` en la configuración del modelo | Los datos forman parte del **modelo**: cada migración incluye los `INSERT`, `UPDATE` o `DELETE` necesarios. Exige escribir las claves primarias a mano y valores fijos. | Datos **estáticos** que cambian con el esquema: una lista de países, de estados... |
| `UseSeeding` / `UseAsyncSeeding` (EF Core 9+) | Un método **tuyo** que EF Core ejecuta después de crear la base de datos o de aplicar migraciones. Puede consultar la base de datos y usar cualquier lógica. | Datos de ejemplo o de pruebas, con claves generadas por la base de datos y valores calculados (como "dentro de tres días"). Es el mecanismo recomendado para siembra general. |

Nuestros datos de ejemplo tienen fechas relativas a hoy y claves generadas por SQLite, así que `HasData` no sirve. Usaremos `UseSeeding` y `UseAsyncSeeding`.
:::

:::concept Por qué dos versiones: síncrona y asíncrona
EF Core llama a una u otra según **quién** dispare la operación:

| Operación | Método de siembra que se ejecuta |
| --- | --- |
| `Update-Database` (PMC) o `dotnet ef database update` | `UseSeeding` (síncrono) |
| `context.Database.Migrate()` o `EnsureCreated()` | `UseSeeding` (síncrono) |
| `context.Database.MigrateAsync()` o `EnsureCreatedAsync()` | `UseAsyncSeeding` (asíncrono) |

Las herramientas de EF Core solo usan la versión síncrona, así que hay que implementar **las dos**, con la misma lógica. Y la siembra se ejecuta **cada vez** que se aplican migraciones, aunque no haya ninguna pendiente: por eso el código debe comprobar primero si ya hay datos.
:::

:::vs Crear Data/DataSeeder.cs
Clic derecho sobre la carpeta `Data` > **Add** > **Class…** > **`DataSeeder.cs`**, y reemplaza todo su contenido por el siguiente.
:::

```csharp title="Data/DataSeeder.cs"
using Microsoft.EntityFrameworkCore;
using TaskTracker.Api.Entities;

namespace TaskTracker.Api.Data;

public static class DataSeeder
{
    // Used by Update-Database / dotnet ef database update (EF tools call the synchronous version).
    public static void Seed(DbContext context)
    {
        if (context.Set<Project>().Any() || context.Set<Tag>().Any())
        {
            return;
        }

        context.Set<Project>().AddRange(CreateSampleProjects());
        context.SaveChanges();
    }

    // Used by Database.MigrateAsync() when the app starts in Development.
    public static async Task SeedAsync(DbContext context, CancellationToken cancellationToken)
    {
        if (await context.Set<Project>().AnyAsync(cancellationToken)
            || await context.Set<Tag>().AnyAsync(cancellationToken))
        {
            return;
        }

        context.Set<Project>().AddRange(CreateSampleProjects());
        await context.SaveChangesAsync(cancellationToken);
    }

    private static List<Project> CreateSampleProjects()
    {
        var now = DateTime.UtcNow;
        var today = DateOnly.FromDateTime(now);

        var backend = new Tag { Name = "backend" };
        var frontend = new Tag { Name = "frontend" };
        var urgent = new Tag { Name = "urgent" };

        // Adding the projects also adds their tasks and tags: EF Core follows the navigations.
        return
        [
            new Project
            {
                Name = "Website redesign",
                Description = "New look and faster pages for the company website.",
                CreatedAt = now,
                Tasks =
                [
                    new TaskItem
                    {
                        Title = "Design the new home page",
                        Priority = TaskPriority.High,
                        DueDate = today.AddDays(3),
                        CreatedAt = now,
                        Tags = [frontend, urgent],
                    },
                    new TaskItem
                    {
                        Title = "Set up the contact form API",
                        Status = TaskItemStatus.InProgress,
                        DueDate = today.AddDays(7),
                        CreatedAt = now,
                        Tags = [backend],
                    },
                    new TaskItem
                    {
                        Title = "Choose the color palette",
                        Status = TaskItemStatus.Done,
                        Priority = TaskPriority.Low,
                        CreatedAt = now,
                        CompletedAt = now,
                        Tags = [frontend],
                    },
                ],
            },
            new Project
            {
                Name = "Mobile app launch",
                Description = "Everything needed to publish version 1.0.",
                CreatedAt = now,
                Tasks =
                [
                    new TaskItem
                    {
                        Title = "Fix the login crash",
                        Priority = TaskPriority.High,
                        DueDate = today.AddDays(1),
                        CreatedAt = now,
                        Tags = [backend, urgent],
                    },
                    new TaskItem
                    {
                        Title = "Write the store description",
                        Priority = TaskPriority.Low,
                        CreatedAt = now,
                    },
                ],
            },
        ];
    }
}
```

Lo importante:

- **Recibe `DbContext`, no `TaskTrackerDbContext`.** Es lo que EF Core le pasa al callback de siembra configurado en `AddDbContext`. Por eso usa `context.Set<Project>()` en lugar de `context.Projects`: `Set<T>()` existe en cualquier `DbContext`.
- **La comprobación inicial hace la siembra idempotente.** Si ya hay proyectos o etiquetas, no hace nada. Se ejecutará en cada arranque, así que sin ella duplicarías los datos cada vez.
- **Un solo `AddRange` inserta todo el grafo.** Al añadir los proyectos, EF Core recorre sus navegaciones (`Tasks`, y de ahí `Tags`) y marca como `Added` todo lo que encuentra: proyectos, tareas, etiquetas y las filas de `TaskTags`. No hace falta asignar ningún `ProjectId`: EF Core los rellena después de insertar cada proyecto.
- **Las etiquetas se crean una vez y se reutilizan.** `backend` aparece en dos tareas de dos proyectos distintos, pero es **el mismo objeto**, así que EF Core inserta una sola fila en `Tags`. Si escribieras `new Tag { Name = "backend" }` dos veces, serían dos etiquetas y el índice único lo rechazaría.
- **Fechas relativas.** `today.AddDays(3)` hace que las fechas límite tengan sentido el día que ejecutes el tutorial.

## Migrar y sembrar al arrancar (solo en desarrollo)

Falta conectar el sembrador y, ya que estamos, hacer que en desarrollo la API **aplique las migraciones pendientes al arrancar**: así, si alguien clona el proyecto, le basta con ejecutarlo.

:::concept Un scope fuera de una petición
`TaskTrackerDbContext` es **scoped**: vive lo que dura una petición. Pero el código de arranque de `Program.cs` se ejecuta **antes** de que llegue ninguna petición, así que no hay scope. Si pidieras el contexto directamente a `app.Services` (el proveedor raíz), en `Development` obtendrías un error del tipo `Cannot resolve scoped service ... from root provider`: la validación de scopes, activa en desarrollo, te protege de crear un contexto que no se liberaría nunca.

La solución es crear el scope a mano con `app.Services.CreateScope()`, pedir el contexto a ese scope y liberarlo al terminar (`using`). Es lo mismo que hace ASP.NET Core por ti en cada petición.
:::

Reemplaza todo el contenido de `Program.cs` por el siguiente. Cambian dos bloques: la configuración de `AddDbContext` (que ahora encadena `UseSeeding` y `UseAsyncSeeding`) y el bloque de desarrollo (que aplica las migraciones).

```csharp title="Program.cs"
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using TaskTracker.Api.Data;
using TaskTracker.Api.Endpoints;

var builder = WebApplication.CreateBuilder(args);

// --- Services ---
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
builder.Services.AddValidation();

// Enums travel as text in JSON ("High", not 2); numbers are rejected.
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(allowIntegerValues: false)));

builder.Services.AddDbContext<TaskTrackerDbContext>(options =>
    options
        .UseSqlite(builder.Configuration.GetConnectionString("TaskTracker"))
        .UseSeeding((context, _) => DataSeeder.Seed(context))
        .UseAsyncSeeding((context, _, cancellationToken) => DataSeeder.SeedAsync(context, cancellationToken)));

var app = builder.Build();

// --- Development-only setup ---
if (app.Environment.IsDevelopment())
{
    // DbContext is scoped: outside a request we create the scope ourselves.
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<TaskTrackerDbContext>();
    await db.Database.MigrateAsync();

    app.MapOpenApi();
}

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

// --- Endpoints ---
app.MapProjectEndpoints();
app.MapTaskEndpoints();
app.MapTagEndpoints();

app.Run();
```

- **`.UseSeeding((context, _) => ...)`**: el segundo parámetro (un `bool` que indica si se hizo alguna operación sobre el esquema) no lo necesitamos; `_` es un **descarte**, la forma de C# de decir "aquí hay un parámetro que ignoro".
- **`await db.Database.MigrateAsync();`** aplica las migraciones que falten (ninguna, si la base de datos está al día) y después ejecuta `UseAsyncSeeding`.
- **`await` en `Program.cs`**: el archivo de instrucciones de nivel superior admite `await` directamente, sin declarar ningún método `async`.
- **`using var scope`** libera el scope (y el contexto) al salir del bloque `if`, antes de que la aplicación empiece a atender peticiones.

:::warning Migrar al arrancar: sí en desarrollo, con cuidado en producción
Aplicar migraciones al arrancar es muy cómodo en desarrollo, y por eso va dentro del bloque `IsDevelopment()`. En producción tiene problemas: si arrancan varias instancias a la vez, competirían por migrar (EF Core usa la tabla `__EFMigrationsLock` para que solo una lo haga, pero las demás esperan), la aplicación necesitaría permisos para cambiar el esquema y nadie revisaría el SQL antes de ejecutarlo. Para producción, la documentación de EF Core recomienda generar **scripts SQL** (`Script-Migration`, que viste en el paso 7) o **migration bundles**, y aplicarlos como un paso separado del despliegue.
:::

## Ver la siembra: Drop-Database y Update-Database

Tu base de datos actual ya tiene datos, así que la siembra no hará nada (la comprobación inicial lo impide). Para verla en acción, empieza de cero.

:::vs Recrear la base de datos
1. **Detén la API.** No se puede borrar un archivo que está en uso.
2. En la **Package Manager Console**, borra la base de datos:

```powershell
Drop-Database
```

   Te pedirá que confirmes que quieres borrar la base de datos; responde `Y`. El archivo `tasktracker.db` desaparece.

3. Créala de nuevo aplicando todas las migraciones:

```powershell
Update-Database
```
:::

Con la CLI: `dotnet ef database drop` (añade `--force` para no tener que confirmar) y `dotnet ef database update`.

En la salida de `Update-Database` verás aplicarse las tres migraciones y, a continuación, varios `INSERT INTO "Projects"`, `"Tasks"`, `"Tags"` y `"TaskTags"`: es `DataSeeder.Seed`, la versión **síncrona**, llamada por la herramienta.

Ahora ejecuta la API. En la consola aparece:

```
info: Microsoft.EntityFrameworkCore.Migrations[20405]
      No migrations were applied. The database is already up to date.
```

`MigrateAsync` no tenía nada que aplicar, y `SeedAsync` vio que ya había proyectos y no insertó nada. Detén y vuelve a arrancar la API todas las veces que quieras: los datos no se duplican.

:::tip Otra forma de empezar de cero
Con la API detenida, también puedes borrar a mano el archivo `tasktracker.db` (y, si existen, `tasktracker.db-shm` y `tasktracker.db-wal`) y ejecutar la API. Esta vez es `MigrateAsync` quien crea la base de datos, aplica las tres migraciones y llama a `SeedAsync`, la versión **asíncrona**. Mismo resultado, por el otro camino.
:::

:::checkpoint Datos sembrados y operaciones masivas
Con la base de datos recién creada:

| Petición | Resultado esperado |
| --- | --- |
| `GET /api/projects` | Dos proyectos: *Mobile app launch* (`taskCount: 2`, `completedTaskCount: 0`) y *Website redesign* (`taskCount: 3`, `completedTaskCount: 1`). |
| `GET /api/tags` | `backend`, `frontend` y `urgent`, cada una con `taskCount: 2`. Los `id` son `1` (`frontend`), `2` (`urgent`) y `3` (`backend`): el orden en que EF Core insertó el grafo. |
| `GET /api/projects/1/tasks?sortBy=Priority` | Tres tareas: *Design the new home page* (`High`, `["frontend", "urgent"]`), *Set up the contact form API* (`Medium`, `InProgress`) y *Choose the color palette* (`Low`, `Done`). Las fechas límite son relativas a hoy. |
| `POST /api/projects/1/tasks/complete-all` | `200` con `{ "affected": 2 }`. Repetido: `{ "affected": 0 }`. |
| `POST /api/projects/999/tasks/complete-all` | `404` |
| `DELETE /api/projects/1/tasks/completed` | `200` con `{ "affected": 3 }`. Después, `GET /api/projects/1` muestra `taskCount: 0`. |
| `GET /api/tags` | Los contadores han bajado: las asignaciones de las tareas borradas desaparecieron por la cascada de `TaskTags`. |
| `DELETE /api/tags/2` | `204`; una segunda vez, `404`. En la consola, un único `DELETE FROM "Tags"`. |

Mira el SQL de `complete-all` y `completed` en la consola: **una** sentencia `UPDATE` y **una** `DELETE`, sin ningún `SELECT` de tareas antes.
:::

:::troubleshooting Errores comunes
- **`Drop-Database` falla con `The process cannot access the file ... because it is being used by another process`:** la API (o tu visor de base de datos) tiene el archivo abierto. Ciérralos y repite.
- **`InvalidOperationException: Cannot resolve scoped service '...TaskTrackerDbContext' from root provider`:** pediste el contexto a `app.Services` directamente. Créalo dentro de `using var scope = app.Services.CreateScope();` con `scope.ServiceProvider`.
- **Los datos de ejemplo se duplican en cada arranque:** falta (o está mal) la comprobación `Any()` / `AnyAsync()` al principio de `Seed` y `SeedAsync`.
- **`Update-Database` crea las tablas pero no inserta los datos:** la base de datos no estaba vacía, o falta `.UseSeeding(...)` (la herramienta solo usa la versión síncrona; con `UseAsyncSeeding` sola no siembra).
- **`SQLite Error 19: 'UNIQUE constraint failed: Tags.Name'` al sembrar:** creaste dos objetos `Tag` con el mismo nombre en lugar de reutilizar la misma variable.
- **`CS1061: 'IQueryable<TaskItem>' does not contain a definition for 'ExecuteUpdateAsync'`:** falta `using Microsoft.EntityFrameworkCore;` (ya debería estar en `TaskEndpoints.cs`).
- **`complete-all` devuelve `affected: 0` aunque haya tareas pendientes:** comprueba el `Where`: debe ser `t.Status != TaskItemStatus.Done`, no `==`.
:::

:::recap
- Para cambiar **muchas** filas, `SaveChanges` carga y sigue cada entidad y genera una sentencia por fila. `ExecuteUpdateAsync` y `ExecuteDeleteAsync` generan **una** sentencia SQL, sin cargar nada.
- Las operaciones masivas se ejecutan en el acto, devuelven las filas afectadas y **no actualizan las entidades ya cargadas**. Las reglas de la base de datos (como `ON DELETE CASCADE`) sí se aplican.
- `POST .../complete-all` y `DELETE .../completed` devuelven `200` con `{ "affected": N }`.
- `ExecuteDeleteAsync` con un `Where` por clave borra una fila en un solo viaje, y el número devuelto distingue `204` de `404`.
- `UseSeeding` (síncrono, usado por `Update-Database`) y `UseAsyncSeeding` (usado por `MigrateAsync`) siembran datos después de migrar; la siembra debe ser **idempotente**.
- Un `AddRange` inserta todo el grafo de objetos siguiendo las navegaciones.
- En desarrollo, `MigrateAsync` al arrancar, dentro de un **scope creado a mano**; en producción, scripts o bundles como paso separado.

En el último paso mirarás con lupa el SQL que genera tu API, cerrarás la documentación con Scalar y repasarás todo el tutorial.
:::
