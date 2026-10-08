## Objetivo del paso

Tu API ya hace todo lo que prometimos. Falta lo que distingue una API usable de una API a secas: que **se pueda descubrir y probar sin leer el código**. Después haremos un último repaso: leerás `Program.cs` completo, línea a línea, y recorrerás el viaje entero de una petición. En este paso vas a:

1. Entender qué es **OpenAPI**, cómo se genera el documento de tu API y la diferencia entre la **especificación** y su **interfaz**.
2. Instalar **Scalar** y abrir una página de documentación interactiva.
3. Dejar `Program.cs` en su versión final y entender cada línea y el orden del pipeline.
4. Revisar la arquitectura completa y los conceptos del tutorial.
5. Afrontar un reto extra, opcional, que combina todo lo aprendido.

## OpenAPI: especificación frente a interfaz

Imagina que otro equipo quiere consumir tu API. Hoy tendrías que enviarle el archivo `.http` y explicarle los campos a mano. Una solución estándar es describir la API en un documento que las máquinas puedan leer.

:::concept OpenAPI
**OpenAPI** es un estándar para describir APIs HTTP en un documento JSON (o YAML): qué rutas existen, qué verbos aceptan, qué parámetros y cuerpos esperan, qué códigos de estado devuelven y qué forma tienen los datos. Es la **especificación**: un documento, no una página web.

Sobre esa especificación se construyen herramientas: interfaces para probar la API en el navegador, generadores de clientes en otros lenguajes, validadores, etc. Por eso conviene separar dos cosas:

| Pieza | Qué es | En tu proyecto |
| --- | --- | --- |
| **Especificación** (el documento) | Un archivo JSON generado a partir de tu código. | `GET /openapi/v1.json`, generado por el paquete `Microsoft.AspNetCore.OpenApi`. |
| **Interfaz** (la página) | Una aplicación web que lee ese JSON y lo muestra de forma interactiva. | **Scalar**, que instalaremos ahora. |
:::

La especificación ya existe en tu proyecto desde el paso 2, cuando marcaste **Enable OpenAPI support**. Recuerda las dos líneas de `Program.cs`:

- `builder.Services.AddOpenApi();` registra el generador del documento.
- `app.MapOpenApi();` expone el documento en la ruta `/openapi/v1.json`. Está dentro del bloque `if (app.Environment.IsDevelopment())`, así que solo existe en desarrollo.

Ejecuta la API y abre en el navegador `http://localhost:5125/openapi/v1.json` (con **tu** puerto). Verás el documento completo. Este es el comienzo del que genera tu API (versión de la especificación y rutas):

```json
{
  "openapi": "3.1.1",
  "info": {
    "title": "Bookshelf.Api | v1",
    "version": "1.0.0"
  },
  "paths": {
    "/api/Books": { "get": { "...": "..." }, "post": { "...": "..." } },
    "/api/Books/{id}": { "get": { "...": "..." }, "put": { "...": "..." }, "delete": { "...": "..." } },
    "/api/Books/{id}/read": { "patch": { "...": "..." } }
  }
}
```

(Hemos abreviado el contenido de cada operación con `"..."`; el tuyo es mucho más largo.) El generador **lee tu código**: los controllers y sus atributos, los parámetros, los tipos de retorno y los `[ProducesResponseType]` del paso 13. Si cambias el código, el documento cambia solo.

:::why ¿Y Swagger / Swashbuckle?
Si has visto tutoriales antiguos, usaban un paquete llamado **Swashbuckle** para generar el documento y mostrar una interfaz llamada Swagger UI. Las plantillas de ASP.NET Core lo incluían por defecto. Desde .NET 9 las plantillas ya no lo incluyen: el generador de documentos es el paquete oficial `Microsoft.AspNetCore.OpenApi`, y la interfaz es una elección tuya. Hay varias; nosotros usaremos **Scalar** porque es moderna y se integra con una sola línea. «Swagger» es hoy, sobre todo, el nombre histórico de OpenAPI.
:::

## Instala Scalar

Scalar es un paquete NuGet. Un **paquete NuGet** es una biblioteca de código publicada que añades a tu proyecto, y el `.csproj` guarda qué paquetes y qué versiones usa.

:::vs Instalar Scalar.AspNetCore con el administrador de paquetes
1. En Solution Explorer, haz clic derecho sobre el proyecto `Bookshelf.Api` > **Manage NuGet Packages…** (también está en el menú **Project**).
2. Abre la pestaña **Browse** y escribe `Scalar.AspNetCore` en el cuadro de búsqueda.
3. Selecciona el paquete **Scalar.AspNetCore** en la lista.
4. En el panel de detalles de la derecha, junto a **Version**, elige **`2.17.14`**, la versión con la que se verificó el tutorial. (La casilla *Include prerelease* debe estar desmarcada. Una versión más reciente probablemente funcione igual, pero no la hemos probado.)
5. Pulsa **Install**. Si aparece un cuadro para confirmar los cambios o aceptar una licencia, pulsa **Apply** / **I Accept**.
6. Comprueba el resultado: en Solution Explorer, **Dependencies** > **Packages** debe mostrar `Scalar.AspNetCore`.
:::

Alternativa por línea de comandos, equivalente, ejecutada en la carpeta del proyecto (la que contiene el `.csproj`):

```powershell
dotnet add package Scalar.AspNetCore --version 2.17.14
```

En ambos casos, tu `Bookshelf.Api.csproj` queda así:

```markup title="Bookshelf.Api.csproj"
<Project Sdk="Microsoft.NET.Sdk.Web">

  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.AspNetCore.OpenApi" Version="10.0.12" />
    <PackageReference Include="Scalar.AspNetCore" Version="2.17.14" />
  </ItemGroup>

</Project>
```

(Tu versión de `Microsoft.AspNetCore.OpenApi` puede ser otra `10.0.x`, y está bien.)

## Activa la interfaz

La interfaz de Scalar se expone con una línea. Siguiendo la misma lógica de `MapOpenApi`, va **dentro del bloque de desarrollo**: una documentación interactiva con la que se pueden lanzar peticiones no suele querer ofrecerse en producción.

Antes de editar, mira el `Program.cs` completo: a continuación te damos su **versión final**. Reemplaza todo el contenido de tu archivo por esto.

```csharp title="Program.cs"
using Bookshelf.Api.Errors;
using Bookshelf.Api.Middleware;
using Bookshelf.Api.Options;
using Bookshelf.Api.Repositories;
using Bookshelf.Api.Services;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// --- Services ---
builder.Services.AddControllers();
builder.Services.AddOpenApi();

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

builder.Services.Configure<BookStorageOptions>(
    builder.Configuration.GetSection(BookStorageOptions.SectionName));
builder.Services.AddSingleton<IBookRepository, JsonBookRepository>();
builder.Services.AddScoped<IBookService, BookService>();

var app = builder.Build();

// --- Middleware pipeline (order matters) ---
app.UseRequestTiming();
app.UseExceptionHandler();
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference(); // UI at /scalar
}

app.UseHttpsRedirection();
app.UseAuthorization();

// --- Endpoints ---
app.MapControllers();

app.Run();
```

Esta versión hace tres cosas respecto a la anterior: añade `using Scalar.AspNetCore;` y `app.MapScalarApiReference();`, y **limpia** los comentarios que venían de la plantilla sustituyéndolos por tres encabezados que dividen el archivo en las secciones que ya conoces.

:::checkpoint La documentación interactiva
Ejecuta la API (<kbd>Ctrl</kbd> + <kbd>F5</kbd>, perfil **http**) y abre en el navegador `http://localhost:5125/scalar` (con **tu** puerto). El navegador te redirige a `/scalar/`, que muestra la documentación de tu API (la versión `v1` del documento). Los textos y botones exactos pueden variar un poco entre versiones de Scalar.

Deberías ver:

- Un listado de los endpoints agrupados bajo **Books**, con sus verbos y rutas (`GET /api/Books`, `POST /api/Books`, …).
- Al abrir uno, sus parámetros (`genre` e `isRead` en el `GET`), el cuerpo esperado (los campos de `CreateBookRequest`, con sus tipos) y los códigos de respuesta.
- Un botón para **probar** la petición (*Test Request*).

Prueba el flujo: pulsa **Test Request** en `GET /api/Books`, envía la petición y comprueba que devuelve tus libros. Luego prueba `POST /api/Books` con un cuerpo válido y con uno inválido (título vacío) y observa el `ProblemDetails` del paso 12 directamente en la interfaz.

Por último, comprueba que sigue funcionando todo lo anterior con tu archivo `.http`. Y recuerda: fuera de `Development` estas rutas no existen (devuelven `404`).
:::

:::tip Mejora opcional: documentar también el 200 (no forma parte de la solución de referencia)
Abre el detalle de `GET /api/Books/{id}` en Scalar: solo aparecen las respuestas `404`. ¡Falta el `200`! Es una consecuencia de la convención del paso 13: cuando una acción declara algunos códigos con `[ProducesResponseType]`, el generador usa **solo** los declarados y deja de deducir el `200` del tipo de retorno. Para `GetAll`, que no lleva ningún atributo, sí aparece.

Si quieres que la documentación sea completa, declara también el éxito con la forma genérica del atributo:

```csharp
[HttpGet("{id:int}")]
[ProducesResponseType<BookResponse>(StatusCodes.Status200OK)]
[ProducesResponseType(StatusCodes.Status404NotFound)]
public async Task<ActionResult<BookResponse>> GetById(int id)
```

Verificamos que con esa línea (y su equivalente en `MarkAsRead`) el documento pasa a listar `200` y `404`. Lo dejamos como mejora opcional: si la aplicas, tu código ya no será idéntico a la solución de referencia, y no afecta a ningún comportamiento de la API.
:::

## Program.cs, línea a línea

Es el archivo con el que empezaste el tutorial, ahora completo. Recorrámoslo de arriba abajo.

| Líneas | Qué hacen | Dónde lo aprendiste |
| --- | --- | --- |
| `using ...;` | Importan los espacios de nombres de tus carpetas (`Errors`, `Middleware`, `Options`, `Repositories`, `Services`) y el de Scalar. | Pasos 5 a 15 |
| `WebApplication.CreateBuilder(args)` | Crea el **constructor del host**: servidor Kestrel, configuración, logging y contenedor de DI con valores por defecto. | Paso 5 |
| `AddControllers()` | Registra los servicios de MVC/controllers. | Paso 5 |
| `AddOpenApi()` | Registra el generador del documento OpenAPI. | Paso 2 y este paso |
| `AddProblemDetails()` | Registra el servicio que escribe errores en formato `ProblemDetails`. | Paso 14 |
| `AddExceptionHandler<GlobalExceptionHandler>()` | Registra tu manejador global de excepciones. | Paso 14 |
| `Configure<BookStorageOptions>(...)` | Vincula la sección `BookStorage` de la configuración a una clase tipada. | Paso 10 |
| `AddSingleton<IBookRepository, JsonBookRepository>()` | Un único repositorio (con su candado) para toda la aplicación. | Pasos 8 y 9 |
| `AddScoped<IBookService, BookService>()` | Un servicio nuevo por petición. | Paso 8 |
| `builder.Build()` | **Congela** el contenedor y crea la aplicación. A partir de aquí no se pueden registrar servicios. | Paso 5 |
| `UseRequestTiming()` | Tu middleware de tiempos. El más externo, para medir también los errores. | Paso 6 y 14 |
| `UseExceptionHandler()` | Captura excepciones y las pasa a tu manejador. | Paso 14 |
| `UseStatusCodePages()` | Rellena las respuestas de error vacías con `ProblemDetails`. | Paso 14 |
| Bloque `IsDevelopment()` | `MapOpenApi()` y `MapScalarApiReference()` solo existen en desarrollo. | Pasos 5 y 15 |
| `UseHttpsRedirection()` | Redirige HTTP a HTTPS cuando hay puerto HTTPS conocido. | Paso 6 |
| `UseAuthorization()` | Comprueba permisos. Hoy no hay reglas; está listo para el futuro. | Paso 6 |
| `MapControllers()` | Registra las rutas de tus controllers (el *endpoint*). | Paso 7 |
| `Run()` | Arranca el servidor y bloquea hasta que se detenga. | Paso 5 |

### El pipeline final

Así queda el recorrido de una petición por tus middleware, en el orden exacto del archivo:

```
Petición HTTP
   │
   ▼
UseRequestTiming ─────── mide el tiempo total; registra el código FINAL
   │
   ▼
UseExceptionHandler ──── captura excepciones y escribe el 500 ProblemDetails
   │
   ▼
UseStatusCodePages ───── respuestas 4xx/5xx vacías → ProblemDetails
   │
   ▼
UseHttpsRedirection ──── redirige a HTTPS si procede (cortocircuita)
   │
   ▼
UseAuthorization ─────── comprueba permisos (hoy deja pasar todo)
   │
   ▼
Endpoint ─────────────── BooksController (y /openapi, /scalar en Development)
   │
   ▼
Respuesta HTTP (vuelve por el mismo camino, de abajo hacia arriba)
```

(El *routing* —decidir qué endpoint atiende la URL— lo añade ASP.NET Core automáticamente al principio, como viste en el paso 6.)

## Repaso: el viaje de una petición

Cerramos el círculo. Esto es lo que ocurre cuando tu cliente hace `POST /api/books` con un libro nuevo, de principio a fin:

| Fase | Quién | Qué ocurre |
| --- | --- | --- |
| 1 | **Cliente** | Envía `POST /api/books` con `Content-Type: application/json` y un cuerpo (paso 4). |
| 2 | **Kestrel** | El servidor web recibe los bytes, los interpreta como una petición HTTP y la entrega al pipeline (pasos 1 y 5). |
| 3 | **Middleware** | `UseRequestTiming` arranca el cronómetro. `UseExceptionHandler` y `UseStatusCodePages` quedan a la espera. `UseHttpsRedirection` y `UseAuthorization` dejan pasar (paso 6 y 14). |
| 4 | **Routing** | Compara la URL y el verbo con las rutas; elige `BooksController.Create` (paso 7). |
| 5 | **DI** | El contenedor construye el controller y le inyecta un `IBookService` *scoped*, que a su vez recibe el repositorio *singleton* y un logger (paso 8). |
| 6 | **Model binding** | El cuerpo JSON se deserializa a `CreateBookRequest` (paso 11). |
| 7 | **Validación** | Las DataAnnotations se evalúan. Si algo falla, `[ApiController]` responde `400` con `ProblemDetails` y la acción no se ejecuta (paso 12). |
| 8 | **Controller** | `Create` llama a `bookService.CreateAsync(request)` y espera con `await` (pasos 9 y 11). |
| 9 | **Service** | Convierte el DTO en `Book` con `ToBook()` y delega en el repositorio (pasos 8 y 11). |
| 10 | **Repository** | Toma el `SemaphoreSlim`, lee `books.json`, asigna el nuevo `Id`, añade el libro, reescribe el archivo y suelta el candado. La ruta del archivo salió de la configuración (pasos 9 y 10). |
| 11 | **Vuelta** | El libro vuelve al servicio, que lo registra en el log y lo convierte en `BookResponse`; el controller devuelve `CreatedAtAction` → `201` + `Location` (paso 11). |
| 12 | **Middleware de salida** | La respuesta recorre el pipeline en sentido inverso. `UseRequestTiming` mide y registra `POST /api/books responded 201 in X ms`. |
| 13 | **Cliente** | Recibe `201 Created`, la cabecera `Location` y el libro en JSON. |

Si en cualquier punto algo lanza una excepción, sube hasta `UseExceptionHandler`, que registra el error completo y devuelve un `500` genérico (paso 14).

## Lista de conceptos

Marca mentalmente cada uno. Si alguno te suena borroso, vuelve al paso indicado:

| Concepto | Paso |
| --- | --- |
| .NET, ASP.NET Core, Kestrel; SDK y runtime | 1 |
| Crear y ejecutar un proyecto en Visual Studio; perfiles de ejecución | 2 |
| Estructura de un proyecto: `.csproj`, `launchSettings.json`, `appsettings.json` | 3 |
| HTTP: verbos, códigos de estado, idempotencia; diseño REST | 4 |
| Host y builder: fase de servicios y fase de pipeline | 5 |
| Middleware: orden, `next`, cortocircuito; middleware propio | 6 |
| Modelo, controller, `[ApiController]`, enrutamiento, `ActionResult<T>` | 7 |
| Inyección de dependencias, interfaces, tiempos de vida, dependencia cautiva | 8 |
| Repositorio, JSON, `async`/`await`, `SemaphoreSlim` | 9 |
| Configuración, Options pattern, fuentes y prioridades | 10 |
| Model binding, DTOs, mapeos, `201 Created` | 11 |
| DataAnnotations y `ProblemDetails` | 12 |
| `PUT`, `DELETE`, `PATCH`, `[ProducesResponseType]` | 13 |
| Manejo global de errores, niveles y categorías de logging | 14 |
| OpenAPI y Scalar | 15 |

## La estructura final

Tu proyecto debería coincidir con este árbol (comprueba que no te queda ningún resto de experimentos, como la carpeta `Lifetimes` o el archivo `books-demo.json`):

```
Bookshelf.Api/
├── Controllers/    BooksController.cs
├── Data/           books.json
├── Dtos/           BookResponse.cs, CreateBookRequest.cs, MarkAsReadRequest.cs, UpdateBookRequest.cs
├── Errors/         GlobalExceptionHandler.cs
├── Mappings/       BookMappings.cs
├── Middleware/     RequestTimingMiddleware.cs
├── Models/         Book.cs
├── Options/        BookStorageOptions.cs
├── Repositories/   IBookRepository.cs, JsonBookRepository.cs
├── Services/       IBookService.cs, BookService.cs
├── Properties/     launchSettings.json
├── appsettings.json, appsettings.Development.json
├── Bookshelf.Api.csproj, Bookshelf.Api.http
└── Program.cs
```

:::troubleshooting Errores comunes
- **`CS0246: The type or namespace name 'Scalar' could not be found` / `'MapScalarApiReference' does not exist`:** el paquete no se instaló bien o falta `using Scalar.AspNetCore;`. Revisa **Dependencies** > **Packages** y vuelve a compilar.
- **`/scalar` devuelve `404`:** estás ejecutando en un entorno distinto de `Development` (comprueba `ASPNETCORE_ENVIRONMENT` en `launchSettings.json`), o la línea `MapScalarApiReference()` está fuera del bloque `IsDevelopment()`.
- **Scalar carga pero no muestra endpoints:** abre `/openapi/v1.json`. Si ese documento da `404`, falta `app.MapOpenApi()` o `AddOpenApi()`.
- **Error al restaurar el paquete (`NU1101`, `Unable to find package`):** sin conexión a NuGet, o escribiste mal el nombre. El nombre exacto es `Scalar.AspNetCore`.
- **`warn: ...HttpsRedirectionMiddleware[3] Failed to determine the https port for redirect.`:** inofensivo con el perfil `http` (ver paso 2).
- **Los endpoints aparecen duplicados o con otro nombre:** el documento se regenera al recompilar. Detén la aplicación, compila y vuelve a ejecutarla.
:::

::::challenge Extra: estadísticas de la biblioteca
**Este reto es opcional y no forma parte de la solución de referencia**: sirve para comprobar que dominas el recorrido completo por las capas. Si lo haces, **revierte los cambios** al terminar para que tu proyecto coincida con el del tutorial.

Añade el endpoint `GET /api/books/stats`, que devuelve un resumen de la biblioteca:

```json
{
  "total": 8,
  "read": 5,
  "unread": 3,
  "byGenre": {
    "Fiction": 4,
    "Fantasy": 1,
    "Dystopian": 1,
    "Science Fiction": 2
  }
}
```

Requisitos:

- Un DTO de respuesta nuevo.
- El cálculo en el **servicio** (el controller solo traduce).
- Responde `200`.
- Pregunta de diseño: la ruta `stats` y la ruta `{id:int}` conviven en el mismo controller. ¿Por qué no entran en conflicto?
- Verifícalo con una petición en `Bookshelf.Api.http` y en Scalar.

:::hint
Sigue el esquema de siempre, de dentro hacia fuera: un DTO `BookStatsResponse` (un `record` encaja bien, porque se construye una vez y no cambia), un método `GetStatsAsync()` en `IBookService` y `BookService`, y una acción en el controller. El repositorio ya tiene todo lo necesario con `GetAllAsync()`: no hace falta tocarlo.
:::

:::hint
En el servicio: obtén todos los libros y calcula con LINQ. `books.Count` da el total; `books.Count(b => b.IsRead)` los leídos; los no leídos son `Total - Read`. Para agrupar por género usa `GroupBy` y `ToDictionary`: `GroupBy(b => b.Genre)` crea un grupo por género y `ToDictionary(g => g.Key, g => g.Count())` los convierte en un diccionario género → cantidad.
:::

:::hint
En el controller: `[HttpGet("stats")]` y devuelve `Ok(stats)`. La ruta `"stats"` es un texto literal; la otra, `"{id:int}"`, solo coincide si el segmento es un entero (la restricción del paso 7), así que `stats` nunca se confunde con un `id`.
:::

:::solution
```csharp title="Dtos/BookStatsResponse.cs"
namespace Bookshelf.Api.Dtos;

public record BookStatsResponse(
    int Total,
    int Read,
    int Unread,
    Dictionary<string, int> ByGenre);
```

```csharp title="Services/IBookService.cs (línea nueva, al final de la interfaz)"
Task<BookStatsResponse> GetStatsAsync();
```

```csharp title="Services/BookService.cs (método nuevo, al final de la clase)"
public async Task<BookStatsResponse> GetStatsAsync()
{
    var books = await repository.GetAllAsync();

    var byGenre = books
        .GroupBy(b => b.Genre, StringComparer.OrdinalIgnoreCase)
        .ToDictionary(g => g.Key, g => g.Count());

    var read = books.Count(b => b.IsRead);
    return new BookStatsResponse(books.Count, read, books.Count - read, byGenre);
}
```

```csharp title="Controllers/BooksController.cs (acción nueva, antes de GetById)"
// GET /api/books/stats
[HttpGet("stats")]
public async Task<ActionResult<BookStatsResponse>> GetStats()
{
    var stats = await bookService.GetStatsAsync();
    return Ok(stats);
}
```

```http title="Bookshelf.Api.http (petición adicional)"
### Library statistics
GET {{Bookshelf.Api_HostAddress}}/api/books/stats
Accept: application/json
```

Con los ocho libros iniciales, la respuesta es:

```json
{
  "total": 8,
  "read": 5,
  "unread": 3,
  "byGenre": { "Fiction": 4, "Fantasy": 1, "Dystopian": 1, "Science Fiction": 2 }
}
```

Cómo funciona:

- El **servicio** hace el trabajo; el controller solo traduce a HTTP. No se toca el repositorio.
- `GroupBy(..., StringComparer.OrdinalIgnoreCase)` agrupa sin distinguir mayúsculas, de modo que `"fantasy"` y `"Fantasy"` cuentan como el mismo género.
- Un `Dictionary<string, int>` se serializa como un objeto JSON. Las **claves** del diccionario conservan el texto original (`"Science Fiction"`); solo los nombres de **propiedad** (`total`, `byGenre`) pasan a camelCase.
- No hay conflicto de rutas porque `{id:int}` exige un entero y `"stats"` no lo es; además ASP.NET Core da prioridad a los segmentos literales sobre los parámetros.
- `Total - Read` evita recorrer la lista una tercera vez para contar los no leídos.

**Para revertir:** borra `Dtos/BookStatsResponse.cs`, la línea de la interfaz, el método del servicio y la acción del controller.
:::
::::

## ¿Qué sigue?

Has construido una API completa con controllers, y con ella has aprendido los fundamentos que se repiten en **cualquier** proyecto ASP.NET Core: host, pipeline, DI, configuración, binding, validación, errores y logging.

El **tutorial 2** da dos pasos naturales a partir de aquí:

- **Minimal APIs:** otro estilo de escribir endpoints, más directo y sin controllers, que usa exactamente los mismos conceptos que ya conoces (pipeline, DI, binding, `ProblemDetails`).
- **Entity Framework Core con SQLite:** sustituirás el repositorio JSON por una base de datos real, sin tocar el controller ni el servicio. Ese es el verdadero premio de haber separado las capas.

Antes de pasar a él, considera repasar los retos que más te costaron y repetirlos sin mirar las pistas.

:::recap
- **OpenAPI** es la especificación (un JSON, `/openapi/v1.json`, generado por `Microsoft.AspNetCore.OpenApi`); **Scalar** es una interfaz que lo lee y permite probar la API en `/scalar`.
- Ambos se exponen solo en `Development`, dentro del bloque `IsDevelopment()`.
- Instalas Scalar como paquete NuGet (Manage NuGet Packages… o `dotnet add package`) y lo activas con `app.MapScalarApiReference()`.
- `Program.cs` queda en tres secciones: **servicios**, **pipeline (el orden importa)** y **endpoints**.
- Una petición recorre: cliente → Kestrel → middleware → routing → DI → model binding → validación → controller → servicio → repositorio → archivo, y vuelve por el mismo camino.
- Cada capa tiene una única responsabilidad; por eso cada una se puede cambiar sin tocar las demás.

Has completado el tutorial **Bookshelf API**. Tu proyecto debería coincidir con la solución de referencia del repositorio. Márcalo como completado y continúa con el tutorial 2 cuando quieras.
:::
