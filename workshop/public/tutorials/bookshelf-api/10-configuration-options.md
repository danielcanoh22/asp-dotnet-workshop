## Objetivo del paso

En el paso anterior escribimos la ruta del archivo a fuego dentro del repositorio: `"Data/books.json"`. Funciona, pero cambiarla obliga a editar código y recompilar. En este paso aprenderás cómo ASP.NET Core gestiona la **configuración** y la usarás para externalizar esa ruta. Vas a:

1. Entender el **sistema de configuración**: de dónde lee valores y qué fuente gana cuando coinciden.
2. Ver por qué las "cadenas mágicas" y los valores escritos a fuego son un problema.
3. Aplicar el **Options pattern**: una clase tipada (`BookStorageOptions`) que representa una sección de configuración.
4. Refactorizar `JsonBookRepository` para recibir la ruta por inyección.
5. Comprobar con un experimento que puedes **cambiar el comportamiento sin tocar el código**, y practicarlo con un reto.

## El problema: valores escritos a fuego

Mira el constructor del repositorio:

```csharp
_filePath = Path.Combine(environment.ContentRootPath, "Data/books.json");
```

Ese texto `"Data/books.json"` es una **cadena mágica**: un valor literal con significado importante enterrado en el código. Trae varios problemas:

| Problema | Ejemplo |
| --- | --- |
| Cambiarlo obliga a **recompilar y volver a desplegar** | Quieres usar otro archivo en tu máquina de pruebas. |
| **No puede variar por entorno** | En desarrollo quieres un archivo de prueba; en producción, una ruta absoluta en otro disco. |
| Es fácil **repetirlo mal** | Si otra clase necesita la ruta, copiarás el literal y un día se desincronizarán. |
| Mezcla **datos de configuración** con **lógica** | Quien decide dónde viven los datos suele ser quien despliega, no quien programa. |

La regla general: **lo que puede cambiar entre entornos o instalaciones no debe estar en el código, sino en la configuración.**

## El sistema de configuración

Ya conoces `appsettings.json` del paso 3. Es solo una de las varias **fuentes** (*providers*) de configuración que ASP.NET Core combina en un único conjunto de pares clave/valor.

:::concept Configuración como una pila de fuentes
`WebApplication.CreateBuilder(args)` configura por ti las siguientes fuentes, **de menor a mayor prioridad**. Si la misma clave aparece en varias, **gana la última**:

| Orden | Fuente | Para qué se usa |
| --- | --- | --- |
| 1 | `appsettings.json` | Valores por defecto de la aplicación. Se publica con ella. |
| 2 | `appsettings.{Environment}.json` | Valores propios de un entorno (`appsettings.Development.json`). Pisan a los de `appsettings.json`. |
| 3 | **User secrets** (solo en `Development`) | Datos sensibles de tu máquina (contraseñas, claves de API) que no deben subirse a Git. En Visual Studio: clic derecho sobre el proyecto > **Manage User Secrets**. No los usaremos en este tutorial. |
| 4 | **Variables de entorno** | Configuración del sistema operativo o del contenedor donde se ejecuta. Típico en despliegues. |
| 5 | **Argumentos de línea de comandos** | `dotnet run --Clave=valor`. La máxima prioridad. |

Esto permite que el **mismo código** se comporte distinto en tu máquina, en pruebas y en producción, sin recompilar.
:::

### Claves jerárquicas: `:` y `__`

El JSON de configuración tiene estructura anidada, pero internamente se "aplana" en claves separadas por dos puntos. Este fragmento:

```json
{
  "BookStorage": {
    "FilePath": "Data/books.json"
  }
}
```

se convierte en la clave `BookStorage:FilePath` con el valor `Data/books.json`. Para escribir esa misma clave como **variable de entorno** hay un problema: el carácter `:` no es válido en los nombres de variables de entorno de todos los sistemas. Por eso se usa **doble guion bajo**: `BookStorage__FilePath`. Y en la línea de comandos sí puedes usar los dos puntos: `--BookStorage:FilePath=...`.

| Dónde la escribes | Cómo se escribe la clave |
| --- | --- |
| `appsettings.json` | Anidada: `"BookStorage": { "FilePath": "..." }` |
| Código (`IConfiguration`) | `"BookStorage:FilePath"` |
| Variable de entorno | `BookStorage__FilePath` |
| Línea de comandos | `--BookStorage:FilePath=...` |

Los nombres de las claves **no distinguen mayúsculas de minúsculas**.

## El Options pattern

La configuración está disponible en un objeto `IConfiguration` (accesible como `builder.Configuration`), y podrías leer un valor así: `configuration["BookStorage:FilePath"]`. Funciona, pero devuelve un `string?` sin tipo y obliga a escribir esa cadena mágica de la clave en cada sitio donde la leas; un error tipográfico en la clave no da error de compilación, solo un `null` en tiempo de ejecución.

:::concept Options pattern
El **Options pattern** convierte una **sección** de la configuración en una **clase tipada** (una "clase de opciones") y la pone a disposición del contenedor de DI. El flujo tiene tres piezas:

1. Una clase de opciones con una propiedad por cada valor (`BookStorageOptions.FilePath`).
2. Un **registro** que vincula (*bind*) una sección de configuración a esa clase: `builder.Services.Configure<BookStorageOptions>(...)`.
3. Quien necesita los valores pide **`IOptions<BookStorageOptions>`** en su constructor y lee `.Value`.

Ganas tipado fuerte (`string`, `int`, `bool`), autocompletado, un único lugar donde se define la clave y valores por defecto en código.
:::

### La clase de opciones

:::vs Crear la clase de opciones
1. Clic derecho sobre el proyecto > **Add** > **New Folder** > **`Options`**.
2. Clic derecho sobre `Options` > **Add** > **Class…** > **`BookStorageOptions.cs`**.
3. Reemplaza el contenido por el código siguiente.
:::

```csharp title="Options/BookStorageOptions.cs"
namespace Bookshelf.Api.Options;

public class BookStorageOptions
{
    public const string SectionName = "BookStorage";

    // Relative paths are resolved against the content root of the application.
    public string FilePath { get; set; } = "Data/books.json";
}
```

| Elemento | Qué significa |
| --- | --- |
| `public const string SectionName = "BookStorage";` | El nombre de la sección, **definido una sola vez** y reutilizable (`BookStorageOptions.SectionName`) para no repetir la cadena. Una `const` es una constante resuelta en tiempo de compilación. |
| `public string FilePath { get; set; }` | Una propiedad por cada clave de la sección. Su **nombre debe coincidir** con la clave (`FilePath`) para que el vínculo funcione (sin distinguir mayúsculas). El `set` es necesario porque el *binder* la asigna. |
| `= "Data/books.json"` | Valor por defecto: si la configuración no trae el valor, se usa este. La aplicación funciona aunque falte la sección. |
| Comentario sobre rutas relativas | Si el valor es relativo, se combina con el *content root*. Si fuera una ruta absoluta (`C:\datos\books.json`), `Path.Combine` la usa tal cual. |

### La sección en appsettings.json

Añade la sección `BookStorage` a `appsettings.json`, **separada por una coma** de la anterior. Cuidado con la coma: es el error más habitual al editar JSON a mano.

```json title="appsettings.json"
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*",
  "BookStorage": {
    "FilePath": "Data/books.json"
  }
}
```

### Registrar las opciones

En `Program.cs`, añade `using Bookshelf.Api.Options;` y el registro, justo antes del del repositorio:

```csharp title="Program.cs"
using Bookshelf.Api.Middleware;
using Bookshelf.Api.Options;
using Bookshelf.Api.Repositories;
using Bookshelf.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

builder.Services.Configure<BookStorageOptions>(
    builder.Configuration.GetSection(BookStorageOptions.SectionName));
builder.Services.AddSingleton<IBookRepository, JsonBookRepository>();
builder.Services.AddScoped<IBookService, BookService>();

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

`builder.Configuration.GetSection("BookStorage")` obtiene el fragmento de configuración bajo esa clave. `Configure<BookStorageOptions>(sección)` le dice al contenedor: "cuando alguien pida `IOptions<BookStorageOptions>`, construye un `BookStorageOptions` rellenando sus propiedades con los valores de esa sección".

### IOptions, IOptionsSnapshot e IOptionsMonitor

Existen tres formas de pedir las opciones. Elegir una depende del tiempo de vida del que las pide y de si quieres que los cambios se reflejen sin reiniciar:

| Tipo | Tiempo de vida | ¿Ve cambios del archivo mientras la app corre? | Úsalo cuando… |
| --- | --- | --- | --- |
| `IOptions<T>` | Singleton | **No**: lee los valores una vez. | Los valores no cambian durante la ejecución. Es el caso más común y el nuestro. |
| `IOptionsSnapshot<T>` | Scoped | **Sí**, en cada petición nueva. | Quieres valores recargables por petición. **No se puede inyectar en un singleton.** |
| `IOptionsMonitor<T>` | Singleton | **Sí**, con notificaciones de cambio. | Un singleton necesita valores que se actualicen en caliente. |

Nuestro repositorio es singleton, así que `IOptions<T>` es la elección natural. Si usáramos `IOptionsSnapshot<T>` en él, caeríamos de nuevo en la dependencia cautiva del paso 8: un servicio *scoped* dentro de un singleton.

### Refactoriza JsonBookRepository

Ahora el repositorio dejará de conocer la ruta literal y pedirá las opciones. Cambia solo los `using` y el constructor; el resto de la clase no se toca.

```csharp title="Repositories/JsonBookRepository.cs (usings y constructor)"
using System.Text.Encodings.Web;
using System.Text.Json;
using Bookshelf.Api.Models;
using Bookshelf.Api.Options;
using Microsoft.Extensions.Options;

namespace Bookshelf.Api.Repositories;

public class JsonBookRepository : IBookRepository
{
    // camelCase names, readable indentation, and accents (García) kept as-is in the file.
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    // Only one request at a time may read or write the file.
    private readonly SemaphoreSlim _lock = new(1, 1);
    private readonly string _filePath;

    public JsonBookRepository(IOptions<BookStorageOptions> options, IHostEnvironment environment)
    {
        _filePath = Path.Combine(environment.ContentRootPath, options.Value.FilePath);
    }

    // ... the rest of the class (GetAllAsync, GetByIdAsync, AddAsync, UpdateAsync,
    // DeleteAsync, LoadAsync, SaveAsync) does not change.
```

| Cambio | Explicación |
| --- | --- |
| `using Bookshelf.Api.Options;` | Para ver `BookStorageOptions`. |
| `using Microsoft.Extensions.Options;` | Contiene `IOptions<T>`. |
| `IOptions<BookStorageOptions> options` | El contenedor construye el objeto de opciones a partir de la configuración y lo entrega envuelto. Se accede al objeto real con `.Value`. |
| `options.Value.FilePath` | Sustituye al literal `"Data/books.json"`. |

El repositorio ahora tiene **dos** dependencias en el constructor, y el contenedor resuelve las dos sin que tú hagas nada más: `IOptions<BookStorageOptions>` (que acabas de configurar) e `IHostEnvironment` (que ya ofrece el framework).

:::checkpoint Todo sigue funcionando igual
Compila y ejecuta con <kbd>Ctrl</kbd> + <kbd>F5</kbd>. `GET /api/books` debe devolver los mismos ocho libros que antes, y `GET /api/books/4` el *Hobbit*. El comportamiento es idéntico; lo que cambió es **de dónde sale** la ruta: de `appsettings.json` en lugar del código. Un refactor correcto no cambia lo que ves.
:::

## Experimento: cambiar el comportamiento sin tocar el código

Comprobemos que de verdad la ruta viene de la configuración. Vas a hacer que la API lea **otro archivo** usando una variable de entorno, que tiene más prioridad que `appsettings.json`.

**1. Crea un archivo de datos alternativo.** Dentro de `Data`, **Add** > **New Item…** > `books-demo.json` con este contenido:

```json title="Data/books-demo.json"
[
  { "id": 1, "title": "Demo book one", "author": "Demo Author", "year": 2000, "genre": "Demo", "isRead": false, "rating": null },
  { "id": 2, "title": "Demo book two", "author": "Demo Author", "year": 2001, "genre": "Demo", "isRead": true, "rating": 3 }
]
```

**2. Define la variable de entorno en el perfil de ejecución.** Abre `Properties/launchSettings.json` (el mismo archivo del paso 3) y añade una entrada a las `environmentVariables` del perfil **`http`**, con coma tras la línea anterior:

```json title="Properties/launchSettings.json (perfil http, temporal)"
"environmentVariables": {
  "ASPNETCORE_ENVIRONMENT": "Development",
  "BookStorage__FilePath": "Data/books-demo.json"
}
```

:::tip También desde la interfaz
Visual Studio permite editar esto sin tocar el JSON: menú **Debug** > **Bookshelf.Api Debug Properties** > **Launch Profiles** > perfil **http** > tabla **Environment variables**. Los cambios se guardan en `launchSettings.json`. Si tu versión organiza la ventana de otra forma, edita directamente el archivo.
:::

**3. Ejecuta y prueba.** Detén la API si estaba en marcha, ejecútala de nuevo con el perfil **http** y haz `GET /api/books`:

```json
[
  { "id": 1, "title": "Demo book one", "author": "Demo Author", "year": 2000, "genre": "Demo", "isRead": false, "rating": null },
  { "id": 2, "title": "Demo book two", "author": "Demo Author", "year": 2001, "genre": "Demo", "isRead": true, "rating": 3 }
]
```

(La respuesta real viene en una sola línea y con `camelCase`; aquí está formateada para leerla.) **Sin recompilar ni cambiar una línea de C#**, la API usa otro archivo. La variable de entorno (fuente 4) ha pisado el valor de `appsettings.json` (fuente 1).

**4. Revierte el experimento.** Quita la línea `"BookStorage__FilePath"` de `launchSettings.json` (y la coma sobrante de la línea anterior), ejecuta de nuevo y comprueba que vuelven los ocho libros. Puedes dejar `books-demo.json` para el reto que sigue.

:::warning Un error común: una coma sobrante en el JSON
`launchSettings.json` y `appsettings.json` no admiten una coma tras el último elemento de un objeto. Si la API deja de arrancar tras editar uno, comprueba primero las comas: Visual Studio subraya el error en rojo.
:::

::::challenge Cambia la ruta solo en Development
La variable de entorno afecta a quien ejecute ese perfil. Una forma más habitual de tener valores distintos por entorno es `appsettings.Development.json`, que se aplica **solo cuando el entorno es `Development`** y pisa a `appsettings.json`.

Tu tarea:

1. Haz que, **en `Development`**, la API use `Data/books-demo.json`, **sin tocar** `appsettings.json` ni el código C#.
2. Comprueba que `GET /api/books` devuelve los dos libros de demostración.
3. Razona: ¿qué pasaría si arrancaras la API con `ASPNETCORE_ENVIRONMENT=Production`? ¿Y si además definieras `BookStorage__FilePath=Data/books.json` como variable de entorno?
4. **Revierte** el cambio al terminar, para que tu `appsettings.Development.json` vuelva a ser el original y borra `books-demo.json`.

:::hint
`appsettings.Development.json` ya existe en tu proyecto (con la sección `Logging`). Solo tienes que añadir en él la misma sección que escribiste en `appsettings.json`, con el valor distinto. No hace falta repetir lo que no cambia: las fuentes se **combinan clave a clave**.
:::

:::hint
Añade, junto a `Logging` y separado por una coma, un bloque `"BookStorage"` con la propiedad `"FilePath"`. La clave debe llamarse exactamente igual que en `appsettings.json` (aunque no distingue mayúsculas). Detén la API y vuelve a ejecutarla: la configuración se lee al arrancar.
:::

:::solution
```json title="appsettings.Development.json (temporal)"
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "BookStorage": {
    "FilePath": "Data/books-demo.json"
  }
}
```

Al ejecutar con el perfil `http` (entorno `Development`), `GET /api/books` devuelve los dos libros de demostración.

Por qué funciona:

- `appsettings.json` se carga primero y define `BookStorage:FilePath = Data/books.json`.
- Como `ASPNETCORE_ENVIRONMENT` vale `Development`, se carga después `appsettings.Development.json`, que redefine la misma clave y **gana**. Las claves que no repite (como `AllowedHosts`) se conservan del primero.
- Si arrancas con `Production`, el archivo `appsettings.Development.json` ni se lee: la ruta es `Data/books.json`. Lo verificamos ejecutando así la aplicación.
- Si además hay una variable de entorno `BookStorage__FilePath=Data/books.json`, esta tiene **más prioridad que cualquier archivo** (también que `appsettings.Development.json`) y gana.

**Para revertir:** deja `appsettings.Development.json` con solo la sección `Logging`, tal y como estaba, y elimina `Data/books-demo.json`.

```json title="appsettings.Development.json (final)"
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  }
}
```
:::
::::

:::troubleshooting Errores comunes
- **`CS0246: The type or namespace name 'IOptions<>' could not be found`:** falta `using Microsoft.Extensions.Options;` en `JsonBookRepository.cs`.
- **`CS0246: ... 'BookStorageOptions' ...`:** falta `using Bookshelf.Api.Options;` en el repositorio o en `Program.cs`.
- **Cambias la configuración y no pasa nada, sin ningún error:** si olvidas la línea `builder.Services.Configure<BookStorageOptions>(...)`, `IOptions<BookStorageOptions>` sigue existiendo (el framework siempre lo registra) pero llega con los valores por defecto de la clase. Es un fallo silencioso: revisa el registro en `Program.cs`.
- **La API sigue usando `Data/books.json` aunque cambiaste la configuración:** (1) no reiniciaste la API (con `IOptions<T>` los valores se leen al arrancar); (2) la clave está mal escrita (`BookStorage:FilePath`, con la sección y la propiedad exactas); (3) otra fuente de mayor prioridad la está pisando, por ejemplo una variable de entorno de un experimento anterior.
- **La API no arranca y falla al leer `appsettings.json` (`JsonReaderException`/`FormatException`):** el JSON es inválido, casi siempre por una coma que falta o sobra.
- **`GET /api/books` devuelve `[]` tras cambiar la ruta:** la ruta apunta a un archivo que no existe y `LoadAsync` lo trata como "sin libros". Comprueba el nombre y que está dentro de `Data`.
:::

:::recap
- La configuración es una **pila de fuentes** con prioridad creciente: `appsettings.json` → `appsettings.{Environment}.json` → user secrets (solo Development) → variables de entorno → línea de comandos. Gana la última.
- Las claves jerárquicas se escriben `Seccion:Clave` en código, `Seccion__Clave` en variables de entorno y anidadas en JSON.
- Las **cadenas mágicas** y los valores escritos a fuego se sacan del código a la configuración.
- El **Options pattern** vincula una sección a una clase tipada (`BookStorageOptions`) con `Configure<T>(sección)`, y se consume con `IOptions<T>`.
- `IOptions<T>` se lee una vez (singleton); `IOptionsSnapshot<T>` se recarga por petición (scoped); `IOptionsMonitor<T>` se recarga en caliente (singleton).
- Cambiaste el comportamiento de la API (qué archivo lee) **sin tocar una línea de C#**.

En el siguiente paso volverás a la parte HTTP: aprenderás cómo ASP.NET Core vincula los datos de una petición a tus parámetros (*model binding*), crearás **DTOs** y construirás el endpoint `POST` para crear libros.
:::
