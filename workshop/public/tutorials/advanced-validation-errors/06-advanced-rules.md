## Objetivo del paso

Toda la validación vive ya en FluentValidation, pero quedan tres cuentas pendientes: `NotEmpty().MaximumLength(...)` repetido en cinco reglas, una etiqueta vacía que produce dos errores y la regla de la fecha que perdiste en el paso 5. En este paso las saldas todas. Vas a:

1. Escribir una **extensión de reglas** reutilizable, `RequiredText`, y entender por qué extiende `IRuleBuilderInitial`.
2. Usar **`Cascade(CascadeMode.Stop)`** para que un valor vacío produzca un solo error.
3. Registrar el reloj como servicio con **`TimeProvider`** e inyectarlo en un validador.
4. Recuperar la regla de la fecha con **`Must`** y **`When`**.
5. Decidir dónde van las comprobaciones contra la **base de datos**: en el validador o en el handler.
6. Preparar `TaskTracker.Api.http` para que siga funcionando dentro de unos años.

## Una regla compartida: RequiredText

Mira las reglas de texto obligatorio de tus validadores:

```csharp
RuleFor(x => x.Name).NotEmpty().MaximumLength(100);   // projects (x2)
RuleFor(x => x.Title).NotEmpty().MaximumLength(200);  // tasks (x2)
RuleFor(x => x.Name).NotEmpty().MaximumLength(50)...  // tags
```

Es la misma idea cinco veces: "texto obligatorio con un máximo". Si mañana decides que un texto obligatorio tampoco puede tener solo espacios al principio, tendrías que cambiar cinco sitios. FluentValidation permite crear tus propios "validadores" como **métodos de extensión** sobre su constructor de reglas.

:::concept Los tipos detrás de RuleFor
Cuando escribes `RuleFor(x => x.Name).NotEmpty().MaximumLength(100)`, cada llamada devuelve un tipo distinto:

| Llamada | Devuelve | Qué puedes encadenar después |
| --- | --- | --- |
| `RuleFor(x => x.Name)` | `IRuleBuilderInitial<T, string>` | Validadores (`NotEmpty`...) **y** opciones de la regla completa, como **`Cascade`**. |
| `.NotEmpty()` | `IRuleBuilderOptions<T, string>` | Más validadores, y opciones del validador anterior (`WithMessage`, `When`...). |

`Cascade` configura **toda la regla**, así que solo existe en `IRuleBuilderInitial`: el punto justo después de `RuleFor`, antes del primer validador. Por eso tu extensión, que empieza con `Cascade`, tiene que extender ese tipo.
:::

:::concept CascadeMode
Por defecto, FluentValidation ejecuta **todos** los validadores de una regla aunque falle el primero (`CascadeMode.Continue`). Es lo que viste con la etiqueta vacía: `NotEmpty` falló, y `Matches` también se ejecutó y falló.

Con **`.Cascade(CascadeMode.Stop)`**, la regla se detiene en el **primer** validador que falla. Afecta solo a esa regla: las demás reglas del validador se siguen ejecutando, así que el cliente sigue viendo todos los campos con problemas en una sola respuesta.
:::

:::vs Crear Validation/RuleBuilderExtensions.cs
En la carpeta `Validation`, **Add** > **New Item…** > **Code File**, nómbralo **`RuleBuilderExtensions.cs`** y pega el siguiente contenido.
:::

```csharp title="Validation/RuleBuilderExtensions.cs"
using FluentValidation;

namespace TaskTracker.Api.Validation;

// Rules shared by several validators, written once.
public static class RuleBuilderExtensions
{
    public static IRuleBuilderOptions<T, string> RequiredText<T>(this IRuleBuilderInitial<T, string> rule, int maxLength) =>
        rule
            .Cascade(CascadeMode.Stop) // An empty value reports one error, not two.
            .NotEmpty()
            .MaximumLength(maxLength);
}
```

- **`this IRuleBuilderInitial<T, string> rule`**: se puede llamar justo después de `RuleFor` sobre cualquier propiedad `string`, de cualquier validador (`T`).
- **`.Cascade(CascadeMode.Stop)`**: si `NotEmpty` falla, no se ejecuta nada más de esta regla, **incluidos** los validadores que encadenes después de `RequiredText` (como el `Matches` de las etiquetas).
- **Devuelve `IRuleBuilderOptions<T, string>`**: lo mismo que devuelve `MaximumLength`, así que puedes seguir encadenando validadores y opciones.

Ahora úsala en los tres archivos de validadores.

:::vs Reemplazar Validation/ProjectValidators.cs
Abre `Validation/ProjectValidators.cs` y reemplaza todo su contenido por el siguiente.
:::

```csharp title="Validation/ProjectValidators.cs"
using FluentValidation;
using TaskTracker.Api.Contracts;

namespace TaskTracker.Api.Validation;

public class CreateProjectRequestValidator : AbstractValidator<CreateProjectRequest>
{
    public CreateProjectRequestValidator()
    {
        RuleFor(x => x.Name).RequiredText(100);
        RuleFor(x => x.Description).MaximumLength(500);
    }
}

public class UpdateProjectRequestValidator : AbstractValidator<UpdateProjectRequest>
{
    public UpdateProjectRequestValidator()
    {
        RuleFor(x => x.Name).RequiredText(100);
        RuleFor(x => x.Description).MaximumLength(500);
    }
}
```

:::vs Reemplazar Validation/TagValidators.cs
Abre `Validation/TagValidators.cs` y reemplaza todo su contenido por el siguiente.
:::

```csharp title="Validation/TagValidators.cs"
using FluentValidation;
using TaskTracker.Api.Contracts;

namespace TaskTracker.Api.Validation;

public class CreateTagRequestValidator : AbstractValidator<CreateTagRequest>
{
    public CreateTagRequestValidator()
    {
        RuleFor(x => x.Name)
            .RequiredText(50)
            .Matches("^[a-zA-Z0-9-]+$")
            .WithMessage("Use only letters, numbers and hyphens.");
    }
}
```

No necesitas ningún `using` nuevo: `RuleBuilderExtensions` está en el mismo espacio de nombres que los validadores, `TaskTracker.Api.Validation`. El de tareas lo cambiarás enseguida, junto con la regla de la fecha.

## El reloj como servicio: TimeProvider

En el paso 3 la regla de la fecha leía `DateTime.UtcNow` directamente, y eso la hacía imposible de probar con una fecha fija. La solución es tratar el reloj como cualquier otra dependencia: un **servicio** que se inyecta.

:::concept TimeProvider
**`TimeProvider`** es una clase abstracta de .NET (desde .NET 8) que representa "el reloj". Su método `GetUtcNow()` devuelve la hora actual como `DateTimeOffset`.

- **`TimeProvider.System`** es la implementación real: devuelve la hora del sistema. Es un objeto sin estado que se comparte, así que se registra como **singleton**.
- En una prueba, inyectas otro `TimeProvider` que devuelve la fecha que tú quieras. Microsoft publica uno listo para usar, `FakeTimeProvider`, en el paquete `Microsoft.Extensions.TimeProvider.Testing`. Lo usarás en el tutorial de testing.

El código que pide un `TimeProvider` no sabe (ni le importa) si la hora es real o fingida. Es la inversión de dependencias que conoces del tutorial 1, aplicada al tiempo.
:::

Regístralo en `Program.cs`, al final de la sección de servicios de validación:

```csharp title="Program.cs (sección Services)"
// --- Services ---
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();

// Registers every AbstractValidator<T> in this project as IValidator<T>.
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

// FluentValidation translates its messages to the machine's culture. An API answers the same everywhere.
ValidatorOptions.Global.LanguageManager.Culture = CultureInfo.InvariantCulture;

// The clock as a service: validators ask it for "now" instead of reading DateTime directly.
builder.Services.AddSingleton(TimeProvider.System);
```

`AddSingleton(TimeProvider.System)` registra esa instancia concreta para el tipo `TimeProvider`. Cualquier clase creada por el contenedor puede pedirla en su constructor.

## La regla de la fecha, otra vez

Un validador de FluentValidation **sí** lo crea el contenedor de DI (lo registraste con `AddValidatorsFromAssemblyContaining`), así que puede recibir el reloj por su constructor. Es justo lo que no podía hacer el `record` del paso 3.

:::concept Must y When
- **`Must(valor => condición)`** es el validador "a medida": recibe el valor de la propiedad y devuelve `true` si es válido. Su mensaje por defecto es genérico (`The specified condition was not met for 'Due Date'.`), así que casi siempre va seguido de `.WithMessage(...)`.
- **`When(objeto => condición)`** hace que el validador anterior solo se ejecute si se cumple la condición. Recibe el objeto completo, no solo la propiedad.
:::

:::vs Reemplazar Validation/TaskValidators.cs
Abre `Validation/TaskValidators.cs` y reemplaza todo su contenido por el siguiente.
:::

```csharp title="Validation/TaskValidators.cs"
using FluentValidation;
using TaskTracker.Api.Contracts;

namespace TaskTracker.Api.Validation;

public class CreateTaskRequestValidator : AbstractValidator<CreateTaskRequest>
{
    public CreateTaskRequestValidator(TimeProvider timeProvider)
    {
        RuleFor(x => x.Title).RequiredText(200);
        RuleFor(x => x.Description).MaximumLength(2000);

        // A new task cannot be born overdue. Only checked when a due date is sent.
        RuleFor(x => x.DueDate)
            .Must(dueDate => dueDate >= DateOnly.FromDateTime(timeProvider.GetUtcNow().UtcDateTime))
            .When(x => x.DueDate is not null)
            .WithMessage("The due date cannot be in the past.");
    }
}

public class UpdateTaskRequestValidator : AbstractValidator<UpdateTaskRequest>
{
    public UpdateTaskRequestValidator()
    {
        RuleFor(x => x.Title).RequiredText(200);
        RuleFor(x => x.Description).MaximumLength(2000);
    }
}
```

La regla, pieza a pieza:

| Pieza | Qué hace |
| --- | --- |
| `CreateTaskRequestValidator(TimeProvider timeProvider)` | El contenedor inyecta el reloj al crear el validador. |
| `timeProvider.GetUtcNow().UtcDateTime` | La hora actual en UTC, pedida al servicio. |
| `DateOnly.FromDateTime(...)` | Se queda con el día. Igual que en el paso 3, "hoy" es el día en UTC. |
| `dueDate >= ...` | Hoy o después: válido. |
| `.When(x => x.DueDate is not null)` | Sin fecha límite no hay nada que comprobar. |
| `.WithMessage(...)` | El mismo mensaje que en el paso 3: el cliente no nota el cambio de implementación. |

:::why ¿Por qué hace falta el When?
`DueDate` es un `DateOnly?`. Cuando vale `null`, la comparación `null >= hoy` de C# devuelve `false`, así que sin el `When` el `Must` fallaría y **una tarea sin fecha límite se rechazaría** con "The due date cannot be in the past.". El `When` hace explícita la intención: la regla solo habla de las tareas que traen fecha.
:::

Fíjate en una diferencia con el paso 3: el título y la fecha son **reglas distintas**, y FluentValidation las evalúa todas. Un título vacío con una fecha pasada devolverá ahora los dos errores en la misma respuesta.

## Una fecha que no caduque

`TaskTracker.Api.http` crea una tarea con `"dueDate": "2026-12-01"`. Con la regla activa, esa petición del camino feliz empezará a fallar con un `400` el día que esa fecha pase. Muévela lejos en el futuro:

:::vs Editar TaskTracker.Api.http
En `TaskTracker.Api.http`, busca la petición `POST {{TaskTracker.Api_HostAddress}}/api/projects/1/tasks` con el título *Write the release notes* y cambia su fecha límite a `2030-12-01`.
:::

```http title="TaskTracker.Api.http (petición POST de tareas)"
POST {{TaskTracker.Api_HostAddress}}/api/projects/1/tasks
Content-Type: application/json

{
  "title": "Write the release notes",
  "priority": "High",
  "dueDate": "2030-12-01"
}
```

La petición `PUT /api/tasks/1` del mismo archivo conserva su `"dueDate": "2026-11-15"`: la regla no se aplica al editar.

:::tip El reloj también afecta a tus archivos de prueba
Cualquier dato de prueba que dependa de la fecha actual caduca. Por eso `errors.http` usa `2020-01-01` para "el pasado" (siempre lo será) y el camino feliz usa `2030-12-01` para "el futuro". En las pruebas automatizadas, el problema desaparece del todo con un `FakeTimeProvider`.
:::

## ¿Y las comprobaciones contra la base de datos?

FluentValidation tiene versiones asíncronas de sus validadores (`MustAsync`), y un validador puede recibir el `DbContext` por su constructor igual que recibe el `TimeProvider`. Así que podrías escribir reglas como "el proyecto de la ruta existe" o "no hay otra etiqueta con este nombre" dentro del validador. Normalmente **no** conviene:

| Motivo | En Task Tracker |
| --- | --- |
| **El código de estado sería incorrecto.** Un validador responde `400`, "tu petición está mal formada". | Un proyecto que no existe es un `404`, y una etiqueta duplicada es un `409`. Ninguno de los dos es un error de forma. |
| **No elimina la carrera.** Entre la comprobación del validador y el `SaveChangesAsync` del handler, otra petición puede cambiar los datos. | Es el punto débil 4 de la auditoría. La garantía real es el índice único de la base de datos (paso 10). |
| **Consulta dos veces.** El handler necesita los datos de todas formas. | `Update` carga la tarea con `FindAsync`; comprobar antes en el validador que existe es repetir la consulta. |
| **El validador deja de ser fácil de probar.** | Con solo el reloj, se prueba con `new CreateTaskRequestValidator(fakeTimeProvider)`. Con un `DbContext`, necesitas una base de datos. |

Una regla práctica: **el validador comprueba la petición; el handler comprueba si se puede hacer con el estado actual**. "El nombre no está vacío" es de la petición. "Ya existe una etiqueta con ese nombre" depende de los datos, y es trabajo del handler y de la base de datos.

:::checkpoint Reglas avanzadas
Compila (sin errores ni advertencias), reinicia la API sobre una base de datos recién sembrada y comprueba (sustituye `<hoy>` por la fecha actual en UTC):

| Petición | Resultado esperado |
| --- | --- |
| `POST /api/tags` con `{ "name": "" }` | `400` con **un solo** error: `Name: ["'Name' must not be empty."]` |
| `POST /api/tags` con `{ "name": "not a valid tag!" }` | `400`, `Name: ["Use only letters, numbers and hyphens."]` |
| `POST /api/projects/1/tasks` con `{ "title": "", "dueDate": "2020-01-01" }` | `400` con **dos** campos: `Title: ["'Title' must not be empty."]` y `DueDate: ["The due date cannot be in the past."]` |
| `POST /api/projects/1/tasks` con `{ "title": "Due today", "dueDate": "<hoy>" }` | `201` |
| `POST /api/projects/1/tasks` con `{ "title": "No due date" }` | `201`, `"dueDate": null` |
| `PUT /api/tasks/1` con `{ "title": "Design the new home page", "priority": "High", "dueDate": "2020-01-01" }` | `204`: la regla solo se aplica al crear. |

Después:

1. Recrea la base de datos y ejecuta **en orden** todo `errors.http`. Los códigos deben ser: `400`, `400`, `400`, `400`, `400`, `404`, `204`, `409`. *Born overdue* vuelve a responder `400`.
2. Recrea la base de datos y ejecuta **en orden** todo `TaskTracker.Api.http`. Todas las peticiones responden como al final del tutorial 2; el `POST` de tareas devuelve `201` con `"dueDate": "2030-12-01"`.
:::

::::challenge Valida la asignación de etiquetas
`POST /api/tasks/{id}/tags` recibe un `AssignTagRequest` con un `tagId`, y hoy no tiene validador: un `tagId` de `0` o negativo llega al handler, que hace una consulta para descubrir que no existe y responde `404`. Pero un `id` menor que 1 no puede existir nunca: es una petición mal formada, y debería ser un `400` sin tocar la base de datos.

Escribe un `AssignTagRequestValidator` y aplícalo al endpoint.

| Petición | Resultado esperado |
| --- | --- |
| `POST /api/tasks/1/tags` con `{ "tagId": 0 }` | `400`, `TagId: ["'Tag Id' must be greater than '0'."]` |
| `POST /api/tasks/1/tags` con `{ "tagId": -3 }` | `400`, el mismo error. |
| `POST /api/tasks/1/tags` con `{}` | `400`: sin `tagId`, el `int` vale `0`. |
| `POST /api/tasks/1/tags` con `{ "tagId": 99 }` | `404`: el formato es correcto, pero la etiqueta no existe. Eso lo sigue decidiendo el handler. |
| `POST /api/tasks/1/tags` con `{ "tagId": 1 }` | `204` |

:::hint
El validador que necesitas es `GreaterThan(0)`. Ponlo en `TaskValidators.cs`, al final, porque `AssignTagRequest` está en `TaskContracts.cs`.
:::

:::hint
No hace falta registrar nada: `AddValidatorsFromAssemblyContaining` lo encontrará solo. Basta con que la clase sea `public` y con añadir `.WithValidation<AssignTagRequest>()` en `MapTaskEndpoints`.
:::

:::solution
```csharp title="Validation/TaskValidators.cs (clase nueva, al final del archivo)"
public class AssignTagRequestValidator : AbstractValidator<AssignTagRequest>
{
    public AssignTagRequestValidator()
    {
        RuleFor(x => x.TagId).GreaterThan(0);
    }
}
```

```csharp title="Endpoints/TaskEndpoints.cs (línea de AssignTag en MapTaskEndpoints)"
tasks.MapPost("/{id:int}/tags", AssignTag).WithValidation<AssignTagRequest>();
```

En el mensaje, FluentValidation muestra la propiedad como `'Tag Id'` (separa las palabras), pero la clave del error sigue siendo `TagId`. Y en `/openapi/v1.json`, el `post` de `/api/tasks/{id}/tags` lista ahora también la respuesta `400`.
:::
::::

:::troubleshooting Errores comunes
- **`CS0411: The type arguments for method 'DefaultValidatorOptions.Cascade<T, TProperty>(IRuleBuilderInitial<T, TProperty>, CascadeMode)' cannot be inferred from the usage`:** tu extensión recibe `IRuleBuilder<T, string>` en lugar de `IRuleBuilderInitial<T, string>`. `Cascade` solo existe en el segundo.
- **`CS0411: The type arguments for method 'RuleBuilderExtensions.RequiredText<T>(IRuleBuilderInitial<T, string>, int)' cannot be inferred from the usage`:** llamaste a `RequiredText` después de otro validador (por ejemplo, `.NotEmpty().RequiredText(100)`). Tiene que ir justo después de `RuleFor(...)`.
- **La API no arranca: `Unable to resolve service for type 'System.TimeProvider' while attempting to activate 'TaskTracker.Api.Validation.CreateTaskRequestValidator'`:** falta `builder.Services.AddSingleton(TimeProvider.System);` en `Program.cs`. En `Development`, el contenedor comprueba al arrancar que puede crear todos los servicios registrados, por eso falla antes de recibir ninguna petición.
- **Las tareas sin fecha límite se rechazan con "The due date cannot be in the past.":** falta el `.When(x => x.DueDate is not null)`.
- **Una tarea con fecha de hoy se rechaza por la noche:** "hoy" es el día en UTC (lo viste en el paso 3). Usa la fecha UTC en tus pruebas.
- **`500` con `Unable to resolve service for type 'FluentValidation.IValidator`1[TaskTracker.Api.Contracts.AssignTagRequest]'`:** añadiste `WithValidation<AssignTagRequest>()` pero el validador no existe o no es `public`.
- **El `POST` de tareas de `TaskTracker.Api.http` responde `400` con `DueDate`:** su fecha ya pasó. Cámbiala a `2030-12-01`.
:::

:::recap
- Una **extensión de reglas** (`RequiredText`) escribe una vez lo que repetían cinco reglas. Extiende **`IRuleBuilderInitial`** porque `Cascade` solo existe ahí.
- **`Cascade(CascadeMode.Stop)`** detiene una regla en su primer fallo: una etiqueta vacía da un error, no dos. Las demás reglas se siguen evaluando.
- **`TimeProvider`** es el reloj como servicio: `AddSingleton(TimeProvider.System)` en producción, un `FakeTimeProvider` en las pruebas.
- Los validadores los crea el contenedor de DI, así que reciben servicios por su constructor. La regla de la fecha vuelve con **`Must`** y **`When`**.
- FluentValidation evalúa todas las reglas: un título vacío y una fecha pasada llegan en la misma respuesta.
- Las comprobaciones contra la base de datos suelen ir en el **handler** (y en las restricciones de la base de datos), no en el validador: códigos correctos, sin consultas dobles y validadores fáciles de probar.
- `TaskTracker.Api.http` usa ahora `2030-12-01` para no caducar.

La validación está completa. En el siguiente paso pasarás de los errores de validación a **todos** los errores: harás que cada `ProblemDetails` de la API tenga la misma forma y un `code` que los clientes puedan leer.
:::
