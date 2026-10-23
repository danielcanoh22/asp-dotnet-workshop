## Objetivo del paso

Al final del paso anterior tenías el mismo bloque de validación copiado en dos handlers, y todavía faltan las tareas y las etiquetas. En este paso escribirás la validación **una sola vez** y la aplicarás a cualquier endpoint con una línea. Vas a:

1. Ver por qué la validación manual en cada handler no escala.
2. Entender qué es un **endpoint filter** (`IEndpointFilter`).
3. Escribir un filtro genérico, **`ValidationFilter<T>`**, y una extensión **`WithValidation<T>()`**.
4. Registrar todos los validadores de una vez con **`AddValidatorsFromAssemblyContaining<Program>()`**.
5. Quitar `AddValidation()` y **todas** las DataAnnotations: FluentValidation será la única fuente de reglas.
6. Conocer el precio de esa decisión en el documento OpenAPI.

## Por qué la validación manual no escala

Cuenta lo que exige validar a mano cada endpoint que recibe un cuerpo:

| Coste | En Task Tracker |
| --- | --- |
| Un parámetro, cinco líneas y un tipo de retorno más **por handler** | `POST` y `PUT` de proyectos, `POST` y `PUT` de tareas, `POST` de etiquetas... |
| Olvidar un handler deja un agujero **silencioso** | Ya te pasó: el `PUT` de proyectos aceptó un nombre vacío. |
| El handler mezcla dos responsabilidades | "¿La petición está bien formada?" y "¿qué hago con ella?". |

Lo que quieres es lo que hacía `AddValidation()`: que la validación ocurra **antes** del handler, sin que el handler lo sepa.

## Endpoint filters

:::concept IEndpointFilter
Un **endpoint filter** es código que se ejecuta **alrededor** del handler de un endpoint concreto. Se parece a un middleware, con dos diferencias importantes:

| | Middleware | Endpoint filter |
| --- | --- | --- |
| Se aplica a | **Todas** las peticiones del pipeline. | Solo a los endpoints donde lo añades (`AddEndpointFilter`). |
| Cuándo se ejecuta | Antes de saber qué endpoint atenderá la petición, con la petición en bruto. | **Después** del binding: ve los argumentos ya convertidos (tu `CreateProjectRequest`, el `id`...). |

Un filtro implementa `IEndpointFilter` y su método `InvokeAsync(context, next)`:

- `context.Arguments` contiene los argumentos del handler, ya enlazados.
- `await next(context)` ejecuta el siguiente filtro o, si no hay más, el handler.
- Si **no** llamas a `next` y devuelves un resultado, el handler **no se ejecuta** y ese resultado es la respuesta. Es un **cortocircuito**.
:::

Con esas tres piezas, el filtro de validación se escribe solo: buscar el argumento de tipo `T`, validarlo y, si falla, cortocircuitar con un `ValidationProblem`.

## ValidationFilter&lt;T&gt;

:::vs Crear Validation/ValidationFilter.cs
Clic derecho sobre la carpeta `Validation` > **Add** > **New Item…** > **Code File**, nómbralo **`ValidationFilter.cs`** y pega el siguiente contenido.
:::

```csharp title="Validation/ValidationFilter.cs"
using FluentValidation;

namespace TaskTracker.Api.Validation;

// Runs the validator for T before the handler. If the request is invalid, the handler never runs.
public class ValidationFilter<T>(IValidator<T> validator) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var request = context.Arguments.OfType<T>().FirstOrDefault();
        if (request is null)
        {
            return await next(context);
        }

        var result = await validator.ValidateAsync(request, context.HttpContext.RequestAborted);
        if (!result.IsValid)
        {
            return TypedResults.ValidationProblem(result.ToDictionary());
        }

        return await next(context);
    }
}
```

Recorre el código:

- **`ValidationFilter<T>(IValidator<T> validator)`**: un constructor primario. El filtro lo crea el contenedor de DI, así que puede pedir el validador de `T` como cualquier servicio.
- **`context.Arguments.OfType<T>().FirstOrDefault()`**: busca entre los argumentos del handler el que es de tipo `T`. Así el filtro no necesita saber en qué posición está (en `Update` va después del `id`).
- **`if (request is null) return await next(context);`**: si no hay ningún argumento de ese tipo, no hay nada que validar y el filtro deja pasar la petición.
- **`context.HttpContext.RequestAborted`**: el mismo `CancellationToken` que reciben tus handlers, sacado del `HttpContext` (el filtro no tiene parámetros enlazados propios).
- **`return TypedResults.ValidationProblem(...)`**: el cortocircuito. El handler no se ejecuta y el cliente recibe el `400` de siempre.

Ahora, una extensión para aplicarlo con una línea y documentar a la vez el `400`:

:::vs Crear Validation/ValidationExtensions.cs
En la carpeta `Validation`, **Add** > **New Item…** > **Code File**, nómbralo **`ValidationExtensions.cs`** y pega el siguiente contenido.
:::

```csharp title="Validation/ValidationExtensions.cs"
namespace TaskTracker.Api.Validation;

public static class ValidationExtensions
{
    // Adds the filter and documents the 400 response in OpenAPI, in one call.
    public static RouteHandlerBuilder WithValidation<T>(this RouteHandlerBuilder builder) =>
        builder
            .AddEndpointFilter<ValidationFilter<T>>()
            .ProducesValidationProblem();
}
```

`AddEndpointFilter<ValidationFilter<T>>()` añade el filtro al endpoint, y `ProducesValidationProblem()` es el mismo metadato del tutorial 2 que documenta el `400` en OpenAPI. Como un endpoint validado siempre puede responder `400`, tiene sentido que vayan juntos: `.WithValidation<CreateProjectRequest>()` sustituye a `.ProducesValidationProblem()`.

## Todos los validadores, registrados de una vez

Con un `AddScoped` por validador, cada validador nuevo exige acordarse de registrarlo. El paquete `FluentValidation.DependencyInjectionExtensions` que instalaste en el paso 4 lo hace por ti.

:::concept AddValidatorsFromAssemblyContaining&lt;T&gt;
`builder.Services.AddValidatorsFromAssemblyContaining<Program>()` recorre el ensamblado que contiene `Program` (tu proyecto), encuentra cada clase que hereda de `AbstractValidator<X>` y la registra como `IValidator<X>`, con tiempo de vida **scoped** por defecto. Por defecto solo registra las clases **públicas**.

Es la misma idea que `ApplyConfigurationsFromAssembly` del tutorial 2: añades un archivo y queda incluido sin tocar `Program.cs`.
:::

:::why ¿Program? ¿Qué clase es esa?
Tu `Program.cs` usa *top-level statements*: no hay ninguna clase escrita. Pero el compilador genera una clase llamada `Program` para contenerlas, y puedes usarla como "una clase cualquiera de este proyecto". Solo sirve para indicar **qué ensamblado** se recorre.
:::

## Cambia Program.cs

Abre `Program.cs` y haz tres cambios en la parte de arriba:

1. Borra los `using TaskTracker.Api.Contracts;` y `using TaskTracker.Api.Validation;` (ya no hacen falta).
2. Borra `builder.Services.AddValidation();`. Ya no habrá DataAnnotations que validar.
3. Sustituye los dos `AddScoped` y su comentario por `AddValidatorsFromAssemblyContaining<Program>()`.

```csharp title="Program.cs (usings y sección Services)"
using System.Globalization;
using System.Text.Json.Serialization;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Scalar.AspNetCore;
using TaskTracker.Api.Data;
using TaskTracker.Api.Endpoints;

var builder = WebApplication.CreateBuilder(args);

// --- Services ---
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();

// Registers every AbstractValidator<T> in this project as IValidator<T>.
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

// FluentValidation translates its messages to the machine's culture. An API answers the same everywhere.
ValidatorOptions.Global.LanguageManager.Culture = CultureInfo.InvariantCulture;
```

El resto de `Program.cs` no cambia.

## Proyectos: handlers limpios

Los handlers de proyectos vuelven a ser exactamente los del tutorial 2: la validación ya no es asunto suyo.

:::vs Reemplazar Endpoints/ProjectEndpoints.cs
Abre `Endpoints/ProjectEndpoints.cs` y reemplaza todo su contenido por el siguiente. Así deshaces la validación manual de `Create` y también la de `Update`, si hiciste el reto del paso 4.
:::

```csharp title="Endpoints/ProjectEndpoints.cs"
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using TaskTracker.Api.Contracts;
using TaskTracker.Api.Data;
using TaskTracker.Api.Entities;
using TaskTracker.Api.Mappings;
using TaskTracker.Api.Validation;

namespace TaskTracker.Api.Endpoints;

public static class ProjectEndpoints
{
    private const string GetProjectByIdRoute = "GetProjectById";

    public static IEndpointRouteBuilder MapProjectEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/projects").WithTags("Projects");

        group.MapGet("/", GetAll);
        group.MapGet("/{id:int}", GetById).WithName(GetProjectByIdRoute);
        group.MapPost("/", Create).WithValidation<CreateProjectRequest>();
        group.MapPut("/{id:int}", Update).WithValidation<UpdateProjectRequest>();
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

        // The database cascades the delete to the project's tasks.
        db.Projects.Remove(project);
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.NoContent();
    }
}
```

Compara con el paso 4: `Create` y `Update` ya no reciben `IValidator<...>`, no tienen el bloque de validación y su tipo de retorno vuelve a ser el original. Toda la validación está en las dos líneas de `MapProjectEndpoints`.

## Tareas: adiós a las DataAnnotations

Ahora las tareas. Sus contratos pierden los atributos y el `IValidatableObject` del paso 3.

:::vs Reemplazar Contracts/TaskContracts.cs
Abre `Contracts/TaskContracts.cs` y reemplaza todo su contenido por el siguiente.
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

public record BulkOperationResponse(int Affected);
```

:::warning La regla de la fecha desaparece por un paso
Al borrar el `IValidatableObject`, la regla "una tarea nueva no puede nacer vencida" se va con él. Durante este paso, *Born overdue* volverá a responder `201`. No la copiamos todavía a FluentValidation porque necesita una pieza nueva, `TimeProvider`, que es el tema del paso 6. Allí vuelve, mejor que antes.
:::

Sus validadores, en un archivo nuevo:

:::vs Crear Validation/TaskValidators.cs
En la carpeta `Validation`, **Add** > **New Item…** > **Code File**, nómbralo **`TaskValidators.cs`** y pega el siguiente contenido.
:::

```csharp title="Validation/TaskValidators.cs"
using FluentValidation;
using TaskTracker.Api.Contracts;

namespace TaskTracker.Api.Validation;

public class CreateTaskRequestValidator : AbstractValidator<CreateTaskRequest>
{
    public CreateTaskRequestValidator()
    {
        RuleFor(x => x.Title).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Description).MaximumLength(2000);
    }
}

public class UpdateTaskRequestValidator : AbstractValidator<UpdateTaskRequest>
{
    public UpdateTaskRequestValidator()
    {
        RuleFor(x => x.Title).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Description).MaximumLength(2000);
    }
}
```

Y en los endpoints de tareas, `WithValidation` sustituye a `ProducesValidationProblem`:

:::vs Editar Endpoints/TaskEndpoints.cs
1. Abre `Endpoints/TaskEndpoints.cs` y añade `using TaskTracker.Api.Validation;` debajo de `using TaskTracker.Api.Mappings;`.
2. Reemplaza el método `MapTaskEndpoints` por el siguiente. Solo cambian las líneas del `MapPost("/", Create)` y del `MapPut`.
:::

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
    tasks.MapPut("/{id:int}", Update).WithValidation<UpdateTaskRequest>();
    tasks.MapPatch("/{id:int}/status", ChangeStatus);
    tasks.MapDelete("/{id:int}", Delete);
    tasks.MapPost("/{id:int}/tags", AssignTag);
    tasks.MapDelete("/{id:int}/tags/{tagId:int}", RemoveTag);

    return app;
}
```

## Etiquetas: tu turno

Queda `CreateTagRequest`. Ya has visto el patrón tres veces, así que es el reto de este paso. Hazlo antes de seguir: las etiquetas se quedan sin validación hasta que lo completes.

::::challenge Migra la validación de etiquetas a FluentValidation
1. Quita los atributos (y el `using` de DataAnnotations) de `Contracts/TagContracts.cs`.
2. Crea `Validation/TagValidators.cs` con un `CreateTagRequestValidator` que aplique las mismas reglas que tenía el atributo: obligatorio, como máximo 50 caracteres y solo letras, números y guiones, con el mensaje `Use only letters, numbers and hyphens.`.
3. Aplica `WithValidation<CreateTagRequest>()` al `POST` de etiquetas, sin perder el `ProducesProblem(StatusCodes.Status409Conflict)`.

| Petición | Resultado esperado |
| --- | --- |
| `POST /api/tags` con `{ "name": "not a valid tag!" }` | `400`, `errors` → `Name: ["Use only letters, numbers and hyphens."]` |
| `POST /api/tags` con `{ "name": "docs" }` | `201` |
| `POST /api/tags` con `{ "name": "backend" }` | `409`, como antes. |

:::hint
El patrón de la expresión regular es el mismo del tutorial 2: `^[a-zA-Z0-9-]+$`. El validador que lo comprueba es `Matches(...)`, y el mensaje se cambia con `.WithMessage(...)` justo después.
:::

:::hint
En `TagEndpoints.cs`, `.WithValidation<CreateTagRequest>()` ocupa el lugar exacto de `.ProducesValidationProblem()`. Y recuerda el `using TaskTracker.Api.Validation;`.
:::

:::solution
```csharp title="Contracts/TagContracts.cs"
namespace TaskTracker.Api.Contracts;

public record CreateTagRequest(string Name);

public record TagResponse(int Id, string Name, int TaskCount);
```

```csharp title="Validation/TagValidators.cs"
using FluentValidation;
using TaskTracker.Api.Contracts;

namespace TaskTracker.Api.Validation;

public class CreateTagRequestValidator : AbstractValidator<CreateTagRequest>
{
    public CreateTagRequestValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty()
            .MaximumLength(50)
            .Matches("^[a-zA-Z0-9-]+$")
            .WithMessage("Use only letters, numbers and hyphens.");
    }
}
```

En `Endpoints/TagEndpoints.cs`, añade `using TaskTracker.Api.Validation;` debajo de `using TaskTracker.Api.Entities;` y cambia `MapTagEndpoints`:

```csharp title="Endpoints/TagEndpoints.cs (método MapTagEndpoints completo)"
public static IEndpointRouteBuilder MapTagEndpoints(this IEndpointRouteBuilder app)
{
    var group = app.MapGroup("/api/tags").WithTags("Tags");

    group.MapGet("/", GetAll);
    group.MapPost("/", Create)
        .WithValidation<CreateTagRequest>()
        .ProducesProblem(StatusCodes.Status409Conflict);
    group.MapDelete("/{id:int}", Delete);

    return app;
}
```

`WithMessage` solo afecta al validador que tiene justo delante (`Matches`). Los mensajes de `NotEmpty` y `MaximumLength` siguen siendo los de FluentValidation.
:::
::::

Por último, la cabecera de la primera sección de `errors.http` ya no dice la verdad: abre `errors.http` y cambia `### --- 400: validation (DataAnnotations) ---` por:

```http title="errors.http (cabecera de la primera sección)"
### --- 400: validation (FluentValidation) ---
```

## El precio: lo que ve OpenAPI

Has ganado una sola fuente de reglas. ¿Has perdido algo? Conviene saberlo, porque es una pregunta típica en una revisión de código.

:::concept OpenAPI lee atributos, no validadores
El generador de OpenAPI de ASP.NET Core (`Microsoft.AspNetCore.OpenApi`) describe cada esquema a partir de los **tipos** y de algunos **atributos**: con `[StringLength(50)]` y `[RegularExpression(...)]` sobre una propiedad, el documento incluye `maxLength: 50` y `pattern`. Con esos datos, una herramienta como Scalar puede avisar de un error antes de enviar la petición, y un generador de clientes puede incluir las restricciones.

Las reglas de FluentValidation viven en otra clase y se ejecutan en tiempo de ejecución: el generador de OpenAPI **no las ve**. Al pasar de atributos a validadores, en general, **pierdes esos metadatos**. Existen paquetes de la comunidad que intentan traducir reglas de FluentValidation a OpenAPI; evalúalos si tu documento los necesita.
:::

En Task Tracker, en concreto, no pierdes nada, y es un buen ejemplo de por qué conviene comprobar en lugar de suponer. Los atributos del tutorial 2 estaban en los **parámetros del constructor** del `record` (`[StringLength(50)] string Name`), y el generador de OpenAPI solo lee los atributos de las **propiedades**. El esquema de `CreateTagRequest` en `/openapi/v1.json` nunca tuvo `maxLength` ni `pattern`, ni antes ni después de este paso:

```json
"CreateTagRequest": {
  "required": ["name"],
  "type": "object",
  "properties": {
    "name": { "type": "string" }
  }
}
```

Si hubieras escrito `[property: StringLength(50)]` (la sintaxis que aplica el atributo a la propiedad que genera el `record`), el esquema sí habría mostrado `maxLength` y `pattern`, y ese es el metadato que perderías ahora. Lo que **sí** se mantiene: `"required": ["name"]` sale del tipo (un parámetro sin valor por defecto) y no de los atributos, y la respuesta `400` sigue documentada gracias a `ProducesValidationProblem()` dentro de `WithValidation`.

:::checkpoint Un filtro para todos
Compila (sin errores ni advertencias), reinicia la API sobre una base de datos recién sembrada y comprueba:

| Petición | Resultado esperado |
| --- | --- |
| `POST /api/projects` con `{ "name": "" }` | `400`, `Name: ["'Name' must not be empty."]` |
| `PUT /api/projects/1` con `{ "name": "", "description": null }` | `400` (el agujero del paso 4 está cerrado, hicieras o no el reto). |
| `POST /api/projects/1/tasks` con `{ "title": "" }` | `400`, `Title: ["'Title' must not be empty."]` |
| `PUT /api/tasks/1` con una `description` de 2001 caracteres | `400`, `Description: ["The length of 'Description' must be 2000 characters or fewer. You entered 2001 characters."]` |
| `POST /api/tags` con `{ "name": "" }` | `400` con **dos** mensajes en `Name`: `'Name' must not be empty.` y `Use only letters, numbers and hyphens.` |
| `POST /api/tasks/1/tags` con `{ "tagId": 0 }` | `404`, igual que en el tutorial 2: este endpoint todavía no tiene validador. |

Después, ejecuta **en orden** todo `errors.http` sobre una base de datos recién sembrada. Los códigos deben ser: `400`, **`201`**, `400`, `400`, `400`, `404`, `204`, `409`. El `201` es *Born overdue*, como te avisamos.

Por último, abre `/openapi/v1.json` y busca `"/api/tags"`: su `post` sigue listando `201`, `400` y `409`.
:::

Fíjate en la etiqueta vacía: dos errores para un solo problema. El segundo no aporta nada: una cadena vacía no "usa caracteres incorrectos", simplemente no existe. Lo arreglarás en el paso 6 con `Cascade`.

:::troubleshooting Errores comunes
- **`500` con `Unable to resolve service for type 'FluentValidation.IValidator`1[TaskTracker.Api.Contracts.CreateTagRequest]' while attempting to activate 'TaskTracker.Api.Validation.ValidationFilter`1[...]'`:** añadiste `WithValidation<CreateTagRequest>()` pero no existe un validador para ese tipo. Completa el reto, o revisa que la clase del validador es `public` (`AddValidatorsFromAssemblyContaining` ignora las clases `internal`).
- **`CS1061: 'RouteHandlerBuilder' does not contain a definition for 'WithValidation'`:** falta `using TaskTracker.Api.Validation;` en ese archivo de endpoints.
- **`CS0246: The type or namespace name 'Required' could not be found`:** borraste el `using System.ComponentModel.DataAnnotations;` pero quedó algún atributo. Revisa los tres archivos de contratos.
- **Datos inválidos que se aceptan:** el endpoint no tiene `.WithValidation<...>()`, o la API no se reinició tras compilar. Con `AddValidation()` borrado, un endpoint sin el filtro no valida nada.
:::

:::recap
- Validar a mano en cada handler repite código y deja agujeros silenciosos.
- Un **endpoint filter** (`IEndpointFilter`) se ejecuta alrededor del handler de un endpoint, después del binding. Puede **cortocircuitar** devolviendo un resultado sin llamar a `next`.
- **`ValidationFilter<T>`** busca el argumento de tipo `T`, lo valida con `IValidator<T>` y responde `ValidationProblem` si falla. **`WithValidation<T>()`** lo añade y documenta el `400` en una línea.
- **`AddValidatorsFromAssemblyContaining<Program>()`** registra todos los validadores públicos del proyecto como `IValidator<T>` (*scoped*).
- `AddValidation()` y las DataAnnotations han desaparecido: FluentValidation es la **única fuente de reglas**.
- Precio: el generador de OpenAPI no ve las reglas de FluentValidation. En este proyecto no se pierde nada, porque los atributos estaban en los parámetros del `record`, pero en general perderías `maxLength` y `pattern`.

En el siguiente paso recuperarás la regla de la fecha con **`TimeProvider`**, compartirás reglas entre validadores y usarás `When`, `Must` y `Cascade`.
:::
