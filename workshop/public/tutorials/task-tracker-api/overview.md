## Qué vas a construir

Vas a construir **Task Tracker API**: una API REST para organizar trabajo en **proyectos**, **tareas** y **etiquetas**. Podrás crear proyectos, añadirles tareas con prioridad y fecha límite, cambiar su estado (`Todo`, `InProgress`, `Done`), etiquetarlas (`backend`, `urgent`…) y consultarlas con filtros y ordenación. También podrás completar o borrar muchas tareas de una sola vez.

A diferencia de Bookshelf, esta vez los datos viven en una **base de datos de verdad**: **SQLite**, gestionada con **Entity Framework Core** (EF Core). Y en lugar de controllers usarás **Minimal APIs**, el estilo que Microsoft recomienda hoy para proyectos nuevos.

Como en el tutorial anterior, el objetivo no es solo que la API funcione, sino que entiendas **por qué** cada pieza existe: qué problema resuelve un ORM, qué es una migración y por qué se versiona con el código, cuándo conviene una proyección en lugar de cargar entidades enteras, o por qué una relación muchos a muchos necesita una tabla intermedia. Cada concepto se explica **antes** de usarlo.

:::tip Un proyecto nuevo, de principio a fin
No necesitas el código de Bookshelf: empezarás con un proyecto vacío. Al final de cada paso tendrás código que compila y se puede ejecutar, igual que en el tutorial 1.
:::

## Qué aprenderás

- Qué son las **Minimal APIs**, en qué se diferencian de los controllers y cuándo conviene cada estilo.
- Cómo mapear endpoints con `MapGet`, `MapPost`, `MapPut` y `MapDelete`, y de dónde sale cada parámetro (**parameter binding**).
- Cómo organizar los endpoints con **route groups** (`MapGroup`) y métodos con nombre, en lugar de dejarlos todos en `Program.cs`.
- Cómo usar **`TypedResults`** y **`Results<...>`** para que el compilador y la documentación OpenAPI conozcan cada respuesta posible.
- Qué es un **ORM** y cómo funciona **EF Core**: `DbContext`, `DbSet`, proveedores y el enfoque *code-first*.
- Cómo configurar el modelo con **convenciones** y con la **Fluent API** (`IEntityTypeConfiguration<T>`).
- Cómo crear y aplicar **migraciones** con la **Package Manager Console** (y con la CLI `dotnet ef`).
- Consultas con LINQ: **change tracking**, `AsNoTracking`, **proyecciones**, `Include`, filtros y ordenación.
- Relaciones **uno a muchos** (proyecto → tareas) y **muchos a muchos** (tareas ↔ etiquetas).
- **Validación** en Minimal APIs con `AddValidation()` y `ProblemDetails`.
- **Operaciones masivas** con `ExecuteUpdate` y `ExecuteDelete`, y **datos de ejemplo** (*seeding*).
- Cómo leer el **SQL que genera EF Core**, detectar el problema **N+1** y documentar la API con OpenAPI y **Scalar**.

## Qué NO verás todavía

Para que el foco esté en Minimal APIs y EF Core, este tutorial deja fuera deliberadamente:

- **Autenticación y autorización** (JWT, Identity).
- **Pruebas automatizadas** (unit tests, tests de integración).
- **Arquitectura por capas** avanzada (Clean Architecture, repositorios sobre EF Core): aquí los endpoints usan el `DbContext` directamente, y explicaremos por qué es razonable en una API de este tamaño.
- Otros motores de base de datos (SQL Server, PostgreSQL) y despliegue.

Todo esto llegará en tutoriales posteriores.

## Requisitos previos

Este tutorial **continúa** al tutorial 1 (*Bookshelf API*). Damos por conocidos, y solo repasaremos brevemente, estos conceptos:

| Concepto del tutorial 1 | Dónde lo usarás aquí |
| --- | --- |
| El host: `CreateBuilder`, `Build()`, `Run()` | `Program.cs` tiene la misma estructura. |
| El pipeline de middleware y su orden | Añadirás `UseExceptionHandler` y `UseStatusCodePages`. |
| Inyección de dependencias y tiempos de vida | El `DbContext` es un servicio **scoped**. |
| DTOs, `ProblemDetails` y validación | Las peticiones y respuestas serán `record`; los errores, `ProblemDetails`. |
| Archivos `.http` | Seguirán siendo tu herramienta de pruebas. |

Si no has hecho el tutorial 1, puedes seguir este igualmente, pero te recomendamos leer al menos sus pasos 5, 6 y 8.

| Requisito | Detalle |
| --- | --- |
| Visual Studio 2026 | Cualquier edición (Community es gratuita) con la carga de trabajo **ASP.NET y desarrollo web** (*ASP.NET and web development*). |
| SDK de .NET 10 | Se instala con la carga de trabajo anterior. Compruébalo con `dotnet --list-sdks` (debe aparecer una versión `10.x`). |
| Visor de SQLite (opcional) | Para mirar dentro del archivo de base de datos. Te proponemos opciones en el paso 7. |
| Sistema operativo | Windows. Las instrucciones de Visual Studio están pensadas para Windows. |

## El modelo de datos

Tres entidades y dos relaciones. La flecha se lee "tiene":

```
Project 1 ───── * TaskItem * ───── * Tag
(proyecto)        (tarea)          (etiqueta)

- Un proyecto tiene muchas tareas; cada tarea pertenece a un único proyecto.
- Una tarea puede tener muchas etiquetas; una etiqueta puede estar en muchas tareas.
```

| Entidad | Datos principales |
| --- | --- |
| `Project` | `Name`, `Description`, `CreatedAt` |
| `TaskItem` | `Title`, `Description`, `Status`, `Priority`, `DueDate`, `CreatedAt`, `CompletedAt` |
| `Tag` | `Name` (único, en minúsculas) |

:::why ¿Por qué TaskItem y no Task?
Porque `Task` ya existe en .NET (`System.Threading.Tasks.Task`) y lo usarás constantemente en código asíncrono (`async Task<...>`). Llamar igual a una entidad obligaría a escribir nombres completos por todas partes. Lo verás con detalle en el paso 9.
:::

## Los endpoints finales

Esta es la API completa que tendrás al terminar. Léela como un mapa del destino; la construirás poco a poco.

**Proyectos**

| Método | Ruta | Qué hace | Respuestas |
| --- | --- | --- | --- |
| `GET` | `/api/projects` | Lista los proyectos con su número de tareas | `200` |
| `GET` | `/api/projects/{id}` | Obtiene un proyecto | `200`, `404` |
| `POST` | `/api/projects` | Crea un proyecto | `201`, `400` |
| `PUT` | `/api/projects/{id}` | Reemplaza los datos de un proyecto | `204`, `400`, `404` |
| `DELETE` | `/api/projects/{id}` | Borra un proyecto **y sus tareas** | `204`, `404` |

**Tareas**

| Método | Ruta | Qué hace | Respuestas |
| --- | --- | --- | --- |
| `GET` | `/api/projects/{projectId}/tasks?status=&priority=&tag=&sortBy=` | Lista las tareas de un proyecto, con filtros y orden | `200`, `400`, `404` |
| `POST` | `/api/projects/{projectId}/tasks` | Crea una tarea en un proyecto | `201`, `400`, `404` |
| `POST` | `/api/projects/{projectId}/tasks/complete-all` | Completa todas las tareas pendientes del proyecto | `200`, `404` |
| `DELETE` | `/api/projects/{projectId}/tasks/completed` | Borra las tareas completadas del proyecto | `200`, `404` |
| `GET` | `/api/tasks/{id}` | Obtiene una tarea | `200`, `404` |
| `PUT` | `/api/tasks/{id}` | Reemplaza los datos de una tarea | `204`, `400`, `404` |
| `PATCH` | `/api/tasks/{id}/status` | Cambia el estado de una tarea | `204`, `400`, `404` |
| `DELETE` | `/api/tasks/{id}` | Borra una tarea | `204`, `404` |
| `POST` | `/api/tasks/{id}/tags` | Asigna una etiqueta a una tarea | `204`, `404` |
| `DELETE` | `/api/tasks/{id}/tags/{tagId}` | Quita una etiqueta de una tarea | `204`, `404` |

**Etiquetas**

| Método | Ruta | Qué hace | Respuestas |
| --- | --- | --- | --- |
| `GET` | `/api/tags` | Lista las etiquetas con su número de tareas | `200` |
| `POST` | `/api/tags` | Crea una etiqueta | `201`, `400`, `409` |
| `DELETE` | `/api/tags/{id}` | Borra una etiqueta | `204`, `404` |

## Estructura final de carpetas

Cada carpeta tiene una responsabilidad clara y aparecerá cuando la necesites.

```
TaskTracker/
├── TaskTracker.slnx
└── TaskTracker.Api/
    ├── Contracts/              ← DTOs: lo que entra y sale por HTTP
    │   ├── ProjectContracts.cs
    │   ├── TagContracts.cs
    │   └── TaskContracts.cs
    ├── Data/                   ← todo lo que habla con la base de datos
    │   ├── Configurations/
    │   │   ├── ProjectConfiguration.cs
    │   │   ├── TagConfiguration.cs
    │   │   └── TaskItemConfiguration.cs
    │   ├── DataSeeder.cs
    │   ├── TaskTrackerDbContext.cs
    │   └── UtcDateTimeConverter.cs
    ├── Endpoints/              ← un archivo por recurso
    │   ├── ProjectEndpoints.cs
    │   ├── TagEndpoints.cs
    │   └── TaskEndpoints.cs
    ├── Entities/               ← las clases que EF Core guarda en tablas
    │   ├── Project.cs
    │   ├── Tag.cs
    │   ├── TaskItem.cs
    │   ├── TaskItemStatus.cs
    │   └── TaskPriority.cs
    ├── Mappings/               ← de entidad a DTO
    │   ├── ProjectMappings.cs
    │   └── TaskMappings.cs
    ├── Migrations/             ← generadas por EF Core
    ├── Properties/
    │   └── launchSettings.json
    ├── .gitignore
    ├── appsettings.json
    ├── appsettings.Development.json
    ├── Program.cs
    ├── TaskTracker.Api.csproj
    └── TaskTracker.Api.http
```

## La arquitectura en una línea

```
Cliente HTTP ──▶ Endpoint ──────▶ DbContext ──────▶ SQLite
                 (Minimal API)    (EF Core)         (tasktracker.db)
```

| Pieza | Responsabilidad |
| --- | --- |
| **Endpoint** | Recibir la petición, validar los datos y elegir el código de estado. Un método estático por operación, agrupados por recurso. |
| **DbContext** | Traducir LINQ a SQL, seguir los cambios de las entidades y guardarlos en una transacción. |
| **SQLite** | Guardar los datos en un único archivo, sin instalar ningún servidor. |

:::why ¿Y la capa de servicios y repositorios del tutorial 1?
En Bookshelf separaste controller, servicio y repositorio porque los datos vivían en un archivo JSON y alguien tenía que escribir ese código de acceso. Aquí ese "alguien" es EF Core: el `DbContext` **ya es** una unidad de trabajo y cada `DbSet` se comporta como un repositorio. Envolverlos en otra capa añadiría archivos sin aportar nada en una API de este tamaño. Retomaremos la discusión en el tutorial de arquitectura.
:::

## Cómo usar este taller

Igual que en el tutorial 1: tú construyes el proyecto en Visual Studio y consultas aquí qué hacer y por qué. Cada paso empieza por el concepto, sigue con instrucciones exactas y código explicado, y termina con un **Checkpoint** que te dice qué petición enviar y qué respuesta esperar. Los bloques de colores significan lo mismo que en el tutorial anterior:

| Bloque | Qué encontrarás |
| --- | --- |
| **Concepto** | Qué es algo, qué problema resuelve y un ejemplo pequeño. |
| **¿Por qué?** | La razón de una decisión de diseño. |
| **En Visual Studio** | Los clics, menús y atajos exactos del IDE. |
| **Tip** | Atajos y buenas prácticas opcionales. |
| **Atención** | Algo que puede darte problemas si lo pasas por alto. |
| **Checkpoint** | Cómo verificar que el paso funciona y qué resultado esperar. |
| **Errores comunes** | Mensajes de error reales y cómo resolverlos. |
| **Reto** | Un ejercicio sobre algo que ya practicaste, con pistas y solución desplegable. |
| **Resumen** | Lo esencial del paso y qué viene a continuación. |

:::tip Los menús de Visual Studio, en inglés
Las instrucciones nombran los menús en inglés (**Tools** > **NuGet Package Manager**…), que es el idioma por defecto de Visual Studio y el de casi toda la documentación. Si tu Visual Studio está en español, busca la opción equivalente: el orden de los menús es el mismo.
:::

## Tiempo estimado

Unas 7 horas en total. Recomendamos sesiones de 1 a 2 horas. Hay dos buenos puntos de corte: al final del paso 4 (Minimal APIs terminadas, todavía en memoria) y al final del paso 7 (base de datos creada con la primera migración).

## Pasos del tutorial

| # | Paso | Qué haces |
| --- | --- | --- |
| 1 | De controllers a Minimal APIs | Entiendes qué cambia y qué se mantiene respecto al tutorial 1. |
| 2 | Crear el proyecto | Creas una Minimal API en Visual Studio 2026 y limpias el ejemplo. |
| 3 | Tus primeros endpoints | Escribes `GET` y `POST` con lambdas y aprendes el *parameter binding*. |
| 4 | Route groups y TypedResults | Ordenas los endpoints en su propio archivo y estandarizas los errores. |
| 5 | ORM y EF Core | Entiendes qué es un ORM e instalas EF Core con SQLite. |
| 6 | DbContext y entidades | Describes el modelo con convenciones y Fluent API. |
| 7 | Migraciones | Creas la base de datos con tu primera migración. |
| 8 | CRUD de proyectos con EF Core | Cambias la lista en memoria por la base de datos. |
| 9 | Uno a muchos: tareas | Añades `TaskItem` y su relación con `Project`. |
| 10 | Endpoints de tareas y consultas | Filtras y ordenas tareas con LINQ. |
| 11 | Muchos a muchos: etiquetas | Añades `Tag` y la tabla intermedia. |
| 12 | Validación | Rechazas datos inválidos con `AddValidation()`. |
| 13 | Operaciones masivas y datos de ejemplo | Usas `ExecuteUpdate`/`ExecuteDelete` y siembras datos. |
| 14 | Rendimiento, documentación y cierre | Lees el SQL generado, evitas N+1 y documentas con Scalar. |
