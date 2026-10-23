## Qué vas a construir

En el tutorial 2 terminaste **Task Tracker API**: proyectos, tareas y etiquetas sobre SQLite con EF Core. Funciona bien con datos correctos. Este tutorial se ocupa de todo lo demás: de lo que pasa cuando algo **sale mal**.

No empezarás de cero. Tomarás el proyecto del tutorial 2 y lo harás evolucionar hasta que cada error tenga una respuesta clara, consistente y útil para el cliente:

- La validación pasa a **FluentValidation**: reglas en clases propias, con inyección de dependencias, reglas que dependen de la fecha actual y un único filtro que valida todos los endpoints.
- Todos los errores salen como **`ProblemDetails` consistentes**, con un campo `code` que un programa puede leer sin interpretar textos.
- Las **reglas de negocio** se hacen explícitas: no se borra un proyecto con tareas abiertas (salvo que lo pidas con `?force=true`) y una tarea no puede tener más de cinco etiquetas.
- Un **manejador global de excepciones** convierte lo inesperado en un `500` limpio, registrado en el log y sin detalles internos en producción.
- Un **manejador de errores de base de datos** traduce las violaciones de índices únicos y claves foráneas a `409 Conflict` en lugar de `500`.
- La **concurrencia optimista** impide que dos personas se pisen los cambios sin enterarse.

:::tip El mismo proyecto, mejor protegido
Las rutas, los contratos de respuesta y los datos de ejemplo del tutorial 2 se mantienen. Lo que cambia es cómo responde la API cuando la petición es incorrecta, cuando una regla lo impide o cuando algo falla por dentro.
:::

## Qué aprenderás

- A **clasificar los errores** de una API (validación, regla de negocio, recurso inexistente, conflicto, error inesperado) y a elegir su código de estado.
- Hasta dónde llegan las **DataAnnotations** e **`IValidatableObject`**, y por qué se quedan cortas.
- **FluentValidation**: validadores, reglas, mensajes, `When`, `Must`, `Cascade` y extensiones de reglas reutilizables.
- Un **endpoint filter** genérico que valida cualquier petición antes del handler.
- **`TimeProvider`**: el reloj como servicio, para que las reglas que dependen de "hoy" se puedan probar.
- **`ProblemDetails`** consistentes con `CustomizeProblemDetails` y códigos de error propios.
- **Reglas de negocio** como resultados explícitos, y el debate `409` frente a `422`.
- **`IExceptionHandler`**: manejadores encadenados para excepciones globales y de base de datos.
- **Concurrencia optimista** con un token de concurrencia en EF Core.

## Qué NO verás todavía

Para que el foco esté en la validación y en los errores, este tutorial deja fuera:

- **Autenticación y autorización** (JWT, políticas).
- **Pruebas automatizadas**. Verás por qué `TimeProvider` facilita probar una regla, pero las pruebas en sí llegan en el tutorial de testing.
- **Clean Architecture**: los handlers siguen usando el `DbContext` directamente. Separar casos de uso y dominio es el tema del tutorial 4.
- **Paginación, caché y versionado**.

Todo esto llegará en tutoriales posteriores.

## Requisitos previos

Este tutorial **continúa** al tutorial 2 (*Task Tracker API*). Necesitas su proyecto terminado: el tuyo o la solución de referencia del repositorio, en `reference-solutions/02-task-tracker-api/`. En el paso 2 verás cómo preparar cualquiera de los dos.

| Concepto del tutorial 2 | Dónde lo usarás aquí |
| --- | --- |
| Minimal APIs, route groups y `Results<...>` | Los handlers cambian sus tipos de retorno para incluir nuevos errores. |
| `AddValidation()` y DataAnnotations | Son el punto de partida: verás sus límites y los sustituirás. |
| `ProblemDetails`, `UseExceptionHandler`, `UseStatusCodePages` | Los harás consistentes y los ampliarás. |
| `DbContext`, `SaveChangesAsync`, índices únicos | Traducirás sus excepciones a respuestas claras. |
| Migraciones con la **Package Manager Console** | Crearás una nueva para la concurrencia optimista. |
| Archivos `.http` | Tendrás uno nuevo, `errors.http`, dedicado a los errores. |

| Requisito | Detalle |
| --- | --- |
| Visual Studio 2026 | Con la carga de trabajo **ASP.NET y desarrollo web** (*ASP.NET and web development*), como en el tutorial 2. |
| SDK de .NET 10 | Compruébalo con `dotnet --list-sdks`. |
| Sistema operativo | Windows. Las instrucciones de Visual Studio están pensadas para Windows. |

## Lo que cambia en el proyecto

Dos carpetas nuevas y un archivo de pruebas nuevo. Todo lo demás ya lo conoces:

```
TaskTracker.Api/
├── Contracts/          ← sin DataAnnotations: las reglas viven en Validation/
├── Data/
├── Endpoints/
├── Entities/           ← TaskItem gana Version y MaxTags
├── Errors/             ← NUEVA: respuestas de error y manejadores de excepciones
│   ├── ApiProblems.cs
│   ├── DatabaseExceptionHandler.cs
│   └── GlobalExceptionHandler.cs
├── Mappings/
├── Migrations/         ← una migración nueva: AddTaskVersion
├── Validation/         ← NUEVA: validadores de FluentValidation y su filtro
│   ├── ProjectValidators.cs
│   ├── RuleBuilderExtensions.cs
│   ├── TagValidators.cs
│   ├── TaskValidators.cs
│   ├── ValidationExtensions.cs
│   └── ValidationFilter.cs
├── errors.http         ← NUEVO: una petición por cada error posible
├── Program.cs
└── TaskTracker.Api.http
```

## El catálogo de errores final

Este es el destino: todos los errores que devolverá tu API al terminar. Léelo como un mapa; lo construirás paso a paso y el archivo `errors.http` tendrá una petición para cada fila.

| Estado | `code` | Cuándo | Paso |
| --- | --- | --- | --- |
| `400` | (sin `code`; trae `errors` campo por campo) | La petición no cumple las reglas de validación: nombre vacío, texto demasiado largo, fecha límite en el pasado, etiqueta con espacios, `tagId` menor que 1, `PUT` de tarea sin `version`. | 4 a 6 y 11 |
| `400` | (sin `code`) | La API no puede leer la petición: JSON mal formado o un valor que no existe en un enum (`?status=Unknown`). | 9 |
| `404` | (sin `code`) | El recurso no existe (`GET /api/projects/999`). | ya existía |
| `409` | `tag.already_exists` | Ya existe una etiqueta con ese nombre. | 7 |
| `409` | `project.has_open_tasks` | Borras un proyecto con tareas sin completar y sin `?force=true`. | 8 |
| `409` | `task.tag_limit_reached` | Asignas una sexta etiqueta a una tarea. | 8 |
| `409` | `database.duplicate_value` | La base de datos rechaza un valor duplicado en un índice único (por ejemplo, dos peticiones que crean la misma etiqueta a la vez). | 10 |
| `409` | `database.related_data_missing` | La base de datos rechaza una clave foránea que apunta a algo que no existe. | 10 |
| `409` | `concurrency.conflict` | Guardas una tarea con una `version` antigua: otra persona la modificó después de que la leyeras. | 11 |
| `500` | `server.unexpected_error` | Cualquier otra excepción. Se registra en el log; el campo `detail` solo aparece en `Development`. | 9 |

Todas las respuestas de error tienen la forma `ProblemDetails` (`type`, `title`, `status`, `detail`, `instance`, `traceId`), así que un cliente puede tratarlas todas con el mismo código.

## Cómo usar este taller

Igual que en los tutoriales anteriores: tú haces los cambios en Visual Studio y consultas aquí qué hacer y por qué. Cada paso empieza por el concepto, sigue con instrucciones exactas y código explicado, y termina con un **Checkpoint** que te dice qué petición enviar y qué respuesta esperar. Los bloques **Concepto**, **¿Por qué?**, **En Visual Studio**, **Tip**, **Atención**, **Checkpoint**, **Errores comunes**, **Reto** y **Resumen** significan lo mismo que en el tutorial 2.

:::warning Las fechas de los ejemplos
Algunas reglas de este tutorial dependen de la fecha actual ("una tarea nueva no puede vencer en el pasado"). Los ejemplos usan fechas muy lejanas (`2020-01-01` para el pasado, `2030-12-01` para el futuro) para que sigan funcionando cuando leas esto. Si una respuesta no coincide con la del checkpoint, revisa primero las fechas.
:::

## Tiempo estimado

Unas 6 horas en total. Recomendamos sesiones de 1 a 2 horas. Hay dos buenos puntos de corte: al final del paso 6 (toda la validación en FluentValidation) y al final del paso 9 (todos los errores pasan por `ProblemDetails` consistentes).

## Pasos del tutorial

| # | Paso | Qué haces |
| --- | --- | --- |
| 1 | Tipos de errores en una API | Clasificas los errores de una API y eliges su código de estado. |
| 2 | Punto de partida: auditar los errores actuales | Preparas el proyecto del tutorial 2 y provocas sus errores con `errors.http`. |
| 3 | Los límites de las DataAnnotations | Escribes una regla con `IValidatableObject` y descubres hasta dónde llega. |
| 4 | Primeros pasos con FluentValidation | Instalas FluentValidation y validas proyectos a mano. |
| 5 | Validación automática con un endpoint filter | Validas cualquier petición con un endpoint filter genérico. |
| 6 | Reglas avanzadas y reutilizables | Usas `When`, `Must`, `Cascade` y `TimeProvider`. |
| 7 | ProblemDetails consistentes | Unificas la forma de todos los errores y añades un `code`. |
| 8 | Reglas de negocio | Proteges el borrado de proyectos y limitas las etiquetas por tarea. |
| 9 | Manejador global de excepciones | Conviertes lo inesperado en un `500` limpio con `IExceptionHandler`. |
| 10 | Errores de base de datos | Traduces índices únicos y claves foráneas a `409`. |
| 11 | Concurrencia optimista | Detectas actualizaciones perdidas con un token de concurrencia. |
| 12 | Catálogo de errores y cierre | Ejecutas el catálogo completo de errores y repasas lo aprendido. |
