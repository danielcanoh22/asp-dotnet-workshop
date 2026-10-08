## Qué vas a construir

Vas a construir **Bookshelf API**: una API REST para gestionar tu biblioteca personal de libros. Podrás listar libros, filtrarlos por género o por estado de lectura, consultar uno concreto, crear libros nuevos, modificarlos, borrarlos y marcarlos como leídos con una valoración del 1 al 5.

Los datos se guardan en un archivo `books.json`, de modo que sobreviven cuando reinicias la aplicación. No habrá interfaz gráfica: la API se prueba con peticiones HTTP desde Visual Studio (archivos `.http`) y con una página de documentación interactiva que construiremos al final.

El objetivo del tutorial no es solo que la API funcione, sino que entiendas **por qué** cada pieza existe: qué problema resuelve el pipeline de middleware, para qué sirve la inyección de dependencias, por qué separamos controller, servicio y repositorio, y por qué validamos con `ProblemDetails`. Cada concepto se explica **antes** de usarlo.

:::tip Un proyecto, de principio a fin
Construirás un único proyecto que crece paso a paso. Al final de cada paso tendrás código que compila y se puede ejecutar; nunca te quedarás con la aplicación rota durante varios pasos seguidos.
:::

## Qué aprenderás

- Qué son .NET, ASP.NET Core y Kestrel, y cómo encajan C#, el SDK y el runtime.
- Cómo crear, ejecutar y recorrer un proyecto Web API en **Visual Studio 2026**.
- Los fundamentos de HTTP y cómo diseñar una API REST orientada a recursos.
- El **host** de ASP.NET Core: `WebApplication.CreateBuilder`, `Build()` y `Run()`.
- El **pipeline de middleware**: orden, `next`, cortocircuito y cómo escribir el tuyo.
- **Controllers**, enrutamiento por atributos y resultados de acción (`Ok`, `NotFound`, `ActionResult<T>`).
- **Inyección de dependencias** y sus tiempos de vida (singleton, scoped, transient).
- Separación en capas: Controller, Service y Repository.
- Persistencia en un archivo JSON con acceso concurrente seguro.
- Configuración tipada con el **Options pattern**.
- **Model binding**, DTOs, validación con atributos y respuestas `ProblemDetails`.
- Manejo global de errores y **logging** estructurado.
- Documentación de la API con **OpenAPI** y Scalar.

## Qué NO verás todavía

Para que el foco esté en los fundamentos, este tutorial deja fuera deliberadamente:

- **Bases de datos** y Entity Framework Core (usamos un archivo JSON).
- **Autenticación y autorización** (JWT, Identity). Verás `UseAuthorization()` en el pipeline, pero no lo configuraremos.
- **Pruebas automatizadas** (unit tests, tests de integración).
- **Minimal APIs** como estilo principal: aquí usamos controllers; las Minimal APIs se tratan en el siguiente tutorial.
- Despliegue, Docker y CI/CD.

## Requisitos previos

Necesitas conocer los fundamentos de C# (clases, propiedades, LINQ básico, `async`/`await` a nivel de lectura). **No** necesitas experiencia previa con .NET para la web, ASP.NET Core ni Visual Studio.

| Requisito | Detalle |
| --- | --- |
| Visual Studio 2026 | Cualquier edición (Community es gratuita) con la carga de trabajo **ASP.NET y desarrollo web** (*ASP.NET and web development*). |
| SDK de .NET 10 | Se instala junto con la carga de trabajo anterior. .NET 10 es una versión **LTS** (soporte a largo plazo). |
| Sistema operativo | Windows. Las instrucciones de Visual Studio están pensadas para Windows. |

:::vs Comprueba tu instalación
1. Abre una terminal: **Windows Terminal**, **PowerShell** o, dentro de Visual Studio, el menú **View** > **Terminal** (más adelante verás cómo).
2. Ejecuta:

```powershell
dotnet --list-sdks
```

3. Deberías ver al menos una línea que empiece por `10.`, por ejemplo:

```
10.0.401 [C:\Program Files\dotnet\sdk]
```

Tu número de versión puede diferir (`10.0.1xx`, `10.0.2xx`…); lo importante es que el primer número sea **10**. Si no aparece, abre el **Visual Studio Installer**, pulsa **Modificar** en tu Visual Studio 2026 y marca la carga de trabajo **ASP.NET y desarrollo web**.
:::

## Los endpoints finales

Esta es la API completa que tendrás al terminar. La diseñaremos con calma en el paso 4; por ahora, léela como un mapa del destino.

| Método | Ruta | Qué hace | Respuestas |
| --- | --- | --- | --- |
| `GET` | `/api/books?genre=&isRead=` | Lista los libros, con filtros opcionales | `200` |
| `GET` | `/api/books/{id}` | Obtiene un libro por su identificador | `200`, `404` |
| `POST` | `/api/books` | Crea un libro nuevo | `201`, `400` |
| `PUT` | `/api/books/{id}` | Reemplaza los datos de un libro | `204`, `400`, `404` |
| `DELETE` | `/api/books/{id}` | Elimina un libro | `204`, `404` |
| `PATCH` | `/api/books/{id}/read` | Marca un libro como leído, con valoración | `200`, `400`, `404` |

## Estructura final de carpetas

Cada carpeta tiene una responsabilidad clara. No las crearás todas hoy: aparecerán conforme las necesites.

```
Bookshelf/
├── Bookshelf.slnx
└── Bookshelf.Api/
    ├── Controllers/
    │   └── BooksController.cs
    ├── Data/
    │   └── books.json
    ├── Dtos/
    │   ├── BookResponse.cs
    │   ├── CreateBookRequest.cs
    │   ├── MarkAsReadRequest.cs
    │   └── UpdateBookRequest.cs
    ├── Errors/
    │   └── GlobalExceptionHandler.cs
    ├── Mappings/
    │   └── BookMappings.cs
    ├── Middleware/
    │   └── RequestTimingMiddleware.cs
    ├── Models/
    │   └── Book.cs
    ├── Options/
    │   └── BookStorageOptions.cs
    ├── Repositories/
    │   ├── IBookRepository.cs
    │   └── JsonBookRepository.cs
    ├── Services/
    │   ├── IBookService.cs
    │   └── BookService.cs
    ├── Properties/
    │   └── launchSettings.json
    ├── appsettings.json
    ├── appsettings.Development.json
    ├── Bookshelf.Api.csproj
    ├── Bookshelf.Api.http
    └── Program.cs
```

## La arquitectura en una línea

```
Cliente HTTP ──▶ Controller ──▶ Service ──▶ Repository ──▶ books.json
                 (HTTP)         (reglas)    (datos)        (archivo)
```

| Capa | Responsabilidad | Por qué está separada |
| --- | --- | --- |
| **Controller** | Traducir HTTP a llamadas de código y devolver el código de estado correcto. | Si mañana cambia el protocolo o el formato de respuesta, solo toca esta capa. |
| **Service** | Aplicar las reglas de negocio (por ejemplo, filtrar, validar un estado). | La lógica queda fuera de HTTP y se puede entender y probar sola. |
| **Repository** | Leer y escribir los datos. | Si mañana cambias el archivo JSON por una base de datos, solo cambia esta capa. |

## Cómo usar este taller

Esta aplicación es una **guía**: nada se ejecuta en el navegador. Tú construyes el proyecto en tu máquina, en Visual Studio, y consultas aquí qué hacer y por qué. Te recomendamos tener las dos ventanas abiertas, una al lado de la otra.

Cada paso sigue el mismo orden: primero se explica el concepto, después se dan las instrucciones exactas, luego el código con su explicación línea a línea, y por último una comprobación para confirmar que todo funciona. Los bloques de colores tienen un significado fijo (cada uno lleva su propio icono):

| Bloque | Qué encontrarás |
| --- | --- |
| **Concepto** | Qué es algo, qué problema resuelve y un ejemplo pequeño. |
| **¿Por qué?** | La razón de una decisión de diseño. |
| **En Visual Studio** | Los clics, menús y atajos exactos del IDE. |
| **Tip** | Atajos y buenas prácticas opcionales. |
| **Atención** | Algo que puede darte problemas si lo pasas por alto. |
| **Checkpoint** | Cómo verificar que el paso funciona y qué resultado esperar. |
| **Errores comunes** | Mensajes de error reales y cómo resolverlos. |
| **Reto** | Un ejercicio para practicar algo que ya has visto, con pistas numeradas y una solución desplegable. |
| **Resumen** | Lo esencial del paso y qué viene a continuación. |

:::tip Cómo trabajar los retos
Los retos aparecen cuando ya has practicado el patrón que necesitas. Intenta resolverlos **por tu cuenta** primero. Si te atascas, abre las **pistas** de una en una (van de lo vago a lo concreto). Solo cuando hayas probado tu solución, o si sigues bloqueado, abre **Ver solución** y compárala con la tuya. Equivocarte y depurar es parte del aprendizaje.
:::

Cuando termines un paso, márcalo como completado con el botón del lector. Tu progreso se guarda en este navegador.

## Tiempo estimado

Entre 6 y 7 horas en total. Recomendamos dividirlo en sesiones de 1 a 2 horas; cada paso es un buen punto para parar, porque al final de cada uno el proyecto compila.

## Pasos del tutorial

| # | Paso | Qué haces |
| --- | --- | --- |
| 1 | ¿Qué es .NET y ASP.NET Core? | Entiendes la plataforma y verificas tu instalación. |
| 2 | Crear el proyecto en Visual Studio 2026 | Creas la solución y ejecutas la API por primera vez. |
| 3 | Recorrido por el proyecto | Entiendes cada archivo generado y limpias el ejemplo. |
| 4 | HTTP en 10 minutos | Aprendes HTTP y diseñas los endpoints. |
| 5 | El host: de CreateBuilder a app.Run() | Entiendes cómo arranca una aplicación ASP.NET Core. |
| 6 | Middleware y el pipeline HTTP | Escribes tu primer middleware. |
| 7 | Tu primer modelo y controller | Devuelves libros desde un controller. |
| 8 | Inyección de dependencias | Introduces un servicio y el contenedor de DI. |
| 9 | Persistencia en un archivo JSON | Creas el repositorio que lee y escribe `books.json`. |
| 10 | Configuración y Options pattern | Externalizas la ruta del archivo a la configuración. |
| 11 | Model binding, DTOs y crear libros | Implementas `POST` con DTOs. |
| 12 | Validación y ProblemDetails | Rechazas datos inválidos con errores estándar. |
| 13 | Completa el CRUD (retos) | Implementas `PUT`, `DELETE` y `PATCH` por tu cuenta. |
| 14 | Manejo global de errores y logging | Centralizas el tratamiento de excepciones. |
| 15 | Documentación con OpenAPI + Scalar y cierre | Documentas la API y repasas lo aprendido. |
