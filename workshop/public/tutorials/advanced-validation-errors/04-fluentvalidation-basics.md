## Objetivo del paso

En el paso anterior viste que las DataAnnotations se quedan cortas cuando una regla necesita servicios, código asíncrono o el reloj. En este paso das el primer paso con **FluentValidation** sobre el recurso más sencillo, los proyectos. Vas a:

1. Entender cómo se escribe un validador: `AbstractValidator<T>`, `RuleFor` y los validadores incorporados.
2. Saber por qué **no** usaremos el paquete `FluentValidation.AspNetCore`.
3. Instalar FluentValidation desde NuGet.
4. Sustituir las DataAnnotations de los contratos de proyectos por dos validadores.
5. Validar **a mano** dentro del handler `Create` con `ValidateAsync` y `TypedResults.ValidationProblem`.
6. Resolver una sorpresa: los mensajes de error salen en el idioma de tu Windows.

## Qué es FluentValidation

:::concept Un validador por contrato
En FluentValidation, las reglas de un tipo viven en una clase aparte, el **validador**, que hereda de `AbstractValidator<T>`. Las reglas se declaran en su constructor con `RuleFor`:

```csharp
public class CreateProjectRequestValidator : AbstractValidator<CreateProjectRequest>
{
    public CreateProjectRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
    }
}
```

- **`RuleFor(x => x.Name)`** elige la propiedad. Esa lambda también le da el **nombre** al error: `Name`.
- **`.NotEmpty().MaximumLength(100)`** encadena **validadores** sobre esa propiedad. Se leen casi como una frase: "el nombre no puede estar vacío y tiene como máximo 100 caracteres".
- Para validar, llamas a `Validate(objeto)` o a `ValidateAsync(objeto)`. Devuelven un **`ValidationResult`** con `IsValid` (¿pasó todo?) y `Errors` (la lista de fallos, cada uno con su propiedad y su mensaje).

El contrato (`CreateProjectRequest`) vuelve a ser un `record` con datos y nada más.
:::

Los validadores incorporados que usarás en este tutorial:

| Validador | Falla cuando... | Mensaje por defecto (en inglés) |
| --- | --- | --- |
| `NotEmpty()` | El valor es `null`, una cadena vacía, solo espacios, o el valor por defecto del tipo. | `'Name' must not be empty.` |
| `MaximumLength(n)` | El texto tiene más de `n` caracteres. Un `null` **pasa**: para eso está `NotEmpty`. | `The length of 'Name' must be 100 characters or fewer. You entered 150 characters.` |
| `Matches(patrón)` | El texto no cumple la expresión regular. | `'Name' is not in the correct format.` |
| `GreaterThan(n)` | El valor no es mayor que `n`. | `'Tag Id' must be greater than '0'.` |
| `Must(condición)` | Tu propia condición devuelve `false`. | `The specified condition was not met for 'Due Date'.` |

Cualquier mensaje se puede sustituir con **`.WithMessage("...")`** justo después del validador al que afecta. Fíjate en los nombres entre comillas simples: FluentValidation separa las palabras de los nombres en *PascalCase* para mostrarlos (`TagId` → `'Tag Id'`). La **clave** del error en la respuesta sigue siendo el nombre de la propiedad (`TagId`), igual que con DataAnnotations.

:::warning No uses FluentValidation.AspNetCore
En tutoriales antiguos verás el paquete `FluentValidation.AspNetCore` y su método `AddFluentValidationAutoValidation()`, que validaba "solo", sin escribir nada en los handlers. **Sus propios autores ya no lo recomiendan para proyectos nuevos**, por tres razones que explican en su documentación:

- Se engancha a la validación de **MVC**, así que no funciona con **Minimal APIs** (ni con Blazor).
- Esa validación de ASP.NET Core **no es asíncrona**: un validador con reglas asíncronas lanza una excepción.
- Es "magia" difícil de depurar: no ves en ningún sitio cuándo ni dónde se valida.

Usarás los dos paquetes que siguen mantenidos: **`FluentValidation`** (la biblioteca) y **`FluentValidation.DependencyInjectionExtensions`** (para registrar los validadores en el contenedor de DI, que aprovecharás en el paso 5). La validación la invocarás tú: primero a mano en este paso y, en el siguiente, con un filtro.
:::

## Instala FluentValidation

:::vs Instalar los paquetes NuGet
1. Detén la API si está en ejecución.
2. En Solution Explorer, haz clic derecho sobre el proyecto `TaskTracker.Api` > **Manage NuGet Packages…**
3. Abre la pestaña **Browse** y comprueba que **Include prerelease** está **desmarcada**.
4. Busca `FluentValidation`, selecciona el paquete **FluentValidation** (el autor es *Jeremy Skinner*), elige la versión **12.1.1** en el desplegable **Version** y pulsa **Install**. Acepta el diálogo de cambios.
5. Repite con **FluentValidation.DependencyInjectionExtensions**, también en la versión **12.1.1**.
:::

Con la CLI: `dotnet add package FluentValidation --version 12.1.1` y `dotnet add package FluentValidation.DependencyInjectionExtensions --version 12.1.1`.

Tu `TaskTracker.Api.csproj` tiene ahora dos líneas nuevas:

```xml title="TaskTracker.Api.csproj (fragmento)"
<PackageReference Include="FluentValidation" Version="12.1.1" />
<PackageReference Include="FluentValidation.DependencyInjectionExtensions" Version="12.1.1" />
```

:::tip ¿Una biblioteca para .NET 8 en un proyecto .NET 10?
FluentValidation 12 se publica para `net8.0`. Un paquete compilado para una versión anterior de .NET funciona en las versiones posteriores, así que lo puedes usar sin problemas en .NET 10. No necesitas buscar una versión "para .NET 10".
:::

## Contratos de proyectos sin atributos

FluentValidation será la única fuente de reglas para los proyectos. Si dejaras también los atributos, las mismas reglas vivirían en dos sitios y `AddValidation()` rechazaría las peticiones antes de que tu validador llegara a verlas.

:::vs Editar Contracts/ProjectContracts.cs
Abre `Contracts/ProjectContracts.cs` y reemplaza todo su contenido por el siguiente. Desaparecen los atributos y el `using` de DataAnnotations.
:::

```csharp title="Contracts/ProjectContracts.cs"
namespace TaskTracker.Api.Contracts;

public record CreateProjectRequest(string Name, string? Description = null);

public record UpdateProjectRequest(string Name, string? Description);

public record ProjectResponse(
    int Id,
    string Name,
    string? Description,
    DateTime CreatedAt,
    int TaskCount,
    int CompletedTaskCount);
```

Las tareas y las etiquetas conservan, de momento, sus DataAnnotations. Las migrarás en el paso 5.

## Tus primeros validadores

Los validadores tendrán su propia carpeta, `Validation`, con un archivo por recurso.

:::vs Crear Validation/ProjectValidators.cs
1. Clic derecho sobre el proyecto `TaskTracker.Api` > **Add** > **New Folder** y llámala **`Validation`**.
2. Clic derecho sobre la carpeta `Validation` > **Add** > **New Item…**. Busca la plantilla **Code File** (un archivo `.cs` vacío) y nómbralo **`ProjectValidators.cs`**.
3. Pega el siguiente contenido.
:::

```csharp title="Validation/ProjectValidators.cs"
using FluentValidation;
using TaskTracker.Api.Contracts;

namespace TaskTracker.Api.Validation;

public class CreateProjectRequestValidator : AbstractValidator<CreateProjectRequest>
{
    public CreateProjectRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Description).MaximumLength(500);
    }
}

public class UpdateProjectRequestValidator : AbstractValidator<UpdateProjectRequest>
{
    public UpdateProjectRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Description).MaximumLength(500);
    }
}
```

Son las mismas reglas que tenían los atributos, con los mismos límites que los `HasMaxLength` de la configuración del modelo:

| Atributo (tutorial 2) | Regla de FluentValidation |
| --- | --- |
| `[Required, StringLength(100)] string Name` | `RuleFor(x => x.Name).NotEmpty().MaximumLength(100)` |
| `[StringLength(500)] string? Description` | `RuleFor(x => x.Description).MaximumLength(500)`. Como `MaximumLength` deja pasar `null`, la descripción sigue siendo opcional. |

:::why ¿Dos validadores casi iguales?
`CreateProjectRequest` y `UpdateProjectRequest` tienen hoy las mismas reglas, pero son contratos distintos y pueden evolucionar por separado (en el paso 11 verás que la actualización de tareas necesita una regla que la creación no tiene). Un validador por contrato mantiene esa libertad. En el paso 6 eliminarás la repetición de `NotEmpty().MaximumLength(...)` con una extensión reutilizable.
:::

## Registra los validadores

El handler recibirá el validador como cualquier otro servicio, así que hay que registrarlo en el contenedor de DI. FluentValidation define la interfaz **`IValidator<T>`**, que implementa `AbstractValidator<T>`: el handler pedirá la interfaz y el contenedor le dará tu clase.

Abre `Program.cs`. Añade tres `using` al principio y dos registros en la sección de servicios, justo debajo de `AddValidation()`:

```csharp title="Program.cs (usings y sección Services)"
using System.Text.Json.Serialization;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Scalar.AspNetCore;
using TaskTracker.Api.Contracts;
using TaskTracker.Api.Data;
using TaskTracker.Api.Endpoints;
using TaskTracker.Api.Validation;

var builder = WebApplication.CreateBuilder(args);

// --- Services ---
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
builder.Services.AddValidation();

// One line per validator, for now. Step 5 registers them all at once.
builder.Services.AddScoped<IValidator<CreateProjectRequest>, CreateProjectRequestValidator>();
builder.Services.AddScoped<IValidator<UpdateProjectRequest>, UpdateProjectRequestValidator>();
```

`AddValidation()` se queda por ahora: sigue validando las DataAnnotations de tareas y etiquetas.

## Validación manual en el handler

Ahora el handler `Create` de proyectos pide el validador, lo ejecuta y, si algo falla, responde `400` sin tocar la base de datos.

:::vs Editar Endpoints/ProjectEndpoints.cs
1. Abre `Endpoints/ProjectEndpoints.cs` y añade `using FluentValidation;` como primera línea del archivo.
2. Reemplaza el método `Create` completo por el siguiente.
:::

```csharp title="Endpoints/ProjectEndpoints.cs (método Create)"
private static async Task<Results<CreatedAtRoute<ProjectResponse>, ValidationProblem>> Create(
    CreateProjectRequest request,
    IValidator<CreateProjectRequest> validator,
    TaskTrackerDbContext db,
    CancellationToken cancellationToken)
{
    var validation = await validator.ValidateAsync(request, cancellationToken);
    if (!validation.IsValid)
    {
        return TypedResults.ValidationProblem(validation.ToDictionary());
    }

    var project = new Project
    {
        Name = request.Name,
        Description = request.Description,
        CreatedAt = DateTime.UtcNow,
    };

    db.Projects.Add(project);
    await db.SaveChangesAsync(cancellationToken);

    return TypedResults.CreatedAtRoute(project.ToResponse(), GetProjectByIdRoute, new { id = project.Id });
}
```

Qué ha cambiado:

| Pieza | Para qué sirve |
| --- | --- |
| `IValidator<CreateProjectRequest> validator` | Minimal APIs ve que el tipo está registrado en el contenedor y lo inyecta, igual que el `DbContext`. |
| `ValidateAsync(request, cancellationToken)` | Ejecuta todas las reglas. Usamos la versión asíncrona aunque hoy no haya reglas asíncronas: si mañana las hay, el handler no cambia. |
| `validation.ToDictionary()` | Convierte los errores en un `IDictionary<string, string[]>`: propiedad → mensajes. Es justo lo que espera `ValidationProblem`. |
| `TypedResults.ValidationProblem(...)` | Construye el mismo `400` con `ValidationProblemDetails` que generaba `AddValidation()`: `type`, `title`, `status`, `errors` y `traceId`. |
| `Results<CreatedAtRoute<ProjectResponse>, ValidationProblem>` | El handler ahora tiene dos resultados posibles, y el tipo de retorno lo dice. |

El cliente no nota la diferencia: el formato del error es el mismo que antes. Lo que cambia es **quién** decide las reglas.

Compila y ejecuta la API. Envía la primera petición de `errors.http` (`POST /api/projects` con `"name": ""`).

## Una sorpresa: los mensajes en español

Si tu Windows está en español, la respuesta probablemente sea esta:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "errors": {
    "Name": ["'Name' no debería estar vacío."]
  },
  "traceId": "00-89293136f0535631b190e55cfc2ef10f-05f4f58d6dbd019d-00"
}
```

Y con un nombre de 150 caracteres: `'Name' debe ser menor o igual que 100 caracteres. Ingresó 150 caracteres.`

:::concept Los mensajes siguen la cultura del proceso
FluentValidation trae sus mensajes traducidos a muchos idiomas y, por defecto, elige el idioma según la **cultura de interfaz** (*UI culture*) del proceso, que en una aplicación de consola o en un servidor es la del sistema operativo. Por eso la misma API responde en español en tu equipo y en inglés en un servidor configurado en inglés.

Para una API eso es un problema: la respuesta depende de **dónde** se ejecuta, el `title` sale en inglés y los `errors` en español, y un cliente que muestre o registre esos textos se encuentra con una mezcla. Fijaremos un idioma para todos los entornos con `ValidatorOptions.Global.LanguageManager.Culture`: la **cultura invariante** (`CultureInfo.InvariantCulture`), que corresponde a los mensajes originales en inglés.
:::

Añade un `using` al principio de `Program.cs` y una línea en la sección de servicios, debajo de los dos registros:

```csharp title="Program.cs (usings y sección Services)"
using System.Globalization;
using System.Text.Json.Serialization;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Scalar.AspNetCore;
using TaskTracker.Api.Contracts;
using TaskTracker.Api.Data;
using TaskTracker.Api.Endpoints;
using TaskTracker.Api.Validation;

var builder = WebApplication.CreateBuilder(args);

// --- Services ---
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
builder.Services.AddValidation();

// One line per validator, for now. Step 5 registers them all at once.
builder.Services.AddScoped<IValidator<CreateProjectRequest>, CreateProjectRequestValidator>();
builder.Services.AddScoped<IValidator<UpdateProjectRequest>, UpdateProjectRequestValidator>();

// FluentValidation translates its messages to the machine's culture. An API answers the same everywhere.
ValidatorOptions.Global.LanguageManager.Culture = CultureInfo.InvariantCulture;
```

`ValidatorOptions.Global` es configuración **estática** de FluentValidation, no un servicio: por eso se asigna directamente y no con `builder.Services`. Basta con hacerlo una vez, al arrancar.

:::tip ¿Y si quiero mensajes en español?
Puedes fijar cualquier cultura, por ejemplo `new CultureInfo("es")`, o escribir tus propios mensajes con `.WithMessage(...)`. Lo importante es que la decisión sea **tuya** y no dependa de la máquina. En este taller, los mensajes de la API están en inglés, igual que el resto del código.
:::

:::checkpoint Proyectos validados con FluentValidation
Compila (sin errores ni advertencias), reinicia la API y envía:

| Petición | Resultado esperado |
| --- | --- |
| `POST /api/projects` con `{ "name": "" }` | `400`, `errors` → `Name: ["'Name' must not be empty."]` |
| `POST /api/projects` con un `name` de 150 caracteres | `400`, `errors` → `Name: ["The length of 'Name' must be 100 characters or fewer. You entered 150 characters."]` |
| `POST /api/projects` con `{}` | `400`, el mismo error que con el nombre vacío. Sin `name`, el valor llega como `null` y `NotEmpty` lo rechaza. |
| `POST /api/projects` con `{ "name": "FluentValidation works" }` | `201`: los datos correctos siguen funcionando. |
| `POST /api/projects/1/tasks` con `{ "title": "Born overdue", "dueDate": "2020-01-01" }` | `400` con el error de `DueDate`: las tareas siguen validándose con DataAnnotations e `IValidatableObject`. |
| `PUT /api/projects/1` con `{ "name": "", "description": null }` | **`204`**. El nombre vacío se guarda. |

La última fila es un agujero: al quitar los atributos de `UpdateProjectRequest`, el `PUT` se quedó sin validación, porque solo `Create` llama a su validador. Lo arreglarás en el reto.
:::

::::challenge Valida también el PUT de proyectos
Aplica la misma validación manual al handler `Update` de `ProjectEndpoints.cs`, con el `UpdateProjectRequestValidator` que ya registraste.

| Petición | Resultado esperado |
| --- | --- |
| `PUT /api/projects/1` con `{ "name": "", "description": null }` | `400`, `errors` → `Name: ["'Name' must not be empty."]` |
| `PUT /api/projects/999` con `{ "name": "", "description": null }` | `400`, no `404`: la validación va **antes** de buscar el proyecto, igual que hacía `AddValidation()`. |
| `PUT /api/projects/999` con `{ "name": "Valid", "description": null }` | `404` |

:::hint
Son los mismos tres cambios que en `Create`: un parámetro `IValidator<UpdateProjectRequest>`, las líneas de `ValidateAsync` al principio del método y `ValidationProblem` como resultado posible en el tipo de retorno.
:::

:::hint
El tipo de retorno de `Update` ya era un `Results<NoContent, NotFound>`. Solo tienes que añadir un tercer tipo a la lista.
:::

:::solution
```csharp title="Endpoints/ProjectEndpoints.cs (método Update)"
private static async Task<Results<NoContent, NotFound, ValidationProblem>> Update(
    int id,
    UpdateProjectRequest request,
    IValidator<UpdateProjectRequest> validator,
    TaskTrackerDbContext db,
    CancellationToken cancellationToken)
{
    var validation = await validator.ValidateAsync(request, cancellationToken);
    if (!validation.IsValid)
    {
        return TypedResults.ValidationProblem(validation.ToDictionary());
    }

    var project = await db.Projects.FindAsync([id], cancellationToken);
    if (project is null)
    {
        return TypedResults.NotFound();
    }

    // The entity is tracked: SaveChanges detects what changed and sends an UPDATE.
    project.Name = request.Name;
    project.Description = request.Description;
    await db.SaveChangesAsync(cancellationToken);

    return TypedResults.NoContent();
}
```
:::
::::

Mira los dos handlers: el mismo bloque de cinco líneas, copiado. Y faltan las tareas, las etiquetas... En el siguiente paso eliminarás esa repetición.

:::troubleshooting Errores comunes
- **Todas las peticiones responden `500` con `Failure to infer one or more parameters.` y una tabla donde `validator` aparece como `UNKNOWN`:** el validador no está registrado en el contenedor. Revisa las líneas `AddScoped<IValidator<...>, ...>()` de `Program.cs`. Minimal APIs comprueba los parámetros de todos los handlers con la primera petición, por eso fallan **todas**, no solo la de proyectos.
- **`CS0246: The type or namespace name 'AbstractValidator<>' could not be found` / `'IValidator<>' could not be found`:** falta `using FluentValidation;`, o el paquete no se instaló. Comprueba que `TaskTracker.Api.csproj` tiene la línea de `FluentValidation`.
- **`CS0246: The type or namespace name 'CreateProjectRequestValidator' could not be found` en `Program.cs`:** falta `using TaskTracker.Api.Validation;`.
- **Los mensajes siguen en español:** falta la línea de `LanguageManager.Culture`, o la API no se reinició tras compilar.
- **El nombre vacío se acepta en el `POST`:** el handler `Create` no llama al validador, o el `return` del `ValidationProblem` está fuera del `if`.
- **Instalaste una versión distinta de 12.1.1:** el código de este tutorial está verificado con 12.1.1. Otra versión 12.x debería funcionar, pero los mensajes podrían variar ligeramente. Para cambiarla, en **Manage NuGet Packages…** > **Installed**, elige el paquete y selecciona la versión en el desplegable.
:::

:::recap
- Un validador de FluentValidation hereda de **`AbstractValidator<T>`** y declara sus reglas en el constructor con **`RuleFor(x => x.Propiedad)`** y validadores encadenados (`NotEmpty`, `MaximumLength`...).
- **`FluentValidation.AspNetCore`** (validación automática) está en desuso: solo funciona con MVC y no admite reglas asíncronas. Usamos `FluentValidation` y `FluentValidation.DependencyInjectionExtensions` 12.1.1.
- Los contratos de proyectos ya no tienen atributos: una sola fuente de reglas.
- Validación manual: inyectar **`IValidator<T>`**, llamar a **`ValidateAsync`** y, si falla, devolver **`TypedResults.ValidationProblem(result.ToDictionary())`**. El cliente recibe el mismo `400` de siempre.
- Los mensajes siguen la cultura del sistema. **`ValidatorOptions.Global.LanguageManager.Culture = CultureInfo.InvariantCulture`** hace que la API responda igual en todas partes.

En el siguiente paso sacarás la validación de los handlers con un **endpoint filter** genérico y migrarás también tareas y etiquetas.
:::
