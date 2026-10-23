## Objetivo del paso

Tu API funciona con datos correctos. Pero ¿qué pasa con datos incorrectos? En el paso 6 configuraste `HasMaxLength(100)` para el nombre de un proyecto, y quizá pensaste que eso ya impedía nombres más largos. En este paso lo comprobarás (spoiler: no) y añadirás la validación de entrada que te faltaba. Vas a:

1. Demostrar que SQLite **no** aplica las longitudes máximas y que algunos errores llegan como `500`.
2. Entender la diferencia entre **validación de entrada** y **restricciones de la base de datos**.
3. Activar la validación de Minimal APIs con **`AddValidation()`** (novedad de .NET 10).
4. Añadir DataAnnotations a todos los contratos de entrada.
5. Documentar los errores posibles con **`ProducesValidationProblem()`** y **`ProducesProblem()`**.

## Primero, el problema

Ejecuta la API y envía estas tres peticiones. Puedes escribirlas en `TaskTracker.Api.http` (para la primera, pega un nombre de 150 caracteres; por ejemplo, 150 letras `A`):

| Petición | ¿Qué esperarías? | ¿Qué ocurre? |
| --- | --- | --- |
| `POST /api/projects` con un `name` de 150 caracteres | `400`: el máximo es 100. | **`201 Created`**. El nombre se guarda completo. |
| `POST /api/projects` con `{ "name": "" }` | `400`: un proyecto sin nombre no tiene sentido. | **`201 Created`**, con `"name": ""`. |
| `POST /api/projects` con `{}` | `400`: falta el nombre. | **`500`**, y en la consola: `SQLite Error 19: 'NOT NULL constraint failed: Projects.Name'`. |

Si consultas la tabla `Projects`, verás el nombre de 150 caracteres guardado tal cual. Y lo mismo pasa con títulos de tareas vacíos o etiquetas con espacios (`"has space"`).

:::concept Por qué HasMaxLength no te protegió
`HasMaxLength(100)` es **configuración del modelo**: describe la columna. Con proveedores como SQL Server, la migración crea una columna `nvarchar(100)` y es la base de datos quien rechaza un texto más largo. Pero **SQLite no tiene longitudes**: en tu migración la columna es simplemente `TEXT`, que admite cualquier tamaño. Y EF Core **no valida** las longitudes antes de guardar: confía en la base de datos.

Resultado: con SQLite, `HasMaxLength` documenta tu intención (y te servirá si algún día cambias de base de datos), pero no impide nada.
:::

La tercera petición muestra el otro lado: la base de datos **sí** aplica `NOT NULL`, pero **demasiado tarde**. El error llega como una excepción al guardar, y el cliente recibe un `500` genérico que no le dice qué hizo mal.

## Validación de entrada frente a restricciones de la base de datos

Son dos defensas distintas, y necesitas las dos:

| | Validación de entrada | Restricciones de la base de datos |
| --- | --- | --- |
| Dónde | En la API, **antes** de ejecutar el handler. | En la base de datos, al ejecutar el SQL. |
| Qué comprueba | Que la **petición** es correcta: obligatorios, longitudes, formatos, rangos. | Que los **datos guardados** son coherentes: `NOT NULL`, claves foráneas, índices únicos. |
| Si falla | `400` con un `ProblemDetails` que lista cada campo incorrecto. | Una excepción (`DbUpdateException`); sin tratarla, un `500`. |
| Para quién | Para el **cliente**: le explica qué corregir. | Para la **integridad**: la última barrera, aunque tu código tenga un error. |

La validación de entrada da buenos mensajes en el caso normal; las restricciones garantizan la integridad en todos los casos. Es la misma idea que viste en el paso 11 con el `409` de las etiquetas y su índice único.

## AddValidation: validación en Minimal APIs

En el tutorial 1, `[ApiController]` validaba las DataAnnotations automáticamente. Minimal APIs no tiene ese atributo y, hasta .NET 9, no validaba nada: había que hacerlo a mano o con bibliotecas externas.

:::concept AddValidation() en .NET 10
.NET 10 añade validación integrada para Minimal APIs. Se activa con **una línea**: `builder.Services.AddValidation()`. A partir de ahí:

- Antes de ejecutar cada handler, se validan sus parámetros con **DataAnnotations**: `[Required]`, `[StringLength]`, `[Range]`, `[RegularExpression]`... También los de tipos complejos, como tus `record` de petición, incluidos los atributos escritos sobre los parámetros del constructor del `record`.
- Si algo falla, el handler **no se ejecuta** y la respuesta es un `400` con un `ValidationProblemDetails`: el mismo formato `ProblemDetails`, con un diccionario `errors` campo por campo.
- El código de validación lo genera un **generador de código** (*source generator*) al compilar, a partir de los tipos que usan tus endpoints. No usa reflexión en tiempo de ejecución.
:::

Abre `Program.cs` y añade la línea justo debajo de `AddProblemDetails()`. La sección de servicios queda así:

```csharp title="Program.cs (sección Services)"
// --- Services ---
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
builder.Services.AddValidation();
```

Con eso la validación está activa, pero todavía no hay reglas. Las reglas van en los contratos.

## Las reglas, en los contratos

Las DataAnnotations se escriben delante de cada parámetro del `record`. Necesitas `using System.ComponentModel.DataAnnotations;` al principio de cada archivo.

:::vs Editar Contracts/ProjectContracts.cs
Abre `Contracts/ProjectContracts.cs` y reemplaza todo su contenido por el siguiente.
:::

```csharp title="Contracts/ProjectContracts.cs"
using System.ComponentModel.DataAnnotations;

namespace TaskTracker.Api.Contracts;

public record CreateProjectRequest(
    [Required, StringLength(100)] string Name,
    [StringLength(500)] string? Description = null);

public record UpdateProjectRequest(
    [Required, StringLength(100)] string Name,
    [StringLength(500)] string? Description);

public record ProjectResponse(
    int Id,
    string Name,
    string? Description,
    DateTime CreatedAt,
    int TaskCount,
    int CompletedTaskCount);
```

:::vs Editar Contracts/TaskContracts.cs
Abre `Contracts/TaskContracts.cs` y reemplaza todo su contenido por el siguiente. Solo cambian el `using` y las dos primeras peticiones.
:::

```csharp title="Contracts/TaskContracts.cs"
using System.ComponentModel.DataAnnotations;
using TaskTracker.Api.Entities;

namespace TaskTracker.Api.Contracts;

public record CreateTaskRequest(
    [Required, StringLength(200)] string Title,
    [StringLength(2000)] string? Description = null,
    TaskPriority Priority = TaskPriority.Medium,
    DateOnly? DueDate = null);

public record UpdateTaskRequest(
    [Required, StringLength(200)] string Title,
    [StringLength(2000)] string? Description,
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

:::vs Editar Contracts/TagContracts.cs
Abre `Contracts/TagContracts.cs` y reemplaza todo su contenido por el siguiente.
:::

```csharp title="Contracts/TagContracts.cs"
using System.ComponentModel.DataAnnotations;

namespace TaskTracker.Api.Contracts;

public record CreateTagRequest(
    [Required, StringLength(50), RegularExpression("^[a-zA-Z0-9-]+$",
        ErrorMessage = "Use only letters, numbers and hyphens.")] string Name);

public record TagResponse(int Id, string Name, int TaskCount);
```

Las decisiones detrás de cada regla:

| Regla | Por qué |
| --- | --- |
| `[Required]` en `Name` y `Title` | El tipo `string` (no anulable) es solo una anotación para el compilador: en tiempo de ejecución, si el JSON no trae la propiedad, llega `null`. `[Required]` rechaza `null`, la cadena vacía y la cadena que solo tiene espacios. |
| `[StringLength(100)]`, `(500)`, `(200)`, `(2000)`, `(50)` | Los **mismos** números que los `HasMaxLength` de las configuraciones. Ahora la regla se aplica de verdad, en la entrada. Si cambias uno, cambia el otro. |
| `[StringLength]` en `Description` (anulable) | La descripción es opcional: `null` es válido, pero si viene, no puede pasarse de largo. |
| `[RegularExpression("^[a-zA-Z0-9-]+$")]` | Una etiqueta es una palabra: letras, números y guiones (`front-end`, `v2`). Sin espacios ni símbolos. `ErrorMessage` sustituye el mensaje por defecto, que mostraría la expresión regular entera. |
| Enums sin atributos | `JsonStringEnumConverter` ya rechaza valores que no existen (paso 10), con un `400`. Y si `priority` no viene, se usa el valor por defecto `Medium`. |
| `AssignTagRequest` y `ChangeTaskStatusRequest` sin atributos | Un `tagId` que no existe se resuelve con un `404` en el handler; validar "que exista" es trabajo de la base de datos, no de una anotación. |
| `TaskListQuery` sin atributos | Todos sus filtros son opcionales, y los enums ya se validan al enlazarlos. |

:::why ¿Por qué validar los contratos y no las entidades?
Las DataAnnotations van en los **contratos de entrada** (`CreateProjectRequest`), no en las entidades (`Project`). La validación es una regla sobre **lo que acepta tu API**, y los contratos son exactamente eso. La entidad describe cómo se guardan los datos, y su configuración (`HasMaxLength`) ya está en `Data/Configurations`. Mezclar ambas cosas en la entidad la ataría a detalles de HTTP.
:::

## Documentar los errores en OpenAPI

La validación ya funciona. Pero el documento OpenAPI (`/openapi/v1.json`) no sabe que `POST /api/projects` puede devolver un `400`: el tipo de retorno del handler solo habla de `201`. Y en `POST /api/tags`, el `409` está escondido dentro de un `ProblemHttpResult` cuyo código solo se conoce al ejecutarlo.

:::concept Metadatos de respuesta
Igual que `WithName` o `WithTags`, hay métodos que añaden **metadatos** a un endpoint sin cambiar su comportamiento:

- **`.ProducesValidationProblem()`**: "este endpoint puede responder `400` con un `ValidationProblemDetails`".
- **`.ProducesProblem(StatusCodes.Status409Conflict)`**: "este endpoint puede responder `409` con un `ProblemDetails`".

Son el equivalente en Minimal APIs de `[ProducesResponseType]` del tutorial 1. Los `Results<...>` tipados ya documentan solos sus resultados (`201`, `404`...); estos métodos completan lo que el tipo no puede expresar.
:::

Añádelos a los endpoints que reciben un contrato con reglas. En `ProjectEndpoints.cs`, el método `MapProjectEndpoints` queda así:

```csharp title="Endpoints/ProjectEndpoints.cs (método MapProjectEndpoints completo)"
public static IEndpointRouteBuilder MapProjectEndpoints(this IEndpointRouteBuilder app)
{
    var group = app.MapGroup("/api/projects").WithTags("Projects");

    group.MapGet("/", GetAll);
    group.MapGet("/{id:int}", GetById).WithName(GetProjectByIdRoute);
    group.MapPost("/", Create).ProducesValidationProblem();
    group.MapPut("/{id:int}", Update).ProducesValidationProblem();
    group.MapDelete("/{id:int}", Delete);

    return app;
}
```

En `TaskEndpoints.cs`, cambian las líneas de `Create` y `Update`:

```csharp title="Endpoints/TaskEndpoints.cs (método MapTaskEndpoints completo)"
public static IEndpointRouteBuilder MapTaskEndpoints(this IEndpointRouteBuilder app)
{
    var projectTasks = app.MapGroup("/api/projects/{projectId:int}/tasks").WithTags("Tasks");

    projectTasks.MapGet("/", GetByProject);
    projectTasks.MapPost("/", Create).ProducesValidationProblem();

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

Y en `TagEndpoints.cs`, el `POST` documenta los dos errores:

```csharp title="Endpoints/TagEndpoints.cs (método MapTagEndpoints completo)"
public static IEndpointRouteBuilder MapTagEndpoints(this IEndpointRouteBuilder app)
{
    var group = app.MapGroup("/api/tags").WithTags("Tags");

    group.MapGet("/", GetAll);
    group.MapPost("/", Create)
        .ProducesValidationProblem()
        .ProducesProblem(StatusCodes.Status409Conflict);
    group.MapDelete("/{id:int}", Delete);

    return app;
}
```

Abre `/openapi/v1.json` en el navegador y busca `"/api/tags"`: el `post` lista ahora las respuestas `201`, `400` y `409`, las dos últimas con `application/problem+json`. Antes solo aparecía el `201`. En el paso 14 verás estos mismos datos en una interfaz interactiva.

:::checkpoint Validación funcionando
Reinicia la API y repite las peticiones del principio:

| Petición | Resultado esperado |
| --- | --- |
| `POST /api/projects` con un `name` de 150 caracteres | `400`, `errors` → `Name: ["The field Name must be a string with a maximum length of 100."]` |
| `POST /api/projects` con `{ "name": "" }` | `400`, `errors` → `Name: ["The Name field is required."]` |
| `POST /api/projects` con `{}` | `400` (ya no `500`), mismo error. |
| `PUT /api/projects/999` con `{ "name": "", "description": null }` | `400`, no `404`: la validación ocurre **antes** de ejecutar el handler. |
| `POST /api/projects/3/tasks` con `{ "title": "" }` | `400`, `errors` → `Title: ["The Title field is required."]` |
| `POST /api/tags` con `{ "name": "has space" }` | `400`, `errors` → `Name: ["Use only letters, numbers and hyphens."]` |
| `POST /api/tags` con `{ "name": "docs" }` | `201` |
| `POST /api/projects` con `{ "name": "Valid project" }` | `201`: los datos correctos siguen funcionando. |

Una respuesta de validación completa tiene esta forma:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "errors": {
    "Name": ["The Name field is required."]
  },
  "traceId": "00-7ecb835d3b1f8619a2ce8c69f82400c8-e868ed3b1ab77c20-00"
}
```

Observa que la clave es `Name`, con el nombre del parámetro en C#, aunque el JSON use `name`.
:::

:::tip Los datos que ya guardaste
La validación protege las peticiones **nuevas**. El proyecto de 150 caracteres y el de nombre vacío que creaste al principio siguen en la base de datos. Bórralos con `DELETE /api/projects/{id}` para dejar tus datos limpios.
:::

:::troubleshooting Errores comunes
- **Los datos inválidos se siguen aceptando:** falta `builder.Services.AddValidation();` en `Program.cs`, o la API no se reinició tras compilar.
- **`CS0246: The type or namespace name 'Required' could not be found` / `'StringLengthAttribute' could not be found`:** falta `using System.ComponentModel.DataAnnotations;` en el archivo de contratos.
- **`[Required]` no rechaza un campo que falta:** comprueba que el atributo está **dentro** de los paréntesis del `record`, delante del parámetro: `[Required, StringLength(100)] string Name`.
- **La etiqueta `front-end` se rechaza:** revisa la expresión regular; el guion debe ir al final de los corchetes (`[a-zA-Z0-9-]`) para que se interprete como un carácter y no como un rango.
- **El `409` no aparece en `/openapi/v1.json`:** falta `.ProducesProblem(StatusCodes.Status409Conflict)` en el `MapPost` de etiquetas, o la API no se reinició.
- **Un `500` con `NOT NULL constraint failed` sigue apareciendo:** hay un contrato sin `[Required]` en una propiedad obligatoria. Repasa los tres archivos de contratos.
:::

:::recap
- `HasMaxLength` describe la columna, pero **SQLite no aplica longitudes** y EF Core no valida antes de guardar.
- La base de datos aplica `NOT NULL`, claves foráneas e índices únicos, pero sus errores llegan como `500` si no los tratas.
- **Validación de entrada** (para el cliente, `400` claro) y **restricciones de la base de datos** (para la integridad) son defensas complementarias.
- En .NET 10, `builder.Services.AddValidation()` activa la validación de DataAnnotations en Minimal APIs, generada al compilar.
- Las reglas van en los **contratos de entrada**, con los mismos límites que la configuración del modelo.
- La validación se ejecuta **antes** del handler: datos inválidos dan `400` aunque el recurso no exista.
- `ProducesValidationProblem()` y `ProducesProblem(...)` documentan en OpenAPI los errores que el tipo de retorno no expresa.

En el siguiente paso aprenderás a modificar muchas filas con **una sola sentencia SQL** y a cargar datos de ejemplo automáticamente.
:::
