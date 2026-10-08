## Objetivo del paso

En el paso anterior viste que `Program.cs` tiene líneas `app.Use...`. Cada una añade una pieza al **pipeline de middleware**, que es el camino que recorre **toda** petición antes de llegar a tu código y que recorre en sentido inverso la respuesta. Entender este mecanismo es lo que separa a quien "copia plantillas" de quien sabe por qué su API se comporta como lo hace.

En este paso vas a:

1. Entender qué es un middleware y por qué **el orden importa**.
2. Escribir tu primer middleware "en línea" y ver su efecto en la consola.
3. Convertirlo en un middleware **como clase propia**, que mide y registra el tiempo de cada petición. Lo conservaremos hasta el final del tutorial.

## Qué es un middleware

:::concept Middleware y pipeline
Un **middleware** es un componente que recibe una petición HTTP, puede hacer algo con ella y decide si **pasa el control al siguiente** componente. Los middleware se encadenan formando el **pipeline** (tubería).

Cada middleware puede actuar en **dos momentos**:

- **Antes** de llamar al siguiente (la petición va "de ida").
- **Después** de que el siguiente termine (la respuesta va "de vuelta").

```
Petición ──▶ [1 Middleware A] ──▶ [2 Middleware B] ──▶ [3 Middleware C] ──▶ [Endpoint]
                                                                                │
Respuesta ◀── [1 Middleware A] ◀── [2 Middleware B] ◀── [3 Middleware C] ◀──────┘
```

Esto se parece a las capas de una cebolla: la petición atraviesa las capas hacia el centro (tu endpoint) y la respuesta sale por las mismas capas en orden inverso.

La llamada que pasa el control al siguiente componente se suele llamar **`next`**. Un middleware tiene tres opciones:

1. **Hacer algo, llamar a `next` y hacer algo después.** Es lo habitual (medir tiempos, registrar, añadir cabeceras).
2. **Cortocircuitar:** responder él mismo **sin llamar a `next`**. La petición no llega más lejos. Un ejemplo es `UseHttpsRedirection`: responde con una redirección y no deja pasar la petición HTTP.
3. **No hacer nada** y limitarse a llamar a `next`.
:::

:::why ¿Por qué ASP.NET Core usa un pipeline?
Porque separa las preocupaciones transversales (que afectan a *todas* las peticiones) de la lógica de tus endpoints. Autenticación, registro de peticiones, manejo de errores, compresión, CORS… cada una es un middleware independiente que se enciende o apaga con una línea en `Program.cs`. Tu controller no sabe nada de ello: solo se ocupa de libros.
:::

## Los middleware que ya tiene tu Program.cs

Observa el pipeline que armó la plantilla (los comentarios son nuestros):

```csharp
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();            // endpoint /openapi/v1.json (solo en desarrollo)
}

app.UseHttpsRedirection();       // middleware: redirige HTTP -> HTTPS

app.UseAuthorization();          // middleware: comprueba permisos

app.MapControllers();            // endpoints: las rutas de tus controllers
```

| Línea | Tipo | Qué hace |
| --- | --- | --- |
| `UseHttpsRedirection()` | Middleware | Si la petición llega por HTTP y hay un puerto HTTPS conocido, responde `307 Temporary Redirect` hacia la URL HTTPS (cortocircuito). Si no hay puerto HTTPS (como en el perfil `http`), registra el aviso `Failed to determine the https port for redirect` y deja pasar la petición. |
| `UseAuthorization()` | Middleware | Comprueba si el usuario tiene permiso para el endpoint. Hoy no hay reglas, así que deja pasar todo. Más adelante, con autenticación, sería clave. |
| `MapControllers()` | Endpoints | No es un middleware "normal": registra las rutas. El sistema de **routing** de ASP.NET Core elige, según la URL, qué endpoint atiende la petición. |

:::tip Routing implícito
En las versiones antiguas había que llamar a `UseRouting()` y `UseEndpoints()` explícitamente. En las aplicaciones modernas con `WebApplication`, el framework añade el middleware de routing al principio y el de endpoints al final automáticamente; tú solo declaras tus `Map...` y el resto del pipeline.
:::

## El orden importa

Los middleware se ejecutan **en el orden en que los registras**. Cambiar el orden cambia el comportamiento. Dos ejemplos clásicos:

| Si colocas… | Consecuencia |
| --- | --- |
| La **autorización antes** del middleware que identifica al usuario | Se comprueban permisos de un usuario aún desconocido: todo se rechaza. |
| El **manejo de errores al final** del pipeline | Las excepciones que lancen los middleware anteriores no se capturan. Por eso el manejo de errores va **primero** (lo haremos en el paso 14). |

:::warning Regla de oro
Pregúntate siempre: "¿necesita este middleware ver lo que hacen los demás?". Si quiere observar o proteger a todos (medir tiempos, capturar errores), va **al principio**. Si depende del resultado de otros (autorización depende de la autenticación), va **después** de ellos.
:::

## Experimento: tu primer middleware, en línea

La forma más rápida de escribir un middleware es en línea, con `app.Use(...)` y una lambda. Vamos a registrar por consola cuándo entra una petición y cuándo sale la respuesta.

:::vs Añadir el middleware en línea
1. Detén la API si está en ejecución.
2. En `Program.cs`, añade el bloque `app.Use(...)` **justo después de `var app = builder.Build();`**, antes de `if (app.Environment.IsDevelopment())`.
3. Ejecuta con <kbd>Ctrl</kbd> + <kbd>F5</kbd> (perfil **http**).
:::

```csharp title="Program.cs"
var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();

app.Use(async (context, next) =>
{
    Console.WriteLine($"--> Request in: {context.Request.Method} {context.Request.Path}");

    await next(context);

    Console.WriteLine($"<-- Response out: {context.Response.StatusCode}");
});

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.Run();
```

Explicación de lo nuevo:

| Elemento | Qué significa |
| --- | --- |
| `app.Use(...)` | Añade un middleware al pipeline. |
| `async (context, next) => { ... }` | Una lambda asíncrona con dos parámetros. Es el middleware. |
| `context` | Un objeto **`HttpContext`**: contiene todo sobre la petición actual (`context.Request`) y la respuesta que se está construyendo (`context.Response`). |
| `next` | Un delegado que representa **el resto del pipeline**. Llamarlo ejecuta los middleware siguientes y, al final, el endpoint. |
| `await next(context);` | Pasa el control al siguiente componente y **espera** a que termine. Todo lo que escribas antes ocurre "de ida"; todo lo que escribas después, "de vuelta". |
| `context.Response.StatusCode` | El código de estado de la respuesta. Solo es el definitivo **después** de haber llamado a `next`. |

:::concept async y await, en dos líneas
`async` marca un método (o lambda) que puede **esperar** operaciones lentas (red, disco) sin bloquear el hilo. `await` es el punto donde espera. En un servidor web esto es fundamental: mientras una petición espera, el hilo atiende otras. `await next(context)` significa "ejecuta el resto del pipeline y continúa aquí cuando termine". Lo retomaremos en el paso 9 con los archivos.
:::

Envía desde tu `.http` una petición a `/openapi/v1.json` y otra a una ruta inexistente como `/nope`.

:::checkpoint Mira la consola de la API
Por cada petición verás dos líneas: la de entrada y la de salida. Se parecen a esto:

```
--> Request in: GET /openapi/v1.json
warn: Microsoft.AspNetCore.HttpsPolicy.HttpsRedirectionMiddleware[3]
      Failed to determine the https port for redirect.
<-- Response out: 200
--> Request in: GET /nope
<-- Response out: 404
```

Fíjate en tres cosas:

1. La línea `-->` sale **antes** del aviso de `HttpsRedirectionMiddleware`: tu middleware está **antes** en el pipeline. El aviso aparece solo la primera vez que se pasa por ese middleware.
2. La línea `<--` sale **después**: la respuesta vuelve por tu middleware tras haber pasado por todos los demás.
3. Para `/nope`, el código es `404`: ningún endpoint coincidió, pero tu middleware igualmente vio entrar y salir la petición.
:::

### Cortocircuito (opcional)

Si quieres ver un cortocircuito con tus propios ojos, sustituye temporalmente el bloque anterior por este y llama a `/ping`:

```csharp title="Program.cs (experimento opcional)"
app.Use(async (context, next) =>
{
    if (context.Request.Path == "/ping")
    {
        await context.Response.WriteAsync("pong");
        return; // We do not call next: the pipeline stops here.
    }

    await next(context);
});
```

`/ping` responde `pong` aunque no exista ningún endpoint con esa ruta, porque el middleware respondió y **no llamó a `next`**. Las demás rutas siguen funcionando con normalidad. Cuando termines de probar, borra este bloque.

## De middleware en línea a middleware como clase

El middleware en línea es práctico para experimentar, pero tiene límites: no se puede reutilizar, ensucia `Program.cs` y no se puede probar de forma aislada. Para código que vas a conservar, lo habitual es escribir una **clase**.

Vamos a construir un middleware que **mide cuánto tarda cada petición y lo registra en el log**. Lo usaremos hasta el final del tutorial.

### Primero, elimina el middleware en línea

Borra el bloque `app.Use(async (context, next) => { ... });` de `Program.cs` (y el experimento de `/ping` si lo hiciste). `Program.cs` debe volver a su estado original del paso 5.

### Crea la clase

:::vs Crear la carpeta y la clase
1. En Solution Explorer, haz clic derecho sobre el proyecto `Bookshelf.Api` > **Add** > **New Folder**. Nómbrala **`Middleware`**.
2. Haz clic derecho sobre la carpeta `Middleware` > **Add** > **Class…**
3. En el diálogo **Add New Item**, comprueba que está seleccionada la plantilla **Class** y escribe el nombre **`RequestTimingMiddleware.cs`**. Pulsa **Add**.
4. Visual Studio crea un archivo con una clase vacía. **Reemplaza todo su contenido** por el código siguiente.
:::

```csharp title="Middleware/RequestTimingMiddleware.cs"
using System.Diagnostics;

namespace Bookshelf.Api.Middleware;

public class RequestTimingMiddleware(RequestDelegate next, ILogger<RequestTimingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var stopwatch = Stopwatch.StartNew();

        await next(context);

        stopwatch.Stop();
        logger.LogInformation(
            "{Method} {Path} responded {StatusCode} in {ElapsedMs} ms",
            context.Request.Method,
            context.Request.Path,
            context.Response.StatusCode,
            stopwatch.ElapsedMilliseconds);
    }
}

public static class RequestTimingMiddlewareExtensions
{
    public static IApplicationBuilder UseRequestTiming(this IApplicationBuilder app) =>
        app.UseMiddleware<RequestTimingMiddleware>();
}
```

Vamos a explicarlo por partes, porque aquí hay varias ideas nuevas.

### La convención de un middleware como clase

ASP.NET Core reconoce un middleware de clase por dos reglas de **convención** (no hay que heredar de nada):

1. El **constructor** recibe un `RequestDelegate next`: el equivalente del parámetro `next` de la versión en línea, es decir, "el resto del pipeline". Puede recibir además otros servicios.
2. Tiene un método público **`InvokeAsync(HttpContext context)`** que devuelve `Task`. Es el equivalente al cuerpo de la lambda.

| Elemento | Qué significa |
| --- | --- |
| `namespace Bookshelf.Api.Middleware;` | *File-scoped namespace*: el espacio de nombres vale para todo el archivo, sin llaves ni sangría extra. Coincide con la carpeta. |
| `public class RequestTimingMiddleware(RequestDelegate next, ILogger<...> logger)` | Un **constructor primario** (C# 12). Los parámetros se declaran junto al nombre de la clase y están disponibles en toda la clase, sin necesidad de campos privados. Equivale a un constructor clásico que guarda los valores en campos. |
| `RequestDelegate next` | Delegado que ejecuta el siguiente middleware. |
| `ILogger<RequestTimingMiddleware> logger` | Un registrador (*logger*) que ASP.NET Core te **inyecta**. Ver más abajo. |
| `async Task InvokeAsync(HttpContext context)` | Se ejecuta una vez por petición. |
| `Stopwatch.StartNew()` | Crea y arranca un cronómetro (`System.Diagnostics`). Por eso necesitamos el `using` de la primera línea. |
| `await next(context);` | Ejecuta el resto del pipeline. El cronómetro sigue corriendo mientras tanto. |
| `stopwatch.Stop()` / `ElapsedMilliseconds` | Detiene el cronómetro y lee los milisegundos transcurridos. |

:::concept Inyección de dependencias: un adelanto
¿De dónde sale el `ILogger<RequestTimingMiddleware>`? Tú nunca escribes `new` para crearlo: lo **pide** en el constructor y ASP.NET Core se lo entrega. A este mecanismo se le llama **inyección de dependencias** (DI). El framework mantiene un contenedor con "servicios" disponibles (entre ellos, el sistema de logging) y los entrega a quien los pida en su constructor.

Por ahora, retén solo esto: **si una clase necesita algo, lo declara en su constructor y el framework se lo da**. En el paso 8 lo estudiaremos en profundidad, con sus tiempos de vida y su registro.
:::

:::why ¿Por qué el log usa plantillas y no interpolación de cadenas?
Observa el mensaje del log:

```csharp
logger.LogInformation(
    "{Method} {Path} responded {StatusCode} in {ElapsedMs} ms",
    context.Request.Method,
    context.Request.Path,
    context.Response.StatusCode,
    stopwatch.ElapsedMilliseconds);
```

El texto es una **plantilla** con marcadores `{Nombre}` y los valores se pasan aparte, en el mismo orden. Podrías pensar en escribir `$"{method} {path}..."`, pero no se hace por dos razones:

- **Logging estructurado:** el sistema de logs conserva cada valor como un dato con nombre (`Method`, `StatusCode`…). Si más adelante envías los logs a una herramienta de análisis, puedes buscar "todas las peticiones con `StatusCode` 500" sin analizar texto.
- **Rendimiento:** si el nivel de log está desactivado, la plantilla no se formatea. Con una cadena interpolada, el texto se construye siempre, aunque nadie lo lea.

Los marcadores se rellenan **por posición**, no por nombre: el primer valor va al primer marcador. Los nombres sirven para documentar y para el almacenamiento estructurado.
:::

### El método de extensión `UseRequestTiming`

La segunda clase es un patrón estándar de ASP.NET Core:

```csharp
public static class RequestTimingMiddlewareExtensions
{
    public static IApplicationBuilder UseRequestTiming(this IApplicationBuilder app) =>
        app.UseMiddleware<RequestTimingMiddleware>();
}
```

- Un **método de extensión** es un método estático que se puede llamar como si fuera un método de otro tipo. El modificador `this` en el primer parámetro (`this IApplicationBuilder app`) es lo que lo convierte en extensión de `IApplicationBuilder`.
- Gracias a eso, en `Program.cs` podemos escribir `app.UseRequestTiming()` igual que `app.UseHttpsRedirection()`: todos los middleware se ven iguales, aunque estén implementados distinto.
- `app.UseMiddleware<RequestTimingMiddleware>()` es la llamada real que registra la clase en el pipeline.
- El `=>` define un método con **cuerpo de expresión** (una sola expresión, sin llaves ni `return`).

Por convención, se nombra la extensión como `Use` + el nombre de la funcionalidad, y se deja junto al middleware.

### Regístralo en Program.cs

El middleware se debe registrar en el pipeline. Hay que decidir **dónde**.

```csharp title="Program.cs"
using Bookshelf.Api.Middleware;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();

app.UseRequestTiming();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.Run();
```

Cambios respecto al `Program.cs` original:

1. **`using Bookshelf.Api.Middleware;`** al principio: sin él, el compilador no encuentra `UseRequestTiming`, porque la extensión vive en ese espacio de nombres.
2. **`app.UseRequestTiming();`** justo después de `Build()`: es el **primer** middleware.

:::why ¿Por qué lo colocamos el primero?
Porque queremos medir **todo el tiempo** que tarda una petición. Si lo pusiéramos después de `UseHttpsRedirection`, no mediríamos lo que tarda esa parte del pipeline; y si hubiera un middleware antes que corta la petición (por ejemplo, uno de errores), esas peticiones no aparecerían en los registros. Al colocarlo el primero, es lo primero que ve la petición y lo último que ve la respuesta: rodea a todos los demás.
:::

Ejecuta con <kbd>Ctrl</kbd> + <kbd>F5</kbd> y envía una petición a `/openapi/v1.json` y otra a `/nope`.

:::checkpoint Cada petición queda registrada con su duración
En la consola, tras cada petición, aparece un mensaje de nivel `info` con el nombre completo de tu clase como categoría:

```
info: Bookshelf.Api.Middleware.RequestTimingMiddleware[0]
      GET /openapi/v1.json responded 200 in 36 ms
info: Bookshelf.Api.Middleware.RequestTimingMiddleware[0]
      GET /nope responded 404 in 0 ms
```

Los milisegundos variarán (la primera petición suele tardar más porque el código se está compilando con JIT). Si ves estas líneas, tu primer middleware de clase funciona. Este middleware se queda en el proyecto.
:::

:::tip Qué es el [0]
El número entre corchetes es el *event id* del log. Como no hemos asignado uno, vale `0`. Puedes ignorarlo.
:::

:::troubleshooting Errores comunes
- **`CS1061: 'WebApplication' does not contain a definition for 'UseRequestTiming' and no accessible extension method…`:** falta `using Bookshelf.Api.Middleware;` al principio de `Program.cs`, o el nombre de la clase de extensión o del método está mal escrito.
- **`CS0103: The name 'Stopwatch' does not exist in the current context`:** falta `using System.Diagnostics;` en el archivo del middleware.
- **No aparece ningún mensaje en la consola:** comprueba que ejecutaste la versión actual (detén y vuelve a iniciar) y que la petición llegó a la API. Si tu `appsettings.json` tiene un nivel de log más alto que `Information`, no verás estos mensajes.
- **Las peticiones se quedan "colgadas" o devuelven respuesta vacía:** tu middleware no llama a `await next(context)` (por ejemplo, por una condición que lo salta). Sin esa llamada, el pipeline se corta.
- **`InvalidOperationException: Headers are read-only, response has already started`:** intentaste modificar cabeceras de la respuesta *después* de `await next(context)`. Lo verás en el reto siguiente.
:::

::::challenge Un middleware que añade una cabecera
Practica la forma en línea que has usado. Escribe un middleware (`app.Use`) que añada a **todas** las respuestas la cabecera `X-Powered-By-Workshop: ASP.NET Core`. Compruébalo en el panel de respuesta del `.http` (pestaña de cabeceras).

Antes de resolverlo, piensa: ¿la cabecera hay que añadirla **antes** o **después** de llamar a `next`? ¿Por qué?

:::hint
Una cabecera de respuesta es un valor en `context.Response.Headers`, que se usa como un diccionario: `context.Response.Headers["Nombre"] = "valor";`.
:::

:::hint
Una respuesta HTTP empieza por la línea de estado y las **cabeceras**, y después va el cuerpo. En cuanto el servidor empieza a enviar el cuerpo, las cabeceras ya se han enviado y no se pueden cambiar. ¿Qué momento es seguro, antes o después de `next`?
:::

:::hint
Escribe un `app.Use(async (context, next) => { ... })` justo después de `app.UseRequestTiming();`. Dentro, asigna la cabecera **antes** de `await next(context);`.
:::

:::solution
```csharp title="Program.cs"
var app = builder.Build();

app.UseRequestTiming();

app.Use(async (context, next) =>
{
    context.Response.Headers["X-Powered-By-Workshop"] = "ASP.NET Core";

    await next(context);
});
```

La cabecera se asigna **antes** de `await next(context)`. En ese momento la respuesta todavía no ha empezado, así que las cabeceras se pueden modificar. Todas las respuestas (`200`, `404`…) incluyen `X-Powered-By-Workshop: ASP.NET Core`.

**¿Y si se asigna después de `next`?** Para cuando `next` termina, el endpoint ya ha empezado a escribir la respuesta y Kestrel ha enviado las cabeceras. Intentar modificarlas entonces lanza `System.InvalidOperationException: Headers are read-only, response has already started.`

Si realmente necesitas decidir una cabecera con información que solo existe al final (por ejemplo, el código de estado), existe una alternativa: registrar una acción con `context.Response.OnStarting(...)`, que se ejecuta justo antes de enviar las cabeceras:

```csharp title="Program.cs (alternativa)"
app.Use(async (context, next) =>
{
    context.Response.OnStarting(() =>
    {
        context.Response.Headers["X-Powered-By-Workshop"] = "ASP.NET Core";
        return Task.CompletedTask;
    });

    await next(context);
});
```

**Importante:** este middleware era solo un ejercicio. **Elimínalo** de `Program.cs` antes de continuar. Deja únicamente `app.UseRequestTiming();`.
:::
::::

:::recap
- Un **middleware** recibe la petición, puede actuar **antes y después** de `next`, o cortocircuitar sin llamarlo. Los middleware forman el **pipeline** y su **orden** determina el comportamiento.
- `UseHttpsRedirection` y `UseAuthorization` son middleware de la plantilla; `MapControllers` registra los endpoints.
- Un middleware en línea (`app.Use`) sirve para experimentar; uno **como clase** necesita un constructor con `RequestDelegate next` y un método `InvokeAsync(HttpContext)`.
- Creaste `Middleware/RequestTimingMiddleware.cs` con su extensión `UseRequestTiming()` y lo registraste **el primero** para medir todo el pipeline.
- Viste el logging estructurado con plantillas y un adelanto de la inyección de dependencias (`ILogger<T>` entregado por el framework).
- Las cabeceras de respuesta solo se pueden modificar **antes** de que la respuesta empiece.

En el siguiente paso construirás el modelo `Book` y tu primer **controller**, y por fin la API devolverá libros.
:::
