## Objetivo del paso

Un gestor de proyectos sin tareas no sirve de mucho. En este paso modelas tu primera **relación**: un proyecto tiene muchas tareas y cada tarea pertenece a un proyecto. Todavía no habrá endpoints de tareas (llegan en el paso 10); aquí te concentras en el modelo, en cómo EF Core lo convierte en tablas y en cómo se leen datos relacionados. Vas a:

1. Entender las relaciones **uno a muchos**: clave foránea y propiedades de navegación.
2. Crear la entidad `TaskItem` (y entender por qué no se llama `Task`) y dos enums.
3. Configurar la relación con la Fluent API: conversión de enums, borrado en cascada e índice compuesto.
4. Generar y aplicar la migración `AddTasks`.
5. Añadir a `ProjectResponse` el número de tareas, calculado **dentro de la consulta**.
6. Entender la diferencia entre `Include` y proyección, y por qué EF Core no carga relaciones "solo".

## Relaciones uno a muchos

:::concept Clave foránea y navegaciones
En una base de datos relacional, la relación "un proyecto tiene muchas tareas" se guarda en el lado **muchos**: cada fila de `Tasks` tiene una columna `ProjectId` con el `Id` del proyecto al que pertenece. Esa columna es la **clave foránea** (*foreign key*, FK), y la base de datos garantiza que siempre apunte a un proyecto que existe.

En C# querrás algo más cómodo que un número: poder escribir `task.Project` o `project.Tasks`. Para eso EF Core usa **propiedades de navegación**:

| Propiedad | En la clase | Qué representa |
| --- | --- | --- |
| `int ProjectId` | `TaskItem` | La clave foránea: la columna real de la tabla. |
| `Project Project` | `TaskItem` | Navegación de **referencia**: el proyecto de esta tarea. |
| `List<TaskItem> Tasks` | `Project` | Navegación de **colección**: las tareas de este proyecto. |

Las navegaciones **no son columnas**. EF Core las rellena a partir de la clave foránea cuando se lo pides, como verás al final del paso.
:::

```
Projects                        Tasks
┌────┬──────────────┐           ┌────┬─────────────────────┬───────────┐
│ Id │ Name         │           │ Id │ Title               │ ProjectId │
├────┼──────────────┤     ┌────▶├────┼─────────────────────┼───────────┤
│  1 │ Website      │◀────┤     │  1 │ Design home page    │     1     │
│  2 │ Mobile app   │◀─┐  └─────│  2 │ Contact form API    │     1     │
└────┴──────────────┘  └────────│  3 │ Fix login crash     │     2     │
                                └────┴─────────────────────┴───────────┘
```

## Las entidades

### Dos enums: estado y prioridad

Una tarea tiene un **estado** (por hacer, en curso, hecha) y una **prioridad** (baja, media, alta). Son conjuntos cerrados de valores: el caso de uso perfecto para un `enum`.

:::vs Crear los enums
1. Clic derecho sobre la carpeta `Entities` > **Add** > **New Item…**. Busca la plantilla **Code File** (un archivo `.cs` vacío) y nómbralo **`TaskItemStatus.cs`**. Si prefieres usar **Class…**, borra la clase que genera la plantilla antes de pegar el código.
2. Repite con **`TaskPriority.cs`**.
3. Reemplaza el contenido de cada archivo por el siguiente.
:::

```csharp title="Entities/TaskItemStatus.cs"
namespace TaskTracker.Api.Entities;

public enum TaskItemStatus
{
    Todo,
    InProgress,
    Done,
}
```

```csharp title="Entities/TaskPriority.cs"
namespace TaskTracker.Api.Entities;

// Stored as an integer on purpose: Low < Medium < High, so ORDER BY works.
public enum TaskPriority
{
    Low,
    Medium,
    High,
}
```

Un enum de C# es, por debajo, un número: `Low = 0`, `Medium = 1`, `High = 2`. Por defecto EF Core lo guarda así, como entero. Para la prioridad es justo lo que queremos, porque el orden numérico coincide con el orden lógico. Para el estado haremos otra cosa, enseguida verás por qué. (La coma final tras el último valor es opcional; la usamos para que añadir un valor nuevo solo cambie una línea.)

### TaskItem: por qué no se llama Task

:::warning El nombre Task está ocupado
Lo natural sería llamar a la entidad `Task`. Pero `System.Threading.Tasks.Task` es el tipo que usas en **todos** tus handlers (`async Task<...>`), y los *implicit usings* del proyecto importan su espacio de nombres en todos los archivos. En cuanto un archivo usara a la vez `TaskTracker.Api.Entities` y `async Task`, el compilador fallaría con `CS0104: 'Task' is an ambiguous reference`. Se podría resolver con alias, pero es más limpio evitar el choque: la entidad se llama **`TaskItem`** y la tabla, `Tasks`.
:::

:::vs Crear Entities/TaskItem.cs
Clic derecho sobre `Entities` > **Add** > **Class…** > **`TaskItem.cs`**, y reemplaza todo su contenido por el siguiente.
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
}
```

| Propiedad | Detalle |
| --- | --- |
| `required string Title` | Obligatoria al crear el objeto (lo viste con `Project.Name`). Columna `NOT NULL`. |
| `string? Description` | Opcional: columna que admite `NULL`. |
| `Status` / `Priority` | Con valores por defecto: una tarea nueva está `Todo` y tiene prioridad `Medium`. |
| `DateOnly? DueDate` | Fecha límite **sin hora**. `DateOnly` (desde .NET 6) evita el problema de zonas horarias que viste con `DateTime`: un día es un día. EF Core lo guarda como texto `2026-12-01`. |
| `DateTime? CompletedAt` | Cuándo se completó. `null` mientras no esté hecha. Gracias a `ConfigureConventions` del paso 8, también se lee como UTC. |
| `int ProjectId` | La clave foránea. EF Core la reconoce por convención: nombre de la navegación (`Project`) + `Id`. |
| `Project Project = null!` | La navegación de referencia. |

:::concept ¿Qué significa null!?
`Project` no es anulable (toda tarea tiene proyecto), pero el compilador, con *nullable* activado, se queja de que la propiedad no se inicializa en el constructor (`CS8618`). `null!` le dice: "sé que ahora vale `null`; confía en mí, se rellenará antes de usarse". Es el patrón que recomienda la documentación de EF Core para navegaciones obligatorias. Úsalo con cuidado: si accedes a `task.Project` sin haberlo cargado, **obtendrás `null`** igualmente.
:::

### La otra mitad: Project.Tasks

:::vs Editar Entities/Project.cs
Abre `Entities/Project.cs` y reemplaza todo su contenido por el siguiente.
:::

```csharp title="Entities/Project.cs"
namespace TaskTracker.Api.Entities;

public class Project
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; }

    public List<TaskItem> Tasks { get; set; } = [];
}
```

La colección se inicializa vacía (`= []`) para que nunca sea `null`: puedes hacer `project.Tasks.Add(...)` sin comprobaciones.

## Configurar la relación

Con lo que tienes, EF Core ya podría deducir la relación por **convenciones**: ve `ProjectId`, ve las dos navegaciones y las empareja. Aun así vamos a escribir una configuración explícita, por tres motivos: dejar la relación **documentada** en un solo sitio, decidir cómo se guarda el estado y añadir un índice.

:::vs Crear Data/Configurations/TaskItemConfiguration.cs
Clic derecho sobre `Data/Configurations` > **Add** > **Class…** > **`TaskItemConfiguration.cs`**, y reemplaza todo su contenido por el siguiente.
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

        builder.HasOne(t => t.Project)
            .WithMany(p => p.Tasks)
            .HasForeignKey(t => t.ProjectId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(t => new { t.ProjectId, t.Status });
    }
}
```

No necesitas registrarla: `ApplyConfigurationsFromAssembly` del paso 6 encuentra todas las clases `IEntityTypeConfiguration<T>` del proyecto.

### Enum como texto o como número

:::concept `HasConversion<string>()`
`HasConversion<string>()` es un convertidor de valores ya incluido en EF Core: guarda el **nombre** del valor del enum (`"InProgress"`) en lugar de su número (`1`). Es el mismo mecanismo que usaste para las fechas en el paso 8, sin tener que escribir la clase.
:::

¿Por qué el estado como texto y la prioridad como número? Para que veas las dos opciones y sus consecuencias:

| | `Status` como texto | `Priority` como número |
| --- | --- | --- |
| Lo que ves en la tabla | `Done` | `2` |
| Si alguien reordena el enum en C# | Nada se rompe: el nombre sigue siendo el mismo. | **Los datos cambian de significado**: el `2` pasaría a ser otro valor. |
| Ordenar con `ORDER BY` | Alfabético (`Done` < `InProgress` < `Todo`), que no tiene sentido. | Numérico: `Low` < `Medium` < `High`. Justo lo que queremos. |
| Espacio | Algo más. | Mínimo. |

Para el estado nos importa más la legibilidad; para la prioridad, ordenar. `HasMaxLength(20)` deja sitio de sobra para el nombre más largo (`InProgress`).

### La relación y el borrado en cascada

`HasOne(...).WithMany(...).HasForeignKey(...)` se lee casi como una frase: "una tarea tiene **un** proyecto, que tiene **muchas** tareas, y la clave foránea es `ProjectId`".

:::concept DeleteBehavior.Cascade
¿Qué debe pasar con las tareas si borras su proyecto? Con `OnDelete(DeleteBehavior.Cascade)`, la migración crea la clave foránea con `ON DELETE CASCADE`: cuando se borra una fila de `Projects`, **la propia base de datos** borra las filas de `Tasks` que apuntan a ella. Las alternativas serían impedir el borrado mientras haya tareas (`Restrict`) o dejar la clave foránea a `NULL` (`SetNull`, solo posible si `ProjectId` fuera anulable).

`Cascade` es, de hecho, el valor por defecto de EF Core cuando la clave foránea es obligatoria. Lo escribimos para que la decisión quede a la vista.
:::

Eso tiene una consecuencia en tu `Delete` de proyectos: `FindAsync` carga **solo el proyecto**, no sus tareas, y EF Core envía un único `DELETE FROM "Projects"`. Las tareas desaparecen igualmente porque se encarga SQLite. Deja constancia en el código con un comentario:

```csharp title="Endpoints/ProjectEndpoints.cs (método Delete)"
private static async Task<Results<NoContent, NotFound>> Delete(
    int id, TaskTrackerDbContext db, CancellationToken cancellationToken)
{
    var project = await db.Projects.FindAsync([id], cancellationToken);
    if (project is null)
    {
        return TypedResults.NotFound();
    }

    // The database cascades the delete to the project's tasks.
    db.Projects.Remove(project);
    await db.SaveChangesAsync(cancellationToken);

    return TypedResults.NoContent();
}
```

### Un índice compuesto

`HasIndex(t => new { t.ProjectId, t.Status })` crea un **índice** sobre las dos columnas, en ese orden.

:::concept Índices
Un índice es una estructura auxiliar, como el índice alfabético de un libro, que permite a la base de datos encontrar filas **sin recorrer toda la tabla**. Acelera las lecturas que filtran u ordenan por esas columnas, a cambio de algo de espacio y de un poco más de trabajo en cada escritura.
:::

Elegimos estas columnas porque son las consultas que vas a hacer: "las tareas del proyecto 5" y "las tareas del proyecto 5 que están `Done`" (para contarlas, en un momento). Un índice compuesto sirve también para las búsquedas que usan **solo su primera columna**, así que este índice cubre además la clave foránea `ProjectId`: por eso EF Core no creará otro índice aparte para ella.

### El DbSet de tareas

:::vs Editar Data/TaskTrackerDbContext.cs
Abre `Data/TaskTrackerDbContext.cs` y añade la propiedad `Tasks` debajo de `Projects`. El archivo queda así:
:::

```csharp title="Data/TaskTrackerDbContext.cs"
using Microsoft.EntityFrameworkCore;
using TaskTracker.Api.Entities;

namespace TaskTracker.Api.Data;

public class TaskTrackerDbContext(DbContextOptions<TaskTrackerDbContext> options) : DbContext(options)
{
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<TaskItem> Tasks => Set<TaskItem>();

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

El nombre de la propiedad (`Tasks`) es el que EF Core usa para la tabla. Compila antes de seguir: <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd>.

## La migración AddTasks

Has cambiado el modelo, así que toca lo que aprendiste en el paso 7: generar una migración y aplicarla.

:::vs Crear y aplicar la migración
1. Detén la API si está en ejecución (la base de datos no debe estar en uso).
2. Abre **Tools** > **NuGet Package Manager** > **Package Manager Console**. Comprueba que **Default project** es `TaskTracker.Api`.
3. Ejecuta:

```powershell
Add-Migration AddTasks
```

4. Revisa el archivo generado en `Migrations` (abajo lo comentamos) y aplícalo:

```powershell
Update-Database
```
:::

Con la CLI, desde la carpeta del proyecto:

```powershell
dotnet ef migrations add AddTasks
dotnet ef database update
```

Este es el método `Up` que se genera (el nombre del archivo empieza por la fecha y hora en que lo creas, así que el tuyo será distinto):

```csharp title="Migrations/<fecha>_AddTasks.cs (método Up)"
protected override void Up(MigrationBuilder migrationBuilder)
{
    migrationBuilder.CreateTable(
        name: "Tasks",
        columns: table => new
        {
            Id = table.Column<int>(type: "INTEGER", nullable: false)
                .Annotation("Sqlite:Autoincrement", true),
            Title = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
            Description = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true),
            Status = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
            Priority = table.Column<int>(type: "INTEGER", nullable: false),
            DueDate = table.Column<DateOnly>(type: "TEXT", nullable: true),
            CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
            CompletedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
            ProjectId = table.Column<int>(type: "INTEGER", nullable: false)
        },
        constraints: table =>
        {
            table.PrimaryKey("PK_Tasks", x => x.Id);
            table.ForeignKey(
                name: "FK_Tasks_Projects_ProjectId",
                column: x => x.ProjectId,
                principalTable: "Projects",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        });

    migrationBuilder.CreateIndex(
        name: "IX_Tasks_ProjectId_Status",
        table: "Tasks",
        columns: new[] { "ProjectId", "Status" });
}
```

Reconoce cada decisión de la configuración: `Status` como `TEXT` de 20, `Priority` como `INTEGER`, la clave foránea con `ReferentialAction.Cascade` y el índice `IX_Tasks_ProjectId_Status`. Ninguna columna de `Projects` cambia: la relación vive entera en la tabla nueva. Y `Down` hace lo contrario, `DropTable("Tasks")`.

:::tip Una migración que solo añade
Esta migración solo **crea** una tabla, y eso SQLite lo soporta sin problemas. Recuerda del paso 7 que SQLite tiene limitaciones para **modificar** o **eliminar** columnas existentes; por eso el tutorial está diseñado para que todas sus migraciones sean aditivas.
:::

## El número de tareas en ProjectResponse

Ahora que un proyecto tiene tareas, sería útil que la respuesta dijera cuántas tiene y cuántas están hechas. Añade dos campos al final de `ProjectResponse`:

:::vs Editar Contracts/ProjectContracts.cs
Abre `Contracts/ProjectContracts.cs` y reemplaza todo su contenido por el siguiente.
:::

```csharp title="Contracts/ProjectContracts.cs"
namespace TaskTracker.Api.Contracts;

public record CreateProjectRequest(
    string Name,
    string? Description = null);

public record UpdateProjectRequest(
    string Name,
    string? Description);

public record ProjectResponse(
    int Id,
    string Name,
    string? Description,
    DateTime CreatedAt,
    int TaskCount,
    int CompletedTaskCount);
```

Y en el mapeo, rellénalos con las navegaciones:

:::vs Editar Mappings/ProjectMappings.cs
Abre `Mappings/ProjectMappings.cs` y reemplaza todo su contenido por el siguiente.
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
            project.CreatedAt,
            project.Tasks.Count,
            project.Tasks.Count(t => t.Status == TaskItemStatus.Done));

    // The same mapping compiled once, for objects that are already in memory.
    private static readonly Func<Project, ProjectResponse> ToResponseFunc = ToResponseExpression.Compile();

    public static ProjectResponse ToResponse(this Project project) => ToResponseFunc(project);
}
```

**No tienes que tocar los endpoints.** `GetAll` y `GetById` ya usan `ToResponseExpression`, y `Create` usa `ToResponse()` sobre un proyecto recién creado, cuya lista `Tasks` está vacía (0 y 0, correcto).

Ejecuta la API y llama a `GET /api/projects`. En la consola verás este SQL:

```sql
SELECT "p"."Id", "p"."Name", "p"."Description", "p"."CreatedAt", (
    SELECT COUNT(*)
    FROM "Tasks" AS "t"
    WHERE "p"."Id" = "t"."ProjectId"), (
    SELECT COUNT(*)
    FROM "Tasks" AS "t0"
    WHERE "p"."Id" = "t0"."ProjectId" AND "t0"."Status" = 'Done')
FROM "Projects" AS "p"
ORDER BY "p"."Name"
```

EF Core ha leído el árbol de expresión, ha visto `project.Tasks.Count` y lo ha convertido en una **subconsulta `COUNT(*)`**. La base de datos cuenta; a tu API solo llegan dos números por proyecto, nunca las tareas. Observa también `'Done'`: como `Status` se guarda como texto, EF Core compara con el nombre del enum.

:::warning Lo que habría pasado con un Func
En el paso 8 te avisamos de que `Select(p => p.ToResponse())` iba a dar problemas. Este es el momento. Con esa versión EF Core no puede ver dentro del método: ejecuta `SELECT "p"."Id", "p"."CreatedAt", "p"."Description", "p"."Name" FROM "Projects"`, crea objetos `Project` con la lista `Tasks` **vacía** (no la ha cargado) y llama al método en memoria. Resultado: `taskCount: 0` para todos los proyectos, **sin ningún error**. Es el peor tipo de fallo: datos incorrectos que parecen correctos. Por eso el mapeo de las consultas es un árbol de expresión.
:::

## Datos relacionados: Include frente a proyección

Acabas de ver que EF Core no cargó `project.Tasks` por su cuenta. Es deliberado.

:::concept No hay carga diferida (lazy loading) por defecto
Algunos ORM cargan las navegaciones **automáticamente** la primera vez que las tocas (*lazy loading*). Es cómodo, pero peligroso: recorrer 50 proyectos y leer `project.Tasks` en cada uno lanzaría **51 consultas** (una para los proyectos y otra por cada proyecto). A ese patrón se le llama **problema N+1** y es una de las causas más típicas de APIs lentas.

EF Core puede hacer *lazy loading*, pero solo si lo activas expresamente con un paquete adicional. Por defecto, una navegación que no pediste está **vacía** (colecciones) o es **`null`** (referencias). Tú decides qué se carga y cómo.
:::

Tienes dos formas de pedir datos relacionados:

| | `Include` | Proyección con `Select` |
| --- | --- | --- |
| Código | `db.Projects.Include(p => p.Tasks)` | `db.Projects.Select(p => new { ..., p.Tasks.Count })` |
| Qué trae | Las **entidades completas** relacionadas (todas sus columnas). | Solo los **valores** que pides, calculados en la base de datos si hace falta. |
| SQL | Un `JOIN` con la tabla relacionada. | Lo que necesites: columnas, subconsultas, agregados. |
| Seguimiento | Las entidades se siguen (salvo `AsNoTracking`). | No hay entidades que seguir. |
| Úsalo para | **Modificar** un agregado: cargar una tarea con sus etiquetas para añadirle una (paso 11). | **Leer y responder**: casi todos los `GET`. |

Para contar tareas, `Include` sería un desperdicio: traería todas las tareas de todos los proyectos a memoria solo para contarlas. La proyección le pide a la base de datos exactamente lo que la respuesta necesita. Esa será la regla del tutorial: **proyección para leer, `Include` solo cuando vas a modificar** la colección cargada.

:::checkpoint La relación en la base de datos
1. Abre la base de datos con la herramienta del paso 7 y comprueba:
   - Existe la tabla `Tasks`, con la clave foránea hacia `Projects` y el índice `IX_Tasks_ProjectId_Status`.
   - `__EFMigrationsHistory` tiene **dos** filas: `..._InitialCreate` y `..._AddTasks`.
2. Ejecuta la API y llama a `GET /api/projects`: cada proyecto incluye `"taskCount": 0` y `"completedTaskCount": 0`.
3. **Experimento opcional** (si tu herramienta permite ejecutar SQL): inserta dos tareas a mano en uno de tus proyectos. Cambia el `4` por el `id` de un proyecto que exista:

```sql
INSERT INTO Tasks (Title, Status, Priority, CreatedAt, ProjectId)
VALUES ('Read about migrations', 'Done', 1, '2026-10-20 19:30:00', 4),
       ('Try a relationship', 'Todo', 2, '2026-10-20 19:31:00', 4);
```

   `GET /api/projects` devuelve ahora `"taskCount": 2` y `"completedTaskCount": 1` para ese proyecto. Después haz `DELETE /api/projects/4` (con tu `id`): responde `204`, la consola muestra un único `DELETE FROM "Projects"` y, si consultas `Tasks`, las dos tareas han desaparecido. Es el `ON DELETE CASCADE` en acción.
:::

:::warning Las herramientas externas pueden no comprobar las claves foráneas
SQLite solo aplica las claves foráneas cuando están activadas para la conexión (`PRAGMA foreign_keys`). La biblioteca nativa de SQLite que trae EF Core las activa por defecto, pero otras herramientas no siempre lo hacen: si insertas una tarea con un `ProjectId` que no existe, puede que la herramienta la acepte. Usa siempre un `id` real.
:::

:::troubleshooting Errores comunes
- **`CS0104: 'Task' is an ambiguous reference`:** llamaste `Task` a la entidad. Renómbrala a `TaskItem` (y el archivo a `TaskItem.cs`).
- **`Add-Migration` genera una migración vacía:** EF Core no ve los cambios. Comprueba que añadiste `DbSet<TaskItem> Tasks` al contexto y que compilaste antes de ejecutar el comando.
- **`The term 'Add-Migration' is not recognized`:** falta el paquete `Microsoft.EntityFrameworkCore.Tools` (paso 5), o la consola no tiene seleccionado el proyecto correcto en **Default project**.
- **`Build failed.` al ejecutar `Add-Migration`:** las herramientas compilan el proyecto antes de trabajar. Corrige primero los errores de compilación (ventana **Error List**).
- **`SQLite Error 1: 'no such table: Tasks'` al hacer `GET /api/projects`:** generaste la migración pero no ejecutaste `Update-Database`.
- **`The process cannot access the file ... because it is being used by another process`:** la API sigue en ejecución mientras ejecutas un comando de migraciones. Detenla y repite.
- **`taskCount` siempre vale `0` aunque haya tareas:** revisa que `GetAll` y `GetById` usan `Select(ProjectMappings.ToResponseExpression)` y no `Select(p => p.ToResponse())`.
:::

:::recap
- Una relación **uno a muchos** se guarda con una **clave foránea** en el lado "muchos" (`Tasks.ProjectId`). Las **navegaciones** (`task.Project`, `project.Tasks`) son la vista cómoda en C#, no columnas.
- La entidad se llama `TaskItem` para no chocar con `System.Threading.Tasks.Task`.
- `HasConversion<string>()` guarda el estado como texto legible; la prioridad se queda como entero para poder ordenar.
- `OnDelete(DeleteBehavior.Cascade)` hace que **la base de datos** borre las tareas al borrar su proyecto.
- Un **índice compuesto** `(ProjectId, Status)` acelera las consultas por proyecto y estado, y cubre también la clave foránea.
- La migración `AddTasks` solo añade una tabla, algo que SQLite soporta sin problemas.
- `project.Tasks.Count` dentro de un árbol de expresión se traduce a una subconsulta `COUNT(*)`; dentro de un `Func`, devolvería `0` sin avisar.
- EF Core **no carga relaciones por su cuenta**: usa **proyección** para leer e **`Include`** cuando vayas a modificar la colección cargada.

En el siguiente paso crearás los endpoints de tareas y aprenderás a construir consultas con filtros y ordenación opcionales.
:::
