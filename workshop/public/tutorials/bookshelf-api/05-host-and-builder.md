## Objetivo del paso

Ya has ejecutado la API, pero todavía no sabes qué hace `Program.cs`. En este paso lo desmontarás **línea a línea**. Vas a entender qué es el *host*, por qué la aplicación se construye en **dos fases** (registrar servicios y configurar el pipeline), qué son las *top-level statements* y cómo el **entorno** (`Development`, `Production`) cambia el comportamiento de la API.

Además, harás dos experimentos pequeños y reversibles: añadirás un endpoint de prueba sin controllers y cambiarás el entorno para ver cómo desaparece el documento OpenAPI.

## Qué es un host

:::concept El host
Una aplicación web necesita mucho más que tu código: un servidor que escuche en un puerto, un sistema de configuración, un sistema de registros (*logging*), un contenedor de inyección de dependencias y una forma de arrancar y apagarse de forma ordenada. Al conjunto de todo eso, unido y listo para funcionar, se le llama **host**.

Sin un host tendrías que crear y conectar cada pieza a mano. ASP.NET Core lo hace por ti con **valores por defecto razonables**: tú solo añades lo que tu aplicación necesita.
:::

El objeto que se encarga de configurar el host se llama *builder* (constructor) y sigue el **patrón Builder**: primero lo configuras paso a paso y, cuando terminas, lo conviertes en el objeto final.

## Las dos fases de Program.cs

Un `Program.cs` de ASP.NET Core siempre sigue el mismo guion:

```
┌─────────────────────────────────────────────────────────────┐
│ FASE 1: CONSTRUIR (builder)                                   │
│   var builder = WebApplication.CreateBuilder(args);           │
│   builder.Services.Add...   ← registrar servicios            │
├─────────────────────────────────────────────────────────────┤
│   var app = builder.Build();      ← se "congela" el contenedor│
├─────────────────────────────────────────────────────────────┤
│ FASE 2: CONFIGURAR (app)                                      │
│   app.Use... / app.Map...         ← pipeline y endpoints      │
│   app.Run();                      ← arrancar y esperar        │
└─────────────────────────────────────────────────────────────┘
```

:::why ¿Por qué dos fases?
En la **fase 1** decides *qué piezas existen* (los servicios). Al llamar a `builder.Build()`, ASP.NET Core construye el contenedor de dependencias con todo lo registrado y a partir de ahí **ya no se pueden añadir servicios**. En la **fase 2** decides *cómo se procesan las peticiones* con esas piezas (el pipeline).

Separar las fases evita una clase entera de errores: no puedes intentar usar un servicio que todavía no estaba registrado. Cuando tu código dice `builder.Services...` sabes que estás en la fase 1; cuando dice `app...`, en la fase 2. Si mezclas las fases, o el compilador no encuentra el método (por ejemplo, `app.AddControllers()` no existe) o la aplicación falla al arrancar con un error claro.
:::

## Program.cs, línea a línea

Este es el archivo tal como lo dejó el paso 3. Todavía no lo modifiques.

```csharp title="Program.cs"
var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();

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

| Línea | Qué hace |
| --- | --- |
| `var builder = WebApplication.CreateBuilder(args);` | Crea el *builder* con la configuración por defecto (ver más abajo). `args` son los argumentos de línea de comandos con los que se lanzó el programa. |
| `builder.Services.AddControllers();` | **Registra** en el contenedor de DI los servicios que necesita el sistema de controllers. Sin esta línea, `MapControllers` no funcionaría. |
| `builder.Services.AddOpenApi();` | Registra el generador del documento OpenAPI. |
| `var app = builder.Build();` | Construye la aplicación (`WebApplication`) a partir de la configuración. Fin de la fase 1. |
| `if (app.Environment.IsDevelopment()) { app.MapOpenApi(); }` | Publica el endpoint `/openapi/v1.json` **solo** si el entorno es `Development`. |
| `app.UseHttpsRedirection();` | Añade un *middleware* que redirige las peticiones HTTP a HTTPS. |
| `app.UseAuthorization();` | Añade un *middleware* que aplica las reglas de autorización. Hoy no tenemos reglas, pero es parte de la plantilla. |
| `app.MapControllers();` | Descubre las clases controller del proyecto y registra sus rutas como endpoints. |
| `app.Run();` | Arranca el servidor Kestrel y **bloquea** hasta que la aplicación se detiene (por ejemplo, con <kbd>Ctrl</kbd> + <kbd>C</kbd>). |

Observa la convención de nombres: los métodos que **añaden servicios** empiezan por `Add...`; los que **añaden middleware** empiezan por `Use...`; los que **registran endpoints** empiezan por `Map...`. Los middleware (`Use...`) los estudiaremos en profundidad en el paso 6.

### Qué configura `CreateBuilder` por ti

Con una sola llamada, `WebApplication.CreateBuilder(args)` deja preparado:

| Pieza | Valor por defecto | Dónde la tienes en el builder |
| --- | --- | --- |
| **Configuración** | Lee, en este orden (las últimas **sobrescriben** a las primeras): `appsettings.json`, `appsettings.{Entorno}.json`, variables de entorno, argumentos de línea de comandos (y *user secrets* en `Development`). | `builder.Configuration` |
| **Logging** | Escribe en la consola; el nivel se controla con la sección `Logging` de `appsettings.json`. | `builder.Logging` |
| **Contenedor de DI** | Vacío, salvo los servicios propios del framework. Aquí registrarás los tuyos. | `builder.Services` |
| **Servidor web** | Kestrel, escuchando en las URLs de `launchSettings.json` o de la configuración. | `builder.WebHost` |
| **Entorno** | El valor de `ASPNETCORE_ENVIRONMENT` (por defecto, `Production`). | `builder.Environment` |

## Top-level statements

Seguramente te hayas fijado en algo raro: `Program.cs` no tiene `class Program`, ni `static void Main`. Eso es posible gracias a las **top-level statements** (instrucciones de nivel superior), una característica de C# que permite escribir el punto de entrada directamente.

:::concept Top-level statements
Cuando un archivo tiene instrucciones sueltas fuera de cualquier clase, el compilador genera automáticamente una clase `Program` con un método `Main` y mete tus instrucciones dentro. Además, declara por ti la variable `args`. Es exactamente equivalente a escribir:

```csharp
public class Program
{
    public static void Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        builder.Services.AddControllers();
        builder.Services.AddOpenApi();

        var app = builder.Build();

        if (app.Environment.IsDevelopment())
        {
            app.MapOpenApi();
        }

        app.UseHttpsRedirection();
        app.UseAuthorization();
        app.MapControllers();

        app.Run();
    }
}
```

Las dos formas compilan al mismo resultado. Elegimos la primera porque tiene menos ruido. Esta es la casilla **Do not use top-level statements** que dejaste desmarcada en el paso 2.
:::

## Los entornos

Una misma aplicación se ejecuta en lugares muy distintos: tu máquina, un servidor de pruebas, producción. Lo que es deseable en cada uno cambia: en tu máquina quieres detalles de depuración; en producción, no.

:::concept Environment
El **entorno** (*environment*) es un nombre que indica en qué contexto se está ejecutando la aplicación. ASP.NET Core lo lee de la variable de entorno **`ASPNETCORE_ENVIRONMENT`**. Los tres valores convencionales son:

| Entorno | Uso típico |
| --- | --- |
| `Development` | Tu máquina de desarrollo. |
| `Staging` | Un servidor de pruebas previo a producción. |
| `Production` | El sistema real. **Es el valor por defecto** si la variable no está definida. |

En el código se consulta con `app.Environment.IsDevelopment()`, `IsStaging()` o `IsProduction()`. También determina qué archivo `appsettings.{Entorno}.json` se carga.
:::

:::why ¿Por qué publicar OpenAPI solo en Development?
Porque el documento OpenAPI describe **toda** tu API (rutas, parámetros, formatos). En desarrollo es una ayuda; en producción expondría información interna a quien no la necesita. Por eso la plantilla lo protege con `IsDevelopment()`, y por eso `Production` es el valor por defecto: si olvidas configurar el entorno, la aplicación elige la opción más segura.
:::

### Experimento 1: cambia el entorno

Verás en vivo cómo un cambio de entorno cambia el comportamiento sin tocar C#.

:::vs Cambiar el entorno del perfil http
1. Detén la API si está en ejecución.
2. Abre `Properties/launchSettings.json`.
3. En el perfil **`http`**, cambia `"ASPNETCORE_ENVIRONMENT": "Development"` por `"ASPNETCORE_ENVIRONMENT": "Production"`. Deja el perfil `https` como está.
4. Guarda y ejecuta con <kbd>Ctrl</kbd> + <kbd>F5</kbd> (perfil **http**).
5. Mira la consola y envía `GET {{Bookshelf.Api_HostAddress}}/openapi/v1.json` desde tu archivo `.http`.
:::

:::checkpoint El documento OpenAPI desaparece
- En la consola, la línea del entorno dice ahora `Hosting environment: Production`.
- La petición a `/openapi/v1.json` devuelve **`404 Not Found`**, porque `app.MapOpenApi()` ya no se ejecuta.

Ahora **revierte el cambio**: vuelve a poner `"Development"` en el perfil `http`, guarda y vuelve a ejecutar. `/openapi/v1.json` debe responder `200` otra vez.
:::

### Experimento 2: tu primer endpoint, sin controllers

Hasta ahora todos los endpoints venían de la plantilla. Vamos a crear uno nosotros directamente en `Program.cs`, sin ningún controller, para ver que el sistema de **enrutamiento** (*routing*) es independiente de ellos.

:::vs Añadir un endpoint temporal
1. Detén la API.
2. En `Program.cs`, añade esta línea **entre `app.MapControllers();` y `app.Run();`**:
:::

```csharp title="Program.cs"
var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.MapGet("/hello", () => "Hello from Bookshelf!");

app.Run();
```

La única línea nueva es `app.MapGet("/hello", ...)`:

- **`MapGet`** registra un endpoint que responde a peticiones `GET`. Existen también `MapPost`, `MapPut`, `MapDelete`…
- **`"/hello"`** es la ruta.
- **`() => "Hello from Bookshelf!"`** es una **expresión lambda** sin parámetros: el código que se ejecuta cuando llega la petición. Lo que devuelve (un `string`) se escribe como cuerpo de la respuesta.

Esta forma de definir endpoints directamente con `Map...` y lambdas es la de las **Minimal APIs**. Es un estilo distinto de los controllers, que verás en el tutorial 2; aquí lo usamos solo como experimento, porque es la manera más corta de ver el routing en acción. `app.MapControllers()` hace lo mismo, pero registrando las rutas que encuentra en tus clases controller.

Ahora pruébalo: añade esta petición a tu archivo `.http`, ejecuta la API y envíala.

```http title="Bookshelf.Api.http"
### Temporary endpoint
GET {{Bookshelf.Api_HostAddress}}/hello
```

:::checkpoint Tu primer endpoint responde
La respuesta es `200 OK`, con cabecera `Content-Type: text/plain; charset=utf-8` y este cuerpo:

```
Hello from Bookshelf!
```

Prueba también `{{Bookshelf.Api_HostAddress}}/Hello` (con mayúscula): responde igual, porque las rutas **no distinguen mayúsculas de minúsculas**.
:::

::::challenge Un endpoint que revela el entorno
Practica lo que acabas de ver. Añade un segundo endpoint temporal, `GET /environment`, que devuelva como texto el **nombre del entorno actual** (`Development`, `Production`…). Llámalo desde el archivo `.http`.

:::hint
Usa `app.MapGet` igual que con `/hello`. Lo único que cambia es la ruta y lo que devuelve la lambda.
:::

:::hint
Ya usaste el objeto que conoce el entorno: `app.Environment`. Tiene una propiedad con el nombre del entorno como `string`.
:::

:::hint
Está en `app.Environment.EnvironmentName`. Colócalo debajo de `/hello`, antes de `app.Run()`.
:::

:::solution
```csharp title="Program.cs"
app.MapGet("/hello", () => "Hello from Bookshelf!");

app.MapGet("/environment", () => app.Environment.EnvironmentName);

app.Run();
```

La lambda devuelve `app.Environment.EnvironmentName`, un `string` con el valor de `ASPNETCORE_ENVIRONMENT`. Con el perfil `http` tal y como lo tienes, la respuesta es el texto `Development`.

Si cambias de nuevo el perfil a `Production`, la misma petición devolvería `Production`. Es una buena forma de comprobar qué entorno está usando realmente tu aplicación.
:::
::::

## Limpia: elimina los experimentos

Estos endpoints eran temporales. Bookshelf usará **controllers**, así que los quitamos.

:::vs Restaurar Program.cs
1. En `Program.cs`, **elimina** las líneas `app.MapGet("/hello", ...)` y `app.MapGet("/environment", ...)` (y las líneas en blanco sobrantes).
2. Comprueba que el perfil `http` de `launchSettings.json` vuelve a tener `"ASPNETCORE_ENVIRONMENT": "Development"`.
3. En `Bookshelf.Api.http`, elimina las peticiones `/hello` y `/environment`.
4. Compila con <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd>.
:::

`Program.cs` debe volver a ser **idéntico** al que mostramos al principio del paso.

:::troubleshooting Errores comunes
- **`CS0103: The name 'app' does not exist in the current context`:** escribiste `app.MapGet(...)` *antes* de la línea `var app = builder.Build();`. Los `app.Map...` van siempre después de `Build()`.
- **`System.InvalidOperationException: The service collection cannot be modified because it is read-only.`** al arrancar: llamaste a `builder.Services.Add...` después de `builder.Build()`. Compila sin problema, pero falla al ejecutar. Los servicios se registran en la fase 1, antes de `Build()`.
- **`/hello` devuelve `404`:** comprueba que ejecutaste la versión nueva (detén y vuelve a iniciar) y que la línea está **antes** de `app.Run()`. Todo lo que se escribe después de `app.Run()` no se ejecuta hasta que la aplicación se detiene.
- **Error de compilación por falta de llave o punto y coma:** `MapGet` termina con `);`. Revisa que no falte el punto y coma final.
- **`Hosting environment` sigue mostrando `Production`:** editaste el perfil equivocado (por ejemplo `https`) o el desplegable de la barra de herramientas está en otro perfil. Comprueba cuál has elegido.
:::

:::recap
- El **host** reúne servidor, configuración, logging y contenedor de DI. `WebApplication.CreateBuilder(args)` lo prepara con valores por defecto.
- `Program.cs` tiene **dos fases**: registrar servicios (`builder.Services.Add...`) y, tras `Build()`, configurar el pipeline y los endpoints (`app.Use...`, `app.Map...`). `app.Run()` arranca el servidor.
- Las **top-level statements** son un `Main` implícito dentro de una clase `Program` generada.
- El **entorno** (`ASPNETCORE_ENVIRONMENT`) cambia el comportamiento de la app: OpenAPI se publica solo en `Development`. Si no se define, el entorno es `Production`.
- `MapGet` registra un endpoint sin controllers; lo usaste para ver el routing y luego lo eliminaste.

En el siguiente paso estudiarás las líneas `app.Use...`: el **pipeline de middleware**, y escribirás tu propio middleware para medir el tiempo de cada petición.
:::
