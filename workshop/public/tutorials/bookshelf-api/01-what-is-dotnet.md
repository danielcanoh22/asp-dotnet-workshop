## Objetivo del paso

Antes de escribir una sola línea de código web, vas a construir un **mapa mental** de las piezas con las que trabajarás: qué es .NET, qué hace exactamente el SDK, qué es ASP.NET Core y qué significa "Web API". Al final del paso comprobarás desde la terminal que tu instalación está lista.

Si ya has escrito C#, conoces el lenguaje. Lo que probablemente no conoces es **la plataforma** que ejecuta ese lenguaje y el **framework web** que usaremos encima. Entender esa diferencia evita mucha confusión más adelante (por ejemplo, saber por qué un error es de C# y otro es de ASP.NET Core).

En este paso no escribirás código del proyecto.

## C# no es lo mismo que .NET

Son tres cosas distintas que se suelen mencionar juntas:

| Pieza | Qué es | Analogía |
| --- | --- | --- |
| **C#** | El lenguaje de programación. Define la sintaxis (`class`, `async`, `record`…) y lo traduce a un formato intermedio. | El idioma en el que escribes la receta. |
| **.NET** | La plataforma: el entorno que ejecuta tu programa y la biblioteca de clases que usas (`List<T>`, `File`, `HttpClient`…). | La cocina con todos sus utensilios. |
| **ASP.NET Core** | Un framework construido sobre .NET para crear aplicaciones web y APIs. | Un restaurante montado en esa cocina. |

:::concept La plataforma .NET: qué la compone
Cuando ejecutas un programa en C#, intervienen varias piezas:

- **Compilador (Roslyn):** convierte tu código C# en un formato intermedio llamado **IL** (*Intermediate Language*), que se guarda en un archivo `.dll`. El IL no es todavía código de máquina.
- **CLR (*Common Language Runtime*):** es el motor que ejecuta tu programa. Se encarga de la memoria (el *garbage collector* libera los objetos que ya nadie usa), de la seguridad de tipos y de las excepciones.
- **JIT (*Just-In-Time compiler*):** parte del CLR. Traduce el IL a **código de máquina** de tu procesador justo antes de ejecutar cada método por primera vez.
- **BCL (*Base Class Library*):** la biblioteca de clases base. Todo lo que usas sin instalar nada extra: `string`, `List<T>`, `Task`, `File`, `JsonSerializer`…
- **NuGet:** el gestor de paquetes. Es el sitio de donde descargas bibliotecas de terceros (y también algunas de Microsoft) para añadirlas a tu proyecto.

El flujo completo, de tu archivo `.cs` a la CPU, es:

```
Program.cs ──▶ Compilador (Roslyn) ──▶ IL en un .dll ──▶ CLR + JIT ──▶ código de máquina
```
:::

:::why ¿Por qué compilar a un lenguaje intermedio?
Porque el mismo `.dll` puede ejecutarse en Windows, Linux o macOS: cada sistema tiene su propio CLR/JIT que sabe traducir el IL al procesador concreto. Tú compilas una vez; la plataforma se adapta al sistema donde se ejecuta. Esto es lo que hace de .NET una plataforma **multiplataforma**.
:::

## SDK y runtime: dos cosas distintas

Esta distinción aparece constantemente en la documentación y en los errores, así que conviene fijarla desde ya.

| | **Runtime** | **SDK** |
| --- | --- | --- |
| Para qué sirve | **Ejecutar** aplicaciones ya compiladas | **Construir** aplicaciones (y también ejecutarlas) |
| Contiene | CLR, BCL y, en el caso web, ASP.NET Core | El compilador, la herramienta `dotnet`, plantillas de proyecto, MSBuild… **más** un runtime |
| Quién lo necesita | Un servidor donde se despliega la app | Tu máquina de desarrollo |

Como desarrollador instalas el **SDK** (Visual Studio lo trae incluido). El comando `dotnet` que usarás en la terminal es la puerta de entrada al SDK: `dotnet new` crea proyectos, `dotnet build` compila, `dotnet run` ejecuta.

En realidad hay dos runtimes que nos interesan:

- **Microsoft.NETCore.App:** el runtime base (CLR + BCL).
- **Microsoft.AspNetCore.App:** las bibliotecas de ASP.NET Core.

## Versiones: LTS frente a STS

Microsoft publica una versión mayor de .NET cada **noviembre**. Las versiones pares son **LTS** (*Long Term Support*) y reciben soporte durante unos 3 años; las impares son **STS** (*Standard Term Support*) y tienen un soporte más corto.

| Versión | Tipo | Comentario |
| --- | --- | --- |
| .NET 8 | LTS | Muy extendida en proyectos existentes. |
| .NET 9 | STS | Versión intermedia. |
| **.NET 10** | **LTS** | **La que usaremos.** Es la opción recomendable para aprender y para producción. |

:::tip Qué significa "LTS" para ti
Para aprender y para proyectos que durarán años, elige LTS: tendrás actualizaciones de seguridad durante más tiempo y menos presión para migrar. Las fechas exactas de fin de soporte cambian, así que consulta la [política de soporte oficial de .NET](https://dotnet.microsoft.com/platform/support/policy/dotnet-core) cuando necesites planificar un proyecto real.
:::

## .NET Framework frente a .NET moderno

Es habitual encontrarse con búsquedas, tutoriales antiguos o ofertas de empleo que mezclan ambos nombres. Son plataformas **diferentes**:

| | **.NET Framework** | **.NET (moderno)** |
| --- | --- | --- |
| Versiones | 1.0 a 4.8 (la última) | Desde .NET 5 en adelante (6, 7, 8, 9, 10…) |
| Sistemas | Solo Windows | Windows, Linux, macOS |
| Estado | Se mantiene, pero no recibe novedades importantes | Es donde ocurre toda la evolución |
| Framework web | ASP.NET (clásico, `System.Web`) | **ASP.NET Core** |

:::warning Cuidado con los tutoriales antiguos
Si un artículo menciona `Global.asax`, `Web.config`, `System.Web` o `ApiController` (la clase, no el atributo), habla de ASP.NET sobre .NET Framework. Su código **no** funciona tal cual en .NET 10. Todo lo que verás en este taller es ASP.NET Core.
:::

## Qué es ASP.NET Core

**ASP.NET Core** es el framework de Microsoft para construir aplicaciones web, APIs y servicios sobre .NET. Es de código abierto, multiplataforma y está diseñado para ser rápido y modular.

Con ASP.NET Core puedes crear varios tipos de aplicaciones: sitios con páginas (Razor Pages, MVC), aplicaciones de interfaz rica (Blazor), servicios en tiempo real (SignalR), servicios gRPC y **Web APIs**. Nosotros haremos una Web API.

### Kestrel: el servidor web integrado

Una aplicación web necesita algo que **escuche en un puerto de red**, reciba las peticiones HTTP y las entregue a tu código. En ASP.NET Core ese componente es **Kestrel**, un servidor web multiplataforma que viene incluido en el framework.

Esto tiene una consecuencia importante: **tu aplicación es un programa de consola** que arranca su propio servidor. No necesitas instalar IIS ni Apache para desarrollar. Cuando pulses F5 en Visual Studio verás una ventana de consola con los registros de Kestrel.

```
Navegador / Cliente HTTP
        │  petición HTTP (por ejemplo GET /api/books)
        ▼
   ┌───────────┐
   │  Kestrel  │   escucha en un puerto (por ejemplo, 5200)
   └─────┬─────┘
         ▼
   Tu aplicación ASP.NET Core  (pipeline, controllers…)
         │
         ▼
   respuesta HTTP  ──▶ de vuelta al cliente
```

## Qué es una Web API y qué es REST

Una **API** (*Application Programming Interface*) es una forma de que un programa hable con otro. Una **Web API** es una API que se usa a través de HTTP: otro programa (una aplicación móvil, una web en Angular, un script) envía una petición y recibe datos, normalmente en formato **JSON**.

Una Web API no devuelve páginas HTML pensadas para que las lea una persona; devuelve **datos** pensados para que los procese otro programa.

:::concept REST en una frase
**REST** es un estilo de diseño de APIs sobre HTTP en el que todo se organiza en torno a **recursos** (por ejemplo, "los libros"), cada recurso tiene una **URL**, y las acciones se expresan con los **verbos HTTP** (`GET` para leer, `POST` para crear, `PUT` para reemplazar, `DELETE` para borrar). Las respuestas usan **códigos de estado** estándar (`200`, `404`…) para indicar qué ocurrió.

Por ejemplo: `GET /api/books/3` significa "dame el libro número 3". No hay que aprender un vocabulario nuevo por API: el verbo y la URL cuentan la historia. En el paso 4 verás HTTP con más detalle y diseñaremos los endpoints de Bookshelf.
:::

## Dos estilos para escribir endpoints: controllers y Minimal APIs

ASP.NET Core ofrece dos formas de definir endpoints. Ambas conviven en el mismo framework y se pueden mezclar.

| | **Controllers (MVC)** | **Minimal APIs** |
| --- | --- | --- |
| Idea | Clases con métodos (*acciones*) marcados con atributos | Funciones registradas directamente con `MapGet`, `MapPost`… |
| Estructura | Convenciones y carpetas claras | Muy libre: tú decides cómo organizar |
| Ventaja | Estructura predecible, mucha funcionalidad integrada (validación automática, filtros), ampliamente usado en proyectos empresariales | Menos ceremonia; ideal para servicios pequeños |
| En este taller | **Tutorial 1 (este)** | Tutorial 2 |

Para que veas la diferencia, así se escribe el mismo tipo de endpoint de las dos formas. No tienes que escribirlo todavía; es solo para reconocerlo:

```csharp title="Estilo Minimal API (lo verás brevemente en el paso 5)"
app.MapGet("/hello", () => "Hello from Bookshelf!");
```

```csharp title="Estilo controller (lo construirás en el paso 7)"
[HttpGet]
public ActionResult<List<Book>> GetAll()
{
    return Ok(Books);
}
```

:::why ¿Por qué empezamos con controllers?
Porque obligan a pensar en **estructura**: un controller por recurso, rutas por atributos, resultados de acción explícitos. Esa disciplina te enseña la arquitectura de una API real y es el estilo que encontrarás en la mayoría de bases de código empresariales existentes. Cuando después aprendas Minimal APIs, entenderás qué cosas el framework hace por ti y cuáles tienes que organizar tú.
:::

## Verifica tu instalación

Vamos a comprobar que el SDK está instalado y que el comando `dotnet` funciona.

:::vs Abre una terminal y ejecuta los comandos
Puedes usar cualquier terminal de Windows (por ejemplo, **Windows Terminal** o **PowerShell**). No necesitas abrir Visual Studio todavía.

1. Pulsa <kbd>Win</kbd> y escribe `PowerShell`, o abre **Windows Terminal**.
2. Ejecuta el primer comando, que muestra la versión del SDK que usará por defecto:

```powershell
dotnet --version
```

3. Ejecuta el segundo, que lista todos los SDK instalados:

```powershell
dotnet --list-sdks
```

4. Ejecuta el tercero, que lista los runtimes instalados:

```powershell
dotnet --list-runtimes
```
:::

:::checkpoint Resultado esperado
Los números exactos dependen de cuándo instalaste Visual Studio, pero deben ser de la familia **10**. En un equipo con el SDK 10.0.401, el resultado es parecido a:

```
> dotnet --version
10.0.401

> dotnet --list-sdks
10.0.401 [C:\Program Files\dotnet\sdk]

> dotnet --list-runtimes
Microsoft.AspNetCore.App 10.0.12 [C:\Program Files\dotnet\shared\Microsoft.AspNetCore.App]
Microsoft.NETCore.App 10.0.12 [C:\Program Files\dotnet\shared\Microsoft.NETCore.App]
```

Qué debes comprobar:

- `dotnet --version` empieza por **10.**
- Hay un SDK `10.x` en la lista.
- Aparecen los dos runtimes: `Microsoft.NETCore.App` (base) y `Microsoft.AspNetCore.App` (web), con versión `10.x`.

Es normal que veas además SDK o runtimes de otras versiones (por ejemplo, 8.0). Pueden convivir sin problema.
:::

:::tip Idioma de los mensajes de la CLI
La herramienta `dotnet` muestra sus mensajes en el idioma de tu sistema. Si tu Windows está en español, verás por ejemplo "Compilación correcta" donde este taller escribe "Build succeeded". El significado es el mismo.
:::

:::troubleshooting Errores comunes
- **`dotnet : El término 'dotnet' no se reconoce como nombre de un cmdlet…`** (o `'dotnet' is not recognized as an internal or external command`): el SDK no está instalado o no está en el `PATH`. Abre el **Visual Studio Installer**, pulsa **Modificar** en tu instalación y marca la carga de trabajo **ASP.NET y desarrollo web**. Cierra y vuelve a abrir la terminal después de instalar, porque una terminal ya abierta no ve el `PATH` actualizado.
- **`dotnet --version` muestra 8.x o 9.x en vez de 10.x:** tienes una versión anterior como predeterminada, a menudo por un archivo `global.json` en una carpeta superior que fija otra versión. Ejecuta `dotnet --list-sdks`: si el SDK 10 aparece en la lista, está instalado y puedes continuar. Si no aparece, instálalo con el Visual Studio Installer.
- **Solo ves SDK 10, pero ninguna línea `Microsoft.AspNetCore.App`:** falta el runtime web. Se instala con la carga de trabajo **ASP.NET y desarrollo web**.
:::

:::recap
- **C#** es el lenguaje; **.NET** es la plataforma que lo ejecuta (CLR, JIT, BCL); **ASP.NET Core** es el framework web construido encima.
- El **SDK** sirve para construir y el **runtime** para ejecutar. Tú trabajas con el SDK.
- Usamos **.NET 10**, una versión **LTS**. No confundas .NET moderno con .NET Framework.
- **Kestrel** es el servidor web incluido: tu aplicación es un programa de consola que escucha peticiones HTTP.
- Una **Web API REST** expone recursos mediante URLs y verbos HTTP, y devuelve datos (JSON).
- Hay dos estilos de endpoints: **controllers** (este tutorial) y **Minimal APIs** (el siguiente).

En el siguiente paso crearás el proyecto en Visual Studio 2026 y lo ejecutarás por primera vez.
:::
