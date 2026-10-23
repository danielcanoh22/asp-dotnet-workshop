## Objetivo del paso

Tu API ya responde con `ProblemDetails` a casi todos sus errores, y la validación ya está en su sitio. Pero si comparas un `400`, un `404` y un `409` uno al lado del otro, verás que no siempre dicen lo mismo ni de la misma forma. En este paso haces que **todos los errores hablen el mismo idioma**. Vas a:

1. Revisar qué campos traen hoy tus errores y qué les falta para ser útiles a un cliente.
2. Añadir `instance` a **todas** las respuestas de error con `CustomizeProblemDetails`.
3. Entender de dónde sale `traceId`, que ya tienes sin escribir nada.
4. Crear `Errors/ApiProblems.cs`, un catálogo de errores de negocio con un **`code` estable** que una máquina puede leer.
5. Repasar cómo se documentan los errores en OpenAPI y fijar la regla que seguirás en los próximos pasos.

## Lo que devuelven hoy tus errores

Ejecuta la API y lanza estas tres peticiones (las tres están ya en `errors.http`):

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "errors": { "Name": ["'Name' must not be empty."] },
  "traceId": "00-a06eae7aff4977676c02863665f636e6-6b6428fd8b2a8768-00"
}
```

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Not Found",
  "status": 404,
  "traceId": "00-b95e41d951f39f0650af4c65c1f8beaa-7d2c0bfc79d89d90-00"
}
```

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Tag already exists",
  "status": 409,
  "detail": "A tag named 'backend' already exists.",
  "traceId": "00-31227c20e545b6f218603d2bb76ff789-9c5ef23f7aa529ba-00"
}
```

Son el `POST /api/projects` con nombre vacío, el `GET /api/projects/999` y el `POST /api/tags` con `backend`. Los tres tienen la forma de RFC 9457 que repasaste en el paso 1. Pero piensa en quien los recibe:

| Pregunta del cliente | ¿Se puede responder hoy? |
| --- | --- |
| ¿Qué tipo de error es? | Sí, con `status`. Pero un `409` puede significar muchas cosas distintas. |
| ¿**Cuál** de los `409` es, para reaccionar en código? | Solo comparando `title`, un texto pensado para personas que puede cambiar mañana. |
| ¿Qué petición falló? | No: la respuesta no lo dice. Si tu cliente envía diez peticiones en paralelo, tiene que adivinarlo. |
| ¿Cómo encuentro este error en los logs del servidor? | Con `traceId`, que ya viene. Ahora verás por qué. |

Vas a resolver las dos filas que faltan: **`instance`** para saber qué petición falló, y un **`code`** para saber qué error es.

## instance: qué petición falló

:::concept CustomizeProblemDetails
`AddProblemDetails()` registra el servicio que escribe los `ProblemDetails` de toda la aplicación (`IProblemDetailsService`). Admite opciones, y la más útil es **`CustomizeProblemDetails`**: una función que se ejecuta **justo antes de escribir cada `ProblemDetails`**, venga de donde venga:

- Los `400` de validación (`TypedResults.ValidationProblem` en tu `ValidationFilter<T>`).
- Los `409` que creas con `TypedResults.Problem(...)`.
- Los `404` sin cuerpo que `UseStatusCodePages` convierte en `ProblemDetails`.
- Los errores que escribirán tus manejadores de excepciones en los pasos 9 y 10.

Recibe un `ProblemDetailsContext` con el `HttpContext` y el `ProblemDetails` que está a punto de salir, y puede modificarlo. Es el lugar perfecto para añadir lo que **todos** los errores deben llevar.
:::

Abre `Program.cs` y reemplaza la línea `builder.Services.AddProblemDetails();` por esta llamada con opciones:

```csharp title="Program.cs (sección Services, solo cambia AddProblemDetails)"
// --- Services ---
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails(options =>
    // Runs for every ProblemDetails the app writes: validation, TypedResults.Problem and exception handlers.
    options.CustomizeProblemDetails = context =>
        context.ProblemDetails.Instance ??=
            $"{context.HttpContext.Request.Method} {context.HttpContext.Request.Path}");
```

Lo que hace cada parte:

- **`context.ProblemDetails.Instance`** es la propiedad `instance` del JSON.
- **`??=`** asigna solo si todavía es `null`. Si algún código ya puso su propio `instance`, se respeta.
- **`Request.Method` y `Request.Path`** dan algo como `GET /api/projects/999`. No incluimos la *query string*: puede llevar datos que no quieres repetir en un error.

:::why ¿Por qué "GET /api/projects/999" y no solo la ruta?
RFC 9457 define `instance` como una **referencia URI** que identifica *esta aparición concreta* del problema. Muchas APIs ponen ahí la ruta (`/api/projects/999`); nosotros añadimos el método delante porque `GET` y `DELETE` sobre la misma ruta son operaciones muy distintas, y al leer un error en un log lo agradecerás. El precio es que, con el espacio, el valor ya no es una URI estricta. Si tu equipo prefiere ceñirse al estándar al pie de la letra, quita `{Request.Method} ` y deja solo la ruta: el resto del tutorial funciona igual.
:::

## traceId: ya viene de serie

No has escrito nada para tener `traceId`, y aun así aparece en todas las respuestas. Lo añade el servicio de `ProblemDetails` de ASP.NET Core, a partir del identificador de la traza de la petición actual.

:::concept Qué es el traceId
Cada petición que entra en ASP.NET Core recibe un identificador de traza con el formato estándar de **W3C Trace Context**: `00-<trace-id>-<span-id>-00`. Si el cliente envía la cabecera `traceparent`, la petición continúa su traza (mismo `trace-id`); si no, empieza una nueva.

Su valor está en la **correlación**: un usuario te pasa el `traceId` de un error y tú lo buscas en tu sistema de logs o de trazas (por ejemplo, con OpenTelemetry) para ver todo lo que ocurrió en esa petición. El log de consola que usas en este tutorial no lo muestra por defecto, así que aquí te limitarás a verlo en las respuestas; lo importante es que el cliente ya lo recibe sin que hagas nada.
:::

Por eso no tienes que programarlo: `instance` es la única propiedad nueva que necesita `CustomizeProblemDetails`.

## Un catálogo de errores: ApiProblems

Ahora el problema de los `409`. Hoy solo tienes uno, el de las etiquetas duplicadas. En los próximos pasos tendrás varios más: proyectos con tareas abiertas, demasiadas etiquetas, valores duplicados en la base de datos, conflictos de concurrencia. Todos con `status: 409`. ¿Cómo distingue un cliente uno de otro?

:::concept Un código legible por máquinas
`title` y `detail` son para **personas**: puedes mejorar su redacción, traducirlos o añadir datos (`A tag named 'backend'...`). Precisamente por eso un cliente no debe tomar decisiones comparándolos.

La solución habitual es añadir una **extensión**: una propiedad extra del `ProblemDetails`, permitida por RFC 9457. La nuestra se llama **`code`** y contiene un identificador corto y **estable**, que nunca cambia aunque cambie el texto:

| Campo | Para quién | ¿Puede cambiar? |
| --- | --- | --- |
| `status` | Clientes HTTP genéricos, proxies, monitores | No |
| `code` | Tu cliente, en su código: `if (problem.code == "tag.already_exists")` | No: es parte del contrato de la API |
| `title`, `detail` | Personas que leen el error | Sí |

Usaremos la convención `<área>.<error>` en minúsculas: `tag.already_exists`, `project.has_open_tasks`...
:::

:::why ¿Y el campo type?
RFC 9457 propone que el identificador principal de un problema sea `type`: una URI (por ejemplo, `https://api.example.com/problems/tag-already-exists`) que idealmente apunta a una página que lo documenta. Es la opción más fiel al estándar, pero exige publicar y mantener una URI por error. Muchas APIs hacen lo que haremos aquí: dejar en `type` el valor genérico que ASP.NET Core pone según el `status` (el enlace a la sección de RFC 9110) y añadir `code`. Las dos opciones son válidas; lo que importa es elegir una y aplicarla **siempre**.
:::

Un catálogo centraliza esa decisión: cada error de negocio se crea en un único sitio, con la misma forma y su `code`. Si mañana cambias el formato, lo cambias una vez.

:::vs Crear Errors/ApiProblems.cs
1. Clic derecho sobre el proyecto `TaskTracker.Api` > **Add** > **New Folder** > **`Errors`**.
2. Clic derecho sobre la carpeta `Errors` > **Add** > **Class…** > **`ApiProblems.cs`**, y reemplaza todo su contenido por el siguiente.
:::

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

    private static ProblemHttpResult Conflict(string code, string title, string detail) =>
        TypedResults.Problem(
            statusCode: StatusCodes.Status409Conflict,
            title: title,
            detail: detail,
            extensions: new Dictionary<string, object?> { ["code"] = code });
}
```

- **Una clase estática con un método por error.** `TagAlreadyExists(name)` es todo lo que necesita saber quien lo usa; el código, el título y el estado viven aquí.
- **`Conflict(...)` es privado**: el resto de la API no crea `409` a mano, los pide al catálogo. En el paso siguiente añadirás dos errores más con el mismo ayudante.
- **`extensions`** es un diccionario cuyas entradas se escriben como propiedades de primer nivel del JSON: `["code"] = code` se convierte en `"code": "tag.already_exists"`.
- **Devuelve `ProblemHttpResult`**, el mismo tipo que ya devolvía `TypedResults.Problem(...)`. Por eso el handler no cambia de firma.

Ahora usa el catálogo en el único sitio que crea un `409` hoy. En `Endpoints/TagEndpoints.cs`, añade el `using` junto a los demás:

```csharp title="Endpoints/TagEndpoints.cs (using nuevo, tras TaskTracker.Api.Entities)"
using TaskTracker.Api.Errors;
```

Y reemplaza el método `Create` por este. Solo cambia el `return` del `409`:

```csharp title="Endpoints/TagEndpoints.cs (método Create)"
private static async Task<Results<Created<TagResponse>, ProblemHttpResult>> Create(
    CreateTagRequest request, TaskTrackerDbContext db, CancellationToken cancellationToken)
{
    var name = request.Name.ToLowerInvariant();

    if (await db.Tags.AnyAsync(t => t.Name == name, cancellationToken))
    {
        return ApiProblems.TagAlreadyExists(name);
    }

    var tag = new Tag { Name = name };
    db.Tags.Add(tag);
    await db.SaveChangesAsync(cancellationToken);

    return TypedResults.Created($"/api/tags/{tag.Id}", new TagResponse(tag.Id, tag.Name, 0));
}
```

:::tip ¿Por qué no ponemos un code a los 400 y 404?
Los `400` de validación ya tienen su propia estructura legible por máquinas: el diccionario `errors`, campo por campo. Y un `404` sin más significa siempre lo mismo: "eso no existe". El `code` resuelve un problema concreto, **varios errores distintos con el mismo `status`**, y ese problema hoy solo lo tienen los `409` (y el `500` que añadirás en el paso 9).
:::

## Documentar los errores en OpenAPI

Un cliente no debería descubrir tus errores probando. En el tutorial 2 aprendiste las dos piezas que los documentan en `/openapi/v1.json` y en Scalar:

- **`.ProducesValidationProblem()`**: el `400` de validación. Ya lo añade por ti tu `WithValidation<T>()` del paso 5.
- **`.ProducesProblem(StatusCodes.Status409Conflict)`**: un `409` con `ProblemDetails`. `POST /api/tags` lo tiene desde el tutorial 2.

Los `Results<...>` tipados documentan solos el resto (`201`, `204`, `404`). Lo que el tipo de retorno **no** puede expresar es un `409` escondido dentro de un `ProblemHttpResult`, cuyo código solo se conoce al ejecutarlo.

:::concept La regla para los próximos pasos
**Cada endpoint que pueda devolver un `409` lo declara con `.ProducesProblem(StatusCodes.Status409Conflict)`.** En los pasos 8 y 11 añadirás `409` a `DELETE /api/projects/{id}`, `POST /api/tasks/{id}/tags` y `PUT /api/tasks/{id}`, y cada uno llevará su línea.

OpenAPI documenta el **formato** de la respuesta (`application/problem+json` con el esquema de `ProblemDetails`), pero no la lista de valores posibles de `code`. Esa lista es parte de la documentación de tu API: la tendrás completa, como catálogo, en el paso 12.
:::

Abre `http://localhost:5283/openapi/v1.json` (con **tu** puerto) y busca `"/api/tags"`: en su `post` aparecen las respuestas `201`, `400` y `409`, las dos últimas con `application/problem+json`. Lo mismo verás en `/scalar`.

:::checkpoint Errores con instance y code
Compila, reinicia la API y lanza estas peticiones (todas están en `errors.http`, salvo la última):

| Petición | Resultado esperado |
| --- | --- |
| `POST /api/projects` con `{ "name": "" }` | `400`, el mismo `errors` de antes y ahora `"instance": "POST /api/projects"`. |
| `GET /api/projects/999` | `404` con `"instance": "GET /api/projects/999"`. |
| `GET /api/projects/1/tasks?status=Unknown` | `400` (`"title": "Bad Request"`) con `"instance": "GET /api/projects/1/tasks"`: sin la *query string*. |
| `POST /api/tags` con `{ "name": "backend" }` | `409` con `code` e `instance` (abajo). |
| `POST /api/tags` con `{ "name": "Backend" }` | El mismo `409`: el nombre se normaliza a minúsculas antes de comprobarlo. |

La respuesta completa del `409`:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Tag already exists",
  "status": 409,
  "detail": "A tag named 'backend' already exists.",
  "instance": "POST /api/tags",
  "code": "tag.already_exists",
  "traceId": "00-f8db4fb7d46d59f0cf8fbfc509d411ea-97db66e4752f3b61-00"
}
```

Tu `traceId` será distinto en cada petición: se genera uno nuevo cada vez.
:::

:::troubleshooting Errores comunes
- **`CS0103: The name 'ApiProblems' does not exist in the current context`:** falta `using TaskTracker.Api.Errors;` en `TagEndpoints.cs`, o creaste la clase fuera de la carpeta `Errors` con otro `namespace`.
- **No aparece `instance`:** la API no se reinició tras compilar. Detenla, compila y vuelve a ejecutarla.
- **`CS1061: 'ProblemDetailsContext' does not contain a definition for 'Request'`:** el método y la ruta están en `context.HttpContext.Request`, no en `context.Request`.
- **`code` aparece como `"Code"` o no aparece:** comprueba que la clave del diccionario es `"code"`, en minúsculas, y que el `return` del `409` usa `ApiProblems.TagAlreadyExists(name)` y no el `TypedResults.Problem(...)` anterior.
- **`instance` sale con la *query string*:** usaste `Request.QueryString` o `GetDisplayUrl()`. Usa solo `Request.Path`.
:::

:::recap
- Un error útil responde a cuatro preguntas: qué clase de error (`status`), cuál exactamente (`code`), qué petición (`instance`) y cómo encontrarlo en los logs (`traceId`).
- **`CustomizeProblemDetails`** se ejecuta antes de escribir **cada** `ProblemDetails` de la aplicación: es el sitio para lo que todos los errores deben llevar.
- `??=` añade `instance` solo si nadie lo puso antes.
- `traceId` lo añade ASP.NET Core por su cuenta, con el formato de W3C Trace Context.
- `title` y `detail` son para personas y pueden cambiar; **`code`** es para máquinas y es parte del contrato.
- `Errors/ApiProblems.cs` centraliza los errores de negocio: misma forma, mismo `status` y un `code` estable.
- Todo endpoint que pueda devolver `409` lo declara con `.ProducesProblem(StatusCodes.Status409Conflict)`.

En el siguiente paso usarás el catálogo para lo que de verdad lo justifica: **reglas de negocio** que la validación no puede comprobar.
:::
