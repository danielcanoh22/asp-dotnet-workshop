## Objetivo del paso

Tienes una base de datos con la tabla `Projects` creada por tu primera migración, pero tus endpoints siguen leyendo y escribiendo en la lista en memoria del paso 4. En este paso los conectas a la base de datos de verdad y, por el camino, aprenderás cómo piensa EF Core cuando lee y cuando guarda. Vas a:

1. Entender el **DbContext** como "unidad de trabajo" de cada petición.
2. Aprender qué es el **seguimiento de cambios** (*change tracking*) y por qué `SaveChanges` sabe qué guardar.
3. Distinguir consultas de solo lectura (`AsNoTracking`) de consultas para modificar (`FindAsync`).
4. Entender la diferencia entre `Expression<Func<...>>` y `Func<...>`, y por qué importa para traducir a SQL.
5. Reescribir `ProjectEndpoints` con EF Core, `async` y `CancellationToken`, y borrar `InMemoryProjectStore`.
6. Descubrir un detalle de las fechas en SQLite (la `Z` que desaparece) y corregirlo con un **convertidor de valores**.

## Del almacén en memoria al DbContext

Hasta ahora `InMemoryProjectStore` era un *singleton*: una sola lista compartida por todas las peticiones, protegida con un `Lock`. `TaskTrackerDbContext` funciona de otra manera, y conviene tenerlo claro antes de tocar código.

:::concept El DbContext es una unidad de trabajo
En el paso 6 registraste el contexto con `AddDbContext`, que lo registra como **scoped**: el contenedor crea **un `TaskTrackerDbContext` nuevo por petición** y lo descarta al terminar. Durante esa petición el contexto:

- **Abre conexiones** a la base de datos cuando las necesita y las cierra después.
- **Traduce** tus consultas LINQ a SQL.
- **Recuerda** las entidades que ha cargado y los cambios que les haces.
- **Guarda** todos esos cambios de una vez cuando llamas a `SaveChangesAsync`.

A ese patrón ("acumula cambios y confírmalos juntos") se le llama **unidad de trabajo** (*unit of work*). Una petición = un contexto = una unidad de trabajo.
:::

:::why ¿Por qué scoped y no singleton, como el almacén?
Un `DbContext` **no es seguro para usarse desde varios hilos a la vez**, y además acumula entidades en memoria mientras vive. Si fuera *singleton*, todas las peticiones compartirían el mismo contexto: se pisarían entre ellas y la memoria crecería sin parar. Con un contexto por petición cada una tiene su propio espacio, y desaparece al terminar. Por eso tampoco necesitas un `Lock`: la base de datos se encarga de la concurrencia entre peticiones. Es la regla de tiempos de vida que viste en el tutorial 1, aplicada a EF Core.
:::

## Cómo lee EF Core: IQueryable y traducción a SQL

`db.Projects` es un `DbSet<Project>`, y un `DbSet` es un `IQueryable<Project>`. Cuando escribes:

```csharp
var projects = await db.Projects
    .OrderBy(p => p.Name)
    .ToListAsync(cancellationToken);
```

no estás ordenando una lista en memoria. Estás **describiendo una consulta**. EF Core lee esa descripción, genera el SQL equivalente y lo envía a SQLite en el momento en que pides los resultados (`ToListAsync`):

```sql
SELECT "p"."Id", "p"."Name", "p"."Description", "p"."CreatedAt"
FROM "Projects" AS "p"
ORDER BY "p"."Name"
```

Es la base de datos quien ordena, no tu código. Volverás sobre esta idea (la **ejecución diferida**) en el paso 10, cuando construyas consultas con filtros opcionales.

:::concept Async y CancellationToken
Igual que leer un archivo en el tutorial 1, consultar una base de datos es entrada/salida: por eso usamos las versiones asíncronas (`ToListAsync`, `FindAsync`, `SaveChangesAsync`) y los handlers pasan a devolver `Task<...>`.

Además, cada handler recibirá un **`CancellationToken`**. Minimal APIs lo rellena automáticamente con `HttpContext.RequestAborted`: un token que se **cancela si el cliente cierra la conexión** antes de recibir la respuesta. Si se lo pasas a EF Core, una consulta lenta cuyo resultado ya nadie va a leer se cancela en lugar de seguir ocupando la base de datos. No necesitas ningún atributo: basta con declarar el parámetro.
:::

## Cómo guarda EF Core: el seguimiento de cambios

Esta es la idea más importante del paso. Mira este fragmento del `Update` que vas a escribir:

```csharp
var project = await db.Projects.FindAsync([id], cancellationToken);
project.Name = request.Name;
project.Description = request.Description;
await db.SaveChangesAsync(cancellationToken);
```

No hay ninguna llamada del tipo `db.Update(project)`. ¿Cómo sabe EF Core que tiene que enviar un `UPDATE`?

:::concept Change tracking
Cuando el contexto carga una entidad, la **sigue** (*tracks*): guarda una copia de los valores originales y le asigna un **estado**. Al llamar a `SaveChangesAsync`, compara cada entidad seguida con su copia original y genera el SQL necesario.

| Estado | Cuándo lo tiene una entidad | Qué hace `SaveChanges` |
| --- | --- | --- |
| `Added` | La pasaste a `db.Projects.Add(...)`. | `INSERT` |
| `Unchanged` | La cargaste y no has cambiado nada. | Nada |
| `Modified` | La cargaste y cambiaste alguna propiedad. | `UPDATE` **solo de las columnas cambiadas** |
| `Deleted` | La pasaste a `db.Projects.Remove(...)`. | `DELETE` |
| `Detached` | El contexto no la sigue (por ejemplo, la creaste con `new` y no la añadiste). | Nada |

`SaveChangesAsync` envía todos los cambios pendientes en una **transacción**: o se guardan todos, o ninguno.
:::

Lo comprobarás en el checkpoint: si haces un `PUT` que solo cambia el nombre, el SQL generado actualiza únicamente la columna `Name`. Y si repites exactamente el mismo `PUT`, EF Core **no envía ningún `UPDATE`**, porque no hay nada distinto que guardar.

### Dos formas de leer: con y sin seguimiento

Seguir entidades cuesta memoria y tiempo (la copia de valores originales, la comparación). Si solo vas a **leer** para devolver datos, no lo necesitas.

| Operación | Método | ¿Sigue la entidad? | Úsalo cuando... |
| --- | --- | --- | --- |
| Listar o consultar para responder | `AsNoTracking()` + `Select(...)` | No | Solo vas a devolver datos (`GET`). |
| Buscar por clave para modificar o borrar | `FindAsync([id], ...)` | Sí | Vas a cambiar o eliminar la entidad (`PUT`, `DELETE`). |

:::concept FindAsync
`FindAsync` busca una entidad **por su clave primaria**. Primero mira si el contexto ya la está siguiendo (y entonces no consulta la base de datos); si no, ejecuta un `SELECT ... WHERE "Id" = @p` y empieza a seguirla. Devuelve `null` si no existe.

Recibe los valores de la clave como un array, porque una clave puede tener varias columnas. Por eso escribimos `FindAsync([id], cancellationToken)`: los corchetes son una **expresión de colección** de C# que crea el array `object[]` con un solo valor. Sin los corchetes, C# no sabría si `cancellationToken` es parte de la clave o el token de cancelación.
:::

## Expression frente a Func: por qué el mapeo cambia

En el paso 4 escribiste `ProjectMappings.ToResponse`, un método de extensión normal. Podrías usarlo en una consulta así:

```csharp
db.Projects.Select(p => p.ToResponse())
```

Funciona, pero EF Core **no puede ver qué hay dentro** de `ToResponse`: para él es una caja negra compilada. Lo único que puede hacer es traer la entidad completa a memoria y llamar al método allí. Hoy da igual, porque `ProjectResponse` usa las mismas columnas que la tabla; en el paso 9, cuando la respuesta incluya **cuántas tareas tiene el proyecto**, esa caja negra se convertiría en un problema serio.

:::concept `Expression<Func<T, TResult>>` frente a `Func<T, TResult>`
Una lambda de C# puede convertirse en dos cosas muy distintas, según el tipo de la variable que la recibe:

| Tipo | Qué es | Quién puede usarla |
| --- | --- | --- |
| `Func<Project, ProjectResponse>` | **Código compilado** (instrucciones IL). Solo se puede ejecutar. | Cualquier código .NET, sobre objetos en memoria. |
| `Expression<Func<Project, ProjectResponse>>` | Un **árbol de expresión**: la lambda descrita como **datos** ("crea un `ProjectResponse` con `Id`, `Name`..."). | EF Core, que lo recorre y lo **traduce a SQL**. |

`Select`, `Where` y `OrderBy` sobre un `IQueryable` reciben `Expression<...>`; por eso EF Core puede traducir `p => p.Name` a `"p"."Name"`. Un método como `ToResponse` es un `Func`: EF Core solo puede llamarlo, no leerlo.

Y un árbol de expresión se puede **compilar** a un `Func` con `.Compile()`. Así tienes lo mejor de los dos mundos: escribes el mapeo **una sola vez** como expresión, y obtienes también su versión ejecutable.
:::

Vamos a reescribir `ProjectMappings` con esa idea:

- `ToResponseExpression` es el mapeo como árbol de expresión. Lo usarás dentro de `Select(...)` en las consultas.
- `ToResponseFunc` es ese mismo árbol compilado **una vez** (es `static readonly`), porque compilar es caro.
- `ToResponse()` sigue existiendo para los objetos que ya están en memoria, como el proyecto recién creado en `Create`.

:::vs Reemplazar Mappings/ProjectMappings.cs
Abre `Mappings/ProjectMappings.cs` en Solution Explorer y reemplaza todo su contenido por el siguiente.
:::

```csharp title="Mappings/ProjectMappings.cs"
using System.Linq.Expressions;
using TaskTracker.Api.Contracts;
using TaskTracker.Api.Entities;

namespace TaskTracker.Api.Mappings;

public static class ProjectMappings
{
    // An expression tree: EF Core translates it to SQL inside Select(...).
    public static readonly Expression<Func<Project, ProjectResponse>> ToResponseExpression =
        project => new ProjectResponse(
            project.Id,
            project.Name,
            project.Description,
            project.CreatedAt);

    // The same mapping compiled once, for objects that are already in memory.
    private static readonly Func<Project, ProjectResponse> ToResponseFunc = ToResponseExpression.Compile();

    public static ProjectResponse ToResponse(this Project project) => ToResponseFunc(project);
}
```

:::tip Por qué la proyección es mejor que cargar la entidad
`Select(ProjectMappings.ToResponseExpression)` hace que el SQL pida **solo las columnas que necesita la respuesta**, y que EF Core construya directamente objetos `ProjectResponse`, sin crear ni seguir entidades `Project`. Es la forma más eficiente de leer para devolver datos. De hecho, una consulta que termina en `Select` hacia un DTO no sigue nada aunque no pongas `AsNoTracking()`; lo escribimos igualmente para dejar clara la intención: "esto es una lectura".
:::

## ProjectEndpoints con EF Core

Ahora el cambio grande. Cada handler cambia en tres cosas:

1. Recibe `TaskTrackerDbContext db` en lugar de `InMemoryProjectStore store` (Minimal APIs lo inyecta desde DI, como cualquier servicio).
2. Es `async` y devuelve `Task<...>`, y recibe un `CancellationToken`.
3. Usa el patrón de lectura o de escritura que corresponde.

Los tipos de retorno (`Ok<...>`, `Results<..., NotFound>`, `CreatedAtRoute<...>`) son los mismos del paso 4, ahora envueltos en `Task<...>`. Las rutas y `MapProjectEndpoints` no cambian.

:::vs Reemplazar Endpoints/ProjectEndpoints.cs
Abre `Endpoints/ProjectEndpoints.cs` y reemplaza todo su contenido por el siguiente.
:::

```csharp title="Endpoints/ProjectEndpoints.cs"
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using TaskTracker.Api.Contracts;
using TaskTracker.Api.Data;
using TaskTracker.Api.Entities;
using TaskTracker.Api.Mappings;

namespace TaskTracker.Api.Endpoints;

public static class ProjectEndpoints
{
    private const string GetProjectByIdRoute = "GetProjectById";

    public static IEndpointRouteBuilder MapProjectEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/projects").WithTags("Projects");

        group.MapGet("/", GetAll);
        group.MapGet("/{id:int}", GetById).WithName(GetProjectByIdRoute);
        group.MapPost("/", Create);
        group.MapPut("/{id:int}", Update);
        group.MapDelete("/{id:int}", Delete);

        return app;
    }

    private static async Task<Ok<List<ProjectResponse>>> GetAll(
        TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var projects = await db.Projects
            .AsNoTracking()
            .OrderBy(p => p.Name)
            .Select(ProjectMappings.ToResponseExpression)
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(projects);
    }

    private static async Task<Results<Ok<ProjectResponse>, NotFound>> GetById(
        int id, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var project = await db.Projects
            .AsNoTracking()
            .Where(p => p.Id == id)
            .Select(ProjectMappings.ToResponseExpression)
            .SingleOrDefaultAsync(cancellationToken);

        return project is null ? TypedResults.NotFound() : TypedResults.Ok(project);
    }

    private static async Task<CreatedAtRoute<ProjectResponse>> Create(
        CreateProjectRequest request, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var project = new Project
        {
            Name = request.Name,
            Description = request.Description,
            CreatedAt = DateTime.UtcNow,
        };

        db.Projects.Add(project);
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.CreatedAtRoute(project.ToResponse(), GetProjectByIdRoute, new { id = project.Id });
    }

    private static async Task<Results<NoContent, NotFound>> Update(
        int id, UpdateProjectRequest request, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var project = await db.Projects.FindAsync([id], cancellationToken);
        if (project is null)
        {
            return TypedResults.NotFound();
        }

        // The entity is tracked: SaveChanges detects what changed and sends an UPDATE.
        project.Name = request.Name;
        project.Description = request.Description;
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.NoContent();
    }

    private static async Task<Results<NoContent, NotFound>> Delete(
        int id, TaskTrackerDbContext db, CancellationToken cancellationToken)
    {
        var project = await db.Projects.FindAsync([id], cancellationToken);
        if (project is null)
        {
            return TypedResults.NotFound();
        }

        db.Projects.Remove(project);
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.NoContent();
    }
}
```

Recorre cada handler con la tabla de estados en la cabeza:

| Handler | Patrón | Qué ocurre en la base de datos |
| --- | --- | --- |
| `GetAll` | `AsNoTracking` + `OrderBy` + `Select` + `ToListAsync` | Un `SELECT ... ORDER BY "p"."Name"`. |
| `GetById` | `Where` + `Select` + `SingleOrDefaultAsync` | Un `SELECT ... WHERE "p"."Id" = @id LIMIT 2`. |
| `Create` | `Add` (estado `Added`) + `SaveChangesAsync` | Un `INSERT ... RETURNING "Id"`. |
| `Update` | `FindAsync` (estado `Unchanged`) → cambias propiedades (`Modified`) → `SaveChangesAsync` | Un `SELECT` y, si algo cambió, un `UPDATE`. |
| `Delete` | `FindAsync` → `Remove` (estado `Deleted`) → `SaveChangesAsync` | Un `SELECT` y un `DELETE`. |

Tres detalles que merecen una explicación:

- **¿De dónde sale `project.Id` en `Create`?** Antes del `SaveChangesAsync`, el `Id` vale `0`. EF Core envía el `INSERT` con `RETURNING "Id"`, recibe el identificador que generó SQLite y lo **escribe en tu objeto**. Por eso, justo después, `project.Id` ya tiene el valor correcto para la cabecera `Location`.
- **¿Por qué `SingleOrDefaultAsync` hace `LIMIT 2`?** `Single` significa "debe haber como mucho uno". Para poder detectar el error de que haya dos, EF Core pide dos filas. Como `Id` es la clave primaria, nunca habrá más de una.
- **`using Microsoft.EntityFrameworkCore;`** es imprescindible: los métodos `ToListAsync`, `SingleOrDefaultAsync` y `AsNoTracking` son métodos de extensión definidos en ese espacio de nombres.

## Adiós al almacén en memoria

`InMemoryProjectStore` ya no lo usa nadie. Bórralo, junto con su registro.

:::vs Eliminar InMemoryProjectStore
1. En Solution Explorer, haz clic derecho sobre `Data/InMemoryProjectStore.cs` > **Delete** y confirma con **OK**.
2. Abre `Program.cs` y borra la línea `builder.Services.AddSingleton<InMemoryProjectStore>();` y la línea en blanco que la sigue.
:::

Tu `Program.cs` queda así:

```csharp title="Program.cs"
using Microsoft.EntityFrameworkCore;
using TaskTracker.Api.Data;
using TaskTracker.Api.Endpoints;

var builder = WebApplication.CreateBuilder(args);

// --- Services ---
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();

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

app.Run();
```

Compila con <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd>. Debe terminar sin errores ni advertencias.

## Pruébalo y lee el SQL

Ejecuta la API (<kbd>Ctrl</kbd> + <kbd>F5</kbd>, perfil **http**) y deja visible la ventana de consola. Por defecto, EF Core escribe en el log **cada comando SQL** que envía, con la categoría `Microsoft.EntityFrameworkCore.Database.Command`. Es la mejor forma de aprender qué hace por debajo.

Usa las peticiones de `TaskTracker.Api.http` que ya tienes. Empieza por el `POST`:

```json
{
  "id": 1,
  "name": "Learn EF Core",
  "description": "Work through the Task Tracker tutorial.",
  "createdAt": "2026-10-20T19:20:41.8871359Z"
}
```

Y en la consola aparece algo así:

```
info: Microsoft.EntityFrameworkCore.Database.Command[20101]
      Executed DbCommand (4ms) [Parameters=[@p0='?' (DbType = DateTime), @p1='?' (Size = 39), @p2='?' (Size = 13)], CommandType='Text', CommandTimeout='30']
      INSERT INTO "Projects" ("CreatedAt", "Description", "Name")
      VALUES (@p0, @p1, @p2)
      RETURNING "Id";
```

Fíjate en que los valores aparecen como `'?'`: EF Core oculta los datos de los parámetros en el log por seguridad. En el paso 14 verás cómo mostrarlos en desarrollo.

Ahora lanza el `PUT` (cambia el nombre a `"Learn EF Core and Minimal APIs"`). El SQL es:

```sql
UPDATE "Projects" SET "Name" = @p0
WHERE "Id" = @p1
RETURNING 1;
```

Solo `Name`, porque la descripción que enviaste es la misma que ya había. **Lanza el mismo `PUT` otra vez**: verás el `SELECT` del `FindAsync`, pero ningún `UPDATE`. El seguimiento de cambios comparó valores y no encontró nada que guardar. Aun así la respuesta es `204`: el estado final es el que pediste, que es justo lo que promete un `PUT` idempotente.

## Un detalle de las fechas: ¿dónde está la Z?

Lanza ahora `GET /api/projects/1` y compara su `createdAt` con el de la respuesta del `POST`:

| Petición | `createdAt` |
| --- | --- |
| `POST /api/projects` | `"2026-10-20T19:20:41.8871359Z"` |
| `GET /api/projects/1` | `"2026-10-20T19:20:41.8871359"` |

Es el mismo instante, pero la `Z` final ha desaparecido. Esa `Z` significa "hora UTC" en el formato ISO 8601; sin ella, un cliente no sabe en qué zona horaria está la fecha y probablemente la interprete como **hora local**. Un cliente en Ciudad de México y otro en Madrid mostrarían horas distintas para el mismo proyecto.

:::concept DateTimeKind y SQLite
Un `DateTime` de .NET lleva una propiedad `Kind` con tres valores posibles: `Utc`, `Local` o `Unspecified`. Al serializar a JSON, `System.Text.Json` añade la `Z` solo si `Kind` es `Utc`.

- En `Create`, el objeto en memoria tiene `CreatedAt = DateTime.UtcNow`, así que `Kind = Utc` y la respuesta lleva `Z`.
- **SQLite no tiene un tipo de fecha**. EF Core guarda el `DateTime` como texto, `2026-10-20 19:20:41.8871359`, **sin zona horaria**. Al leerlo, no puede saber de qué zona era, y lo devuelve con `Kind = Unspecified`.

Otros proveedores tienen tipos con zona (por ejemplo, `datetimeoffset` en SQL Server), pero con SQLite tienes que decidir tú cómo interpretar lo que lees.
:::

Nuestra regla es sencilla: **siempre guardamos UTC** (`DateTime.UtcNow`). Así que todo lo que se lee de la base de datos se puede marcar como UTC sin miedo a equivocarse.

:::concept Convertidores de valores (value converters)
Un **convertidor de valores** transforma una propiedad al escribirla en la base de datos y al leerla de vuelta. Se define con dos funciones: "de .NET a base de datos" y "de base de datos a .NET". EF Core los aplica de forma transparente, también dentro de las consultas.
:::

Crea el convertidor:

:::vs Crear Data/UtcDateTimeConverter.cs
Clic derecho sobre la carpeta `Data` > **Add** > **Class…**, nómbrala **`UtcDateTimeConverter.cs`** y reemplaza todo su contenido por el siguiente.
:::

```csharp title="Data/UtcDateTimeConverter.cs"
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace TaskTracker.Api.Data;

// SQLite has no date type: a DateTime is stored as text and comes back with Kind = Unspecified.
// We always save UTC, so we mark the values read from the database as UTC again.
public class UtcDateTimeConverter() : ValueConverter<DateTime, DateTime>(
    toDatabase => toDatabase,
    fromDatabase => DateTime.SpecifyKind(fromDatabase, DateTimeKind.Utc));
```

- `ValueConverter<DateTime, DateTime>`: convierte de `DateTime` (en tu modelo) a `DateTime` (en la base de datos). El tipo no cambia; solo ajustamos el `Kind`.
- `toDatabase => toDatabase`: al guardar, no toca nada.
- `DateTime.SpecifyKind(..., DateTimeKind.Utc)`: al leer, devuelve el mismo instante marcado como UTC. No suma ni resta horas: solo cambia la etiqueta.
- La clase usa un **constructor primario** (`UtcDateTimeConverter()`) que pasa las dos lambdas al constructor de la clase base. Sus parámetros son `Expression<...>`: EF Core también necesita poder leerlos.

Ahora hay que decirle a EF Core que lo use. Podrías configurarlo propiedad por propiedad en cada `IEntityTypeConfiguration`, pero tendrás varias fechas (`CreatedAt` en proyectos y tareas, `CompletedAt` en tareas) y sería fácil olvidar alguna.

:::concept ConfigureConventions
`ConfigureConventions` es un método del `DbContext` que se ejecuta **antes** de `OnModelCreating` y define reglas para **todas las propiedades de un tipo**. Con `configurationBuilder.Properties<DateTime>().HaveConversion<UtcDateTimeConverter>()` dices: "toda propiedad `DateTime` del modelo, presente o futura, usa este convertidor". Se aplica también a `DateTime?`.
:::

:::vs Editar Data/TaskTrackerDbContext.cs
Abre `Data/TaskTrackerDbContext.cs` y reemplaza todo su contenido por el siguiente (el método nuevo es `ConfigureConventions`).
:::

```csharp title="Data/TaskTrackerDbContext.cs"
using Microsoft.EntityFrameworkCore;
using TaskTracker.Api.Entities;

namespace TaskTracker.Api.Data;

public class TaskTrackerDbContext(DbContextOptions<TaskTrackerDbContext> options) : DbContext(options)
{
    public DbSet<Project> Projects => Set<Project>();

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

:::why ¿No hace falta una migración?
Has cambiado el modelo de EF Core, así que la pregunta es razonable. Pero el convertidor **no cambia el esquema**: la columna sigue siendo `TEXT` y se guarda exactamente el mismo texto. El cambio solo afecta a cómo se interpreta el valor al leerlo, en memoria. Puedes comprobarlo tú: con la API detenida, ejecuta en la **Package Manager Console** (**Tools** > **NuGet Package Manager** > **Package Manager Console**):

```powershell
Add-Migration CheckUtc
```

La migración generada tiene los métodos `Up` y `Down` **vacíos**. Bórrala enseguida con:

```powershell
Remove-Migration
```

(Con la CLI: `dotnet ef migrations has-pending-model-changes`, que responde *No changes have been made to the model since the last migration*.)
:::

:::checkpoint Proyectos en la base de datos
Detén la API, compila y vuelve a ejecutarla. Comprueba:

| Petición | Resultado esperado |
| --- | --- |
| `GET /api/projects` | `200` con el proyecto que creaste **antes de reiniciar**: los datos ya no se pierden. `createdAt` termina en `Z`. |
| `GET /api/projects/1` | `200`, `createdAt` con `Z`. |
| `POST /api/projects` con `{ "name": "Read the SQL log" }` | `201`, cabecera `Location`, `"description": null` y `createdAt` con `Z`. |
| `PUT /api/projects/999` con un cuerpo válido | `404` con `ProblemDetails` (gracias a `UseStatusCodePages` del paso 4). |
| `DELETE /api/projects/1` | `204`. Una segunda vez: `404`. |

Después de borrar, crea otro proyecto y fíjate en su `id`: **no reutiliza** el número borrado. La columna `Id` se creó con `AUTOINCREMENT` en la migración del paso 7, y SQLite nunca vuelve a usar un valor. Es justo lo contrario de lo que pasaba con el archivo JSON del tutorial 1.

Abre la base de datos con la herramienta que usaste en el paso 7 y comprueba que la tabla `Projects` contiene las mismas filas que devuelve la API.
:::

:::troubleshooting Errores comunes
- **`CS0246: The type or namespace name 'InMemoryProjectStore' could not be found`:** borraste la clase pero queda su registro en `Program.cs` (o un handler que la recibe). Revisa los dos archivos.
- **`CS1061: 'IOrderedQueryable<Project>' does not contain a definition for 'ToListAsync'`:** falta `using Microsoft.EntityFrameworkCore;` en `ProjectEndpoints.cs`.
- **`SQLite Error 1: 'no such table: Projects'`:** la base de datos no tiene la migración aplicada, o la API está usando otro archivo. Ejecuta `Update-Database` y comprueba que la cadena de conexión de `appsettings.json` es `Data Source=tasktracker.db`. La ruta es relativa a la carpeta de trabajo de la aplicación; si la API arranca desde otra carpeta, SQLite crea allí un archivo nuevo y vacío.
- **`SQLite Error 5: 'database is locked'`:** otra aplicación (tu visor de base de datos) tiene una transacción abierta sobre el archivo. Ciérrala o confirma sus cambios.
- **`PUT` devuelve `204` pero el cambio no se guarda:** comprueba que llamas a `SaveChangesAsync` **después** de asignar las propiedades, y que obtuviste la entidad con `FindAsync` (con seguimiento) y no con una consulta `AsNoTracking`.
- **`createdAt` sigue sin `Z`:** el convertidor no está registrado. Revisa que `ConfigureConventions` lleva `override` y que la API se reinició tras compilar.
- **`CS0115: 'TaskTrackerDbContext.ConfigureConventions(...)': no suitable method found to override`:** el parámetro debe ser `ModelConfigurationBuilder`, no `ModelBuilder`.
:::

:::recap
- El `DbContext` es **scoped**: uno por petición, que funciona como **unidad de trabajo**. No es seguro entre hilos, así que nunca debe ser *singleton*.
- Las consultas LINQ sobre un `DbSet` se **traducen a SQL** y se ejecutan al pedir los resultados (`ToListAsync`, `SingleOrDefaultAsync`).
- El **seguimiento de cambios** asigna estados (`Added`, `Unchanged`, `Modified`, `Deleted`) y `SaveChangesAsync` genera solo el SQL necesario, en una transacción.
- Para leer y responder: `AsNoTracking()` + `Select(...)` a un DTO. Para modificar o borrar: `FindAsync([id], ...)`, cambiar y `SaveChangesAsync`.
- Un `Expression<Func<...>>` es código descrito como datos que EF Core puede traducir; un `Func<...>` es código compilado que solo puede ejecutar. `ToResponseExpression` sirve para las consultas y su versión compilada, para los objetos en memoria.
- `CancellationToken` en los handlers cancela el trabajo si el cliente se va.
- SQLite guarda las fechas como texto sin zona: `UtcDateTimeConverter` + `ConfigureConventions` las vuelve a marcar como UTC, sin migración.

En el siguiente paso tu modelo crece: los proyectos tendrán **tareas**, y aprenderás a modelar una relación uno a muchos.
:::
