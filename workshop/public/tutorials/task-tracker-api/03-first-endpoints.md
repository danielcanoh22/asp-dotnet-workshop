## Objetivo del paso

Ha llegado el momento de que Task Tracker gestione **proyectos**. En este paso vas a:

1. Crear la **entidad** `Project` y los **contratos** (DTOs) de entrada y salida.
2. Escribir tus primeros endpoints con lambdas: listar, obtener uno y crear proyectos.
3. Entender el **parameter binding**: cómo decide el framework de dónde sale cada parámetro del handler (ruta, query string, cuerpo, servicios…).
4. Ver la diferencia entre **`Results`** y **`TypedResults`**, y por qué importa para la documentación.
5. Escribir tú solo `PUT` y `DELETE` en un reto.

Los proyectos se guardarán en una **lista en memoria**. Es provisional, igual que la lista `static` de Bookshelf: la base de datos llega en el paso 8. Así puedes concentrarte solo en Minimal APIs.

## La entidad Project

:::concept Entidad
Una **entidad** es una clase que representa algo de tu dominio con **identidad propia**: dos proyectos con el mismo nombre siguen siendo proyectos distintos porque tienen distinto `Id`. Es el equivalente al "modelo" `Book` de Bookshelf. La llamamos *entidad* porque, a partir del paso 6, EF Core guardará cada una en una tabla de la base de datos, y ese es el nombre que usa EF Core.
:::

:::vs Crear la carpeta y la clase
1. En Solution Explorer, haz clic derecho sobre el proyecto `TaskTracker.Api` > **Add** > **New Folder** y nómbrala **`Entities`**.
2. Haz clic derecho sobre `Entities` > **Add** > **Class…**, escribe **`Project.cs`** y pulsa **Add**.
3. Reemplaza todo el contenido por el código siguiente.
:::

```csharp title="Entities/Project.cs"
namespace TaskTracker.Api.Entities;

public class Project
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; }
}
```

| Elemento | Qué significa |
| --- | --- |
| `int Id` | El identificador. Por ahora lo asignaremos nosotros; con EF Core lo generará la base de datos. |
| `required string Name` | El modificador **`required`** (C# 11) obliga a asignar `Name` al crear un `Project` con un inicializador de objeto. Si lo olvidas, el código **no compila**. |
| `string? Description` | Opcional: un proyecto puede no tener descripción, y eso se expresa con `null`. |
| `DateTime CreatedAt` | Cuándo se creó. Guardaremos siempre la hora en **UTC**. |

:::why ¿Por qué required y no = string.Empty como en Bookshelf?
En `Book` usaste `= string.Empty` para que el compilador no avisara de que `Title` podía quedarse sin valor. Funciona, pero esconde un error: un `Book` creado sin título tendría `""`, un dato falso que nadie pidió. Con `required`, crear un `Project` sin nombre es **imposible**: el compilador lo detecta (error `CS9035`). Es una forma más honesta de decir "este dato es obligatorio", y EF Core la entiende: en el paso 7 verás que `Name` se convierte en una columna `NOT NULL`.
:::

## Los contratos: qué entra y qué sale

En el tutorial 1 aprendiste a no exponer el modelo directamente y a usar **DTOs** para las peticiones y respuestas. Aquí haremos lo mismo, con dos pequeños cambios de estilo:

- Los llamaremos **contratos** (*contracts*): son el acuerdo público entre tu API y quien la usa.
- Pondremos los contratos de cada recurso **en un solo archivo**, porque son `record` de pocas líneas que siempre se leen juntos.

:::vs Crear ProjectContracts.cs
1. Crea la carpeta **`Contracts`** en el proyecto (clic derecho > **Add** > **New Folder**).
2. Clic derecho sobre `Contracts` > **Add** > **Class…**, nómbrala **`ProjectContracts.cs`** y pulsa **Add**.
3. Reemplaza todo el contenido por el código siguiente.
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
    DateTime CreatedAt);
```

| Contrato | Para qué sirve |
| --- | --- |
| `CreateProjectRequest` | El cuerpo JSON de `POST /api/projects`. Solo lo que el cliente **puede** decidir: nombre y descripción. Ni `Id` ni `CreatedAt`, que los pone el servidor. |
| `UpdateProjectRequest` | El cuerpo de `PUT /api/projects/{id}`. Lo usarás en el reto del final. |
| `ProjectResponse` | Lo que la API devuelve. Hoy coincide campo a campo con la entidad, pero en el paso 9 incluirá datos calculados (cuántas tareas tiene el proyecto) que la entidad no tiene. |

:::concept Record posicional
`public record ProjectResponse(int Id, string Name, ...)` es un **record posicional**: en una línea declaras un tipo inmutable con un constructor y una propiedad de solo lectura por cada parámetro. Es perfecto para DTOs, que solo transportan datos. Se crea así: `new ProjectResponse(1, "Learn EF Core", null, DateTime.UtcNow)`.
:::

:::why ¿Por qué Description = null en CreateProjectRequest y no en UpdateProjectRequest?
El valor por defecto `= null` hace que `description` sea **opcional** al crear: el cliente puede enviar solo `{ "name": "..." }`. En cambio, `PUT` significa "**reemplaza** el proyecto entero", así que el contrato no ofrece valor por defecto: el cliente debe decir explícitamente qué descripción quiere, aunque sea `null`. La documentación OpenAPI reflejará esa diferencia.
:::

## Tus primeros endpoints

Ahora sí, los endpoints. Los escribiremos con lambdas directamente en `Program.cs`, en una nueva sección `// --- Endpoints ---` justo antes de `app.Run()`.

:::vs Editar Program.cs
1. Abre `Program.cs`.
2. Reemplaza todo su contenido por el código siguiente. Lo que se añade respecto al paso 2 son los dos `using` del principio y la sección `// --- Endpoints ---`.
:::

```csharp title="Program.cs"
using TaskTracker.Api.Contracts;
using TaskTracker.Api.Entities;

var builder = WebApplication.CreateBuilder(args);

// --- Services ---
builder.Services.AddOpenApi();

var app = builder.Build();

// --- Development-only setup ---
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// --- Middleware pipeline ---
app.UseHttpsRedirection();

// --- Endpoints ---
// TEMPORARY: an in-memory list captured by the lambdas below. Step 4 replaces it.
var projects = new List<Project>();
var nextId = 1;

app.MapGet("/api/projects", () =>
    projects
        .OrderBy(p => p.Name)
        .Select(p => new ProjectResponse(p.Id, p.Name, p.Description, p.CreatedAt))
        .ToList());

app.MapGet("/api/projects/{id:int}", (int id) =>
{
    var project = projects.Find(p => p.Id == id);

    return project is null
        ? Results.NotFound()
        : Results.Ok(new ProjectResponse(project.Id, project.Name, project.Description, project.CreatedAt));
});

app.MapPost("/api/projects", (CreateProjectRequest request) =>
{
    var project = new Project
    {
        Id = nextId++,
        Name = request.Name,
        Description = request.Description,
        CreatedAt = DateTime.UtcNow,
    };
    projects.Add(project);

    var response = new ProjectResponse(project.Id, project.Name, project.Description, project.CreatedAt);
    return TypedResults.Created($"/api/projects/{project.Id}", response);
});

app.Run();
```

### Explicación, endpoint a endpoint

**Los datos provisionales:**

```csharp
var projects = new List<Project>();
var nextId = 1;
```

Son **variables locales** de `Program.cs`. Las instrucciones de nivel superior se ejecutan **una sola vez**, al arrancar la aplicación, así que solo existe una lista durante toda la vida de la API.

:::concept Captura de variables (closure)
Las lambdas de los `MapGet`/`MapPost` usan `projects` y `nextId` aunque estén declaradas fuera de ellas. Cuando una lambda usa una variable externa, C# la **captura**: la lambda guarda una referencia a esa variable, no una copia. Por eso todas las peticiones ven la misma lista y el mismo contador, y por eso `nextId++` dentro de `MapPost` incrementa el contador compartido. A este mecanismo se le llama **closure** (clausura).
:::

**`GET /api/projects`:**

```csharp
app.MapGet("/api/projects", () =>
    projects
        .OrderBy(p => p.Name)
        .Select(p => new ProjectResponse(p.Id, p.Name, p.Description, p.CreatedAt))
        .ToList());
```

- Una lambda sin parámetros y con **cuerpo de expresión** (sin llaves ni `return`).
- `OrderBy` ordena por nombre; `Select` convierte cada entidad en su `ProjectResponse`; `ToList()` materializa el resultado.
- El handler devuelve una `List<ProjectResponse>` y el framework responde `200` con el JSON. Cuando lo que devuelves no es un "resultado HTTP", siempre es `200`.

**`GET /api/projects/{id:int}`:**

```csharp
app.MapGet("/api/projects/{id:int}", (int id) =>
{
    var project = projects.Find(p => p.Id == id);

    return project is null
        ? Results.NotFound()
        : Results.Ok(new ProjectResponse(project.Id, project.Name, project.Description, project.CreatedAt));
});
```

- La plantilla `{id:int}` funciona igual que en los controllers: parámetro de ruta con restricción de tipo.
- El parámetro `int id` de la lambda recibe el valor **porque se llama igual** que el parámetro de ruta.
- Ahora sí necesitamos elegir el código de estado: `Results.NotFound()` produce `404` y `Results.Ok(...)` produce `200`. Ambos devuelven `IResult`, la interfaz que representa "una respuesta HTTP completa".

**`POST /api/projects`:**

```csharp
app.MapPost("/api/projects", (CreateProjectRequest request) =>
{
    var project = new Project { Id = nextId++, ... };
    projects.Add(project);

    var response = new ProjectResponse(...);
    return TypedResults.Created($"/api/projects/{project.Id}", response);
});
```

- `CreateProjectRequest request` es un tipo complejo: el framework lo lee del **cuerpo JSON** de la petición.
- El servidor decide el `Id` y la fecha (`DateTime.UtcNow`).
- `TypedResults.Created(url, body)` responde `201 Created`, con la cabecera `Location` apuntando al nuevo recurso y el proyecto creado en el cuerpo. Es el mismo contrato REST que aplicaste en Bookshelf con `CreatedAtAction`.

:::warning Esta lista no es segura con peticiones simultáneas
`List<T>` no está preparada para que dos hilos la modifiquen a la vez, y `nextId++` no es una operación atómica: dos `POST` simultáneos podrían recibir el mismo `Id`. Kestrel atiende varias peticiones en paralelo, así que el riesgo es real. Lo resolveremos en el paso 4 con un pequeño almacén que usa un `lock`, y definitivamente en el paso 8 con la base de datos.
:::

## Parameter binding: de dónde sale cada parámetro

Con controllers, `[ApiController]` decidía de dónde venía cada parámetro. En Minimal APIs el framework hace algo parecido, **leyendo la firma del handler** cuando arranca la aplicación.

:::concept Parameter binding
El **parameter binding** es el proceso que convierte los datos de una petición HTTP en los parámetros de tu handler. Para cada parámetro, el framework aplica estas reglas en orden:

| Fuente | Cuándo se usa | Ejemplo |
| --- | --- | --- |
| **Ruta** | El nombre del parámetro coincide con uno de la plantilla de ruta. | `int id` con `/api/projects/{id:int}` |
| **Tipos especiales** | El tipo es uno que el framework conoce: `HttpContext`, `HttpRequest`, `HttpResponse`, `CancellationToken`, `ClaimsPrincipal`… | `HttpContext context` |
| **Servicios (DI)** | El tipo está registrado en el contenedor de DI. | `ILogger<Program> logger` |
| **Query string** | Es un tipo simple (`int`, `string`, `bool`, `DateOnly`, enums…) que no está en la ruta. | `string? search` con `?search=ef` |
| **Cuerpo (body)** | Es un tipo complejo (una clase o un `record`). Se lee como JSON. | `CreateProjectRequest request` |

Puedes ser explícito con atributos: `[FromRoute]`, `[FromQuery]`, `[FromHeader]`, `[FromBody]` y `[FromServices]` (del espacio de nombres `Microsoft.AspNetCore.Mvc`). Solo los necesitarás cuando la regla automática no sea la que quieres, por ejemplo para leer una cabecera.
:::

Fíjate en la línea de **servicios**: así es como una Minimal API recibe sus dependencias. No hay constructor; el handler pide el servicio como un parámetro más y el contenedor se lo entrega. Lo usarás en el paso 4.

:::warning Solo un parámetro puede venir del cuerpo
Una petición HTTP tiene un único cuerpo. Si declaras dos parámetros de tipo complejo en el mismo handler, la aplicación compila y arranca, pero **la primera petición** (a cualquier endpoint) falla con `500` y un `InvalidOperationException: Failure to infer one or more parameters.` que muestra una tabla con el origen deducido de cada parámetro: el primero aparece como `Body (Inferred)` y el segundo como `UNKNOWN`. Agrupa todo lo que llega en el cuerpo en un solo `record`.
:::

### Experimento: míralo funcionar

Vamos a comprobar las reglas con un endpoint **temporal**, que borrarás al terminar esta sección.

:::vs Añadir el endpoint de prueba
1. En `Program.cs`, pega el código siguiente **justo antes** de `app.Run();`.
2. Ejecuta la API con <kbd>Ctrl</kbd> + <kbd>F5</kbd>.
:::

```csharp title="Program.cs (experimento temporal)"
// EXPERIMENT: where does each parameter come from? Delete this endpoint when you finish the section.
app.MapGet("/api/binding-demo/{id:int}", (int id, string? search, HttpContext context, ILogger<Program> logger) =>
{
    logger.LogInformation("Binding demo: id={Id}, search={Search}", id, search);

    return new
    {
        id,
        search,
        userAgent = context.Request.Headers.UserAgent.ToString(),
    };
});
```

Añade estas dos peticiones al final de `TaskTracker.Api.http` y envíalas:

```http title="TaskTracker.Api.http (peticiones temporales)"
GET {{TaskTracker.Api_HostAddress}}/api/binding-demo/7?search=ef

###

GET {{TaskTracker.Api_HostAddress}}/api/binding-demo/7

###
```

Resultados esperados:

| Petición | Respuesta | Qué demuestra |
| --- | --- | --- |
| `/api/binding-demo/7?search=ef` | `{ "id": 7, "search": "ef", "userAgent": "..." }` | `id` viene de la **ruta**; `search`, de la **query string**; `context`, del framework; `logger`, del **contenedor de DI**. |
| `/api/binding-demo/7` | `{ "id": 7, "search": null, "userAgent": "..." }` | Como `search` es `string?`, es **opcional**: si no llega, vale `null`. |

En la consola de la API verás además la línea que escribió el logger inyectado:

```
info: Program[0]
      Binding demo: id=7, search=ef
```

:::tip Pruébalo sin el ?
Cambia `string? search` por `string search` (sin `?`), ejecuta de nuevo y envía la segunda petición. Obtendrás un `400 Bad Request` con el mensaje `Required parameter "string search" was not provided from query string.`: con `Nullable` activado, un `string` sin `?` es un parámetro **obligatorio** y el framework rechaza la petición antes de llegar a tu código. Es la misma lección del tutorial 1: el `?` no es decorativo.
:::

Cuando termines, **borra el endpoint de prueba** de `Program.cs` y las dos peticiones temporales del `.http`. `Program.cs` debe quedar exactamente como estaba antes del experimento.

## Results frente a TypedResults

Habrás notado que `GetById` usa `Results.Ok(...)` y `POST` usa `TypedResults.Created(...)`. Las dos clases producen **exactamente la misma respuesta HTTP**. La diferencia está en lo que ve el compilador.

:::concept Results y TypedResults
- **`Results.Ok(value)`** devuelve el tipo `IResult`: "algún resultado HTTP". El compilador, y con él OpenAPI, no saben si es un `200`, un `404` o cualquier otra cosa.
- **`TypedResults.Ok(value)`** devuelve el tipo concreto `Ok<ProjectResponse>`. El tipo ya dice "esto es un `200` con un `ProjectResponse` dentro".

Esa información extra tiene dos ventajas: la **documentación OpenAPI** se genera sola y correcta, y las **pruebas** pueden comprobar el tipo devuelto sin hacer peticiones HTTP.
:::

Compruébalo. Con la API en ejecución, envía la petición `GET /openapi/v1.json` que dejaste en el `.http` y busca dentro de `paths` estos dos fragmentos (simplificados):

```json
"/api/projects/{id}": {
  "get": {
    "responses": {
      "200": { "description": "OK" }
    }
  }
}
```

```json
"/api/projects": {
  "post": {
    "responses": {
      "201": {
        "description": "Created",
        "content": {
          "application/json": {
            "schema": { "$ref": "#/components/schemas/ProjectResponse" }
          }
        }
      }
    }
  }
}
```

- Para `POST`, OpenAPI sabe que responde `201` con un `ProjectResponse`, porque `TypedResults.Created` lo dice en su tipo.
- Para `GET /{id}`, la documentación **miente por omisión**: dice `200` sin cuerpo y no menciona el `404`. Con `IResult` el generador no puede saber más.

Entonces, ¿por qué no usar `TypedResults` también en `GetById`? Prueba a cambiar `Results.NotFound()` y `Results.Ok(...)` por `TypedResults.NotFound()` y `TypedResults.Ok(...)`. La compilación falla con dos errores bastante desconcertantes:

```
error CS1678: Parameter 1 is declared as type 'int' but should be 'Microsoft.AspNetCore.Http.HttpContext'
error CS1661: Cannot convert lambda expression to type 'RequestDelegate' because the parameter types do not match the delegate parameter types
```

La causa real es otra: las dos ramas del `? :` devuelven tipos **distintos** (`NotFound` y `Ok<ProjectResponse>`), así que el compilador no puede deducir el tipo de retorno de la lambda. Al no poder usar la sobrecarga normal de `MapGet`, prueba con otra (la que recibe un `RequestDelegate`) y se queja de los parámetros. Vuelve a dejar `Results.NotFound()` y `Results.Ok(...)`.

La solución elegante es un tipo que diga "**o** un `Ok<ProjectResponse>` **o** un `NotFound`": `Results<Ok<ProjectResponse>, NotFound>`. Lo usarás en el paso 4, cuando los handlers dejen de ser lambdas y sean métodos con su tipo de retorno escrito.

## Prueba los endpoints

Reemplaza el contenido de `TaskTracker.Api.http` por el siguiente (conserva **tu** puerto). Incluye ya las peticiones `PUT` y `DELETE`, que implementarás en el reto.

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
  "name": "Learn EF Core and Minimal APIs",
  "description": "Work through the Task Tracker tutorial."
}

###

DELETE {{TaskTracker.Api_HostAddress}}/api/projects/1
```

| Fragmento | Significado |
| --- | --- |
| `### --- Projects ---` | Un `###` seguido de texto es un separador con comentario. Lo usamos como título de sección: más adelante añadirás secciones para tareas y etiquetas. |
| `Content-Type: application/json` | Le dice a la API que el cuerpo es JSON. **Sin esta cabecera**, el `POST` responde `415 Unsupported Media Type`. |
| La línea en blanco antes de `{` | Separa las cabeceras del cuerpo. Es obligatoria. |

Ejecuta la API (<kbd>Ctrl</kbd> + <kbd>F5</kbd>) y envía las peticiones **en este orden**.

:::checkpoint Listar, crear y consultar
**1. `GET /api/projects`** → `200 OK` con una lista vacía: `[]`.

**2. `POST /api/projects`** → `201 Created`. En las cabeceras verás `Location: /api/projects/1`, y en el cuerpo:

```json
{
  "id": 1,
  "name": "Learn EF Core",
  "description": "Work through the Task Tracker tutorial.",
  "createdAt": "2026-10-20T19:21:02.2334177Z"
}
```

La fecha será la tuya. La `Z` final indica que está en UTC.

**3. `GET /api/projects`** → `200 OK` con una lista de un elemento (el proyecto anterior).

**4. `GET /api/projects/1`** → `200 OK` con el mismo objeto.

**5. Cambia la URL a `/api/projects/99`** y envíala → `404 Not Found` **sin cuerpo**. A diferencia de Bookshelf, no hay `ProblemDetails`: aquí no existe `[ApiController]` que lo genere. Lo arreglarás en el paso 4.

**6. `PUT /api/projects/1`** → `405 Method Not Allowed`, con la cabecera `Allow: GET`. La ruta existe (para `GET`), pero ningún endpoint atiende `PUT`. Eso es justo lo que vas a escribir en el reto.

**Reinicia la API** y repite `GET /api/projects`: vuelve a ser `[]`. Los datos viven en memoria y se pierden al parar. Es lo esperado hasta el paso 8.
:::

:::warning Todavía no hay validación
Envía un `POST` con el cuerpo `{}`. La API responde `201 Created` y guarda un proyecto con `"name": null`, aunque `Name` es obligatorio en la entidad. ¿Por qué no lo impidió `required`? Porque `required` actúa **al compilar** tu código, y aquí el `null` llega **en tiempo de ejecución**, desde el JSON. Sin `[ApiController]`, nadie valida el DTO. Lo resolverás en el paso 12 con `AddValidation()`; hasta entonces, envía siempre un `name`.
:::

::::challenge Implementa PUT y DELETE
Ya practicaste los tres ingredientes: un parámetro de **ruta** (`GET /{id}`), un parámetro del **cuerpo** (`POST`) y respuestas con `Results`. Combínalos para añadir dos endpoints más, antes de `app.Run()`:

- **`PUT /api/projects/{id}`**: recibe un `UpdateProjectRequest`. Si el proyecto no existe, responde `404`. Si existe, reemplaza su `Name` y su `Description` y responde `204 No Content`.
- **`DELETE /api/projects/{id}`**: si el proyecto existe, lo elimina y responde `204 No Content`; si no, `404`.

Compruébalo con las peticiones `PUT` y `DELETE` del `.http`: crea primero un proyecto con `POST`, modifícalo con `PUT`, verifica el cambio con `GET /api/projects/1`, bórralo con `DELETE` y repite el `DELETE` para ver el `404`.

:::hint
Usa `MapPut` y `MapDelete`, con la misma plantilla de ruta que `GET /{id}`. En el `PUT` el handler necesita **dos** parámetros: uno de la ruta y otro del cuerpo. El framework sabrá distinguirlos por las reglas de binding.
:::

:::hint
Para el `PUT`, sigue el patrón de `GetById`: busca con `projects.Find(p => p.Id == id)` y, si es `null`, devuelve `Results.NotFound()`. Como la entidad es una clase (un tipo por referencia), basta con modificar sus propiedades: el objeto de la lista es el mismo. Para el `204` usa `Results.NoContent()`.
:::

:::hint
Para el `DELETE`, `List<T>.RemoveAll(predicado)` elimina los elementos que cumplen la condición y **devuelve cuántos eliminó**. Si es mayor que cero, el proyecto existía. Con eso puedes escribir el handler en una sola expresión con `? :`, porque las dos ramas devuelven `IResult`.
:::

:::solution
```csharp title="Program.cs (añadir antes de app.Run())"
app.MapPut("/api/projects/{id:int}", (int id, UpdateProjectRequest request) =>
{
    var project = projects.Find(p => p.Id == id);
    if (project is null)
    {
        return Results.NotFound();
    }

    project.Name = request.Name;
    project.Description = request.Description;

    return Results.NoContent();
});

app.MapDelete("/api/projects/{id:int}", (int id) =>
    projects.RemoveAll(p => p.Id == id) > 0
        ? Results.NoContent()
        : Results.NotFound());
```

Cómo funciona:

- En el `PUT`, `id` sale de la **ruta** (coincide con `{id:int}`) y `request` del **cuerpo** (es un tipo complejo).
- Como `Find` devuelve una **referencia** al objeto que está en la lista, cambiar `project.Name` cambia el proyecto guardado. No hace falta "volver a guardarlo".
- `PUT` responde `204 No Content`: la operación salió bien y no hay nada nuevo que devolver (el cliente ya conoce los datos que envió).
- En el `DELETE`, `RemoveAll` devuelve el número de elementos borrados. Las dos ramas del `? :` son `IResult`, así que la lambda compila sin problemas.

Resultados esperados: `PUT /api/projects/1` → `204`; `GET /api/projects/1` → `200` con `"name": "Learn EF Core and Minimal APIs"`; `DELETE /api/projects/1` → `204`; el segundo `DELETE` → `404`.
:::
::::

:::troubleshooting Errores comunes
- **`CS0246: The type or namespace name 'Project' could not be found`** (o `'ProjectResponse'`): falta `using TaskTracker.Api.Entities;` o `using TaskTracker.Api.Contracts;` al principio de `Program.cs`, o el `namespace` del archivo no coincide con su carpeta.
- **`CS9035: Required member 'Project.Name' must be set in the object initializer or attribute constructor.`** Creaste un `Project` sin asignar `Name`. Es `required` justamente para que no se te olvide.
- **`CS1678` y `CS1661` en un `MapGet`/`MapPut`:** las ramas de un `? :` o de varios `return` devuelven tipos distintos (por ejemplo, `TypedResults.NotFound()` y `TypedResults.Ok(...)`). En una lambda, usa `Results` para que todas devuelvan `IResult`.
- **`CS8803: Top-level statements must precede namespace and type declarations`:** has pegado un endpoint **después** de una declaración de tipo. En `Program.cs` no debe quedar ninguna; todo el código va antes de `app.Run()`.
- **`415 Unsupported Media Type` en el `POST` o el `PUT`:** falta la cabecera `Content-Type: application/json`, o la línea en blanco entre cabeceras y cuerpo.
- **`400 Bad Request` con un texto largo en lugar de JSON:** el cuerpo no es JSON válido (una coma de más, una comilla sin cerrar). En `Development` verás el detalle del error de lectura.
- **`405 Method Not Allowed` en `PUT` o `DELETE` después del reto:** el `Map*` correspondiente está mal escrito o está después de `app.Run()`, que bloquea la ejecución: nada de lo que va detrás se registra.
:::

:::recap
- Una **entidad** (`Project`) representa algo del dominio con identidad; `required` hace obligatorio un dato al compilar.
- Los **contratos** (`CreateProjectRequest`, `UpdateProjectRequest`, `ProjectResponse`) son `record` posicionales que definen qué entra y qué sale de la API.
- `app.MapGet`, `MapPost`, `MapPut` y `MapDelete` registran endpoints; sus lambdas pueden **capturar** variables de `Program.cs`.
- **Parameter binding:** ruta (por nombre), tipos especiales, servicios de DI, query string (tipos simples) y cuerpo (tipos complejos, solo uno).
- `Results.*` devuelve `IResult`; `TypedResults.*` devuelve tipos concretos que OpenAPI entiende. En lambdas con varias salidas, `TypedResults` no compila sin ayuda.
- La API todavía no valida datos ni devuelve `ProblemDetails` en los `404`.

En el siguiente paso sacarás los endpoints de `Program.cs` a su propio archivo con **route groups**, usarás `Results<...>` para documentar todas las respuestas y harás que los errores salgan como `ProblemDetails`.
:::
