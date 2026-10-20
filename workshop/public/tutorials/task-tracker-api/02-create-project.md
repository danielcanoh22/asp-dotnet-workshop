## Objetivo del paso

En este paso vas a crear la solución `TaskTracker` con el proyecto `TaskTracker.Api`, esta vez como **Minimal API**. En concreto vas a:

1. Crear el proyecto con Visual Studio 2026 eligiendo bien cada opción, en especial **"Use controllers" desmarcada**.
2. Recorrer lo que genera la plantilla y compararlo con lo que conociste en Bookshelf.
3. Ejecutar el endpoint de ejemplo desde el archivo `.http`.
4. **Borrar el ejemplo del tiempo** y dejar un `Program.cs` limpio y ordenado por secciones, listo para Task Tracker.

Si hiciste el tutorial 1, gran parte de este paso te sonará: avanzaremos rápido por lo conocido y nos detendremos en lo que cambia.

## Crea la solución y el proyecto

Igual que en Bookshelf, la solución y el proyecto tendrán nombres distintos: `TaskTracker` para la solución y `TaskTracker.Api` para el proyecto. Así queda sitio para añadir, en el futuro, un proyecto `TaskTracker.Tests` sin renombrar nada.

:::vs Crear la solución y el proyecto
1. Abre **Visual Studio 2026**.
2. En la ventana de inicio, pulsa **Create a new project** (*Crear un nuevo proyecto*). Si ya tienes Visual Studio abierto, usa **File** > **New** > **Project**.
3. En el cuadro de búsqueda escribe `Web API`.
4. Elige la plantilla **ASP.NET Core Web API** con la etiqueta **C#** y pulsa **Next**. Evita las variantes que digan **(native AOT)**, **F#** o **Aspire**.
5. En la pantalla **Configure your new project** (*Configurar el nuevo proyecto*):
   - **Project name:** `TaskTracker.Api`
   - **Location:** tu carpeta de proyectos (por ejemplo, `C:\Users\TuUsuario\source\repos`).
   - **Solution name:** `TaskTracker`
   - **Place solution and project in the same directory:** **desmarcado**.
   - Pulsa **Next**.
6. En la pantalla **Additional information** (*Información adicional*) configura las opciones de la tabla siguiente y pulsa **Create**.
:::

| Opción | Valor | Por qué |
| --- | --- | --- |
| **Framework** | **.NET 10.0 (Long Term Support)** | La versión LTS actual, la misma del tutorial 1. |
| **Authentication type** | **None** | La autenticación queda fuera de este tutorial. |
| **Configure for HTTPS** | **Marcado** | Deja preparado el perfil `https` y `UseHttpsRedirection`. |
| **Enable container support** | **Desmarcado** | Docker es un tema de despliegue. |
| **Enable OpenAPI support** | **Marcado** | Genera el documento OpenAPI; lo usarás para comprobar tus endpoints y, en el paso 14, para la documentación con Scalar. |
| **Do not use top-level statements** | **Desmarcado** | `Program.cs` sin clase ni `Main` explícitos, como en Bookshelf. |
| **Use controllers** | **Desmarcado** | **La diferencia clave con el tutorial 1.** Sin esta casilla, la plantilla crea una Minimal API. |
| **Enlist in .NET Aspire orchestration** | **Desmarcado** | No necesitamos orquestar varios servicios. |

:::warning Revisa "Use controllers" dos veces
Visual Studio puede recordar las opciones que usaste la última vez. Si creaste Bookshelf hace poco, es posible que **"Use controllers" aparezca marcada**. Desmárcala antes de pulsar **Create**. Si se te pasa, lo notarás enseguida: aparecerá una carpeta `Controllers` con un `WeatherForecastController.cs`. En ese caso, lo más rápido es cerrar la solución, borrar la carpeta `TaskTracker` y crear el proyecto de nuevo.
:::

:::warning Los nombres de las opciones pueden variar un poco
El texto exacto, el idioma y el orden de las opciones de **Additional information** pueden cambiar entre versiones de Visual Studio, y algunas (como la de Aspire) solo aparecen con ciertas cargas de trabajo instaladas. En algunas versiones la casilla se llama **Use controllers (uncheck to use Minimal APIs)**. Guíate por el significado de cada opción.
:::

:::tip El mismo resultado desde la terminal (opcional)
Si prefieres la CLI, o quieres ver qué hace el asistente por debajo, estos comandos crean la misma solución en una carpeta vacía:

```powershell
dotnet new sln -n TaskTracker
dotnet new webapi -n TaskTracker.Api -o TaskTracker.Api
dotnet sln add TaskTracker.Api/TaskTracker.Api.csproj
```

En el tutorial 1 usaste `dotnet new webapi --use-controllers`. Sin esa opción, la plantilla `webapi` genera una Minimal API.
:::

## Recorrido rápido: qué generó la plantilla

En **Solution Explorer** (<kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>L</kbd> si no lo ves) encontrarás esto:

```
TaskTracker
└── TaskTracker.Api
    ├── Connected Services      (puede aparecer; no lo usaremos)
    ├── Dependencies
    ├── Properties
    │   └── launchSettings.json
    ├── appsettings.json
    ├── Program.cs
    └── TaskTracker.Api.http
```

Compáralo con Bookshelf recién creado: **no hay carpeta `Controllers` ni archivo `WeatherForecast.cs`**. Todo el ejemplo vive en `Program.cs`. (`appsettings.Development.json` está, pero Visual Studio lo muestra anidado bajo `appsettings.json`; despliega la flecha para verlo.)

| Archivo | Qué es | ¿Cambia respecto a Bookshelf? |
| --- | --- | --- |
| `TaskTracker.Api.csproj` | El proyecto: framework y paquetes NuGet. Ábrelo con doble clic sobre el nombre del proyecto. | Igual: `net10.0`, `Nullable`, `ImplicitUsings` y el paquete `Microsoft.AspNetCore.OpenApi`. |
| `Properties/launchSettings.json` | Los perfiles `http` y `https` y sus puertos. | Igual. Los puertos son aleatorios. |
| `appsettings*.json` | La configuración. | Igual. En el paso 6 añadirás la cadena de conexión a la base de datos. |
| `TaskTracker.Api.http` | Peticiones de prueba. | Igual. |
| `Program.cs` | El host, el pipeline **y los endpoints**. | **Sí**: ya no llama a `AddControllers()`/`MapControllers()` y contiene el endpoint de ejemplo. |

### El Program.cs de la plantilla

Abre `Program.cs`. Verás algo así (los comentarios en inglés los pone la plantilla):

```csharp title="Program.cs (generado por la plantilla)"
var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

var summaries = new[]
{
    "Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching"
};

app.MapGet("/weatherforecast", () =>
{
    var forecast =  Enumerable.Range(1, 5).Select(index =>
        new WeatherForecast
        (
            DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
            Random.Shared.Next(-20, 55),
            summaries[Random.Shared.Next(summaries.Length)]
        ))
        .ToArray();
    return forecast;
})
.WithName("GetWeatherForecast");

app.Run();

record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}
```

La estructura de host que estudiaste en el tutorial 1 está intacta: **registro de servicios**, `Build()`, **pipeline**, `Run()`. Lo nuevo es el bloque central:

| Fragmento | Qué significa |
| --- | --- |
| `app.MapGet("/weatherforecast", () => { ... })` | Un endpoint completo: verbo `GET`, ruta `/weatherforecast` y una lambda como handler. Es el equivalente a todo `WeatherForecastController`. |
| `return forecast;` | El handler devuelve un array y el framework lo serializa a JSON con estado `200`. No hace falta `Ok(...)`. |
| `.WithName("GetWeatherForecast")` | Le da un **nombre** al endpoint. Sirve para generar enlaces hacia él y como identificador en OpenAPI. Lo usarás en el paso 4. |
| `var summaries = ...` | Una variable local de `Program.cs`. La lambda la puede usar porque la **captura**: ese detalle será importante en el paso 3. |
| `record WeatherForecast(...)` | El modelo del ejemplo, declarado al final del archivo. Tiene que ir **después** de todas las instrucciones de nivel superior. |

:::why ¿Por qué no hay UseAuthorization() esta vez?
En Bookshelf la plantilla con controllers añadía `app.UseAuthorization()` aunque no lo usaras. La plantilla de Minimal APIs no lo incluye porque no configuramos autenticación. Menos líneas que no hacen nada.
:::

## Ejecuta el ejemplo

:::vs Ejecutar la API y enviar una petición
1. En el desplegable junto al botón verde de ejecutar, elige el perfil **http** (igual que en el tutorial 1, para no depender de certificados).
2. Pulsa <kbd>Ctrl</kbd> + <kbd>F5</kbd> (*Start Without Debugging*). Se abre la consola con la línea `Now listening on: http://localhost:XXXX`. **Anota tu puerto.**
3. En Solution Explorer, abre **`TaskTracker.Api.http`**.
4. Comprueba que el puerto de la primera línea coincide con el de tu consola.
5. Pulsa **Send request** encima de la línea `GET`.
:::

```http title="TaskTracker.Api.http (generado por la plantilla)"
@TaskTracker.Api_HostAddress = http://localhost:5283

GET {{TaskTracker.Api_HostAddress}}/weatherforecast/
Accept: application/json

###
```

:::tip Tu puerto será otro
A lo largo del tutorial usaremos `5283` como ejemplo. Visual Studio asigna un puerto aleatorio a cada proyecto: usa siempre **el tuyo**, el que aparece en tu consola y en `Properties/launchSettings.json`.
:::

La respuesta será `200 OK` con cinco previsiones aleatorias, exactamente como en Bookshelf:

```json
[
  {
    "date": "2026-10-21",
    "temperatureC": 8,
    "summary": "Cool",
    "temperatureF": 46
  }
]
```

(El resultado real tiene cinco elementos.) El mismo comportamiento, con una fracción del código: sin clase, sin atributos y sin `Ok()`.

Detén la API antes de seguir: cierra la ventana de consola o pulsa <kbd>Ctrl</kbd> + <kbd>C</kbd> dentro de ella.

## Limpia el proyecto

El ejemplo del tiempo ya cumplió su función. Vamos a dejar `Program.cs` con lo imprescindible y **ordenado por secciones**, porque este archivo irá creciendo durante el tutorial y conviene que siempre se lea igual.

:::vs Reemplazar Program.cs
1. Abre `Program.cs`.
2. Selecciona todo con <kbd>Ctrl</kbd> + <kbd>A</kbd> y reemplázalo por el código siguiente.
3. Guarda con <kbd>Ctrl</kbd> + <kbd>S</kbd>.
:::

```csharp title="Program.cs"
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

app.Run();
```

| Sección | Qué irá aquí a lo largo del tutorial |
| --- | --- |
| `// --- Services ---` | Todo lo que se registra en el contenedor de DI: OpenAPI, `ProblemDetails`, el `DbContext`… Siempre **antes** de `Build()`. |
| `// --- Development-only setup ---` | Lo que solo debe existir mientras desarrollas: el documento OpenAPI y, más adelante, la página de Scalar. |
| `// --- Middleware pipeline ---` | Los middlewares, en el orden en que procesan la petición. |
| `// --- Endpoints ---` | Aparecerá en el paso 3, justo antes de `app.Run()`. |

:::why ¿Por qué MapOpenApi solo en Development?
El documento OpenAPI describe todas tus rutas y modelos. Es muy útil mientras desarrollas, pero en producción puede dar a un atacante un mapa completo de tu API. Por eso la plantilla lo publica solo cuando el entorno es `Development`, y mantendremos esa decisión.
:::

Ahora actualiza el archivo `.http`: la petición del tiempo ya no tiene sentido. La sustituimos por una al documento OpenAPI, que es la forma más rápida de ver **qué endpoints tiene tu API**.

:::vs Reemplazar TaskTracker.Api.http
1. Abre `TaskTracker.Api.http`.
2. Reemplaza su contenido por el siguiente, **conservando tu puerto** en la primera línea.
:::

```http title="TaskTracker.Api.http"
@TaskTracker.Api_HostAddress = http://localhost:5283

GET {{TaskTracker.Api_HostAddress}}/openapi/v1.json
Accept: application/json

###
```

Ejecuta la API otra vez con <kbd>Ctrl</kbd> + <kbd>F5</kbd> y envía la petición.

:::checkpoint Un proyecto limpio que arranca
**1. `GET /openapi/v1.json`** → `200 OK` con un documento como este:

```json
{
  "openapi": "3.1.1",
  "info": {
    "title": "TaskTracker.Api | v1",
    "version": "1.0.0"
  },
  "servers": [
    {
      "url": "http://localhost:5283/"
    }
  ],
  "paths": { }
}
```

Fíjate en `"paths": { }`: la API arranca, pero **no tiene ningún endpoint**. Es justo lo que queremos.

**2. `GET /weatherforecast`** (escríbela tú en el `.http` si quieres comprobarlo) → `404 Not Found` **sin cuerpo**. El endpoint ya no existe.

**3. Compilación limpia.** En **Build** > **Rebuild Solution** la ventana **Output** debe indicar `1 succeeded, 0 failed` y la **Error List** no debe mostrar errores ni advertencias.
:::

:::troubleshooting Errores comunes
- **Aparece una carpeta `Controllers` con `WeatherForecastController.cs`:** la casilla **Use controllers** estaba marcada. Cierra la solución, borra la carpeta y vuelve a crear el proyecto con la casilla desmarcada.
- **`CS0246: The type or namespace name 'WeatherForecast' could not be found`:** borraste el `record WeatherForecast` pero dejaste el `MapGet` que lo usa (o al revés). Reemplaza **todo** el contenido de `Program.cs` por la versión limpia.
- **`CS8803: Top-level statements must precede namespace and type declarations`:** has dejado un `record` o una clase **antes** de alguna instrucción. En `Program.cs` las declaraciones de tipos van siempre al final; en la versión limpia no queda ninguna.
- **El editor `.http` dice "connection refused":** la API no se está ejecutando o el puerto de la primera línea no es el tuyo.
- **`warn: ... HttpsRedirectionMiddleware[3] Failed to determine the https port for redirect.`:** aviso inofensivo con el perfil `http`, igual que en el tutorial 1.
- **`System.IO.IOException: Failed to bind to address ... address already in use`:** sigue abierta una ejecución anterior. Cierra su consola o detén la depuración con <kbd>Shift</kbd> + <kbd>F5</kbd>.
:::

:::recap
- Creaste la solución `TaskTracker` con el proyecto `TaskTracker.Api` usando la plantilla **ASP.NET Core Web API** con **"Use controllers" desmarcada**: eso genera una Minimal API.
- La plantilla no tiene carpeta `Controllers`: el endpoint de ejemplo es un `app.MapGet(...)` con una lambda en `Program.cs`.
- Un handler que devuelve un objeto produce un `200` con JSON sin necesidad de `Ok()`.
- Dejaste `Program.cs` limpio y ordenado en secciones (*Services*, *Development-only setup*, *Middleware pipeline*), con OpenAPI solo en `Development`.
- `GET /openapi/v1.json` es una forma rápida de ver qué endpoints expone tu API: ahora mismo, ninguno.

En el siguiente paso escribirás tus primeros endpoints de verdad: listar y crear proyectos.
:::
