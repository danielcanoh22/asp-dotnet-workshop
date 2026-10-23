## Objetivo del paso

El primer punto débil de la auditoría fue una tarea que nace vencida. Antes de traer una biblioteca nueva, vamos a intentarlo con lo que ya tienes: DataAnnotations y `AddValidation()`. Lo conseguirás, y por el camino verás con claridad dónde se queda corta esta herramienta. Vas a:

1. Entender por qué un atributo no puede expresar "la fecha no puede estar en el pasado".
2. Implementar la regla con **`IValidatableObject`** en `CreateTaskRequest`.
3. Comprobar que la validación de .NET 10 la ejecuta, y en qué orden.
4. Analizar los **límites** de este enfoque: dependencias, código asíncrono, el reloj y las pruebas.

## Una regla que no cabe en un atributo

La regla es sencilla de decir: **al crear una tarea, si trae fecha límite, esa fecha no puede ser anterior a hoy**.

Las DataAnnotations que usaste en el tutorial 2 (`[Required]`, `[StringLength]`, `[RegularExpression]`) miran **un solo valor** y lo comparan con datos **fijos**: una longitud, un patrón. Los argumentos de un atributo tienen que ser **constantes** que el compilador conoce, así que no puedes escribir algo como `[Range(DateTime.Today, ...)]`: "hoy" cambia cada día.

Tienes dos salidas sin salir de DataAnnotations:

| Opción | Cómo funciona |
| --- | --- |
| Un atributo propio | Una clase que hereda de `ValidationAttribute` y sobrescribe `IsValid`. Se reutiliza en varias propiedades. |
| **`IValidatableObject`** | El propio tipo implementa un método `Validate` que ve **todas** sus propiedades a la vez. |

Usaremos `IValidatableObject`, porque además permite reglas que comparan varios campos (por ejemplo, "la fecha de fin no puede ser anterior a la de inicio").

:::concept IValidatableObject
`IValidatableObject` es una interfaz de `System.ComponentModel.DataAnnotations` con un solo método:

```csharp
IEnumerable<ValidationResult> Validate(ValidationContext validationContext);
```

El validador lo llama **después** de comprobar los atributos. Cada `ValidationResult` que devuelvas es un error, con su mensaje y los nombres de los campos afectados (que serán las claves del diccionario `errors`). Si no devuelves nada, el objeto es válido.

Funciona con controllers desde hace muchos años. En Minimal APIs, la validación de `AddValidation()` de .NET 10 también lo respeta: lo comprobarás en el checkpoint.
:::

## La regla en CreateTaskRequest

`CreateTaskRequest` es un `record` posicional, pero un `record` puede tener cuerpo y implementar interfaces como cualquier clase.

:::vs Editar Contracts/TaskContracts.cs
Abre `Contracts/TaskContracts.cs` y reemplaza **solo** la declaración de `CreateTaskRequest` por la siguiente. El resto del archivo no cambia.
:::

```csharp title="Contracts/TaskContracts.cs (CreateTaskRequest)"
public record CreateTaskRequest(
    [Required, StringLength(200)] string Title,
    [StringLength(2000)] string? Description = null,
    TaskPriority Priority = TaskPriority.Medium,
    DateOnly? DueDate = null) : IValidatableObject
{
    // Runs only after every attribute on the record has passed.
    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (DueDate < DateOnly.FromDateTime(DateTime.UtcNow))
        {
            yield return new ValidationResult("The due date cannot be in the past.", [nameof(DueDate)]);
        }
    }
}
```

Línea a línea:

- **`: IValidatableObject`** después de los parámetros del `record`, y un cuerpo entre llaves en lugar del `;` final.
- **`DueDate < DateOnly.FromDateTime(DateTime.UtcNow)`**: compara la fecha límite con el día de hoy en UTC. Como `DueDate` es `DateOnly?`, si es `null` la comparación vale `false` y no hay error: una tarea sin fecha límite es válida.
- **`yield return`** devuelve un error y sigue; si la condición no se cumple, el método termina sin devolver nada.
- **`[nameof(DueDate)]`** dice a qué campo pertenece el error. Será la clave `DueDate` en la respuesta.

No hace falta ningún `using` nuevo: `System.ComponentModel.DataAnnotations` ya estaba al principio del archivo por los atributos.

Esta regla solo se aplica al **crear** una tarea. Al editarla (`PUT`) no la comprobamos a propósito: una tarea antigua puede tener una fecha que ya pasó, y eso no debe impedir que corrijas su título.

Ahora que la regla funciona, la petición *Born overdue* de `errors.http` ya no pertenece a la sección de reglas pendientes.

:::vs Mover la petición en errors.http
1. En `errors.http`, corta el bloque de la petición `POST .../tasks` con `"title": "Born overdue"`, incluido su comentario `# Today this creates a task that is already overdue: 201.` y el `###` que lo separa del `DELETE`. **Borra el comentario**: ya no es cierto.
2. Pégalo en la sección `400: validation`, entre la petición del proyecto con nombre vacío y la de la etiqueta.
:::

Las dos secciones que cambian quedan así (el resto del archivo no cambia):

```http title="errors.http (sección 400: validation)"
### --- 400: validation (DataAnnotations) ---

POST {{TaskTracker.Api_HostAddress}}/api/projects
Content-Type: application/json

{
  "name": ""
}

###

POST {{TaskTracker.Api_HostAddress}}/api/projects/1/tasks
Content-Type: application/json

{
  "title": "Born overdue",
  "dueDate": "2020-01-01"
}

###

POST {{TaskTracker.Api_HostAddress}}/api/tags
Content-Type: application/json

{
  "name": "not a valid tag!"
}
```

```http title="errors.http (sección Rules the API does not enforce yet)"
### --- Rules the API does not enforce yet ---

# Today this deletes the project and all of its tasks: 204.
DELETE {{TaskTracker.Api_HostAddress}}/api/projects/1
```

:::checkpoint La regla con IValidatableObject
Compila (<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd>, sin errores ni advertencias), ejecuta la API y envía estas peticiones a `POST /api/projects/1/tasks` (puedes escribirlas temporalmente en `errors.http` y borrarlas después). Sustituye `<hoy>` por la fecha actual en formato `aaaa-mm-dd`:

| Cuerpo | Resultado esperado |
| --- | --- |
| `{ "title": "Born overdue", "dueDate": "2020-01-01" }` | `400`, `errors` → `DueDate: ["The due date cannot be in the past."]` |
| `{ "title": "", "dueDate": "2020-01-01" }` | `400`, pero **solo** `Title: ["The Title field is required."]`. El error de la fecha no aparece. |
| `{ "title": "Due today", "dueDate": "<hoy>" }` | `201`: hoy todavía no es el pasado. |
| `{ "title": "No due date" }` | `201`, `"dueDate": null`. |
| `{ "title": "Far away", "dueDate": "2030-12-01" }` | `201` |

Y un `PUT /api/tasks/1` con `{ "title": "Design the new home page", "priority": "High", "dueDate": "2020-01-01" }` responde `204`: la regla no se aplica al editar.

Ejecuta también `errors.http` completo sobre una base de datos recién sembrada: la petición *Born overdue* responde ahora `400`.
:::

Fíjate en la segunda fila. El título vacío y la fecha pasada son **dos** errores, pero la respuesta solo muestra uno. No es un fallo de tu código: `Validate` solo se ejecuta si **todos los atributos han pasado**. El cliente corrige el título, reenvía la petición y solo entonces descubre que la fecha tampoco era válida. Dos viajes para algo que podía decirse en uno.

## Los límites de este enfoque

La regla funciona. Pero intenta ahora mejorarla, y empiezan los problemas.

### No puedes inyectar dependencias

`CreateTaskRequest` no lo crea el contenedor de inyección de dependencias, sino el deserializador JSON. Por eso no puede recibir servicios por su constructor: sus parámetros son los campos del JSON.

Lo único que ofrece `Validate` es su parámetro `validationContext`, que tiene un método `GetService(Type)`. La validación de .NET 10 lo conecta con los servicios de la petición, así que técnicamente puedes escribir `validationContext.GetService(typeof(TimeProvider))`. Pero eso es un **localizador de servicios** (*service locator*): la dependencia no aparece en ninguna firma, solo descubres que existe leyendo el cuerpo del método, y devuelve `null` si quien crea el `ValidationContext` no le pasó un proveedor de servicios (como harías tú en una prueba).

### No puede ser asíncrono

`Validate` devuelve `IEnumerable<ValidationResult>`, no `Task<...>`. Si una regla necesitara consultar la base de datos ("¿existe ya un proyecto con este nombre?"), tendrías que bloquear el hilo esperando el resultado (`.Result`), justo lo que aprendiste a evitar con `async`/`await` en el tutorial 2.

### El reloj está escrito a fuego

`DateTime.UtcNow` siempre devuelve la hora real. ¿Cómo compruebas que la regla acepta una fecha de hoy y rechaza la de ayer, si "hoy" cambia cada vez que ejecutas la prueba? ¿Y el caso límite justo a medianoche? No puedes "fijar" la fecha sin cambiar el código.

El reloj real ya te ha dejado una pequeña bomba: la petición `POST` de tareas de `TaskTracker.Api.http` usa `"dueDate": "2026-12-01"`. El día que esa fecha pase, la petición del camino feliz empezará a fallar con un `400`. Lo arreglarás en el paso 6.

### Es difícil de probar y de leer

Para probar la regla hay que construir un `CreateTaskRequest`, un `ValidationContext` y recorrer los resultados. Y las reglas de un mismo contrato quedan repartidas en dos sitios: los atributos en los parámetros y el resto en `Validate`. A medida que crecen las reglas, el contrato (que debería ser un simple `record` con datos) se convierte en una clase con lógica.

:::why Entonces, ¿las DataAnnotations son malas?
No. Para reglas sencillas y fijas (obligatorio, longitud máxima, un patrón) son concisas y suficientes, y muchas APIs nunca necesitan más. El problema aparece cuando las reglas dependen de **servicios**, de **la hora**, de **otros campos** o de **datos externos**. Es entonces cuando conviene separar las reglas del contrato.
:::

## La alternativa: validadores como clases

La idea que resuelve todos estos límites es simple: sacar las reglas del contrato y ponerlas en **una clase propia**, creada por el contenedor de inyección de dependencias. Es lo que hace **FluentValidation**, la biblioteca de validación más usada en .NET:

| Necesidad | DataAnnotations + `IValidatableObject` | FluentValidation |
| --- | --- | --- |
| Servicios (el reloj, la configuración) | Solo con `GetService` (*service locator*). | Por el constructor del validador, como cualquier servicio. |
| Reglas asíncronas | No. | Sí (`MustAsync`, `ValidateAsync`). |
| Todos los errores en una respuesta | No: `Validate` espera a que pasen los atributos. | Sí: todas las reglas se evalúan, salvo que digas lo contrario. |
| Probar una regla | Construyendo el contexto de validación. | `new CreateTaskRequestValidator(...).Validate(request)`. |
| Dónde viven las reglas | Repartidas entre atributos y `Validate`, dentro del contrato. | En un validador por contrato; el contrato queda limpio. |

La instalarás en el siguiente paso. El `IValidatableObject` que acabas de escribir es **temporal**: desaparecerá en el paso 5, cuando todas las reglas pasen a FluentValidation.

:::troubleshooting Errores comunes
- **`CS0535: 'CreateTaskRequest' does not implement interface member 'IValidatableObject.Validate(ValidationContext)'`:** la firma del método no coincide. Debe ser `public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)`.
- **Errores de sintaxis alrededor del `record`:** al añadir el cuerpo, el `;` que cerraba el `record` debe desaparecer. Queda `DateOnly? DueDate = null) : IValidatableObject` seguido de `{`, y la llave de cierre `}` después del método.
- **La fecha pasada se acepta (`201`):** la API no se reinició tras compilar, o `AddValidation()` ya no está en `Program.cs`. `Validate` solo se ejecuta si la validación está activada.
- **El error de la fecha no aparece junto al del título:** es el comportamiento esperado. `Validate` solo se ejecuta cuando todos los atributos han pasado.
- **Una tarea con fecha de hoy se rechaza por la noche:** la regla compara con el día **en UTC**. Si vives al oeste de Greenwich (por ejemplo, en UTC-5), a partir de las 19:00 en UTC ya es mañana, y "hoy" en tu reloj es "ayer" para la API. Es una decisión de diseño: una API que atiende a clientes de varias zonas horarias necesita una referencia única. La regla del paso 6 mantiene la misma decisión.
:::

:::recap
- Los argumentos de un atributo son **constantes**: un atributo no puede comparar con "hoy" ni con otros campos de forma sencilla.
- **`IValidatableObject`** añade al tipo un método `Validate` que ve todas sus propiedades. La validación de .NET 10 para Minimal APIs lo ejecuta **después** de los atributos, y solo si todos han pasado.
- La regla "una tarea nueva no puede nacer vencida" funciona: *Born overdue* pasa a la sección `400: validation` de `errors.http`.
- Sus límites: sin inyección por constructor (solo *service locator* con `GetService`), sin reglas asíncronas, con el reloj escrito a fuego (`DateTime.UtcNow`), difícil de probar y con las reglas repartidas dentro del contrato.
- **FluentValidation** mueve las reglas a clases propias que el contenedor de DI crea y que se pueden probar aisladas.

En el siguiente paso instalarás FluentValidation y escribirás tus primeros validadores para los proyectos.
:::
