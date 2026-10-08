## Objetivo del paso

En este paso vas a crear la solución y el proyecto de Bookshelf con Visual Studio 2026, a elegir con criterio cada opción del asistente, y a **ejecutar la API por primera vez**. Al terminar habrás visto una petición HTTP real viajar de tu editor a tu aplicación y volver con JSON.

Ver algo funcionando cuanto antes es intencional: el proyecto que genera la plantilla ya incluye un endpoint de ejemplo, y lo usaremos para comprobar que todo el entorno está bien antes de escribir código propio.

## Dos conceptos antes de empezar: solución y proyecto

:::concept Solución y proyecto
- Un **proyecto** es la unidad que se compila en un único resultado (aquí, una aplicación web). Se describe en un archivo `.csproj` y contiene tu código.
- Una **solución** es un contenedor que agrupa uno o varios proyectos. Se describe en un archivo de solución (`.slnx` en las versiones recientes).

Piensa en la solución como una carpeta de trabajo y en el proyecto como una de las aplicaciones o bibliotecas que hay dentro. Hoy tendremos una solución con un solo proyecto, pero en aplicaciones reales es habitual separar, por ejemplo, la API, las pruebas y una biblioteca de lógica compartida en proyectos distintos dentro de la misma solución.
:::

:::why ¿Por qué crear la solución con un nombre propio?
Visual Studio puede usar el mismo nombre para ambos, pero si nombras la solución `Bookshelf` y el proyecto `Bookshelf.Api` dejas espacio para añadir más proyectos después (por ejemplo, `Bookshelf.Tests`) sin renombrar nada. La convención `Empresa.Producto.Capa` (con puntos) es muy común en .NET: el nombre del proyecto también se convierte en el **espacio de nombres** raíz (`namespace Bookshelf.Api`).
:::

## Crea el proyecto

:::vs Crear la solución y el proyecto
1. Abre **Visual Studio 2026**.
2. En la ventana de inicio, pulsa **Crear un nuevo proyecto** (*Create a new project*). Si ya tienes Visual Studio abierto, usa el menú **File** > **New** > **Project**.
3. En el cuadro de búsqueda escribe `Web API`.
4. Elige la plantilla **ASP.NET Core Web API** con la etiqueta **C#** y pulsa **Next**.
   - Si ves varias plantillas con nombres parecidos, evita las que digan **(native AOT)**, **F#** o **Aspire**. La que necesitas se llama simplemente *ASP.NET Core Web API*.
5. En la pantalla **Configure your new project** (*Configurar el nuevo proyecto*):
   - **Project name:** `Bookshelf.Api`
   - **Location:** la carpeta donde guardas tus proyectos (por ejemplo, `C:\Users\TuUsuario\source\repos`).
   - **Solution name:** `Bookshelf`
   - **Place solution and project in the same directory:** déjalo **desmarcado**.
   - Pulsa **Next**.
6. En la pantalla **Additional information** (*Información adicional*) configura las opciones como se indica en la tabla siguiente y pulsa **Create**.
:::

:::warning Los nombres de las opciones pueden variar un poco
Las opciones de la pantalla **Additional information** que menciona la documentación oficial de Microsoft son: *Framework*, *Enable OpenAPI support*, *Use controllers* y *Do not use top-level statements*, además de las de autenticación, HTTPS, contenedores y .NET Aspire. El texto exacto, el idioma y el orden pueden cambiar entre versiones de Visual Studio, y algunas opciones (como la de Aspire) dependen de las cargas de trabajo instaladas. Guíate por el **significado** de cada opción, no por su posición.
:::

### Qué significa cada opción y qué valor elegir

| Opción | Valor | Qué significa y por qué lo elegimos |
| --- | --- | --- |
| **Framework** | **.NET 10.0 (Long Term Support)** | La versión de .NET para la que se compila el proyecto. Elegimos LTS por soporte a largo plazo. |
| **Authentication type** | **None** | Define si la plantilla añade código de login. No lo usaremos en este tutorial; añadirlo ahora ensuciaría el proyecto. |
| **Configure for HTTPS** | **Marcado** | Prepara la aplicación para usar HTTPS (conexión cifrada) además de HTTP. Es lo normal en cualquier API real, y deja listo `UseHttpsRedirection`. |
| **Enable container support** | **Desmarcado** | Añade un `Dockerfile` para ejecutar la app en contenedores. Es un tema de despliegue que queda fuera del tutorial. |
| **Enable OpenAPI support** | **Marcado** | Añade la generación automática de un documento OpenAPI que describe tu API. Lo aprovecharemos en el paso 15 para documentarla. |
| **Do not use top-level statements** | **Desmarcado** | Con la casilla desmarcada, `Program.cs` usa *top-level statements* (código sin clase ni `Main` explícitos). Es el estilo moderno y el que explicaremos en el paso 5. |
| **Use controllers** | **Marcado** | Genera una API basada en controllers. Si la desmarcas, la plantilla crea una Minimal API. |
| **Enlist in .NET Aspire orchestration** | **Desmarcado** | Aspire coordina varios servicios y dependencias en la nube. No es necesario para una API sencilla. |

:::why ¿Por qué "Use controllers" y no Minimal APIs?
Los dos estilos son válidos y puedes combinarlos. Elegimos controllers en este tutorial porque:

- Imponen una **estructura** clara (un controller por recurso) que facilita aprender la arquitectura de una API.
- Incluyen por convención muchas funciones útiles (validación automática con `[ApiController]`, enrutamiento por atributos, resultados de acción tipados).
- Son muy habituales en proyectos empresariales ya existentes, así que encontrarás este estilo en el trabajo.

Las Minimal APIs las verás en el **tutorial 2**, donde podrás comparar con conocimiento de causa.
:::

Cuando pulses **Create**, Visual Studio genera los archivos, restaura los paquetes NuGet y abre `Program.cs`. Si **Solution Explorer** (el panel de la derecha) no está visible, ábrelo con **View** > **Solution Explorer** o con <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>L</kbd>. Deberías ver la solución `Bookshelf` y, dentro, el proyecto `Bookshelf.Api` con sus archivos. En el paso 3 los recorreremos uno por uno.

:::tip Formato de la solución: .slnx
Las versiones modernas de .NET y Visual Studio guardan la solución en un archivo **`.slnx`**, un formato XML corto y legible. Si en tu instalación ves `Bookshelf.sln` en lugar de `Bookshelf.slnx`, no pasa nada: funcionan igual para este tutorial.
:::

## Ejecuta la API por primera vez

### Elige el perfil de ejecución

El proyecto trae dos **perfiles de ejecución** (se definen en `Properties/launchSettings.json`, que verás en el paso 3): `http` y `https`. Se eligen en la barra de herramientas, en el desplegable que hay junto al botón verde de ejecutar.

:::vs Seleccionar el perfil http
1. En la barra de herramientas superior, localiza el botón verde de ejecutar. A su derecha hay una flecha desplegable; el texto del botón suele mostrar el perfil actual (`https` o `http`).
2. Abre el desplegable y elige **http**.
:::

:::why ¿Por qué empezamos con el perfil http?
Con `http` la API escucha solo en HTTP sin cifrar, así que no hay certificados de por medio. El perfil `https` añade un redireccionamiento automático de HTTP a HTTPS y requiere confiar en el **certificado de desarrollo** de ASP.NET Core. Es sencillo, pero para tu primera ejecución conviene eliminar variables. En producción, siempre HTTPS.
:::

### F5 o Ctrl+F5

| Atajo | Qué hace | Cuándo usarlo |
| --- | --- | --- |
| <kbd>F5</kbd> | **Inicia con depuración** (*Start Debugging*). Visual Studio se adjunta al proceso, así que puedes poner puntos de interrupción (*breakpoints*) y examinar variables. | Cuando quieres depurar. |
| <kbd>Ctrl</kbd> + <kbd>F5</kbd> | **Inicia sin depurar** (*Start Without Debugging*). Arranca algo más rápido y no se adjunta el depurador. | Cuando solo quieres probar la API. |

:::vs Ejecutar la API
1. Pulsa <kbd>Ctrl</kbd> + <kbd>F5</kbd>.
2. Se abre una **ventana de consola**: es tu aplicación ASP.NET Core ejecutándose, con Kestrel como servidor. Déjala abierta.
3. **No** se abrirá ningún navegador. Es lo esperado: la plantilla de .NET 10 está configurada con `"launchBrowser": false`, porque una API no tiene páginas que mostrar.
4. Para detener la aplicación: si ejecutaste con <kbd>F5</kbd>, usa <kbd>Shift</kbd> + <kbd>F5</kbd> (*Stop Debugging*); si usaste <kbd>Ctrl</kbd> + <kbd>F5</kbd>, cierra la ventana de consola o pulsa <kbd>Ctrl</kbd> + <kbd>C</kbd> dentro de ella.
:::

En la consola verás algo parecido a esto (la ruta y el puerto serán los tuyos):

```
info: Microsoft.Hosting.Lifetime[14]
      Now listening on: http://localhost:5125
info: Microsoft.Hosting.Lifetime[0]
      Application started. Press Ctrl+C to shut down.
info: Microsoft.Hosting.Lifetime[0]
      Hosting environment: Development
info: Microsoft.Hosting.Lifetime[0]
      Content root path: C:\Users\TuUsuario\source\repos\Bookshelf\Bookshelf.Api
```

Cada línea tiene un significado:

| Línea | Qué te dice |
| --- | --- |
| `info:` | El nivel del mensaje (`info` = informativo; también existen `warn`, `fail`…). |
| `Now listening on: http://localhost:5125` | Kestrel está escuchando peticiones en ese puerto. **Anota tu puerto.** |
| `Application started. Press Ctrl+C to shut down.` | La aplicación terminó de arrancar. |
| `Hosting environment: Development` | El *entorno* actual. Lo explicamos en el paso 5. |
| `Content root path` | La carpeta raíz de tu proyecto. |

:::warning Tu puerto no será 5125
Visual Studio asigna un puerto **aleatorio** a cada proyecto nuevo. A lo largo del tutorial usaremos `5125` como ejemplo, pero tú debes usar el que aparezca en **tu** consola (o en tu archivo `launchSettings.json`).
:::

## Llama a la API desde el archivo .http

Podrías abrir el navegador y escribir la URL, pero ese método solo permite `GET`. Visual Studio incluye un editor de archivos **`.http`** que te permite escribir peticiones de cualquier tipo, enviarlas con un clic y ver la respuesta al lado. Será nuestra herramienta de pruebas durante todo el tutorial.

:::vs Abrir y usar Bookshelf.Api.http
1. En **Solution Explorer**, haz doble clic en **`Bookshelf.Api.http`**.
2. Verás un contenido parecido a este:

```http title="Bookshelf.Api.http"
@Bookshelf.Api_HostAddress = http://localhost:5125

GET {{Bookshelf.Api_HostAddress}}/weatherforecast/
Accept: application/json

###
```

3. **Comprueba la primera línea:** el puerto debe ser **el mismo** que muestra tu consola (`Now listening on: http://localhost:...`). Si no coincide, cámbialo y guarda el archivo con <kbd>Ctrl</kbd> + <kbd>S</kbd>.
4. Con la API en ejecución, pulsa el enlace **Send request** que aparece encima de la línea `GET`.
5. A la derecha se abre un panel con la respuesta: código de estado, cabeceras y cuerpo.
:::

Esto es lo que significa cada parte del archivo:

| Fragmento | Significado |
| --- | --- |
| `@Bookshelf.Api_HostAddress = ...` | Define una **variable** con la dirección base de tu API. Evita repetir la URL en cada petición. |
| `GET {{Bookshelf.Api_HostAddress}}/weatherforecast/` | Una petición: verbo `GET` y URL. Las llaves dobles `{{ }}` sustituyen la variable por su valor. |
| `Accept: application/json` | Una **cabecera**: le dice a la API que quieres la respuesta en JSON. |
| `###` | Separador: lo que viene después es otra petición distinta. |

:::checkpoint Primera respuesta de la API
La respuesta debe tener estado **`200 OK`** y un cuerpo JSON con cinco previsiones del tiempo. Los valores cambian en cada llamada porque la plantilla los genera al azar:

```json
[
  {
    "date": "2026-10-09",
    "temperatureC": 13,
    "temperatureF": 55,
    "summary": "Freezing"
  },
  {
    "date": "2026-10-10",
    "temperatureC": 46,
    "temperatureF": 114,
    "summary": "Hot"
  }
]
```

(El resultado real tiene cinco elementos.) En la consola de la API verás que la petición no imprime nada especial: la plantilla no registra cada petición. Eso lo cambiaremos en el paso 6.

Si ves el JSON, tu entorno funciona de principio a fin: Visual Studio compiló la API, Kestrel la sirve y el editor `.http` la consulta.
:::

### El documento OpenAPI

Como dejaste marcada la opción **Enable OpenAPI support**, la API publica una descripción de sí misma. Añade esta petición al final de `Bookshelf.Api.http` (después del último `###`):

```http title="Bookshelf.Api.http (petición adicional)"
GET {{Bookshelf.Api_HostAddress}}/openapi/v1.json
Accept: application/json

###
```

Envíala con **Send request**. Recibirás un documento JSON que empieza así:

```json
{
  "openapi": "3.1.1",
  "info": {
    "title": "Bookshelf.Api | v1",
    "version": "1.0.0"
  },
  "paths": {
    "/WeatherForecast": {
      "get": { ... }
    }
  }
}
```

:::concept OpenAPI
**OpenAPI** es un estándar para describir una API en un documento legible por máquinas: qué rutas existen, qué parámetros reciben y qué respuestas devuelven. Herramientas como Scalar o Swagger UI leen ese documento y generan una página de documentación interactiva. Ahora mismo describe el endpoint de ejemplo; al final del tutorial describirá tus propios endpoints y construiremos una página de documentación con él.
:::

## Equivalente por línea de comandos

Todo lo que hace Visual Studio se puede hacer con la CLI de .NET. Conocer los comandos te ayuda a entender qué hay detrás del asistente y te será útil si algún día trabajas sin IDE.

:::tip Mismo resultado desde la terminal (opcional)
Estos comandos crean la misma solución y proyecto. Ejecútalos en una carpeta vacía **solo si quieres comparar**; no los necesitas si ya creaste el proyecto con Visual Studio.

```powershell
dotnet new sln -n Bookshelf
dotnet new webapi --use-controllers -n Bookshelf.Api -o Bookshelf.Api
dotnet sln add Bookshelf.Api/Bookshelf.Api.csproj
dotnet run --project Bookshelf.Api --launch-profile http
```

- `dotnet new sln` crea el archivo de solución (en .NET 10, de formato `.slnx`).
- `dotnet new webapi --use-controllers` crea el proyecto Web API con controllers. Sin `--use-controllers` se crearía una Minimal API.
- `dotnet sln add` añade el proyecto a la solución.
- `dotnet run --launch-profile http` compila y ejecuta con el perfil `http`.
:::

## Para explorar: el perfil https

Si tienes curiosidad, cambia el perfil a **https**, ejecuta de nuevo y observa que la consola ahora muestra **dos** líneas `Now listening on`: una `https://localhost:7066` (el puerto HTTPS) y otra `http://localhost:5125`. La primera vez, Visual Studio puede mostrarte un cuadro de diálogo preguntando si quieres **confiar en el certificado de desarrollo** de ASP.NET Core: responde **Yes** (es un certificado local, solo para tu máquina).

:::warning Con el perfil https, el HTTP se redirige
Con `https`, las peticiones a `http://...` reciben una redirección (`307 Temporary Redirect`) hacia `https://...`. Si tu archivo `.http` apunta a la dirección `http`, la respuesta puede no ser la que esperas o fallar por el certificado. Para el resto del tutorial, usa el perfil **`http`**, o bien cambia la variable `@Bookshelf.Api_HostAddress` a la URL `https` de tu proyecto.
:::

:::troubleshooting Errores comunes
- **No encuentro la plantilla *ASP.NET Core Web API*:** falta la carga de trabajo. Abre el **Visual Studio Installer**, pulsa **Modificar** en tu instalación y marca **ASP.NET y desarrollo web**.
- **`System.IO.IOException: Failed to bind to address http://127.0.0.1:5125: address already in use.`** Hay otra instancia de la API (o de otro programa) usando ese puerto. Cierra la ventana de consola anterior o detén la depuración con <kbd>Shift</kbd> + <kbd>F5</kbd> y vuelve a ejecutar.
- **El editor `.http` muestra un error de conexión o "connection refused":** la API no está en ejecución, o el puerto de `@Bookshelf.Api_HostAddress` no coincide con el de tu consola. Comprueba las dos cosas.
- **`warn: Microsoft.AspNetCore.HttpsPolicy.HttpsRedirectionMiddleware[3] Failed to determine the https port for redirect.`** Aparece con el perfil `http` en la primera petición. Es un aviso **inofensivo**: la API intenta redirigir a HTTPS pero no hay un puerto HTTPS configurado en ese perfil. Lo entenderás en el paso 6.
- **`warn: Microsoft.AspNetCore.Server.Kestrel.Core.KestrelServer[8] The ASP.NET Core developer certificate is not trusted.`** Solo con el perfil `https`. Ejecuta una vez `dotnet dev-certs https --trust` en la terminal y acepta el cuadro de diálogo de Windows.
- **Visual Studio dice que el proyecto tiene errores al ejecutar:** abre **View** > **Error List**. Si acabas de crear el proyecto y no has tocado nada, cierra la solución y vuelve a abrirla para que se restauren los paquetes NuGet.
:::

:::recap
- Una **solución** (`Bookshelf`) contiene uno o más **proyectos** (`Bookshelf.Api`).
- Creaste el proyecto con la plantilla *ASP.NET Core Web API*: .NET 10 LTS, sin autenticación, HTTPS, OpenAPI y **controllers** activados, y sin Docker ni Aspire.
- Ejecutaste la API con <kbd>Ctrl</kbd> + <kbd>F5</kbd> (sin depurar) o <kbd>F5</kbd> (con depurador) usando el perfil `http`. Kestrel escucha en un puerto aleatorio: usa el tuyo.
- Con el archivo **`.http`** enviaste una petición `GET` y viste la respuesta JSON; el documento OpenAPI está en `/openapi/v1.json`.
- Todo esto se puede reproducir con la CLI: `dotnet new`, `dotnet sln add`, `dotnet run`.

En el siguiente paso recorrerás los archivos que generó la plantilla para entender qué hace cada uno, y limpiarás el ejemplo del tiempo para dejar el proyecto listo para Bookshelf.
:::
