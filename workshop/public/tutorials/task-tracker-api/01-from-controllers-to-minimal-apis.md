## Objetivo del paso

En el tutorial 1 construiste Bookshelf con **controllers**. Este tutorial usa **Minimal APIs**, otra forma de escribir endpoints en ASP.NET Core. Antes de crear el proyecto conviene tener claro qué cambia y, sobre todo, qué **no** cambia: casi todo lo que aprendiste sigue valiendo.

En este paso, sin escribir código todavía, vas a:

1. Recordar qué pasaba en Bookshelf cuando llegaba una petición a un controller.
2. Entender qué es una **Minimal API** y ver el mismo endpoint escrito en los dos estilos.
3. Separar lo que cambia (rutas, resultados, organización) de lo que se mantiene (host, middleware, DI, `ProblemDetails`).
4. Saber cuándo elegir cada estilo en un proyecto real.

## Lo que ya sabes: un endpoint con controller

Este es, simplificado, el `GetById` de Bookshelf:

```csharp
[ApiController]
[Route("api/[controller]")]
public class BooksController(IBookService bookService) : ControllerBase
{
    [HttpGet("{id:int}")]
    public ActionResult<BookResponse> GetById(int id)
    {
        var book = bookService.GetById(id);
        return book is null ? NotFound() : Ok(book);
    }
}
```

Para que esa acción se ejecute, el framework hace bastante trabajo por ti:

| Pieza | Quién la aporta |
| --- | --- |
| Encontrar la clase | `AddControllers()` + `MapControllers()` escanean el proyecto buscando clases que heredan de `ControllerBase`. |
| La ruta | Se compone a partir de **atributos**: `[Route]` en la clase y `[HttpGet("{id:int}")]` en el método. |
| Las dependencias | El contenedor de DI crea **una instancia nueva del controller por petición** y le pasa `IBookService` por el constructor. |
| El `400` automático | `[ApiController]` valida los DTOs y responde `400` con `ProblemDetails` antes de entrar a tu acción. |
| La respuesta | Los métodos auxiliares de `ControllerBase` (`Ok()`, `NotFound()`…) construyen el resultado. |

Es un modelo cómodo: la clase impone una estructura y muchas cosas ocurren "por convención". El precio es que hay mucha maquinaria entre la petición y tu código, y parte de ella es invisible.

## Qué es una Minimal API

:::concept Minimal API
Una **Minimal API** declara cada endpoint directamente sobre la aplicación, con tres piezas: un **verbo HTTP**, una **ruta** y una **función** que atiende la petición (el *handler*, o manejador).

```csharp
app.MapGet("/hello", () => "Hello world");
```

- `MapGet` dice "atiende peticiones `GET`".
- `"/hello"` es la plantilla de ruta, con la misma sintaxis que ya conoces (`{id:int}` incluido).
- `() => "Hello world"` es el handler: una lambda, un método con nombre o cualquier *delegate*. Lo que devuelve se convierte en la respuesta.

No hay clase base, ni atributos obligatorios, ni escaneo del proyecto. El endpoint existe porque **tú lo registraste** en una línea de código.
:::

El mismo `GetById` de Bookshelf, como Minimal API, quedaría así:

```csharp
app.MapGet("/api/books/{id:int}", (int id, IBookService bookService) =>
{
    var book = bookService.GetById(id);
    return book is null ? Results.NotFound() : Results.Ok(book);
});
```

Fíjate en tres diferencias:

1. **La ruta completa está escrita en un solo sitio**, como texto, no repartida entre dos atributos.
2. **Las dependencias son parámetros del handler**, no del constructor de una clase. `id` sale de la ruta y `IBookService` sale del contenedor de DI: el framework sabe distinguirlos (lo estudiarás en el paso 3).
3. **Los resultados se crean con `Results`** (o con `TypedResults`, que verás en el paso 4), porque ya no hay una clase base que te dé `Ok()` y `NotFound()`.

:::concept Handler
El **handler** es la función que se ejecuta cuando una petición coincide con la ruta y el verbo de un endpoint. En una Minimal API puede ser:

- una **lambda** escrita en el mismo `MapGet` (lo harás en el paso 3);
- un **método estático con nombre** en otra clase (lo harás en el paso 4, y es lo que usarás el resto del tutorial).

Para el framework las dos formas son equivalentes: en ambos casos lee la firma del método (sus parámetros y su tipo de retorno) para saber qué datos necesita y qué devuelve.
:::

## Qué cambia y qué se mantiene

La buena noticia: una Minimal API es una aplicación ASP.NET Core normal. El host, el pipeline y el contenedor de DI son **exactamente los mismos**. Lo que cambia es solo la última pieza, la que convierte una petición en una llamada a tu código.

| Se mantiene igual (tutorial 1) | Cambia en Minimal APIs |
| --- | --- |
| El **host**: `CreateBuilder`, `builder.Services`, `Build()`, `Run()`. | No hay `AddControllers()` ni `MapControllers()`: cada endpoint se registra con `MapGet`, `MapPost`… |
| El **pipeline de middleware** y su orden. | Las rutas no se escriben con atributos, sino como texto en `Map*`. |
| La **inyección de dependencias**: registro en `builder.Services` y tiempos de vida. | Las dependencias se piden como **parámetros del handler**, no en un constructor. |
| La **configuración** (`appsettings.json`) y el **logging**. | Las respuestas se crean con `Results` / `TypedResults`, no con `Ok()` de `ControllerBase`. |
| **`ProblemDetails`** como formato de error. | No hay `[ApiController]`: el `400` automático por validación se activa aparte, con `AddValidation()` (paso 12). |
| **OpenAPI** y los archivos **`.http`**. | La organización del código es decisión tuya: usarás **route groups** para no acabar con un `Program.cs` gigante (paso 4). |

:::why ¿Por qué no hay una instancia por petición?
Un controller es una clase: para ejecutar una acción, el framework crea un objeto, le inyecta sus dependencias por constructor y lo descarta al terminar. Si el controller tiene diez acciones y solo una necesita un servicio caro, ese servicio se crea igualmente para las diez.

En una Minimal API cada handler declara **solo lo que necesita**. Si `GetById` pide un `IBookService` y `Delete` no, `Delete` nunca lo recibe. Menos trabajo por petición y dependencias más fáciles de ver: basta con leer la firma del handler.
:::

### ¿Y el `[ApiController]`?

Echarás de menos dos cosas que ese atributo hacía por ti:

- **Validación automática.** En Minimal APIs, desde .NET 10, se activa con `builder.Services.AddValidation()`. Hasta el paso 12 tu API aceptará datos incompletos, y lo comprobarás a propósito para ver el problema antes de resolverlo.
- **Los `404` convertidos en `ProblemDetails`.** Aquí lo conseguirás con dos middlewares que ya intuyes por el tutorial 1: `UseExceptionHandler` y `UseStatusCodePages` (paso 4).

Lo que **sí** hace el framework solo es rechazar con `400 Bad Request` las peticiones que ni siquiera puede leer: un JSON mal formado, un `id` que no es un número en un parámetro obligatorio… En esos casos tu handler no llega a ejecutarse.

## ¿Cuándo usar cada estilo?

La documentación oficial de ASP.NET Core (*APIs overview*) es directa: **para proyectos nuevos, recomienda Minimal APIs**, por su sintaxis más simple, su menor sobrecarga y porque aprovechan las novedades recientes de .NET. Los controllers siguen siendo un estilo válido y plenamente soportado.

| Situación | Estilo razonable |
| --- | --- |
| API nueva, de cualquier tamaño | **Minimal APIs**, organizadas con route groups. |
| Proyecto existente escrito con controllers | **Controllers**: no hay motivo para reescribirlo. Puedes añadir Minimal APIs al lado si quieres. |
| Necesitas extensiones avanzadas de MVC: *model binders* personalizados (`IModelBinder`), *application parts*, OData | **Controllers**: las traen de serie. Con Minimal APIs habría que construirlas a mano. |
| Equipo muy habituado al patrón MVC | Cualquiera de los dos; la curva de aprendizaje de Minimal APIs es corta. |

:::tip Los dos estilos pueden convivir
Una misma aplicación puede tener controllers **y** Minimal APIs: basta con llamar a `AddControllers()`/`MapControllers()` y, además, registrar endpoints con `MapGet`. Es útil para migrar poco a poco un proyecto antiguo.
:::

### Dos ideas equivocadas frecuentes

| Se suele decir | En realidad |
| --- | --- |
| "Las Minimal APIs son para demos de una línea." | Se llaman *minimal* por la ceremonia que eliminan, no por el tamaño de la aplicación. Con route groups y métodos con nombre escalan a APIs grandes. Lo harás en el paso 4. |
| "Con Minimal APIs todo acaba en `Program.cs`." | Solo si tú lo pones ahí. En este tutorial `Program.cs` quedará en unas 60 líneas: cada recurso tendrá su propio archivo en `Endpoints/`. |

## El camino del tutorial

Para no aprender dos cosas nuevas a la vez, separamos los temas:

| Pasos | Tema | Dónde viven los datos |
| --- | --- | --- |
| 2 a 4 | **Minimal APIs**: endpoints, binding, resultados, route groups. | En una lista en memoria (provisional). |
| 5 a 7 | **EF Core**: ORM, `DbContext`, configuración, migraciones. | Se crea la base de datos SQLite, pero los endpoints aún no la usan. |
| 8 a 14 | **Los dos juntos**: CRUD con EF Core, relaciones, consultas, validación, rendimiento. | En SQLite. |

:::checkpoint Antes de seguir
**1. Comprueba tu entorno.** Abre una terminal (por ejemplo, en Visual Studio: **View** > **Terminal**) y ejecuta:

```powershell
dotnet --list-sdks
```

Debe aparecer al menos una línea que empiece por `10.`, por ejemplo `10.0.401 [C:\Program Files\dotnet\sdk]`. Tu número exacto puede ser otro.

**2. Comprueba que tienes claras las ideas.** Responde mentalmente antes de leer las respuestas que hay justo debajo:

- ¿De dónde saca el framework el valor de `id` y el de `IBookService` en `(int id, IBookService bookService) => ...`?
- ¿Qué tres cosas definen un endpoint de Minimal API?
- Nombra dos cosas que **no** cambian respecto a Bookshelf.

Respuestas: `id` sale de la **ruta** (porque coincide con `{id:int}`) e `IBookService` del **contenedor de DI** (porque está registrado como servicio). Un endpoint se define con **verbo**, **ruta** y **handler**. Se mantienen, entre otras cosas, el host, el pipeline de middleware, la DI, la configuración, `ProblemDetails`, OpenAPI y los archivos `.http`.
:::

:::troubleshooting Errores comunes
- **`dotnet --list-sdks` no muestra ninguna versión `10.x`:** abre el **Visual Studio Installer**, pulsa **Modificar** (*Modify*) en tu Visual Studio 2026 y marca la carga de trabajo **ASP.NET y desarrollo web**. Al terminar, cierra y vuelve a abrir la terminal.
- **`'dotnet' no se reconoce como un comando interno o externo`:** el SDK no está en el `PATH`, normalmente porque la terminal se abrió antes de instalarlo. Ciérrala y abre una nueva; si persiste, reinicia Windows.
- **"No recuerdo cómo funcionaba la inyección de dependencias":** repasa el paso 8 del tutorial 1, sobre todo los tiempos de vida *singleton* y *scoped*. Los usarás en los pasos 4 y 6.
:::

:::recap
- Una **Minimal API** registra cada endpoint con un **verbo**, una **ruta** y un **handler** (`app.MapGet("/ruta", handler)`).
- El host, el middleware, la DI, la configuración, `ProblemDetails` y OpenAPI funcionan **igual** que con controllers.
- Cambian las rutas (texto en vez de atributos), las dependencias (parámetros del handler en vez de constructor) y los resultados (`Results`/`TypedResults` en vez de `Ok()`).
- No hay `[ApiController]`: la validación automática se activa con `AddValidation()` y los errores estándar con middleware.
- Microsoft recomienda Minimal APIs para proyectos nuevos; los controllers siguen siendo válidos, sobre todo en proyectos existentes.

En el siguiente paso crearás el proyecto `TaskTracker.Api` en Visual Studio 2026, esta vez **sin** controllers.
:::
