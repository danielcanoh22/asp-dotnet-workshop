## Objetivo del paso

Tu API está completa. En este último paso la miras desde fuera, como lo haría otra persona que tuviera que mantenerla o consumirla: qué SQL genera, por qué es eficiente y cómo se descubre sin leer el código. Después repasarás el tutorial entero. Vas a:

1. Leer el log de SQL con soltura y ver los valores de los parámetros en desarrollo con **`EnableSensitiveDataLogging`**.
2. Reconocer el **problema N+1** y por qué tu API no lo tiene.
3. Repasar cuándo usar `AsNoTracking` y qué hacen tus **índices**, comprobándolo con el plan de consulta de SQLite.
4. Añadir **Scalar** para tener documentación interactiva.
5. Dejar `Program.cs` y `TaskTracker.Api.http` en su versión final y recorrer lo aprendido.

## Leer el log de SQL

Desde el paso 8 tienes en la consola cada sentencia que EF Core envía a SQLite. Esta es la anatomía de una entrada:

```
info: Microsoft.EntityFrameworkCore.Database.Command[20101]
      Executed DbCommand (3ms) [Parameters=[@p0='?' (DbType = DateTime), @p1='?' (Size = 39), @p2='?' (Size = 13)], CommandType='Text', CommandTimeout='30']
      INSERT INTO "Projects" ("CreatedAt", "Description", "Name")
      VALUES (@p0, @p1, @p2)
      RETURNING "Id";
```

| Parte | Qué te dice |
| --- | --- |
| `Microsoft.EntityFrameworkCore.Database.Command` | La **categoría** del log. Es la que controla estos mensajes. |
| `[20101]` | El identificador del evento: "comando ejecutado". |
| `Executed DbCommand (3ms)` | Cuánto tardó la base de datos. La primera consulta de cada tipo suele tardar más (EF Core la traduce y la guarda en caché). |
| `Parameters=[...]` | Los parámetros de la sentencia: nombre, tipo y tamaño. **Los valores aparecen como `'?'`.** |
| El SQL | Exactamente lo que se ejecutó. |

Dos hábitos que conviene adquirir mientras desarrollas:

- **Cuenta las sentencias por petición.** Una petición sencilla debería generar una o dos. Si ves diez o cien, algo va mal (enseguida verás qué).
- **Mira las columnas del `SELECT`.** Si una lectura trae todas las columnas cuando la respuesta solo usa dos, te falta una proyección.

:::tip Silenciar el log de SQL
Cuando ya no lo necesites, puedes subir el nivel mínimo de esa categoría en `appsettings.Development.json`, por ejemplo `"Microsoft.EntityFrameworkCore.Database.Command": "Warning"` dentro de `LogLevel`. Es la configuración por categorías del tutorial 1. En este tutorial lo dejamos visible: es la mejor herramienta para aprender EF Core.
:::

### Ver los valores: EnableSensitiveDataLogging

Los `'?'` están ahí por una buena razón: los valores pueden contener datos personales, contraseñas o tokens, y los logs se guardan, se copian y se envían a otros sistemas. Pero mientras desarrollas, con datos de prueba, ver los valores ayuda mucho a depurar.

:::concept EnableSensitiveDataLogging
`EnableSensitiveDataLogging()` hace que EF Core incluya en los logs y en los mensajes de excepción los **valores** de los parámetros y de las claves de las entidades. Acepta un `bool`, así que puedes activarlo **solo en desarrollo** pasándole `builder.Environment.IsDevelopment()`.

Al arrancar, EF Core te recuerda que está activo con un aviso: `Sensitive data logging is enabled. Log entries and exception messages may include sensitive application data; this mode should only be enabled during development.`
:::

Lo añadirás a `Program.cs` en un momento, junto con Scalar. Con él activo, el mismo `INSERT` se ve así:

```
Executed DbCommand (3ms) [Parameters=[@p0='2026-10-20T19:47:34.3777027Z' (DbType = DateTime), @p1='Work through the Task Tracker tutorial.' (Size = 39), @p2='Learn EF Core' (Nullable = false) (Size = 13)], CommandType='Text', CommandTimeout='30']
```

:::warning Nunca en producción
Activarlo en producción significaría escribir datos de tus usuarios en los logs. Por eso no basta con "acordarse de quitarlo": la condición `IsDevelopment()` garantiza que en cualquier otro entorno esté desactivado.
:::

## El problema N+1

Ya lo mencionamos en el paso 9. Ahora que sabes leer el log, puedes reconocerlo. Imagina esta versión de `GetAll` de proyectos (**no la escribas**; es un ejemplo de lo que hay que evitar):

```csharp
var projects = await db.Projects.AsNoTracking().ToListAsync(cancellationToken);   // 1 query

var result = new List<ProjectResponse>();
foreach (var project in projects)
{
    // 1 extra query PER project
    var taskCount = await db.Tasks.CountAsync(t => t.ProjectId == project.Id, cancellationToken);
    result.Add(new ProjectResponse(project.Id, project.Name, project.Description,
        project.CreatedAt, taskCount, 0));
}
```

Con 2 proyectos, 3 consultas. Con 500 proyectos, **501**. Cada una es rápida, pero cada una es un viaje a la base de datos, y se acumulan. Es el patrón **N+1**: una consulta para la lista y una más por cada elemento.

:::concept Cómo lo evitas en este proyecto
| Técnica | Dónde la usas |
| --- | --- |
| **Proyección con subconsultas** | `ProjectMappings.ToResponseExpression`: los contadores de tareas se calculan con `COUNT(*)` dentro de **la misma** sentencia (paso 9). |
| **Proyección de colecciones** | `TaskMappings.ToResponseExpression`: las etiquetas de todas las tareas llegan en **una** sentencia con `LEFT JOIN` (paso 11). |
| **Sin lazy loading** | Ninguna navegación se carga "sola" al tocarla; si lo hiciera, cualquier bucle sobre `project.Tasks` sería un N+1 escondido (paso 9). |
| **`Include` solo para modificar** | `AssignTag` y `RemoveTag` cargan **una** tarea con sus etiquetas (paso 11). |
| **Operaciones masivas** | `complete-all` y `completed` cambian N filas con **una** sentencia (paso 13). |
:::

Haz la prueba: lanza `GET /api/projects/1/tasks` y cuenta las entradas `Executed DbCommand` en la consola. Son **dos**: el `SELECT EXISTS` que comprueba el proyecto y la consulta de tareas (con sus etiquetas incluidas). Da igual que el proyecto tenga 3 tareas o 3.000.

## AsNoTracking e índices, repasados

### Cuándo seguir y cuándo no

| Situación | Qué usas | Por qué |
| --- | --- | --- |
| Leer para devolver una respuesta | `AsNoTracking()` + `Select(...)` | No vas a modificar nada: el seguimiento solo gastaría memoria y tiempo. Con la proyección, ni siquiera se crean entidades. |
| Modificar o borrar **una** entidad | `FindAsync` / `Include` + `SaveChangesAsync` | El seguimiento de cambios detecta qué cambió y genera el SQL justo. |
| Modificar o borrar **muchas** filas | `ExecuteUpdateAsync` / `ExecuteDeleteAsync` | Una sentencia, sin cargar nada. |

### Tus índices

| Índice | Creado por | Lo aprovechan |
| --- | --- | --- |
| `PK_Projects`, `PK_Tasks`, `PK_Tags` | La clave primaria (`Id`) | `FindAsync`, `GetById`, cualquier `WHERE "Id" = @id`. |
| `IX_Tasks_ProjectId_Status` | `HasIndex(t => new { t.ProjectId, t.Status })` (paso 9) | El listado de tareas de un proyecto, el filtro por estado, los contadores y las operaciones masivas. |
| `IX_Tags_Name` (único) | `HasIndex(t => t.Name).IsUnique()` (paso 11) | La comprobación de duplicados al crear y el filtro `?tag=`. Además, impide nombres repetidos. |
| `PK_TaskTags` e `IX_TaskTags_TasksId` | La relación muchos a muchos (paso 11) | Buscar las etiquetas de una tarea y las tareas de una etiqueta. |

Puedes comprobar que SQLite los usa de verdad. Si tu herramienta del paso 7 permite ejecutar SQL, pide el **plan de consulta** anteponiendo `EXPLAIN QUERY PLAN`:

```sql
EXPLAIN QUERY PLAN SELECT * FROM Tasks WHERE ProjectId = 2 AND Status = 'Done';
-- SEARCH Tasks USING INDEX IX_Tasks_ProjectId_Status (ProjectId=? AND Status=?)

EXPLAIN QUERY PLAN SELECT * FROM Tasks WHERE ProjectId = 2;
-- SEARCH Tasks USING INDEX IX_Tasks_ProjectId_Status (ProjectId=?)

EXPLAIN QUERY PLAN SELECT * FROM Tasks WHERE Title = 'x';
-- SCAN Tasks
```

`SEARCH ... USING INDEX` significa que SQLite va directo a las filas a través del índice. Fíjate en la segunda: aunque solo filtras por `ProjectId`, usa el índice compuesto, porque es su primera columna. `SCAN` significa que recorre **toda** la tabla: no hay índice por `Title`. Con cinco tareas da igual; con un millón, sería la diferencia entre milisegundos y segundos. No añadas índices "por si acaso" (cada uno encarece las escrituras): añádelos para las consultas que de verdad haces.

## Documentación interactiva con Scalar

En el tutorial 1 instalaste **Scalar**, una interfaz web que lee el documento OpenAPI (`/openapi/v1.json`) y te deja probar la API desde el navegador. Tu documento ya tiene todo lo necesario: grupos con `WithTags`, nombres de ruta, resultados tipados y los errores de `ProducesValidationProblem` y `ProducesProblem`. Solo falta la interfaz.

:::vs Instalar Scalar.AspNetCore
1. En Solution Explorer, clic derecho sobre el proyecto `TaskTracker.Api` > **Manage NuGet Packages…**.
2. En la pestaña **Browse**, busca `Scalar.AspNetCore` y selecciónalo.
3. En **Version**, elige **`2.17.14`** (la versión con la que se verificó el tutorial; *Include prerelease* desmarcado) y pulsa **Install**. Acepta los cuadros de confirmación.
:::

Con la CLI, desde la carpeta del proyecto:

```powershell
dotnet add package Scalar.AspNetCore --version 2.17.14
```

Tu `TaskTracker.Api.csproj` queda así (las versiones `10.0.x` de los otros paquetes pueden variar ligeramente en el tuyo):

```markup title="TaskTracker.Api.csproj"
<Project Sdk="Microsoft.NET.Sdk.Web">

  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.AspNetCore.OpenApi" Version="10.0.12" />
    <PackageReference Include="Microsoft.EntityFrameworkCore.Sqlite" Version="10.0.13" />
    <PackageReference Include="Microsoft.EntityFrameworkCore.Tools" Version="10.0.13">
      <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
      <PrivateAssets>all</PrivateAssets>
    </PackageReference>
    <PackageReference Include="Scalar.AspNetCore" Version="2.17.14" />
  </ItemGroup>

</Project>
```

## Program.cs, versión final

Reemplaza todo el contenido de `Program.cs` por su versión final. Respecto al paso 13 hay tres líneas nuevas: `using Scalar.AspNetCore;`, `.EnableSensitiveDataLogging(...)` en la configuración del contexto y `app.MapScalarApiReference();` en el bloque de desarrollo.

```csharp title="Program.cs"
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Scalar.AspNetCore;
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
        .EnableSensitiveDataLogging(builder.Environment.IsDevelopment())
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
    app.MapScalarApiReference(); // UI at /scalar
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

Recórrelo de arriba abajo; cada línea tiene su paso:

| Líneas | Qué hacen | Paso |
| --- | --- | --- |
| `AddOpenApi()` | Genera el documento OpenAPI a partir de tus endpoints. | 2 |
| `AddProblemDetails()` | Los errores se escriben como `ProblemDetails`. | 4 |
| `AddValidation()` | Valida las DataAnnotations de los contratos antes de cada handler. | 12 |
| `ConfigureHttpJsonOptions(...)` | Enums como texto en JSON; números rechazados. | 10 |
| `AddDbContext<TaskTrackerDbContext>(...)` | Registra el contexto como **scoped**. | 6 |
| `.UseSqlite(...)` | Proveedor SQLite con la cadena de conexión de `appsettings.json`. | 5 y 6 |
| `.EnableSensitiveDataLogging(...)` | Valores de los parámetros en los logs, solo en desarrollo. | 14 |
| `.UseSeeding(...)` / `.UseAsyncSeeding(...)` | Datos de ejemplo tras migrar. | 13 |
| Bloque `IsDevelopment()` | Migraciones al arrancar (en un scope propio), documento OpenAPI y Scalar. | 2, 13 y 14 |
| `UseExceptionHandler(...)` | Excepciones → `ProblemDetails`; `BadHttpRequestException` conserva su `400`. | 4 y 10 |
| `UseStatusCodePages()` | Respuestas de error vacías (`404`) → `ProblemDetails`. | 4 |
| `UseHttpsRedirection()` | Redirige a HTTPS cuando hay puerto HTTPS. | 2 |
| `Map...Endpoints()` | Registra los tres grupos de rutas. | 4, 10 y 11 |

## El archivo .http final

Reemplaza todo el contenido de `TaskTracker.Api.http` por esta versión final, que recorre la API completa con los datos sembrados. Conserva **tu** puerto en la primera línea. Los `id` corresponden a una base de datos recién sembrada (recuerda `Drop-Database` + `Update-Database` del paso 13).

```http title="TaskTracker.Api.http"
@TaskTracker.Api_HostAddress = http://localhost:5283

### --- Projects ---

GET {{TaskTracker.Api_HostAddress}}/api/projects

###

GET {{TaskTracker.Api_HostAddress}}/api/projects/1

###

POST {{TaskTracker.Api_HostAddress}}/api/projects
Content-Type: application/json

{
  "name": "Learn EF Core",
  "description": "Work through the Task Tracker tutorial."
}

###

PUT {{TaskTracker.Api_HostAddress}}/api/projects/1
Content-Type: application/json

{
  "name": "Website redesign v2",
  "description": "Second iteration of the new website."
}

###

DELETE {{TaskTracker.Api_HostAddress}}/api/projects/2

### --- Tasks ---

GET {{TaskTracker.Api_HostAddress}}/api/projects/1/tasks

###

GET {{TaskTracker.Api_HostAddress}}/api/projects/1/tasks?status=Todo&sortBy=DueDate

###

GET {{TaskTracker.Api_HostAddress}}/api/projects/1/tasks?tag=frontend&sortBy=Priority

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

###

PUT {{TaskTracker.Api_HostAddress}}/api/tasks/1
Content-Type: application/json

{
  "title": "Design the new home page",
  "description": "Hero section, features and footer.",
  "priority": "High",
  "dueDate": "2026-11-15"
}

###

PATCH {{TaskTracker.Api_HostAddress}}/api/tasks/1/status
Content-Type: application/json

{
  "status": "Done"
}

###

DELETE {{TaskTracker.Api_HostAddress}}/api/tasks/2

### --- Bulk operations ---

POST {{TaskTracker.Api_HostAddress}}/api/projects/1/tasks/complete-all

###

DELETE {{TaskTracker.Api_HostAddress}}/api/projects/1/tasks/completed

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

###

DELETE {{TaskTracker.Api_HostAddress}}/api/tags/3

### --- Validation errors (expect 400) ---

POST {{TaskTracker.Api_HostAddress}}/api/projects
Content-Type: application/json

{
  "name": ""
}

###

GET {{TaskTracker.Api_HostAddress}}/api/projects/1/tasks?status=Unknown
```

:::checkpoint La API completa, documentada
1. Detén la API, ejecuta `Drop-Database` y `Update-Database` para partir de los datos sembrados, y arranca la API.
2. En la consola aparece el aviso `Sensitive data logging is enabled...`, y los `Executed DbCommand` muestran los valores de los parámetros en lugar de `'?'`.
3. Abre `http://localhost:5283/scalar` (con **tu** puerto). El navegador te lleva a `/scalar/` y verás tres grupos: **Projects**, **Tasks** y **Tags**. Los textos exactos de la interfaz pueden variar entre versiones de Scalar.
4. Abre `POST /api/tags`: aparecen las respuestas `201`, `400` y `409`. Prueba a crear `docs` dos veces desde Scalar y comprueba el `409`.
5. Ejecuta **en orden** todas las peticiones de `TaskTracker.Api.http`. Las respuestas que debes ver:

| Petición | Resultado |
| --- | --- |
| `GET /api/projects` | `200`, los dos proyectos sembrados (más el que crees después). |
| `POST /api/projects` | `201` con `Location`. |
| `PUT /api/projects/1` | `204` |
| `DELETE /api/projects/2` | `204` (y sus dos tareas desaparecen en cascada). |
| `GET .../tasks?status=Todo&sortBy=DueDate` | Solo *Design the new home page*. |
| `GET .../tasks?tag=frontend&sortBy=Priority` | *Design the new home page* (`High`) y *Choose the color palette* (`Low`). |
| `POST /api/projects/1/tasks` | `201`, `"status": "Todo"`, `"tags": []`. |
| `PUT /api/tasks/1`, `PATCH /api/tasks/1/status`, `DELETE /api/tasks/2` | `204` cada una. |
| `POST .../complete-all` | `200`, `{ "affected": 1 }` (solo queda pendiente la tarea que creaste). |
| `DELETE .../completed` | `200`, `{ "affected": 3 }`. |
| `POST /api/tags` (`docs`) | `201`. |
| `POST /api/tasks/1/tags` y `DELETE /api/tasks/1/tags/1` | `404` las dos: la tarea 1 se borró en `DELETE .../completed`. ¡El orden importa! Si quieres verlas responder `204`, lánzalas antes de las operaciones masivas. |
| `DELETE /api/tags/3` | `204` (la etiqueta `backend`). |
| Las dos peticiones de validación | `400` con `ProblemDetails`. |

Fuera de `Development`, `/scalar` y `/openapi/v1.json` no existen (`404`).
:::

:::troubleshooting Errores comunes
- **`CS0246: The type or namespace name 'Scalar' could not be found` / `'MapScalarApiReference' does not exist`:** el paquete no se instaló, o falta `using Scalar.AspNetCore;`.
- **`/scalar` devuelve `404`:** la API no se ejecuta en `Development`, o `MapScalarApiReference()` está fuera del bloque `IsDevelopment()`.
- **Scalar no muestra el `409` de etiquetas:** falta `.ProducesProblem(StatusCodes.Status409Conflict)` (paso 12). Compila y reinicia.
- **No aparecen los valores de los parámetros en el log:** comprueba `.EnableSensitiveDataLogging(builder.Environment.IsDevelopment())` y que el entorno es `Development`.
- **Las peticiones del `.http` dan `404` inesperados:** los `id` asumen una base de datos recién sembrada y la ejecución en orden. Repite `Drop-Database` + `Update-Database`.
- **`warn: ...HttpsRedirectionMiddleware[3] Failed to determine the https port for redirect.`:** inofensivo con el perfil `http`, como en el tutorial 1.
:::

## La estructura final

Tu proyecto debería coincidir con este árbol:

```
TaskTracker.Api/
├── Contracts/          ProjectContracts.cs, TagContracts.cs, TaskContracts.cs
├── Data/               DataSeeder.cs, TaskTrackerDbContext.cs, UtcDateTimeConverter.cs
│   └── Configurations/ ProjectConfiguration.cs, TagConfiguration.cs, TaskItemConfiguration.cs
├── Endpoints/          ProjectEndpoints.cs, TagEndpoints.cs, TaskEndpoints.cs
├── Entities/           Project.cs, Tag.cs, TaskItem.cs, TaskItemStatus.cs, TaskPriority.cs
├── Mappings/           ProjectMappings.cs, TaskMappings.cs
├── Migrations/         <fecha>_InitialCreate, <fecha>_AddTasks, <fecha>_AddTags (cada una con su .Designer.cs),
│                       TaskTrackerDbContextModelSnapshot.cs
├── Properties/         launchSettings.json
├── .gitignore          (excluye tasktracker.db)
├── appsettings.json, appsettings.Development.json
├── TaskTracker.Api.csproj, TaskTracker.Api.http
└── Program.cs
```

Fíjate en que no queda ni rastro de `InMemoryProjectStore`: lo sustituiste por EF Core en el paso 8 sin cambiar las rutas ni los contratos de la API.

## Repaso: el viaje de una petición

Así recorre tu API una petición `POST /api/projects/1/tasks` con un cuerpo válido:

| Fase | Quién | Qué ocurre |
| --- | --- | --- |
| 1 | **Pipeline** | `UseExceptionHandler`, `UseStatusCodePages` y `UseHttpsRedirection` dejan pasar la petición. |
| 2 | **Routing** | El grupo `/api/projects/{projectId:int}/tasks` y el `MapPost("/")` eligen el handler `Create`; `projectId = 1`. |
| 3 | **Binding** | `CreateTaskRequest` se lee del cuerpo JSON; `"priority": "High"` pasa a `TaskPriority.High` con `JsonStringEnumConverter`. `TaskTrackerDbContext` y `CancellationToken` se inyectan. |
| 4 | **Validación** | `AddValidation` comprueba `[Required]` y `[StringLength]`. Si algo falla: `400` y el handler no se ejecuta. |
| 5 | **Handler** | `AnyAsync` comprueba el proyecto (`SELECT EXISTS`); si no existe, `404`. |
| 6 | **Change tracking** | `db.Tasks.Add(task)` marca la tarea como `Added`. |
| 7 | **SaveChanges** | Un `INSERT ... RETURNING "Id"` en una transacción; el `Id` generado se escribe en el objeto. |
| 8 | **Respuesta** | `task.ToResponse()` (el mapeo compilado) y `CreatedAtRoute` → `201`, `Location: /api/tasks/{id}` y la tarea en JSON, con los enums como texto y `createdAt` con `Z`. |

## Lista de conceptos

Si alguno te suena borroso, vuelve al paso indicado:

| Concepto | Paso |
| --- | --- |
| Minimal APIs frente a controllers: qué cambia y qué se mantiene | 1 |
| Proyecto Web API sin controllers, `.slnx`, `.http` | 2 |
| `MapGet`/`MapPost`, fuentes de binding, `Results` frente a `TypedResults` | 3 |
| `MapGroup`, handlers con nombre, `Results<...>`, `CreatedAtRoute`, `ProblemDetails` | 4 |
| ORM, `DbContext`, `DbSet`, proveedores, SQLite, *code-first* | 5 |
| Configuración con Fluent API, convenciones, cadena de conexión, `AddDbContext` | 6 |
| Migraciones: `Add-Migration`, `Update-Database`, `__EFMigrationsHistory`, `Script-Migration` | 7 |
| Unidad de trabajo, seguimiento de cambios, `AsNoTracking`, `FindAsync`, `Expression` frente a `Func`, convertidores de valores | 8 |
| Relación uno a muchos, navegaciones, `HasConversion`, cascada, índices, `Include` frente a proyección | 9 |
| Anidamiento superficial, `[AsParameters]`, ejecución diferida, enums como texto, `ThrowOnBadRequest` | 10 |
| Muchos a muchos, tabla intermedia, índice único, `409 Conflict`, resolución de identidad | 11 |
| `AddValidation`, DataAnnotations en `record`, validación frente a restricciones, metadatos OpenAPI | 12 |
| `ExecuteUpdate`/`ExecuteDelete`, siembra con `UseSeeding`/`UseAsyncSeeding`, migrar al arrancar | 13 |
| Log de SQL, `EnableSensitiveDataLogging`, N+1, planes de consulta, Scalar | 14 |

## ¿Qué sigue?

Con los tutoriales 1 y 2 tienes los fundamentos de ASP.NET Core con los dos estilos de endpoints y una base de datos real. Los siguientes tutoriales del catálogo parten de aquí:

| Tutorial | De qué trata | Qué problema de esta API resuelve |
| --- | --- | --- |
| **3. Validación avanzada y manejo de errores** | Reglas de negocio, FluentValidation y respuestas consistentes. | Validaciones que no caben en una anotación y errores de base de datos (como el índice único de etiquetas) traducidos a respuestas claras en lugar de `500`. |
| **4. Clean Architecture en ASP.NET Core** | Capas, dependencias y casos de uso bien separados. | Hoy los handlers hablan directamente con el `DbContext` y contienen reglas de negocio (como la de `CompletedAt`). Verás cómo separar dominio, casos de uso e infraestructura. |
| **5. Testing: xUnit y WebApplicationFactory** | Pruebas unitarias y de integración para tu API. | Hasta ahora has probado a mano con el `.http`. Aprenderás a automatizar esas comprobaciones. |
| **6. Autenticación con JWT** | Protege tu API con tokens y políticas de autorización. | Cualquiera puede borrar cualquier proyecto. Añadirás usuarios y permisos. |
| **7. Paginación, caching y versionado** | Hazla escalable y evolutiva. | `GET .../tasks` devuelve **todas** las tareas; con miles, necesitarás páginas (y el orden determinista que preparaste en el paso 10). |

Antes de continuar, repite los retos que más te costaron sin mirar las pistas, y lee el SQL de cada endpoint en la consola: si puedes explicar por qué EF Core generó cada sentencia, dominas lo esencial de este tutorial.

:::recap
- El log de la categoría `Microsoft.EntityFrameworkCore.Database.Command` muestra cada sentencia SQL; `EnableSensitiveDataLogging(builder.Environment.IsDevelopment())` añade los valores, solo en desarrollo.
- **N+1** es una consulta por elemento de una lista. Lo evitas con proyecciones (subconsultas y colecciones en una sola sentencia), sin lazy loading y con operaciones masivas.
- `AsNoTracking` + proyección para leer; seguimiento para modificar una entidad; `ExecuteUpdate`/`ExecuteDelete` para muchas.
- Los índices aceleran las consultas que de verdad haces; `EXPLAIN QUERY PLAN` te dice si SQLite los usa (`SEARCH`) o recorre la tabla (`SCAN`).
- **Scalar** (`MapScalarApiReference()`, en `/scalar`) es la interfaz; `/openapi/v1.json` es la especificación. Ambos solo en `Development`.
- Has construido una API con Minimal APIs, EF Core y SQLite: tres entidades, dos tipos de relación, tres migraciones, validación, operaciones masivas, datos de ejemplo y documentación.

Has completado el tutorial **Task Tracker API**. Tu proyecto debería coincidir con la solución de referencia del repositorio. Márcalo como completado y continúa con el tutorial 3 cuando esté disponible.
:::
