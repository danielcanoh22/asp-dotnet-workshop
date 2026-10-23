## Objetivo del paso

En la auditoría del paso 2 encontraste una petición peligrosa: `DELETE /api/projects/1` borra el proyecto **y todas sus tareas**, también las que nadie ha terminado, sin una sola pregunta. Ningún validador puede evitarlo, porque la petición es perfecta: un `DELETE` con un `id` válido. Lo que falla es **el momento**: ese proyecto todavía tiene trabajo pendiente. En este paso escribirás tus primeras **reglas de negocio**. Vas a:

1. Distinguir la **validación** (mira solo la petición) de las **reglas de negocio** (miran el estado actual).
2. Decidir entre **`409 Conflict`** y **`422 Unprocessable Content`**, y entender por qué elegimos `409`.
3. Impedir el borrado de un proyecto con tareas abiertas, salvo que el cliente lo confirme con **`?force=true`**.
4. Limitar a **cinco** las etiquetas de una tarea (será tu reto).
5. Entender por qué un fallo esperado se devuelve como **resultado explícito** y no como excepción.
6. Actualizar `TaskTracker.Api.http` y `errors.http`.

## Validación frente a reglas de negocio

En los pasos 4 a 6 escribiste validadores. Todos tienen algo en común: deciden mirando **solo la petición**. Un nombre vacío es inválido hoy, mañana y en cualquier base de datos.

:::concept Dos preguntas distintas
| | Validación | Regla de negocio |
| --- | --- | --- |
| Pregunta | ¿Está bien formada esta petición? | ¿Se puede hacer esto **ahora**? |
| Necesita | Solo la petición (y, como mucho, servicios sin estado como `TimeProvider`) | El **estado actual** de los datos: consultas a la base de datos |
| Dónde vive | Un validador, antes del handler | El handler, que ya tiene el `DbContext` y ya cargó lo que necesita |
| Si falla | `400` con `errors` campo por campo | `409` con un `code` del catálogo |
| ¿Puede cambiar la respuesta si repito la petición más tarde? | No | **Sí**: si cambia el estado, la misma petición puede funcionar |

La última fila es la clave. "No puedes borrar este proyecto porque tiene dos tareas abiertas" deja de ser verdad en cuanto las completas. Es exactamente lo que el paso 6 adelantaba: las comprobaciones que dependen de la base de datos pertenecen al handler.
:::

## 409 o 422: el debate

Antes de escribir código, una decisión de diseño que encontrarás en cualquier equipo: ¿qué código de estado devuelve una regla de negocio incumplida?

:::concept Los dos candidatos
- **`409 Conflict`** (RFC 9110, sección 15.5.10): la petición **choca con el estado actual** del recurso. El ejemplo clásico es el que ya usas: crear una etiqueta que ya existe.
- **`422 Unprocessable Content`** (RFC 9110, sección 15.5.21): el servidor entiende el tipo de contenido y la sintaxis es correcta, pero **no puede procesar** las instrucciones que contiene.

Las dos definiciones son lo bastante amplias como para que ambas encajen, y por eso hay APIs conocidas que usan `422` para los errores de validación, otras para las reglas de negocio y otras que no lo usan nunca.
:::

:::why ¿Por qué elegimos 409?
Aplicamos la última fila de la tabla anterior: **si la misma petición podría funcionar más tarde cuando cambie el estado, es un `409`**. Borrar un proyecto con tareas abiertas, asignar una sexta etiqueta, guardar sobre una versión antigua (paso 11)... todos dependen del estado y todos se resuelven cambiándolo. Además:

- Mantiene el `400` para la validación, que es lo que ASP.NET Core hace por defecto con `ValidationProblem`.
- Agrupa bajo un mismo código todo lo que el cliente resuelve **actualizando su información** (recargar, completar tareas, quitar una etiqueta).

Un equipo que use `422` para las reglas de negocio no está equivocado. Lo que sí sería un error es mezclar los dos para casos parecidos: elige uno, documéntalo y aplícalo siempre.
:::

## Los errores del catálogo

Este paso necesita dos errores nuevos. Añádelos a `Errors/ApiProblems.cs` entre `TagAlreadyExists` y el método privado `Conflict`. El archivo completo queda así:

```csharp title="Errors/ApiProblems.cs"
using Microsoft.AspNetCore.Http.HttpResults;

namespace TaskTracker.Api.Errors;

// Every business error the API can return, in one place: same shape and a stable "code" for clients.
public static class ApiProblems
{
    public static ProblemHttpResult TagAlreadyExists(string name) =>
        Conflict(
            "tag.already_exists",
            "Tag already exists",
            $"A tag named '{name}' already exists.");

    public static ProblemHttpResult ProjectHasOpenTasks(int openTasks) =>
        Conflict(
            "project.has_open_tasks",
            "Project has open tasks",
            $"The project has {openTasks} open task(s). Complete them first or repeat the request with ?force=true.");

    public static ProblemHttpResult TagLimitReached(int maxTags) =>
        Conflict(
            "task.tag_limit_reached",
            "Tag limit reached",
            $"A task can have at most {maxTags} tags.");

    private static ProblemHttpResult Conflict(string code, string title, string detail) =>
        TypedResults.Problem(
            statusCode: StatusCodes.Status409Conflict,
            title: title,
            detail: detail,
            extensions: new Dictionary<string, object?> { ["code"] = code });
}
```

Fíjate en el `detail` de `ProjectHasOpenTasks`: no se limita a decir qué falla, también dice **cómo salir** del problema. Un buen mensaje de error de negocio siempre lo intenta.

## Regla 1: un proyecto con tareas abiertas no se borra

La regla, tal como la formularía alguien de negocio: *"Borrar un proyecto borra sus tareas. Si alguna está sin terminar, pide confirmación antes."*

En una API no hay ventanas de confirmación, así que la confirmación viaja en la petición: **`DELETE /api/projects/1?force=true`**.

:::concept Un parámetro de query opcional
En Minimal APIs, un parámetro de tipo simple (`int`, `bool`, `string`...) que **no** aparece en la plantilla de la ruta se lee de la *query string* con su mismo nombre. Si es **anulable** (`bool?`), es opcional: si el cliente no lo envía, llega `null`. Si fuera `bool` sin valor por defecto, sería obligatorio, y un `DELETE` sin `?force=...` devolvería `400`.

Con `bool? force` hay tres casos: `null` (no lo envió), `false` y `true`. La condición **`force is not true`** agrupa los dos primeros: solo un `true` explícito se salta la regla.
:::

En `Endpoints/ProjectEndpoints.cs`, añade el `using` del catálogo junto a los demás:

```csharp title="Endpoints/ProjectEndpoints.cs (using nuevo, tras TaskTracker.Api.Entities)"
using TaskTracker.Api.Errors;
```

Declara el nuevo `409` en OpenAPI, como acordaste en el paso anterior. El método `MapProjectEndpoints` queda así:

```csharp title="Endpoints/ProjectEndpoints.cs (método MapProjectEndpoints completo)"
public static IEndpointRouteBuilder MapProjectEndpoints(this IEndpointRouteBuilder app)
{
    var group = app.MapGroup("/api/projects").WithTags("Projects");

    group.MapGet("/", GetAll);
    group.MapGet("/{id:int}", GetById).WithName(GetProjectByIdRoute);
    group.MapPost("/", Create).WithValidation<CreateProjectRequest>();
    group.MapPut("/{id:int}", Update).WithValidation<UpdateProjectRequest>();
    group.MapDelete("/{id:int}", Delete).ProducesProblem(StatusCodes.Status409Conflict);

    return app;
}
```

Y reemplaza el método `Delete` por este:

```csharp title="Endpoints/ProjectEndpoints.cs (método Delete)"
// DELETE /api/projects/1?force=true deletes the project even if it has open tasks.
private static async Task<Results<NoContent, NotFound, ProblemHttpResult>> Delete(
    int id, bool? force, TaskTrackerDbContext db, CancellationToken cancellationToken)
{
    var project = await db.Projects.FindAsync([id], cancellationToken);
    if (project is null)
    {
        return TypedResults.NotFound();
    }

    if (force is not true)
    {
        var openTasks = await db.Tasks
            .CountAsync(t => t.ProjectId == id && t.Status != TaskItemStatus.Done, cancellationToken);
        if (openTasks > 0)
        {
            return ApiProblems.ProjectHasOpenTasks(openTasks);
        }
    }

    // The database cascades the delete to the project's tasks.
    db.Projects.Remove(project);
    await db.SaveChangesAsync(cancellationToken);

    return TypedResults.NoContent();
}
```

Lo que cambia y por qué:

- **`Results<NoContent, NotFound, ProblemHttpResult>`**: el handler puede terminar de una tercera forma, y el tipo de retorno lo dice. Si olvidas añadir `ProblemHttpResult`, el compilador no te deja devolver `ApiProblems.ProjectHasOpenTasks(...)`.
- **Primero el `404`, después el `409`.** Si el proyecto no existe, no tiene sentido hablar de sus tareas. El orden de las comprobaciones es parte del contrato.
- **`CountAsync` y no `AnyAsync`.** Los dos generan una sola consulta, pero el número hace el mensaje más útil: *"The project has 2 open task(s)"*.
- **Con `force=true` no se cuenta nada.** El cliente ya ha confirmado; ahorramos una consulta.
- **La cascada sigue en la base de datos**, como en el tutorial 2: con `force=true`, las tareas desaparecen con el proyecto.

:::warning La comprobación y el borrado no son atómicos
Entre el `CountAsync` y el `SaveChangesAsync` pasan unos milisegundos. Si justo en ese instante alguien crea una tarea en el proyecto, el borrado se la llevará por delante. Para esta regla el riesgo es aceptable: la regla protege contra un descuido, no contra un ataque. Cuando una carrera así sí importa, la protección tiene que estar en la base de datos (paso 10) o en la propia escritura (paso 11).
:::

## Regla 2: como mucho cinco etiquetas por tarea

La segunda regla: *"Una tarea puede tener como máximo cinco etiquetas"*. Más que eso deja de ser una clasificación y se convierte en ruido.

El límite es un dato del dominio, así que vive en la entidad. Abre `Entities/TaskItem.cs` y añade la constante al principio de la clase:

```csharp title="Entities/TaskItem.cs (constante nueva, al principio de la clase)"
public class TaskItem
{
    public const int MaxTags = 5;

    public int Id { get; set; }
```

Una constante y no un número suelto en el handler: así el `5` aparece en un único sitio, y el mensaje de error lo lee de ahí. Y ya tienes `ApiProblems.TagLimitReached`. Te falta usarlo.

::::challenge Aplica el límite de etiquetas en POST /api/tasks/{id}/tags
**Especificación:**

| | |
| --- | --- |
| Ruta | `POST /api/tasks/{id}/tags` (ya existe) |
| `204 No Content` | Etiqueta asignada, o **ya estaba asignada** |
| `404 Not Found` | No existe la tarea o la etiqueta |
| `409 Conflict` | La tarea ya tiene `TaskItem.MaxTags` etiquetas y esta es **nueva**: `ApiProblems.TagLimitReached(TaskItem.MaxTags)` |

Reglas:

- Asignar una etiqueta que la tarea **ya tiene** sigue siendo inofensivo y devuelve `204`, aunque la tarea esté en el límite. La operación es idempotente y debe seguir siéndolo.
- El `409` queda documentado en OpenAPI.

:::hint
La comprobación va **dentro** del `if (!task.Tags.Contains(tag))` que ya tienes, antes de `task.Tags.Add(tag)`. Si la pones fuera, una etiqueta repetida en una tarea con cinco daría `409`.
:::

:::hint
El handler ahora puede devolver un tercer resultado: añade `ProblemHttpResult` a su `Results<...>`. Necesitarás `using TaskTracker.Api.Errors;` en `TaskEndpoints.cs`, y `.ProducesProblem(StatusCodes.Status409Conflict)` en la línea de `MapPost` de las etiquetas. `task.Tags` ya está cargado con `Include`, así que `task.Tags.Count` no hace ninguna consulta extra.
:::

:::solution
```csharp title="Endpoints/TaskEndpoints.cs (using nuevo, tras TaskTracker.Api.Entities)"
using TaskTracker.Api.Errors;
```

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
    tasks.MapPost("/{id:int}/tags", AssignTag)
        .WithValidation<AssignTagRequest>()
        .ProducesProblem(StatusCodes.Status409Conflict);
    tasks.MapDelete("/{id:int}/tags/{tagId:int}", RemoveTag);

    return app;
}
```

```csharp title="Endpoints/TaskEndpoints.cs (método AssignTag)"
private static async Task<Results<NoContent, NotFound, ProblemHttpResult>> AssignTag(
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
        if (task.Tags.Count >= TaskItem.MaxTags)
        {
            return ApiProblems.TagLimitReached(TaskItem.MaxTags);
        }

        task.Tags.Add(tag);
        await db.SaveChangesAsync(cancellationToken);
    }

    return TypedResults.NoContent();
}
```

Cómo funciona:

- La comprobación del límite solo se ejecuta si la etiqueta es nueva para la tarea: el caso idempotente nunca llega a ella.
- `>=` y no `==`: si algún día bajas `MaxTags` a 3, las tareas que ya tienen cuatro etiquetas no podrán recibir más, en lugar de saltarse la regla.
- El orden vuelve a ser `404` antes que `409`: primero, que existan las dos cosas; después, si se pueden unir.
:::
::::

## Fallos esperados: resultados, no excepciones

Habrás notado que ninguna regla lanza una excepción. Podríamos haber escrito `throw new BusinessRuleException("project.has_open_tasks", ...)` y dejar que un manejador global la convirtiera en `409`. Es un estilo muy extendido, y en el paso 9 construirás precisamente ese manejador global. Entonces, ¿por qué no?

:::concept Esperado frente a inesperado
| | Resultado explícito (lo que hiciste) | Excepción |
| --- | --- | --- |
| ¿Se ve en la firma? | Sí: `Results<NoContent, NotFound, ProblemHttpResult>` lo anuncia | No: cualquier método puede lanzar cualquier cosa |
| ¿Lo ve OpenAPI? | El tipo de retorno y `.ProducesProblem(...)` lo documentan | Solo si te acuerdas de declararlo aparte |
| Flujo del código | Un `return` normal, que se lee de arriba abajo | Un salto invisible hasta quien la capture |
| Coste | Ninguno especial | Capturar la pila tiene un coste; irrelevante una vez, notable si es el camino habitual |
| Ideal para | Lo que **sabes que puede pasar**: reglas de negocio, `404`, conflictos | Lo que **no debería pasar**: un fallo de la base de datos, un error de programación |

La regla de este tutorial: **un fallo esperado es un resultado; uno inesperado, una excepción.** Los pasos 9 y 10 se ocupan de los inesperados.
:::

:::tip Un adelanto: el patrón Result
Hoy las reglas viven en los handlers, que conocen HTTP, así que pueden devolver un `ProblemHttpResult` directamente. En el tutorial 4 (**Clean Architecture**) las moverás a casos de uso que **no saben nada de HTTP**. Ahí no tendrás `TypedResults`, y en su lugar usarás el **patrón Result**: el caso de uso devuelve un objeto que dice "éxito, con este valor" o "error, con este `code`", y el endpoint lo traduce a `204` o `409`. Es la misma idea que acabas de aplicar, un nivel más abajo. Por eso merece la pena que los `code` ya existan.
:::

## Actualiza los archivos .http

El `DELETE` de `TaskTracker.Api.http` borraba el proyecto 2, que en los datos sembrados tiene dos tareas abiertas. Ahora devolvería `409`, así que confirma el borrado:

```http title="TaskTracker.Api.http (la petición DELETE de proyectos)"
DELETE {{TaskTracker.Api_HostAddress}}/api/projects/2?force=true
```

En `errors.http`, la sección *"Rules the API does not enforce yet"* ya no tiene sentido: la regla existe. Reemplaza **las dos últimas secciones** (desde `### --- Rules the API does not enforce yet ---` hasta el final del archivo) por esta, que agrupa los dos `409` de negocio:

```http title="errors.http (reemplaza las dos últimas secciones)"
### --- 409: business rules ---

DELETE {{TaskTracker.Api_HostAddress}}/api/projects/1

###

POST {{TaskTracker.Api_HostAddress}}/api/tags
Content-Type: application/json

{
  "name": "backend"
}
```

El `DELETE` sin `force` documenta ahora un error, en lugar de un borrado silencioso.

:::checkpoint Dos reglas de negocio
Detén la API, recrea la base de datos para partir de los datos sembrados (`Drop-Database` y `Update-Database` en la **Package Manager Console**, como en el tutorial 2) y vuelve a ejecutarla. Lanza estas peticiones **en orden**:

| Petición | Resultado esperado |
| --- | --- |
| `DELETE /api/projects/1` | `409`, `"code": "project.has_open_tasks"`, `"detail": "The project has 2 open task(s). Complete them first or repeat the request with ?force=true."` |
| `DELETE /api/projects/1?force=false` | El mismo `409`. |
| `DELETE /api/projects/999` | `404`: la existencia se comprueba antes que la regla. |
| `DELETE /api/projects/2?force=true` | `204`. Sus dos tareas desaparecen en cascada. |
| `POST /api/tags` con `{ "name": "docs" }`, después `"design"` y después `"qa"` | `201` las tres, con `id` `4`, `5` y `6`. |
| `POST /api/tasks/1/tags` con `{ "tagId": 3 }`, después `4` y después `5` | `204` las tres. La tarea 1 ya tenía `frontend` y `urgent`: ahora tiene cinco. |
| `POST /api/tasks/1/tags` con `{ "tagId": 6 }` | `409`, `"code": "task.tag_limit_reached"`, `"detail": "A task can have at most 5 tags."` |
| `POST /api/tasks/1/tags` con `{ "tagId": 1 }` | `204`: ya la tenía, así que no cuenta como nueva. |
| `GET /api/tasks/1` | `"tags": ["backend", "design", "docs", "frontend", "urgent"]` |
| `POST /api/projects/1/tasks/complete-all` | `200`, `{ "affected": 2 }` |
| `DELETE /api/projects/1` | `204`: sin tareas abiertas, la regla ya no aplica. Sin `force`. |

La respuesta del primer `DELETE`:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Project has open tasks",
  "status": 409,
  "detail": "The project has 2 open task(s). Complete them first or repeat the request with ?force=true.",
  "instance": "DELETE /api/projects/1",
  "code": "project.has_open_tasks",
  "traceId": "00-1bfb861bf54aad588a265cfd764a5d7d-3f0b0fa3c72884a3-00"
}
```

Abre `/openapi/v1.json`: `delete` en `/api/projects/{id}` y `post` en `/api/tasks/{id}/tags` listan ahora un `409` con `application/problem+json`.
:::

:::troubleshooting Errores comunes
- **`CS0029: Cannot implicitly convert type 'Microsoft.AspNetCore.Http.HttpResults.ProblemHttpResult' to 'Microsoft.AspNetCore.Http.HttpResults.Results<...>'`:** el handler devuelve un `ProblemHttpResult` pero su `Results<...>` no lo incluye. Añádelo como tercer tipo.
- **`CS0103: The name 'ApiProblems' does not exist in the current context`:** falta `using TaskTracker.Api.Errors;` en el archivo de endpoints.
- **`DELETE` sin `force` borra igualmente:** la condición está invertida (`force is true`) o comparas `t.Status == TaskItemStatus.Done` en lugar de `!=`.
- **`DELETE /api/projects/1` sin `force` devuelve `400`:** declaraste `bool force` (obligatorio). Debe ser `bool? force`.
- **Asignar una etiqueta que la tarea ya tiene devuelve `409` en el límite:** la comprobación de `MaxTags` está fuera del `if (!task.Tags.Contains(tag))`.
- **Los `id` de las etiquetas no son `4`, `5` y `6`:** la base de datos no estaba recién sembrada, o ya habías creado etiquetas. Recréala y repite en orden.
:::

:::recap
- La **validación** mira solo la petición; una **regla de negocio** mira el estado actual y vive en el handler.
- Si la misma petición podría funcionar más tarde cuando cambie el estado, la respondemos con **`409`**. `422` también es defendible; lo importante es la coherencia.
- `bool? force` se lee de la *query string* y es opcional; `force is not true` solo deja pasar un `true` explícito.
- Comprueba primero que el recurso existe (`404`) y después la regla (`409`).
- Las constantes del dominio, como `TaskItem.MaxTags`, viven en la entidad y alimentan los mensajes.
- Las operaciones idempotentes deben seguir siéndolo cuando añades reglas.
- **Fallo esperado → resultado explícito** en la firma; **fallo inesperado → excepción**. En el tutorial 4 lo llevarás un nivel más abajo con el patrón Result.

En el siguiente paso te ocuparás de lo **inesperado**: un manejador global que convierte cualquier excepción en un `ProblemDetails` seguro.
:::
