## Objetivo del paso

La plantilla ha generado varios archivos y carpetas. Antes de modificar nada, vas a entender **para qué sirve cada uno**: qué se compila, qué configura el entorno, qué arranca la aplicación y qué es solo salida de compilación. Al final del paso eliminarás el ejemplo del tiempo (`WeatherForecast`) para dejar el proyecto limpio y listo para Bookshelf.

Este recorrido es importante porque, en un proyecto ASP.NET Core, mucha funcionalidad vive en archivos de configuración (`.csproj`, `launchSettings.json`, `appsettings.json`) y no en C#. Saber dónde mirar ahorra horas cuando algo no se comporta como esperas.

## Solution Explorer

Esta es la vista aproximada de tu proyecto en **Solution Explorer**. Algunos nodos pueden variar ligeramente según la versión de Visual Studio.

```
Solución 'Bookshelf'
└── Bookshelf.Api
    ├── Connected Services          (puede aparecer; no lo usaremos)
    ├── Dependencies                (paquetes NuGet, analizadores y frameworks)
    ├── Properties
    │   └── launchSettings.json
    ├── Controllers
    │   └── WeatherForecastController.cs
    ├── appsettings.json
    │   └── appsettings.Development.json
    ├── Bookshelf.Api.http
    ├── Program.cs
    └── WeatherForecast.cs
```

:::tip Ver todos los archivos
Solution Explorer oculta por defecto las carpetas `bin` y `obj`. Para verlas, pulsa el botón **Show All Files** (*Mostrar todos los archivos*) de la barra de herramientas del propio panel. Vuelve a pulsarlo para ocultarlas. También puedes abrir la carpeta del proyecto desde el Explorador de archivos de Windows (clic derecho sobre el proyecto > **Open Folder in File Explorer**).
:::

## El archivo de solución (.slnx)

La solución no aparece como archivo en Solution Explorer, pero está en la carpeta `Bookshelf` junto a la carpeta del proyecto. Es muy corto:

```xml title="Bookshelf.slnx"
<Solution>
  <Project Path="Bookshelf.Api/Bookshelf.Api.csproj" />
</Solution>
```

Solo dice: "esta solución contiene el proyecto que está en esta ruta". Al añadir más proyectos aparecerán más líneas `<Project>`.

## El archivo de proyecto (.csproj)

Para abrirlo, haz **doble clic** en el nodo `Bookshelf.Api` de Solution Explorer. (En proyectos de estilo SDK, como este, Visual Studio abre directamente el `.csproj`. También puedes hacer clic derecho sobre el proyecto > **Edit Project File**.)

```xml title="Bookshelf.Api.csproj"
<Project Sdk="Microsoft.NET.Sdk.Web">

  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.AspNetCore.OpenApi" Version="10.0.12" />
  </ItemGroup>

</Project>
```

:::concept Proyecto estilo SDK
Un `.csproj` moderno es un pequeño archivo XML que **delega casi todo en un SDK**. La primera línea, `Sdk="Microsoft.NET.Sdk.Web"`, le dice a MSBuild (el motor de compilación) que use el SDK web, que ya sabe:

- que **todos los archivos `.cs`** de la carpeta pertenecen al proyecto (no hay que listarlos uno a uno);
- cómo compilar, y cómo referenciar el framework de ASP.NET Core;
- qué hacer con `appsettings.json` al compilar (copiarlo junto al ejecutable).

Por eso el archivo es tan corto. En el pasado, los `.csproj` listaban cada archivo y ocupaban cientos de líneas.
:::

Cada elemento tiene su función:

| Elemento | Qué hace |
| --- | --- |
| `Sdk="Microsoft.NET.Sdk.Web"` | Usa el SDK para aplicaciones web (los proyectos de consola o bibliotecas usan `Microsoft.NET.Sdk`). |
| `<TargetFramework>net10.0</TargetFramework>` | Versión de .NET para la que compilas. `net10.0` = .NET 10. |
| `<Nullable>enable</Nullable>` | Activa los **tipos de referencia anulables**. Con esto, `string` significa "nunca es null" y `string?` significa "puede ser null"; el compilador te avisa si los mezclas. |
| `<ImplicitUsings>enable</ImplicitUsings>` | Añade automáticamente un conjunto de `using` globales para no repetirlos en cada archivo. |
| `<PackageReference ... />` | Una dependencia NuGet: el paquete y su versión. |

### Qué son los *implicit usings*

Con `ImplicitUsings` activado, el compilador genera un archivo oculto (en `obj/Debug/net10.0/`) con `global using` para los espacios de nombres más usados. Para un proyecto web incluye, entre otros:

```csharp
global using Microsoft.AspNetCore.Builder;
global using Microsoft.AspNetCore.Http;
global using Microsoft.Extensions.DependencyInjection;
global using Microsoft.Extensions.Logging;
global using System;
global using System.Collections.Generic;
global using System.Linq;
global using System.Threading.Tasks;
```

Por eso, en `Program.cs` puedes escribir `WebApplication.CreateBuilder(args)` sin ningún `using` arriba, y en tus clases podrás usar `List<T>`, `Task` o `ILogger<T>` directamente, porque sus espacios de nombres están en esa lista. Cuando uses algo de otro espacio de nombres (por ejemplo, `Microsoft.AspNetCore.Mvc` para los controllers), sí tendrás que escribir el `using` correspondiente.

:::why ¿Por qué activar Nullable?
Porque el error más frecuente en C# es `NullReferenceException`. Con `Nullable` activado, el compilador te avisa **al compilar** si podrías estar usando algo que puede ser `null`. Es una red de seguridad gratuita. Verás avisos (*warnings*) como `CS8618` cuando una propiedad `string` no tenga valor inicial; en el paso 7 veremos cómo resolverlo.
:::

## Dependencies y NuGet

El nodo **Dependencies** de Solution Explorer muestra todo lo que tu proyecto necesita para compilar:

- **Packages:** los paquetes NuGet que referencias (hoy, `Microsoft.AspNetCore.OpenApi`).
- **Analyzers:** reglas que el compilador aplica para avisarte de malas prácticas.
- **Frameworks:** los frameworks incluidos en el runtime (`Microsoft.AspNetCore.App` y `Microsoft.NETCore.App`). No son paquetes NuGet: vienen con la instalación de .NET.

:::vs Ver y gestionar los paquetes NuGet
1. En Solution Explorer, haz clic derecho sobre el proyecto `Bookshelf.Api` > **Manage NuGet Packages…**
2. En la pestaña **Installed** verás `Microsoft.AspNetCore.OpenApi` con su versión.
3. La pestaña **Browse** permite buscar e instalar paquetes nuevos. Hoy no instalaremos ninguno; solo mira y cierra la pestaña.
:::

:::concept NuGet
**NuGet** es el sistema de paquetes de .NET. Un paquete es un `.dll` (o varios) con metadatos y su lista de dependencias. Al compilar, Visual Studio **restaura** los paquetes: descarga los que falten desde nuget.org a una caché local y los referencia. Añadir un paquete significa añadir una línea `PackageReference` al `.csproj`, que es lo que hace el gestor de paquetes por ti.
:::

## Program.cs: el punto de entrada

`Program.cs` es el archivo donde la aplicación **arranca**. Ábrelo:

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

De momento fíjate solo en la **forma**: se crea un *builder*, se le registran cosas, se construye la aplicación, se le configuran más cosas y se ejecuta. En el paso 5 explicaremos cada línea; en el 6, el orden de las que empiezan por `app.Use…`.

## Properties/launchSettings.json

Este archivo no forma parte de tu aplicación: lo lee **Visual Studio** (y `dotnet run`) para saber **cómo lanzarla** durante el desarrollo.

```json title="Properties/launchSettings.json"
{
  "$schema": "https://json.schemastore.org/launchsettings.json",
  "profiles": {
    "http": {
      "commandName": "Project",
      "dotnetRunMessages": true,
      "launchBrowser": false,
      "applicationUrl": "http://localhost:5125",
      "environmentVariables": {
        "ASPNETCORE_ENVIRONMENT": "Development"
      }
    },
    "https": {
      "commandName": "Project",
      "dotnetRunMessages": true,
      "launchBrowser": false,
      "applicationUrl": "https://localhost:7066;http://localhost:5125",
      "environmentVariables": {
        "ASPNETCORE_ENVIRONMENT": "Development"
      }
    }
  }
}
```

| Propiedad | Significado |
| --- | --- |
| `profiles` | Cada entrada es un **perfil de ejecución**; son los que ves en el desplegable de la barra de herramientas. |
| `commandName: "Project"` | Ejecuta el proyecto directamente con Kestrel (la alternativa `IISExpress` usaría IIS Express, que aquí no necesitamos). |
| `dotnetRunMessages` | Muestra mensajes de `dotnet run`, como "Building…". |
| `launchBrowser: false` | No abre el navegador al arrancar. |
| `applicationUrl` | Las direcciones donde escucha Kestrel. Varias direcciones se separan con `;`. Los puertos son aleatorios en cada proyecto. |
| `environmentVariables` | Variables de entorno que se definen para el proceso. `ASPNETCORE_ENVIRONMENT` fija el **entorno** (lo usaremos en el paso 5). |

:::warning launchSettings.json es solo para desarrollo
Este archivo **no se publica** con tu aplicación. En un servidor real, las variables de entorno y las URLs se configuran de otra forma. Por eso nunca debes poner secretos ni lógica importante aquí.
:::

:::vs Editar los perfiles sin tocar el JSON
Visual Studio ofrece una interfaz para editar este archivo: menú **Debug** > **Bookshelf.Api Debug Properties** (el nombre cambia con el de tu proyecto) y busca la sección de **Launch Profiles**. Los cambios se guardan en `launchSettings.json`. En este taller editaremos el JSON directamente, que es lo más predecible.
:::

## appsettings.json y appsettings.Development.json

Son los archivos de **configuración** de la aplicación. Tienen formato JSON y se leen al arrancar.

```json title="appsettings.json"
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*"
}
```

```json title="appsettings.Development.json"
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  }
}
```

:::concept Configuración por entorno
ASP.NET Core carga primero `appsettings.json` (valores comunes a todos los entornos) y después `appsettings.{Entorno}.json` (valores específicos del entorno actual), que **sobrescriben** los anteriores. Con `ASPNETCORE_ENVIRONMENT=Development`, se carga `appsettings.Development.json` encima del base.

Así puedes tener, por ejemplo, registros más detallados en desarrollo y más silenciosos en producción, sin cambiar código. En el paso 10 añadiremos nuestra propia sección de configuración.
:::

Qué significa el contenido que ya existe:

| Clave | Significado |
| --- | --- |
| `Logging:LogLevel:Default` | Nivel mínimo de registros de **tu** código y de las bibliotecas sin regla propia. `Information` muestra mensajes informativos, advertencias y errores. |
| `Logging:LogLevel:Microsoft.AspNetCore` | Para todo lo que sea del framework (nombres que empiezan por `Microsoft.AspNetCore`), solo se muestran **advertencias o peor**. Por eso la consola no se llena de mensajes por cada petición. |
| `AllowedHosts: "*"` | Qué nombres de host acepta la API (`*` = todos). Es una medida de seguridad para producción. |

## El archivo .http, bin y obj

- **`Bookshelf.Api.http`:** ya lo usaste en el paso anterior. Es solo una herramienta de prueba: no forma parte de la aplicación ni se compila.
- **`bin/`:** contiene el resultado de compilar (el `.dll` y sus dependencias). Es lo que realmente se ejecuta.
- **`obj/`:** archivos intermedios de la compilación y la información de restauración de NuGet.

Ambas carpetas se **regeneran** al compilar y se excluyen de Git. Si algún día Visual Studio se comporta de forma extraña, cerrar la solución, borrar `bin` y `obj` y volver a compilar es una solución segura y habitual.

## Anatomía de un controller: el ejemplo del tiempo

Antes de borrarlo, mira lo que generó la plantilla en `Controllers/WeatherForecastController.cs`. Será tu primer contacto con un controller; en el paso 7 construirás el tuyo desde cero y lo explicaremos con detalle, así que ahora solo busca estas cuatro ideas:

```csharp title="Controllers/WeatherForecastController.cs"
using Microsoft.AspNetCore.Mvc;

namespace Bookshelf.Api.Controllers;

[ApiController]
[Route("[controller]")]
public class WeatherForecastController : ControllerBase
{
    private static readonly string[] Summaries =
    [
        "Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching"
    ];

    [HttpGet(Name = "GetWeatherForecast")]
    public IEnumerable<WeatherForecast> Get()
    {
        return Enumerable.Range(1, 5).Select(index => new WeatherForecast
        {
            Date = DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
            TemperatureC = Random.Shared.Next(-20, 55),
            Summary = Summaries[Random.Shared.Next(Summaries.Length)]
        })
        .ToArray();
    }
}
```

1. **Es una clase que hereda de `ControllerBase`** y está marcada con `[ApiController]`.
2. **`[Route("[controller]")]`** hace que la ruta sea el nombre de la clase sin el sufijo `Controller`: `WeatherForecast`. Por eso la petición fue a `/weatherforecast` (las rutas no distinguen mayúsculas).
3. **`[HttpGet]`** marca el método `Get` como la acción que responde a `GET`.
4. **El valor que devuelve el método se convierte en JSON** automáticamente, usando el modelo `WeatherForecast.cs` (una clase con propiedades).

## Limpia el proyecto

El ejemplo del tiempo no pertenece a Bookshelf. Lo eliminamos para empezar con una base limpia.

:::vs Eliminar el ejemplo del tiempo
1. Si la API sigue en ejecución, deténla (<kbd>Shift</kbd> + <kbd>F5</kbd>, o cierra la ventana de consola).
2. En Solution Explorer, haz clic derecho sobre **`WeatherForecast.cs`** > **Delete**. Confirma el diálogo.
3. Expande la carpeta **Controllers**, haz clic derecho sobre **`WeatherForecastController.cs`** > **Delete** y confirma. La carpeta `Controllers` se queda vacía; la conservamos, la usaremos enseguida.
4. Abre `Bookshelf.Api.http` y deja solo la primera línea (la variable). Borra la petición `GET .../weatherforecast/`, su cabecera `Accept` y el `###`.
5. Guarda con <kbd>Ctrl</kbd> + <kbd>S</kbd>.
:::

El archivo `.http` debe quedar así (con **tu** puerto):

```http title="Bookshelf.Api.http"
@Bookshelf.Api_HostAddress = http://localhost:5125
```

Si añadiste la petición de `/openapi/v1.json` en el paso anterior, puedes conservarla; no estorba.

### Compila

:::vs Compilar la solución
1. Pulsa <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd> (menú **Build** > **Build Solution**).
2. Abre la ventana **Output** (menú **View** > **Output**, o <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>O</kbd>) y selecciona **Build** en el desplegable *Show output from*.
:::

:::checkpoint El proyecto compila sin errores
En la ventana **Output** debes ver una línea final parecida a:

```
========== Build: 1 succeeded, 0 failed, 0 up-to-date, 0 skipped ==========
```

Si lo prefieres, ejecuta la API de nuevo y comprueba dos cosas:

- Una petición a `/weatherforecast` devuelve **`404 Not Found`** (ya no existe ese endpoint).
- `/openapi/v1.json` sigue funcionando, pero ahora sus rutas están vacías: `"paths": { }`. Es la prueba de que OpenAPI describe lo que **realmente** existe en tu API.
:::

:::troubleshooting Errores comunes
- **`CS0246: The type or namespace name 'WeatherForecast' could not be found`:** borraste `WeatherForecast.cs` pero no el controller que lo usa. Elimina también `Controllers/WeatherForecastController.cs`.
- **El proyecto no compila porque el archivo está en uso (`The process cannot access the file 'Bookshelf.Api.exe' because it is being used by another process`):** la API sigue ejecutándose. Detenla antes de compilar.
- **Borré un archivo que no debía:** **Delete** en Solution Explorer elimina el archivo del disco. Revisa la Papelera de reciclaje de Windows o, si no lo encuentras, vuelve a crear el proyecto con las mismas opciones del paso 2 y copia el archivo que necesites.
- **El nodo `Dependencies` muestra un triángulo amarillo:** hay un problema con un paquete NuGet. Haz clic derecho sobre la solución > **Restore NuGet Packages** y revisa que tienes conexión a internet.
:::

:::recap
- **`.slnx` / `.csproj`:** la solución agrupa proyectos; el `.csproj` (estilo SDK) define el framework (`net10.0`), `Nullable`, `ImplicitUsings` y los paquetes NuGet.
- **`Program.cs`** es el punto de entrada: crea el builder, registra servicios, construye la app y la ejecuta (lo detallamos en el paso 5).
- **`launchSettings.json`** define los perfiles de ejecución de desarrollo (URLs y entorno); no se publica.
- **`appsettings.json`** + **`appsettings.{Entorno}.json`** forman la configuración por capas.
- **`bin/` y `obj/`** son salida de compilación y se regeneran.
- Eliminaste el ejemplo del tiempo; el proyecto compila y está limpio.

En el siguiente paso dejarás el código un momento para aprender los fundamentos de HTTP y diseñar, antes de programarlos, los endpoints de Bookshelf.
:::
