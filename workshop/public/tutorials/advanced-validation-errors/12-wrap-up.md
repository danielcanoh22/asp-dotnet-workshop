## Objetivo del paso

Tu API ya no tiene ninguno de los puntos débiles que encontraste en la auditoría del paso 2. En este último paso no escribirás código nuevo: lo comprobarás todo de una vez y ordenarás lo aprendido. Vas a:

1. Ejecutar `errors.http` completo sobre una base de datos recién sembrada, y después `TaskTracker.Api.http`.
2. Repasar el **catálogo de errores** final de la API.
3. Comprobar la estructura final del proyecto.
4. Seguir el viaje de una petición con errores por todas las capas que has construido.
5. Ver qué problemas de esta API resuelven los próximos tutoriales.

## La prueba final: errors.http

`errors.http` empezó en el paso 2 como una lista de puntos débiles. Ahora es la documentación ejecutable de **todos los errores** que tu API puede devolver, una petición por cada uno. Sus comentarios lo dicen: se ejecuta **en orden** y sobre una base de datos **recién sembrada**, porque algunas peticiones dependen de los datos de ejemplo (el proyecto 1 tiene tareas abiertas, la etiqueta `backend` existe, la tarea 1 está en la versión `0`).

:::vs Partir de los datos sembrados
1. **Detén la API.**
2. En la **Package Manager Console**:

```powershell
Drop-Database
```

   Confirma con `Y`.

3. Y después:

```powershell
Update-Database
```

4. Ejecuta la API con el perfil **http**.
:::

Con la CLI: `dotnet ef database drop --force` y `dotnet ef database update`.

:::checkpoint errors.http, de principio a fin
Abre `errors.http` y lanza sus peticiones **una a una, en orden**:

| # | Petición | Resultado esperado |
| --- | --- | --- |
| 1 | `POST /api/projects` con `"name": ""` | `400`, `errors` → `Name: ["'Name' must not be empty."]` |
| 2 | `POST /api/projects/1/tasks` con `"dueDate": "2020-01-01"` | `400`, `errors` → `DueDate: ["The due date cannot be in the past."]` |
| 3 | `POST /api/tags` con `"name": "not a valid tag!"` | `400`, `errors` → `Name: ["Use only letters, numbers and hyphens."]` |
| 4 | `PUT /api/tasks/1` sin `version` | `400`, `errors` → `Version: ["'Version' must not be empty."]` |
| 5 | `GET /api/projects/1/tasks?status=Unknown` | `400`, `"title": "Bad request"` con el motivo en `detail` |
| 6 | `POST /api/projects` con el JSON roto | `400`, `"title": "Bad request"` con el motivo en `detail` |
| 7 | `GET /api/projects/999` | `404` |
| 8 | `DELETE /api/projects/1` | `409`, `"code": "project.has_open_tasks"` |
| 9 | `POST /api/tags` con `"name": "backend"` | `409`, `"code": "tag.already_exists"` |
| 10 | `PUT /api/tasks/1` con `"version": 0` | `204`: la tarea pasa a la versión `1` |
| 11 | `PUT /api/tasks/1` con `"version": 0` otra vez | `409`, `"code": "concurrency.conflict"` |

Todas las respuestas de error llevan `type`, `title`, `status`, `instance` y `traceId`. Mientras las lanzas, la consola solo añade un `warn` (el del conflicto de concurrencia, de `DatabaseExceptionHandler`) y ningún `fail`. Los dos avisos del arranque (*sensitive data logging* y el puerto HTTPS) son los de siempre.

Las peticiones 5 y 6 responden así porque ejecutas en `Development`. En `Production` serían `"title": "Bad Request"` sin `detail` (paso 9).
:::

Después, comprueba que las operaciones normales siguen funcionando: repite `Drop-Database` y `Update-Database`, reinicia la API y ejecuta **en orden** `TaskTracker.Api.http`.

:::checkpoint TaskTracker.Api.http, sin regresiones
Las respuestas son las mismas que al final del tutorial 2, con dos cambios que ya conoces:

| Petición | Resultado |
| --- | --- |
| `GET /api/projects`, `GET /api/projects/1` | `200` |
| `POST /api/projects` | `201` |
| `PUT /api/projects/1` | `204` |
| `DELETE /api/projects/2?force=true` | `204`: sin `force`, sería `409` (el proyecto 2 tiene dos tareas abiertas). |
| Los tres `GET .../tasks` | `200`; cada tarea incluye ahora `"version"`. |
| `POST /api/projects/1/tasks` (con fecha `2030-12-01`) | `201`, `"version": 0` |
| `GET /api/tasks/1` | `200`, `"version": 0` |
| `PUT /api/tasks/1` (con `"version": 0`) | `204` |
| `PATCH /api/tasks/1/status`, `DELETE /api/tasks/2` | `204` |
| `POST .../complete-all` | `200`, `{ "affected": 1 }` |
| `DELETE .../completed` | `200`, `{ "affected": 3 }` |
| `GET /api/tags`, `POST /api/tags` (`docs`) | `200` y `201` |
| `POST /api/tasks/1/tags`, `DELETE /api/tasks/1/tags/1` | `404` las dos: la tarea 1 se borró en `DELETE .../completed`, igual que en el tutorial 2. |
| `DELETE /api/tags/3` | `204` |
:::

:::tip ¿Por qué cada archivo con su propia siembra?
Los dos archivos modifican la tarea 1. Si ejecutas `errors.http` y después `TaskTracker.Api.http` sin recrear la base de datos, la tarea 1 ya estará en la versión `1` y el `PUT` con `"version": 0` del segundo archivo recibirá un `409`. No es un fallo: es la concurrencia optimista haciendo su trabajo. Cada archivo da por hecho que parte de los datos sembrados.
:::

## El catálogo de errores

Esta es la lista completa de lo que tu API puede responder cuando algo sale mal. Es la que un equipo de *frontend* querría tener impresa:

| Status | `code` | `title` | Cuándo | Dónde se decide |
| --- | --- | --- | --- | --- |
| `400` | — (lista `errors`) | `One or more validation errors occurred.` | Una petición incumple un validador. | `ValidationFilter<T>` + FluentValidation (pasos 4 a 6) |
| `400` | — | `Bad request` (`Bad Request` en Production) | La petición no se puede leer: JSON roto o un valor de la *query string* que no se puede convertir (`?status=Unknown`). | `GlobalExceptionHandler` en Development; Minimal APIs + `UseStatusCodePages` en Production (paso 9) |
| `404` | — | `Not Found` | El recurso no existe. | Los handlers + `UseStatusCodePages` |
| `409` | `tag.already_exists` | `Tag already exists` | Ya hay una etiqueta con ese nombre. | `TagEndpoints.Create` (paso 7) |
| `409` | `project.has_open_tasks` | `Project has open tasks` | Borrar un proyecto con tareas abiertas sin `?force=true`. | `ProjectEndpoints.Delete` (paso 8) |
| `409` | `task.tag_limit_reached` | `Tag limit reached` | Asignar una etiqueta nueva a una tarea que ya tiene cinco. | `TaskEndpoints.AssignTag` (paso 8) |
| `409` | `database.duplicate_value` | `Duplicate value` | Un índice único rechaza un valor que se escapó a la comprobación previa. | `DatabaseExceptionHandler` (paso 10) |
| `409` | `database.related_data_missing` | `Related data is missing` | Una clave foránea apunta a algo que no existe. | `DatabaseExceptionHandler` (paso 10) |
| `409` | `concurrency.conflict` | `The resource was modified by someone else` | Un `PUT` con una versión que ya no es la actual. | `DatabaseExceptionHandler` (paso 11) |
| `500` | `server.unexpected_error` | `An unexpected error occurred` | Cualquier otra excepción. `detail` solo en Development. | `GlobalExceptionHandler` (paso 9) |

Fíjate en la columna de la derecha: cada error tiene **un único sitio** donde se decide. Y cada `code` es un compromiso con tus clientes: puedes mejorar los `title` y los `detail` cuando quieras, pero cambiar un `code` rompe a quien lo use.

## La estructura final

Tu proyecto debería coincidir con este árbol:

```
TaskTracker.Api/
├── Contracts/          ProjectContracts.cs, TagContracts.cs, TaskContracts.cs
├── Data/               DataSeeder.cs, TaskTrackerDbContext.cs, UtcDateTimeConverter.cs
│   └── Configurations/ ProjectConfiguration.cs, TagConfiguration.cs, TaskItemConfiguration.cs
├── Endpoints/          ProjectEndpoints.cs, TagEndpoints.cs, TaskEndpoints.cs
├── Entities/           Project.cs, Tag.cs, TaskItem.cs, TaskItemStatus.cs, TaskPriority.cs
├── Errors/             ApiProblems.cs, DatabaseExceptionHandler.cs, GlobalExceptionHandler.cs
├── Mappings/           ProjectMappings.cs, TaskMappings.cs
├── Migrations/         <fecha>_InitialCreate, <fecha>_AddTasks, <fecha>_AddTags, <fecha>_AddTaskVersion
│                       (cada una con su .Designer.cs), TaskTrackerDbContextModelSnapshot.cs
├── Properties/         launchSettings.json
├── Validation/         ProjectValidators.cs, RuleBuilderExtensions.cs, TagValidators.cs,
│                       TaskValidators.cs, ValidationExtensions.cs, ValidationFilter.cs
├── .gitignore          (excluye tasktracker.db)
├── appsettings.json, appsettings.Development.json
├── errors.http, TaskTracker.Api.http
├── TaskTracker.Api.csproj
└── Program.cs
```

Dos carpetas nuevas respecto al tutorial 2: `Validation` (el **antes** del handler) y `Errors` (el **después**, cuando algo sale mal). Y ningún atributo de DataAnnotations en los contratos: la validación tiene una sola fuente de verdad.

## Repaso: el viaje de una petición con errores

Así recorre tu API un `PUT /api/tasks/1`, y dónde puede detenerse:

| Fase | Quién | Si algo falla |
| --- | --- | --- |
| 1. Pipeline | `UseExceptionHandler`, `UseStatusCodePages`, `UseHttpsRedirection` | `UseExceptionHandler` envuelve todo lo que viene después: cualquier excepción vuelve aquí (fase 7). |
| 2. Routing y binding | `MapPut("/{id:int}")`, JSON → `UpdateTaskRequest` | JSON roto o enum desconocido: `400` (`Bad request` en Development, vía excepción y `GlobalExceptionHandler`). |
| 3. Validación | `ValidationFilter<UpdateTaskRequest>` con `UpdateTaskRequestValidator` | Título vacío o sin `version`: `400` con `errors`. El handler no se ejecuta. |
| 4. Handler: existencia | `FindAsync` | No existe: `404` (cuerpo de `UseStatusCodePages`). |
| 5. Handler: reglas | `OriginalValue`, `Version++` | (En otros endpoints, aquí van las reglas de negocio: `409` del catálogo `ApiProblems`.) |
| 6. `SaveChangesAsync` | `UPDATE ... WHERE "Id" = @id AND "Version" = @original` | 0 filas: `DbUpdateConcurrencyException`. Un índice o una clave foránea: `DbUpdateException`. |
| 7. Manejadores | `DatabaseExceptionHandler` → `GlobalExceptionHandler` | `409` con su `code`, o `500` registrado en el log. |
| 8. Escritura del error | `IProblemDetailsService` + `CustomizeProblemDetails` | Todos los errores salen con `instance` y `traceId`. |

## Lista de conceptos

Si alguno te suena borroso, vuelve al paso indicado:

| Concepto | Paso |
| --- | --- |
| Taxonomía de errores, quién detecta cada uno, `400`/`404`/`409`/`412`/`422`/`500`, ProblemDetails (RFC 9457) | 1 |
| Auditoría del punto de partida y `errors.http` | 2 |
| Límites de DataAnnotations, `IValidatableObject`, `ValidationContext.GetService` como localizador de servicios | 3 |
| FluentValidation: `AbstractValidator<T>`, reglas, mensajes, `ValidateAsync`, `ToDictionary`, cultura de los mensajes | 4 |
| `ValidationFilter<T>`, `WithValidation<T>()`, `AddValidatorsFromAssemblyContaining`, el precio en OpenAPI | 5 |
| `When`, `Must` con `TimeProvider`, extensiones de reglas, `Cascade(CascadeMode.Stop)`, comprobaciones contra la base de datos en el handler | 6 |
| `CustomizeProblemDetails`, `instance`, `traceId`, `ApiProblems` y `code`, `ProducesProblem` | 7 |
| Reglas de negocio, `409` frente a `422`, `?force=true`, resultados frente a excepciones | 8 |
| `IExceptionHandler`, `IProblemDetailsService`, log en .NET 10, Development frente a Production | 9 |
| `DbUpdateException`, `SqliteException` y códigos extendidos, orden de los manejadores | 10 |
| Actualización perdida, token de concurrencia, `OriginalValue`, `DbUpdateConcurrencyException`, ETag | 11 |

## ¿Qué sigue?

Con los tutoriales 1, 2 y 3 tienes una API que valida, responde errores claros y protege sus datos. Los siguientes tutoriales del catálogo siguen evolucionándola:

| Tutorial | De qué trata | Qué problema de esta API resuelve |
| --- | --- | --- |
| **4. Clean Architecture en ASP.NET Core** | Capas, dependencias y casos de uso bien separados. | Las reglas de negocio del paso 8 viven en handlers que conocen HTTP y el `DbContext`. Las moverás a casos de uso que devuelven un **Result**, y los `code` de tu catálogo te servirán para describir sus errores sin depender de HTTP. |
| **5. Testing: xUnit y WebApplicationFactory** | Pruebas unitarias y de integración para tu API. | `errors.http` lo ejecutas a mano y comparas a ojo. Lo convertirás en pruebas automáticas: cada fila del catálogo, un test. Los validadores y la concurrencia son candidatos perfectos. |
| **6. Autenticación con JWT** | Protege tu API con tokens y políticas de autorización. | Cualquiera puede borrar cualquier proyecto, incluso con `?force=true`. Añadirás usuarios y permisos; con ellos llegan dos códigos de estado que este tutorial no necesitó: `401` y `403`. |
| **7. Paginación, caching y versionado** | Hazla escalable y evolutiva. | `GET .../tasks` devuelve todas las tareas. Añadirás páginas y cachés, un terreno donde los `ETag` del paso 11 encajan de forma natural. |

Antes de continuar, haz una última prueba: ejecuta la API en `Production` (paso 9), lanza `errors.http` y compara cada respuesta con la de `Development`. Si puedes explicar **por qué** cada diferencia existe, dominas lo esencial de este tutorial.

:::recap
- `errors.http` documenta y comprueba **todos** los errores de la API, en orden y sobre datos recién sembrados.
- **`400`** para lo que la petición tiene mal, **`404`** para lo que no existe, **`409`** para lo que choca con el estado actual y **`500`** para lo inesperado, siempre con `ProblemDetails`.
- La **validación** vive en FluentValidation y un filtro de endpoint; las **reglas de negocio**, en los handlers como resultados explícitos; los **errores inesperados**, en una cadena de `IExceptionHandler`.
- Cada error de negocio tiene un **`code` estable** en `ApiProblems`; `instance` y `traceId` llegan a todos gracias a `CustomizeProblemDetails`.
- La base de datos es la **red de seguridad** (índices únicos y claves foráneas traducidos a `409`); la comprobación previa da el mejor mensaje.
- La **concurrencia optimista** con un token de versión impide que un cambio pise a otro sin que nadie se entere.
- En `Production`, los detalles internos se quedan en el log y el cliente recibe un `traceId`.

Has completado el tutorial **Validación avanzada y manejo de errores**. Tu proyecto debería coincidir con la solución de referencia del repositorio (salvo la fecha en el nombre de la migración `AddTaskVersion`). Márcalo como completado y continúa con el tutorial 4 cuando esté disponible.
:::
