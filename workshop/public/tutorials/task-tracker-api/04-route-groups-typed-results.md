## Objetivo del paso

Tu API funciona, pero `Program.cs` empieza a parecerse a un cajón desastre: configuración, datos y cinco endpoints en el mismo archivo. Con tareas y etiquetas tendría más de 300 líneas. En este paso vas a ordenarlo sin cambiar el comportamiento de la API, salvo para mejorarlo:

1. Mover los datos a un **almacén en memoria** registrado como servicio **singleton**.
2. Centralizar la conversión entidad → DTO en un **método de extensión** `ToResponse()`.
3. Crear `Endpoints/ProjectEndpoints.cs` con un **route group** (`MapGroup`) y **handlers con nombre**.
4. Usar **`Results<...>`** y `TypedResults` para que el compilador y OpenAPI conozcan cada respuesta posible.
5. Hacer que los errores, incluidos los `404`, salgan como **`ProblemDetails`**.

Al terminar, `Program.cs` solo **configura** la aplicación, y cada recurso tendrá su propio archivo de endpoints.

## Los problemas del paso anterior

| Problema | Consecuencia |
| --- | --- |
| Todo vive en `Program.cs` | El archivo crecerá con cada recurso y será difícil de leer. |
| `"/api/projects"` repetido en cada `Map*` | Cambiar la ruta base obliga a tocar cinco líneas (y olvidar una). |
| `new ProjectResponse(p.Id, p.Name, ...)` repetido | Si `ProjectResponse` gana un campo, hay que cambiar varios sitios. |
| La lista no es segura con peticiones simultáneas | Dos `POST` a la vez podrían recibir el mismo `Id`. |
| OpenAPI no conoce los `404` | La documentación dice menos de lo que la API hace. |
| Los `404` llegan sin cuerpo | El cliente no recibe un error en formato estándar. |

Un detalle condiciona el orden de los cambios: cuando los handlers dejen de ser lambdas en `Program.cs` y pasen a ser **métodos estáticos en otra clase**, ya no podrán **capturar** la variable `projects`. Necesitan otra forma de llegar a los datos. Esa forma ya la conoces: **inyección de dependencias**.

## 1. Un almacén en memoria como servicio

Vamos a encapsular la lista en una clase, `InMemoryProjectStore`, y a registrarla en el contenedor de DI. Cada handler la pedirá como un parámetro más, igual que pediste `ILogger<Program>` en el experimento del paso 3.

:::vs Crear InMemoryProjectStore.cs
1. Crea la carpeta **`Data`** en el proyecto (clic derecho sobre `TaskTracker.Api` > **Add** > **New Folder**).
2. Clic derecho sobre `Data` > **Add** > **Class…**, nómbrala **`InMemoryProjectStore.cs`** y pulsa **Add**.
3. Reemplaza el contenido por el código siguiente.
:::

```csharp title="Data/InMemoryProjectStore.cs"
using TaskTracker.Api.Entities;

namespace TaskTracker.Api.Data;

// Temporary storage while we learn Minimal APIs. EF Core replaces it in step 8.
public class InMemoryProjectStore
{
    private readonly List<Project> _projects = [];
    private readonly Lock _lock = new();
    private int _nextId = 1;

    public List<Project> GetAll()
    {
        lock (_lock)
        {
            return [.. _projects];
        }
    }

    public Project? GetById(int id)
    {
        lock (_lock)
        {
            return _projects.Find(p => p.Id == id);
        }
    }

    public Project Add(Project project)
    {
        lock (_lock)
        {
            project.Id = _nextId++;
            _projects.Add(project);
            return project;
        }
    }

    public bool Remove(int id)
    {
        lock (_lock)
        {
            return _projects.RemoveAll(p => p.Id == id) > 0;
        }
    }
}
```

| Elemento | Qué significa |
| --- | --- |
| `private readonly List<Project> _projects = []` | La lista ya no es una variable de `Program.cs`, sino un campo privado: nadie fuera de la clase puede tocarla sin pasar por sus métodos. |
| `Lock _lock = new()` | Un objeto de bloqueo. El tipo `System.Threading.Lock` existe desde .NET 9 y está pensado justamente para esto. |
| `lock (_lock) { ... }` | Solo **un hilo a la vez** puede ejecutar un bloque protegido por el mismo `_lock`. Si llegan dos `POST` simultáneos, el segundo espera a que termine el primero, así que `_nextId++` ya no puede repetir un `Id`. |
| `return [.. _projects];` | Devuelve una **copia** de la lista (el `..` es el operador *spread* de las *collection expressions*). Así, quien la recorra no se encuentra la lista cambiando a mitad del recorrido. |
| `Add` asigna el `Id` | El almacén decide el identificador, igual que hará la base de datos. Quien llama solo aporta los datos. |

:::warning Es un almacén de juguete
`GetById` devuelve el **mismo objeto** que está en la lista, y el endpoint de `PUT` lo modificará fuera del `lock`. Para aprender Minimal APIs es suficiente, pero no es un patrón para producción. No le dediques más esfuerzo: en el paso 8 lo borrarás y su trabajo lo hará EF Core.
:::

:::concept ¿Por qué singleton?
Recuerda los tiempos de vida del tutorial 1: **transient** (una instancia nueva cada vez que se pide), **scoped** (una por petición) y **singleton** (una para toda la aplicación). Los datos deben **sobrevivir entre peticiones**: si el almacén fuera *scoped*, cada petición tendría una lista nueva y vacía. Por eso lo registraremos con `AddSingleton`. Y, precisamente porque un singleton lo comparten todas las peticiones a la vez, necesita el `lock`.
:::

## 2. Un solo sitio para convertir entidad en DTO

:::vs Crear ProjectMappings.cs
1. Crea la carpeta **`Mappings`** en el proyecto.
2. Clic derecho sobre `Mappings` > **Add** > **Class…**, nómbrala **`ProjectMappings.cs`** y pulsa **Add**.
3. Reemplaza el contenido por el código siguiente.
:::

```csharp title="Mappings/ProjectMappings.cs"
using TaskTracker.Api.Contracts;
using TaskTracker.Api.Entities;

namespace TaskTracker.Api.Mappings;

public static class ProjectMappings
{
    public static ProjectResponse ToResponse(this Project project) =>
        new(project.Id, project.Name, project.Description, project.CreatedAt);
}
```

Es el mismo patrón que `BookMappings` en el tutorial 1: un **método de extensión** (fíjate en el `this` del parámetro) que permite escribir `project.ToResponse()` como si fuera un método de `Project`. `new(...)` sin tipo es un *target-typed new*: el compilador sabe que debe crear un `ProjectResponse` porque es el tipo de retorno.

:::tip En el paso 8 este archivo crecerá
Cuando los datos vengan de la base de datos, necesitarás una segunda versión de esta conversión que EF Core pueda traducir a SQL. Por ahora, un método simple es todo lo que hace falta.
:::

## 3. Los endpoints en su propio archivo

Ahora la pieza central del paso.

:::concept Route group
Un **route group** agrupa endpoints que comparten un **prefijo de ruta** y, opcionalmente, configuración común (etiquetas de OpenAPI, autorización, filtros…). Se crea con `MapGroup`:

```csharp
var group = app.MapGroup("/api/projects");
group.MapGet("/", GetAll);          // GET /api/projects
group.MapGet("/{id:int}", GetById); // GET /api/projects/{id}
```

Las rutas de cada endpoint se escriben **relativas al grupo**. Si mañana el prefijo cambia a `/api/v2/projects`, cambias una sola línea.
:::

:::concept Handlers con nombre
En lugar de una lambda, un `Map*` puede recibir **un método**: `group.MapGet("/", GetAll)`. El framework lee la firma de `GetAll` (parámetros y tipo de retorno) exactamente igual que leía la de la lambda. Ventajas: cada handler tiene nombre, se puede leer de un vistazo, su tipo de retorno queda escrito, y la sección de registro de rutas cabe en una pantalla.
:::

:::vs Crear ProjectEndpoints.cs
1. Crea la carpeta **`Endpoints`** en el proyecto.
2. Clic derecho sobre `Endpoints` > **Add** > **Class…**, nómbrala **`ProjectEndpoints.cs`** y pulsa **Add**.
3. Reemplaza el contenido por el código siguiente.
:::

```csharp title="Endpoints/ProjectEndpoints.cs"
using Microsoft.AspNetCore.Http.HttpResults;
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

    private static Ok<List<ProjectResponse>> GetAll(InMemoryProjectStore store)
    {
        var projects = store.GetAll()
            .OrderBy(p => p.Name)
            .Select(p => p.ToResponse())
            .ToList();

        return TypedResults.Ok(projects);
    }

    private static Results<Ok<ProjectResponse>, NotFound> GetById(int id, InMemoryProjectStore store)
    {
        var project = store.GetById(id);

        return project is null ? TypedResults.NotFound() : TypedResults.Ok(project.ToResponse());
    }

    private static CreatedAtRoute<ProjectResponse> Create(CreateProjectRequest request, InMemoryProjectStore store)
    {
        var project = store.Add(new Project
        {
            Name = request.Name,
            Description = request.Description,
            CreatedAt = DateTime.UtcNow,
        });

        return TypedResults.CreatedAtRoute(project.ToResponse(), GetProjectByIdRoute, new { id = project.Id });
    }

    private static Results<NoContent, NotFound> Update(int id, UpdateProjectRequest request, InMemoryProjectStore store)
    {
        var project = store.GetById(id);
        if (project is null)
        {
            return TypedResults.NotFound();
        }

        project.Name = request.Name;
        project.Description = request.Description;

        return TypedResults.NoContent();
    }

    private static Results<NoContent, NotFound> Delete(int id, InMemoryProjectStore store)
    {
        return store.Remove(id) ? TypedResults.NoContent() : TypedResults.NotFound();
    }
}
```

### Explicación por partes

**El método de registro:**

```csharp
public static IEndpointRouteBuilder MapProjectEndpoints(this IEndpointRouteBuilder app)
```

- Es un **método de extensión** sobre `IEndpointRouteBuilder`, la interfaz que implementa `WebApplication`. Gracias a eso, en `Program.cs` escribirás `app.MapProjectEndpoints();`, con el mismo estilo que `app.MapOpenApi()`.
- Devuelve `app` para poder **encadenar** llamadas si algún día lo necesitas.
- La clase es `static`: no guarda estado, solo agrupa métodos. Los handlers son `private`, porque nadie fuera de este archivo necesita llamarlos directamente.

**El grupo y sus rutas:**

| Línea | Qué hace |
| --- | --- |
| `app.MapGroup("/api/projects")` | Crea el grupo. Todas las rutas siguientes cuelgan de este prefijo. |
| `.WithTags("Projects")` | Asigna la etiqueta `Projects` a **todos** los endpoints del grupo. En OpenAPI (y en Scalar, en el paso 14) aparecerán agrupados bajo ese nombre. |
| `group.MapGet("/", GetAll)` | `GET /api/projects`. El handler es el método `GetAll`. |
| `.WithName(GetProjectByIdRoute)` | Da un **nombre único** al endpoint `GET /{id}`. `Create` lo usará para construir la URL del recurso creado. Al usar una constante evitas erratas entre los dos sitios. |

**Los tipos de retorno:** aquí está la mejora de verdad.

:::concept Results<T1, T2, ...>
`Results<Ok<ProjectResponse>, NotFound>` es un tipo **unión**: un valor de este tipo es **o bien** un `Ok<ProjectResponse>` **o bien** un `NotFound`. Tiene conversiones implícitas desde cada uno de sus tipos, por eso puedes devolver `TypedResults.NotFound()` o `TypedResults.Ok(...)` directamente.

Con esto se resuelven los dos problemas del paso 3:

- **Compila**, porque el tipo de retorno del método está escrito y no hay que deducirlo de un `? :`.
- **OpenAPI ve todas las respuestas**: lee `Ok<ProjectResponse>` y `NotFound` en la firma y documenta el `200` con su esquema **y** el `404`.

Y un tercer beneficio: si intentas devolver un tipo que no está en la lista (por ejemplo `TypedResults.BadRequest()`), el compilador lo impide. La firma es un contrato que no puede mentir.
:::

| Handler | Tipo de retorno | Respuestas posibles |
| --- | --- | --- |
| `GetAll` | `Ok<List<ProjectResponse>>` | Solo `200`, así que no necesita `Results<...>`. |
| `GetById` | `Results<Ok<ProjectResponse>, NotFound>` | `200` o `404`. |
| `Create` | `CreatedAtRoute<ProjectResponse>` | `201` con cabecera `Location`. |
| `Update` / `Delete` | `Results<NoContent, NotFound>` | `204` o `404`. |

**`CreatedAtRoute` frente a `Created`:** en el paso 3 escribiste la URL a mano (`$"/api/projects/{project.Id}"`). `TypedResults.CreatedAtRoute(valor, nombreDeRuta, valoresDeRuta)` la **genera** a partir del endpoint con nombre `GetProjectById` y del valor `id`. Si mañana cambias la ruta del grupo, la cabecera `Location` sigue siendo correcta sin tocar `Create`. Es el equivalente a `CreatedAtAction` de los controllers.

**Los parámetros:** `InMemoryProjectStore store` aparece en todos los handlers. No está en la ruta, no es un tipo simple ni un tipo especial, y está **registrado en DI** (lo harás enseguida), así que el framework lo saca del contenedor. Cada handler pide solo lo que necesita: `GetAll` no tiene `id`, `Delete` no tiene `request`.

:::why ¿Por qué métodos estáticos privados y no una clase con constructor?
Porque no hace falta: las dependencias llegan como parámetros, así que la clase no necesita guardar nada. Si usaras una clase con constructor estarías reinventando un controller. Los métodos estáticos dejan claro que cada handler es una función independiente: entra una petición, sale una respuesta.
:::

## 4. Un Program.cs que solo configura

Ahora `Program.cs` queda mucho más corto. Además del almacén, añadimos tres líneas para los errores, que se explican justo después del código.

:::vs Reemplazar Program.cs
1. Abre `Program.cs` y reemplaza **todo** su contenido por el código siguiente.
2. Si hiciste el reto del paso 3, tus lambdas de `PUT` y `DELETE` desaparecen: ahora viven en `ProjectEndpoints` como `Update` y `Delete`.
:::

```csharp title="Program.cs"
using TaskTracker.Api.Data;
using TaskTracker.Api.Endpoints;

var builder = WebApplication.CreateBuilder(args);

// --- Services ---
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();

builder.Services.AddSingleton<InMemoryProjectStore>();

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

| Línea | Qué hace |
| --- | --- |
| `builder.Services.AddSingleton<InMemoryProjectStore>()` | Registra el almacén: una única instancia para toda la aplicación. Sin interfaz esta vez, porque es temporal y solo tiene una implementación. |
| `app.MapProjectEndpoints()` | Llama a tu método de extensión, que registra el grupo y sus cinco endpoints. |
| `builder.Services.AddProblemDetails()` | Registra el servicio que sabe **escribir** respuestas `ProblemDetails`. |
| `app.UseExceptionHandler()` | Middleware que captura cualquier excepción no controlada y responde `500` con un `ProblemDetails`, sin filtrar detalles internos. |
| `app.UseStatusCodePages()` | Middleware que, cuando una respuesta de error (`400`–`599`) sale **sin cuerpo**, le añade uno. Como registraste `AddProblemDetails()`, ese cuerpo es un `ProblemDetails`. |

## ProblemDetails sin [ApiController]

En Bookshelf, `[ApiController]` convertía tu `NotFound()` en un `ProblemDetails`. Aquí no existe ese atributo: `TypedResults.NotFound()` produce un `404` **vacío**, como viste en el paso 3. Los tres elementos anteriores trabajan juntos para arreglarlo:

```
Petición ──▶ UseExceptionHandler ──▶ UseStatusCodePages ──▶ ... ──▶ endpoint
                    │                        │                          │
                    │                        │◀──── 404 sin cuerpo ─────┘
                    │                        └─ escribe un ProblemDetails
                    └─ si algo lanza una excepción: 500 con ProblemDetails
```

:::why ¿Por qué UseExceptionHandler va el primero?
Por lo que aprendiste del pipeline en el tutorial 1: cada middleware envuelve a los que vienen después. Para capturar **cualquier** excepción, el manejador de excepciones debe ser el más externo. Si lo pusieras al final, las excepciones lanzadas por los middlewares anteriores escaparían sin control.
:::

:::warning UseExceptionHandler() sin argumentos necesita AddProblemDetails()
Si borras `builder.Services.AddProblemDetails();`, la aplicación ni siquiera arranca: `UseExceptionHandler()` no sabe qué escribir y lanza `InvalidOperationException: An error occurred when configuring the exception handler middleware...` Los dos van siempre juntos.
:::

Este es el mismo mecanismo que usarás el resto del tutorial: tus handlers devuelven el **código de estado** correcto y la infraestructura se encarga del **formato** del error.

## Comprueba que todo sigue funcionando

El archivo `.http` del paso 3 sigue sirviendo: las rutas no han cambiado. Ejecuta la API con <kbd>Ctrl</kbd> + <kbd>F5</kbd> y envía las peticiones en orden. Envía también el `POST` **dos veces** con nombres distintos (por ejemplo, cambia el segundo a `"name": "Alpha"`) para ver la ordenación.

:::checkpoint El mismo CRUD, con mejores errores y mejor documentación
**1. `POST /api/projects`** → `201 Created`. Fíjate en la cabecera: ahora es una URL **absoluta**, generada a partir del endpoint con nombre:

```
Location: http://localhost:5283/api/projects/1
```

**2. `GET /api/projects`** (con dos proyectos creados) → `200 OK`, ordenados por nombre:

```json
[
  {
    "id": 2,
    "name": "Alpha",
    "description": null,
    "createdAt": "2026-10-20T19:21:45.7316496Z"
  },
  {
    "id": 1,
    "name": "Learn EF Core",
    "description": "Work through the Task Tracker tutorial.",
    "createdAt": "2026-10-20T19:21:45.6444022Z"
  }
]
```

**3. `GET /api/projects/99`** → `404 Not Found`, ahora **con cuerpo** y `Content-Type: application/problem+json`:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Not Found",
  "status": 404,
  "traceId": "00-b613aee685ebe0f543cbe86b02ad4c62-da682727476519d1-00"
}
```

**4. `GET /api/projects/abc`** → también `404` con `ProblemDetails`. Ningún endpoint coincide (la restricción `:int` lo descarta), pero `UseStatusCodePages` actúa igualmente sobre la respuesta vacía. En el paso 7 de Bookshelf, esta misma petición devolvía un `404` sin cuerpo.

**5. `PUT /api/projects/1`** → `204 No Content`. **`DELETE /api/projects/2`** → `204`. Repite el `DELETE` → `404` con `ProblemDetails`.

**6. `GET /openapi/v1.json`** → busca `"/api/projects/{id}"`. Ahora el `get` tiene `"tags": ["Projects"]`, `"operationId": "GetProjectById"` (el nombre de `WithName`) y **dos** respuestas: `"200"` con el esquema `ProjectResponse` y `"404"`. El `put` y el `delete` documentan `"204"` y `"404"`. Compáralo con lo que viste en el paso 3.
:::

:::warning Un 500 que todavía no esperas
Envía un `POST` con un JSON roto, por ejemplo `{"name":` (sin cerrar). En el paso 3 obtenías un `400`; ahora recibes un **`500 Internal Server Error`** con `ProblemDetails`. No es culpa de tu código: en el entorno `Development`, las Minimal APIs **lanzan una excepción** (`BadHttpRequestException`) cuando no pueden leer la petición, para que veas el detalle; `UseExceptionHandler` la captura y, por defecto, la convierte en un `500`. En producción no ocurre. Lo verás otra vez con valores de enum inválidos y lo corregiremos en el paso 10. Hasta entonces, envía JSON válido.
:::

:::troubleshooting Errores comunes
- **`CS1061: 'WebApplication' does not contain a definition for 'MapProjectEndpoints'...`:** falta `using TaskTracker.Api.Endpoints;` en `Program.cs`, o el método no tiene `this` en su primer parámetro, o la clase no es `static`.
- **`CS0029: Cannot implicitly convert type '...BadRequest' to '...Results<...Ok<...ProjectResponse>, ...NotFound>'`:** devuelves un resultado que no está en la lista de `Results<...>`. Añádelo a la lista o devuelve uno de los permitidos.
- **`CS0246: The type or namespace name 'Ok<>' could not be found`** (o `NotFound`, `Results<,>`): falta `using Microsoft.AspNetCore.Http.HttpResults;` en `ProjectEndpoints.cs`.
- **La API no arranca: `InvalidOperationException: An error occurred when configuring the exception handler middleware...`:** usas `app.UseExceptionHandler()` sin haber registrado `builder.Services.AddProblemDetails()`.
- **`POST` responde `500` y la consola muestra `InvalidOperationException: No route matches the supplied values.`:** el nombre usado en `CreatedAtRoute` no coincide con el de `WithName`, o los valores de ruta no se llaman `id`. Usa la constante en los dos sitios.
- **Todas las peticiones fallan con `500` y la consola muestra `InvalidOperationException: Body was inferred but the method does not allow inferred body parameters.`**, con una tabla donde `store` aparece como `Body (Inferred)`: olvidaste `builder.Services.AddSingleton<InMemoryProjectStore>();`. Como el tipo no está registrado en DI, el framework supone que es el cuerpo de la petición, y un `GET` no admite cuerpo.
- **Los datos desaparecen entre peticiones:** registraste el almacén con `AddScoped` o `AddTransient`. Para que la lista sobreviva, debe ser `AddSingleton`.
:::

:::recap
- Los handlers como **métodos estáticos con nombre** no capturan variables: reciben sus dependencias como parámetros, resueltas por DI. El almacén es **singleton** para que los datos sobrevivan entre peticiones, y usa `lock` porque lo comparten todas.
- `MapGroup("/api/projects")` agrupa endpoints con un prefijo común; `WithTags` los etiqueta en OpenAPI; `WithName` les da un nombre que usa `CreatedAtRoute`.
- `Results<Ok<T>, NotFound>` declara todas las respuestas posibles: compila con varias ramas, documenta OpenAPI y el compilador impide devolver algo fuera de la lista.
- `AddProblemDetails()` + `UseExceptionHandler()` + `UseStatusCodePages()` convierten excepciones y errores vacíos en `ProblemDetails`.
- `Program.cs` solo configura; cada recurso tiene su archivo en `Endpoints/`.

Con esto termina la parte de Minimal APIs. En el siguiente paso cambiamos de tema: qué es un **ORM**, cómo funciona **EF Core** y por qué usaremos **SQLite**.
:::
